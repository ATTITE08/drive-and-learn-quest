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
import { Plus, Send, Trash2, CheckCircle2, XCircle, Wallet, Printer, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mouvements")({
  component: MovementsPage,
  head: () => ({
    meta: [
      { title: "Relevé de mouvement du personnel — Indemnités" },
      { name: "description", content: "Remplissez le relevé de mouvement du personnel, faites-le valider par le chef de traction et imprimez la version papier conforme au formulaire officiel." },
      { property: "og:title", content: "Relevé de mouvement du personnel — Indemnités" },
      { property: "og:description", content: "Version enregistrable avec validation du chef de traction et version imprimable du relevé de mouvement." },
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
  engin: "",
  decouche: false,
  repas: "",
  prise_service: "",
  fin_service: "",
});

type HeaderData = {
  depot?: string;
  mois?: string;
  nom?: string;
  matricule?: string;
  grade?: string;
  residence?: string;
  categorie?: string;
};

function MovementsPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [line, setLine] = useState(emptyLine());
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<Record<string, HeaderData>>({});
  const [printId, setPrintId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "";
      const [{ data: me }, { data: records }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("movement_records").select("*").order("period_start", { ascending: false }),
      ]);
      const recIds = (records ?? []).map((r: any) => r.id);
      const { data: lines } = recIds.length
        ? await supabase.from("movement_lines").select("*").in("record_id", recIds).order("work_date")
        : { data: [] as any[] };
      const agentIds = Array.from(new Set((records ?? []).map((r: any) => r.agent_id)));
      const { data: agents } = agentIds.length
        ? await supabase.from("profiles").select("id,full_name,email,matricule,level").in("id", agentIds)
        : { data: [] as any[] };
      return { uid, me, records: records ?? [], lines: lines ?? [], agents: agents ?? [] };
    },
  });

  const uid = data?.uid ?? "";
  const myManager = data?.me?.manager_id ?? null;
  const agentOf = (id: string) => data?.agents.find((x: any) => x.id === id);
  const agentName = (id: string) => {
    const a = agentOf(id);
    return a?.full_name ?? a?.email ?? "Agent";
  };
  const linesOf = (id: string) => (data?.lines ?? []).filter((l: any) => l.record_id === id);
  const totals = (id: string) => {
    const l = linesOf(id);
    return {
      km: l.reduce((s: number, x: any) => s + Number(x.distance_km || 0), 0),
      h: l.reduce((s: number, x: any) => s + Number(x.hours || 0), 0),
      nuits: l.filter((x: any) => x.details?.decouche).length,
      repas: l.reduce((s: number, x: any) => s + Number(x.details?.repas || 0), 0),
    };
  };
  const headerOf = (r: any): HeaderData => headers[r.id] ?? (r.header as HeaderData) ?? {};
  const setHeaderField = (r: any, k: keyof HeaderData, v: string) =>
    setHeaders((c) => ({ ...c, [r.id]: { ...headerOf(r), [k]: v } }));

  const createRecord = useMutation({
    mutationFn: async () => {
      const me: any = data?.me;
      const { error } = await supabase.from("movement_records").insert({
        agent_id: uid,
        period_start: period.start,
        period_end: period.end,
        reviewer_id: myManager,
        status: "brouillon",
        header: {
          nom: me?.full_name ?? "",
          matricule: me?.matricule ?? "",
          grade: me?.level ?? "",
          mois: new Date(period.start).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Relevé créé"); qc.invalidateQueries({ queryKey: ["movements"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const saveHeader = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await supabase.from("movement_records").update({ header: headerOf(r) as any }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("En-tête enregistré"); qc.invalidateQueries({ queryKey: ["movements"] }); },
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
        details: {
          engin: line.engin || null,
          decouche: line.decouche,
          repas: Number(line.repas || 0),
          prise_service: line.prise_service || null,
          fin_service: line.fin_service || null,
        } as any,
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
    mutationFn: async (r: any) => {
      if (!myManager) throw new Error("Aucun chef de traction n'est défini sur votre profil");
      const { error } = await supabase
        .from("movement_records")
        .update({
          status: "soumis",
          reviewer_id: myManager,
          submitted_at: new Date().toISOString(),
          review_comment: null,
          header: headerOf(r) as any,
          visas: { ...(r.visas ?? {}), agent: { nom: headerOf(r).nom ?? "", date: new Date().toISOString().slice(0, 10) } } as any,
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Relevé envoyé au chef de traction"); qc.invalidateQueries({ queryKey: ["movements"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const comment = reviewNotes[id]?.trim() || null;
      if (!approve && !comment) throw new Error("Indiquez le motif du rejet");
      const rec: any = (data?.records ?? []).find((x: any) => x.id === id);
      const patch: any = approve
        ? {
            status: "valide",
            validated_at: new Date().toISOString(),
            payroll_exported_at: new Date().toISOString(),
            review_comment: comment,
            visas: { ...(rec?.visas ?? {}), ctra: { nom: data?.me?.full_name ?? "", date: new Date().toISOString().slice(0, 10), observation: comment } },
          }
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

  const doPrint = (id: string) => {
    setPrintId(id);
    setTimeout(() => window.print(), 120);
  };

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
              <th className="py-1 pr-3">Engin</th>
              <th className="py-1 pr-3">Parcours</th>
              <th className="py-1 pr-3">Horaires</th>
              <th className="py-1 pr-3">Km</th>
              <th className="py-1 pr-3">Heures</th>
              <th className="py-1 pr-3">Découcher</th>
              <th className="py-1 pr-3">Repas</th>
              <th className="py-1 pr-3">Code</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {l.map((x: any) => (
              <tr key={x.id} className="border-t">
                <td className="py-1 pr-3">{x.work_date}</td>
                <td className="py-1 pr-3">{x.service_type}</td>
                <td className="py-1 pr-3">{x.train_number ?? "—"}</td>
                <td className="py-1 pr-3">{x.details?.engin ?? "—"}</td>
                <td className="py-1 pr-3">{[x.departure, x.arrival].filter(Boolean).join(" → ") || "—"}</td>
                <td className="py-1 pr-3">{[x.start_time, x.end_time].filter(Boolean).join(" - ") || "—"}</td>
                <td className="py-1 pr-3">{Number(x.distance_km)}</td>
                <td className="py-1 pr-3">{Number(x.hours)}</td>
                <td className="py-1 pr-3">{x.details?.decouche ? "Oui" : "—"}</td>
                <td className="py-1 pr-3">{Number(x.details?.repas || 0) || "—"}</td>
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

  const printRecord: any = printId ? (data?.records ?? []).find((r: any) => r.id === printId) : null;

  return (
    <>
      <div className="space-y-6 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold">Relevé de mouvement du personnel</h1>
          <p className="text-muted-foreground">
            Version enregistrable : remplissez l'en-tête et le détail des parcours, puis transmettez au chef de traction qui vérifie, rejette ou valide pour la paye. Version imprimable : générez le relevé au format papier officiel (PDF via l'impression).
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
                    <Button variant="outline" size="sm" className="ml-auto" onClick={() => doPrint(r.id)}>
                      <Printer className="mr-1 h-4 w-4" /> Imprimer / PDF
                    </Button>
                  </div>
                  <LinesTable id={r.id} editable={false} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Total : {totals(r.id).km} km · {totals(r.id).h} h · {totals(r.id).nuits} découcher(s) · {totals(r.id).repas} repas
                  </p>
                  {r.status === "soumis" && (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder="Observations du chef de traction / motif de rejet"
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
                const h = headerOf(r);
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
                      <Button variant="outline" size="sm" className="ml-auto" onClick={() => doPrint(r.id)}>
                        <Printer className="mr-1 h-4 w-4" /> Imprimer / PDF
                      </Button>
                    </div>
                    {r.review_comment && <p className="mt-1 text-xs text-muted-foreground">Retour du chef de traction : {r.review_comment}</p>}

                    <div className="mt-4 grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                      <div><Label>Dépôt</Label><Input disabled={!editable} value={h.depot ?? ""} onChange={(e) => setHeaderField(r, "depot", e.target.value)} /></div>
                      <div><Label>Mois / année</Label><Input disabled={!editable} value={h.mois ?? ""} onChange={(e) => setHeaderField(r, "mois", e.target.value)} /></div>
                      <div><Label>Nom et prénom</Label><Input disabled={!editable} value={h.nom ?? ""} onChange={(e) => setHeaderField(r, "nom", e.target.value)} /></div>
                      <div><Label>Matricule</Label><Input disabled={!editable} value={h.matricule ?? ""} onChange={(e) => setHeaderField(r, "matricule", e.target.value)} /></div>
                      <div><Label>Grade / fonction</Label><Input disabled={!editable} value={h.grade ?? ""} onChange={(e) => setHeaderField(r, "grade", e.target.value)} /></div>
                      <div><Label>Catégorie</Label><Input disabled={!editable} value={h.categorie ?? ""} onChange={(e) => setHeaderField(r, "categorie", e.target.value)} /></div>
                      <div><Label>Résidence</Label><Input disabled={!editable} value={h.residence ?? ""} onChange={(e) => setHeaderField(r, "residence", e.target.value)} /></div>
                      {editable && (
                        <div className="flex items-end">
                          <Button size="sm" variant="outline" onClick={() => saveHeader.mutate(r)} disabled={saveHeader.isPending}>
                            <Save className="mr-1 h-4 w-4" /> Enregistrer l'en-tête
                          </Button>
                        </div>
                      )}
                    </div>

                    <LinesTable id={r.id} editable={editable} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Total : {totals(r.id).km} km · {totals(r.id).h} h · {totals(r.id).nuits} découcher(s) · {totals(r.id).repas} repas
                    </p>

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
                            <div><Label>Engin / locomotive</Label><Input value={line.engin} onChange={(e) => setLine({ ...line, engin: e.target.value })} /></div>
                            <div><Label>Gare de départ</Label><Input value={line.departure} onChange={(e) => setLine({ ...line, departure: e.target.value })} /></div>
                            <div><Label>Gare d'arrivée</Label><Input value={line.arrival} onChange={(e) => setLine({ ...line, arrival: e.target.value })} /></div>
                            <div><Label>Heure de départ</Label><Input type="time" value={line.start_time} onChange={(e) => setLine({ ...line, start_time: e.target.value })} /></div>
                            <div><Label>Heure d'arrivée</Label><Input type="time" value={line.end_time} onChange={(e) => setLine({ ...line, end_time: e.target.value })} /></div>
                            <div><Label>Prise de service</Label><Input type="time" value={line.prise_service} onChange={(e) => setLine({ ...line, prise_service: e.target.value })} /></div>
                            <div><Label>Fin de service</Label><Input type="time" value={line.fin_service} onChange={(e) => setLine({ ...line, fin_service: e.target.value })} /></div>
                            <div><Label>Distance (km)</Label><Input type="number" min="0" value={line.distance_km} onChange={(e) => setLine({ ...line, distance_km: e.target.value })} /></div>
                            <div><Label>Heures</Label><Input type="number" min="0" step="0.5" value={line.hours} onChange={(e) => setLine({ ...line, hours: e.target.value })} /></div>
                            <div><Label>Nombre de repas</Label><Input type="number" min="0" value={line.repas} onChange={(e) => setLine({ ...line, repas: e.target.value })} /></div>
                            <div><Label>Code indemnité</Label><Input value={line.allowance_code} onChange={(e) => setLine({ ...line, allowance_code: e.target.value })} /></div>
                            <div className="flex items-end gap-2">
                              <input id={`dec-${r.id}`} type="checkbox" className="h-4 w-4" checked={line.decouche} onChange={(e) => setLine({ ...line, decouche: e.target.checked })} />
                              <Label htmlFor={`dec-${r.id}`}>Découcher</Label>
                            </div>
                            <div className="sm:col-span-2"><Label>Observations</Label><Input value={line.notes} onChange={(e) => setLine({ ...line, notes: e.target.value })} /></div>
                            <div className="sm:col-span-3">
                              <Button size="sm" onClick={() => addLine.mutate(r.id)} disabled={addLine.isPending}>Enregistrer la ligne</Button>
                            </div>
                          </div>
                        )}
                        <Button size="sm" className="mt-3 ml-0 sm:ml-2" onClick={() => submit.mutate(r)}>
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

      {printRecord && (
        <div className="print-sheet text-black">
          <PrintSheet
            record={printRecord}
            header={headerOf(printRecord)}
            lines={linesOf(printRecord.id)}
            totals={totals(printRecord.id)}
            agent={agentName(printRecord.agent_id)}
          />
        </div>
      )}
    </>
  );
}

function PrintSheet({ record, header, lines, totals, agent }: { record: any; header: HeaderData; lines: any[]; totals: any; agent: string }) {
  const visas = record.visas ?? {};
  const cell = "border border-black px-1 py-0.5 align-top";
  return (
    <div className="mx-auto w-full p-2 text-[11px]">
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div className="font-bold">CAMRAIL</div>
        <div className="text-center">
          <div className="text-sm font-bold uppercase">Relevé de mouvement du personnel</div>
          <div className="text-[10px]">Période du {record.period_start} au {record.period_end}</div>
        </div>
        <div className="text-right text-[10px]">Statut : {STATUS[record.status]?.label ?? record.status}</div>
      </div>

      <table className="mt-2 w-full border-collapse">
        <tbody>
          <tr>
            <td className={cell}><b>Dépôt :</b> {header.depot ?? ""}</td>
            <td className={cell}><b>Mois :</b> {header.mois ?? ""}</td>
            <td className={cell}><b>Nom et prénom :</b> {header.nom || agent}</td>
          </tr>
          <tr>
            <td className={cell}><b>Matricule :</b> {header.matricule ?? ""}</td>
            <td className={cell}><b>Grade / fonction :</b> {header.grade ?? ""}</td>
            <td className={cell}><b>Catégorie :</b> {header.categorie ?? ""} — <b>Résidence :</b> {header.residence ?? ""}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="bg-neutral-200">
            <th className={cell}>Date</th>
            <th className={cell}>Nature</th>
            <th className={cell}>Train</th>
            <th className={cell}>Engin</th>
            <th className={cell}>Départ</th>
            <th className={cell}>H. dép.</th>
            <th className={cell}>Arrivée</th>
            <th className={cell}>H. arr.</th>
            <th className={cell}>Prise serv.</th>
            <th className={cell}>Fin serv.</th>
            <th className={cell}>Km</th>
            <th className={cell}>Heures</th>
            <th className={cell}>Déc.</th>
            <th className={cell}>Repas</th>
            <th className={cell}>Code</th>
            <th className={cell}>Observations</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((x: any) => (
            <tr key={x.id}>
              <td className={cell}>{x.work_date}</td>
              <td className={cell}>{x.service_type}</td>
              <td className={cell}>{x.train_number ?? ""}</td>
              <td className={cell}>{x.details?.engin ?? ""}</td>
              <td className={cell}>{x.departure ?? ""}</td>
              <td className={cell}>{x.start_time ?? ""}</td>
              <td className={cell}>{x.arrival ?? ""}</td>
              <td className={cell}>{x.end_time ?? ""}</td>
              <td className={cell}>{x.details?.prise_service ?? ""}</td>
              <td className={cell}>{x.details?.fin_service ?? ""}</td>
              <td className={cell}>{Number(x.distance_km)}</td>
              <td className={cell}>{Number(x.hours)}</td>
              <td className={cell}>{x.details?.decouche ? "X" : ""}</td>
              <td className={cell}>{Number(x.details?.repas || 0) || ""}</td>
              <td className={cell}>{x.allowance_code ?? ""}</td>
              <td className={cell}>{x.notes ?? ""}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 12 - lines.length) }).map((_, i) => (
            <tr key={`e${i}`}>
              {Array.from({ length: 16 }).map((__, j) => <td key={j} className={cell}>&nbsp;</td>)}
            </tr>
          ))}
          <tr className="font-bold">
            <td className={cell} colSpan={10}>TOTAUX</td>
            <td className={cell}>{totals.km}</td>
            <td className={cell}>{totals.h}</td>
            <td className={cell}>{totals.nuits}</td>
            <td className={cell}>{totals.repas}</td>
            <td className={cell} colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      <table className="mt-3 w-full border-collapse">
        <tbody>
          <tr>
            <td className={cell} style={{ height: 70, width: "33%" }}>
              <b>Visa de l'agent</b><br />
              {visas.agent?.nom ?? header.nom ?? ""}<br />
              {visas.agent?.date ? `Le ${visas.agent.date}` : ""}
            </td>
            <td className={cell} style={{ height: 70, width: "34%" }}>
              <b>Visa du chef de traction</b><br />
              {visas.ctra?.nom ?? ""}<br />
              {visas.ctra?.date ? `Le ${visas.ctra.date}` : ""}<br />
              {visas.ctra?.observation ?? record.review_comment ?? ""}
            </td>
            <td className={cell} style={{ height: 70, width: "33%" }}>
              <b>Visa du chef de dépôt / paye</b><br />
              {record.payroll_exported_at ? `Inscrit en paye le ${new Date(record.payroll_exported_at).toLocaleDateString("fr-FR")}` : ""}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
