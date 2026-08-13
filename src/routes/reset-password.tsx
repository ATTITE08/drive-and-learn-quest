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
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
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
          <p className="mt-3 text-sm text-muted-foreground">
            Ouvrez cette page depuis le lien reçu par email pour définir un nouveau mot de passe.
          </p>
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
