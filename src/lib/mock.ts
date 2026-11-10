import type {
  Approval,
  Complaint,
  Donation,
  Expense,
  Fund,
  Invoice,
  LedgerEntry,
  Member,
  Notice,
  Payment,
  PlatformPlan,
  PrayerDay,
  Tenant,
} from "./types";
import { memberCode, periodLabel } from "./utils";

/* ─────────────────────────────────────────────────────────────
   DEMO DATA
   This module is the single source of truth for demo mode.
   When Supabase is configured, the same shapes are served by
   `lib/api.ts` instead. Every value here is deterministic.
   ───────────────────────────────────────────────────────────── */

export const PERIODS = ["2026-08", "2026-09", "2026-10", "2026-11"];

export const tenants: Tenant[] = [
  {
    id: "t-bhr",
    code: "BHR",
    name: "Bharauli Masjid Committee",
    village: "Bharauli",
    district: "Azamgarh",
    state: "Uttar Pradesh",
    pincode: "276001",
    masjid: "Jama Masjid Bharauli",
    regNo: "UP/AZM/2011/0442",
    phone: "+91 98765 43210",
    upiId: "bharaulimasjid@upi",
    status: "active",
    planType: "fixed",
    planAmountPaise: 120000,
    planCycle: "yearly",
    expiresAt: "2027-06-06",
    membersCount: 30,
    createdAt: "2025-01-12",
  },
  {
    id: "t-drb",
    code: "DRB",
    name: "Darbhanga Central Anjuman",
    village: "Darbhanga",
    district: "Darbhanga",
    state: "Bihar",
    pincode: "846004",
    masjid: "Masjid-e-Noor",
    regNo: "BR/DBG/2018/0912",
    phone: "+91 90000 11223",
    upiId: "darbhanga.anjuman@upi",
    status: "trial",
    planType: "free",
    planAmountPaise: 0,
    planCycle: "yearly",
    expiresAt: null,
    membersCount: 214,
    createdAt: "2026-09-01",
  },
  {
    id: "t-krp",
    code: "KRP",
    name: "Karimpur Muslim Society",
    village: "Karimpur",
    district: "Sultanpur",
    state: "Uttar Pradesh",
    pincode: "228001",
    masjid: "Masjid-e-Aqsa",
    regNo: "UP/SLN/2015/0119",
    phone: "+91 99887 76655",
    upiId: "karimpur.society@upi",
    status: "read_only",
    planType: "custom",
    planAmountPaise: 60000,
    planCycle: "yearly",
    expiresAt: "2026-10-01",
    membersCount: 96,
    createdAt: "2025-11-20",
  },
];

export const activeTenant = tenants[0];

const FIRST = [
  "Muhammad", "Abdul", "Md.", "Shahid", "Imran", "Rizwan", "Sajid", "Faisal",
  "Tanveer", "Arif", "Nadeem", "Javed", "Salman", "Aamir", "Rashid", "Hamid",
  "Yusuf", "Ibrahim", "Ismail", "Anwar", "Aslam", "Bilal", "Danish", "Ejaz",
  "Farhan", "Gulzar", "Hasnain", "Iqbal", "Junaid", "Kamran",
];
const LAST = [
  "Idris", "Karim", "Rahman", "Ali", "Hussain", "Ahmed", "Siddiqui", "Ansari",
  "Qureshi", "Khan", "Sheikh", "Malik", "Mirza", "Farooqui", "Sayeed", "Abbasi",
  "Hashmi", "Nomani", "Usmani", "Zubairi", "Ansari", "Khan", "Sheikh", "Malik",
  "Qureshi", "Siddiqui", "Ali", "Ahmed", "Hussain", "Rahman",
];
const FATHERS = [
  "Abdul Rahman", "Muhammad Yunus", "Abdul Ghaffar", "Muhammad Ismail",
  "Abdul Salam", "Muhammad Ilyas", "Abdul Wahid", "Muhammad Anwar",
];
const MOHALLAS = ["Mohalla Masjid", "Mohalla Purab", "Mohalla Pachhim", "Mohalla Kachar"];

