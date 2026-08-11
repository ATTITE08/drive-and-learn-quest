CREATE OR REPLACE FUNCTION private.my_manager_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT manager_id FROM public.profiles WHERE id = _user_id
$$;

DROP POLICY IF EXISTS profiles_select_team ON public.profiles;

CREATE POLICY profiles_select_team ON public.profiles
FOR SELECT TO authenticated
USING (
  private.is_manager_of(auth.uid(), id)
  OR id = private.my_manager_id(auth.uid())
);