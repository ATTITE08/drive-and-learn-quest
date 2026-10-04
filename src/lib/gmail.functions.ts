import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("./gmail.server");
    const c = await g.getConnection(context.userId);
    return { connected: !!c, email: c?.email ?? null };
  });

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("./gmail.server");
    const request = getRequest();
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/oauth/google/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const existing = await g.getConnection(context.userId);
    const authorizationUrl = await g.authorize(context.userId, returnUrl, existing?.key);
    return { authorizationUrl };
  });

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const g = await import("./gmail.server");
    const key = await g.exchangeCode(data.code);
    const email = await g.lookupEmail(key);
    await g.saveConnection(context.userId, key, email);
    return { ok: true, email };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("./gmail.server");
    const c = await g.getConnection(context.userId);
    if (c) await g.disconnectGateway(c.key);
    await g.deleteConnection(context.userId);
    return { ok: true };
  });

const attachment = z.object({
  filename: z.string().min(1).max(150),
  mimeType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  base64: z.string().min(1).max(14_000_000),
});

export const sendDocumentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      to: z.string().trim().email().max(254),
      subject: z.string().trim().min(1).max(250),
      body: z.string().max(10000),
      docType: z.enum(["releve", "incident"]),
      docRef: z.string().max(200),
      attachments: z.array(attachment).min(1).max(3),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const g = await import("./gmail.server");
    const files = data.attachments.map((a) => a.filename);
    const c = await g.getConnection(context.userId);
    const base = { user_id: context.userId, doc_type: data.docType, doc_ref: data.docRef, recipient: data.to, subject: data.subject, attachments: files };
    if (!c) {
      await g.logSend({ ...base, sender_email: null, status: "echec", error: "Gmail non connecté" });
      return { ok: false, error: "Gmail non connecté" };
    }
    const raw = g.buildMime({ from: c.email, to: data.to, subject: data.subject, body: data.body, attachments: data.attachments });
    const res = await g.callGmail(c.key, "/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`Gmail send failed [${res.status}]: ${t}`);
      const reconnect = res.status === 401;
      await g.logSend({ ...base, sender_email: c.email, status: "echec", error: `${res.status}: ${t.slice(0, 500)}` });
      return { ok: false, error: reconnect ? "Votre connexion Gmail a expiré : reconnectez votre Gmail." : `Gmail a refusé l'envoi (${res.status}).` };
    }
    await g.logSend({ ...base, sender_email: c.email, status: "envoye" });
    return { ok: true, error: null };
  });
