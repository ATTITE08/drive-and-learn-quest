// Builds the incident report document model, then renders it as Word (.docx) or PDF.
// Both outputs come from the same model so they always carry the same information.

export type Row = [string, string];
export type Section =
  | { kind: "rows"; title: string; rows: Row[] }
  | { kind: "ctra"; title: string; items: Row[] }
  | { kind: "area"; title: string; label: string; value: string; lines: number }
  | { kind: "signatures"; title: string; people: string[] };

export interface IncidentModel {
  reference: string;
  title: string;
  sections: Section[];
  history: string[];
}

const NR = "Non renseigné";
const v = (x: unknown) => (x == null || String(x).trim() === "" ? NR : String(x));
const join = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(" · ");

export function incidentReference(r: any) {
  return `INC-${String(r.id).slice(0, 8).toUpperCase()}`;
}

export function buildIncidentModel(
  r: any,
  ctx: { authorLabel: string; actions: { created_at: string; action: string; comment?: string | null }[] },
): IncidentModel {
  const d = (r.report_data ?? {}) as Record<string, string>;
  const a = (r.analysis ?? {}) as Record<string, string>;
  const occ = r.occurred_at ? new Date(r.occurred_at) : null;
  const sev: Record<string, string> = { mineur: "Mineur", significatif: "Significatif", grave: "Grave", critique: "Critique / sécurité" };

  const sections: Section[] = [
    {
      kind: "rows",
      title: "A. IDENTIFICATION DE L'INCIDENT",
      rows: [
        ["Numéro / référence du rapport", incidentReference(r)],
        ["Date de l'incident", occ ? occ.toLocaleDateString("fr-FR") : NR],
        ["Heure", occ ? occ.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : NR],
        ["Lieu", v(r.location)],
        ["Ligne / secteur (cantons)", v(d.cantons)],
        ["PK", v(d.pk)],
        ["Service concerné", NR],
        ["Gravité", v(sev[r.severity] ?? r.severity)],
        ["Date et heure de rédaction", r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : NR],
        ["Personne ayant déclaré l'incident", v(ctx.authorLabel)],
      ],
    },
    {
      kind: "rows",
      title: "B. CONDUCTEUR",
      rows: [
        ["Nom et prénom du conducteur", v(d.conducteur)],
        ["Matricule", v(d.mle_conducteur)],
        ["Fonction / dépôt", d.depot_conducteur ? `Conducteur — dépôt ${d.depot_conducteur}` : NR],
        ["Aide-conducteur", v(join(d.aide_conducteur, d.mle_aide && `Mle ${d.mle_aide}`, d.depot_aide))],
        ["Autre agent", v(join(d.autre, d.mle_autre && `Mle ${d.mle_autre}`, d.depot_autre))],
        ["Numéro du train", v(d.train)],
        ["Date du train", v(d.date_train)],
        ["Engin(s) / locomotive(s)", v(d.locomotives)],
        ["Tonnage", v(d.tonnage)],
        ["Nombre de wagons", v(d.nb_wagons)],
        ["Date et heure de l'incident", occ ? occ.toLocaleString("fr-FR") : NR],
        ["Lieu", v(r.location)],
        ["Déclaration / description des faits par le conducteur", v(r.description)],
        ["Observations du conducteur (précisions)", v(d.precisions)],
      ],
    },
    {
      kind: "ctra",
      title: "C. CTRA — ANALYSE",
      items: [
        ["1. Résultat de l'enquête", v(a.ctra_resultat)],
        ["2. Conséquences de l'incident", v(a.ctra_consequences)],
        ["3. Examen critique", v(a.ctra_examen)],
        ["4. Conclusion", v(a.ctra_conclusion)],
        ["5. Propositions / recommandations", v(a.ctra_propositions)],
      ],
    },
    {
      kind: "rows",
      title: "D. CHEF DE DÉPÔT",
      rows: [
        ["Nom et prénom", ""],
        ["Matricule / fonction", ""],
        ["Avis / observations du chef de dépôt (CDPC)", v(a.cdpc_observations)],
        ["Mesures prises", ""],
        ["Date", ""],
        ["Signature / validation", ""],
      ],
    },
    {
      kind: "rows",
      title: "E. DESCRIPTION DE L'INCIDENT",
      rows: [
        ["Nature de l'incident", v(r.title)],
        ["Description complète des faits", v(r.description)],
        ["Chronologie", ""],
        ["Circonstances", v(d.precisions)],
        ["Causes ou causes présumées", ""],
        ["Conséquences", v(a.ctra_consequences)],
        ["Matériel ou équipements concernés", v(join(d.locomotives, d.nb_wagons && `${d.nb_wagons} wagons`))],
        ["Personnes concernées", v(join(d.conducteur, d.aide_conducteur, d.autre))],
        ["Témoins", ""],
      ],
    },
    {
      kind: "rows",
      title: "F. MESURES PRISES",
      rows: [
        ["Mesures immédiates (opérations effectuées)", v(d.operations)],
        ["Pages du guide de dépannage / livret consultées", v(d.pages_guide)],
        ["Heure de demande du secours", v(d.h_demande_secours)],
        ["Heure d'annulation du secours", v(d.h_annulation_secours)],
        ["Heure d'arrivée du secours", v(d.h_arrivee_secours)],
        ["Heure de départ du PK", v(d.h_depart_pk)],
        ["Actions à effectuer", v(a.ctra_propositions)],
        ["Responsable de l'action", ""],
        ["Échéance", ""],
      ],
    },
    { kind: "area", title: "G. AUTRES OBSERVATIONS", label: "Autres observations", value: a.autres_observations ?? "", lines: 8 },
    { kind: "signatures", title: "H. VALIDATION / SIGNATURES", people: ["Conducteur", "CTRA", "Chef de dépôt", "Autre responsable"] },
  ];

  const history = ctx.actions.map(
    (x) => `${new Date(x.created_at).toLocaleString("fr-FR")} — ${x.action}${x.comment ? ` : ${x.comment}` : ""}`,
  );
  return { reference: incidentReference(r), title: r.title ?? "", sections, history };
}

