import { useState } from "react";
import { toast } from "sonner";
import { Eye, FileDown, FileText, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SendEmailDialog } from "@/components/SendEmailDialog";
import { buildIncidentModel, incidentToDocx, incidentToPdf, type IncidentModel } from "@/lib/docs/incident-doc";
import { downloadBlob } from "@/lib/docs/files";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

export function IncidentDocActions({ report, authorLabel, actions }: { report: any; authorLabel: string; actions: any[] }) {
  const [preview, setPreview] = useState<IncidentModel | null>(null);
  const [send, setSend] = useState(false);
  const model = () => buildIncidentModel(report, { authorLabel, actions });
  const ref = model().reference;
  const base = `Rapport_Incident_${ref}`;

  const dl = async (kind: "pdf" | "docx") => {
    try {
      const m = model();
      const blob = kind === "pdf" ? await incidentToPdf(m) : await incidentToDocx(m);
      downloadBlob(blob, `${base}.${kind}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Génération impossible");
    }
  };

  return (
    <div className="no-print mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setPreview(model())}><Eye className="mr-1 h-4 w-4" /> Prévisualiser</Button>
      <Button size="sm" variant="outline" onClick={() => dl("pdf")}><FileDown className="mr-1 h-4 w-4" /> Télécharger PDF</Button>
      <Button size="sm" variant="outline" onClick={() => dl("docx")}><FileText className="mr-1 h-4 w-4" /> Télécharger Word</Button>
      <Button size="sm" onClick={() => setSend(true)}><Mail className="mr-1 h-4 w-4" /> Envoyer par email</Button>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Rapport d'incident — {preview?.reference}</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-4 text-sm">
              {preview.sections.map((s) => (
                <div key={s.title}>
                  <p className="mb-1 font-semibold">{s.title}</p>
                  {s.kind === "rows" && (
                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        {s.rows.map(([l, v]) => (
                          <tr key={l} className="border">
                            <td className="w-2/5 border bg-muted/50 p-1.5 font-medium">{l}</td>
                            <td className="whitespace-pre-wrap p-1.5">{v || "\u00a0"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {s.kind === "ctra" && (
                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        {s.items.map(([l, v]) => (
                          <tr key={l} className="border">
                            <td className="w-1/4 border bg-muted/50 p-1.5 font-medium">{l}</td>
                            <td className="whitespace-pre-wrap border p-1.5">{v}</td>
                            <td className="w-28 p-1.5">☐ Oui<br />☐ Non<br />☐ Sans objet</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {s.kind === "area" && <div className="min-h-24 whitespace-pre-wrap rounded border p-2 text-xs">{s.value}</div>}
                  {s.kind === "signatures" && (
                    <table className="w-full border-collapse text-xs">
                      <thead><tr>{["Qualité", "Nom et prénom", "Date", "Signature"].map((h) => <th key={h} className="border bg-muted/50 p-1.5 text-left">{h}</th>)}</tr></thead>
                      <tbody>{s.people.map((p) => <tr key={p}><td className="border p-1.5 font-medium">{p}</td><td className="h-10 border" /><td className="border" /><td className="border" /></tr>)}</tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SendEmailDialog
        open={send}
        onOpenChange={setSend}
        docType="incident"
        docRef={ref}
        defaultSubject={`Rapport d'incident - ${ref}`}
        defaultMessage={`Bonjour,\n\nVeuillez trouver ci-joint le rapport d'incident ${ref} (${report.title}).\n\nCordialement,`}
        attachments={[
          { id: "pdf", filename: `${base}.pdf`, mimeType: "application/pdf", defaultChecked: true, build: () => incidentToPdf(model()) },
          { id: "docx", filename: `${base}.docx`, mimeType: DOCX, defaultChecked: false, build: () => incidentToDocx(model()) },
        ]}
      />
    </div>
  );
}
