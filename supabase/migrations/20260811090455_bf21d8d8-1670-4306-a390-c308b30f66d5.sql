
-- ===== INCIDENT REPORTS =====
CREATE TABLE public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_holder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  location text NOT NULL DEFAULT '',
  train_number text,
  severity text NOT NULL DEFAULT 'mineur',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  measures text,
  status text NOT NULL DEFAULT 'brouillon',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_reports TO authenticated;
GRANT ALL ON public.incident_reports TO service_role;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_reports_insert_self ON public.incident_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY incident_reports_select_scope ON public.incident_reports
  FOR SELECT TO authenticated USING (
    auth.uid() = author_id
    OR auth.uid() = current_holder_id
    OR private.is_manager_of(auth.uid(), author_id)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'formateur'::app_role)
  );
CREATE POLICY incident_reports_update_scope ON public.incident_reports
  FOR UPDATE TO authenticated USING (
    (auth.uid() = author_id AND status = 'brouillon')
    OR auth.uid() = current_holder_id
    OR private.has_role(auth.uid(), 'admin'::app_role)
  ) WITH CHECK (
    (auth.uid() = author_id)
    OR auth.uid() = current_holder_id
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY incident_reports_delete_own_draft ON public.incident_reports
  FOR DELETE TO authenticated USING (
    (auth.uid() = author_id AND status = 'brouillon') OR private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TABLE public.incident_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  forwarded_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.incident_actions TO authenticated;
GRANT ALL ON public.incident_actions TO service_role;
ALTER TABLE public.incident_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_actions_select_via_report ON public.incident_actions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.incident_reports r WHERE r.id = incident_actions.report_id
  ));
CREATE POLICY incident_actions_insert_self ON public.incident_actions
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = actor_id AND EXISTS (SELECT 1 FROM public.incident_reports r WHERE r.id = incident_actions.report_id)
  );

-- ===== RELEVE DE MOUVEMENT =====
CREATE TABLE public.movement_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'brouillon',
  review_comment text,
  submitted_at timestamptz,
  validated_at timestamptz,
  payroll_exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_records TO authenticated;
GRANT ALL ON public.movement_records TO service_role;
ALTER TABLE public.movement_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY movement_records_insert_self ON public.movement_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
CREATE POLICY movement_records_select_scope ON public.movement_records
  FOR SELECT TO authenticated USING (
    auth.uid() = agent_id
    OR auth.uid() = reviewer_id
    OR private.is_manager_of(auth.uid(), agent_id)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY movement_records_update_scope ON public.movement_records
  FOR UPDATE TO authenticated USING (
    (auth.uid() = agent_id AND status IN ('brouillon','rejete'))
    OR auth.uid() = reviewer_id
    OR private.is_manager_of(auth.uid(), agent_id)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  ) WITH CHECK (
    auth.uid() = agent_id
    OR auth.uid() = reviewer_id
    OR private.is_manager_of(auth.uid(), agent_id)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY movement_records_delete_own_draft ON public.movement_records
  FOR DELETE TO authenticated USING (
    (auth.uid() = agent_id AND status IN ('brouillon','rejete')) OR private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TABLE public.movement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.movement_records(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  service_type text NOT NULL DEFAULT 'conduite',
  train_number text,
  departure text,
  arrival text,
  start_time time,
  end_time time,
  distance_km numeric NOT NULL DEFAULT 0,
  hours numeric NOT NULL DEFAULT 0,
  allowance_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_lines TO authenticated;
GRANT ALL ON public.movement_lines TO service_role;
ALTER TABLE public.movement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY movement_lines_select_via_record ON public.movement_lines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.movement_records r WHERE r.id = movement_lines.record_id
  ));
CREATE POLICY movement_lines_write_via_record ON public.movement_lines
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.movement_records r
    WHERE r.id = movement_lines.record_id
      AND (r.agent_id = auth.uid() OR r.reviewer_id = auth.uid() OR private.is_manager_of(auth.uid(), r.agent_id))
  ));
CREATE POLICY movement_lines_update_via_record ON public.movement_lines
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.movement_records r
    WHERE r.id = movement_lines.record_id
      AND (r.agent_id = auth.uid() OR r.reviewer_id = auth.uid() OR private.is_manager_of(auth.uid(), r.agent_id))
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.movement_records r
    WHERE r.id = movement_lines.record_id
      AND (r.agent_id = auth.uid() OR r.reviewer_id = auth.uid() OR private.is_manager_of(auth.uid(), r.agent_id))
  ));
