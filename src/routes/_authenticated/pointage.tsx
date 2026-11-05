import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculatePointage, hoursLabel, type DayInput } from '@/lib/pointage';
import { Printer, FileInput } from 'lucide-react';
import { toast } from 'sonner';
import { eligibleRealMovements } from '@/lib/movement-autofill';

const pointageQuery = queryOptions({queryKey:['pointage'],queryFn:async()=>{
  const auth=await supabase.auth.getUser(); if(!auth.data.user) throw new Error('Connexion requise');
  const [profiles,sheets,lines,logs]=await Promise.all([
    supabase.from('profiles').select('id,full_name,matricule').order('full_name'),
    supabase.from('service_sheets').select('id,service_date'),
    supabase.from('service_sheet_lines').select('*'),
    supabase.from('duty_logs').select('*').order('start_time'),
  ]);
  for(const result of [profiles,sheets,lines,logs]) if(result.error) throw result.error;
  return {uid:auth.data.user.id,profiles:profiles.data??[],sheets:sheets.data??[],lines:lines.data??[],logs:logs.data??[]};
}});
export const Route=createFileRoute('/_authenticated/pointage')({
  loader:({context})=>context.queryClient.ensureQueryData(pointageQuery),
  component:PointagePage,
  head:()=>({meta:[{title:'Feuille de pointage — CAMRAIL'},{name:'description',content:'Pointage mensuel des agents : heures réelles et prévues, repos et heures supplémentaires par roulement.'},{property:'og:title',content:'Feuille de pointage — CAMRAIL'},{property:'og:description',content:'Heures travaillées, roulements et heures supplémentaires des agents CAMRAIL.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]})
});
function PointagePage(){
  const {data}=useSuspenseQuery(pointageQuery);
  const navigate=useNavigate();
  const qc=useQueryClient();
  const [agent,setAgent]=useState(data.uid);
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [year,m]=month.split('-').map(Number);
  const count=Number.isFinite(year)&&Number.isFinite(m)?new Date(year,m,0).getDate():0;
  const fill=useMutation({mutationFn:async()=>{
    const start=`${month}-01`,end=`${month}-${String(count).padStart(2,'0')}`;
    const real=eligibleRealMovements(data.logs.filter(l=>l.agent_id===data.uid).map(l=>({...l,departure:null,arrival:null})),start,end);
    if(!real.length) throw new Error('Aucun service réel clôturé pour cette période');
    const result=await supabase.rpc('fill_movement_from_pointage',{_start:start,_end:end});
    if(result.error) throw result.error;
    return result.data as {record_id:string|null};
  },onSuccess:async(result)=>{
    if(!result.record_id){toast.info('Aucun service réel clôturé pour cette période');return;}
    await qc.invalidateQueries({queryKey:['movements']});
    toast.success('Relevé rempli depuis les services réels');
    navigate({to:'/mouvements'});
  },onError:(e:Error)=>toast.error(e.message)});
  const days:DayInput[]=Array.from({length:count},(_,i)=>{
    const date=`${month}-${String(i+1).padStart(2,'0')}`;
    const sheets=data.sheets.filter(s=>s.service_date===date).map(s=>s.id);
    const lines=data.lines.filter(l=>l.agent_id===agent&&sheets.includes(l.sheet_id));
    const logs=data.logs.filter(l=>l.agent_id===agent&&l.service_date===date);
    if(logs.length) {
      const total=logs.reduce((s,l)=>s+(calculatePointage([{date,status:'service',start:l.start_time,end:l.end_time,source:'Prise de service'}]).worked),0);
      // Multiple vacations remain a single working day, with their durations summed below.
      return {date,status:'service',start:logs[0]?.start_time??null,end:logs.at(-1)?.end_time??null,source:'Prise de service',roulement:lines[0]?.roulement,total,open:logs.some(l=>!l.end_time)};
    }
    const line=lines[0];
    if(!line) return {date,status:'absent',start:null,end:null,source:'—'};
    return {date,status:line.day_status,start:line.actual_start??line.planned_start??line.start_time,end:line.actual_source_duty_log_id?line.actual_end:line.planned_end??line.end_time,source:line.actual_source_duty_log_id?'Prise de service':'Feuille de service',roulement:line.roulement};
  });
  const result=calculatePointage(days);
  const profile=data.profiles.find(p=>p.id===agent);
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-2xl font-bold">Feuille de pointage</h1><div className="no-print flex flex-wrap gap-2">{agent===data.uid&&<Button variant="outline" onClick={()=>fill.mutate()} disabled={fill.isPending||!count}><FileInput className="mr-2 h-4 w-4"/>Remplir mon relevé</Button>}<Button variant="outline" onClick={()=>window.print()}><Printer className="mr-2 h-4 w-4"/>Imprimer / PDF</Button></div></div>
    <div className="no-print grid gap-4 sm:grid-cols-2"><div><Label>Agent</Label><Select value={agent} onValueChange={setAgent}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{data.profiles.map(p=><SelectItem key={p.id} value={p.id}>{p.full_name||p.matricule||'Agent'}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="pointage-month">Mois</Label><Input id="pointage-month" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div></div>
    <p className="font-semibold">{profile?.full_name??'Agent'} · {profile?.matricule??'—'} · {month}</p>
    {result.incomplete&&<p role="status" className="text-destructive">Pointage provisoire : des services ne sont pas clôturés.</p>}
    <dl className="grid grid-cols-2 gap-4 border-y py-4 lg:grid-cols-4">{[['Heures travaillées',result.worked],['Heures normales',result.normal],['Sup. potentielles',result.potential],['Sup. retenues',result.retained]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-bold">{hoursLabel(Number(value))}</dd></div>)}</dl>
    <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b text-left">{['Jour','Statut','Prise','Fin','Heures','Source','Roulement'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{result.rows.map(r=><tr key={r.date} className="border-b"><td className="p-2">{r.date.slice(8)}</td><td className="p-2">{r.status==='repos'?'REPOS':r.status==='service'?'SERVICE':'—'}</td><td className="p-2">{r.start?.slice(0,5)??'—'}</td><td className="p-2">{r.end?.slice(0,5)??'—'}</td><td className="p-2">{r.minutes===null?'—':hoursLabel(r.minutes)}</td><td className="p-2">{r.source}</td><td className="p-2">{r.roulement||r.group||'—'}</td></tr>)}</tbody></table></div>
    <section><h2 className="mb-3 font-display text-lg font-semibold">Totaux par roulement</h2><div className="overflow-x-auto"><table className="w-full min-w-[500px] text-sm"><thead><tr className="border-b text-left">{['Roulement','Jours travaillés','Heures','Normales (40 h)','Sup. potentielles'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{result.groups.map(g=><tr className="border-b" key={g.number}><td className="p-2">{g.number}</td><td className="p-2">{g.days}</td><td className="p-2">{hoursLabel(g.minutes)}</td><td className="p-2">{hoursLabel(g.normal)}</td><td className="p-2">{hoursLabel(g.potential)}</td></tr>)}</tbody></table></div></section>
  </div>;
}