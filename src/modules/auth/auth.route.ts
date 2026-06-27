import { Router } from "express";
import { loginController, logoutController, meController, refreshController } from "./auth.controller";
import { requireAuth } from "./auth.permission";

const router = Router();

router.post("/login", (req, res, next) => {
  loginController(req, res).catch(next);
});

router.post("/refresh", (req, res, next) => {
  refreshController(req, res).catch(next);
});

router.get("/me", requireAuth, (req, res, next) => {
  meController(req, res).catch(next);
});

router.post("/logout", (_req, res, next) => {
  logoutController(_req, res).catch(next);
});

export default router;
