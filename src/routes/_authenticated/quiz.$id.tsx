import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { levelLabel, subjectLabel } from "@/lib/constants";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Trophy,
  ClipboardCheck,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getQuizForAttempt,
  scoreQcmAnswer,
  revealCaseAnswer,
  submitCaseAnswer,
} from "@/lib/quiz.functions";

export const Route = createFileRoute("/_authenticated/quiz/$id")({
  component: QuizPage,
});

type Criterion = { label: string; points: number };

type Correction = {
  questionId: string;
  isQcm: boolean;
  prompt: string;
  choices: string[];
  // QCM
  selectedIndex: number | null;
  correctIndex: number | null;
  explanation: string | null;
  isCorrect: boolean;
  qcmPoints: number;
  // Cas pratique
  textAnswer: string;
  modelAnswer: string | null;
  criteria: Criterion[];
  points: number;
};

function QuizPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchQuiz = useServerFn(getQuizForAttempt);
  const scoreQcm = useServerFn(scoreQcmAnswer);
  const revealCase = useServerFn(revealCaseAnswer);
  const submitCase = useServerFn(submitCaseAnswer);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [responses, setResponses] = useState<
    Record<string, { selected: number | null; text: string }>
  >({});
  const [phase, setPhase] = useState<"answering" | "review" | "finished">("answering");
  const [submitting, setSubmitting] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean[]>>({});
  const [selfMarks, setSelfMarks] = useState<Record<string, boolean>>({});
  const [finalEarned, setFinalEarned] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [startedAt] = useState(() => Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-attempt", id],
    queryFn: () => fetchQuiz({ data: { quizId: id } }),
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

  const questions = data.questions as any[];
  const total = questions.length;
  const q = questions[current];
  const isQcm = (q.type ?? "qcm") === "qcm";
  const choices = (q.choices as string[]) ?? [];
  const resp = responses[q.id] ?? { selected: null, text: "" };
  const questionPoints: number = Math.max(1, Number(q.points) || 1);

  const setResp = (patch: Partial<{ selected: number | null; text: string }>) =>
    setResponses((r) => ({ ...r, [q.id]: { ...(r[q.id] ?? { selected: null, text: "" }), ...patch } }));

  const answered = (question: any) => {
    const r = responses[question.id];
    if (!r) return false;
    return (question.type ?? "qcm") === "qcm" ? r.selected !== null : !!r.text.trim();
  };

  const allAnswered = questions.every(answered);

  // ---- Final validation: submit everything, then reveal the corrections ----
  const finalValidate = async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    try {
      const out: Correction[] = [];
      for (const question of questions) {
        const r = responses[question.id] ?? { selected: null, text: "" };
        const qcm = (question.type ?? "qcm") === "qcm";
        if (qcm) {
          const res = await scoreQcm({
            data: { attemptId, questionId: question.id, selectedIndex: r.selected as number },
          });
          out.push({
            questionId: question.id,
            isQcm: true,
            prompt: question.prompt,
            choices: (question.choices as string[]) ?? [],
            selectedIndex: r.selected,
            correctIndex: res.correctIndex,
            explanation: res.explanation,
            isCorrect: res.isCorrect,
            qcmPoints: res.points,
            textAnswer: "",
            modelAnswer: null,
            criteria: [],
            points: res.points,
          });
        } else {
          const res = await revealCase({
            data: { attemptId, questionId: question.id, textAnswer: r.text },
          });
          const criteria: Criterion[] = (Array.isArray(res.criteria) ? res.criteria : [])
            .filter((c: any) => c && typeof c.label === "string")
            .map((c: any) => ({ label: String(c.label), points: Number(c.points) || 1 }));
          out.push({
            questionId: question.id,
            isQcm: false,
            prompt: question.prompt,
            choices: [],
            selectedIndex: null,
            correctIndex: null,
            explanation: question.explanation ?? null,
            isCorrect: false,
            qcmPoints: 0,
            textAnswer: r.text,
            modelAnswer: res.modelAnswer,
            criteria,
            points: res.points,
          });
        }
      }
      setCorrections(out);
      setCheckedMap(
        Object.fromEntries(
          out.filter((c) => !c.isQcm).map((c) => [c.questionId, new Array(c.criteria.length).fill(false)]),
        ),
      );
      setPhase("review");
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur lors de la validation");
    } finally {
      setSubmitting(false);
    }
  };

  const cases = corrections.filter((c) => !c.isQcm);
  const selfEvalDone = cases.every((c) =>
    c.criteria.length > 0 ? true : selfMarks[c.questionId] !== undefined,
  );

  // ---- Persist self-evaluation and close the attempt ----
  const finishAttempt = async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    try {
      let earned = corrections.filter((c) => c.isQcm && c.isCorrect).reduce((s, c) => s + c.qcmPoints, 0);
      let totalPts = corrections.filter((c) => c.isQcm).reduce((s, c) => s + c.qcmPoints, 0);

      for (const c of cases) {
        const checks = checkedMap[c.questionId] ?? [];
        const res = await submitCase({
          data: {
            attemptId,
            questionId: c.questionId,
            textAnswer: c.textAnswer,
            criteriaScores: c.criteria.map((cr, i) => ({
              label: cr.label,
              points: cr.points,
              checked: !!checks[i],
            })),
            ...(c.criteria.length === 0 ? { selfMark: !!selfMarks[c.questionId] } : {}),
          },
        });
        earned += res.earned;
        totalPts += res.totalPoints;
      }

      const duration = Math.round((Date.now() - startedAt) / 1000);
      await supabase
        .from("attempts")
        .update({
          score: earned,
          total: totalPts,
          duration_seconds: duration,
          finished_at: new Date().toISOString(),
        })
        .eq("id", attemptId);

      setFinalEarned(earned);
      setFinalTotal(totalPts);
      setPhase("finished");
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur d'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------- Finished --------------------------------
  if (phase === "finished") {
    const pct = finalTotal > 0 ? Math.round((finalEarned / finalTotal) * 100) : 0;
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="p-8 text-center">
          <Trophy className="h-12 w-12 text-amber mx-auto" />
          <h2 className="font-display text-3xl font-bold mt-4">Test terminé</h2>
          <p className="mt-2 text-muted-foreground">{data.quiz.title}</p>
          <div className="mt-6 inline-flex items-baseline gap-2">
            <span className="font-display text-6xl font-bold">{pct}%</span>
            <span className="text-muted-foreground">
              ({finalEarned}/{finalTotal} pts)
            </span>
          </div>
          <p
            className={cn(
              "mt-4 font-medium",
              pct >= 70 ? "text-success" : pct >= 50 ? "text-amber" : "text-destructive",
            )}
          >
            {pct >= 70 ? "Excellent travail !" : pct >= 50 ? "Vous pouvez encore progresser." : "Révision recommandée."}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button onClick={() => navigate({ to: "/quizzes" })}>Autres questionnaires</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/results" })}>
              Mes résultats
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // -------------------------------- Review ---------------------------------
  if (phase === "review") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Corrigé — {data.quiz.title}</h1>
          <p className="text-muted-foreground text-sm">
            Vos réponses ont été enregistrées. Voici le corrigé complet.
          </p>
        </div>

        {corrections.map((c, idx) => (
          <Card key={c.questionId} className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">Q{idx + 1}</span>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium",
                  c.isQcm ? "bg-secondary" : "bg-primary/10 text-primary",
                )}
              >
                {c.isQcm ? "QCM" : "Cas pratique"}
              </span>
              {c.isQcm &&
                (c.isCorrect ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                ))}
            </div>
            <p className="font-medium whitespace-pre-line">{c.prompt}</p>

            {c.isQcm ? (
              <div className="space-y-2">
                {c.choices.map((choice, i) => {
                  const isSelected = c.selectedIndex === i;
                  const isCorrect = c.correctIndex === i;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 text-sm",
                        isCorrect && "border-success bg-success/10",
                        isSelected && !isCorrect && "border-destructive bg-destructive/10",
                      )}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">{choice}</span>
                      {isSelected && <span className="text-xs text-muted-foreground">Votre choix</span>}
                      {isCorrect && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                  );
                })}
                {c.explanation && (
                  <div className="rounded-md border-l-4 border-amber bg-amber/5 p-3 text-sm">
                    <strong>Explication :</strong> {c.explanation}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Votre réponse</p>
                  <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-line">
                    {c.textAnswer}
                  </div>
                </div>
                {c.modelAnswer && (
                  <div className="rounded-md border-l-4 border-rail bg-rail/5 p-3 text-sm">
                    <strong>Réponse-type :</strong>
                    <p className="mt-1 whitespace-pre-line">{c.modelAnswer}</p>
                  </div>
                )}
                {c.criteria.length > 0 ? (
                  <div className="rounded-md border p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">Barème — cochez les critères couverts par votre réponse</p>
                      <p className="text-xs text-muted-foreground">
                        Total : {c.points} pt{c.points > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {c.criteria.map((cr, i) => (
                        <label
                          key={i}
                          className="flex items-start gap-3 rounded-md border p-2 cursor-pointer hover:bg-secondary/50"
                        >
                          <Checkbox
                            checked={!!checkedMap[c.questionId]?.[i]}
                            onCheckedChange={(v) =>
                              setCheckedMap((m) => ({
                                ...m,
                                [c.questionId]: (m[c.questionId] ?? []).map((x, idx2) =>
                                  idx2 === i ? !!v : x,
                                ),
                              }))
                            }
                            className="mt-0.5"
                          />
                          <span className="flex-1 text-sm">{cr.label}</span>
                          <span className="text-xs font-semibold text-muted-foreground shrink-0">
                            {cr.points} pt{cr.points > 1 ? "s" : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-sm">
                      Points obtenus :{" "}
                      <strong>
                        {c.criteria.reduce(
                          (s, cr, i) => s + (checkedMap[c.questionId]?.[i] ? cr.points : 0),
                          0,
                        )}
                      </strong>{" "}
                      / {c.points}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border p-3">
                    <p className="text-sm font-medium">
                      Auto-évaluation : votre réponse couvre-t-elle l'essentiel ?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant={selfMarks[c.questionId] === true ? "default" : "outline"}
                        onClick={() => setSelfMarks((m) => ({ ...m, [c.questionId]: true }))}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Oui, acquis
                      </Button>
                      <Button
                        size="sm"
                        variant={selfMarks[c.questionId] === false ? "default" : "outline"}
                        onClick={() => setSelfMarks((m) => ({ ...m, [c.questionId]: false }))}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Non, à revoir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}

        <div className="flex justify-end">
          <Button onClick={finishAttempt} disabled={submitting || !selfEvalDone}>
            {submitting ? "Enregistrement…" : "Voir mon score final"}
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------- Answering -------------------------------
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex gap-2 mb-2 flex-wrap">
          <span className="rounded-md bg-rail/10 px-2 py-0.5 text-xs font-medium text-rail">
            {subjectLabel(data.quiz.subject)}
          </span>
          <span className="rounded-md bg-amber/15 px-2 py-0.5 text-xs font-medium">
            {levelLabel(data.quiz.level)}
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              isQcm ? "bg-secondary" : "bg-primary/10 text-primary",
            )}
          >
            {isQcm ? "QCM" : "Cas pratique"}
          </span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
            {questionPoints} pt{questionPoints > 1 ? "s" : ""}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold">{data.quiz.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={((current + 1) / total) * 100} className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">
            {current + 1}/{total}
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Le corrigé sera affiché après la validation finale du test.
        </p>
      </div>

      <Card className="p-6">
        <p className="font-medium text-lg whitespace-pre-line">{q.prompt}</p>

        {isQcm ? (
          <div className="mt-5 space-y-2">
            {choices.map((c, i) => {
              const isSelected = resp.selected === i;
              return (
                <button
                  key={i}
                  onClick={() => setResp({ selected: i })}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                    isSelected ? "border-rail bg-rail/5" : "hover:bg-secondary/50",
                  )}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{c}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <Label className="text-sm font-medium flex items-center gap-1">
              <ClipboardCheck className="h-4 w-4" /> Votre réponse
            </Label>
            <Textarea
              rows={8}
              className="mt-1"
              value={resp.text}
              onChange={(e) => setResp({ text: e.target.value })}
              placeholder="Rédigez votre réponse : étapes, procédure, points de vigilance…"
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Précédente
          </Button>
          {current < total - 1 ? (
            <Button onClick={() => setCurrent((c) => c + 1)} disabled={!answered(q)}>
              Suivante <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={finalValidate} disabled={!allAnswered || submitting || !attemptId}>
              {submitting ? "Validation…" : "Valider le test"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
