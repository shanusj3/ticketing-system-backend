/**
 * whatsapp.route.ts
 *
 * Routes:
 *  GET  /whatsapp/:tenantId/qr-stream  — SSE stream of QR codes (browser polls this)
 *  GET  /whatsapp/:tenantId/status     — current session status
 *  POST /whatsapp/:tenantId/send       — send a test message (debug only)
 *  DELETE /whatsapp/:tenantId/session  — logout / destroy session
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/auth";
import { prisma } from "../../config/database";
import {
  getOrCreateClient,
  subscribeQr,
  getSessionStatus,
  sendWhatsAppMessage,
  destroySession,
} from "../../shared/whatsapp.manager";
import QRCode from "qrcode";

const router = Router();

// All endpoints require the caller to be authenticated as SHOP_OWNER or SUPER_ADMIN
router.use(requireAuth, requireRole("SHOP_OWNER", "SUPER_ADMIN"));

// ─── Helper: resolve tenantId from params or user context ──────────────────
function resolveTenantId(req: any): string | null {
  const param = req.params.tenantId;
  if (param) return param;
  return req.user?.tenantId ?? null;
}

// ─── GET /whatsapp/:tenantId/qr-stream ────────────────────────────────────
// Server-Sent Events endpoint. The browser opens this and receives:
//   event: qr
//   data: <base64 PNG data URI>
//
// When the QR is scanned and WhatsApp links, it emits:
//   event: connected
//   data: {"status":"CONNECTED"}
router.get("/:tenantId/qr-stream", async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });

    // Verify the tenant has QR_WEB mode configured
    const config = await prisma.whatsAppConfig.findUnique({ where: { tenantId } });
    if (!config || config.mode !== "QR_WEB") {
      return res.status(400).json({ message: "This tenant is not configured for QR_WEB mode" });
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx: disable buffering
    res.flushHeaders();

    const sendEvent = (event: string, data: object | string) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // ── If already connected, tell the browser immediately ────────────────
    const currentStatus = getSessionStatus(tenantId);
    if (currentStatus === "CONNECTED") {
      sendEvent("connected", { status: "CONNECTED" });
      res.end();
      return;
    }

    // ── Boot the client (or reuse existing) ───────────────────────────────
    const session = await getOrCreateClient(tenantId);

    // ── Subscribe to QR events and convert to base64 PNG ─────────────────
    const unsubscribe = subscribeQr(tenantId, async (rawQr) => {
      try {
        const pngDataUri = await QRCode.toDataURL(rawQr, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 300,
          color: { dark: "#000000", light: "#ffffff" },
        });
        sendEvent("qr", { qr: pngDataUri });
      } catch (err) {
        console.error("[WhatsApp] QR encode error:", err);
      }
    });

    // ── Watch for "CONNECTED" status by polling ───────────────────────────
    const pollInterval = setInterval(() => {
      const status = getSessionStatus(tenantId);
      if (status === "CONNECTED") {
        sendEvent("connected", { status: "CONNECTED" });
        clearInterval(pollInterval);
        unsubscribe();
        res.end();
      } else if (status === "AUTH_FAILURE" || status === "DISCONNECTED") {
        sendEvent("error", { status, message: "Session ended" });
        clearInterval(pollInterval);
        unsubscribe();
        res.end();
      }
    }, 2000);

    // ── Clean up when browser closes the connection ───────────────────────
    req.on("close", () => {
      clearInterval(pollInterval);
      unsubscribe();
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /whatsapp/:tenantId/status ───────────────────────────────────────
router.get("/:tenantId/status", async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });

    const config = await prisma.whatsAppConfig.findUnique({ where: { tenantId } });
    const inMemoryStatus = getSessionStatus(tenantId);

    res.json({
      mode: config?.mode ?? "DISABLED",
      dbStatus: config?.qrStatus ?? "DISCONNECTED",
      liveStatus: inMemoryStatus ?? "NO_SESSION",
      connectedAt: config?.qrLastConnectedAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /whatsapp/:tenantId/send (debug / test endpoint) ─────────────────
router.post("/:tenantId/send", async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ message: "phone and message are required" });
    }

    const result = await sendWhatsAppMessage(tenantId, phone, message);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /whatsapp/:tenantId/session ───────────────────────────────────
router.delete("/:tenantId/session", async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });

    await destroySession(tenantId);

    await prisma.whatsAppConfig.update({
      where: { tenantId },
      data: { qrStatus: "DISCONNECTED" },
    });

    res.json({ success: true, message: "Session disconnected" });
  } catch (err) {
    next(err);
  }
});

export default router;
