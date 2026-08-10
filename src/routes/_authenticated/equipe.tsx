import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LEVELS, LEVEL_MISSIONS, levelGrade, levelLabel } from "@/lib/constants";
import { Users, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipe")({
  component: TeamPage,
  head: () => ({
    meta: [
      { title: "Mon équipe — Suivi des agents de conduite" },
      { name: "description", content: "Suivez la performance des agents de votre groupe : grade, dépôt de rattachement, moyenne et nombre d'évaluations." },
      { property: "og:title", content: "Mon équipe — Suivi des agents de conduite" },
      { property: "og:description", content: "Suivi hiérarchique des agents de conduite par chef de traction et chef de dépôt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TeamPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return { me: null, manager: null, team: [], depots: [] as any[] };

      const [{ data: me }, { data: depots }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,level,depot_id,manager_id,matricule").eq("id", uid).maybeSingle(),
        supabase.from("depots").select("id,name,code").order("name"),
      ]);

      const { data: team } = await supabase
        .from("profiles")
        .select("id,full_name,email,level,depot_id,matricule")
        .eq("manager_id", uid);

      const ids = (team ?? []).map((t: any) => t.id);
      const { data: attempts } = ids.length
        ? await supabase.from("attempts").select("user_id,score,total,finished_at").in("user_id", ids).not("finished_at", "is", null)
        : { data: [] as any[] };

      const manager = me?.manager_id
        ? (await supabase.from("profiles").select("id,full_name,email,level").eq("id", me.manager_id).maybeSingle()).data
        : null;

      const enriched = (team ?? []).map((t: any) => {
        const list = (attempts ?? []).filter((a: any) => a.user_id === t.id && a.total > 0);
        const avg = list.length ? Math.round(list.reduce((s: number, a: any) => s + (a.score / a.total) * 100, 0) / list.length) : null;
        return { ...t, attempts: list.length, avg };
      });

      return { me, manager, team: enriched, depots: depots ?? [] };
    },
  });

  const depotName = (id: string | null) => data?.depots.find((d: any) => d.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Mon équipe</h1>
        <p className="text-muted-foreground">
          {data?.me?.level ? `${levelLabel(data.me.level)} — ${LEVEL_MISSIONS[data.me.level] ?? ""}` : "Votre groupe d'agents rattachés."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Dépôt de rattachement</p>
          <p className="mt-1 flex items-center gap-2 font-display text-lg font-semibold">
            <Building2 className="h-4 w-4" /> {depotName(data?.me?.depot_id ?? null)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Responsable hiérarchique</p>
          <p className="mt-1 font-display text-lg font-semibold">
            {data?.manager ? `${data.manager.full_name ?? data.manager.email}` : "—"}
          </p>
          {data?.manager?.level && <p className="text-xs text-muted-foreground">{levelLabel(data.manager.level)}</p>}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="h-5 w-5" /> Agents rattachés {data?.team.length ? `(${data.team.length})` : ""}
        </h2>
        {isLoading ? (
          <p className="mt-3 text-muted-foreground">Chargement…</p>
        ) : !data?.team.length ? (
          <p className="mt-3 text-muted-foreground">
            Aucun agent ne vous est rattaché pour le moment. L'administrateur définit le responsable hiérarchique de chaque agent.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {data.team.map((t: any) => (
              <div key={t.id} className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium">{t.full_name ?? t.email}{t.matricule && <span className="ml-2 text-xs text-muted-foreground">#{t.matricule}</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.level ? `${levelLabel(t.level)}${levelGrade(t.level) ? ` (cat. ${levelGrade(t.level)})` : ""}` : "Grade non défini"} · Dépôt {depotName(t.depot_id)}
                  </p>
                </div>
                <div className="w-40">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Moyenne</span>
                    <span className="font-medium text-foreground">{t.avg === null ? "—" : `${t.avg}%`}</span>
                  </div>
                  <Progress value={t.avg ?? 0} className="mt-1 h-2" />
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {t.attempts} test{t.attempts > 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Hiérarchie du réseau</h2>
        <ol className="mt-4 space-y-2">
          {LEVELS.map((l) => (
            <li key={l.value} className="rounded-lg border p-3">
              <p className="font-medium">
                {l.order}. {l.label} {l.grade && <span className="text-xs text-muted-foreground">— catégorie {l.grade}</span>}
              </p>
              <p className="text-xs text-muted-foreground">{LEVEL_MISSIONS[l.value]}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Dépôts traction du réseau : Douala, Yaoundé, Belabo, Ngaoundéré. Chaque dépôt est dirigé par un chef de dépôt, sous l'autorité du chef du département conduite et de son assistant.
        </p>
      </Card>
    </div>
  );
}
