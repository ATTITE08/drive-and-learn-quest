// Server-only: Gmail per-user connection via the Lovable connector gateway.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const CONNECTOR_ID = "google_mail";
export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
];

function apiKey(): string {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("LOVABLE_API_KEY manquant");
  return k;
}
function clientKey(): string {
  const k = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
  if (!k) throw new Error("Connexion Google non configurée");
  return k;
}
function encKey(): Buffer {
  const raw = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET manquant");
  return Buffer.from(raw, "base64");
}
function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function decrypt(stored: string) {
  const b = Buffer.from(stored, "base64");
  const d = createDecipheriv("aes-256-gcm", encKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getConnection(userId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("app_user_connections")
    .select("connection_key_ciphertext,account_email")
    .eq("user_id", userId)
    .eq("connector_id", CONNECTOR_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { key: decrypt(data.connection_key_ciphertext), email: data.account_email as string | null };
}

export async function saveConnection(userId: string, key: string, email: string | null) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").upsert(
    { user_id: userId, connector_id: CONNECTOR_ID, connection_key_ciphertext: encrypt(key), account_email: email, updated_at: new Date().toISOString() },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function deleteConnection(userId: string) {
  const db = await admin();
  await db.from("app_user_connections").delete().eq("user_id", userId).eq("connector_id", CONNECTOR_ID);
}

export async function authorize(userId: string, returnUrl: string, existingKey?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    "X-Client-Api-Key": clientKey(),
  };
  if (existingKey) headers["X-Connection-Api-Key"] = existingKey;
  const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/app-users/oauth2/authorize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      connector_id: CONNECTOR_ID,
      app_user_id: userId,
      return_url: returnUrl,
      credentials_configuration: { scopes: GMAIL_SCOPES },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Démarrage OAuth impossible (${res.status}) : ${text}`);
  const body = JSON.parse(text);
  if (!body.authorization_url) throw new Error("URL d'autorisation manquante");
  return body.authorization_url as string;
}

export async function exchangeCode(code: string) {
  const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/app-users/oauth2/exchange`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Échange OAuth impossible (${res.status}) : ${text}`);
  const body = JSON.parse(text);
  if (!body.api_key || body.connector_id !== CONNECTOR_ID) throw new Error("Réponse OAuth invalide");
  return body.api_key as string;
}

export async function callGmail(key: string, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${apiKey()}`);
  headers.set("X-Connection-Api-Key", key);
  return fetch(`${GATEWAY_BASE_URL}/${CONNECTOR_ID}${path}`, { ...init, headers });
}

export async function disconnectGateway(key: string) {
  await fetch(`${GATEWAY_BASE_URL}/api/v1/app-users/connection`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey()}`, "X-Connection-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ connector_id: CONNECTOR_ID }),
  }).catch(() => undefined);
}

/** Best-effort lookup of the connected account address. */
export async function lookupEmail(key: string): Promise<string | null> {
  for (const p of ["/oauth2/v2/userinfo", "/oauth2/v3/userinfo", "/gmail/v1/users/me/profile"]) {
    try {
      const r = await callGmail(key, p);
      if (!r.ok) continue;
      const j: any = await r.json();
      const e = j.email ?? j.emailAddress;
      if (e) return String(e);
    } catch { /* ignore */ }
  }
  return null;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export function buildMime(opts: {
  from?: string | null;
  to: string;
  subject: string;
  body: string;
  attachments: { filename: string; mimeType: string; base64: string }[];
}) {
  const boundary = `rf_${randomBytes(12).toString("hex")}`;
  const lines: string[] = [];
  if (opts.from) lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`, `Subject: ${hdr(opts.subject)}`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "");
  lines.push(`--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(opts.body).replace(/.{76}/g, "$&\r\n"), "");
  for (const a of opts.attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; name="${hdr(a.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${hdr(a.filename)}"`,
      "",
      a.base64.replace(/.{76}/g, "$&\r\n"),
      "",
    );
  }
  lines.push(`--${boundary}--`, "");
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function logSend(row: Record<string, unknown>) {
  const db = await admin();
  await db.from("email_sends").insert(row as any);
}
