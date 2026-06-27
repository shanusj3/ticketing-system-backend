import dotenv from "dotenv";

dotenv.config();

const required = (key: string) => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 4000),

  databaseUrl: required("DATABASE_URL"),

  jwtSecret: required("JWT_SECRET"),

  appDomain: process.env.APP_DOMAIN ?? "app.com",

  corsOrigins:
    process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()) ?? [],

  s3: {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    bucket: process.env.AWS_S3_BUCKET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL,
  },

  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME ?? "Super Admin",
    email: required("SUPER_ADMIN_EMAIL").toLowerCase(),
    password: required("SUPER_ADMIN_PASSWORD"),
  },
};
