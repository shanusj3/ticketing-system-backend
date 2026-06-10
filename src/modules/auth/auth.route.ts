import { Router } from "express";
import { loginController } from "./auth.controller";

const router = Router();

router.post("/login", (req, res, next) => {
  loginController(req, res).catch(next);
});

export default router;
