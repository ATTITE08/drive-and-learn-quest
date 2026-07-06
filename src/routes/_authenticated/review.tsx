import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { levelLabel, subjectLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, FileText, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/review")({
  component: ReviewPage,
});

function ReviewPage() {
  const { data: roleData, isLoading: roleLoading } = useUserRole();
  const [quizId, setQuizId] = useState<string>("");

  const { data: quizzes } = useQuery({
    queryKey: ["review-quizzes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("id,title,subject,level")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: attempts, isLoading: attemptsLoading } = useQuery({
    queryKey: ["review-attempts", quizId],
    enabled: !!quizId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attempts")
        .select("id,score,total,finished_at,created_at,user_id,profiles!attempts_user_id_fkey(full_name,email)")
        .eq("quiz_id", quizId)
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (roleLoading) return <p>Chargement…</p>;
  if (roleData?.role !== "admin" && roleData?.role !== "formateur") {
    return (
      <Card className="p-8 text-center">
        <h2 className="font-display text-xl font-bold">Accès restreint</h2>
        <p className="text-muted-foreground mt-1">Réservé aux administrateurs et formateurs.</p>
      </Card>
    );
  }

  const currentQuiz = quizzes?.find((q: any) => q.id === quizId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Consultation des réponses</h1>
        <p className="text-muted-foreground">
          Consultez, par questionnaire, les réponses saisies par les agents, la réponse-type,
          les critères cochés et le score par cas pratique.
        </p>
      </div>

      <Card className="p-6">
        <label className="text-sm font-medium">Choisir un questionnaire</label>
        <Select value={quizId} onValueChange={setQuizId}>
          <SelectTrigger className="mt-2 max-w-xl">
            <SelectValue placeholder="Sélectionner un questionnaire…" />
          </SelectTrigger>
          <SelectContent>
            {quizzes?.map((q: any) => (
              <SelectItem key={q.id} value={q.id}>
                {q.title} — {subjectLabel(q.subject)} · {levelLabel(q.level)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {quizId && (
        <Card className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> {currentQuiz?.title}
            </h2>
            <span className="text-sm text-muted-foreground">
              {attempts?.length ?? 0} tentative(s) terminée(s)
            </span>
          </div>

          {attemptsLoading ? (
            <p className="text-muted-foreground mt-4">Chargement…</p>
          ) : !attempts?.length ? (
            <p className="text-muted-foreground mt-4">Aucune tentative pour ce questionnaire.</p>
          ) : (
            <Accordion type="multiple" className="mt-4">
              {attempts.map((a: any) => (
                <AttemptRow key={a.id} attempt={a} />
              ))}
            </Accordion>
          )}
        </Card>
      )}
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: any }) {
  const pct = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
  const name = attempt.profiles?.full_name ?? attempt.profiles?.email ?? "Agent";

  return (
    <AccordionItem value={attempt.id}>
      <AccordionTrigger>
        <div className="flex flex-1 items-center justify-between gap-3 pr-3">
          <div className="text-left">
            <p className="font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              {attempt.profiles?.email} ·{" "}
              {attempt.finished_at
                ? new Date(attempt.finished_at).toLocaleString("fr-FR")
                : "—"}
            </p>
          </div>
          <span
            className={cn(
              "font-bold tabular-nums text-sm",
              pct >= 70 ? "text-success" : pct >= 50 ? "text-amber" : "text-destructive",
            )}
          >
            {attempt.score}/{attempt.total} · {pct}%
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <AttemptDetail attemptId={attempt.id} />
      </AccordionContent>
    </AccordionItem>
  );
}

function AttemptDetail({ attemptId }: { attemptId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["review-answers", attemptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answers")
        .select(
          "id,is_correct,selected_index,text_answer,criteria_scores,questions(id,type,prompt,choices,correct_index,model_answer,explanation,points,criteria,position)",
        )
        .eq("attempt_id", attemptId);
      if (error) throw error;
      return (data ?? []).sort(
        (a: any, b: any) => (a.questions?.position ?? 0) - (b.questions?.position ?? 0),
      );
    },
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Chargement…</p>;
  if (!data?.length) return <p className="text-muted-foreground text-sm">Aucune réponse enregistrée.</p>;

  return (
    <div className="space-y-4">
      {data.map((ans: any, idx: number) => {
        const q = ans.questions;
        if (!q) return null;
        const isQcm = q.type === "qcm";
        const criteria: Array<{ label: string; points: number }> = Array.isArray(q.criteria)
          ? q.criteria
          : [];
        const scores: boolean[] = Array.isArray(ans.criteria_scores) ? ans.criteria_scores : [];
        const earned = isQcm
          ? ans.is_correct
            ? q.points ?? 1
            : 0
          : criteria.reduce(
              (sum, c, i) => sum + (scores[i] ? Number(c.points) || 0 : 0),
              0,
            );

        return (
          <div key={ans.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Q{idx + 1}
                </Badge>
                <Badge variant={isQcm ? "secondary" : "default"}>
                  {isQcm ? "QCM" : "Cas pratique"}
                </Badge>
                {ans.is_correct ? (
                  <CheckCircle2 className="h-4 w-4 text-success mt-1" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive mt-1" />
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                {earned}/{q.points ?? (isQcm ? 1 : 0)} pts
              </span>
            </div>

            <p className="font-medium whitespace-pre-wrap">{q.prompt}</p>

            {isQcm ? (
              <div className="space-y-1">
                {(q.choices ?? []).map((choice: string, i: number) => {
                  const isSelected = ans.selected_index === i;
                  const isCorrect = q.correct_index === i;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                        isCorrect && "border-success/50 bg-success/10",
                        isSelected && !isCorrect && "border-destructive/50 bg-destructive/10",
                      )}
                    >
                      <span className="text-xs font-mono text-muted-foreground w-4">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">{choice}</span>
                      {isSelected && (
                        <Badge variant="outline" className="text-xs">
                          Choix agent
                        </Badge>
                      )}
                      {isCorrect && (
                        <Badge variant="outline" className="text-xs border-success/50 text-success">
                          Correct
                        </Badge>
                      )}
                    </div>
                  );
                })}
                {q.explanation && (
                  <p className="text-xs text-muted-foreground pt-1">
                    <span className="font-medium">Explication : </span>
                    {q.explanation}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Réponse de l'agent
                  </p>
                  <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                    {ans.text_answer?.trim() || (
                      <span className="italic text-muted-foreground">Aucune réponse saisie.</span>
                    )}
                  </div>
                </div>

                {q.model_answer && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                      Réponse-type
                    </p>
                    <div className="rounded-md border border-rail/30 bg-rail/5 p-3 text-sm whitespace-pre-wrap">
                      {q.model_answer}
                    </div>
                  </div>
                )}

                {criteria.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                      Critères d'évaluation
                    </p>
                    <ul className="space-y-1">
                      {criteria.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            {scores[i] ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className={cn(!scores[i] && "text-muted-foreground")}>
                              {c.label}
                            </span>
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {scores[i] ? c.points : 0}/{c.points} pts
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {q.explanation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Explication : </span>
                    {q.explanation}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
