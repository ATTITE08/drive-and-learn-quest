import { createFileRoute, Link } from "@tanstack/react-router";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, SUBJECTS, levelLabel, subjectLabel } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, GraduationCap, Trophy, ListChecks, TrendingUp, TrendingDown, Minus, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const GOAL_AVG = 80;
const GOAL_ATTEMPTS = 10;

function Dashboard() {
  const { data: roleData, refetch } = useUserRole();
  const profile = roleData?.profile;
  const userId = roleData?.userId;
  const [savingLevel, setSavingLevel] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", userId, profile?.level],
    enabled: !!userId,
    queryFn: async () => {
      const [{ count: quizzesCount }, { data: attempts }, { data: quizzes }] = await Promise.all([
        supabase.from("quizzes").select("*", { count: "exact", head: true }),
        supabase
          .from("attempts")
          .select("score,total,quiz_id,finished_at")
          .eq("user_id", userId!)
          .not("finished_at", "is", null)
          .order("finished_at", { ascending: true }),
        supabase.from("quizzes").select("id,subject,level"),
      ]);
      const finished = attempts ?? [];
      const pct = (a: { score: number; total: number }) => (a.total ? (a.score / a.total) * 100 : 0);
      const mean = (arr: typeof finished) =>
        arr.length ? Math.round(arr.reduce((s, a) => s + pct(a), 0) / arr.length) : 0;

      const avg = mean(finished);
      const recent = finished.slice(-5);
      const previous = finished.slice(-10, -5);
      const recentAvg = mean(recent);
      const trend = previous.length ? recentAvg - mean(previous) : null;

      const quizMap = new Map((quizzes ?? []).map((q) => [q.id, q]));
      const bySubject = SUBJECTS.map((s) => {
        const rows = finished.filter((a) => quizMap.get(a.quiz_id)?.subject === s.value);
        return { subject: s.value as string, label: s.label, count: rows.length, avg: mean(rows) };
      });

      const levelRows = profile?.level
        ? finished.filter((a) => quizMap.get(a.quiz_id)?.level === profile.level)
        : [];

      return {
        quizzes: quizzesCount ?? 0,
        attempts: finished.length,
        avg,
        recentAvg,
        trend,
        last: finished.length ? Math.round(pct(finished[finished.length - 1])) : null,
        best: finished.length ? Math.max(...finished.map((a) => Math.round(pct(a)))) : null,
        bySubject,
        levelAvg: mean(levelRows),
        levelCount: levelRows.length,
      };
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

  const currentLevel = LEVELS.find((l) => l.value === profile?.level);
  const nextLevel = currentLevel ? LEVELS.find((l) => l.order === currentLevel.order + 1) : undefined;
  const levelProgress = currentLevel ? Math.round((currentLevel.order / LEVELS.length) * 100) : 0;
  const readiness = Math.min(100, Math.round(((stats?.levelAvg ?? 0) / GOAL_AVG) * 100));
  const coveredSubjects = stats?.bySubject.filter((s) => s.count > 0).length ?? 0;

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

      {currentLevel && (
        <Card className="p-6" style={{ background: "var(--gradient-hero)" }}>
          <div className="flex flex-wrap items-start justify-between gap-4 text-rail-foreground">
            <div>
              <p className="text-xs uppercase tracking-wider text-amber">Niveau actuel</p>
              <h2 className="mt-1 font-display text-3xl font-bold">{currentLevel.label}</h2>
              <p className="mt-1 text-sm text-rail-foreground/80">
                Étape {currentLevel.order} sur {LEVELS.length}
                {nextLevel ? <> · Prochain niveau : {nextLevel.label}</> : <> · Niveau le plus élevé</>}
              </p>
            </div>
            <div className="min-w-[160px]">
              <Select value={profile?.level ?? undefined} onValueChange={updateLevel} disabled={savingLevel}>
                <SelectTrigger className="border-rail-foreground/25 bg-rail-foreground/10 text-rail-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 space-y-5 text-rail-foreground">
            <div>
              <div className="flex justify-between text-xs text-rail-foreground/80">
                <span>Parcours de qualification</span>
                <span>{levelProgress}%</span>
              </div>
              <Progress value={levelProgress} className="mt-2 h-2 bg-rail-foreground/15" />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-rail-foreground/70">
                {LEVELS.map((l) => (
                  <span key={l.value} className={l.order <= currentLevel.order ? "font-medium text-amber" : ""}>
                    {l.order <= currentLevel.order ? "✓ " : ""}{l.label}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-rail-foreground/80">
                <span>
                  Maîtrise de votre niveau · {stats?.levelCount ?? 0} test{(stats?.levelCount ?? 0) > 1 ? "s" : ""} · moyenne {stats?.levelAvg ?? 0}%
                </span>
                <span>Objectif {GOAL_AVG}%</span>
              </div>
              <Progress value={readiness} className="mt-2 h-2 bg-rail-foreground/15" />
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="Questionnaires disponibles" value={stats?.quizzes ?? 0} />
        <StatCard icon={ListChecks} label="Tests passés" value={stats?.attempts ?? 0} />
        <StatCard
          icon={Trophy}
          label="Moyenne générale"
          value={`${stats?.avg ?? 0}%`}
          hint={stats?.last != null ? `Dernier : ${stats.last}% · Meilleur : ${stats.best}%` : "Aucun test terminé"}
        />
        <StatCard
          icon={stats?.trend == null ? Minus : stats.trend >= 0 ? TrendingUp : TrendingDown}
          label="Tendance (5 derniers)"
          value={stats?.trend == null ? `${stats?.recentAvg ?? 0}%` : `${stats.trend >= 0 ? "+" : ""}${stats.trend} pts`}
          hint={stats?.trend == null ? "Pas assez d'historique" : `Moyenne récente : ${stats.recentAvg}%`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-xl font-bold">Progression par matière</h2>
          <div className="mt-4 space-y-4">
            {(stats?.bySubject ?? SUBJECTS.map((s) => ({ subject: s.value as string, label: s.label, count: 0, avg: 0 }))).map((s) => (
              <div key={s.subject}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{subjectLabel(s.subject)}</span>
                  <span className="text-muted-foreground">
                    {s.count ? `${s.avg}% · ${s.count} test${s.count > 1 ? "s" : ""}` : "Non évalué"}
                  </span>
                </div>
                <Progress value={s.avg} className="mt-2 h-2" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl font-bold">Mes objectifs</h2>
          <div className="mt-4 space-y-4">
            <Goal
              label={`Atteindre ${GOAL_AVG}% de moyenne`}
              value={Math.min(100, Math.round(((stats?.avg ?? 0) / GOAL_AVG) * 100))}
              detail={`${stats?.avg ?? 0}% / ${GOAL_AVG}%`}
            />
            <Goal
              label={`Passer ${GOAL_ATTEMPTS} tests`}
              value={Math.min(100, Math.round(((stats?.attempts ?? 0) / GOAL_ATTEMPTS) * 100))}
              detail={`${stats?.attempts ?? 0} / ${GOAL_ATTEMPTS}`}
            />
            <Goal
              label="Couvrir les 4 matières"
              value={Math.round((coveredSubjects / SUBJECTS.length) * 100)}
              detail={`${coveredSubjects} / ${SUBJECTS.length}`}
            />
            {nextLevel && (
              <p className="text-sm text-muted-foreground">
                <Target className="mr-1 inline h-4 w-4 text-rail" />
                Maintenez {GOAL_AVG}% sur votre niveau pour viser <span className="font-medium text-foreground">{nextLevel.label}</span>.
              </p>
            )}
          </div>
        </Card>
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

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: any; hint?: string }) {
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-rail/10 text-rail">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}

function Goal({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{detail}</span>
      </div>
      <Progress value={value} className="mt-2 h-2" />
    </div>
  );
}