export const members: Member[] = Array.from({ length: 30 }, (_, i) => {
  const serial = i + 1;
  const name = `${FIRST[i]} ${LAST[i]}`;
  const fee = i === 4 ? 0 : i % 7 === 0 ? 30000 : i % 11 === 0 ? 100000 : 50000;
  return {
    id: `m-${serial}`,
    tenantId: activeTenant.id,
    code: memberCode(activeTenant.code, serial),
    name,
    fatherName: FATHERS[i % FATHERS.length],
    phone: `+91 9${String(8000000000 + serial * 137911).slice(0, 9)}`,
    household: `${12 + serial}`,
    mohalla: MOHALLAS[i % MOHALLAS.length],
    type: i === 1 ? "imam" : i === 2 ? "muazzin" : i % 9 === 0 ? "donor" : "member",
    status: i === 27 ? "pending" : "active",
    feePaise: fee,
    joinedOn: `202${4 + (i % 3)}-0${(i % 9) + 1}-1${i % 9}`,
    bloodGroup: ["A+", "B+", "O+", "AB+", "O-", "A-"][i % 6],
    concession: fee === 0 ? "Widow — full concession" : undefined,
  };
});

/* Fees: paid pattern per member index so the demo always looks realistic */
const PAID_PATTERN = [4, 4, 3, 4, 4, 2, 4, 4, 4, 1, 3, 4, 4, 4, 0, 4, 2, 4, 4, 3, 4, 4, 1, 4, 4, 4, 4, 4, 3, 4];

export const invoices: Invoice[] = members.flatMap((m, mi) => {
  const paidCount = PAID_PATTERN[mi % PAID_PATTERN.length];
  return PERIODS.map((p, pi) => {
    const isPaid = pi < paidCount;
    const amount = m.feePaise;
    return {
      id: `inv-${m.id}-${p}`,
      tenantId: activeTenant.id,
      memberId: m.id,
      period: p,
      amountPaise: amount,
      paidPaise: isPaid ? amount : 0,
      status: amount === 0 ? "waived" : isPaid ? "paid" : "pending",
      dueDate: `${p}-10`,
    } satisfies Invoice;
  });
});

const COLLECTORS = ["Khajanchi Abdul Karim", "Collector Imran"];
const METHODS: Payment["method"][] = ["cash", "upi", "cash", "gateway", "cash"];

export const payments: Payment[] = invoices
  .filter((i) => i.status === "paid")
  .map((inv, idx) => {
    const m = members.find((x) => x.id === inv.memberId)!;
    const method = METHODS[idx % METHODS.length];
    return {
      id: `pay-${idx + 1}`,
      tenantId: activeTenant.id,
      memberId: inv.memberId,
      amountPaise: inv.amountPaise,
      method,
      reference: method === "gateway" ? `pay_R${100000 + idx}` : `UPI/${900000 + idx}`,
      status: "verified" as const,
      receiptNo: `R-2026-${String(1000 + idx).padStart(5, "0")}`,
      enteredBy: COLLECTORS[idx % 2],
      verifiedBy: idx % 3 === 0 ? "Sadar Muhammad Yusuf" : "Khajanchi Abdul Karim",
      createdAt: `${inv.period}-${String(3 + (idx % 20)).padStart(2, "0")}T10:${String(10 + (idx % 45)).padStart(2, "0")}:00+05:30`,
      settledAt: `${inv.period}-${String(3 + (idx % 20)).padStart(2, "0")}T11:00:00+05:30`,
      note: m.name,
    };
  });

/* Two payments waiting for verification */
export const pendingPayments: Payment[] = [
  {
    id: "pay-pending-1",
    tenantId: activeTenant.id,
    memberId: "m-6",
    amountPaise: 50000,
    method: "upi",
    reference: "UPI/922113",
    status: "pending",
    receiptNo: "—",
    enteredBy: "Collector Imran",
    createdAt: "2026-11-08T18:24:00+05:30",
  },
  {
    id: "pay-pending-2",
    tenantId: activeTenant.id,
    memberId: "m-17",
    amountPaise: 30000,
    method: "gateway",
    reference: "pay_R998211",
    status: "pending",
    receiptNo: "—",
    enteredBy: "System (gateway)",
    createdAt: "2026-11-09T09:02:00+05:30",
  },
];

export const funds: Fund[] = [
  { id: "f-general", tenantId: activeTenant.id, code: "GEN", name: "General Fund", restricted: false, balancePaise: 18450000 },
  { id: "f-imam", tenantId: activeTenant.id, code: "IMS", name: "Imam Salary Fund", restricted: true, balancePaise: 3200000 },
  { id: "f-masjid", tenantId: activeTenant.id, code: "MST", name: "Masjid Maintenance", restricted: true, balancePaise: 7650000 },
  { id: "f-janaza", tenantId: activeTenant.id, code: "JNZ", name: "Janaza / Funeral Fund", restricted: true, balancePaise: 1250000 },
  { id: "f-zakat", tenantId: activeTenant.id, code: "ZKT", name: "Zakat (locked)", restricted: true, balancePaise: 4120000 },
];

