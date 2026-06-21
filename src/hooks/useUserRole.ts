import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/constants";

export function useUserRole() {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async (): Promise<{ userId: string; role: AppRole | null; profile: any | null }> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return { userId: "", role: null, profile: null };
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      ]);
      const list = (roles ?? []).map((r: any) => r.role) as AppRole[];
      const role: AppRole | null =
        list.includes("admin") ? "admin" : list.includes("formateur") ? "formateur" : list.includes("agent") ? "agent" : null;
      return { userId: user.id, role, profile };
    },
  });
}
