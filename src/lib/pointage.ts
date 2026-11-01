export type DayInput = { date: string; status: string; start: string | null; end: string | null; source: string; roulement?: string | null };
export function durationMinutes(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const minutes = parse(end) - parse(start);
  return minutes < 0 ? minutes + 1440 : minutes;
}
export function calculatePointage(days: DayInput[]) {
  let group = 0;
  let separated = true;
  const rows = [...days].sort((a, b) => a.date.localeCompare(b.date)).map((day) => {
    if (day.status === 'repos') { separated = true; return { ...day, minutes: 0, group: null }; }
    if (day.status === 'absent') return { ...day, minutes: null, group: null };
    if (separated) { group++; separated = false; }
    return { ...day, minutes: durationMinutes(day.start, day.end), group };
  });
  const groups = Array.from({ length: group }, (_, i) => {
    const members = rows.filter(r => r.group === i + 1);
    const minutes = members.reduce((s, r) => s + (r.minutes ?? 0), 0);
    return { number: i + 1, days: members.length, minutes, normal: Math.min(minutes, 2400), potential: Math.max(0, minutes - 2400) };
  });
  const worked = groups.reduce((s, g) => s + g.minutes, 0);
  const potential = groups.reduce((s, g) => s + g.potential, 0);
  const retained = Math.min(potential, Math.max(0, worked - 10380));
  return { rows, groups, worked, potential, retained, normal: worked - retained, incomplete: rows.some(r => r.status === 'service' && r.minutes === null) };
}
export const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;