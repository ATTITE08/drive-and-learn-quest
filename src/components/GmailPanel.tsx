import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGmailStatus, startGmailConnect, completeGmailConnect, disconnectGmail } from "@/lib/gmail.functions";

export const GMAIL_STATUS_KEY = ["gmail-status"];

export function useGmailStatus() {
  const fetchStatus = useServerFn(getGmailStatus);
  return useQuery({ queryKey: GMAIL_STATUS_KEY, queryFn: () => fetchStatus() });
}

function waitForCode(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    const cleanup = () => { window.removeEventListener("message", onMsg); clearInterval(poll); };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "google_mail") return;
      cleanup();
      if (e.data.type === "appUserConnectorOAuthComplete") resolve(e.data.code ?? null);
      else reject(new Error("Connexion Gmail refusée ou annulée."));
    };
    window.addEventListener("message", onMsg);
    const poll = window.setInterval(() => {
      if (popup.closed) { cleanup(); reject(new Error("Fenêtre Google fermée avant la fin.")); }
    }, 500);
  });
}

export function GmailPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useGmailStatus();
  const start = useServerFn(startGmailConnect);
  const complete = useServerFn(completeGmailConnect);
  const disconnect = useServerFn(disconnectGmail);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    const popup = window.open("", "gmail-oauth", "width=520,height=680");
    if (!popup) { toast.error("Autorisez les fenêtres pop-up puis réessayez."); return; }
    setBusy(true);
    try {
      const { authorizationUrl } = await start();
      const wait = waitForCode(popup);
      popup.location.href = authorizationUrl;
      const code = await wait;
      if (code) await complete({ data: { code } });
      await qc.invalidateQueries({ queryKey: GMAIL_STATUS_KEY });
      toast.success("Gmail connecté");
    } catch (e: any) {
      popup.close();
      toast.error(e?.message ?? "Connexion Gmail impossible");
    } finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await disconnect(); await qc.invalidateQueries({ queryKey: GMAIL_STATUS_KEY }); toast.success("Gmail déconnecté"); }
    catch (e: any) { toast.error(e?.message ?? "Échec"); }
    finally { setBusy(false); }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <Mail className="h-4 w-4 text-muted-foreground" />
      {isLoading ? (
        <span className="text-muted-foreground">Vérification Gmail…</span>
      ) : data?.connected ? (
        <>
          <span className="font-medium">Gmail connecté{data.email ? ` : ${data.email}` : ""}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={connect}><RefreshCw className="mr-1 h-4 w-4" /> Changer de compte</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={logout}><LogOut className="mr-1 h-4 w-4" /> Déconnecter Gmail</Button>
          </div>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Gmail non connecté</span>
          <Button size="sm" className="ml-auto" disabled={busy} onClick={connect}>Connecter mon Gmail</Button>
        </>
      )}
    </div>
  );
}
