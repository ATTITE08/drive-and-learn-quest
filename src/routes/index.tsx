import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TrainFront, BookOpen, Gauge, Wrench, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-rail text-rail-foreground">
              <TrainFront className="h-5 w-5" />
            </span>
            RailFormation
          </div>
          <Link to="/auth" className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
            Connexion
          </Link>
        </div>
      </header>

      <section
        className="relative overflow-hidden border-b"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-20 md:py-28 lg:grid-cols-2 lg:gap-12">
          <div className="text-rail-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber/50 bg-amber/15 px-3 py-1 text-xs font-medium uppercase tracking-wider text-amber">
              <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
              Formation ferroviaire
            </span>
            <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] md:text-6xl">
              Évaluez vos agents <br />
              <span className="text-amber">en toute rigueur.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-rail-foreground/80">
              Plateforme d'étude pour les agents de conduite : 4 matières, 4 niveaux, des
              questionnaires générés automatiquement à partir de vos documents officiels.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="rounded-md bg-amber px-6 py-3 font-medium text-amber-foreground shadow-lg hover:brightness-105">
                Commencer maintenant
              </Link>
              <a href="#matieres" className="rounded-md border border-rail-foreground/30 px-6 py-3 font-medium text-rail-foreground hover:bg-rail-foreground/10">
                Voir les matières
              </a>
            </div>
          </div>
          <div className="hidden lg:block relative">
            <div className="absolute inset-0 grid grid-cols-2 gap-4 p-4">
              {[
                { icon: ShieldCheck, label: "IGS", desc: "Sécurité" },
                { icon: BookOpen, label: "PRAC", desc: "Procédures" },
                { icon: Gauge, label: "Frein", desc: "Freinage" },
                { icon: Wrench, label: "Technologies", desc: "Matériel" },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-rail-foreground/15 bg-rail-foreground/5 p-6 backdrop-blur transition-transform hover:-translate-y-1"
                  style={{ animation: `float 6s ease-in-out ${i * 0.5}s infinite` }}
                >
                  <s.icon className="h-8 w-8 text-amber" />
                  <p className="mt-4 font-display text-2xl font-bold text-rail-foreground">{s.label}</p>
                  <p className="text-sm text-rail-foreground/70">{s.desc}</p>
                </div>
              ))}
            </div>
            <div className="aspect-square" />
          </div>
        </div>
        <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
      </section>

      <section id="matieres" className="mx-auto max-w-7xl px-4 py-20">
        <h2 className="font-display text-3xl font-bold md:text-4xl">Comment ça fonctionne</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", t: "Importez vos documents", d: "L'administrateur upload les supports officiels par matière et par niveau." },
            { n: "02", t: "Génération automatique", d: "L'IA produit des questionnaires QCM à partir du contenu des documents." },
            { n: "03", t: "Notation des agents", d: "Chaque agent passe les tests, obtient un score et conserve son historique." },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="font-mono text-sm text-rail">{s.n}</div>
              <h3 className="mt-2 font-display text-xl font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        © RailFormation — Plateforme d'évaluation
      </footer>
    </div>
  );
}
