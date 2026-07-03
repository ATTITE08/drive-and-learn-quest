
-- Add support for open-ended "cas pratique" questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'qcm',
  ADD COLUMN IF NOT EXISTS model_answer text,
  ALTER COLUMN choices DROP NOT NULL,
  ALTER COLUMN correct_index DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_type_check') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_type_check CHECK (type IN ('qcm','cas_pratique'));
  END IF;
END $$;

ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS text_answer text;
