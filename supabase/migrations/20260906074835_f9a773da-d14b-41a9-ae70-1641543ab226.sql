ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.service_sheets
  ADD COLUMN IF NOT EXISTS sheet_type text NOT NULL DEFAULT 'ligne',
  ADD COLUMN IF NOT EXISTS footer jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.service_sheet_lines
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;