import { Router } from "express";
import { requireAuth } from "../auth/auth.permission";
import {
  getCurrentSubscriptionController,
  listPlansController,
} from "./subscription.controller";

const router = Router();

router.get("/plans", listPlansController);

router.get("/current", requireAuth, (req, res, next) => {
  getCurrentSubscriptionController(req, res).catch(next);
});

export default router;
