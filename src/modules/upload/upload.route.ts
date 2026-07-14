import { Router } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env";
import { requireAuth } from "../../shared/middleware/auth";

const router = Router();

// Make sure to configure S3 properly in env
let s3Client: S3Client;
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.s3.region as string,
      credentials: {
        accessKeyId: env.s3.accessKeyId as string,
        secretAccessKey: env.s3.secretAccessKey as string,
      },
    });
  }
  return s3Client;
}

// GET /upload/presigned-url — for logo/general uploads (no auth required currently)
router.get("/presigned-url", async (req, res, next) => {
  try {
    const { filename, filetype } = req.query;

    if (!filename || !filetype) {
      return res.status(400).json({ message: "Filename and filetype are required" });
    }

    const key = `logos/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: env.s3.bucket as string,
      Key: key,
      ContentType: filetype as string,
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
    
    // Fallback for publicUrl if no publicBaseUrl is defined
    const publicUrl = env.s3.publicBaseUrl 
      ? `${env.s3.publicBaseUrl}/${key}`
      : `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}`;

    res.json({
      uploadUrl,
      publicUrl,
      key
    });
  } catch (err) {
    next(err);
  }
});

// GET /upload/ticket-photo-url — presigned URL specifically for ticket photos (auth required)
router.get("/ticket-photo-url", requireAuth, async (req, res, next) => {
  try {
    const { filename, filetype, ticketId } = req.query;

    if (!filename || !filetype || !ticketId) {
      return res.status(400).json({ message: "filename, filetype, and ticketId are required" });
    }

    const ext = String(filename).split('.').pop() || 'jpg';
    const key = `tickets/${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: env.s3.bucket as string,
      Key: key,
      ContentType: filetype as string,
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 900 }); // 15 min

    const publicUrl = env.s3.publicBaseUrl 
      ? `${env.s3.publicBaseUrl}/${key}`
      : `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}`;

    res.json({ uploadUrl, publicUrl, key });
  } catch (err) {
    next(err);
  }
});

export default router;
