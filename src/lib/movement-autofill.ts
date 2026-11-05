import { durationMinutes } from './pointage';

export type RealMovementSource = {
  id: string; service_date: string; status: string;
  start_time: string | null; end_time: string | null;
  departure: string | null; arrival: string | null;
};

// Used by the pointage action to show how many completed vacations are eligible.
export function eligibleRealMovements(sources: RealMovementSource[], start: string, end: string) {
  return sources.filter(s => s.status === 'cloture' && s.service_date >= start && s.service_date <= end
    && durationMinutes(s.start_time, s.end_time) !== null);
}