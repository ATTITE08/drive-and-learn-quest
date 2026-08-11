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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prise-service")({
  component: DutyLogPage,
  head: () => ({
    meta: [
      { title: "Feuille de prise de service — Surveillance" },
      { name: "description", content: "Enregistrez votre prise et fin de service : poste de surveillance, horaires, passation de consignes, état du matériel et observations." },
      { property: "og:title", content: "Feuille de prise de service — Surveillance" },
      { property: "og:description", content: "Prise de service, passation et observations des agents de surveillance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DutyLogPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    service_date: new Date().toISOString().slice(0, 10),
    depot_id: "",
    post: "",
    start_time: new Date().toTimeString().slice(0, 5),
    handover_from: "",
    equipment_ok: true,
    observations: "",
  });
  const [closing, setClosing] = useState<Record<string, { end_time: string; handover_to: string; observations: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["duty-logs"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "";
      const [{ data: depots }, { data: logs }] = await Promise.all([
        supabase.from("depots").select("id,name").order("name"),
        supabase.from("duty_logs").select("*").order("service_date", { ascending: false }).limit(100),
      ]);
      const ids = Array.from(new Set((logs ?? []).map((l: any) => l.agent_id)));
      const { data: agents } = ids.length
        ? await supabase.from("profiles").select("id,full_name,email").in("id", ids)
        : { data: [] as any[] };
      return { uid, depots: depots ?? [], logs: logs ?? [], agents: agents ?? [] };
    },
  });

  const uid = data?.uid ?? "";
  const depotName = (id: string | null) => data?.depots.find((d: any) => d.id === id)?.name ?? "—";
  const agentName = (id: string) => {
    const a = data?.agents.find((x: any) => x.id === id);
    return a?.full_name ?? a?.email ?? "Agent";
  };

  const takeDuty = useMutation({
    mutationFn: async () => {
      if (!form.post.trim()) throw new Error("Indiquez le poste de surveillance");
      const { error } = await supabase.from("duty_logs").insert({
        agent_id: uid,
        depot_id: form.depot_id || null,
        service_date: form.service_date,
        post: form.post.trim(),
        start_time: form.start_time || null,
        handover_from: form.handover_from || null,
        equipment_ok: form.equipment_ok,
        observations: form.observations || null,
        status: "ouvert",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prise de service enregistrée");
      setForm({ ...form, post: "", handover_from: "", observations: "" });
      qc.invalidateQueries({ queryKey: ["duty-logs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const endDuty = useMutation({
    mutationFn: async (id: string) => {
      const c = closing[id] ?? { end_time: new Date().toTimeString().slice(0, 5), handover_to: "", observations: "" };
      const { error } = await supabase
        .from("duty_logs")
        .update({
          end_time: c.end_time || new Date().toTimeString().slice(0, 5),
          handover_to: c.handover_to || null,
          observations: c.observations || null,
          status: "cloture",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Fin de service enregistrée"); qc.invalidateQueries({ queryKey: ["duty-logs"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec"),
  });

  const mine = (data?.logs ?? []).filter((l: any) => l.agent_id === uid);
  const team = (data?.logs ?? []).filter((l: any) => l.agent_id !== uid);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Feuille de prise de service</h1>
        <p className="text-muted-foreground">
          Destinée à la surveillance : prise de service, poste tenu, passation de consignes, état du matériel et observations en fin de vacation.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <LogIn className="h-5 w-5" /> Prise de service
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><Label>Date</Label><Input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} /></div>
          <div>
            <Label>Dépôt</Label>
            <Select value={form.depot_id} onValueChange={(v) => setForm({ ...form, depot_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir un dépôt" /></SelectTrigger>
              <SelectContent>{(data?.depots ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Poste de surveillance</Label><Input value={form.post} onChange={(e) => setForm({ ...form, post: e.target.value })} maxLength={160} /></div>
          <div><Label>Heure de prise</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
          <div><Label>Consignes reçues de</Label><Input value={form.handover_from} onChange={(e) => setForm({ ...form, handover_from: e.target.value })} maxLength={160} /></div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={form.equipment_ok} onCheckedChange={(v) => setForm({ ...form, equipment_ok: v })} />
            <span className="text-sm">Matériel et installations conformes</span>
          </div>
          <div className="sm:col-span-2"><Label>Observations à la prise</Label><Textarea rows={3} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} maxLength={2000} /></div>
        </div>
        <Button className="mt-4" onClick={() => takeDuty.mutate()} disabled={takeDuty.isPending}>
          <ShieldCheck className="mr-1 h-4 w-4" /> Enregistrer la prise de service
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Mes services</h2>
        {isLoading ? (
          <p className="mt-3 text-muted-foreground">Chargement…</p>
        ) : !mine.length ? (
          <p className="mt-3 text-muted-foreground">Aucune prise de service enregistrée.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {mine.map((l: any) => (
              <div key={l.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{new Date(l.service_date).toLocaleDateString("fr-FR")} — {l.post}</p>
                  <Badge variant="outline">{l.status === "cloture" ? "Service terminé" : "En cours"}</Badge>
                  <span className="text-xs text-muted-foreground">{depotName(l.depot_id)} · {[l.start_time, l.end_time].filter(Boolean).join(" - ")}</span>
                </div>
                {l.handover_from && <p className="mt-1 text-xs text-muted-foreground">Consignes reçues de {l.handover_from}</p>}
                {!l.equipment_ok && <p className="mt-1 text-xs text-destructive">Anomalie signalée sur le matériel</p>}
                {l.observations && <p className="mt-2 whitespace-pre-wrap text-sm">{l.observations}</p>}

                {l.status !== "cloture" && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div><Label>Heure de fin</Label><Input type="time" value={closing[l.id]?.end_time ?? new Date().toTimeString().slice(0, 5)} onChange={(e) => setClosing((c) => ({ ...c, [l.id]: { ...(c[l.id] ?? { end_time: "", handover_to: "", observations: "" }), end_time: e.target.value } }))} /></div>
                    <div><Label>Consignes remises à</Label><Input value={closing[l.id]?.handover_to ?? ""} onChange={(e) => setClosing((c) => ({ ...c, [l.id]: { ...(c[l.id] ?? { end_time: "", handover_to: "", observations: "" }), handover_to: e.target.value } }))} /></div>
                    <div><Label>Observations finales</Label><Input value={closing[l.id]?.observations ?? l.observations ?? ""} onChange={(e) => setClosing((c) => ({ ...c, [l.id]: { ...(c[l.id] ?? { end_time: "", handover_to: "", observations: "" }), observations: e.target.value } }))} /></div>
                    <div className="sm:col-span-3">
                      <Button size="sm" onClick={() => endDuty.mutate(l.id)}>
                        <LogOut className="mr-1 h-4 w-4" /> Clôturer le service
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {team.length > 0 && (
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold">Services de mon équipe</h2>
          <div className="mt-4 space-y-2">
            {team.map((l: any) => (
              <div key={l.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{agentName(l.agent_id)} — {l.post}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(l.service_date).toLocaleDateString("fr-FR")} · {depotName(l.depot_id)} · {[l.start_time, l.end_time].filter(Boolean).join(" - ")} · {l.status === "cloture" ? "terminé" : "en cours"}
                </p>
                {l.observations && <p className="mt-1 text-muted-foreground">{l.observations}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
