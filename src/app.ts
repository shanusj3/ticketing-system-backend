import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

import routes from "./route";
import { env } from "./config/env";

export const app = express();

const TENANT_SUBDOMAIN_PATTERN = /^(https:\/\/[a-z0-9-]+\.zeviodesk\.com|http:\/\/[a-z0-9-]+\.localhost:\d+)$/;

app.use(
  cors({
    origin: (origin, callback) => {

      if (!origin) {
        return callback(null, true);
      }


      if (env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }


      if (TENANT_SUBDOMAIN_PATTERN.test(origin)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", routes);

app.use(
  (
    err: Error & { status?: number },
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    res.status(err.status ?? 500).json({
      message: err.message || "Internal server error",
    });
  }
);