export const expenses: Expense[] = [
  { id: "e-1", tenantId: activeTenant.id, fundId: "f-imam", fundName: "Imam Salary Fund", category: "Salary", amountPaise: 1500000, vendor: "Hafiz Abdul Rahman", billUrl: "bills/2026/11/imam-nov.jpg", status: "approved", enteredBy: "Khajanchi Abdul Karim", approvedBy: "Sadar Muhammad Yusuf", createdAt: "2026-11-01T09:15:00+05:30", note: "November salary" },
  { id: "e-2", tenantId: activeTenant.id, fundId: "f-imam", fundName: "Imam Salary Fund", category: "Salary", amountPaise: 600000, vendor: "Muazzin Shahid Ali", billUrl: "bills/2026/11/muazzin-nov.jpg", status: "approved", enteredBy: "Khajanchi Abdul Karim", approvedBy: "Sadar Muhammad Yusuf", createdAt: "2026-11-01T09:20:00+05:30" },
  { id: "e-3", tenantId: activeTenant.id, fundId: "f-masjid", fundName: "Masjid Maintenance", category: "Electricity", amountPaise: 385000, vendor: "UP Power Corp", billUrl: "bills/2026/11/electricity.jpg", status: "pending", enteredBy: "Khajanchi Abdul Karim", createdAt: "2026-11-07T16:40:00+05:30", note: "October bill" },
  { id: "e-4", tenantId: activeTenant.id, fundId: "f-masjid", fundName: "Masjid Maintenance", category: "Repair", amountPaise: 950000, vendor: "Noor Electricals", billUrl: "bills/2026/10/fan-repair.jpg", status: "approved", enteredBy: "Khajanchi Abdul Karim", approvedBy: "Sadar Muhammad Yusuf", createdAt: "2026-10-22T11:05:00+05:30", note: "4 ceiling fans repaired" },
  { id: "e-5", tenantId: activeTenant.id, fundId: "f-janaza", fundName: "Janaza / Funeral Fund", category: "Community", amountPaise: 220000, vendor: "Janaza Committee", status: "approved", enteredBy: "Khajanchi Abdul Karim", approvedBy: "Sadar Muhammad Yusuf", createdAt: "2026-10-14T08:00:00+05:30", note: "Funeral expenses — Late Abdul Ghaffar" },
  { id: "e-6", tenantId: activeTenant.id, fundId: "f-masjid", fundName: "Masjid Maintenance", category: "Cleaning", amountPaise: 180000, vendor: "Safai Staff", billUrl: "bills/2026/10/cleaning.jpg", status: "approved", enteredBy: "Khajanchi Abdul Karim", approvedBy: "Sadar Muhammad Yusuf", createdAt: "2026-10-05T07:30:00+05:30" },
  { id: "e-7", tenantId: activeTenant.id, fundId: "f-general", fundName: "General Fund", category: "Office", amountPaise: 65000, vendor: "Stationery Shop", status: "pending", enteredBy: "Secretary Nadeem Ahmad", createdAt: "2026-11-09T12:10:00+05:30", note: "Receipt books & registers" },
];

