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
      { title: "Rapport d'incident — Conduite CAMRAIL" },
      { name: "description", content: "Rapport d'incident conforme : identification de l'équipe de conduite et du train, exposé des faits, mesures prises, analyse du CTRA et observations du CDPC." },
      { property: "og:title", content: "Rapport d'incident — Conduite CAMRAIL" },
      { property: "og:description", content: "Déclaration, analyse et remontée des incidents de conduite jusqu'au département." },
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

const emptyReport = () => ({
  conducteur: "",
  mle_conducteur: "",
  depot_conducteur: "",
  aide_conducteur: "",
  mle_aide: "",
  depot_aide: "",
  autre: "",
  mle_autre: "",
  depot_autre: "",
  train: "",
  date_train: "",
  locomotives: "",
  tonnage: "",
  nb_wagons: "",
  cantons: "",
  pk: "",
  precisions: "",
  operations: "",
  pages_guide: "",
  h_demande_secours: "",
  h_annulation_secours: "",
  h_arrivee_secours: "",
  h_depart_pk: "",
});

const emptyAnalysis = () => ({
  ctra_resultat: "",
  ctra_consequences: "",
  ctra_examen: "",
  ctra_conclusion: "",
  ctra_propositions: "",
  cdpc_observations: "",
  autres_observations: "",
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label} : </span>
      <span className="whitespace-pre-wrap">{value}</span>
    </p>
  );
}

function IncidentsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    occurred_at: new Date().toISOString().slice(0, 16),
    severity: "mineur",
    description: "",
  });
  const [rd, setRd] = useState(emptyReport());
  const [an, setAn] = useState<Record<string, ReturnType<typeof emptyAnalysis>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "";
      const [{ data: me }, { data: reports }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,level,manager_id,matricule").eq("id", uid).maybeSingle(),
        supabase.from("incident_reports").select("*").order("created_at", { ascending: false }),
      ]);
      const ids = Array.from(new Set((reports ?? []).map((r: any) => r.author_id)));
      const { data: authors } = ids.length
        ? await supabase.from("profiles").select("id,full_name,email").in("id", ids)
        : { data: [] as any[] };
      const { data: actions } = await supabase.from("incident_actions").select("*").order("created_at", { ascending: true });
      return { uid, me, reports: reports ?? [], authors: authors ?? [], actions: actions ?? [] };
    },
  });

  const uid = data?.uid ?? "";
  const myManager = data?.me?.manager_id ?? null;
  const authorName = (id: string) => {
    const a = data?.authors.find((x: any) => x.id === id);
    return a?.full_name ?? a?.email ?? "Agent";
  };
  const getAn = (id: string, current: any) => an[id] ?? { ...emptyAnalysis(), ...(current ?? {}) };

  const create = useMutation({
    mutationFn: async (send: boolean) => {
      if (!form.title.trim()) throw new Error("Indiquez la nature de l'incident");
      if (!form.description.trim()) throw new Error("L'exposé des faits est obligatoire");
      if (send && !myManager) throw new Error("Aucun chef hiérarchique n'est défini sur votre profil");
      const { data: row, error } = await supabase
        .from("incident_reports")
        .insert({
          author_id: uid,
          title: form.title.trim(),
          occurred_at: new Date(form.occurred_at).toISOString(),
          location: [rd.cantons, rd.pk && `PK ${rd.pk}`].filter(Boolean).join(" — "),
          train_number: rd.train || null,
          severity: form.severity,
          description: form.description,
          measures: rd.operations || null,
          report_data: rd,
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
      setForm({ title: "", occurred_at: new Date().toISOString().slice(0, 16), severity: "mineur", description: "" });
      setRd(emptyReport());
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const submitDraft = useMutation({
    mutationFn: async (id: string) => {
      if (!myManager) throw new Error("Aucun chef hiérarchique défini sur votre profil");
      const { error } = await supabase.from("incident_reports").update({ status: "transmis", current_holder_id: myManager }).eq("id", id);
      if (error) throw error;
      await supabase.from("incident_actions").insert({ report_id: id, actor_id: uid, action: "transmission", forwarded_to: myManager });
    },
    onSuccess: () => { toast.success("Rapport transmis"); qc.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const process = useMutation({
    mutationFn: async ({ id, mode, current }: { id: string; mode: "escalade" | "cloture" | "save"; current: any }) => {
      const analysis = getAn(id, current);
      const patch: any = { analysis };
      if (mode === "escalade") {
        if (!myManager) throw new Error("Vous êtes au sommet de la chaîne : clôturez le rapport");
        patch.status = "en_traitement";
        patch.current_holder_id = myManager;
      } else if (mode === "cloture") {
        patch.status = "cloture";
        patch.closed_at = new Date().toISOString();
        patch.current_holder_id = null;
      }
      const { error } = await supabase.from("incident_reports").update(patch).eq("id", id);
      if (error) throw error;
      if (mode !== "save") {
        await supabase.from("incident_actions").insert({
          report_id: id,
          actor_id: uid,
          action: mode,
          forwarded_to: mode === "escalade" ? myManager : null,
          comment: analysis.ctra_conclusion || analysis.cdpc_observations || null,
        });
      }
    },
    onSuccess: () => { toast.success("Analyse enregistrée"); qc.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const mine = (data?.reports ?? []).filter((r: any) => r.author_id === uid);
  const toHandle = (data?.reports ?? []).filter((r: any) => r.current_holder_id === uid && r.author_id !== uid);

  const ReportCard = ({ r, own }: { r: any; own: boolean }) => {
    const acts = (data?.actions ?? []).filter((a: any) => a.report_id === r.id);
    const d = (r.report_data ?? {}) as any;
    const a = (r.analysis ?? {}) as any;
    const canHandle = !own && r.current_holder_id === uid && r.status !== "cloture";
    const form = getAn(r.id, a);
    const setField = (k: string, v: string) => setAn((s) => ({ ...s, [r.id]: { ...form, [k]: v } }));
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

        <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">A — Rapport du conducteur</p>
          <Line label="Conducteur" value={[d.conducteur, d.mle_conducteur && `Mle ${d.mle_conducteur}`, d.depot_conducteur].filter(Boolean).join(" · ")} />
          <Line label="Aide-conducteur" value={[d.aide_conducteur, d.mle_aide && `Mle ${d.mle_aide}`, d.depot_aide].filter(Boolean).join(" · ")} />
          <Line label="Autre" value={[d.autre, d.mle_autre && `Mle ${d.mle_autre}`, d.depot_autre].filter(Boolean).join(" · ")} />
          <Line label="Train" value={[d.train, d.date_train, d.locomotives, d.tonnage && `${d.tonnage}`, d.nb_wagons && `${d.nb_wagons} wagons`].filter(Boolean).join(" · ")} />
          <Line label="Cantons / PK" value={[d.cantons, d.pk && `PK ${d.pk}`].filter(Boolean).join(" · ")} />
          <Line label="Précisions supplémentaires" value={d.precisions} />
        </div>

        <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">IV — Exposé des faits</p>
        <p className="whitespace-pre-wrap text-sm">{r.description}</p>

        {(d.operations || d.pages_guide || d.h_demande_secours || d.h_arrivee_secours) && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">V — Mesures prises</p>
            <Line label="Opérations effectuées" value={d.operations} />
            <Line label="Pages du guide de dépannage / livret consultées" value={d.pages_guide} />
            <Line label="Demande de secours" value={d.h_demande_secours} />
            <Line label="Annulation du secours" value={d.h_annulation_secours} />
            <Line label="Arrivée du secours" value={d.h_arrivee_secours} />
            <Line label="Départ du PK" value={d.h_depart_pk} />
          </>
        )}

        {(a.ctra_resultat || a.ctra_conclusion || a.cdpc_observations) && (
          <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">B — Analyse du CTRA</p>
            <Line label="Résultat de l'enquête" value={a.ctra_resultat} />
            <Line label="Conséquences de l'incident" value={a.ctra_consequences} />
            <Line label="Examen critique" value={a.ctra_examen} />
            <Line label="Conclusion" value={a.ctra_conclusion} />
            <Line label="Propositions / recommandations" value={a.ctra_propositions} />
            <Line label="C — Observations du CDPC" value={a.cdpc_observations} />
            <Line label="D — Autres observations" value={a.autres_observations} />
          </div>
        )}

        {acts.length > 0 && (
          <ul className="mt-3 space-y-1 border-l pl-3 text-xs text-muted-foreground">
            {acts.map((x: any) => (
              <li key={x.id}>
                {new Date(x.created_at).toLocaleString("fr-FR")} — {x.action}
                {x.comment ? ` : ${x.comment}` : ""}
              </li>
            ))}
          </ul>
        )}

        {own && r.status === "brouillon" && (
          <Button size="sm" className="mt-3" onClick={() => submitDraft.mutate(r.id)}>
            <Send className="mr-1 h-4 w-4" /> Transmettre au chef hiérarchique
          </Button>
        )}

        {canHandle && (
          <div className="mt-4 space-y-3 rounded-lg border p-3">
            <p className="text-sm font-semibold">B — Analyse du CTRA</p>
            <Field label="1 - Résultat de l'enquête">
              <Textarea rows={3} value={form.ctra_resultat} onChange={(e) => setField("ctra_resultat", e.target.value)} maxLength={4000} />
            </Field>
            <Field label="2 - Conséquences de l'incident (humaine, technique, circulation, commercial)">
              <Textarea rows={3} value={form.ctra_consequences} onChange={(e) => setField("ctra_consequences", e.target.value)} maxLength={4000} />
            </Field>
            <Field label="3 - Examen critique (déclarations, faits, causes humaines ou techniques)">
              <Textarea rows={3} value={form.ctra_examen} onChange={(e) => setField("ctra_examen", e.target.value)} maxLength={4000} />
            </Field>
            <Field label="4 - Conclusion">
              <Textarea rows={2} value={form.ctra_conclusion} onChange={(e) => setField("ctra_conclusion", e.target.value)} maxLength={4000} />
            </Field>
            <Field label="5 - Propositions / recommandations">
              <Textarea rows={2} value={form.ctra_propositions} onChange={(e) => setField("ctra_propositions", e.target.value)} maxLength={4000} />
            </Field>
            <Field label="C - Observations du CDPC">
              <Textarea rows={2} value={form.cdpc_observations} onChange={(e) => setField("cdpc_observations", e.target.value)} maxLength={4000} />
            </Field>
            <Field label="D - Autres observations">
              <Textarea rows={2} value={form.autres_observations} onChange={(e) => setField("autres_observations", e.target.value)} maxLength={4000} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => process.mutate({ id: r.id, mode: "save", current: a })}>
                Enregistrer l'analyse
              </Button>
              <Button size="sm" onClick={() => process.mutate({ id: r.id, mode: "escalade", current: a })}>
                <ArrowUpRight className="mr-1 h-4 w-4" /> Transmettre au niveau supérieur
              </Button>
              <Button size="sm" variant="outline" onClick={() => process.mutate({ id: r.id, mode: "cloture", current: a })}>
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
        <h1 className="font-display text-2xl font-bold">Rapport d'incident</h1>
        <p className="text-muted-foreground">
          Direction transport — gestion personnel conduite. L'agent établit le rapport du conducteur, le chef de traction rédige l'analyse, puis le rapport remonte jusqu'au chef du département conduite.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" /> A — Rapport du conducteur
        </h2>

        <p className="mt-4 text-sm font-semibold">I — Identification de l'équipe de conduite</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Conducteur"><Input value={rd.conducteur} onChange={(e) => setRd({ ...rd, conducteur: e.target.value })} maxLength={120} /></Field>
          <Field label="Matricule"><Input value={rd.mle_conducteur} onChange={(e) => setRd({ ...rd, mle_conducteur: e.target.value })} maxLength={40} /></Field>
          <Field label="Dépôt"><Input value={rd.depot_conducteur} onChange={(e) => setRd({ ...rd, depot_conducteur: e.target.value })} maxLength={60} /></Field>
          <Field label="Aide-conducteur"><Input value={rd.aide_conducteur} onChange={(e) => setRd({ ...rd, aide_conducteur: e.target.value })} maxLength={120} /></Field>
          <Field label="Matricule"><Input value={rd.mle_aide} onChange={(e) => setRd({ ...rd, mle_aide: e.target.value })} maxLength={40} /></Field>
          <Field label="Dépôt"><Input value={rd.depot_aide} onChange={(e) => setRd({ ...rd, depot_aide: e.target.value })} maxLength={60} /></Field>
          <Field label="Autre"><Input value={rd.autre} onChange={(e) => setRd({ ...rd, autre: e.target.value })} maxLength={120} /></Field>
          <Field label="Matricule"><Input value={rd.mle_autre} onChange={(e) => setRd({ ...rd, mle_autre: e.target.value })} maxLength={40} /></Field>
          <Field label="Dépôt"><Input value={rd.depot_autre} onChange={(e) => setRd({ ...rd, depot_autre: e.target.value })} maxLength={60} /></Field>
        </div>

        <p className="mt-5 text-sm font-semibold">II — Identification du train</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Train n°"><Input value={rd.train} onChange={(e) => setRd({ ...rd, train: e.target.value })} maxLength={40} /></Field>
          <Field label="Du (date)"><Input type="date" value={rd.date_train} onChange={(e) => setRd({ ...rd, date_train: e.target.value })} /></Field>
          <Field label="Locomotives"><Input value={rd.locomotives} onChange={(e) => setRd({ ...rd, locomotives: e.target.value })} maxLength={80} /></Field>
          <Field label="Tonnage"><Input value={rd.tonnage} onChange={(e) => setRd({ ...rd, tonnage: e.target.value })} maxLength={40} /></Field>
          <Field label="Nombre de wagons"><Input value={rd.nb_wagons} onChange={(e) => setRd({ ...rd, nb_wagons: e.target.value })} maxLength={40} /></Field>
        </div>

        <p className="mt-5 text-sm font-semibold">III — Information sur l'incident</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Cantons"><Input value={rd.cantons} onChange={(e) => setRd({ ...rd, cantons: e.target.value })} maxLength={160} /></Field>
          <Field label="PK"><Input value={rd.pk} onChange={(e) => setRd({ ...rd, pk: e.target.value })} maxLength={40} /></Field>
          <Field label="Date et heure"><Input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Précisions supplémentaires"><Input value={rd.precisions} onChange={(e) => setRd({ ...rd, precisions: e.target.value })} maxLength={300} /></Field>
          </div>
          <Field label="Gravité">
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-3">
            <Field label="Nature de l'incident">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex : Dysfonctionnement de la radio sol-train" maxLength={200} />
            </Field>
          </div>
        </div>

        <p className="mt-5 text-sm font-semibold">IV — Exposé des faits</p>
        <Textarea className="mt-2" rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} />

        <p className="mt-5 text-sm font-semibold">V — Mesures prises</p>
        <div className="mt-2 space-y-3">
          <Field label="1. Opérations effectuées">
            <Textarea rows={4} value={rd.operations} onChange={(e) => setRd({ ...rd, operations: e.target.value })} maxLength={2000} />
          </Field>
          <Field label="2. Pages du guide de dépannage / livret d'étude consultées">
            <Input value={rd.pages_guide} onChange={(e) => setRd({ ...rd, pages_guide: e.target.value })} maxLength={200} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="3. Heure de demande secours"><Input type="time" value={rd.h_demande_secours} onChange={(e) => setRd({ ...rd, h_demande_secours: e.target.value })} /></Field>
            <Field label="Heure annulation secours"><Input type="time" value={rd.h_annulation_secours} onChange={(e) => setRd({ ...rd, h_annulation_secours: e.target.value })} /></Field>
            <Field label="4. Heure d'arrivée du secours"><Input type="time" value={rd.h_arrivee_secours} onChange={(e) => setRd({ ...rd, h_arrivee_secours: e.target.value })} /></Field>
            <Field label="Heure de départ du PK"><Input type="time" value={rd.h_depart_pk} onChange={(e) => setRd({ ...rd, h_depart_pk: e.target.value })} /></Field>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
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
