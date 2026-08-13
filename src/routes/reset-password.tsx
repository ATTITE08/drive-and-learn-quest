import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — RailFormation" },
      { name: "description", content: "Définissez un nouveau mot de passe pour accéder à votre espace de formation conduite." },
      { property: "og:title", content: "Nouveau mot de passe — RailFormation" },
      { property: "og:description", content: "Définissez un nouveau mot de passe pour accéder à votre espace de formation conduite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && active) setReady(true);
    });

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const errDesc = url.searchParams.get("error_description") ?? hash.get("error_description");

      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (active) setReady(true);
        return;
      }

      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      let error: string | null = errDesc;
      if (accessToken && refreshToken) {
        const { error: e } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        error = e?.message ?? null;
      } else if (code) {
        const { error: e } = await supabase.auth.exchangeCodeForSession(code);
        error = e?.message ?? null;
      } else if (tokenHash) {
        const { error: e } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        error = e?.message ?? null;
      }

      if (!active) return;
      const { data: after } = await supabase.auth.getSession();
      if (after.session) setReady(true);
      else if (error) setLinkError(error);
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);


  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Mot de passe mis à jour");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <h1 className="font-display text-2xl font-bold">Nouveau mot de passe</h1>
        {!ready ? (
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>Ouvrez cette page depuis le lien reçu par email pour définir un nouveau mot de passe.</p>
            {linkError && (
              <p className="text-destructive">
                Lien invalide ou expiré ({linkError}). Demandez un nouvel email et ouvrez le lien
                immédiatement, dans le même navigateur, sans le prévisualiser.
              </p>
            )}
          </div>

        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="newpass">Mot de passe</Label>
              <Input
                id="newpass"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              Enregistrer
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
