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
import { Plus, Trash2, ClipboardList, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feuille-service")({
  component: ServiceSheetPage,
  head: () => ({
    meta: [
      { title: "Feuille de service conducteurs — Chef commande" },
      { name: "description", content: "Feuille de service conducteurs et conducteurs de manœuvre : dépôt, journée, équipes de conduite, graphique horaire, locomotive, repos, absences et détachés." },
      { property: "og:title", content: "Feuille de service conducteurs — Chef commande" },
      { property: "og:description", content: "Planification journalière des équipes de conduite par dépôt, conforme à la feuille de service." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SHEET_TYPES = [
  { value: "ligne", label: "Feuille de service conducteurs" },
  { value: "manoeuvre", label: "Feuille de service des conducteurs de manœuvre" },
];

const SHIFTS = ["jour", "nuit", "matin", "soir"];

const FOOTER_FIELDS = [
  { key: "hospitalisation", label: "Hospitalisation" },
  { key: "visite_medicale", label: "Visite médicale" },
  { key: "repos_medical", label: "Repos médical" },
  { key: "repos_hors_roulement", label: "Repos hors du roulement" },
  { key: "surveillants", label: "Surveillants" },
  { key: "chefs_de_jour", label: "Chefs de jour" },
  { key: "periode", label: "Période" },
  { key: "service_interieur", label: "Service intérieur" },
  { key: "detaches", label: "Détachés" },
  { key: "permissions_conges", label: "Permissions et congés" },
  { key: "absences", label: "Absences" },
  { key: "mise_a_pied", label: "Mise à pied" },
  { key: "prise_service_tardive", label: "Prise de service tardive" },
];

const emptyLine = () => ({
  agent_name: "",
  aide1: "",
  aide2: "",
  role_label: "",
  train_number: "",
  locomotive: "",
  start_time: "",
  end_time: "",
  nbre_agents: "",
  heures_repos: "",
  heures_travail: "",
  moyenne_hebdo: "",
  task: "",
  notes: "",
});

function ServiceSheetPage() {
  const qc = useQueryClient();
  const [head, setHead] = useState({
    service_date: new Date().toISOString().slice(0, 10),
    depot_id: "",
    shift: "jour",
    sheet_type: "ligne",
    notes: "",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [line, setLine] = useState(emptyLine());
  const [footers, setFooters] = useState<Record<string, Record<string, string>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["service-sheets"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "";
      const [{ data: depots }, { data: sheets }] = await Promise.all([
        supabase.from("depots").select("id,name").order("name"),
        supabase.from("service_sheets").select("*").order("service_date", { ascending: false }).limit(50),
      ]);
      const ids = (sheets ?? []).map((s: any) => s.id);
      const { data: lines } = ids.length
        ? await supabase.from("service_sheet_lines").select("*").in("sheet_id", ids).order("start_time")
        : { data: [] as any[] };
      return { uid, depots: depots ?? [], sheets: sheets ?? [], lines: lines ?? [] };
    },
  });

  const uid = data?.uid ?? "";
  const depotName = (id: string | null) => data?.depots.find((d: any) => d.id === id)?.name ?? "—";

  const createSheet = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("service_sheets").insert({
        created_by: uid,
        service_date: head.service_date,
        depot_id: head.depot_id || null,
        shift: head.shift,
        sheet_type: head.sheet_type,
        notes: head.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Feuille de service créée"); qc.invalidateQueries({ queryKey: ["service-sheets"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const addLine = useMutation({
    mutationFn: async (sheetId: string) => {
      if (!line.agent_name.trim()) throw new Error("Indiquez le conducteur");
      const { error } = await supabase.from("service_sheet_lines").insert({
        sheet_id: sheetId,
        agent_name: line.agent_name.trim(),
        role_label: line.role_label || null,
        train_number: line.train_number || null,
        start_time: line.start_time || null,
        end_time: line.end_time || null,
        task: line.task || null,
        notes: line.notes || null,
        details: {
          aide1: line.aide1,
          aide2: line.aide2,
          locomotive: line.locomotive,
          nbre_agents: line.nbre_agents,
          heures_repos: line.heures_repos,
          heures_travail: line.heures_travail,
          moyenne_hebdo: line.moyenne_hebdo,
        },
      });
      if (error) throw error;
      setLine(emptyLine());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-sheets"] }),
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const removeLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_sheet_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-sheets"] }),
  });

  const saveFooter = useMutation({
    mutationFn: async ({ id, footer }: { id: string; footer: Record<string, string> }) => {
      const { error } = await supabase.from("service_sheets").update({ footer }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pied de feuille enregistré"); qc.invalidateQueries({ queryKey: ["service-sheets"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const publish = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_sheets").update({ status: "publiee" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Feuille de service diffusée"); qc.invalidateQueries({ queryKey: ["service-sheets"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Feuille de service conducteurs</h1>
        <p className="text-muted-foreground">
          Direction transport — établie par le chef commande conducteur : équipes de conduite, graphique horaire, locomotive, repos, absences et détachés, par dépôt et par journée.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ClipboardList className="h-5 w-5" /> Nouvelle feuille
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Type de feuille</Label>
            <Select value={head.sheet_type} onValueChange={(v) => setHead({ ...head, sheet_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SHEET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Journée du</Label><Input type="date" value={head.service_date} onChange={(e) => setHead({ ...head, service_date: e.target.value })} /></div>
          <div>
            <Label>Dépôt</Label>
            <Select value={head.depot_id} onValueChange={(v) => setHead({ ...head, depot_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir un dépôt" /></SelectTrigger>
              <SelectContent>
                {(data?.depots ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vacation</Label>
            <Select value={head.shift} onValueChange={(v) => setHead({ ...head, shift: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SHIFTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>Consignes générales</Label><Textarea rows={3} value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} maxLength={2000} /></div>
        </div>
        <Button className="mt-4" onClick={() => createSheet.mutate()} disabled={createSheet.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Créer la feuille
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Feuilles de service</h2>
        {isLoading ? (
          <p className="mt-3 text-muted-foreground">Chargement…</p>
        ) : !data?.sheets.length ? (
          <p className="mt-3 text-muted-foreground">Aucune feuille de service enregistrée.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {data.sheets.map((s: any) => {
              const own = s.created_by === uid;
              const rows = (data.lines ?? []).filter((l: any) => l.sheet_id === s.id);
              const footer = footers[s.id] ?? ((s.footer ?? {}) as Record<string, string>);
              return (
                <div key={s.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {SHEET_TYPES.find((t) => t.value === (s.sheet_type ?? "ligne"))?.label} — dépôt de {depotName(s.depot_id)}
                    </p>
                    <Badge variant="secondary">Journée du {new Date(s.service_date).toLocaleDateString("fr-FR")}</Badge>
                    <Badge variant="secondary">Vacation {s.shift}</Badge>
                    <Badge variant="outline">{s.status === "publiee" ? "Diffusée" : "Brouillon"}</Badge>
                  </div>
                  {s.notes && <p className="mt-1 text-sm text-muted-foreground">{s.notes}</p>}

                  {rows.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="py-1 pr-3">Conducteur</th>
                            <th className="py-1 pr-3">Aide-conducteur 1</th>
                            <th className="py-1 pr-3">Aide-conducteur 2</th>
                            <th className="py-1 pr-3">Graphique</th>
                            <th className="py-1 pr-3">Train</th>
                            <th className="py-1 pr-3">Locomotive</th>
                            <th className="py-1 pr-3">Nbre agents</th>
                            <th className="py-1 pr-3">H. repos</th>
                            <th className="py-1 pr-3">H. travail</th>
                            <th className="py-1 pr-3">Moy. hebdo</th>
                            <th className="py-1 pr-3">Observations</th>
                            {own && <th />}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((l: any) => {
                            const d = (l.details ?? {}) as any;
                            return (
                              <tr key={l.id} className="border-t align-top">
                                <td className="py-1 pr-3">{l.agent_name}{l.role_label ? ` (${l.role_label})` : ""}</td>
                                <td className="py-1 pr-3">{d.aide1 || "—"}</td>
                                <td className="py-1 pr-3">{d.aide2 || "—"}</td>
                                <td className="py-1 pr-3">{[l.start_time, l.end_time].filter(Boolean).join(" - ") || "—"}</td>
                                <td className="py-1 pr-3">{l.train_number ?? "—"}</td>
                                <td className="py-1 pr-3">{d.locomotive || "—"}</td>
                                <td className="py-1 pr-3">{d.nbre_agents || "—"}</td>
                                <td className="py-1 pr-3">{d.heures_repos || "—"}</td>
                                <td className="py-1 pr-3">{d.heures_travail || "—"}</td>
                                <td className="py-1 pr-3">{d.moyenne_hebdo || "—"}</td>
                                <td className="py-1 pr-3">{[l.task, l.notes].filter(Boolean).join(" · ") || "—"}</td>
                                {own && <td className="py-1"><Button variant="ghost" size="sm" onClick={() => removeLine.mutate(l.id)}><Trash2 className="h-4 w-4" /></Button></td>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {own && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                        <Plus className="mr-1 h-4 w-4" /> Ajouter une équipe de conduite
                      </Button>
                      {s.status !== "publiee" && (
                        <Button size="sm" onClick={() => publish.mutate(s.id)}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Diffuser
                        </Button>
                      )}
                    </div>
                  )}

                  {own && openId === s.id && (
                    <>
                      <div className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                        <div><Label className="text-xs">Conducteur</Label><Input value={line.agent_name} onChange={(e) => setLine({ ...line, agent_name: e.target.value })} /></div>
                        <div><Label className="text-xs">Aide-conducteur 1</Label><Input value={line.aide1} onChange={(e) => setLine({ ...line, aide1: e.target.value })} /></div>
                        <div><Label className="text-xs">Aide-conducteur 2</Label><Input value={line.aide2} onChange={(e) => setLine({ ...line, aide2: e.target.value })} /></div>
                        <div><Label className="text-xs">Poste / roulement</Label><Input value={line.role_label} onChange={(e) => setLine({ ...line, role_label: e.target.value })} placeholder="PAV, PAM, PB, PC, MT, ZI…" /></div>
                        <div><Label className="text-xs">N° de train</Label><Input value={line.train_number} onChange={(e) => setLine({ ...line, train_number: e.target.value })} /></div>
                        <div><Label className="text-xs">Locomotive</Label><Input value={line.locomotive} onChange={(e) => setLine({ ...line, locomotive: e.target.value })} placeholder="CC 3002…" /></div>
                        <div><Label className="text-xs">Graphique — début</Label><Input type="time" value={line.start_time} onChange={(e) => setLine({ ...line, start_time: e.target.value })} /></div>
                        <div><Label className="text-xs">Graphique — fin</Label><Input type="time" value={line.end_time} onChange={(e) => setLine({ ...line, end_time: e.target.value })} /></div>
                        <div><Label className="text-xs">Nombre d'agents</Label><Input value={line.nbre_agents} onChange={(e) => setLine({ ...line, nbre_agents: e.target.value })} /></div>
                        <div><Label className="text-xs">Heures de repos</Label><Input value={line.heures_repos} onChange={(e) => setLine({ ...line, heures_repos: e.target.value })} /></div>
                        <div><Label className="text-xs">Heures de travail effectif</Label><Input value={line.heures_travail} onChange={(e) => setLine({ ...line, heures_travail: e.target.value })} /></div>
                        <div><Label className="text-xs">Moyenne hebdomadaire</Label><Input value={line.moyenne_hebdo} onChange={(e) => setLine({ ...line, moyenne_hebdo: e.target.value })} /></div>
                        <div><Label className="text-xs">Tâche</Label><Input value={line.task} onChange={(e) => setLine({ ...line, task: e.target.value })} /></div>
                        <div className="sm:col-span-2"><Label className="text-xs">Observations</Label><Input value={line.notes} onChange={(e) => setLine({ ...line, notes: e.target.value })} /></div>
                        <div className="sm:col-span-3">
                          <Button size="sm" onClick={() => addLine.mutate(s.id)} disabled={addLine.isPending}>Ajouter à la feuille</Button>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border p-3">
                        <p className="text-sm font-semibold">Pied de feuille</p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-3">
                          {FOOTER_FIELDS.map((f) => (
                            <div key={f.key}>
                              <Label className="text-xs">{f.label}</Label>
                              <Input
                                value={footer[f.key] ?? ""}
                                onChange={(e) => setFooters((s2) => ({ ...s2, [s.id]: { ...footer, [f.key]: e.target.value } }))}
                              />
                            </div>
                          ))}
                        </div>
                        <Button size="sm" className="mt-3" variant="secondary" onClick={() => saveFooter.mutate({ id: s.id, footer })}>
                          Enregistrer le pied de feuille
                        </Button>
                      </div>
                    </>
                  )}

                  {!own && s.footer && Object.values(s.footer as Record<string, string>).some(Boolean) && (
                    <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                      {FOOTER_FIELDS.filter((f) => (s.footer as any)[f.key]).map((f) => (
                        <p key={f.key}><span className="text-muted-foreground">{f.label} : </span>{(s.footer as any)[f.key]}</p>
                      ))}
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