/* ---------------- WORD ---------------- */
export async function incidentToDocx(m: IncidentModel): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
    BorderStyle, WidthType, ShadingType, HeadingLevel,
  } = await import("docx");
  const W = 9638; // A4, 2 cm margins
  const border = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };
  const para = (text: string, opts: any = {}) =>
    text.split("\n").map((t) => new Paragraph({ children: [new TextRun({ text: t, ...opts })] }));
  const cell = (children: any[], width: number, fill?: string) =>
    new TableCell({ borders, margins, width: { size: width, type: WidthType.DXA }, shading: fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined, children });
  const blank = (n: number) => Array.from({ length: n }, () => new Paragraph({ children: [new TextRun("")] }));

  const body: any[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CAMRAIL — DIRECTION TRANSPORT", bold: true, size: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Gestion personnel conduite", size: 18 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "RAPPORT D'INCIDENT", bold: true, size: 36 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: `Référence : ${m.reference}`, size: 20 })] }),
  ];

  for (const s of m.sections) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 }, children: [new TextRun({ text: s.title, bold: true, size: 24 })] }));
    if (s.kind === "rows") {
      const c1 = 3600, c2 = W - c1;
      body.push(new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [c1, c2],
        rows: s.rows.map(([l, val]) => new TableRow({ children: [
          cell(para(l, { bold: true }), c1, "EEF2F7"),
          cell(val ? para(val) : blank(1), c2),
        ] })),
      }));
    } else if (s.kind === "ctra") {
      const c1 = 2600, c3 = 2000, c2 = W - c1 - c3;
      body.push(new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [c1, c2, c3],
        rows: [
          new TableRow({ tableHeader: true, children: [
            cell(para("Rubrique", { bold: true }), c1, "D9E2EF"),
            cell(para("Observations", { bold: true }), c2, "D9E2EF"),
            cell(para("Avis", { bold: true }), c3, "D9E2EF"),
          ] }),
          ...s.items.map(([l, val]) => new TableRow({ children: [
            cell(para(l, { bold: true }), c1, "EEF2F7"),
            cell([...para(val), ...blank(1)], c2),
            cell([new Paragraph({ children: [new TextRun("☐ Oui")] }), new Paragraph({ children: [new TextRun("☐ Non")] }), new Paragraph({ children: [new TextRun("☐ Sans objet")] })], c3),
          ] })),
        ],
      }));
    } else if (s.kind === "area") {
      body.push(new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [W],
        rows: [new TableRow({ children: [cell([...(s.value ? para(s.value) : []), ...blank(s.lines)], W)] })],
      }));
    } else {
      const c1 = 2400, c2 = 2800, c3 = 1600, c4 = W - c1 - c2 - c3;
      body.push(new Table({
        width: { size: W, type: WidthType.DXA }, columnWidths: [c1, c2, c3, c4],
        rows: [
          new TableRow({ tableHeader: true, children: ["Qualité", "Nom et prénom", "Date", "Signature"].map((h, i) => cell(para(h, { bold: true }), [c1, c2, c3, c4][i], "D9E2EF")) }),
          ...s.people.map((p) => new TableRow({ children: [cell(para(p, { bold: true }), c1, "EEF2F7"), cell(blank(2), c2), cell(blank(2), c3), cell(blank(2), c4)] })),
        ],
      }));
    }
  }

  if (m.history.length) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 }, children: [new TextRun({ text: "Historique de transmission", bold: true, size: 20 })] }));
    m.history.forEach((h) => body.push(new Paragraph({ children: [new TextRun({ text: h, size: 18 })] })));
  }

  const doc = new Document({
    creator: "RailFormation",
    title: `Rapport d'incident ${m.reference}`,
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children: body }],
  });
  return Packer.toBlob(doc);
}

