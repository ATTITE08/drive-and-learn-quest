import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Send, CheckCircle2, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/incidents")({
  component: IncidentsPage,
  head: () => ({
    meta: [
      { title: "Rapports d'incident — Circuit hiérarchique" },
      { name: "description", content: "Rédigez un rapport d'incident, transmettez-le à votre chef hiérarchique et suivez son traitement jusqu'au chef du département conduite." },
      { property: "og:title", content: "Rapports d'incident — Circuit hiérarchique" },
      { property: "og:description", content: "Déclaration, traitement et remontée des incidents de conduite jusqu'au département." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SEVERITIES = [
  { value: "mineur", label: "Mineur" },
  { value: "significatif", label: "Significatif" },
  { value: "grave", label: "Grave" },
  { value: "critique", label: "Critique / sécurité" },
];

const STATUS_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  transmis: "Transmis",
  en_traitement: "En traitement",
  cloture: "Clôturé",
};

function IncidentsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    occurred_at: new Date().toISOString().slice(0, 16),
    location: "",
    train_number: "",
    severity: "mineur",
    description: "",
    measures: "",
  });
  const [comments, setComments] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "";
      const [{ data: me }, { data: reports }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,level,manager_id").eq("id", uid).maybeSingle(),
        supabase.from("incident_reports").select("*").order("created_at", { ascending: false }),
      ]);
      const ids = Array.from(new Set((reports ?? []).map((r: any) => r.author_id)));
      const { data: authors } = ids.length
        ? await supabase.from("profiles").select("id,full_name,email").in("id", ids)
        : { data: [] as any[] };
      const { data: actions } = await supabase
        .from("incident_actions")
        .select("*")
        .order("created_at", { ascending: true });
      return { uid, me, reports: reports ?? [], authors: authors ?? [], actions: actions ?? [] };
    },
  });

  const uid = data?.uid ?? "";
  const myManager = data?.me?.manager_id ?? null;
  const authorName = (id: string) => {
    const a = data?.authors.find((x: any) => x.id === id);
    return a?.full_name ?? a?.email ?? "Agent";
  };

  const create = useMutation({
    mutationFn: async (send: boolean) => {
      if (!form.title.trim()) throw new Error("Le titre est obligatoire");
      if (!form.description.trim()) throw new Error("La description est obligatoire");
      if (send && !myManager) throw new Error("Aucun chef hiérarchique n'est défini sur votre profil");
      const { data: row, error } = await supabase
        .from("incident_reports")
        .insert({
          author_id: uid,
          title: form.title.trim(),
          occurred_at: new Date(form.occurred_at).toISOString(),
          location: form.location,
          train_number: form.train_number || null,
          severity: form.severity,
          description: form.description,
          measures: form.measures || null,
          status: send ? "transmis" : "brouillon",
          current_holder_id: send ? myManager : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (send) {
        await supabase.from("incident_actions").insert({
          report_id: row.id,
          actor_id: uid,
          action: "transmission",
          forwarded_to: myManager,
          comment: "Rapport transmis au chef hiérarchique",
        });
      }
    },
    onSuccess: () => {
      toast.success("Rapport enregistré");
      setForm({ title: "", occurred_at: new Date().toISOString().slice(0, 16), location: "", train_number: "", severity: "mineur", description: "", measures: "" });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const submitDraft = useMutation({
    mutationFn: async (id: string) => {
      if (!myManager) throw new Error("Aucun chef hiérarchique défini sur votre profil");
      const { error } = await supabase
        .from("incident_reports")
        .update({ status: "transmis", current_holder_id: myManager })
        .eq("id", id);
      if (error) throw error;
      await supabase.from("incident_actions").insert({ report_id: id, actor_id: uid, action: "transmission", forwarded_to: myManager });
    },
    onSuccess: () => { toast.success("Rapport transmis"); qc.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const process = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: "escalade" | "cloture" }) => {
      const comment = comments[id]?.trim() || null;
      if (mode === "escalade") {
        if (!myManager) throw new Error("Vous êtes au sommet de la chaîne : clôturez le rapport");
        const { error } = await supabase
          .from("incident_reports")
          .update({ status: "en_traitement", current_holder_id: myManager })
          .eq("id", id);
        if (error) throw error;
        await supabase.from("incident_actions").insert({ report_id: id, actor_id: uid, action: "escalade", forwarded_to: myManager, comment });
      } else {
        const { error } = await supabase
          .from("incident_reports")
          .update({ status: "cloture", closed_at: new Date().toISOString(), current_holder_id: null })
          .eq("id", id);
        if (error) throw error;
        await supabase.from("incident_actions").insert({ report_id: id, actor_id: uid, action: "cloture", comment });
      }
      setComments((c) => ({ ...c, [id]: "" }));
    },
    onSuccess: () => { toast.success("Traitement enregistré"); qc.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const mine = (data?.reports ?? []).filter((r: any) => r.author_id === uid);
  const toHandle = (data?.reports ?? []).filter((r: any) => r.current_holder_id === uid && r.author_id !== uid);

  const ReportCard = ({ r, own }: { r: any; own: boolean }) => {
    const acts = (data?.actions ?? []).filter((a: any) => a.report_id === r.id);
    return (
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{r.title}</p>
          <Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge>
          <Badge variant="secondary">{SEVERITIES.find((s) => s.value === r.severity)?.label ?? r.severity}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(r.occurred_at).toLocaleString("fr-FR")} · {r.location || "Lieu non précisé"}
          {r.train_number ? ` · Train ${r.train_number}` : ""} · Rédigé par {authorName(r.author_id)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{r.description}</p>
        {r.measures && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">Mesures : {r.measures}</p>}

        {acts.length > 0 && (
          <ul className="mt-3 space-y-1 border-l pl-3 text-xs text-muted-foreground">
            {acts.map((a: any) => (
              <li key={a.id}>
                {new Date(a.created_at).toLocaleString("fr-FR")} — {a.action}
                {a.comment ? ` : ${a.comment}` : ""}
              </li>
            ))}
          </ul>
        )}

        {own && r.status === "brouillon" && (
          <Button size="sm" className="mt-3" onClick={() => submitDraft.mutate(r.id)}>
            <Send className="mr-1 h-4 w-4" /> Transmettre au chef hiérarchique
          </Button>
        )}

        {!own && r.current_holder_id === uid && r.status !== "cloture" && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder="Traitement / observations du chef hiérarchique"
              value={comments[r.id] ?? ""}
              onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => process.mutate({ id: r.id, mode: "escalade" })}>
                <ArrowUpRight className="mr-1 h-4 w-4" /> Traiter et transmettre au niveau supérieur
              </Button>
              <Button size="sm" variant="outline" onClick={() => process.mutate({ id: r.id, mode: "cloture" })}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Clôturer
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Rapports d'incident</h1>
        <p className="text-muted-foreground">
          Après tout incident, l'agent établit un rapport transmis à son chef hiérarchique, qui le traite puis le fait remonter jusqu'au chef du département conduite.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" /> Nouveau rapport
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Objet de l'incident</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex : Franchissement de signal fermé" maxLength={160} />
          </div>
          <div>
            <Label>Date et heure</Label>
            <Input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
          </div>
          <div>
            <Label>Lieu / PK / gare</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={160} />
          </div>
          <div>
            <Label>N° de train</Label>
            <Input value={form.train_number} onChange={(e) => setForm({ ...form, train_number: e.target.value })} maxLength={40} />
          </div>
          <div>
            <Label>Gravité</Label>
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Description des faits</Label>
            <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} />
          </div>
          <div className="sm:col-span-2">
            <Label>Mesures immédiates prises</Label>
            <Textarea rows={3} value={form.measures} onChange={(e) => setForm({ ...form, measures: e.target.value })} maxLength={2000} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => create.mutate(true)} disabled={create.isPending}>
            <Send className="mr-1 h-4 w-4" /> Transmettre au chef hiérarchique
          </Button>
          <Button variant="outline" onClick={() => create.mutate(false)} disabled={create.isPending}>
            Enregistrer en brouillon
          </Button>
        </div>
        {!myManager && <p className="mt-2 text-xs text-muted-foreground">Aucun chef hiérarchique n'est défini sur votre profil : contactez l'administrateur.</p>}
      </Card>

      {toHandle.length > 0 && (
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold">Rapports à traiter ({toHandle.length})</h2>
          <div className="mt-4 space-y-3">
            {toHandle.map((r: any) => <ReportCard key={r.id} r={r} own={false} />)}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Mes rapports</h2>
        {isLoading ? (
          <p className="mt-3 text-muted-foreground">Chargement…</p>
        ) : mine.length === 0 ? (
          <p className="mt-3 text-muted-foreground">Aucun rapport pour le moment.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {mine.map((r: any) => <ReportCard key={r.id} r={r} own />)}
          </div>
        )}
      </Card>
    </div>
  );
}
