import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { levelLabel, subjectLabel } from "@/lib/constants";
import { CheckCircle2, XCircle, ArrowRight, Trophy } from "lucide-react";
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
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
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

  const q = data.questions[current];
  const choices = (q.choices as string[]) ?? [];
  const total = data.questions.length;

  const validate = async () => {
    if (selected === null || revealed) return;
    const isCorrect = selected === q.correct_index;
    setRevealed(true);
    if (isCorrect) setScore((s) => s + 1);
    if (attemptId) {
      await supabase.from("answers").insert({
        attempt_id: attemptId,
        question_id: q.id,
        selected_index: selected,
        is_correct: isCorrect,
      });
    }
  };

  const next = async () => {
    if (current < total - 1) {
      setCurrent((c) => c + 1);
      setSelected(null);
      setRevealed(false);
    } else {
      const duration = Math.round((Date.now() - startedAt) / 1000);
      if (attemptId) {
        await supabase.from("attempts").update({
          score, total, duration_seconds: duration, finished_at: new Date().toISOString(),
        }).eq("id", attemptId);
      }
      setFinished(true);
    }
  };

  if (finished) {
    const pct = Math.round((score / total) * 100);
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="p-8 text-center">
          <Trophy className="h-12 w-12 text-amber mx-auto" />
          <h2 className="font-display text-3xl font-bold mt-4">Test terminé</h2>
          <p className="mt-2 text-muted-foreground">{data.quiz.title}</p>
          <div className="mt-6 inline-flex items-baseline gap-2">
            <span className="font-display text-6xl font-bold">{pct}%</span>
            <span className="text-muted-foreground">({score}/{total})</span>
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex gap-2 mb-2">
          <span className="rounded-md bg-rail/10 px-2 py-0.5 text-xs font-medium text-rail">{subjectLabel(data.quiz.subject)}</span>
          <span className="rounded-md bg-amber/15 px-2 py-0.5 text-xs font-medium">{levelLabel(data.quiz.level)}</span>
        </div>
        <h1 className="font-display text-2xl font-bold">{data.quiz.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={((current + (revealed ? 1 : 0)) / total) * 100} className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">{current + 1}/{total}</span>
        </div>
      </div>

      <Card className="p-6">
        <p className="font-medium text-lg">{q.prompt}</p>
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
        {revealed && q.explanation && (
          <div className="mt-4 rounded-md border-l-4 border-amber bg-amber/5 p-3 text-sm">
            <strong>Explication :</strong> {q.explanation}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          {!revealed ? (
            <Button onClick={validate} disabled={selected === null}>Valider</Button>
          ) : (
            <Button onClick={next}>{current < total - 1 ? <>Suivante <ArrowRight className="h-4 w-4 ml-1" /></> : "Terminer"}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