CREATE POLICY movement_lines_delete_via_record ON public.movement_lines
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.movement_records r
    WHERE r.id = movement_lines.record_id
      AND (r.agent_id = auth.uid() OR r.reviewer_id = auth.uid() OR private.is_manager_of(auth.uid(), r.agent_id))
  ));

-- ===== FEUILLE DE SERVICE (chef commande conducteur) =====
CREATE TABLE public.service_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  service_date date NOT NULL,
  shift text NOT NULL DEFAULT 'jour',
  status text NOT NULL DEFAULT 'brouillon',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_sheets TO authenticated;
GRANT ALL ON public.service_sheets TO service_role;
ALTER TABLE public.service_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_sheets_select_auth ON public.service_sheets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY service_sheets_insert_self ON public.service_sheets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY service_sheets_update_owner ON public.service_sheets
  FOR UPDATE TO authenticated USING (auth.uid() = created_by OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY service_sheets_delete_owner ON public.service_sheets
  FOR DELETE TO authenticated USING (auth.uid() = created_by OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.service_sheet_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.service_sheets(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_name text,
  role_label text,
  train_number text,
  start_time time,
  end_time time,
  task text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_sheet_lines TO authenticated;
GRANT ALL ON public.service_sheet_lines TO service_role;
ALTER TABLE public.service_sheet_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_sheet_lines_select_auth ON public.service_sheet_lines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY service_sheet_lines_write_owner ON public.service_sheet_lines
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.service_sheets s WHERE s.id = service_sheet_lines.sheet_id AND s.created_by = auth.uid()
  ));
CREATE POLICY service_sheet_lines_update_owner ON public.service_sheet_lines
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.service_sheets s WHERE s.id = service_sheet_lines.sheet_id AND s.created_by = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.service_sheets s WHERE s.id = service_sheet_lines.sheet_id AND s.created_by = auth.uid()
  ));
CREATE POLICY service_sheet_lines_delete_owner ON public.service_sheet_lines
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.service_sheets s WHERE s.id = service_sheet_lines.sheet_id AND s.created_by = auth.uid()
  ));

-- ===== FEUILLE DE PRISE DE SERVICE (surveillance) =====
CREATE TABLE public.duty_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  service_date date NOT NULL DEFAULT current_date,
  post text NOT NULL DEFAULT '',
  start_time time,
  end_time time,
  handover_from text,
  handover_to text,
  equipment_ok boolean NOT NULL DEFAULT true,
  observations text,
  status text NOT NULL DEFAULT 'ouvert',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_logs TO authenticated;
GRANT ALL ON public.duty_logs TO service_role;
ALTER TABLE public.duty_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY duty_logs_insert_self ON public.duty_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
CREATE POLICY duty_logs_select_scope ON public.duty_logs
  FOR SELECT TO authenticated USING (
    auth.uid() = agent_id
    OR private.is_manager_of(auth.uid(), agent_id)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'formateur'::app_role)
  );
CREATE POLICY duty_logs_update_scope ON public.duty_logs
  FOR UPDATE TO authenticated USING (auth.uid() = agent_id OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = agent_id OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY duty_logs_delete_own ON public.duty_logs
  FOR DELETE TO authenticated USING (auth.uid() = agent_id OR private.has_role(auth.uid(), 'admin'::app_role));

-- triggers updated_at
CREATE TRIGGER update_incident_reports_updated_at BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER update_movement_records_updated_at BEFORE UPDATE ON public.movement_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER update_service_sheets_updated_at BEFORE UPDATE ON public.service_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER update_duty_logs_updated_at BEFORE UPDATE ON public.duty_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_incident_reports_author ON public.incident_reports(author_id);
CREATE INDEX idx_incident_reports_holder ON public.incident_reports(current_holder_id);
CREATE INDEX idx_movement_records_agent ON public.movement_records(agent_id);
CREATE INDEX idx_movement_lines_record ON public.movement_lines(record_id);
CREATE INDEX idx_service_sheet_lines_sheet ON public.service_sheet_lines(sheet_id);
CREATE INDEX idx_duty_logs_agent ON public.duty_logs(agent_id);
