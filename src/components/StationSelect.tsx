import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export type Station = { id: string; code: string; name: string; active?: boolean };

/** Sélecteur de gare avec recherche par code ou nom (référentiel central). */
export function StationSelect({ stations, value, onChange }: { stations: Station[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return stations.filter(x => (x.active !== false || x.id === value) && (x.id === value || !s || x.code.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)));
  }, [q, stations, value]);
  return (
    <div className="space-y-1">
      <Input placeholder="Rechercher code ou nom…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-xs" />
      <select
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{stations.length ? "— Choisir une gare —" : "Référentiel des gares vide"}</option>
        {list.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
      </select>
    </div>
  );
}

export function DepotSelect({ depots, value, onChange }: { depots: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Dépôt —</option>
      {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );
}

export const stationLabel = (stations: Station[], id?: string | null) => {
  const s = stations.find((x) => x.id === id);
  return s ? `${s.code} - ${s.name}` : "—";
};
