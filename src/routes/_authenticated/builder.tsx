import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEVELS, SUBJECTS } from "@/lib/constants";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, ListChecks, PenLine, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/builder")({
  component: BuilderPage,
});

type Criterion = { label: string; points: number };
type QcmDraft = {
  kind: "qcm";
  prompt: string;
  choices: string[];
  correct_index: number;
  explanation: string;
};
type CasDraft = {
  kind: "cas_pratique";
  prompt: string;
  model_answer: string;
  points: number;
  criteria: Criterion[];
};
type QDraft = QcmDraft | CasDraft;

const newQcm = (): QcmDraft => ({
  kind: "qcm",
  prompt: "",
  choices: ["", "", "", ""],
  correct_index: 0,
  explanation: "",
});
const newCas = (): CasDraft => ({
  kind: "cas_pratique",
  prompt: "",
  model_answer: "",
  points: 5,
  criteria: [{ label: "", points: 1 }],
});

function BuilderPage() {
  const { data: roleData, isLoading } = useUserRole();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [questions, setQuestions] = useState<QDraft[]>([newQcm()]);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <p>Chargement…</p>;
  const role = roleData?.role;
  if (role !== "admin" && role !== "formateur") {
    return (
      <Card className="p-8 text-center">
        <h2 className="font-display text-xl font-bold">Accès restreint</h2>
        <p className="text-muted-foreground mt-1">
          Réservé aux formateurs et administrateurs.
        </p>
      </Card>
    );
  }

  const update = (i: number, patch: Partial<QDraft>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? ({ ...q, ...patch } as QDraft) : q)));
  const remove = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const validate = (): string | null => {
    if (!title.trim()) return "Titre requis";
    if (!subject) return "Matière requise";
    if (!level) return "Niveau requis";
    if (!questions.length) return "Ajoutez au moins une question";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.prompt.trim()) return `Question ${i + 1} : énoncé manquant`;
      if (q.kind === "qcm") {
        const filled = q.choices.filter((c) => c.trim());
        if (filled.length < 2) return `Question ${i + 1} : au moins 2 choix`;
        if (q.correct_index < 0 || q.correct_index >= q.choices.length || !q.choices[q.correct_index].trim())
          return `Question ${i + 1} : bonne réponse invalide`;
      } else {
        if (!q.model_answer.trim()) return `Question ${i + 1} : réponse-type requise`;
        if (q.points < 1) return `Question ${i + 1} : points invalides`;
        const cSum = q.criteria.reduce((s, c) => s + (c.points || 0), 0);
        if (q.criteria.some((c) => !c.label.trim())) return `Question ${i + 1} : critère sans libellé`;
        if (cSum > 0 && cSum !== q.points)
          return `Question ${i + 1} : la somme des critères (${cSum}) doit égaler ${q.points}`;
      }
    }
    return null;
  };

  const save = async (publish: boolean) => {
    const err = validate();
    if (err) return toast.error(err);
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: quiz, error: qErr } = await supabase
        .from("quizzes")
        .insert({
          title: title.trim(),
          subject: subject as any,
          level: level as any,
          created_by: u.user!.id,
          status: publish ? "published" : "draft",
          current_version: publish ? 1 : 0,
          published_at: publish ? new Date().toISOString() : null,
        } as any)
        .select("id,title,subject,level")
        .single();
      if (qErr || !quiz) throw new Error(qErr?.message ?? "Création questionnaire échouée");

      const rows = questions.map((q, i) => {
        if (q.kind === "qcm") {
          const choices = q.choices.map((c) => c.trim()).filter(Boolean);
          return {
            quiz_id: quiz.id,
            type: "qcm" as const,
            prompt: q.prompt.trim(),
            choices,
            correct_index: Math.min(q.correct_index, choices.length - 1),
            explanation: q.explanation.trim() || null,
            model_answer: null,
            points: 1,
            criteria: [],
            position: i,
          };
        }
        return {
          quiz_id: quiz.id,
          type: "cas_pratique" as const,
          prompt: q.prompt.trim(),
          choices: null,
          correct_index: null,
          explanation: null,
          model_answer: q.model_answer.trim(),
          points: q.points,
          criteria: q.criteria
            .filter((c) => c.label.trim())
            .map((c) => ({ label: c.label.trim(), points: c.points })),
          position: i,
        };
      });
      const { error: insErr } = await supabase.from("questions").insert(rows);
      if (insErr) throw new Error(insErr.message);

      if (publish) {
        const { error: vErr } = await supabase.from("quiz_versions").insert({
          quiz_id: quiz.id,
          version: 1,
          title: quiz.title,
          subject: quiz.subject,
          level: quiz.level,
          questions: rows as any,
          published_by: u.user!.id,
        } as any);
        if (vErr) throw new Error(vErr.message);
      }

      toast.success(publish ? "Questionnaire publié" : "Brouillon enregistré");
      navigate({ to: "/quizzes" });
    } catch (e: any) {
      toast.error(e.message ?? "Échec");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Créer un questionnaire</h1>
        <p className="text-muted-foreground">
          Composez manuellement vos QCM et cas pratiques.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Freinage — évaluation initiale" />
          </div>
          <div>
            <Label>Matière</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{SUBJECTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Niveau visé</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <Card key={i} className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-secondary text-sm font-semibold">{i + 1}</span>
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                {q.kind === "qcm" ? <><ListChecks className="h-3 w-3" /> QCM</> : <><PenLine className="h-3 w-3" /> Cas pratique</>}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter"><GripVertical className="h-4 w-4 rotate-180" /></Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="Descendre"><GripVertical className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(i)} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>

            <div>
              <Label>Énoncé</Label>
              <Textarea rows={2} value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value } as any)} />
            </div>

            {q.kind === "qcm" ? (
              <div className="space-y-2">
                <Label>Choix (cochez la bonne réponse)</Label>
                {q.choices.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correct_index === ci}
                      onChange={() => update(i, { correct_index: ci } as any)}
                      className="h-4 w-4"
                    />
                    <Input
                      value={c}
                      onChange={(e) => {
                        const choices = [...q.choices];
                        choices[ci] = e.target.value;
                        update(i, { choices } as any);
                      }}
                      placeholder={`Choix ${ci + 1}`}
                    />
                    {q.choices.length > 2 && (
                      <Button size="icon" variant="ghost" onClick={() => {
                        const choices = q.choices.filter((_, x) => x !== ci);
                        update(i, { choices, correct_index: Math.min(q.correct_index, choices.length - 1) } as any);
                      }}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                ))}
                {q.choices.length < 6 && (
                  <Button size="sm" variant="outline" onClick={() => update(i, { choices: [...q.choices, ""] } as any)}>
                    <Plus className="h-4 w-4 mr-1" /> Ajouter un choix
                  </Button>
                )}
                <div>
                  <Label>Explication (facultatif)</Label>
                  <Textarea rows={2} value={q.explanation} onChange={(e) => update(i, { explanation: e.target.value } as any)} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Réponse-type (utilisée pour l'évaluation)</Label>
                  <Textarea rows={4} value={q.model_answer} onChange={(e) => update(i, { model_answer: e.target.value } as any)} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="mb-0">Total points</Label>
                  <Input type="number" min={1} max={20} value={q.points}
                    onChange={(e) => update(i, { points: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } as any)}
                    className="w-20 h-8" />
                </div>
                <div className="space-y-2">
                  <Label>Critères d'évaluation</Label>
                  {q.criteria.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <Input value={c.label} placeholder={`Critère ${ci + 1}`}
                        onChange={(e) => {
                          const criteria = [...q.criteria];
                          criteria[ci] = { ...c, label: e.target.value };
                          update(i, { criteria } as any);
                        }} />
                      <Input type="number" min={1} max={10} value={c.points}
                        onChange={(e) => {
                          const criteria = [...q.criteria];
                          criteria[ci] = { ...c, points: Math.max(1, Math.min(10, Number(e.target.value) || 1)) };
                          update(i, { criteria } as any);
                        }} className="w-20" />
                      <Button size="icon" variant="ghost" onClick={() => {
                        const criteria = q.criteria.filter((_, x) => x !== ci);
                        update(i, { criteria } as any);
                      }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => update(i, { criteria: [...q.criteria, { label: "", points: 1 }] } as any)}>
                    <Plus className="h-4 w-4 mr-1" /> Ajouter un critère
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Astuce : si vous renseignez des critères, la somme de leurs points doit égaler le total.
                  </p>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setQuestions((qs) => [...qs, newQcm()])}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter un QCM
        </Button>
        <Button variant="outline" onClick={() => setQuestions((qs) => [...qs, newCas()])}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter un cas pratique
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={busy}>
            <Save className="h-4 w-4 mr-1" /> {busy ? "…" : "Enregistrer brouillon"}
          </Button>
          <Button onClick={() => save(true)} disabled={busy}>
            <Save className="h-4 w-4 mr-1" /> {busy ? "…" : "Publier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
