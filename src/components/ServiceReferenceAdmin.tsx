import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LEVELS, type Level } from '@/lib/constants';
import { Pencil, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

export function ServiceReferenceAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ id: '', code: '', name: '' });
  const { data, error } = useQuery({ queryKey: ['service-references'], queryFn: async () => {
    const [stations, rules] = await Promise.all([supabase.from('stations').select('*').order('code'), supabase.from('function_duty_rules').select('*')]);
    if (stations.error) throw stations.error; if (rules.error) throw rules.error;
    return { stations: stations.data, rules: rules.data };
  } });
  const changed = () => { qc.invalidateQueries({queryKey:['service-references']}); qc.invalidateQueries({queryKey:['service-sheets']}); qc.invalidateQueries({queryKey:['duty-logs']}); };
  const save = useMutation({ mutationFn: async () => {
    if (!/^\d{1,10}$/.test(form.code.trim()) || !form.name.trim()) throw new Error('Renseignez un code numérique et un nom');
    const value = { code: form.code.trim(), name: form.name.trim() };
    const result = form.id ? await supabase.from('stations').update(value).eq('id',form.id).select('id').single() : await supabase.from('stations').insert(value).select('id').single();
    if (result.error) throw result.error;
  }, onSuccess: () => {setForm({id:'',code:'',name:''}); changed(); toast.success('Gare enregistrée');}, onError: e => toast.error(e.message) });
  const active = useMutation({mutationFn: async ({id,value}:{id:string;value:boolean}) => {
    const {error} = await supabase.from('stations').update({active:value}).eq('id',id).select('id').single(); if(error) throw error;
  }, onSuccess: changed, onError: e => toast.error(e.message)});
  const rule = useMutation({mutationFn: async ({level,value}:{level:Level;value:boolean}) => {
    const {error} = await supabase.from('function_duty_rules').upsert({level,requires_duty_log:value,updated_at:new Date().toISOString()}).select('level').single(); if(error) throw error;
  }, onSuccess:changed, onError:e=>toast.error(e.message)});
  return <div className="space-y-8">
    {error && <p role="alert" className="text-destructive">{error.message}</p>}
    <section className="space-y-4"><h2 className="font-display text-xl font-semibold">Gares CAMRAIL</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();save.mutate();}}>
        <div><Label htmlFor="station-code">Code gare</Label><Input id="station-code" value={form.code} maxLength={10} onChange={e=>setForm({...form,code:e.target.value})} required /></div>
        <div className="min-w-0 flex-1"><Label htmlFor="station-name">Nom de la gare</Label><Input id="station-name" value={form.name} maxLength={160} onChange={e=>setForm({...form,name:e.target.value})} required /></div>
        <Button disabled={save.isPending} type="submit">{form.id ? <Save className="mr-2 h-4 w-4"/> : <Plus className="mr-2 h-4 w-4"/>}{form.id ? 'Enregistrer' : 'Ajouter'}</Button>
        {form.id && <Button type="button" variant="outline" onClick={()=>setForm({id:'',code:'',name:''})}>Annuler</Button>}
      </form>
      <Input aria-label="Rechercher une gare" placeholder="Code ou nom de gare" value={search} onChange={e=>setSearch(e.target.value)}/>
      <p className="text-sm text-muted-foreground">{data?.stations.length ?? 0} gares</p>
      <div className="max-h-[500px] overflow-y-auto divide-y">{data?.stations.filter(s=>`${s.code} ${s.name}`.toLowerCase().includes(search.toLowerCase())).map(s=><div key={s.id} className="flex items-center gap-3 py-3"><span className="min-w-0 flex-1 text-sm">{s.code} — {s.name}</span><Switch aria-label={`Gare active ${s.code}`} checked={s.active} disabled={active.isPending} onCheckedChange={value=>active.mutate({id:s.id,value})}/><Button aria-label={`Modifier ${s.code}`} title="Modifier la gare" size="icon" variant="ghost" onClick={()=>setForm({id:s.id,code:s.code,name:s.name})}><Pencil className="h-4 w-4"/></Button></div>)}</div>
    </section>
    <section className="space-y-4"><h2 className="font-display text-xl font-semibold">Fonctions — prise de service requise</h2><div className="divide-y">{LEVELS.map(l=><div key={l.value} className="flex items-center justify-between gap-4 py-3"><Label htmlFor={`rule-${l.value}`}>{l.label}</Label><Switch id={`rule-${l.value}`} checked={data?.rules.find(r=>r.level===l.value)?.requires_duty_log ?? false} disabled={rule.isPending} onCheckedChange={value=>rule.mutate({level:l.value,value})}/></div>)}</div></section>
  </div>;
}