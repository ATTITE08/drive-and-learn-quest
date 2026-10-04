import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { sendDocumentEmail } from "@/lib/gmail.functions";
import { blobToBase64 } from "@/lib/docs/files";
import { useGmailStatus, GmailPanel } from "@/components/GmailPanel";

export interface AttachmentOption {
  id: string;
  filename: string;
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  defaultChecked: boolean;
  locked?: boolean;
  build: () => Promise<Blob>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SendEmailDialog({
  open, onOpenChange, docType, docRef, defaultSubject, defaultMessage, attachments,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  docType: "releve" | "incident";
  docRef: string;
  defaultSubject: string;
  defaultMessage: string;
  attachments: AttachmentOption[];
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendDocumentEmail);
  const { data: gmail } = useGmailStatus();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setChecked(Object.fromEntries(attachments.map((a) => [a.id, a.defaultChecked])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = attachments.filter((a) => checked[a.id]);
  const validTo = EMAIL_RE.test(to.trim());

  const ask = () => {
    if (!gmail?.connected) return toast.error("Gmail non connecté : connectez votre Gmail avant d'envoyer.");
    if (!validTo) return toast.error("Adresse du destinataire invalide.");
    if (!subject.trim()) return toast.error("Indiquez un objet.");
    if (!selected.length) return toast.error("Sélectionnez au moins une pièce jointe.");
    setConfirm(true);
  };

  const doSend = async () => {
    setSending(true);
    const dest = to.trim();
    try {
      const files = await Promise.all(selected.map(async (a) => ({ filename: a.filename, mimeType: a.mimeType, base64: await blobToBase64(await a.build()) })));
      const res = await send({ data: { to: dest, subject: subject.trim(), body: message, docType, docRef, attachments: files } });
      if (res.ok) {
        toast.success(`Email envoyé avec succès à ${dest}.`);
        onOpenChange(false);
        setTo("");
      } else {
        toast.error(`Échec de l'envoi. ${res.error ?? "Veuillez vérifier l'adresse du destinataire ou votre connexion Gmail."}`);
      }
    } catch (e: any) {
      toast.error("Échec de l'envoi. Veuillez vérifier l'adresse du destinataire ou votre connexion Gmail.");
      console.error(e);
    } finally {
      setSending(false);
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["email-sends"] });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer par email</DialogTitle>
            <DialogDescription>Le message part de votre propre compte Gmail.</DialogDescription>
          </DialogHeader>
          <GmailPanel />
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Destinataire</Label>
              <Input type="email" inputMode="email" placeholder="exemple@camrail.net" value={to} onChange={(e) => setTo(e.target.value)} maxLength={254} />
              {to && !validTo && <p className="mt-1 text-xs text-destructive">Adresse email invalide.</p>}
            </div>
            <div>
              <Label className="text-xs">Objet</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={250} />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={10000} />
            </div>
            <div>
              <Label className="text-xs">Pièces jointes</Label>
              <div className="mt-1 space-y-2">
                {attachments.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={!!checked[a.id]} disabled={a.locked} onCheckedChange={(v) => setChecked((s) => ({ ...s, [a.id]: !!v }))} />
                    {a.filename}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={ask} disabled={sending}><Send className="mr-1 h-4 w-4" /> Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm} onOpenChange={(o) => !sending && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'envoi</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous envoyer ce document à : <b>{to.trim()}</b> ?<br />
              Depuis : {gmail?.email ?? "votre Gmail"}<br />
              Pièces jointes : {selected.map((a) => a.filename).join(", ")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={sending} onClick={(e) => { e.preventDefault(); doSend(); }}>
              {sending ? "Envoi en cours…" : "Confirmer l'envoi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
