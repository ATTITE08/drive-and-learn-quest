import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrainFront } from "lucide-react";
import { toast } from "sonner";
import { LEVELS } from "@/lib/constants";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

/** Le matricule sert d'identifiant et de mot de passe : on en dérive un email
 *  technique et un mot de passe conforme (6 caractères minimum). */
const normalizeMatricule = (m: string) => m.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const emailFromMatricule = (m: string) => `${normalizeMatricule(m)}@agents.local`;
const passwordFromMatricule = (m: string) => {
  const n = normalizeMatricule(m);
  return n.length >= 6 ? n : (n + n + n).slice(0, 6);
};

const FONCTIONS = [
  { value: "agent", label: "Agent" },
  { value: "formateur", label: "Formateur" },
  { value: "admin", label: "Administrateur" },
] as const;

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [matricule, setMatricule] = useState("");
  const [fullName, setFullName] = useState("");
  const [fonction, setFonction] = useState<string>("agent");
  const [level, setLevel] = useState<string>("");

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matricule.trim()) return toast.error("Saisissez votre matricule");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailFromMatricule(matricule),
      password: passwordFromMatricule(matricule),
    });
    setLoading(false);
    if (error) return toast.error("Matricule inconnu ou incorrect");
    toast.success("Connecté");
    navigate({ to: "/dashboard" });
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matricule.trim()) return toast.error("Saisissez votre matricule");
    if (!fullName.trim()) return toast.error("Saisissez votre nom complet");
    if (!level) return toast.error("Sélectionnez votre grade");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: emailFromMatricule(matricule),
      password: passwordFromMatricule(matricule),
      options: {
        data: {
          full_name: fullName.trim(),
          matricule: matricule.trim(),
          fonction,
          level,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        return toast.error("Ce matricule est déjà enregistré. Connectez-vous.");
      }
      return toast.error(error.message);
    }
    toast.success("Compte créé, vous pouvez vous connecter");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div
        className="hidden lg:flex flex-col justify-between p-12 text-rail-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-amber text-amber-foreground">
            <TrainFront className="h-5 w-5" />
          </span>
          RailFormation
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight">
            La rigueur ferroviaire,<br />
            <span className="text-amber">au service de vos équipes.</span>
          </h1>
          <p className="mt-4 max-w-md text-rail-foreground/80">
            Quatre matières — IGS, PRAC, Frein, Technologies. Quatre niveaux — de l'aide conducteur au chef de traction.
          </p>
        </div>
        <p className="text-xs text-rail-foreground/60">© RailFormation</p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <h2 className="font-display text-2xl font-bold">Bienvenue</h2>
          <p className="text-sm text-muted-foreground">Connectez-vous avec votre matricule.</p>

          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Créer un compte</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="matricule">Matricule</Label>
                  <Input
                    id="matricule"
                    required
                    autoComplete="username"
                    placeholder="Ex : 5020"
                    value={matricule}
                    onChange={(e) => setMatricule(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Votre matricule tient lieu d'identifiant et de mot de passe.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>Se connecter</Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="matricule2">Matricule</Label>
                  <Input
                    id="matricule2"
                    required
                    placeholder="Ex : 5020"
                    value={matricule}
                    onChange={(e) => setMatricule(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Il servira de mot de passe pour vous connecter.
                  </p>
                </div>
                <div>
                  <Label htmlFor="fullname">Nom complet</Label>
                  <Input id="fullname" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <Label>Fonction</Label>
                  <Select value={fonction} onValueChange={setFonction}>
                    <SelectTrigger><SelectValue placeholder="Sélectionnez votre fonction" /></SelectTrigger>
                    <SelectContent>
                      {FONCTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Grade</Label>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger><SelectValue placeholder="Sélectionnez votre grade" /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>Créer le compte</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
