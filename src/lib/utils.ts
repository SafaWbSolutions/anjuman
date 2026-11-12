import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Supabase `PostgrestError` is a plain object, not an `Error` instance.
 * `e instanceof Error ? e.message : "..."` therefore hides the real
 * reason (RLS denial, missing RPC, SQL exception, …). This helper keeps
 * the actual message visible so a failure can be diagnosed from the UI.
 */
export function errorMessage(e: unknown, fallback = "Kuch galat ho gaya"): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.error_description, o.error]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (parts.length) return [...new Set(parts)].join(" · ");
    if (e instanceof Error && e.message) return e.message;
    try {
      const s = JSON.stringify(e);
      if (s && s !== "{}") return s;
    } catch {
      /* circular object */
    }
  }
  return fallback;
}

/** Format paise (integer) as Indian rupees. Money is never stored as a float. */
export function formatINR(paise: number, opts?: { compact?: boolean }) {
  const rupees = paise / 100;
  if (opts?.compact && Math.abs(rupees) >= 100000) {
    return `₹${(rupees / 100000).toFixed(2)}L`;
  }
  if (opts?.compact && Math.abs(rupees) >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** "2026-11" -> "Nov 2026" */
export function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export function formatDate(iso: string, withTime = false) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/**
 * Download rows as a CSV file (opens in Excel). Values are quoted when
 * they contain a comma, quote or newline. A BOM is prepended so Excel
 * reads the ₹ sign correctly.
 */
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function currentPeriod(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftPeriod(period: string, months: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function periodRange(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 60) {
    out.push(cur);
    cur = shiftPeriod(cur, 1);
    guard++;
  }
  return out;
}

/** Member code: BHR-000123-7 */
export function memberCode(tenantCode: string, serial: number) {
  const s = String(serial).padStart(6, "0");
  const body = `${tenantCode}-${s}`;
  return `${body}-${checkDigit(body)}`;
}

export function checkDigit(body: string) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch >= "0" && ch <= "9") sum += Number(ch) * (i % 2 === 0 ? 3 : 1);
  }
  return String(sum % 10);
}

export function amountInWords(paise: number) {
  const n = Math.round(paise / 100);
  const ones = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  function two(x: number): string {
    if (x < 20) return ones[x];
    return `${tens[Math.floor(x / 10)]}${x % 10 ? "-" + ones[x % 10] : ""}`;
  }
  function three(x: number): string {
    const h = Math.floor(x / 100);
    const r = x % 100;
    return `${h ? ones[h] + " hundred" : ""}${h && r ? " " : ""}${r ? two(r) : ""}`.trim();
  }
  if (n === 0) return "zero rupees";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${three(crore)} crore`);
  if (lakh) parts.push(`${three(lakh)} lakh`);
  if (thousand) parts.push(`${three(thousand)} thousand`);
  if (rest) parts.push(three(rest));
  return `${parts.join(" ")} rupees`;
}

let cleanupPrintRoot: (() => void) | null = null;

/**
 * Clone the page's `.print-area` blocks into a `#print-root` node and hide
 * everything else on <body>. Returns the cleanup function, or null when the
 * page has nothing printable.
 */
function buildPrintRoot(): (() => void) | null {
  // Drop a leftover clone from a previous/aborted print.
  document.getElementById("print-root")?.remove();
  document.getElementById("print-page-size")?.remove();

  // Only visible areas take part in the printout: a closed drawer or an
  // empty placeholder must never produce a blank sheet.
  const areas = Array.from(document.querySelectorAll<HTMLElement>(".print-area")).filter(
    (area) => area.getClientRects().length > 0
  );
  if (areas.length === 0) return null;

  const host = document.createElement("div");
  host.id = "print-root";
  for (const area of areas) {
    host.appendChild(area.cloneNode(true));
  }

  // Paper size: thermal receipts print on a roll, everything else on A4.
  // Thermal rolls have no real margin, so the receipt supplies its own padding.
  const style = document.createElement("style");
  style.id = "print-page-size";
  if (host.querySelector(".receipt-58")) {
    style.textContent = "@page { size: 58mm auto; margin: 0; }";
  } else if (host.querySelector(".receipt-80")) {
    style.textContent = "@page { size: 80mm auto; margin: 0; }";
  } else {
    style.textContent = "@page { size: A4 portrait; margin: 8mm; }";
  }

  document.body.appendChild(host);
  document.head.appendChild(style);
  document.body.classList.add("print-mode");

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.body.classList.remove("print-mode");
    host.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
    window.removeEventListener("focus", cleanup);
    if (cleanupPrintRoot === cleanup) cleanupPrintRoot = null;
  };

  window.addEventListener("afterprint", cleanup);
  // Some mobile browsers never fire afterprint; focus returns to the window
  // once the print dialog closes, which is an equally reliable signal.
  window.addEventListener("focus", cleanup);
  window.setTimeout(cleanup, 60000);

  cleanupPrintRoot = cleanup;
  return cleanup;
}

/**
 * Print ONLY the page's `.print-area` blocks — never the sidebar, header,
 * filters or the rest of the screen.
 *
 * Call this instead of `window.print()`.
 */
export function printArea() {
  if (typeof document === "undefined") return;
  cleanupPrintRoot?.();
  buildPrintRoot();
  window.print();
}

/**
 * Ctrl+P / browser-menu printing bypasses the app's Print buttons. Build the
 * same isolated root in `beforeprint` so those routes print only the printable
 * area too. Safe to call repeatedly.
 */
export function ensurePrintRoot() {
  if (typeof document === "undefined") return;
  if (document.getElementById("print-root")) return;
  buildPrintRoot();
}

/* ── Image download / WhatsApp share ────────────────────────────────
   Used for a single ID card or a single receipt: turn the visible node
   into a high-resolution PNG, then download it or hand it to the phone's
   native share sheet (WhatsApp shows up there). No server involved. */

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function nodeToPngBlob(node: HTMLElement, pixelRatio = 3): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    pixelRatio,
    backgroundColor: "#ffffff",
    cacheBust: true,
  });
  if (!blob) throw new Error("Image generate nahi ho payi");
  return blob;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Download one visible node (an ID card, a receipt) as a PNG. */
export async function downloadNodePng(node: HTMLElement, fileName: string) {
  const blob = await nodeToPngBlob(node);
  saveBlob(blob, fileName);
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

/**
 * Share one node as an image on WhatsApp. Where the browser supports file
 * sharing (Android/iOS/Windows), the native sheet opens with WhatsApp in the
 * list. Otherwise the PNG downloads and WhatsApp opens with a prefilled
 * message, so the user only has to attach the just-saved image.
 */
export async function shareNodeOnWhatsApp(
  node: HTMLElement,
  fileName: string,
  text: string
): Promise<ShareResult> {
  const blob = await nodeToPngBlob(node);

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const file = new File([blob], fileName, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    const canShareFile = nav.canShare ? nav.canShare({ files: [file] }) : false;
    if (canShareFile) {
      try {
        await navigator.share({ files: [file], text, title: fileName });
        return "shared";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
        // Any other failure falls back to download + wa.me below.
      }
    }
  }

  saveBlob(blob, fileName);
  window.open(whatsappShareUrl(text), "_blank", "noopener,noreferrer");
  return "downloaded";
}
