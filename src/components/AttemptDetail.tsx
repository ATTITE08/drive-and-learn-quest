import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, FileText } from "lucide-react";

export function AttemptDetail({ attemptId }: { attemptId: string }) {
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
