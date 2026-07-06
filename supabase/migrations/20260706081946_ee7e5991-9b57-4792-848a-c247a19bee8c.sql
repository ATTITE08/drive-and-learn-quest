DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY profiles_select_admin_formateur
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'formateur'));