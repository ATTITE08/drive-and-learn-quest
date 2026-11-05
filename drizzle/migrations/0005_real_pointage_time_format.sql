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
       'departure_day',to_char(d.service_date,'DD'),'departure_hour',left(d.start_time::text,2),'departure_minute',substring(d.start_time::text,4,2),
       'arrival_day',to_char(d.service_date + CASE WHEN d.end_time<d.start_time THEN 1 ELSE 0 END,'DD'),
       'arrival_hour',left(d.end_time::text,2),'arrival_minute',substring(d.end_time::text,4,2),'distance_unknown',true))
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