export const donations: Donation[] = [
  { id: "d-1", tenantId: activeTenant.id, fundId: "f-masjid", fundName: "Masjid Construction", donorName: "Haji Ashraf Ali", memberId: "m-19", amountPaise: 5000000, method: "gateway", reference: "order_abc123", status: "verified", receiptNo: "D-2026-00141", anonymous: false, note: "For new minaret", enteredBy: "Sadar Muhammad Yusuf", verifiedBy: "Khajanchi Abdul Karim", createdAt: "2026-11-09T11:20:00+05:30", verifiedAt: "2026-11-09T11:25:00+05:30" },
  { id: "d-2", tenantId: activeTenant.id, fundId: "f-zakat", fundName: "Zakat Fund", donorName: "Anonymous", amountPaise: 1500000, method: "upi", reference: "upi_ref_456", status: "verified", receiptNo: "D-2026-00140", anonymous: true, note: "Zakat al-Fitr", enteredBy: "Secretary Nadeem Ahmad", verifiedBy: "Sadar Muhammad Yusuf", createdAt: "2026-11-08T20:10:00+05:30", verifiedAt: "2026-11-08T20:15:00+05:30" },
  { id: "d-3", tenantId: activeTenant.id, fundId: "f-imam", fundName: "Imam Fund", donorName: "Dr. Farhan Qureshi", memberId: "m-7", amountPaise: 1000000, method: "upi", reference: "upi_ref_789", status: "verified", receiptNo: "D-2026-00139", anonymous: false, enteredBy: "Collector Imran", verifiedBy: "Khajanchi Abdul Karim", createdAt: "2026-11-05T14:05:00+05:30", verifiedAt: "2026-11-05T14:10:00+05:30" },
  { id: "d-4", tenantId: activeTenant.id, fundId: "f-sadaqah", fundName: "Sadaqah Fund", donorName: "Salman Ansari", memberId: "m-13", amountPaise: 250000, method: "cash", reference: "cash_box_1", status: "verified", receiptNo: "D-2026-00138", anonymous: false, enteredBy: "Collector Imran", verifiedBy: "Auditor Rafiq", createdAt: "2026-11-03T09:30:00+05:30", verifiedAt: "2026-11-03T09:35:00+05:30" },
  { id: "d-5", tenantId: activeTenant.id, fundId: "f-ramadan", fundName: "Ramadan Iftar", donorName: "Anonymous", amountPaise: 600000, method: "gateway", reference: "order_ramadan_001", status: "verified", receiptNo: "D-2026-00137", anonymous: true, enteredBy: "Secretary Nadeem Ahmad", verifiedBy: "Sadar Muhammad Yusuf", createdAt: "2026-10-29T18:45:00+05:30", verifiedAt: "2026-10-29T18:50:00+05:30" },
  { id: "d-6", tenantId: activeTenant.id, fundId: "f-masjid", fundName: "Masjid Construction", donorName: "Bilal Ahmad", memberId: "m-22", amountPaise: 2000000, method: "cheque", reference: "CHQ-123456", status: "verified", receiptNo: "D-2026-00136", anonymous: false, enteredBy: "Collector Imran", verifiedBy: "Khajanchi Abdul Karim", createdAt: "2026-10-25T12:00:00+05:30", verifiedAt: "2026-10-25T12:05:00+05:30" },
  { id: "d-7", tenantId: activeTenant.id, fundId: "f-sadaqah", fundName: "Sadaqah Fund", donorName: "Anonymous Donor", amountPaise: 100000, method: "cash", status: "pending", receiptNo: "", anonymous: true, enteredBy: "Collector Imran", createdAt: "2026-11-10T10:00:00+05:30" },
];

export const ledger: LedgerEntry[] = (() => {
  const rows: LedgerEntry[] = [];
  let prev = "0x0000000000000000";
  const push = (e: Omit<LedgerEntry, "hash" | "prevHash" | "id">) => {
    const hash = `0x${(rows.length + 1).toString(16).padStart(4, "0")}${Math.abs(
      [...e.narration].reduce((a, c) => a + c.charCodeAt(0), rows.length)
    )
      .toString(16)
      .padStart(12, "0")}`.slice(0, 18);
    const row = { ...e, id: `l-${rows.length + 1}`, prevHash: prev, hash };
    prev = hash;
    rows.push(row);
  };

  push({ tenantId: activeTenant.id, date: "2026-08-01", account: "Cash", narration: "Opening balance (carried forward)", debitPaise: 2250000, creditPaise: 0, refType: "opening", refNo: "OB-2026-27" });

  payments.slice(0, 40).forEach((p) => {
    const m = members.find((x) => x.id === p.memberId);
    push({
      tenantId: activeTenant.id,
      date: p.createdAt.slice(0, 10),
      account: "Cash",
      narration: `Monthly chanda — ${m?.name ?? ""} (${periodLabel(p.createdAt.slice(0, 7))})`,
      debitPaise: p.amountPaise,
      creditPaise: 0,
      refType: "payment",
      refNo: p.receiptNo,
    });
  });

  expenses.forEach((x) => {
    push({
      tenantId: activeTenant.id,
      date: x.createdAt.slice(0, 10),
      account: x.fundName,
      narration: `${x.category} — ${x.vendor}`,
      debitPaise: 0,
      creditPaise: x.amountPaise,
      refType: "expense",
      refNo: `V-${x.id.toUpperCase()}`,
    });
  });

  return rows.reverse();
})();

