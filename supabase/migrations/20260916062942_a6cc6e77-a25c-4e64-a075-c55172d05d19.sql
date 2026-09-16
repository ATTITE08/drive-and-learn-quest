DELETE FROM public.answers a
USING public.attempts att
WHERE a.attempt_id = att.id
  AND att.id NOT IN (
    SELECT DISTINCT ON (quiz_id, user_id) id
    FROM public.attempts
    ORDER BY quiz_id, user_id, created_at ASC
  );

DELETE FROM public.attempts
WHERE id NOT IN (
  SELECT DISTINCT ON (quiz_id, user_id) id
  FROM public.attempts
  ORDER BY quiz_id, user_id, created_at ASC
);

CREATE UNIQUE INDEX attempts_quiz_user_unique ON public.attempts (quiz_id, user_id);