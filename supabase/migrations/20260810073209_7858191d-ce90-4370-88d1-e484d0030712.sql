ALTER TYPE public.agent_level ADD VALUE IF NOT EXISTS 'chef_cours';
ALTER TYPE public.agent_level ADD VALUE IF NOT EXISTS 'surveillant';
ALTER TYPE public.agent_level ADD VALUE IF NOT EXISTS 'chef_commande_conducteur';
ALTER TYPE public.agent_level ADD VALUE IF NOT EXISTS 'chef_depot';
ALTER TYPE public.agent_level ADD VALUE IF NOT EXISTS 'chef_departement';
ALTER TYPE public.agent_level ADD VALUE IF NOT EXISTS 'assistant_chef_departement';

CREATE TABLE IF NOT EXISTS public.depots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.depots TO authenticated;
GRANT ALL ON public.depots TO service_role;
ALTER TABLE public.depots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "depots_select_auth" ON public.depots FOR SELECT TO authenticated USING (true);
CREATE POLICY "depots_admin_write" ON public.depots FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_depots_updated_at BEFORE UPDATE ON public.depots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.depots (name, code) VALUES
  ('Douala', 'DLA'), ('Yaoundé', 'YDE'), ('Belabo', 'BLB'), ('Ngaoundéré', 'NGD')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matricule text;

CREATE INDEX IF NOT EXISTS profiles_manager_id_idx ON public.profiles(manager_id);
CREATE INDEX IF NOT EXISTS profiles_depot_id_idx ON public.profiles(depot_id);

CREATE OR REPLACE FUNCTION private.is_manager_of(_manager uuid, _profile uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _profile AND p.manager_id = _manager);
$$;

CREATE POLICY "profiles_select_team" ON public.profiles FOR SELECT TO authenticated
  USING (private.is_manager_of(auth.uid(), id) OR id = (SELECT manager_id FROM public.profiles me WHERE me.id = auth.uid()));