export const approvals: Approval[] = [
  { id: "a-1", tenantId: activeTenant.id, entityType: "payment", entityId: "pay-pending-1", title: "Verify UPI payment — ₹500", subtitle: "Abdul Karim · BHR-000006-2 · Nov 2026", amountPaise: 50000, requestedBy: "Collector Imran", requestedAt: "2026-11-08T18:24:00+05:30", step: 1, totalSteps: 2, status: "pending" },
  { id: "a-2", tenantId: activeTenant.id, entityType: "expense", entityId: "e-3", title: "Approve expense — ₹3,850", subtitle: "Electricity · UP Power Corp · Masjid Maintenance", amountPaise: 385000, requestedBy: "Khajanchi Abdul Karim", requestedAt: "2026-11-07T16:40:00+05:30", step: 1, totalSteps: 2, status: "pending" },
  { id: "a-3", tenantId: activeTenant.id, entityType: "waiver", entityId: "w-1", title: "Waive dues — ₹1,000", subtitle: "Fatima Bibi · widow concession · 2 months", amountPaise: 100000, requestedBy: "Sadar Muhammad Yusuf", requestedAt: "2026-11-06T10:15:00+05:30", step: 2, totalSteps: 2, status: "pending" },
];

export const complaints: Complaint[] = [
  { id: "c-1", tenantId: activeTenant.id, trackingCode: "CMP-7K2P", category: "Masjid Cleanliness", subject: "Wazukhana tap leaking", body: "The tap in the wazukhana has been leaking for 3 days. Water is pooling near the entrance.", anonymous: false, memberId: "m-9", status: "in_progress", priority: "normal", assignedTo: "Secretary Nadeem Ahmad", createdAt: "2026-11-05T07:40:00+05:30", slaHours: 48 },
  { id: "c-2", tenantId: activeTenant.id, trackingCode: "CMP-9QX1", category: "Finance", subject: "Receipt not received for October payment", body: "I paid ₹500 in cash on 12 October but did not receive a receipt.", anonymous: false, memberId: "m-14", status: "open", priority: "high", createdAt: "2026-11-08T19:02:00+05:30", slaHours: 24 },
  { id: "c-3", tenantId: activeTenant.id, trackingCode: "CMP-3M8L", category: "Imam / Staff", subject: "Request: change Maghrib iqamah time", body: "Maghrib iqamah is very close to azan. Please allow 5 minutes.", anonymous: true, status: "assigned", priority: "low", assignedTo: "Sadar Muhammad Yusuf", createdAt: "2026-11-03T20:11:00+05:30", slaHours: 72 },
  { id: "c-4", tenantId: activeTenant.id, trackingCode: "CMP-5RT9", category: "Finance", subject: "Want to see monthly expense details", body: "Please share where the November collection was spent.", anonymous: false, memberId: "m-22", status: "resolved", priority: "normal", assignedTo: "Khajanchi Abdul Karim", createdAt: "2026-10-28T14:30:00+05:30", resolvedAt: "2026-10-29T09:00:00+05:30", slaHours: 48 },
  { id: "c-5", tenantId: activeTenant.id, trackingCode: "CMP-1AB4", category: "Other", subject: "Street light near masjid not working", body: "The street light outside the masjid gate is off since Eid.", anonymous: true, status: "open", priority: "normal", createdAt: "2026-11-09T21:15:00+05:30", slaHours: 72 },
];

export const notices: Notice[] = [
  { id: "n-1", tenantId: activeTenant.id, title: "November chanda due by 10th", body: "Please clear your November contribution by 10 November. Pay via UPI or contact the collector.", audience: "all", publishedAt: "2026-11-01T08:00:00+05:30", expiresAt: "2026-11-15", pinned: true },
  { id: "n-2", tenantId: activeTenant.id, title: "Monthly committee meeting", body: "Committee meeting on Sunday 16 November after Asr in the masjid hall. All office bearers requested to attend.", audience: "office_bearers", publishedAt: "2026-11-07T18:30:00+05:30", pinned: false },
  { id: "n-3", tenantId: activeTenant.id, title: "Masjid carpet cleaning", body: "The main hall will be closed for cleaning on Friday morning until 10 AM. Jumu'ah will be held as usual.", audience: "all", publishedAt: "2026-11-05T12:00:00+05:30", expiresAt: "2026-11-14", pinned: false },
  { id: "n-4", tenantId: activeTenant.id, title: "New ID cards issued", body: "Members who have not collected their new ID card may collect it from the secretary after Maghrib.", audience: "members", publishedAt: "2026-10-20T17:00:00+05:30", pinned: false },
];

