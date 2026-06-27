import crypto from "crypto";
import path from "path";
import { env } from "../../config/env";

const PRESIGN_EXPIRES_SECONDS = 5 * 60;

function assertS3Config() {
  const { region, bucket, accessKeyId, secretAccessKey } = env.s3;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw Object.assign(
      new Error("S3 upload is not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY."),
      { status: 500 }
    );
  }

  return { region, bucket, accessKeyId, secretAccessKey };
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sanitizeFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const base = path
    .basename(fileName, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base || "file"}-${crypto.randomUUID()}${extension}`;
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function toDateStamp(date: Date) {
  return toAmzDate(date).slice(0, 8);
}

function buildPublicUrl(bucket: string, region: string, key: string) {
  const encodedKey = key.split("/").map(encodePathSegment).join("/");
  const baseUrl = env.s3.publicBaseUrl?.replace(/\/$/, "");

  if (baseUrl) {
    return `${baseUrl}/${encodedKey}`;
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export function createPresignedUpload(input: {
  tenantSlug: string;
  folder: "logos" | "avatars" | "attachments" | "invoices";
  fileName: string;
  contentType: string;
}) {
  const { region, bucket, accessKeyId, secretAccessKey } = assertS3Config();
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(now);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const key = `${input.folder}/${input.tenantSlug}/${sanitizeFileName(input.fileName)}`;
  const canonicalUri = `/${key.split("/").map(encodePathSegment).join("/")}`;
  const signedHeaders = "content-type;host";

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(PRESIGN_EXPIRES_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders,
  });

  const canonicalQueryString = Array.from(queryParams.entries())
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .sort()
    .join("&");
  const canonicalHeaders = `content-type:${input.contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", getSigningKey(secretAccessKey, dateStamp, region))
    .update(stringToSign)
    .digest("hex");
  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

  return {
    uploadUrl,
    fileUrl: buildPublicUrl(bucket, region, key),
    key,
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
    },
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  };
}
