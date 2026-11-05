ALTER TABLE public.movement_lines ADD COLUMN source_duty_log_id uuid REFERENCES public.duty_logs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX movement_lines_unique_real_duty ON public.movement_lines(source_duty_log_id) WHERE source_duty_log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.fill_movement_from_duties(_record_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.movement_records; d record; n integer := 0; changed integer;
BEGIN
 SELECT * INTO r FROM public.movement_records WHERE id = _record_id;
 IF r.id IS NULL THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.agent_id::text,0));
 SELECT * INTO r FROM public.movement_records WHERE id = _record_id FOR UPDATE;
 IF r.status NOT IN ('brouillon','rejete') THEN RETURN 0; END IF;
 FOR d IN
   SELECT dl.*, sd.code AS dep_code, sa.code AS arr_code, sl.train_number,
          sl.details->>'locomotive' AS machine
   FROM public.duty_logs dl
   LEFT JOIN public.stations sd ON sd.id=dl.station_depart_id
   LEFT JOIN public.stations sa ON sa.id=dl.station_arrivee_id
   LEFT JOIN public.service_sheet_lines sl ON sl.id=dl.service_line_id AND sl.agent_id=dl.agent_id
   WHERE dl.agent_id=r.agent_id AND dl.service_date BETWEEN r.period_start AND r.period_end
     AND dl.status='cloture' AND dl.start_time IS NOT NULL AND dl.end_time IS NOT NULL
   ORDER BY dl.service_date, dl.start_time, dl.id
 LOOP
   INSERT INTO public.movement_lines(record_id,source_duty_log_id,work_date,service_type,train_number,departure,arrival,start_time,end_time,distance_km,hours,allowance_code,details)
   VALUES(r.id,d.id,d.service_date,'personnel_roulant',d.train_number,d.dep_code,d.arr_code,d.start_time,d.end_time,0,
     extract(epoch FROM (d.end_time-d.start_time + CASE WHEN d.end_time<d.start_time THEN interval '24 hours' ELSE interval '0' END))/3600,
     d.observations,
     jsonb_build_object('source','pointage_reel','machine_number',d.machine,
       'departure_day',to_char(d.service_date,'DD'),'departure_hour',to_char(d.start_time,'HH24'),'departure_minute',to_char(d.start_time,'MI'),
       'arrival_day',to_char(d.service_date + CASE WHEN d.end_time<d.start_time THEN 1 ELSE 0 END,'DD'),
       'arrival_hour',to_char(d.end_time,'HH24'),'arrival_minute',to_char(d.end_time,'MI'),'distance_unknown',true))
   ON CONFLICT(source_duty_log_id) WHERE source_duty_log_id IS NOT NULL DO UPDATE
   SET work_date=excluded.work_date,departure=excluded.departure,arrival=excluded.arrival,start_time=excluded.start_time,end_time=excluded.end_time,hours=excluded.hours,
       details=public.movement_lines.details || (excluded.details - 'machine_number' - 'distance_unknown')
   WHERE public.movement_lines.record_id=r.id
     AND (public.movement_lines.work_date,public.movement_lines.departure,public.movement_lines.arrival,public.movement_lines.start_time,public.movement_lines.end_time)
         IS DISTINCT FROM (excluded.work_date,excluded.departure,excluded.arrival,excluded.start_time,excluded.end_time);
   GET DIAGNOSTICS changed = ROW_COUNT; n := n+changed;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION private.fill_movement_from_duties(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.autofill_movement_on_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM private.fill_movement_from_duties(NEW.id); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION private.autofill_movement_on_record() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER movement_record_fill_real AFTER INSERT ON public.movement_records FOR EACH ROW EXECUTE FUNCTION private.autofill_movement_on_record();

CREATE OR REPLACE FUNCTION private.autofill_movement_on_duty()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record;
BEGIN
 IF NEW.status='cloture' AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
   FOR r IN SELECT id FROM public.movement_records WHERE agent_id=NEW.agent_id AND NEW.service_date BETWEEN period_start AND period_end AND status IN ('brouillon','rejete') ORDER BY created_at,id LOOP
     PERFORM private.fill_movement_from_duties(r.id);
   END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.autofill_movement_on_duty() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER duty_fill_real_movements AFTER INSERT OR UPDATE ON public.duty_logs FOR EACH ROW EXECUTE FUNCTION private.autofill_movement_on_duty();

CREATE OR REPLACE FUNCTION public.fill_movement_from_pointage(_start date DEFAULT NULL,_end date DEFAULT NULL,_record_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid := auth.uid(); r public.movement_records; p public.profiles; changed integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 IF _record_id IS NOT NULL THEN
   SELECT * INTO r FROM public.movement_records WHERE id=_record_id AND agent_id=uid FOR UPDATE;
   IF r.id IS NULL THEN RAISE EXCEPTION 'Relevé introuvable ou non autorisé'; END IF;
   IF r.status NOT IN ('brouillon','rejete') THEN RAISE EXCEPTION 'Un relevé transmis ou validé ne peut pas être rempli automatiquement'; END IF;
 ELSE
   IF _start IS NULL OR _end IS NULL OR _end<_start OR _end-_start>366 THEN RAISE EXCEPTION 'Période invalide'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.duty_logs WHERE agent_id=uid AND service_date BETWEEN _start AND _end AND status='cloture' AND start_time IS NOT NULL AND end_time IS NOT NULL) THEN
     RETURN jsonb_build_object('record_id',null,'changed',0,'reason','no_real_service');
   END IF;
   SELECT * INTO r FROM public.movement_records WHERE agent_id=uid AND period_start<=_end AND period_end>=_start ORDER BY created_at,id LIMIT 1 FOR UPDATE;
   IF r.id IS NOT NULL AND (r.period_start<>_start OR r.period_end<>_end OR r.status NOT IN ('brouillon','rejete')) THEN
     RAISE EXCEPTION 'Un relevé couvre déjà cette période : utilisez son brouillon, ou choisissez une autre période';
   END IF;
   IF r.id IS NULL THEN
     SELECT * INTO p FROM public.profiles WHERE id=uid;
     INSERT INTO public.movement_records(agent_id,reviewer_id,period_start,period_end,status,header)
       VALUES(uid,p.manager_id,_start,_end,'brouillon',jsonb_build_object('nom',p.full_name,'matricule',p.matricule,'mois',to_char(_start,'MM'),'annee',to_char(_start,'YYYY'))) RETURNING * INTO r;
   END IF;
 END IF;
 changed := private.fill_movement_from_duties(r.id);
 RETURN jsonb_build_object('record_id',r.id,'changed',changed,'total',(SELECT count(*) FROM public.movement_lines WHERE record_id=r.id AND source_duty_log_id IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION public.fill_movement_from_pointage(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fill_movement_from_pointage(date,date,uuid) TO authenticated;