const PRAYERS = [
  ["05:12", "12:08", "15:22", "17:31", "19:04"],
  ["05:13", "12:08", "15:21", "17:30", "19:03"],
  ["05:14", "12:08", "15:20", "17:30", "19:03"],
  ["05:15", "12:09", "15:20", "17:29", "19:02"],
  ["05:16", "12:09", "15:19", "17:28", "19:02"],
  ["05:17", "12:09", "15:19", "17:28", "19:01"],
  ["05:18", "12:09", "15:18", "17:27", "19:01"],
];

export const prayerDays: PrayerDay[] = PRAYERS.map((p, i) => ({
  date: `2026-11-${String(10 + i).padStart(2, "0")}`,
  hijri: `${28 + i} Jumada al-Awwal 1448`,
  fajr: p[0], zuhr: p[1], asr: p[2], maghrib: p[3], isha: p[4],
  jumuah: i === 2 ? "12:30" : undefined,
  iqamahOffset: 10,
}));

export const platformPlans: PlatformPlan[] = [
  { id: "p-free", name: "Free", type: "free", pricePaise: 0, cycle: "lifetime", maxMembers: 150, features: ["Members & households", "Basic collections", "Reports"], activeTenants: 7 },
  { id: "p-standard", name: "Standard", type: "fixed", pricePaise: 120000, cycle: "yearly", maxMembers: 1000, features: ["Everything in Free", "Payment gateway", "WhatsApp reminders", "ID cards"], activeTenants: 18 },
  { id: "p-pro", name: "Pro", type: "fixed", pricePaise: 250000, cycle: "yearly", maxMembers: null, features: ["Everything in Standard", "Multi-masjid", "Audit pack", "Priority support"], activeTenants: 4 },
  { id: "p-custom", name: "Custom", type: "custom", pricePaise: 0, cycle: "yearly", maxMembers: null, features: ["Negotiated pricing", "Custom limits", "Dedicated onboarding"], activeTenants: 2 },
];

/* ── Derived selectors ───────────────────────────────────────── */

export function memberById(id: string) {
  return members.find((m) => m.id === id);
}
export function memberByCode(code: string) {
  return members.find((m) => m.code === code);
}
export function duesForMember(memberId: string) {
  return invoices
    .filter((i) => i.memberId === memberId && i.status !== "paid" && i.status !== "waived")
    .sort((a, b) => a.period.localeCompare(b.period));
}
export function dueTotal(memberId: string) {
  return duesForMember(memberId).reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);
}
export function paymentsForMember(memberId: string) {
  return [...payments, ...pendingPayments]
    .filter((p) => p.memberId === memberId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const stats = (() => {
  const current = "2026-11";
  const collected = payments
    .filter((p) => p.createdAt.startsWith(current))
    .reduce((s, p) => s + p.amountPaise, 0);
  const pending = invoices
    .filter((i) => i.status === "pending" || i.status === "partial")
    .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);
  const spent = expenses
    .filter((e) => e.createdAt.startsWith(current) && e.status === "approved")
    .reduce((s, e) => s + e.amountPaise, 0);
  const totalBilled = invoices.reduce((s, i) => s + i.amountPaise, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidPaise, 0);
  const balance = ledger.reduce((s, l) => s + l.debitPaise - l.creditPaise, 0);

  return {
    collected,
    pending,
    spent,
    balance,
    membersCount: members.filter((m) => m.status === "active").length,
    households: new Set(members.map((m) => m.household)).size,
    collectionRate: totalBilled ? Math.round((totalPaid / totalBilled) * 100) : 0,
    openComplaints: complaints.filter((c) => c.status !== "resolved" && c.status !== "closed").length,
    pendingApprovals: approvals.filter((a) => a.status === "pending").length,
    verifiedPayments: payments.filter((p) => p.status === "verified").length,
    pendingVerification: pendingPayments.length,
  };
})();

/** Last 6 months collection vs expense, for the dashboard chart */
export const monthlySeries = [
  { label: "Jun", collected: 1120000, spent: 845000 },
  { label: "Jul", collected: 1245000, spent: 910000 },
  { label: "Aug", collected: 980000, spent: 760000 },
  { label: "Sep", collected: 1385000, spent: 1020000 },
  { label: "Oct", collected: 1310000, spent: 885000 },
  { label: "Nov", collected: 745000, spent: 395000 },
];

export const topDefaulters = members
  .map((m) => ({ member: m, due: dueTotal(m.id) }))
  .filter((x) => x.due > 0)
  .sort((a, b) => b.due - a.due)
  .slice(0, 6);
