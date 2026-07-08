import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, History, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { levelLabel, subjectLabel } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/quizzes/$id/versions")({
  component: VersionsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <Card className="p-6 space-y-3">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button size="sm" onClick={() => { reset(); router.invalidate(); }}>Réessayer</Button>
      </Card>
    );
  },
  notFoundComponent: () => <Card className="p-6">Questionnaire introuvable</Card>,
});

function VersionsPage() {
  const { id } = Route.useParams();
  const { data: roleData, isLoading: roleLoading } = useUserRole();
  const role = roleData?.role;
  const isStaff = role === "admin" || role === "formateur";

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-versions", id],
    enabled: isStaff,
    queryFn: async () => {
      const [{ data: quiz }, { data: versions, error }] = await Promise.all([
        supabase.from("quizzes").select("id,title,subject,level,status,current_version").eq("id", id).maybeSingle(),
        supabase
          .from("quiz_versions")
          .select("id,version,title,subject,level,questions,published_at,published_by")
          .eq("quiz_id", id)
          .order("version", { ascending: false }),
      ]);
      if (error) throw error;
      return { quiz, versions: versions ?? [] };
    },
  });

  if (roleLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!isStaff) {
    return (
      <Card className="p-8 text-center">
        <h2 className="font-display text-xl font-bold">Accès restreint</h2>
        <p className="text-muted-foreground mt-1">Réservé aux formateurs et administrateurs.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-1" /> Retour</Link>
        </Button>
      </div>

      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" /> Historique des versions
        </h1>
        {data?.quiz && (
          <p className="text-muted-foreground">
            {data.quiz.title} — {subjectLabel(data.quiz.subject)} · {levelLabel(data.quiz.level)}
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : !data?.versions.length ? (
        <Card className="p-8 text-center text-muted-foreground">
          Ce questionnaire n'a pas encore été publié.
        </Card>
      ) : (
        <div className="space-y-3">
          {data.versions.map((v: any) => (
            <VersionCard key={v.id} v={v} isCurrent={v.version === data.quiz?.current_version} />
          ))}
        </div>
      )}
    </div>
  );
}

function VersionCard({ v, isCurrent }: { v: any; isCurrent: boolean }) {
  const [open, setOpen] = useState(false);
  const questions = Array.isArray(v.questions) ? v.questions : [];
  return (
    <Card className="p-4">
      <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-display font-semibold">Version {v.version}</span>
        {isCurrent && (
          <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Version actuelle
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(v.published_at).toLocaleString("fr-FR")} · {questions.length} question(s)
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm"><span className="text-muted-foreground">Titre :</span> {v.title}</p>
          <ol className="space-y-2 list-decimal list-inside text-sm">
            {questions.map((q: any, i: number) => (
              <li key={i}>
                <span className="font-medium">[{q.type}]</span> {q.prompt}
                {q.type === "qcm" && Array.isArray(q.choices) && (
                  <ul className="ml-6 mt-1 list-disc text-muted-foreground">
                    {q.choices.map((c: string, ci: number) => (
                      <li key={ci} className={ci === q.correct_index ? "text-foreground font-medium" : ""}>
                        {c}{ci === q.correct_index ? " ✓" : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {q.type === "cas_pratique" && q.model_answer && (
                  <p className="ml-6 mt-1 text-muted-foreground italic">Réponse-type : {q.model_answer}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
