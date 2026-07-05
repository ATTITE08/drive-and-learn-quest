import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SUBJECT_LABELS: Record<string, string> = {
  igs: "Instructions Générales de Sécurité (IGS)",
  prac: "Procédures de Conduite (PRAC)",
  frein: "Systèmes de freinage (Frein)",
  technologies: "Technologies du matériel roulant",
};
const LEVEL_LABELS: Record<string, string> = {
  aide_conducteur: "Aide conducteur",
  conducteur_manoeuvre: "Conducteur de manœuvre",
  conducteur_ligne: "Conducteur de ligne",
  chef_traction: "Chef de traction",
};

const InputSchema = z.object({
  documentId: z.string().uuid(),
  numQcm: z.number().int().min(0).max(20).default(6),
  numCasPratique: z.number().int().min(0).max(10).default(2),
});

export const generateQuizFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.numQcm + data.numCasPratique < 3) {
      throw new Error("Générez au moins 3 questions au total.");
    }

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Réservé aux administrateurs");

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id,title,subject,level,storage_path")
      .eq("id", data.documentId)
      .single();
    if (docErr || !doc) throw new Error("Document introuvable");

    if (!doc.storage_path) {
      throw new Error("Ce document n'a pas de fichier PDF associé.");
    }
    const ext = (doc.storage_path.split(".").pop() ?? "").toLowerCase();
    if (ext !== "pdf") {
      throw new Error("Seuls les fichiers PDF sont pris en charge pour la génération automatique.");
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquant");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("documents").download(doc.storage_path);
    if (dlErr || !blob) throw new Error("Impossible de télécharger le document: " + (dlErr?.message ?? ""));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    const filename = doc.storage_path.split("/").pop() ?? "document.pdf";
    const fileBlock = { type: "file", file: { filename, file_data: `data:application/pdf;base64,${b64}` } };

    const instructions = `Tu es un formateur expert dans le domaine ferroviaire. À partir du document PDF fourni, rédige un questionnaire de formation en français pour des agents de conduite.

Matière : ${SUBJECT_LABELS[doc.subject] ?? doc.subject}
Niveau : ${LEVEL_LABELS[doc.level] ?? doc.level}

Composition demandée :
- ${data.numQcm} question(s) à choix multiples (QCM), chacune avec exactement 4 choix et une seule bonne réponse.
- ${data.numCasPratique} cas pratique(s) : mise en situation opérationnelle réaliste (incident, panne, manœuvre, procédure) demandant une réponse rédigée. Fournir une réponse-type détaillée (model_answer) que le formateur utilisera pour évaluer.

Règles :
- Fidélité stricte au contenu du document (procédures, chiffres, terminologie).
- Vocabulaire technique ferroviaire approprié.
- Chaque QCM inclut une explication brève (1-2 phrases) et vaut 1 point.
- Chaque cas pratique inclut : une réponse-type structurée (model_answer), un barème total (points, entre 3 et 10) et 3 à 6 critères d'évaluation (label + points), chaque critère décrivant un élément précis attendu dans la réponse. La somme des points des critères doit égaler le total (points).
- Ordonner les questions du plus simple au plus complexe.`;

    const tool = {
      type: "function",
      function: {
        name: "save_questions",
        description: "Enregistre les questions générées",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["qcm", "cas_pratique"] },
                  prompt: { type: "string" },
                  choices: { type: "array", items: { type: "string" } },
                  correct_index: { type: "integer", minimum: 0, maximum: 3 },
                  explanation: { type: "string" },
                  model_answer: { type: "string" },
                  points: { type: "integer", minimum: 1, maximum: 20 },
                  criteria: {
                    type: "array",
                    description: "Critères d'évaluation (cas pratique uniquement). Chaque critère décrit un point-clé attendu dans la réponse et vaut un certain nombre de points.",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        points: { type: "integer", minimum: 1, maximum: 10 },
                      },
                      required: ["label", "points"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["type", "prompt"],
                additionalProperties: false,
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un expert en pédagogie ferroviaire. Tu produis uniquement des questions via l'outil fourni." },
          { role: "user", content: [{ type: "text", text: instructions }, fileBlock] },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "save_questions" } },
      }),
    });

    if (res.status === 429) throw new Error("Limite de requêtes IA atteinte. Réessayez plus tard.");
    if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans Lovable Cloud.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Erreur IA: ${res.status} ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("Réponse IA invalide");
    const parsed = JSON.parse(call.function.arguments);
    const questions: Array<any> = parsed.questions ?? [];
    if (!questions.length) throw new Error("Aucune question produite");

    const { data: quiz, error: qErr } = await supabase
      .from("quizzes")
      .insert({
        title: `${doc.title} — Questionnaire`,
        subject: doc.subject,
        level: doc.level,
        document_id: doc.id,
        created_by: userId,
      })
      .select("id")
      .single();
    if (qErr || !quiz) throw new Error(qErr?.message ?? "Création quiz échouée");

    const rows = questions.map((q, i) => {
      const isQcm = q.type === "qcm";
      const criteria = !isQcm && Array.isArray(q.criteria)
        ? q.criteria
            .filter((c: any) => c && typeof c.label === "string" && Number(c.points) > 0)
            .map((c: any) => ({ label: String(c.label), points: Math.max(1, Math.min(10, Math.round(Number(c.points)))) }))
        : [];
      const inferredPoints = criteria.reduce((s: number, c: any) => s + c.points, 0);
      const points = isQcm
        ? 1
        : Math.max(1, Math.min(20, Number.isFinite(q.points) ? Math.round(q.points) : inferredPoints || 5));
      return {
        quiz_id: quiz.id,
        type: isQcm ? "qcm" : "cas_pratique",
        prompt: q.prompt,
        choices: isQcm ? (Array.isArray(q.choices) ? q.choices.slice(0, 4) : []) : null,
        correct_index: isQcm ? Math.max(0, Math.min(3, q.correct_index ?? 0)) : null,
        explanation: q.explanation ?? null,
        model_answer: !isQcm ? (q.model_answer ?? null) : null,
        points,
        criteria,
        position: i,
      };
    });
    const { error: insErr } = await supabase.from("questions").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { quizId: quiz.id, count: rows.length };
  });
