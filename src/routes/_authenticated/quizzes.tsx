import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { LEVELS, SUBJECTS, levelLabel, subjectLabel } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Play, Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quizzes")({
  component: Quizzes,
});

function Quizzes() {
  const { data: roleData } = useUserRole();
  const userLevel = roleData?.profile?.level as string | undefined;
  const [subject, setSubject] = useState<string>("all");
  const [level, setLevel] = useState<string>(userLevel ?? "all");

  const { data: quizzes, isLoading } = useQuery({
    queryKey: ["quizzes", subject, level],
    queryFn: async () => {
      let q = supabase.from("quizzes").select("id,title,subject,level,created_at,questions(count)").order("created_at", { ascending: false });
      if (subject !== "all") q = q.eq("subject", subject as any);
      if (level !== "all") q = q.eq("level", level as any);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Questionnaires</h1>
        <p className="text-muted-foreground">Choisissez un test selon la matière et le niveau.</p>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-[180px]">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger><SelectValue placeholder="Matière" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes matières</SelectItem>
              {SUBJECTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger><SelectValue placeholder="Niveau" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous niveaux</SelectItem>
              {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : !quizzes?.length ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Aucun questionnaire disponible pour ces filtres.</p>
          {roleData?.role === "admin" && (
            <Button className="mt-4" asChild><Link to="/admin">Aller à l'administration</Link></Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q: any) => (
            <Card key={q.id} className="p-5 flex flex-col">
              <div className="flex gap-2">
                <span className="rounded-md bg-rail/10 px-2 py-0.5 text-xs font-medium text-rail">{subjectLabel(q.subject)}</span>
                <span className="rounded-md bg-amber/15 px-2 py-0.5 text-xs font-medium">{levelLabel(q.level)}</span>
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold">{q.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{q.questions?.[0]?.count ?? 0} question(s)</p>
              <Button asChild className="mt-auto pt-4" size="sm">
                <Link to="/quiz/$id" params={{ id: q.id }}>
                  <Play className="h-4 w-4 mr-1" /> Démarrer
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
