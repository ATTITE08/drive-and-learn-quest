
-- 1) Status enum
DO $$ BEGIN
  CREATE TYPE public.quiz_status AS ENUM ('draft','published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend quizzes
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS status public.quiz_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Existing quizzes should remain visible: mark all pre-existing as published v1
UPDATE public.quizzes
SET status = 'published', current_version = 1, published_at = COALESCE(published_at, created_at)
WHERE current_version = 0 AND status = 'draft';

-- 3) Update SELECT policy on quizzes: agents only see published
DROP POLICY IF EXISTS quizzes_select_auth ON public.quizzes;
CREATE POLICY quizzes_select_auth ON public.quizzes
  FOR SELECT
  USING (
    status = 'published'
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'formateur'::app_role)
  );

-- 4) Version snapshots table
CREATE TABLE IF NOT EXISTS public.quiz_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  subject public.subject NOT NULL,
  level public.agent_level NOT NULL,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, version)
);

GRANT SELECT, INSERT ON public.quiz_versions TO authenticated;
GRANT ALL ON public.quiz_versions TO service_role;

ALTER TABLE public.quiz_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY quiz_versions_staff_select ON public.quiz_versions
  FOR SELECT
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'formateur'::app_role)
  );

CREATE POLICY quiz_versions_staff_insert ON public.quiz_versions
  FOR INSERT
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'formateur'::app_role)
  );

CREATE INDEX IF NOT EXISTS quiz_versions_quiz_id_version_idx
  ON public.quiz_versions (quiz_id, version DESC);
