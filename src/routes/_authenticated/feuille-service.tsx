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
      { title: "Feuille de service — Chef commande conducteur" },
      { name: "description", content: "Établissez la feuille de service journalière du dépôt : affectation des agents de conduite, trains, horaires et tâches." },
      { property: "og:title", content: "Feuille de service — Chef commande conducteur" },
      { property: "og:description", content: "Planification journalière des agents de conduite par le chef commande conducteur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SHIFTS = ["jour", "nuit", "matin", "soir"];

const emptyLine = () => ({ agent_name: "", role_label: "", train_number: "", start_time: "", end_time: "", task: "", notes: "" });

function ServiceSheetPage() {
  const qc = useQueryClient();
  const [head, setHead] = useState({ service_date: new Date().toISOString().slice(0, 10), depot_id: "", shift: "jour", notes: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [line, setLine] = useState(emptyLine());

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
        notes: head.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Feuille de service créée"); qc.invalidateQueries({ queryKey: ["service-sheets"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const addLine = useMutation({
    mutationFn: async (sheetId: string) => {
      if (!line.agent_name.trim()) throw new Error("Indiquez l'agent affecté");
      const { error } = await supabase.from("service_sheet_lines").insert({
        sheet_id: sheetId,
        agent_name: line.agent_name.trim(),
        role_label: line.role_label || null,
        train_number: line.train_number || null,
        start_time: line.start_time || null,
        end_time: line.end_time || null,
        task: line.task || null,
        notes: line.notes || null,
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
        <h1 className="font-display text-2xl font-bold">Feuille de service</h1>
        <p className="text-muted-foreground">
          Établie par le chef commande conducteur : affectation journalière des agents, trains, horaires et tâches par dépôt.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ClipboardList className="h-5 w-5" /> Nouvelle feuille
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><Label>Date de service</Label><Input type="date" value={head.service_date} onChange={(e) => setHead({ ...head, service_date: e.target.value })} /></div>
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
              return (
                <div key={s.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{new Date(s.service_date).toLocaleDateString("fr-FR")} — {depotName(s.depot_id)}</p>
                    <Badge variant="secondary">Vacation {s.shift}</Badge>
                    <Badge variant="outline">{s.status === "publiee" ? "Diffusée" : "Brouillon"}</Badge>
                  </div>
                  {s.notes && <p className="mt-1 text-sm text-muted-foreground">{s.notes}</p>}

                  {rows.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-muted-foreground">
                          <tr><th className="py-1 pr-3">Agent</th><th className="py-1 pr-3">Fonction</th><th className="py-1 pr-3">Train</th><th className="py-1 pr-3">Horaires</th><th className="py-1 pr-3">Tâche</th>{own && <th />}</tr>
                        </thead>
                        <tbody>
                          {rows.map((l: any) => (
                            <tr key={l.id} className="border-t">
                              <td className="py-1 pr-3">{l.agent_name}</td>
                              <td className="py-1 pr-3">{l.role_label ?? "—"}</td>
                              <td className="py-1 pr-3">{l.train_number ?? "—"}</td>
                              <td className="py-1 pr-3">{[l.start_time, l.end_time].filter(Boolean).join(" - ") || "—"}</td>
                              <td className="py-1 pr-3">{l.task ?? "—"}</td>
                              {own && <td className="py-1"><Button variant="ghost" size="sm" onClick={() => removeLine.mutate(l.id)}><Trash2 className="h-4 w-4" /></Button></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {own && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                        <Plus className="mr-1 h-4 w-4" /> Affecter un agent
                      </Button>
                      {s.status !== "publiee" && (
                        <Button size="sm" onClick={() => publish.mutate(s.id)}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Diffuser
                        </Button>
                      )}
                    </div>
                  )}

                  {own && openId === s.id && (
                    <div className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                      <div><Label>Agent</Label><Input value={line.agent_name} onChange={(e) => setLine({ ...line, agent_name: e.target.value })} /></div>
                      <div><Label>Fonction</Label><Input value={line.role_label} onChange={(e) => setLine({ ...line, role_label: e.target.value })} placeholder="Conducteur de ligne…" /></div>
                      <div><Label>N° de train</Label><Input value={line.train_number} onChange={(e) => setLine({ ...line, train_number: e.target.value })} /></div>
                      <div><Label>Heure début</Label><Input type="time" value={line.start_time} onChange={(e) => setLine({ ...line, start_time: e.target.value })} /></div>
                      <div><Label>Heure fin</Label><Input type="time" value={line.end_time} onChange={(e) => setLine({ ...line, end_time: e.target.value })} /></div>
                      <div><Label>Tâche</Label><Input value={line.task} onChange={(e) => setLine({ ...line, task: e.target.value })} /></div>
                      <div className="sm:col-span-3">
                        <Button size="sm" onClick={() => addLine.mutate(s.id)} disabled={addLine.isPending}>Ajouter à la feuille</Button>
                      </div>
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
