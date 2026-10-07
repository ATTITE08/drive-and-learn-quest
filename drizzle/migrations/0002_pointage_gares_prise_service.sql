CREATE TABLE public.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stations TO authenticated;
GRANT ALL ON public.stations TO service_role;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY stations_select ON public.stations FOR SELECT TO authenticated USING (true);
CREATE POLICY stations_admin ON public.stations FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

CREATE TABLE public.function_duty_rules (
  level public.agent_level PRIMARY KEY,
  requires_duty_log boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.function_duty_rules TO authenticated;
GRANT ALL ON public.function_duty_rules TO service_role;
ALTER TABLE public.function_duty_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY fdr_select ON public.function_duty_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY fdr_admin ON public.function_duty_rules FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

CREATE TYPE public.alcohol_result AS ENUM ('negatif','positif');

ALTER TABLE public.duty_logs
  ADD COLUMN fonction text,
  ADD COLUMN station_depart_id uuid REFERENCES public.stations(id),
  ADD COLUMN station_arrivee_id uuid REFERENCES public.stations(id),
  ADD COLUMN depot_depart_id uuid REFERENCES public.depots(id),
  ADD COLUMN depot_arrivee_id uuid REFERENCES public.depots(id),
  ADD COLUMN alcohol_test_number text,
  ADD COLUMN alcohol_test_time time,
  ADD COLUMN alcohol_test_result public.alcohol_result,
  ADD COLUMN service_line_id uuid REFERENCES public.service_sheet_lines(id) ON DELETE SET NULL,
  ADD COLUMN recorded_by uuid;

ALTER TABLE public.service_sheet_lines
  ADD COLUMN day_status text NOT NULL DEFAULT 'service',
  ADD COLUMN fonction text,
  ADD COLUMN roulement text,
  ADD COLUMN service_code text,
  ADD COLUMN planned_start time,
  ADD COLUMN planned_end time,
  ADD COLUMN planned_station_depart_id uuid REFERENCES public.stations(id),
  ADD COLUMN planned_station_arrivee_id uuid REFERENCES public.stations(id),
  ADD COLUMN planned_depot_depart_id uuid REFERENCES public.depots(id),
  ADD COLUMN planned_depot_arrivee_id uuid REFERENCES public.depots(id),
  ADD COLUMN actual_start time,
  ADD COLUMN actual_end time,
  ADD COLUMN actual_station_depart_id uuid REFERENCES public.stations(id),
  ADD COLUMN actual_station_arrivee_id uuid REFERENCES public.stations(id),
  ADD COLUMN actual_depot_depart_id uuid REFERENCES public.depots(id),
  ADD COLUMN actual_depot_arrivee_id uuid REFERENCES public.depots(id),
  ADD COLUMN actual_source_duty_log_id uuid;

ALTER TABLE public.service_sheet_lines ADD CONSTRAINT ssl_day_status_chk CHECK (day_status IN ('service','repos'));

-- Alcohol test mandatory on new duty logs
CREATE OR REPLACE FUNCTION public.validate_duty_log_alcohol()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(trim(NEW.alcohol_test_number),'') = '' OR NEW.alcohol_test_time IS NULL OR NEW.alcohol_test_result IS NULL THEN
    RAISE EXCEPTION 'Test d''alcoolémie obligatoire : numéro, heure et résultat';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER duty_logs_alcohol_check BEFORE INSERT ON public.duty_logs
FOR EACH ROW EXECUTE FUNCTION public.validate_duty_log_alcohol();

-- Keep planned data immutable from actual sync: sync only actual_* columns
CREATE OR REPLACE FUNCTION private.sync_duty_to_line(_log public.duty_logs)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_line uuid;
BEGIN
  v_line := _log.service_line_id;
  IF v_line IS NULL THEN
    SELECT l.id INTO v_line FROM public.service_sheet_lines l
      JOIN public.service_sheets s ON s.id = l.sheet_id
     WHERE l.agent_id = _log.agent_id AND s.service_date = _log.service_date
     ORDER BY l.created_at LIMIT 1;
  END IF;
  IF v_line IS NOT NULL THEN
    UPDATE public.service_sheet_lines SET
      actual_start = coalesce(_log.start_time, actual_start),
      actual_end = coalesce(_log.end_time, actual_end),
      actual_station_depart_id = coalesce(_log.station_depart_id, actual_station_depart_id),
      actual_station_arrivee_id = coalesce(_log.station_arrivee_id, actual_station_arrivee_id),
      actual_depot_depart_id = coalesce(_log.depot_depart_id, actual_depot_depart_id),
      actual_depot_arrivee_id = coalesce(_log.depot_arrivee_id, actual_depot_arrivee_id),
      actual_source_duty_log_id = _log.id
    WHERE id = v_line;
  END IF;
  RETURN v_line;
END $$;

CREATE OR REPLACE FUNCTION public.save_duty_log(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_log public.duty_logs; v_uid uuid := auth.uid(); v_line uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  v_id := nullif(_payload->>'id','')::uuid;
  IF v_id IS NULL THEN
    INSERT INTO public.duty_logs (agent_id, recorded_by, depot_id, service_date, post, fonction, start_time, end_time,
      station_depart_id, station_arrivee_id, depot_depart_id, depot_arrivee_id,
      alcohol_test_number, alcohol_test_time, alcohol_test_result, handover_from, equipment_ok, observations, status)
    VALUES (v_uid, v_uid, nullif(_payload->>'depot_depart_id','')::uuid, (_payload->>'service_date')::date,
      coalesce(nullif(_payload->>'post',''),'—'), nullif(_payload->>'fonction',''),
      nullif(_payload->>'start_time','')::time, nullif(_payload->>'end_time','')::time,
      nullif(_payload->>'station_depart_id','')::uuid, nullif(_payload->>'station_arrivee_id','')::uuid,
      nullif(_payload->>'depot_depart_id','')::uuid, nullif(_payload->>'depot_arrivee_id','')::uuid,
      nullif(_payload->>'alcohol_test_number',''), nullif(_payload->>'alcohol_test_time','')::time,
      nullif(_payload->>'alcohol_test_result','')::public.alcohol_result,
      nullif(_payload->>'handover_from',''), coalesce((_payload->>'equipment_ok')::boolean, true),
      nullif(_payload->>'observations',''), 'ouvert')
    RETURNING * INTO v_log;
  ELSE
    UPDATE public.duty_logs SET
      end_time = coalesce(nullif(_payload->>'end_time','')::time, end_time),
      station_arrivee_id = coalesce(nullif(_payload->>'station_arrivee_id','')::uuid, station_arrivee_id),
      depot_arrivee_id = coalesce(nullif(_payload->>'depot_arrivee_id','')::uuid, depot_arrivee_id),
      handover_to = coalesce(nullif(_payload->>'handover_to',''), handover_to),
      observations = coalesce(nullif(_payload->>'observations',''), observations),
      status = coalesce(nullif(_payload->>'status',''), status)
    WHERE id = v_id AND (agent_id = v_uid OR private.has_role(v_uid,'admin'))
    RETURNING * INTO v_log;
    IF v_log.id IS NULL THEN RAISE EXCEPTION 'Prise de service introuvable ou non autorisée'; END IF;
  END IF;
  v_line := private.sync_duty_to_line(v_log);
  IF v_line IS NOT NULL AND v_log.service_line_id IS NULL THEN
    UPDATE public.duty_logs SET service_line_id = v_line WHERE id = v_log.id;
  END IF;
  RETURN v_log.id;
END $$;
REVOKE ALL ON FUNCTION public.save_duty_log(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_duty_log(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private.sync_duty_to_line(public.duty_logs) FROM public, anon, authenticated;