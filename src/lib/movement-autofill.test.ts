/// <reference types="bun" />
import { describe, it, expect } from 'bun:test';
import { eligibleRealMovements, type RealMovementSource } from './movement-autofill';
const real: RealMovementSource = { id: 'closed', service_date: '2026-11-05', status: 'cloture', start_time: '22:00', end_time: '06:00', departure: '210', arrival: '533' };
describe('Sources du relevé automatique', () => {
  it('retient un service réel clôturé de la période', () => expect(eligibleRealMovements([real], '2026-11-01', '2026-11-30').map(s => s.id)).toEqual(['closed']));
  it('exclut un service ouvert', () => expect(eligibleRealMovements([{...real,status:'ouvert'}], '2026-11-01', '2026-11-30')).toHaveLength(0));
  it('exclut un service sans heure de fin', () => expect(eligibleRealMovements([{...real,end_time:null}], '2026-11-01', '2026-11-30')).toHaveLength(0));
  it('exclut les services hors période', () => expect(eligibleRealMovements([real], '2026-10-01', '2026-10-31')).toHaveLength(0));
});