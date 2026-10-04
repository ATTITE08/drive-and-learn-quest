export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Renders an existing (possibly hidden) printable element into a one-page A4 PDF. */
export async function elementToPdf(el: HTMLElement, landscape = false): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const host = document.createElement("div");
  const widthPx = landscape ? 1123 : 794;
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;background:#fff;color:#000;padding:16px;z-index:-1;`;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.display = "block";
  clone.classList.remove("print-sheet");
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pw / canvas.width, ph / canvas.height);
    const w = canvas.width * ratio, h = canvas.height * ratio;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (pw - w) / 2, 0, w, h);
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}
