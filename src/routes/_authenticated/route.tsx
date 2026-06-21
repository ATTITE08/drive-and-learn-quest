import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { data, isLoading } = useUserRole();
  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Chargement…</div>;
  }
  return (
    <AppShell role={data?.role ?? null}>
      <Outlet />
    </AppShell>
  );
}
