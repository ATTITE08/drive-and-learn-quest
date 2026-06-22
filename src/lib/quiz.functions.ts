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
  numQuestions: z.number().int().min(3).max(20).default(8),
});

export const generateQuizFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Réservé aux administrateurs");

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id,title,subject,level,content_text,storage_path")
      .eq("id", data.documentId)
      .single();
    if (docErr || !doc) throw new Error("Document introuvable");

    const hasText = (doc.content_text ?? "").trim().length >= 50;
    const hasFile = !!doc.storage_path;
    if (!hasText && !hasFile) {
      throw new Error("Ajoutez un fichier PDF ou un contenu textuel suffisant pour générer des questions.");
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY manquant");

    // If no text but a file is attached, download it (admin client bypasses RLS on storage).
    let fileBlock: { type: "file"; file: { filename: string; file_data: string } } | null = null;
    if (!hasText && hasFile) {
      const ext = (doc.storage_path.split(".").pop() ?? "").toLowerCase();
      if (ext !== "pdf") {
        throw new Error("Génération automatique disponible uniquement pour les PDF. Pour les autres formats, collez le contenu textuel.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("documents").download(doc.storage_path);
      if (dlErr || !blob) throw new Error("Impossible de télécharger le document: " + (dlErr?.message ?? ""));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const b64 = btoa(binary);
      const filename = doc.storage_path.split("/").pop() ?? "document.pdf";
      fileBlock = { type: "file", file: { filename, file_data: `data:application/pdf;base64,${b64}` } };
    }

    const instructions = `Tu es un formateur expert dans le domaine ferroviaire. À partir du document fourni, rédige ${data.numQuestions} questions à choix multiples (QCM) en français pour des agents de conduite.

Matière : ${SUBJECT_LABELS[doc.subject] ?? doc.subject}
Niveau : ${LEVEL_LABELS[doc.level] ?? doc.level}

Règles :
- Chaque question doit avoir exactement 4 choix de réponse.
- Une seule réponse correcte par question.
- Inclure une explication brève (1-2 phrases) pour chaque question.
- Les questions doivent être progressives et fidèles au contenu du document.
- Vocabulaire technique ferroviaire approprié.`;

    const userContent: any[] = [{ type: "text", text: instructions }];
    if (fileBlock) userContent.push(fileBlock);
    else userContent.push({ type: "text", text: `Document source :\n"""\n${doc.content_text!.slice(0, 12000)}\n"""` });

    const tool = {
      type: "function",
      function: {
        name: "save_questions",
        description: "Enregistre les questions QCM générées",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  choices: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correct_index: { type: "integer", minimum: 0, maximum: 3 },
                  explanation: { type: "string" },
                },
                required: ["prompt", "choices", "correct_index", "explanation"],
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
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un expert en pédagogie ferroviaire. Tu produis uniquement des QCM via l'outil fourni." },
          { role: "user", content: prompt },
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
    const questions: Array<{ prompt: string; choices: string[]; correct_index: number; explanation: string }> = parsed.questions ?? [];
    if (!questions.length) throw new Error("Aucune question produite");

    const { data: quiz, error: qErr } = await supabase
      .from("quizzes")
      .insert({
        title: `${doc.title} — QCM`,
        subject: doc.subject,
        level: doc.level,
        document_id: doc.id,
        created_by: userId,
      })
      .select("id")
      .single();
    if (qErr || !quiz) throw new Error(qErr?.message ?? "Création quiz échouée");

    const rows = questions.map((q, i) => ({
      quiz_id: quiz.id,
      prompt: q.prompt,
      choices: q.choices,
      correct_index: Math.max(0, Math.min(3, q.correct_index)),
      explanation: q.explanation,
      position: i,
    }));
    const { error: insErr } = await supabase.from("questions").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { quizId: quiz.id, count: rows.length };
  });
