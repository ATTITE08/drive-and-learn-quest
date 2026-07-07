
-- 1) Private schema for internal role helpers (removes them from the public REST API)
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.get_user_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'formateur' THEN 2 ELSE 3 END LIMIT 1 $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_user_role(uuid) TO authenticated, service_role;

-- 2) Repoint every RLS policy that used public.has_role → private.has_role
DROP POLICY IF EXISTS profiles_select_admin_formateur ON public.profiles;
CREATE POLICY profiles_select_admin_formateur ON public.profiles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'));

DROP POLICY IF EXISTS profiles_update_self_or_admin ON public.profiles;
CREATE POLICY profiles_update_self_or_admin ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = id OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS user_roles_admin_manage ON public.user_roles;
CREATE POLICY user_roles_admin_manage ON public.user_roles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_self_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS documents_admin_write ON public.documents;
CREATE POLICY documents_admin_write ON public.documents FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS attempts_select_self_or_staff ON public.attempts;
CREATE POLICY attempts_select_self_or_staff ON public.attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'));

DROP POLICY IF EXISTS questions_admin_write ON public.questions;
CREATE POLICY questions_admin_write ON public.questions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'));

DROP POLICY IF EXISTS answers_select_via_attempt ON public.answers;
CREATE POLICY answers_select_via_attempt ON public.answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = answers.attempt_id
    AND (a.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'))));

DROP POLICY IF EXISTS quizzes_admin_write ON public.quizzes;
CREATE POLICY quizzes_admin_write ON public.quizzes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'));

-- Storage bucket policies
DROP POLICY IF EXISTS documents_bucket_admin_delete ON storage.objects;
CREATE POLICY documents_bucket_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS documents_bucket_admin_insert ON storage.objects;
CREATE POLICY documents_bucket_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS documents_bucket_admin_update ON storage.objects;
CREATE POLICY documents_bucket_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS documents_bucket_select_auth ON storage.objects;
CREATE POLICY documents_bucket_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur')));

-- 3) Drop the public helpers so they no longer appear in the API surface
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- 4) Trigger-only function: no need to expose to signed-in users
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- 5) Restrict documents visibility to staff (hides content_text and storage_path)
DROP POLICY IF EXISTS documents_select_auth ON public.documents;
CREATE POLICY documents_select_staff ON public.documents FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'));

-- 6) Restrict questions base-table visibility to staff (hides correct_index and model_answer)
DROP POLICY IF EXISTS questions_select_auth ON public.questions;
CREATE POLICY questions_select_staff ON public.questions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'formateur'));
