import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, TrainFront } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/constants";
import { useQueryClient } from "@tanstack/react-query";

export function AppShell({ children, role }: { children: ReactNode; role: AppRole | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const nav = [
    { to: "/dashboard", label: "Tableau de bord" },
    { to: "/quizzes", label: "Questionnaires" },
    { to: "/results", label: role === "agent" ? "Mes résultats" : "Résultats" },
  ];
    if (role === "admin" || role === "formateur") {
      nav.push({ to: "/review", label: "Réponses" });
      nav.push({ to: "/builder", label: "Créer un quiz" });
    }
    if (role === "admin") nav.push({ to: "/admin", label: "Administration" });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-rail text-rail-foreground">
              <TrainFront className="h-5 w-5" />
            </span>
            <span>RailFormation</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname.startsWith(n.to)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {role && (
              <span className="hidden sm:inline rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground">
                {role}
              </span>
            )}
            {email && <span className="hidden md:inline text-sm text-muted-foreground">{email}</span>}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Déconnexion
            </Button>
          </div>
        </div>
        <div className="md:hidden border-t flex overflow-x-auto px-2 py-1.5 gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium",
                pathname.startsWith(n.to) ? "bg-secondary" : "text-muted-foreground",
              )}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        RailFormation — Plateforme d'évaluation des agents de conduite
      </footer>
    </div>
  );
}
