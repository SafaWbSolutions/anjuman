"use client";

import { jsPDF } from "jspdf";

/** CSV that opens cleanly in Excel (UTF-8 BOM + quoted cells). */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const body = [headers, ...rows]
    .map((line) => line.map(esc).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + body], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Real, selectable table in a PDF — not a screenshot. Header repeats on
 * every page and long cell text wraps inside its column.
 */
export function downloadPdfTable(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const usable = pageW - margin * 2;

  // Column widths from the widest text in each column.
  const weights = headers.map((h, i) => {
    const widest = Math.max(
      h.length,
      ...rows.map((r) => String(r[i] ?? "").length)
    );
    return Math.min(Math.max(widest, 6), 46);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  const widths = weights.map((w) => (w / total) * usable);

  let y = margin;

  const drawHead = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let x = margin;
    headers.forEach((h, i) => {
      doc.rect(x, y, widths[i], 18);
      doc.text(doc.splitTextToSize(h, widths[i] - 6), x + 3, y + 12);
      x += widths[i];
    });
    y += 18;
    doc.setFont("helvetica", "normal");
  };

  const drawTitle = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(title, margin, y + 12);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90);
    doc.text(subtitle, margin, y + 8);
    doc.setTextColor(0);
    y += 22;
    drawHead();
  };

  drawTitle();

  doc.setFontSize(8.5);
  rows.forEach((row) => {
    const lines = headers.map((_, i) =>
      doc.splitTextToSize(String(row[i] ?? ""), widths[i] - 6)
    );
    const h = Math.max(14, ...lines.map((l) => l.length * 11 + 5));

    if (y + h > pageH - margin - 16) {
      doc.addPage();
      y = margin;
      drawHead();
    }

    let x = margin;
    headers.forEach((_, i) => {
      doc.rect(x, y, widths[i], h);
      doc.text(lines[i], x + 3, y + 11);
      x += widths[i];
    });
    y += h;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(
    `Generated ${new Date().toLocaleString("en-IN")} · Anjuman`,
    margin,
    pageH - 12
  );

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