/* ---------------- PDF ---------------- */
export async function incidentToPdf(m: IncidentModel): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const head = [217, 226, 239] as [number, number, number];
  const lab = [238, 242, 247] as [number, number, number];
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("CAMRAIL — DIRECTION TRANSPORT", 105, 14, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Gestion personnel conduite", 105, 19, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("RAPPORT D'INCIDENT", 105, 28, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Référence : ${m.reference}`, 105, 34, { align: "center" });
  let y = 40;
  const base = { margin: { left: 15, right: 15 }, styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [128, 128, 128] as [number, number, number], lineWidth: 0.2, textColor: 20 }, theme: "grid" as const, headStyles: { fillColor: head, textColor: 20, fontStyle: "bold" as const } };
  const title = (t: string) => {
    if (y > 270) { doc.addPage(); y = 15; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(t, 15, y + 4); y += 6;
  };
  const after = () => { y = (doc as any).lastAutoTable.finalY + 5; };

  for (const s of m.sections) {
    title(s.title);
    if (s.kind === "rows") {
      autoTable(doc, { ...base, startY: y, body: s.rows.map(([l, val]) => [l, val || " \n "]), columnStyles: { 0: { cellWidth: 62, fontStyle: "bold", fillColor: lab } } });
    } else if (s.kind === "ctra") {
      autoTable(doc, { ...base, startY: y, head: [["Rubrique", "Observations", "Avis"]], body: s.items.map(([l, val]) => [l, val, "[  ] Oui\n[  ] Non\n[  ] Sans objet"]), columnStyles: { 0: { cellWidth: 48, fontStyle: "bold", fillColor: lab }, 2: { cellWidth: 30 } } });
    } else if (s.kind === "area") {
      autoTable(doc, { ...base, startY: y, body: [[(s.value ? s.value + "\n" : "") + "\n".repeat(s.lines)]] });
    } else {
      autoTable(doc, { ...base, startY: y, head: [["Qualité", "Nom et prénom", "Date", "Signature"]], body: s.people.map((p) => [p, "\n\n", "", ""]), columnStyles: { 0: { cellWidth: 38, fontStyle: "bold", fillColor: lab } } });
    }
    after();
  }
  if (m.history.length) {
    title("Historique de transmission");
    autoTable(doc, { ...base, startY: y, body: m.history.map((h) => [h]) });
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(`${m.reference} — page ${i}/${pages}`, 195, 290, { align: "right" });
  }
  return doc.output("blob");
}
