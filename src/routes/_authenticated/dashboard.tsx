import { createFileRoute, Link } from "@tanstack/react-router";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, SUBJECTS, levelLabel, subjectLabel } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, GraduationCap, Trophy, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: roleData, refetch } = useUserRole();
  const profile = roleData?.profile;
  const userId = roleData?.userId;
  const [savingLevel, setSavingLevel] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ count: quizzesCount }, { data: attempts }] = await Promise.all([
        supabase.from("quizzes").select("*", { count: "exact", head: true }),
        supabase.from("attempts").select("score,total,quiz_id,finished_at").eq("user_id", userId!).not("finished_at", "is", null),
      ]);
      const finished = attempts ?? [];
      const avg = finished.length ? Math.round((finished.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / finished.length)) : 0;
      return { quizzes: quizzesCount ?? 0, attempts: finished.length, avg };
    },
  });

  const updateLevel = async (level: string) => {
    if (!userId) return;
    setSavingLevel(true);
    const { error } = await supabase.from("profiles").update({ level: level as any }).eq("id", userId);
    setSavingLevel(false);
    if (error) toast.error(error.message);
    else { toast.success("Niveau mis à jour"); refetch(); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Bonjour {profile?.full_name ?? ""}</h1>
        <p className="text-muted-foreground">
          Rôle : <span className="font-medium text-foreground">{roleData?.role}</span>
          {profile?.level && <> · Niveau : <span className="font-medium text-foreground">{levelLabel(profile.level)}</span></>}
        </p>
      </div>

      {!profile?.level && (
        <Card className="p-6 border-amber/50 bg-amber/10">
          <h3 className="font-semibold">Définissez votre niveau d'agent</h3>
          <p className="mt-1 text-sm text-muted-foreground">Choisissez votre niveau pour voir les questionnaires adaptés.</p>
          <div className="mt-4 max-w-xs">
            <Select onValueChange={updateLevel} disabled={savingLevel}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un niveau" /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={BookOpen} label="Questionnaires disponibles" value={stats?.quizzes ?? 0} />
        <StatCard icon={ListChecks} label="Tests passés" value={stats?.attempts ?? 0} />
        <StatCard icon={Trophy} label="Moyenne" value={`${stats?.avg ?? 0}%`} />
      </div>

      <div>
        <h2 className="font-display text-xl font-bold mb-4">Matières</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUBJECTS.map((s) => (
            <Card key={s.value} className="p-5 hover:shadow-md transition-shadow">
              <GraduationCap className="h-6 w-6 text-rail" />
              <h3 className="mt-3 font-display text-lg font-semibold">{s.label}</h3>
              <p className="text-sm text-muted-foreground">{s.description}</p>
              <Link to="/quizzes" className="mt-4 inline-flex text-sm font-medium text-rail hover:underline">
                Voir les questionnaires →
              </Link>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild><Link to="/quizzes">Commencer un test</Link></Button>
        <Button variant="outline" asChild><Link to="/results">Voir mes résultats</Link></Button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className="grid h-12 w-12 place-items-center rounded-lg bg-rail/10 text-rail">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold">{value}</p>
      </div>
    </Card>
  );
}
