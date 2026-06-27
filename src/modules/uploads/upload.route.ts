import { Router } from "express";
import { requireAuth } from "../auth/auth.permission";
import { createPresignedUploadController } from "./upload.controller";

const router = Router();

router.use(requireAuth);

router.post("/presign", (req, res, next) => {
  createPresignedUploadController(req, res).catch(next);
});

export default router;
