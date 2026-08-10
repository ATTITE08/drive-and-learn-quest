CREATE POLICY "attempts_select_team" ON public.attempts FOR SELECT TO authenticated
  USING (private.is_manager_of(auth.uid(), user_id));

CREATE POLICY "answers_select_team" ON public.answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = answers.attempt_id AND private.is_manager_of(auth.uid(), a.user_id)));
