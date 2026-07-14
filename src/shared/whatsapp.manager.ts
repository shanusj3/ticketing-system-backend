/**
 * whatsapp.manager.ts
 *
 * Manages a whatsapp-web.js Client per tenant.
 * Each tenant that uses QR_WEB mode gets its own Client instance
 * with a LocalAuth strategy so the session is persisted across restarts.
 *
 * Key guarantees:
 *  - One Client instance per tenantId (singleton map).
 *  - QR string is emitted on the "qr" event and held in memory so
 *    the SSE endpoint can stream it to the browser immediately.
 *  - "ready" / "disconnected" / "auth_failure" events update the DB.
 *  - sendMessage() checks that the client is CONNECTED before sending.
 */

import { Client, LocalAuth, MessageContent } from "whatsapp-web.js";
import { prisma } from "../config/database";
import fs from "fs";
import path from "path";

function logDebug(msg: string) {
  const logFile = path.join(__dirname, "../../../wa-debug.log");
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type QrSession = {
  client: Client;
  qr: string | null;          // latest raw QR string (for SSE)
  status: "INITIALIZING" | "PENDING_SCAN" | "CONNECTED" | "DISCONNECTED" | "AUTH_FAILURE";
  listeners: Set<(qr: string) => void>; // SSE subscriber callbacks
};

// ─── Singleton map ────────────────────────────────────────────────────────────

const sessions = new Map<string, QrSession>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns (or creates) a WA client for the given tenantId.
 * The browser QR endpoint calls this first, then subscribes via subscribeQr().
 */
export async function getOrCreateClient(tenantId: string): Promise<QrSession> {
  if (sessions.has(tenantId)) {
    return sessions.get(tenantId)!;
  }

  const session: QrSession = {
    client: null as any,
    qr: null,
    status: "INITIALIZING",
    listeners: new Set(),
  };

  sessions.set(tenantId, session);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: `tenant-${tenantId}` }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ],
    },
  });

  logDebug(`[WhatsApp] Tenant ${tenantId} Client created, initializing...`);
  session.client = client;

  // ── Events ────────────────────────────────────────────────────────────────

  client.on("qr", (qr) => {
    logDebug(`[WhatsApp] Tenant ${tenantId} emitted QR!`);
    session.qr = qr;
    session.status = "PENDING_SCAN";

    // Notify all waiting SSE subscribers
    session.listeners.forEach((fn) => fn(qr));

    // Update DB status
    prisma.whatsAppConfig.update({
      where: { tenantId },
      data: { qrStatus: "PENDING_SCAN" },
    }).catch(console.error);
  });

  client.on("ready", async () => {
    logDebug(`[WhatsApp] Tenant ${tenantId} CONNECTED`);
    session.status = "CONNECTED";
    session.qr = null; // QR no longer needed

    await prisma.whatsAppConfig.update({
      where: { tenantId },
      data: { qrStatus: "CONNECTED", qrLastConnectedAt: new Date() },
    }).catch(console.error);
  });

  client.on("authenticated", () => {
    logDebug(`[WhatsApp] Tenant ${tenantId} authenticated`);
  });

  client.on("auth_failure", async (msg) => {
    logDebug(`[WhatsApp] Tenant ${tenantId} auth failure: ${msg}`);
    session.status = "AUTH_FAILURE";

    await prisma.whatsAppConfig.update({
      where: { tenantId },
      data: { qrStatus: "EXPIRED" },
    }).catch(console.error);

    sessions.delete(tenantId); // allow retry
  });

  client.on("disconnected", async (reason) => {
    logDebug(`[WhatsApp] Tenant ${tenantId} disconnected: ${reason}`);
    session.status = "DISCONNECTED";

    await prisma.whatsAppConfig.update({
      where: { tenantId },
      data: { qrStatus: "DISCONNECTED" },
    }).catch(console.error);

    sessions.delete(tenantId);
    await client.destroy().catch(() => {});
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  client.initialize().then(() => {
    logDebug(`[WhatsApp] Tenant ${tenantId} initialize() resolved`);
  }).catch(async (err) => {
    logDebug(`[WhatsApp] Tenant ${tenantId} init error: ${err?.message || err}`);
    sessions.delete(tenantId);
    try {
      await client.destroy();
    } catch (e) {
      // ignore destroy errors
    }
  });

  return session;
}

/**
 * Register a callback that fires every time a new QR is generated.
 * Returns an unsubscribe function.
 */
export function subscribeQr(
  tenantId: string,
  callback: (qr: string) => void
): () => void {
  const session = sessions.get(tenantId);
  if (!session) return () => {};

  session.listeners.add(callback);
  // If a QR is already available, fire immediately
  if (session.qr) callback(session.qr);

  return () => session.listeners.delete(callback);
}

/**
 * Returns the current session status for a tenant (or null if no session).
 */
export function getSessionStatus(tenantId: string): QrSession["status"] | null {
  return sessions.get(tenantId)?.status ?? null;
}

/**
 * Send a text WhatsApp message from the tenant's linked account.
 * Phone number should be in E.164 format (e.g. "919876543210") — no + prefix.
 */
export async function sendWhatsAppMessage(
  tenantId: string,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const session = sessions.get(tenantId);

  if (!session || session.status !== "CONNECTED") {
    return { success: false, error: `WhatsApp client not connected (status: ${session?.status ?? "no session"})` };
  }

  try {
    // whatsapp-web.js expects the chat id as "{phone}@c.us"
    const chatId = `${phone.replace(/\D/g, "")}@c.us`;
    await session.client.sendMessage(chatId, message);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Send failed" };
  }
}

/**
 * Disconnect and destroy a tenant's WhatsApp session (e.g. on logout).
 */
export async function destroySession(tenantId: string): Promise<void> {
  const session = sessions.get(tenantId);
  if (!session) return;
  sessions.delete(tenantId);
  await session.client.destroy().catch(() => {});
}
