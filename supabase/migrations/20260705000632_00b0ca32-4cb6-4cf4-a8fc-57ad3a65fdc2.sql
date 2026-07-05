ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 1;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS criteria jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.answers ADD COLUMN IF NOT EXISTS criteria_scores jsonb;