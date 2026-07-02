import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useUserRole } from "@/hooks/useUserRole";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateQuizFromDocument } from "@/lib/quiz.functions";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LEVELS, SUBJECTS, levelLabel, subjectLabel } from "@/lib/constants";
import { toast } from "sonner";
import { Sparkles, Upload, FileText, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { data: roleData, isLoading } = useUserRole();
  if (isLoading) return <p>Chargement…</p>;
  if (roleData?.role !== "admin") {
    return (
      <Card className="p-8 text-center">
        <h2 className="font-display text-xl font-bold">Accès restreint</h2>
        <p className="text-muted-foreground mt-1">Seuls les administrateurs ont accès à cette page.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Administration</h1>
        <p className="text-muted-foreground">Gérez les documents pédagogiques, générez les questionnaires et les rôles.</p>
      </div>
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents"><FileText className="h-4 w-4 mr-1" /> Documents & Quiz</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" /> Utilisateurs</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="space-y-6 mt-6">
          <UploadDocCard />
          <DocumentsList />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersAdmin />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UploadDocCard() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !subject || !level) return toast.error("Renseignez le titre, la matière et le niveau.");
    if (!file || !/\.pdf$/i.test(file.name)) {
      return toast.error("Un fichier PDF est obligatoire pour générer un QCM.");
    }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const storagePath = `${u.user!.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(storagePath, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("documents").insert({
        title, subject: subject as any, level: level as any,
        storage_path: storagePath, content_text: null, uploaded_by: u.user!.id,
      });
      if (error) throw error;
      toast.success("PDF ajouté — cliquez sur « Générer un QCM » pour lancer l'IA.");
      setTitle(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2"><Upload className="h-5 w-5" /> Ajouter un document</h3>
      <p className="text-xs text-muted-foreground mt-1">
        Importez un <strong>PDF</strong> — l'IA générera automatiquement le questionnaire à partir de son contenu.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Titre</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Fiche freinage TER 2024" required />
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
        <div className="md:col-span-2">
          <Label>Fichier PDF source <span className="text-red-500">*</span></Label>
          <Input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          {file && <p className="text-xs text-muted-foreground mt-1">{file.name}</p>}
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? "Envoi…" : "Ajouter le document"}</Button>
        </div>
      </form>
    </Card>
  );
}

function DocumentsList() {
  const qc = useQueryClient();
  const generate = useServerFn(generateQuizFromDocument);
  const { data: docs, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id,title,subject,level,created_at,quizzes(id,title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const genMut = useMutation({
    mutationFn: (documentId: string) => generate({ data: { documentId, numQuestions: 8 } }),
    onSuccess: (r: any) => {
      toast.success(`Questionnaire créé (${r.count} questions)`);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["quizzes"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec de la génération"),
  });

  const del = async (id: string) => {
    if (!confirm("Supprimer ce document ?")) return;
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Supprimé"); qc.invalidateQueries({ queryKey: ["documents"] }); }
  };

  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">Documents</h3>
      {isLoading ? <p className="text-muted-foreground mt-3">Chargement…</p> : !docs?.length ? (
        <p className="text-muted-foreground mt-3">Aucun document.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {docs.map((d: any) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <FileText className="h-5 w-5 text-rail" />
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {subjectLabel(d.subject)} · {levelLabel(d.level)} · {d.quizzes?.length ?? 0} quiz généré(s)
                </p>
              </div>
              <Button size="sm" onClick={() => genMut.mutate(d.id)} disabled={genMut.isPending}>
                <Sparkles className="h-4 w-4 mr-1" /> {genMut.isPending ? "Génération…" : "Générer un QCM"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => del(d.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function UsersAdmin() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,level"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return (profiles ?? []).map((p: any) => ({
        ...p,
        roles: (roles ?? []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
      }));
    },
  });

  const setRole = async (userId: string, role: string) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    if (error) toast.error(error.message);
    else { toast.success("Rôle mis à jour"); qc.invalidateQueries({ queryKey: ["all-users"] }); }
  };

  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">Utilisateurs et rôles</h3>
      {isLoading ? <p className="text-muted-foreground mt-3">Chargement…</p> : !users?.length ? (
        <p className="text-muted-foreground mt-3">Aucun utilisateur.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {users.map((u: any) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium">{u.full_name ?? u.email}</p>
                <p className="text-xs text-muted-foreground">{u.email} {u.level && `· ${levelLabel(u.level)}`}</p>
              </div>
              <Select value={u.roles[0] ?? "agent"} onValueChange={(v) => setRole(u.id, v)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="formateur">Formateur</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
