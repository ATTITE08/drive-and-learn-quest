ALTER TABLE public.movement_records ADD COLUMN IF NOT EXISTS header jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.movement_records ADD COLUMN IF NOT EXISTS visas jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.movement_lines ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;