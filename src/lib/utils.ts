import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
