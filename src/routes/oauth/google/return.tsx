import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google/return")({
  ssr: false,
  component: OAuthReturn,
  head: () => ({ meta: [{ title: "Connexion Gmail — RailFormation" }, { name: "robots", content: "noindex" }] }),
});

function OAuthReturn() {
  const [msg, setMsg] = useState("Finalisation de la connexion Gmail…");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const notify = (type: string, code?: string | null) => {
      window.opener?.postMessage({ type, connectorId: "google_mail", code: code ?? null }, window.location.origin);
      setTimeout(() => window.close(), 300);
    };
    if (p.get("success") !== "true") {
      setMsg("Connexion refusée : " + (p.get("error") ?? "erreur inconnue"));
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = p.get("code");
    if (!code) {
      setMsg("Connexion terminée sans code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    setMsg("Gmail connecté, vous pouvez fermer cette fenêtre.");
    notify("appUserConnectorOAuthComplete", code);
  }, []);
  return <div className="min-h-screen grid place-items-center p-6 text-center text-sm">{msg}</div>;
}
