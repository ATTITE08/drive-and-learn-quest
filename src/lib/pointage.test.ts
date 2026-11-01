import { describe, it, expect } from 'bun:test';
import { calculatePointage, durationMinutes, type DayInput } from './pointage';
const service = (date: string, hours: number): DayInput => ({date, status:'service', start:'00:00', end:`${String(hours).padStart(2,'0')}:00`, source:'Feuille de service'});
describe('Pointage CAMRAIL', () => {
  it('gère un service de nuit passant minuit', () => expect(durationMinutes('22:00','06:00')).toBe(480));
  it('sépare les roulements par les repos et applique 40 h', () => {
    const r = calculatePointage([service('2026-11-01',20),service('2026-11-02',22),{date:'2026-11-03',status:'repos',start:null,end:null,source:'Feuille de service'},service('2026-11-04',10)]);
    expect(r.groups.map(g => g.potential)).toEqual([120,0]);
  });
  it('retient 7 h pour 180 h travaillées et 10 h potentielles au-dessus de 173 h', () => {
    const days: DayInput[] = [];
    let n=1;
    for (const total of [50,40,40,40,10]) {
      let remaining=total;
      while(remaining) { const h=Math.min(20,remaining); days.push(service(`2026-11-${String(n++).padStart(2,'0')}`,h)); remaining-=h; }
      days.push({date:`2026-11-${String(n++).padStart(2,'0')}`,status:'repos',start:null,end:null,source:'Feuille de service'});
    }
    const r=calculatePointage(days); expect(r.worked).toBe(10800); expect(r.potential).toBe(600); expect(r.retained).toBe(420);
  });
  it('ne considère pas un service ouvert comme zéro heure complet', () => expect(calculatePointage([{date:'2026-11-01',status:'service',start:'08:00',end:null,source:'Prise de service'}]).incomplete).toBe(true));
  it('additionne deux vacations sans compter la pause', () => expect(calculatePointage([{date:'2026-11-01',status:'service',start:'08:00',end:'18:00',total:480,source:'Prise de service'}]).worked).toBe(480));
});