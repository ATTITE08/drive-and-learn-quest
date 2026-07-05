import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

type Criterion = { label: string; points: number };

export function RubricEditor({
  quizId,
  open,
  onOpenChange,
}: {
  quizId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rubric-questions", quizId],
    enabled: !!quizId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id,prompt,type,model_answer,points,criteria,position")
        .eq("quiz_id", quizId!)
        .eq("type", "cas_pratique")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Barème des cas pratiques</DialogTitle>
          <DialogDescription>
            Définissez les points totaux, les critères d'évaluation et la réponse-type. Ces éléments guideront l'auto-évaluation de l'agent.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : !data?.length ? (
          <p className="text-muted-foreground">Aucun cas pratique dans ce questionnaire.</p>
        ) : (
          <div className="space-y-4">
            {data.map((q: any) => (
              <QuestionRubric
                key={q.id}
                question={q}
                onSaved={() => {
                  refetch();
                  qc.invalidateQueries({ queryKey: ["quiz", quizId] });
                }}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuestionRubric({ question, onSaved }: { question: any; onSaved: () => void }) {
  const [prompt, setPrompt] = useState(question.prompt as string);
  const [modelAnswer, setModelAnswer] = useState((question.model_answer as string) ?? "");
  const [points, setPoints] = useState<number>(Number(question.points) || 1);
  const [criteria, setCriteria] = useState<Criterion[]>(() => {
    const c = question.criteria;
    return Array.isArray(c)
      ? (c as any[])
          .filter((x) => x && typeof x.label === "string")
          .map((x) => ({ label: String(x.label), points: Number(x.points) || 1 }))
      : [];
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // keep total in sync with sum of criteria when user edits criteria points
    if (criteria.length) {
      const sum = criteria.reduce((s, c) => s + (Number(c.points) || 0), 0);
      if (sum > 0) setPoints(sum);
    }
  }, [criteria]);

  const updateCrit = (i: number, patch: Partial<Criterion>) => {
    setCriteria((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const addCrit = () => setCriteria((cs) => [...cs, { label: "", points: 1 }]);
  const removeCrit = (i: number) => setCriteria((cs) => cs.filter((_, idx) => idx !== i));

  const save = async () => {
    const cleanCriteria = criteria
      .map((c) => ({ label: c.label.trim(), points: Math.max(1, Math.min(10, Math.round(Number(c.points) || 1))) }))
      .filter((c) => c.label.length > 0);
    const finalPoints = cleanCriteria.length
      ? cleanCriteria.reduce((s, c) => s + c.points, 0)
      : Math.max(1, Math.min(20, Math.round(points)));
    setBusy(true);
    const { error } = await supabase
      .from("questions")
      .update({
        prompt: prompt.trim() || question.prompt,
        model_answer: modelAnswer.trim() || null,
        points: finalPoints,
        criteria: cleanCriteria as any,
      })
      .eq("id", question.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Barème enregistré");
      onSaved();
    }
  };

  const totalCritPoints = criteria.reduce((s, c) => s + (Number(c.points) || 0), 0);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Question #{question.position + 1}</span>
        <span className="text-xs font-semibold rounded-md bg-primary/10 text-primary px-2 py-0.5">
          {points} pt{points > 1 ? "s" : ""}
        </span>
      </div>
      <div>
        <Label className="text-xs">Énoncé</Label>
        <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Réponse-type</Label>
        <Textarea rows={4} value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)}
          placeholder="Éléments attendus, étapes de la procédure, points de vigilance…" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Critères d'évaluation</Label>
          <span className="text-xs text-muted-foreground">
            Total critères : {totalCritPoints} pt{totalCritPoints > 1 ? "s" : ""}
          </span>
        </div>
        <div className="space-y-2">
          {criteria.map((c, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input
                className="flex-1"
                placeholder={`Critère ${i + 1} (ex : Identifier la panne)`}
                value={c.label}
                onChange={(e) => updateCrit(i, { label: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                max={10}
                className="w-20"
                value={c.points}
                onChange={(e) => updateCrit(i, { points: Number(e.target.value) || 1 })}
              />
              <Button type="button" size="icon" variant="ghost" onClick={() => removeCrit(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addCrit}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter un critère
          </Button>
        </div>
        {!criteria.length && (
          <div className="mt-2 flex items-center gap-2">
            <Label className="text-xs">Points (sans critères)</Label>
            <Input type="number" min={1} max={20} className="w-24"
              value={points} onChange={(e) => setPoints(Number(e.target.value) || 1)} />
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={busy}>
          <Save className="h-4 w-4 mr-1" /> {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </Card>
  );
}
