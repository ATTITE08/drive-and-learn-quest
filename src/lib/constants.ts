export const SUBJECTS = [
  { value: "igs", label: "IGS", description: "Instructions Générales de Sécurité" },
  { value: "prac", label: "PRAC", description: "Procédures de Conduite" },
  { value: "frein", label: "Frein", description: "Systèmes de freinage" },
  { value: "technologies", label: "Technologies", description: "Matériel roulant & électricité" },
] as const;

export const LEVELS = [
  { value: "aide_conducteur", label: "Aide conducteur", order: 1 },
  { value: "conducteur_manoeuvre", label: "Conducteur de manœuvre", order: 2 },
  { value: "conducteur_ligne", label: "Conducteur de ligne", order: 3 },
  { value: "chef_traction", label: "Chef de traction", order: 4 },
] as const;

export type Subject = (typeof SUBJECTS)[number]["value"];
export type Level = (typeof LEVELS)[number]["value"];
export type AppRole = "admin" | "formateur" | "agent";

export const subjectLabel = (s: string) => SUBJECTS.find((x) => x.value === s)?.label ?? s;
export const levelLabel = (l: string) => LEVELS.find((x) => x.value === l)?.label ?? l;
