import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { levelLabel, subjectLabel } from "@/lib/constants";
import { CheckCircle2, XCircle, ArrowRight, Trophy, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/quiz/$id")({
  component: QuizPage,
});

function QuizPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [selfMark, setSelfMark] = useState<boolean | null>(null);
  const [scored, setScored] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [finished, setFinished] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ["quiz", id],
    queryFn: async () => {
      const [{ data: quiz }, { data: questions }] = await Promise.all([
        supabase.from("quizzes").select("*").eq("id", id).single(),
        supabase.from("questions").select("*").eq("quiz_id", id).order("position"),
      ]);
      return { quiz, questions: questions ?? [] };
    },
  });

  useEffect(() => {
    (async () => {
      if (!data?.quiz || attemptId) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: row, error } = await supabase
        .from("attempts")
        .insert({ quiz_id: id, user_id: u.user.id, total: data.questions.length })
        .select("id")
        .single();
      if (error) toast.error(error.message);
      else setAttemptId(row.id);
    })();
  }, [data, attemptId, id]);

  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!data?.quiz) return <p>Questionnaire introuvable.</p>;
  if (!data.questions.length) return <p>Aucune question dans ce questionnaire.</p>;

  const q = data.questions[current] as any;
  const isQcm = (q.type ?? "qcm") === "qcm";
  const choices = (q.choices as string[]) ?? [];
  const total = data.questions.length;
  const criteria: { label: string; points: number }[] = Array.isArray(q.criteria)
    ? (q.criteria as any[]).filter((c) => c && typeof c.label === "string").map((c) => ({ label: String(c.label), points: Number(c.points) || 1 }))
    : [];
  const questionPoints: number = Math.max(1, Number(q.points) || (criteria.length ? criteria.reduce((s, c) => s + c.points, 0) : 1));

  const recordScore = async (earned: number, isCorrect: boolean, extra: Record<string, unknown> = {}) => {
    setEarnedPoints((p) => p + earned);
    setTotalPoints((p) => p + questionPoints);
    setScored(true);
    if (attemptId) {
      await supabase.from("answers").insert({
        attempt_id: attemptId,
        question_id: q.id,
        is_correct: isCorrect,
        ...extra,
      });
    }
  };

  const validate = async () => {
    if (revealed) return;
    if (isQcm) {
      if (selected === null) return;
      const isCorrect = selected === q.correct_index;
      setRevealed(true);
      await recordScore(isCorrect ? questionPoints : 0, isCorrect, { selected_index: selected });
    } else {
      if (!textAnswer.trim()) return;
      setRevealed(true);
      setChecked(new Array(criteria.length).fill(false));
    }
  };

  const finalizeCriteria = async () => {
    const earned = criteria.reduce((s, c, i) => s + (checked[i] ? c.points : 0), 0);
    const isCorrect = questionPoints > 0 && earned / questionPoints >= 0.5;
    await recordScore(earned, isCorrect, {
      text_answer: textAnswer,
      criteria_scores: criteria.map((c, i) => ({ label: c.label, points: c.points, checked: !!checked[i] })),
    });
  };

  const submitSelfMark = async (ok: boolean) => {
    setSelfMark(ok);
    await recordScore(ok ? questionPoints : 0, ok, { text_answer: textAnswer });
  };

  const next = async () => {
    if (current < total - 1) {
      setCurrent((c) => c + 1);
      setSelected(null);
      setTextAnswer("");
      setRevealed(false);
      setSelfMark(null);
      setChecked([]);
      setScored(false);
    } else {
      const duration = Math.round((Date.now() - startedAt) / 1000);
      if (attemptId) {
        // Legacy columns store points; keep consistent
        await supabase.from("attempts").update({
          score: earnedPoints, total: totalPoints, duration_seconds: duration, finished_at: new Date().toISOString(),
        }).eq("id", attemptId);
      }
      setFinished(true);
    }
  };

  if (finished) {
    const pct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="p-8 text-center">
          <Trophy className="h-12 w-12 text-amber mx-auto" />
          <h2 className="font-display text-3xl font-bold mt-4">Test terminé</h2>
          <p className="mt-2 text-muted-foreground">{data.quiz.title}</p>
          <div className="mt-6 inline-flex items-baseline gap-2">
            <span className="font-display text-6xl font-bold">{pct}%</span>
            <span className="text-muted-foreground">({earnedPoints}/{totalPoints} pts)</span>
          </div>
          <p className={cn("mt-4 font-medium", pct >= 70 ? "text-success" : pct >= 50 ? "text-amber" : "text-destructive")}>
            {pct >= 70 ? "Excellent travail !" : pct >= 50 ? "Vous pouvez encore progresser." : "Révision recommandée."}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button onClick={() => navigate({ to: "/quizzes" })}>Autres questionnaires</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/results" })}>Mes résultats</Button>
          </div>
        </Card>
      </div>
    );
  }

  const canAdvance = isQcm ? revealed : revealed && scored;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex gap-2 mb-2 flex-wrap">
          <span className="rounded-md bg-rail/10 px-2 py-0.5 text-xs font-medium text-rail">{subjectLabel(data.quiz.subject)}</span>
          <span className="rounded-md bg-amber/15 px-2 py-0.5 text-xs font-medium">{levelLabel(data.quiz.level)}</span>
          <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", isQcm ? "bg-secondary" : "bg-primary/10 text-primary")}>
            {isQcm ? "QCM" : "Cas pratique"}
          </span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
            {questionPoints} pt{questionPoints > 1 ? "s" : ""}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold">{data.quiz.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={((current + (revealed ? 1 : 0)) / total) * 100} className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">{current + 1}/{total}</span>
        </div>
      </div>

      <Card className="p-6">
        <p className="font-medium text-lg whitespace-pre-line">{q.prompt}</p>

        {isQcm ? (
          <div className="mt-5 space-y-2">
            {choices.map((c, i) => {
              const isSelected = selected === i;
              const isCorrect = i === q.correct_index;
              const showCorrect = revealed && isCorrect;
              const showWrong = revealed && isSelected && !isCorrect;
              return (
                <button
                  key={i}
                  onClick={() => !revealed && setSelected(i)}
                  disabled={revealed}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                    !revealed && isSelected && "border-rail bg-rail/5",
                    !revealed && !isSelected && "hover:bg-secondary/50",
                    showCorrect && "border-success bg-success/10",
                    showWrong && "border-destructive bg-destructive/10",
                  )}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{c}</span>
                  {showCorrect && <CheckCircle2 className="h-5 w-5 text-success" />}
                  {showWrong && <XCircle className="h-5 w-5 text-destructive" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div>
              <Label className="text-sm font-medium flex items-center gap-1">
                <ClipboardCheck className="h-4 w-4" /> Votre réponse
              </Label>
              <Textarea
                rows={8}
                className="mt-1"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={revealed}
                placeholder="Rédigez votre réponse : étapes, procédure, points de vigilance…"
              />
            </div>
            {revealed && q.model_answer && (
              <div className="rounded-md border-l-4 border-rail bg-rail/5 p-3 text-sm">
                <strong>Réponse-type :</strong>
                <p className="mt-1 whitespace-pre-line">{q.model_answer}</p>
              </div>
            )}
            {revealed && !scored && criteria.length > 0 && (
              <div className="rounded-md border p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">Barème — cochez les critères couverts par votre réponse</p>
                  <p className="text-xs text-muted-foreground">Total : {questionPoints} pt{questionPoints > 1 ? "s" : ""}</p>
                </div>
                <div className="space-y-2">
                  {criteria.map((c, i) => (
                    <label key={i} className="flex items-start gap-3 rounded-md border p-2 cursor-pointer hover:bg-secondary/50">
                      <Checkbox
                        checked={!!checked[i]}
                        onCheckedChange={(v) => setChecked((arr) => arr.map((x, idx) => (idx === i ? !!v : x)))}
                        className="mt-0.5"
                      />
                      <span className="flex-1 text-sm">{c.label}</span>
                      <span className="text-xs font-semibold text-muted-foreground shrink-0">
                        {c.points} pt{c.points > 1 ? "s" : ""}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    Points obtenus : <strong>{criteria.reduce((s, c, i) => s + (checked[i] ? c.points : 0), 0)}</strong> / {questionPoints}
                  </span>
                  <Button size="sm" onClick={finalizeCriteria}>Valider l'auto-évaluation</Button>
                </div>
              </div>
            )}
            {revealed && !scored && criteria.length === 0 && selfMark === null && (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">Auto-évaluation : votre réponse couvre-t-elle l'essentiel ?</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => submitSelfMark(true)}>
                    <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Oui, acquis
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => submitSelfMark(false)}>
                    <XCircle className="h-4 w-4 mr-1 text-destructive" /> Non, à revoir
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {revealed && isQcm && q.explanation && (
          <div className="mt-4 rounded-md border-l-4 border-amber bg-amber/5 p-3 text-sm">
            <strong>Explication :</strong> {q.explanation}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          {!revealed ? (
            <Button onClick={validate} disabled={isQcm ? selected === null : !textAnswer.trim()}>
              {isQcm ? "Valider" : "Voir la réponse-type"}
            </Button>
          ) : (
            <Button onClick={next} disabled={!canAdvance}>
              {current < total - 1 ? <>Suivante <ArrowRight className="h-4 w-4 ml-1" /></> : "Terminer"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
