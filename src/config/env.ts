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

  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME ?? "Super Admin",
    email: required("SUPER_ADMIN_EMAIL").toLowerCase(),
    password: required("SUPER_ADMIN_PASSWORD"),
  },
};