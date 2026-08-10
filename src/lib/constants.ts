export const SUBJECTS = [
  { value: "igs", label: "IGS", description: "Instructions Générales de Sécurité" },
  { value: "prac", label: "PRAC", description: "Procédures de Conduite" },
  { value: "frein", label: "Frein", description: "Systèmes de freinage" },
  { value: "technologies", label: "Technologies", description: "Matériel roulant & électricité" },
] as const;

export const LEVELS = [
  { value: "aide_conducteur", label: "Aide conducteur", order: 1, grade: 4, group: "execution" },
  { value: "chef_cours", label: "Chef de cours", order: 2, grade: 4, group: "execution" },
  { value: "surveillant", label: "Surveillant", order: 3, grade: 5, group: "execution" },
  { value: "conducteur_manoeuvre", label: "Conducteur de manœuvre", order: 4, grade: 6, group: "conduite" },
  { value: "conducteur_ligne", label: "Conducteur de ligne", order: 5, grade: 8, group: "conduite" },
  { value: "chef_commande_conducteur", label: "Chef commande conducteur", order: 6, grade: null, group: "encadrement" },
  { value: "chef_traction", label: "Chef de traction", order: 7, grade: null, group: "encadrement" },
  { value: "chef_depot", label: "Chef de dépôt traction", order: 8, grade: null, group: "direction" },
  { value: "assistant_chef_departement", label: "Assistant chef département conduite", order: 9, grade: null, group: "direction" },
  { value: "chef_departement", label: "Chef département conduite", order: 10, grade: null, group: "direction" },
] as const;

export const LEVEL_MISSIONS: Record<string, string> = {
  aide_conducteur: "Assure l'aide à la conduite et peut tenir les fonctions de surveillance et de chef de cours.",
  chef_cours: "Responsable du cours (rame/convoi) et des opérations associées.",
  surveillant: "Surveillance des circulations et des opérations en gare.",
  conducteur_manoeuvre: "Conduite de manœuvre en gare, plus toutes les fonctions des niveaux précédents.",
  conducteur_ligne: "Conduite des trains en ligne, plus toutes les fonctions des niveaux précédents.",
  chef_commande_conducteur: "Coordonne et planifie le service de tous les agents de conduite.",
  chef_traction: "Chef d'un groupe d'agents : suivi et maintien de la performance de production.",
  chef_depot: "Dirige un dépôt traction (Douala, Yaoundé, Belabo, Ngaoundéré).",
  assistant_chef_departement: "Assiste le chef du département conduite.",
  chef_departement: "Dirige le département conduite du réseau.",
};

export const DEPOTS = ["Douala", "Yaoundé", "Belabo", "Ngaoundéré"] as const;

export type Subject = (typeof SUBJECTS)[number]["value"];
export type Level = (typeof LEVELS)[number]["value"];
export type AppRole = "admin" | "formateur" | "agent";

export const subjectLabel = (s: string) => SUBJECTS.find((x) => x.value === s)?.label ?? s;
export const levelLabel = (l: string) => LEVELS.find((x) => x.value === l)?.label ?? l;
export const levelOrder = (l?: string | null) => LEVELS.find((x) => x.value === l)?.order ?? 0;
export const levelGrade = (l?: string | null) => LEVELS.find((x) => x.value === l)?.grade ?? null;
/** Niveaux qu'un responsable peut encadrer (tous ceux strictement en dessous). */
export const manageableLevels = (l?: string | null) => LEVELS.filter((x) => x.order < levelOrder(l));

