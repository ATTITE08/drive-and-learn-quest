import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GmailPanel } from "@/components/GmailPanel";

export const Route = createFileRoute("/_authenticated/envois")({
  component: SendsPage,
  head: () => ({
    meta: [
      { title: "Historique des envois par email — RailFormation" },
      { name: "description", content: "Historique des relevés et rapports d'incident envoyés par email depuis votre Gmail." },
      { property: "og:title", content: "Historique des envois par email — RailFormation" },
      { property: "og:description", content: "Relevés et rapports d'incident envoyés par email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SendsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["email-sends"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("email_sends").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
      const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,matricule").in("id", ids) : { data: [] as any[] };
      return { rows: rows ?? [], people: people ?? [] };
    },
  });
  const who = (id: string) => {
    const p: any = data?.people.find((x: any) => x.id === id);
    return p ? [p.full_name, p.matricule && `Mle ${p.matricule}`].filter(Boolean).join(" · ") : "Utilisateur";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Historique des envois</h1>
        <p className="text-muted-foreground">Relevés et rapports d'incident envoyés par email.</p>
      </div>
      <GmailPanel />
      <Card className="p-4 sm:p-6">
        {isLoading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : !data?.rows.length ? (
          <p className="text-muted-foreground">Aucun envoi pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {data.rows.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.status === "envoye" ? "default" : "destructive"}>{r.status === "envoye" ? "Envoyé" : "Échec"}</Badge>
                  <Badge variant="outline">{r.doc_type === "releve" ? "Relevé" : "Rapport d'incident"}</Badge>
                  <span className="font-medium">{r.doc_ref}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")}</span>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Envoyé par : </span>{who(r.user_id)}</p>
                  <p><span className="text-muted-foreground">Gmail expéditeur : </span>{r.sender_email ?? "—"}</p>
                  <p><span className="text-muted-foreground">Destinataire : </span>{r.recipient}</p>
                  <p><span className="text-muted-foreground">Objet : </span>{r.subject}</p>
                  <p className="sm:col-span-2"><span className="text-muted-foreground">Pièces jointes : </span>{r.attachments.join(", ")}</p>
                  {r.status !== "envoye" && r.error && <p className="sm:col-span-2 text-xs text-destructive">Motif : {r.error.slice(0, 200)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
