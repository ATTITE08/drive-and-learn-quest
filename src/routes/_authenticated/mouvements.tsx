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
import { toast } from "sonner";
import { Plus, Send, Trash2, CheckCircle2, XCircle, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mouvements")({
  component: MovementsPage,
  head: () => ({
    meta: [
      { title: "Relevé de mouvement du personnel — Indemnités" },
      { name: "description", content: "Saisissez vos travaux et parcours effectués, transmettez le relevé au chef de traction pour vérification, correction ou validation avant paiement des indemnités." },
      { property: "og:title", content: "Relevé de mouvement du personnel — Indemnités" },
      { property: "og:description", content: "Circuit de validation des relevés de mouvement avant inscription en paye." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS: Record<string, { label: string; variant?: "default" | "secondary" | "outline" | "destructive" }> = {
  brouillon: { label: "Brouillon", variant: "outline" },
  soumis: { label: "Soumis au chef de traction", variant: "secondary" },
  rejete: { label: "Rejeté — à corriger", variant: "destructive" },
  valide: { label: "Validé", variant: "default" },
  paye: { label: "Transmis à la paye", variant: "default" },
};

const emptyLine = () => ({
  work_date: new Date().toISOString().slice(0, 10),
  service_type: "conduite",
  train_number: "",
  departure: "",
  arrival: "",
  start_time: "",
  end_time: "",
  distance_km: "",
  hours: "",
  allowance_code: "",
  notes: "",
});

function MovementsPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [line, setLine] = useState(emptyLine());
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "";
      const [{ data: me }, { data: records }] = await Promise.all([
        supabase.from("profiles").select("id,manager_id").eq("id", uid).maybeSingle(),
        supabase.from("movement_records").select("*").order("period_start", { ascending: false }),
      ]);
      const recIds = (records ?? []).map((r: any) => r.id);
      const { data: lines } = recIds.length
        ? await supabase.from("movement_lines").select("*").in("record_id", recIds).order("work_date")
        : { data: [] as any[] };
      const agentIds = Array.from(new Set((records ?? []).map((r: any) => r.agent_id)));
      const { data: agents } = agentIds.length
        ? await supabase.from("profiles").select("id,full_name,email,matricule").in("id", agentIds)
        : { data: [] as any[] };
      return { uid, me, records: records ?? [], lines: lines ?? [], agents: agents ?? [] };
    },
  });

  const uid = data?.uid ?? "";
  const myManager = data?.me?.manager_id ?? null;
  const agentName = (id: string) => {
    const a = data?.agents.find((x: any) => x.id === id);
    return a?.full_name ?? a?.email ?? "Agent";
  };
  const linesOf = (id: string) => (data?.lines ?? []).filter((l: any) => l.record_id === id);
  const totals = (id: string) => {
    const l = linesOf(id);
    return {
      km: l.reduce((s: number, x: any) => s + Number(x.distance_km || 0), 0),
      h: l.reduce((s: number, x: any) => s + Number(x.hours || 0), 0),
    };
  };

  const createRecord = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("movement_records").insert({
        agent_id: uid,
        period_start: period.start,
        period_end: period.end,
        reviewer_id: myManager,
        status: "brouillon",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Relevé créé"); qc.invalidateQueries({ queryKey: ["movements"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const addLine = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase.from("movement_lines").insert({
        record_id: recordId,
        work_date: line.work_date,
        service_type: line.service_type,
        train_number: line.train_number || null,
        departure: line.departure || null,
        arrival: line.arrival || null,
        start_time: line.start_time || null,
        end_time: line.end_time || null,
        distance_km: Number(line.distance_km || 0),
        hours: Number(line.hours || 0),
        allowance_code: line.allowance_code || null,
        notes: line.notes || null,
      });
      if (error) throw error;
      setLine(emptyLine());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["movements"] }),
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("movement_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["movements"] }),
  });

  const submit = useMutation({
    mutationFn: async (id: string) => {
      if (!myManager) throw new Error("Aucun chef de traction n'est défini sur votre profil");
      const { error } = await supabase
        .from("movement_records")
        .update({ status: "soumis", reviewer_id: myManager, submitted_at: new Date().toISOString(), review_comment: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Relevé envoyé au chef de traction"); qc.invalidateQueries({ queryKey: ["movements"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const comment = reviewNotes[id]?.trim() || null;
      if (!approve && !comment) throw new Error("Indiquez le motif du rejet");
      const patch = approve
        ? { status: "valide", validated_at: new Date().toISOString(), payroll_exported_at: new Date().toISOString(), review_comment: comment }
        : { status: "rejete", review_comment: comment };
      const { error } = await supabase.from("movement_records").update(patch).eq("id", id);
      if (error) throw error;
      setReviewNotes((c) => ({ ...c, [id]: "" }));
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Relevé validé et inscrit en paye" : "Relevé rejeté, l'agent peut le corriger");
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const mine = (data?.records ?? []).filter((r: any) => r.agent_id === uid);
  const toReview = (data?.records ?? []).filter((r: any) => r.agent_id !== uid);

  const LinesTable = ({ id, editable }: { id: string; editable: boolean }) => {
    const l = linesOf(id);
    if (!l.length) return <p className="mt-2 text-sm text-muted-foreground">Aucun mouvement saisi.</p>;
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-1 pr-3">Date</th>
              <th className="py-1 pr-3">Nature</th>
              <th className="py-1 pr-3">Train</th>
              <th className="py-1 pr-3">Parcours</th>
              <th className="py-1 pr-3">Horaires</th>
              <th className="py-1 pr-3">Km</th>
              <th className="py-1 pr-3">Heures</th>
              <th className="py-1 pr-3">Indemnité</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {l.map((x: any) => (
              <tr key={x.id} className="border-t">
                <td className="py-1 pr-3">{x.work_date}</td>
                <td className="py-1 pr-3">{x.service_type}</td>
                <td className="py-1 pr-3">{x.train_number ?? "—"}</td>
                <td className="py-1 pr-3">{[x.departure, x.arrival].filter(Boolean).join(" → ") || "—"}</td>
                <td className="py-1 pr-3">{[x.start_time, x.end_time].filter(Boolean).join(" - ") || "—"}</td>
                <td className="py-1 pr-3">{Number(x.distance_km)}</td>
                <td className="py-1 pr-3">{Number(x.hours)}</td>
                <td className="py-1 pr-3">{x.allowance_code ?? "—"}</td>
                {editable && (
                  <td className="py-1">
                    <Button variant="ghost" size="sm" onClick={() => deleteLine.mutate(x.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Relevé de mouvement du personnel</h1>
        <p className="text-muted-foreground">
          Saisissez tous les travaux et parcours effectués. Une fois rempli, envoyez le relevé au chef de traction : il vérifie, corrige ou rejette. Après validation, le contenu est inscrit au logiciel de paye.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Nouveau relevé</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <Label>Début de période</Label>
            <Input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} />
          </div>
          <div>
            <Label>Fin de période</Label>
            <Input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} />
          </div>
          <Button onClick={() => createRecord.mutate()} disabled={createRecord.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Créer le relevé
          </Button>
        </div>
      </Card>

      {toReview.length > 0 && (
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold">Relevés de mon équipe ({toReview.length})</h2>
          <div className="mt-4 space-y-4">
            {toReview.map((r: any) => (
              <div key={r.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{agentName(r.agent_id)}</p>
                  <Badge variant={STATUS[r.status]?.variant ?? "outline"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                  <span className="text-xs text-muted-foreground">{r.period_start} → {r.period_end}</span>
                </div>
                <LinesTable id={r.id} editable={false} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Total : {totals(r.id).km} km · {totals(r.id).h} h
                </p>
                {r.status === "soumis" && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      placeholder="Observations / motif de rejet"
                      value={reviewNotes[r.id] ?? ""}
                      onChange={(e) => setReviewNotes((c) => ({ ...c, [r.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => review.mutate({ id: r.id, approve: true })}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Valider et transmettre à la paye
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, approve: false })}>
                        <XCircle className="mr-1 h-4 w-4" /> Rejeter pour correction
                      </Button>
                    </div>
                  </div>
                )}
                {r.review_comment && <p className="mt-2 text-xs text-muted-foreground">Observation : {r.review_comment}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Mes relevés</h2>
        {isLoading ? (
          <p className="mt-3 text-muted-foreground">Chargement…</p>
        ) : mine.length === 0 ? (
          <p className="mt-3 text-muted-foreground">Aucun relevé pour le moment.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {mine.map((r: any) => {
              const editable = r.status === "brouillon" || r.status === "rejete";
              return (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">Période {r.period_start} → {r.period_end}</p>
                    <Badge variant={STATUS[r.status]?.variant ?? "outline"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                    {r.payroll_exported_at && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Wallet className="h-3 w-3" /> Inscrit en paye le {new Date(r.payroll_exported_at).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                  {r.review_comment && <p className="mt-1 text-xs text-muted-foreground">Retour du chef de traction : {r.review_comment}</p>}
                  <LinesTable id={r.id} editable={editable} />
                  <p className="mt-2 text-xs text-muted-foreground">Total : {totals(r.id).km} km · {totals(r.id).h} h</p>

                  {editable && (
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                        <Plus className="mr-1 h-4 w-4" /> Ajouter un mouvement
                      </Button>
                      {openId === r.id && (
                        <div className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                          <div><Label>Date</Label><Input type="date" value={line.work_date} onChange={(e) => setLine({ ...line, work_date: e.target.value })} /></div>
                          <div><Label>Nature du travail</Label><Input value={line.service_type} onChange={(e) => setLine({ ...line, service_type: e.target.value })} placeholder="conduite, manœuvre, réserve…" /></div>
                          <div><Label>N° de train</Label><Input value={line.train_number} onChange={(e) => setLine({ ...line, train_number: e.target.value })} /></div>
                          <div><Label>Départ</Label><Input value={line.departure} onChange={(e) => setLine({ ...line, departure: e.target.value })} /></div>
                          <div><Label>Arrivée</Label><Input value={line.arrival} onChange={(e) => setLine({ ...line, arrival: e.target.value })} /></div>
                          <div><Label>Indemnité</Label><Input value={line.allowance_code} onChange={(e) => setLine({ ...line, allowance_code: e.target.value })} placeholder="Code indemnité" /></div>
                          <div><Label>Heure début</Label><Input type="time" value={line.start_time} onChange={(e) => setLine({ ...line, start_time: e.target.value })} /></div>
                          <div><Label>Heure fin</Label><Input type="time" value={line.end_time} onChange={(e) => setLine({ ...line, end_time: e.target.value })} /></div>
                          <div><Label>Distance (km)</Label><Input type="number" min="0" value={line.distance_km} onChange={(e) => setLine({ ...line, distance_km: e.target.value })} /></div>
                          <div><Label>Heures</Label><Input type="number" min="0" step="0.5" value={line.hours} onChange={(e) => setLine({ ...line, hours: e.target.value })} /></div>
                          <div className="sm:col-span-2"><Label>Observations</Label><Input value={line.notes} onChange={(e) => setLine({ ...line, notes: e.target.value })} /></div>
                          <div className="sm:col-span-3">
                            <Button size="sm" onClick={() => addLine.mutate(r.id)} disabled={addLine.isPending}>Enregistrer la ligne</Button>
                          </div>
                        </div>
                      )}
                      <Button size="sm" className="mt-3 ml-0 sm:ml-2" onClick={() => submit.mutate(r.id)}>
                        <Send className="mr-1 h-4 w-4" /> Envoyer au chef de traction
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
