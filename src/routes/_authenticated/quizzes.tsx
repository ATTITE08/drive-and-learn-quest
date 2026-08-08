import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { LEVELS, SUBJECTS, levelLabel, subjectLabel } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { Play, Filter, Send, History, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quizzes")({
  component: Quizzes,
});

function Quizzes() {
  const { data: roleData } = useUserRole();
  const userLevel = roleData?.profile?.level as string | undefined;
  const role = roleData?.role;
  const isStaff = role === "admin" || role === "formateur";
  const [subject, setSubject] = useState<string>("all");
  const [level, setLevel] = useState<string>(userLevel ?? "all");
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ title: "", subject: "", level: "" });
  const qc = useQueryClient();

  const { data: quizzes, isLoading } = useQuery({
    queryKey: ["quizzes", subject, level, isStaff],
    queryFn: async () => {
      let q = supabase
        .from("quizzes")
        .select("id,title,subject,level,status,current_version,published_at,created_at,questions(count)")
        .order("created_at", { ascending: false });
      if (subject !== "all") q = q.eq("subject", subject as any);
      if (level !== "all") q = q.eq("level", level as any);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const publish = useMutation({
    mutationFn: async (quizId: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { data: quiz, error: qErr } = await supabase
        .from("quizzes")
        .select("id,title,subject,level,current_version")
        .eq("id", quizId)
        .single();
      if (qErr || !quiz) throw new Error(qErr?.message ?? "Introuvable");

      const { data: qs, error: qsErr } = await supabase
        .from("questions")
        .select("quiz_id,type,prompt,choices,correct_index,explanation,model_answer,points,criteria,position")
        .eq("quiz_id", quizId)
        .order("position");
      if (qsErr) throw new Error(qsErr.message);

      const nextVersion = (quiz.current_version ?? 0) + 1;
      const publishedAt = new Date().toISOString();

      const { error: vErr } = await supabase.from("quiz_versions").insert({
        quiz_id: quiz.id,
        version: nextVersion,
        title: quiz.title,
        subject: quiz.subject,
        level: quiz.level,
        questions: (qs ?? []) as any,
        published_by: u.user!.id,
        published_at: publishedAt,
      } as any);
      if (vErr) throw new Error(vErr.message);

      const { error: upErr } = await supabase
        .from("quizzes")
        .update({
          status: "published",
          current_version: nextVersion,
          published_at: publishedAt,
        } as any)
        .eq("id", quiz.id);
      if (upErr) throw new Error(upErr.message);
    },
    onSuccess: () => {
      toast.success("Publié — nouvelle version enregistrée");
      qc.invalidateQueries({ queryKey: ["quizzes"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const saveQuiz = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("quizzes")
        .update({ title: form.title, subject: form.subject as any, level: form.level as any })
        .eq("id", editing.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Questionnaire mis à jour");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["quizzes"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const removeQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      await supabase.from("questions").delete().eq("quiz_id", quizId);
      const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Questionnaire supprimé");
      qc.invalidateQueries({ queryKey: ["quizzes"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec de la suppression"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Questionnaires</h1>
          <p className="text-muted-foreground">Choisissez un test selon la matière et le niveau.</p>
        </div>
        {isStaff && (
          <Button asChild>
            <Link to="/builder"><Plus className="h-4 w-4 mr-1" /> Nouveau questionnaire</Link>
          </Button>
        )}
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
          {role === "admin" && (
            <Button className="mt-4" asChild><Link to="/admin">Aller à l'administration</Link></Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q: any) => {
            const isDraft = q.status === "draft";
            return (
              <Card key={q.id} className="p-5 flex flex-col">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-rail/10 px-2 py-0.5 text-xs font-medium text-rail">{subjectLabel(q.subject)}</span>
                  <span className="rounded-md bg-amber/15 px-2 py-0.5 text-xs font-medium">{levelLabel(q.level)}</span>
                  {isStaff && (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${isDraft ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"}`}>
                      {isDraft ? "Brouillon" : `Publié · v${q.current_version}`}
                    </span>
                  )}
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold">{q.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{q.questions?.[0]?.count ?? 0} question(s)</p>

                <div className="mt-auto pt-4 flex flex-wrap gap-2">
                  {!isDraft && (
                    <Button asChild size="sm">
                      <Link to="/quiz/$id" params={{ id: q.id }}>
                        <Play className="h-4 w-4 mr-1" /> Démarrer
                      </Link>
                    </Button>
                  )}
                  {isStaff && (
                    <>
                      <Button
                        size="sm"
                        variant={isDraft ? "default" : "outline"}
                        onClick={() => publish.mutate(q.id)}
                        disabled={publish.isPending}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        {isDraft ? "Publier" : "Republier"}
                      </Button>
                      {q.current_version > 0 && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/quizzes/$id/versions" params={{ id: q.id }}>
                            <History className="h-4 w-4 mr-1" /> Historique
                          </Link>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditing(q); setForm({ title: q.title, subject: q.subject, level: q.level }); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={removeQuiz.isPending}
                        onClick={() => { if (confirm(`Supprimer « ${q.title} » et ses questions ?`)) removeQuiz.mutate(q.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le questionnaire</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titre</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Matière</Label>
              <Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{SUBJECTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Niveau</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
              <Button onClick={() => saveQuiz.mutate()} disabled={saveQuiz.isPending || !form.title}>Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>

  );
}
