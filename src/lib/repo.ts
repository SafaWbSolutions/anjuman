// ═══════════════════════════════════════════════════════════════
// Data access layer.
//
// One rule: a page never talks to Supabase directly. It calls a
// function here. Each function has two paths —
//   · demo mode → the sample data in mock.ts
//   · live mode → Supabase (RLS scopes every row to the tenant)
//
// Money is always integer paise. Mutations never write a final
// status: the database guards force `pending` and only the RPCs can
// move a row to verified / approved / waived.
// ═══════════════════════════════════════════════════════════════

import { isDemoMode, supabase } from "./supabase";
import {
  approvals as mockApprovals,
  complaints as mockComplaints,
  expenses as mockExpenses,
  funds as mockFunds,
  invoices as mockInvoices,
  ledger as mockLedger,
  members as mockMembers,
  notices as mockNotices,
  payments as mockPayments,
  pendingPayments as mockPendingPayments,
  prayerDays as mockPrayerDays,
  stats as mockStats,
  tenants as mockTenants,
} from "./mock";
import type {
  Approval,
  Complaint,
  Donation,
  Expense,
  FeeOverride,
  FeePlan,
  Fund,
  Invoice,
  LedgerEntry,
  Member,
  Notice,
  Payment,
  PrayerDay,
  Tenant,
} from "./types";

type Row = Record<string, any>;

export interface WorkItem {
  kind: "payment" | "expense" | "approval";
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
}

export interface WorkQueue {
  pendingPayments: number;
  pendingExpenses: number;
  pendingApprovals: number;
  overdueInvoices: number;
  unallocatedPaise: number;
  items: WorkItem[];
}

export interface DashboardSnapshot {
  collectedPaise: number;
  outstandingPaise: number;
  pendingPayments: number;
  pendingExpenses: number;
  highPriorityComplaints: number;
  unallocatedPaise: number;
  ledgerOk: boolean;
  ledgerBrokenAtSeq: number | null;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

/** Cached tenant id of the signed-in user (RLS still enforces it). */
let cachedTenantId: string | null = null;
async function myTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;

  const { data: auth } = await client().auth.getUser();
  if (!auth.user) throw new Error("Not signed in");

  const { data, error } = await client()
    .from("profiles")
    .select("tenant_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) throw error;
  const tenantId = data?.tenant_id;
  if (!tenantId) throw new Error("This account has no tenant");
  cachedTenantId = tenantId;
  return tenantId;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ── Mappers ─────────────────────────────────────────────────────
function toTenant(r: Row): Tenant {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    village: r.village,
    district: r.district,
    state: r.state,
    pincode: r.pincode ?? "",
    masjid: r.masjid ?? "",
    regNo: r.reg_no ?? "",
    phone: r.phone ?? "",
    upiId: r.upi_id ?? "",
    status: r.status,
    planType: r.plan_type,
    planAmountPaise: num(r.plan_amount_paise),
    planCycle: r.plan_cycle,
    expiresAt: r.expires_at ?? null,
    membersCount: num(r.members_count),
    createdAt: r.created_at,
    latitude: r.latitude === null || r.latitude === undefined ? null : num(r.latitude),
    longitude: r.longitude === null || r.longitude === undefined ? null : num(r.longitude),
    timezone: r.timezone ?? "Asia/Kolkata",
  };
}

function toMember(r: Row): Member {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    code: r.code,
    name: r.name,
    fatherName: r.father_name ?? "",
    phone: r.phone ?? "",
    household: r.household ?? "",
    mohalla: r.mohalla ?? "",
    type: r.member_type,
    status: r.status,
    feePaise: num(r.fee_paise),
    joinedOn: r.joined_on,
    bloodGroup: r.blood_group ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    concession: r.concession ?? undefined,
  };
}

function toInvoice(r: Row): Invoice {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    memberId: r.member_id,
    period: r.period,
    amountPaise: num(r.amount_paise),
    paidPaise: num(r.paid_paise),
    status: r.status,
    dueDate: r.due_date,
  };
}

function toPayment(r: Row): Payment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    memberId: r.member_id,
    amountPaise: num(r.amount_paise),
    method: r.method,
    reference: r.reference ?? "",
    status: r.status,
    receiptNo: r.receipt_no ?? "—",
    enteredBy: r.entered_by ?? "",
    verifiedBy: r.verified_by ?? undefined,
    createdAt: r.created_at,
    settledAt: r.verified_at ?? undefined,
    note: r.note ?? undefined,
  };
}

function toExpense(r: Row): Expense {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    fundId: r.fund_id,
    fundName: r.funds?.name ?? r.fund_name ?? "",
    category: r.category,
    amountPaise: num(r.amount_paise),
    vendor: r.vendor,
    billUrl: r.bill_url ?? undefined,
    status: r.status,
    enteredBy: r.entered_by ?? "",
    approvedBy: r.approved_by ?? undefined,
    createdAt: r.created_at,
    note: r.note ?? undefined,
  };
}

function toFund(r: Row): Fund {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    code: r.code,
    name: r.name,
    restricted: Boolean(r.restricted),
    balancePaise: num(r.balance_paise),
  };
}

function toLedger(r: Row): LedgerEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    date: r.entry_date,
    account: r.account,
    narration: r.narration,
    debitPaise: num(r.debit_paise),
    creditPaise: num(r.credit_paise),
    refType: r.ref_type,
    refNo: r.ref_no ?? "",
    hash: r.hash,
    prevHash: r.prev_hash ?? "",
  };
}

function toComplaint(r: Row): Complaint {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    trackingCode: r.tracking_code,
    category: r.category,
    subject: r.subject,
    body: r.body,
    anonymous: Boolean(r.anonymous),
    memberId: r.member_id ?? undefined,
    status: r.status,
    priority: r.priority,
    assignedTo: r.assigned_to ?? undefined,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? undefined,
    slaHours: num(r.sla_hours, 72),
  };
}

function toNotice(r: Row): Notice {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    title: r.title,
    body: r.body,
    audience: r.audience,
    publishedAt: r.published_at,
    expiresAt: r.expires_at ?? undefined,
    pinned: Boolean(r.pinned),
  };
}

function toApproval(r: Row, names: Map<string, string>): Approval {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    title: r.title,
    subtitle: r.subtitle ?? "",
    amountPaise: r.amount_paise === null ? undefined : num(r.amount_paise),
    requestedBy: names.get(r.requested_by) ?? "Office bearer",
    requestedAt: r.created_at,
    step: num(r.step, 1),
    totalSteps: num(r.total_steps, 2),
    status: r.status,
  };
}

function toFeePlan(r: Row): FeePlan {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    amountPaise: num(r.amount_paise),
    cycle: r.cycle,
    dueDay: num(r.due_day, 10),
    graceDays: num(r.grace_days, 5),
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
  };
}

function toFeeOverride(r: Row): FeeOverride {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    memberId: r.member_id,
    amountPaise: num(r.amount_paise),
    reason: r.reason,
    approvedBy: r.approved_by ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    createdAt: r.created_at,
  };
}

// Sample plans / overrides for demo mode. Live mode reads the real rows.
const demoFeePlans: FeePlan[] = [
  {
    id: "pl-1",
    tenantId: "t-bhr",
    name: "Standard monthly chanda",
    amountPaise: 50000,
    cycle: "monthly",
    dueDay: 10,
    graceDays: 5,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "pl-2",
    tenantId: "t-bhr",
    name: "Donor / supporter",
    amountPaise: 100000,
    cycle: "monthly",
    dueDay: 10,
    graceDays: 5,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "pl-3",
    tenantId: "t-bhr",
    name: "Reduced (senior / widow)",
    amountPaise: 30000,
    cycle: "monthly",
    dueDay: 10,
    graceDays: 5,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const demoFeeOverrides: FeeOverride[] = [
  {
    id: "fo-1",
    tenantId: "t-bhr",
    memberId: mockMembers[5]?.id ?? "m-6",
    amountPaise: 25000,
    reason: "Senior citizen concession",
    approvedBy: "u-sadar",
    approvedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "fo-2",
    tenantId: "t-bhr",
    memberId: mockMembers[10]?.id ?? "m-11",
    amountPaise: 100000,
    reason: "Business owner — voluntary higher",
    approvedBy: "u-sadar",
    approvedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "fo-3",
    tenantId: "t-bhr",
    memberId: mockMembers[26]?.id ?? "m-27",
    amountPaise: 25000,
    reason: "Medical hardship — awaiting approval",
    createdAt: "2026-11-01T00:00:00.000Z",
  },
];

function toDonation(r: Row): Donation {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    fundId: r.fund_id,
    fundName: r.funds?.name ?? r.fund_name ?? "",
    donorName: r.donor_name,
    memberId: r.member_id ?? undefined,
    amountPaise: num(r.amount_paise),
    method: r.method,
    reference: r.reference ?? undefined,
    status: r.status,
    receiptNo: r.receipt_no ?? "",
    anonymous: Boolean(r.anonymous),
    note: r.note ?? undefined,
    enteredBy: r.entered_by ?? "",
    verifiedBy: r.verified_by ?? undefined,
    createdAt: r.created_at,
    verifiedAt: r.verified_at ?? undefined,
  };
}

// Sample donations for demo mode
const demoDonations: Donation[] = [
  {
    id: "d-1",
    tenantId: "t-bhr",
    fundId: "f-masjid",
    fundName: "Masjid Maintenance",
    donorName: "Haji Ashraf Ali",
    memberId: "m-19",
    amountPaise: 5000000,
    method: "gateway",
    reference: "order_abc123",
    status: "verified",
    receiptNo: "D-2026-00141",
    anonymous: false,
    note: "For new minaret",
    enteredBy: "u-sadar",
    verifiedBy: "u-khaj",
    createdAt: "2026-11-09T11:20:00+05:30",
    verifiedAt: "2026-11-09T11:25:00+05:30",
  },
  {
    id: "d-2",
    tenantId: "t-bhr",
    fundId: "f-zakat",
    fundName: "Zakat (locked)",
    donorName: "Anonymous",
    amountPaise: 1500000,
    method: "upi",
    reference: "upi_ref_456",
    status: "verified",
    receiptNo: "D-2026-00140",
    anonymous: true,
    note: "Zakat al-Fitr",
    enteredBy: "u-secretary",
    verifiedBy: "u-sadar",
    createdAt: "2026-11-08T20:10:00+05:30",
    verifiedAt: "2026-11-08T20:15:00+05:30",
  },
  {
    id: "d-3",
    tenantId: "t-bhr",
    fundId: "f-imam",
    fundName: "Imam Salary Fund",
    donorName: "Dr. Farhan Qureshi",
    memberId: "m-7",
    amountPaise: 1000000,
    method: "upi",
    reference: "upi_ref_789",
    status: "verified",
    receiptNo: "D-2026-00139",
    anonymous: false,
    enteredBy: "u-collector",
    verifiedBy: "u-khaj",
    createdAt: "2026-11-05T14:05:00+05:30",
    verifiedAt: "2026-11-05T14:10:00+05:30",
  },
  {
    id: "d-4",
    tenantId: "t-bhr",
    fundId: "f-general",
    fundName: "General Fund",
    donorName: "Salman Ansari",
    memberId: "m-13",
    amountPaise: 250000,
    method: "cash",
    reference: "cash_box_1",
    status: "verified",
    receiptNo: "D-2026-00138",
    anonymous: false,
    enteredBy: "u-collector",
    verifiedBy: "u-auditor",
    createdAt: "2026-11-03T09:30:00+05:30",
    verifiedAt: "2026-11-03T09:35:00+05:30",
  },
  {
    id: "d-5",
    tenantId: "t-bhr",
    fundId: "f-janaza",
    fundName: "Janaza / Funeral Fund",
    donorName: "Anonymous",
    amountPaise: 600000,
    method: "gateway",
    reference: "order_ramadan_001",
    status: "verified",
    receiptNo: "D-2026-00137",
    anonymous: true,
    enteredBy: "u-secretary",
    verifiedBy: "u-sadar",
    createdAt: "2026-10-29T18:45:00+05:30",
    verifiedAt: "2026-10-29T18:50:00+05:30",
  },
  {
    id: "d-6",
    tenantId: "t-bhr",
    fundId: "f-masjid",
    fundName: "Masjid Maintenance",
    donorName: "Bilal Ahmad",
    memberId: "m-22",
    amountPaise: 2000000,
    method: "cheque",
    reference: "CHQ-123456",
    status: "verified",
    receiptNo: "D-2026-00136",
    anonymous: false,
    enteredBy: "u-collector",
    verifiedBy: "u-khaj",
    createdAt: "2026-10-25T12:00:00+05:30",
    verifiedAt: "2026-10-25T12:05:00+05:30",
  },
  {
    id: "d-7",
    tenantId: "t-bhr",
    fundId: "f-general",
    fundName: "General Fund",
    donorName: "Anonymous Donor",
    amountPaise: 100000,
    method: "cash",
    status: "pending",
    receiptNo: "",
    anonymous: true,
    enteredBy: "u-collector",
    createdAt: "2026-11-10T10:00:00+05:30",
  },
];

// ── Reads ───────────────────────────────────────────────────────
export async function listMembers(): Promise<Member[]> {
  if (isDemoMode) return mockMembers;

  const { data, error } = await client()
    .from("members")
    .select("*")
    .order("serial_no", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toMember);
}

/** The signed-in user's tenant row (name, address, UPI id, plan). */
export async function getCurrentTenant(): Promise<Tenant | null> {
  if (isDemoMode) return null;

  const { data, error } = await client()
    .from("tenants")
    .select("*")
    .eq("id", await myTenantId())
    .maybeSingle();

  if (error) throw error;
  return data ? toTenant(data) : null;
}

export interface TenantSettings {
  autoGenerateInvoices: boolean;
  autoSendReminders: boolean;
  autoVerifyGateway: boolean;
  reminderDays: number[];
  invoiceDueDay: number;
  receiptFooter: string;
  calcMethod: string;
  fajrAngle: number;
  ishaAngle: number;
  asrFactor: number;
  iqamahOffset: number;
  prayerReminders: boolean;
  jumuahAlert: boolean;
}

const demoSettings: TenantSettings = {
  autoGenerateInvoices: true,
  autoSendReminders: true,
  autoVerifyGateway: true,
  reminderDays: [3, 7, 10, 15],
  invoiceDueDay: 10,
  receiptFooter: "",
  calcMethod: "karachi",
  fajrAngle: 18,
  ishaAngle: 18,
  asrFactor: 2,
  iqamahOffset: 10,
  prayerReminders: true,
  jumuahAlert: true,
};

export async function getTenantSettings(): Promise<TenantSettings> {
  if (isDemoMode) return demoSettings;

  const { data, error } = await client()
    .from("tenant_settings")
    .select("*")
    .eq("tenant_id", await myTenantId())
    .maybeSingle();

  if (error) throw error;
  if (!data) return demoSettings;

  return {
    autoGenerateInvoices: Boolean(data.auto_generate_invoices),
    autoSendReminders: Boolean(data.auto_send_reminders),
    autoVerifyGateway: Boolean(data.auto_verify_gateway),
    reminderDays: (data.reminder_days ?? demoSettings.reminderDays).map((d: unknown) => num(d)),
    invoiceDueDay: num(data.invoice_due_day, 10),
    receiptFooter: data.receipt_footer ?? "",
    calcMethod: data.calc_method ?? "karachi",
    fajrAngle: num(data.fajr_angle, 18),
    ishaAngle: num(data.isha_angle, 18),
    asrFactor: num(data.asr_factor, 2),
    iqamahOffset: num(data.iqamah_offset, 10),
    prayerReminders: Boolean(data.prayer_reminders ?? true),
    jumuahAlert: Boolean(data.jumuah_alert ?? true),
  };
}

export async function saveTenantSettings(patch: Partial<TenantSettings>): Promise<void> {
  if (isDemoMode) return;

  const row: Row = {};
  if (patch.autoGenerateInvoices !== undefined) row.auto_generate_invoices = patch.autoGenerateInvoices;
  if (patch.autoSendReminders !== undefined) row.auto_send_reminders = patch.autoSendReminders;
  if (patch.autoVerifyGateway !== undefined) row.auto_verify_gateway = patch.autoVerifyGateway;
  if (patch.reminderDays !== undefined) row.reminder_days = patch.reminderDays;
  if (patch.invoiceDueDay !== undefined) row.invoice_due_day = patch.invoiceDueDay;
  if (patch.receiptFooter !== undefined) row.receipt_footer = patch.receiptFooter;
  if (patch.calcMethod !== undefined) row.calc_method = patch.calcMethod;
  if (patch.fajrAngle !== undefined) row.fajr_angle = patch.fajrAngle;
  if (patch.ishaAngle !== undefined) row.isha_angle = patch.ishaAngle;
  if (patch.asrFactor !== undefined) row.asr_factor = patch.asrFactor;
  if (patch.iqamahOffset !== undefined) row.iqamah_offset = patch.iqamahOffset;
  if (patch.prayerReminders !== undefined) row.prayer_reminders = patch.prayerReminders;
  if (patch.jumuahAlert !== undefined) row.jumuah_alert = patch.jumuahAlert;

  if (Object.keys(row).length === 0) return;

  const { error } = await client()
    .from("tenant_settings")
    .update(row)
    .eq("tenant_id", await myTenantId());
  if (error) throw error;
}

export interface TenantProfilePatch {
  name?: string;
  masjid?: string;
  village?: string;
  district?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  regNo?: string;
  upiId?: string;
  address?: string;
  logoUrl?: string;
  themeColor?: string;
}

/** Update the tenant profile (sadar/secretary only). */
export async function saveTenantProfile(patch: TenantProfilePatch): Promise<void> {
  if (isDemoMode) return;

  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.masjid !== undefined) row.masjid = patch.masjid;
  if (patch.village !== undefined) row.village = patch.village;
  if (patch.district !== undefined) row.district = patch.district;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.pincode !== undefined) row.pincode = patch.pincode;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.regNo !== undefined) row.reg_no = patch.regNo;
  if (patch.upiId !== undefined) row.upi_id = patch.upiId;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  if (patch.themeColor !== undefined) row.theme_color = patch.themeColor;

  if (Object.keys(row).length === 0) return;

  const { error } = await client()
    .from("tenants")
    .update(row)
    .eq("id", await myTenantId());
  if (error) throw error;
}

/** Masjid coordinates, used by the calculated prayer timetable. */
export async function saveTenantLocation(input: {
  latitude: number | null;
  longitude: number | null;
  timezone: string;
}): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("tenants")
    .update({
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: input.timezone,
    })
    .eq("id", await myTenantId());
  if (error) throw error;
}

function toPrayerDay(r: Row): PrayerDay {
  const cut = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : "");
  return {
    date: r.date,
    hijri: r.hijri ?? "",
    fajr: cut(r.fajr),
    zuhr: cut(r.zuhr),
    asr: cut(r.asr),
    maghrib: cut(r.maghrib),
    isha: cut(r.isha),
    jumuah: r.jumuah ? cut(r.jumuah) : undefined,
    iqamahOffset: num(r.iqamah_offset, 10),
    source: r.source ?? "calculated",
  };
}

export async function listPrayerDays(from: string, to: string): Promise<PrayerDay[]> {
  if (isDemoMode) {
    return mockPrayerDays.filter((d) => d.date >= from && d.date <= to);
  }

  const { data, error } = await client()
    .from("prayer_days")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toPrayerDay);
}

function prayerRow(tenantId: string, day: PrayerDay): Row {
  return {
    tenant_id: tenantId,
    date: day.date,
    hijri: day.hijri || null,
    fajr: day.fajr || null,
    zuhr: day.zuhr || null,
    asr: day.asr || null,
    maghrib: day.maghrib || null,
    isha: day.isha || null,
    jumuah: day.jumuah || null,
    iqamah_offset: day.iqamahOffset,
    source: day.source ?? "manual",
  };
}

/** Save one day. Used by the manual override drawer. */
export async function savePrayerDay(day: PrayerDay): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("prayer_days")
    .upsert(prayerRow(await myTenantId(), day), {
      onConflict: "tenant_id,date",
    });
  if (error) throw error;
}

/** Bulk save, used by calculated months and CSV imports. */
export async function savePrayerDays(days: PrayerDay[]): Promise<number> {
  if (isDemoMode || days.length === 0) return days.length;

  const tenantId = await myTenantId();
  const { error } = await client()
    .from("prayer_days")
    .upsert(days.map((d) => prayerRow(tenantId, d)), {
      onConflict: "tenant_id,date",
    });
  if (error) throw error;
  return days.length;
}

export async function findMemberByCode(code: string): Promise<Member | null> {
  if (isDemoMode) {
    return mockMembers.find((m) => m.code.toLowerCase() === code.toLowerCase()) ?? null;
  }

  const { data, error } = await client()
    .from("members")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (error) throw error;
  return data ? toMember(data) : null;
}

export async function listInvoices(): Promise<Invoice[]> {
  if (isDemoMode) return mockInvoices;

  const { data, error } = await client()
    .from("invoices")
    .select("*")
    .order("period", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toInvoice);
}

export async function listPayments(): Promise<Payment[]> {
  if (isDemoMode) return [...mockPendingPayments, ...mockPayments];

  const { data, error } = await client()
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []).map(toPayment);
}

export async function listExpenses(): Promise<Expense[]> {
  if (isDemoMode) return mockExpenses;

  const { data, error } = await client()
    .from("expenses")
    .select("*, funds(name)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []).map(toExpense);
}

export async function listFunds(): Promise<Fund[]> {
  if (isDemoMode) return mockFunds;

  const { data, error } = await client().from("funds").select("*").order("code");
  if (error) throw error;
  return (data ?? []).map(toFund);
}

export async function listLedger(limit = 300): Promise<LedgerEntry[]> {
  if (isDemoMode) return mockLedger;

  const { data, error } = await client()
    .from("ledger_entries")
    .select("*")
    .order("seq", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(toLedger);
}

export async function listNotices(): Promise<Notice[]> {
  if (isDemoMode) return mockNotices;

  const { data, error } = await client()
    .from("notices")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []).map(toNotice);
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
}

/** Office bearers of this tenant, for assigning complaints. */
export async function listStaff(): Promise<StaffMember[]> {
  if (isDemoMode) {
    return [
      { id: "u-sadar", name: "Sadar Muhammad Yusuf", role: "sadar" },
      { id: "u-khaj", name: "Khajanchi Abdul Karim", role: "khajanchi" },
      { id: "u-sec", name: "Secretary Nadeem Ahmad", role: "secretary" },
    ];
  }

  const { data, error } = await client()
    .from("profiles")
    .select("id, full_name, role")
    .eq("tenant_id", await myTenantId())
    .in("role", ["sadar", "secretary", "khajanchi", "auditor", "collector"])
    .order("role", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((p: Row) => ({
    id: p.id,
    name: p.full_name ?? "Office bearer",
    role: p.role,
  }));
}

export async function listComplaints(): Promise<Complaint[]> {
  if (isDemoMode) return mockComplaints;

  const { data, error } = await client()
    .from("complaints")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw error;
  return (data ?? []).map(toComplaint);
}

/** All anjumans — super admin only (RLS enforces it). */
export async function listTenants(): Promise<Tenant[]> {
  if (isDemoMode) return mockTenants;

  const { data, error } = await client()
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toTenant);
}

export async function listApprovals(): Promise<Approval[]> {
  if (isDemoMode) return mockApprovals;

  const { data, error } = await client()
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const rows = data ?? [];
  const ids = [...new Set(rows.map((r: Row) => r.requested_by).filter(Boolean))];
  const names = new Map<string, string>();

  if (ids.length > 0) {
    const { data: profiles } = await client()
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) names.set(p.id, p.full_name ?? "Office bearer");
  }

  return rows.map((r: Row) => toApproval(r, names));
}

export async function listFeePlans(): Promise<FeePlan[]> {
  if (isDemoMode) return demoFeePlans;

  const { data, error } = await client()
    .from("fee_plans")
    .select("*")
    .order("amount_paise", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toFeePlan);
}

export async function listFeeOverrides(): Promise<FeeOverride[]> {
  if (isDemoMode) return demoFeeOverrides;

  const { data, error } = await client()
    .from("fee_overrides")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toFeeOverride);
}

export interface NewFeePlan {
  name: string;
  amountPaise: number;
  cycle: FeePlan["cycle"];
  dueDay: number;
  graceDays: number;
}

export async function createFeePlan(input: NewFeePlan): Promise<FeePlan> {
  if (isDemoMode) {
    return {
      id: `demo-plan-${Date.now()}`,
      tenantId: "t-bhr",
      name: input.name,
      amountPaise: input.amountPaise,
      cycle: input.cycle,
      dueDay: input.dueDay,
      graceDays: input.graceDays,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  }

  const { data, error } = await client()
    .from("fee_plans")
    .insert({
      tenant_id: await myTenantId(),
      name: input.name.trim(),
      amount_paise: input.amountPaise,
      cycle: input.cycle,
      due_day: input.dueDay,
      grace_days: input.graceDays,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toFeePlan(data);
}

/** Archive a plan. Existing invoices and dues are never touched. */
export async function archiveFeePlan(id: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("fee_plans")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Ask for a member's fee to be changed. The database writes the
 * override as pending and queues a fee_change approval; only a
 * different bearer can approve it.
 */
export async function requestFeeChange(
  memberId: string,
  amountPaise: number,
  reason: string
): Promise<string> {
  if (isDemoMode) return `demo-fee-${Date.now()}`;

  const { data, error } = await client().rpc("request_fee_change", {
    p_member: memberId,
    p_amount_paise: amountPaise,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return String(data);
}

export async function getDashboard(): Promise<DashboardSnapshot> {
  if (isDemoMode) {
    return {
      collectedPaise: mockStats.collected,
      outstandingPaise: mockStats.pending,
      pendingPayments: mockPendingPayments.length,
      pendingExpenses: mockExpenses.filter((e) => e.status === "pending").length,
      highPriorityComplaints: 2,
      unallocatedPaise: 0,
      ledgerOk: true,
      ledgerBrokenAtSeq: null,
    };
  }

  const { data, error } = await client().rpc("dashboard_snapshot");
  if (error) throw error;
  const r = (data ?? {}) as Row;
  return {
    collectedPaise: num(r.collected_paise),
    outstandingPaise: num(r.outstanding_paise),
    pendingPayments: num(r.pending_payments),
    pendingExpenses: num(r.pending_expenses),
    highPriorityComplaints: num(r.high_priority_complaints),
    unallocatedPaise: num(r.unallocated_paise),
    ledgerOk: Boolean(r.ledger_ok),
    ledgerBrokenAtSeq: r.ledger_broken_at_seq ?? null,
  };
}

export async function getWorkQueue(): Promise<WorkQueue> {
  if (isDemoMode) {
    return {
      pendingPayments: mockPendingPayments.length,
      pendingExpenses: mockExpenses.filter((e) => e.status === "pending").length,
      pendingApprovals: mockApprovals.filter((a) => a.status === "pending").length,
      overdueInvoices: mockInvoices.filter(
        (i) => i.status !== "paid" && i.status !== "waived" && i.dueDate < "2026-11-10"
      ).length,
      unallocatedPaise: 0,
      items: [
        ...mockPendingPayments.map((p) => ({
          kind: "payment" as const,
          id: p.id,
          title: `Verify payment · ${mockMembers.find((m) => m.id === p.memberId)?.name ?? "Member"}`,
          subtitle: `₹${(p.amountPaise / 100).toLocaleString("en-IN")} · ${p.method}`,
          createdAt: p.createdAt,
        })),
        ...mockExpenses
          .filter((e) => e.status === "pending")
          .map((e) => ({
            kind: "expense" as const,
            id: e.id,
            title: `Approve bill · ${e.vendor}`,
            subtitle: `${e.category} · ₹${(e.amountPaise / 100).toLocaleString("en-IN")}`,
            createdAt: e.createdAt,
          })),
        ...mockApprovals
          .filter((a) => a.status === "pending")
          .map((a) => ({
            kind: "approval" as const,
            id: a.id,
            title: a.title,
            subtitle: a.subtitle || a.entityType,
            createdAt: a.requestedAt,
          })),
      ]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, 20),
    };
  }

  const { data, error } = await client().rpc("my_work_queue", { p_limit: 20 });
  if (error) throw error;
  const r = (data ?? {}) as Row;

  return {
    pendingPayments: num(r.pending_payments),
    pendingExpenses: num(r.pending_expenses),
    pendingApprovals: num(r.pending_approvals),
    overdueInvoices: num(r.overdue_invoices),
    unallocatedPaise: num(r.unallocated_paise),
    items: Array.isArray(r.items)
      ? r.items.map((item: Row) => ({
          kind: item.kind,
          id: item.id,
          title: item.title,
          subtitle: item.subtitle ?? "",
          createdAt: item.created_at,
        }))
      : [],
  };
}

// ── Money writes ────────────────────────────────────────────────
export interface NewPayment {
  memberId: string;
  amountPaise: number;
  method: Payment["method"];
  reference?: string;
  note?: string;
}

/** Insert a collection. The guard forces status = pending. */
export async function createPayment(input: NewPayment): Promise<Payment> {
  if (isDemoMode) {
    return {
      id: `demo-pay-${Date.now()}`,
      tenantId: "demo",
      memberId: input.memberId,
      amountPaise: input.amountPaise,
      method: input.method,
      reference: input.reference ?? "",
      status: "pending",
      receiptNo: "—",
      enteredBy: "demo",
      createdAt: new Date().toISOString(),
      note: input.note,
    };
  }

  const tenantId = await myTenantId();
  const { data, error } = await client()
    .from("payments")
    .insert({
      tenant_id: tenantId,
      member_id: input.memberId,
      amount_paise: input.amountPaise,
      method: input.method,
      reference: input.reference ?? null,
      note: input.note ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toPayment(data);
}

export async function verifyPayment(id: string): Promise<string> {
  if (isDemoMode) return "R-DEMO-0001";

  const { data, error } = await client().rpc("verify_payment", { p_payment_id: id });
  if (error) throw error;
  return String(data);
}

export async function rejectPayment(id: string, reason: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("reject_payment", {
    p_payment_id: id,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function reversePayment(id: string, reason: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("reverse_payment", {
    p_payment_id: id,
    p_reason: reason,
  });
  if (error) throw error;
}

export interface NewExpense {
  fundId: string;
  category: string;
  amountPaise: number;
  vendor: string;
  note?: string;
}

/** Insert a bill. The guard forces status = pending. */
export async function createExpense(input: NewExpense): Promise<Expense> {
  if (isDemoMode) {
    return {
      id: `demo-exp-${Date.now()}`,
      tenantId: "demo",
      fundId: input.fundId,
      fundName: "",
      category: input.category,
      amountPaise: input.amountPaise,
      vendor: input.vendor,
      status: "pending",
      enteredBy: "demo",
      createdAt: new Date().toISOString(),
      note: input.note,
    };
  }

  const tenantId = await myTenantId();
  const { data, error } = await client()
    .from("expenses")
    .insert({
      tenant_id: tenantId,
      fund_id: input.fundId,
      category: input.category,
      amount_paise: input.amountPaise,
      vendor: input.vendor,
      note: input.note ?? null,
    })
    .select("*, funds(name)")
    .single();

  if (error) throw error;
  return toExpense(data);
}

export async function rejectExpense(id: string, reason: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("reject_expense", {
    p_expense_id: id,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function approveExpense(id: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("approve_expense", { p_expense_id: id });
  if (error) throw error;
}

export async function decideApproval(
  id: string,
  approve: boolean,
  note?: string
): Promise<{ status: string; waived: number }> {
  if (isDemoMode) return { status: approve ? "approved" : "rejected", waived: 0 };

  const { data, error } = await client().rpc("decide_approval", {
    p_approval_id: id,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;

  const r = (data ?? {}) as Row;
  return { status: String(r.status), waived: num(r.waived) };
}

export async function requestWaiver(
  memberId: string,
  periods: string[],
  reason: string
): Promise<string> {
  if (isDemoMode) return `demo-appr-${Date.now()}`;

  const { data, error } = await client().rpc("request_waiver", {
    p_member: memberId,
    p_periods: periods,
    p_reason: reason,
  });
  if (error) throw error;
  return String(data);
}

export interface NewComplaint {
  category: string;
  subject: string;
  body: string;
  anonymous: boolean;
  memberId?: string | null;
  priority?: Complaint["priority"];
}

export async function createComplaint(input: NewComplaint): Promise<Complaint> {
  if (isDemoMode) {
    return {
      id: `demo-cmp-${Date.now()}`,
      tenantId: "t-bhr",
      trackingCode: "CMP-4X2Q9K",
      category: input.category,
      subject: input.subject,
      body: input.body,
      anonymous: input.anonymous,
      memberId: input.anonymous ? undefined : input.memberId ?? undefined,
      status: "open",
      priority: input.priority ?? "normal",
      createdAt: new Date().toISOString(),
      slaHours: 72,
    };
  }

  const { data, error } = await client()
    .from("complaints")
    .insert({
      tenant_id: await myTenantId(),
      category: input.category,
      subject: input.subject.trim(),
      body: input.body.trim(),
      anonymous: input.anonymous,
      member_id: input.anonymous ? null : input.memberId ?? null,
      priority: input.priority ?? "normal",
    })
    .select("*")
    .single();

  if (error) throw error;
  return toComplaint(data);
}

/** Office bearer triage: status, priority and owner only. */
export async function updateComplaint(
  id: string,
  patch: {
    status?: Complaint["status"];
    priority?: Complaint["priority"];
    assignedTo?: string | null;
  }
): Promise<void> {
  if (isDemoMode) return;

  const row: Row = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo || null;

  if (Object.keys(row).length === 0) return;

  const { error } = await client().from("complaints").update(row).eq("id", id);
  if (error) throw error;
}

export interface NewMember {
  name: string;
  fatherName?: string;
  phone?: string;
  household?: string;
  mohalla?: string;
  memberType?: Member["type"];
  feePaise?: number;
  joinedOn?: string;
}

/**
 * Add a member. The database assigns the member ID (BHR-000123-7)
 * inside a per-tenant advisory lock, so two saves can never collide.
 */
export async function createMember(input: NewMember): Promise<Member> {
  if (isDemoMode) {
    return {
      id: `demo-mem-${Date.now()}`,
      tenantId: "demo",
      code: "BHR-000031-9",
      name: input.name,
      fatherName: input.fatherName ?? "",
      phone: input.phone ?? "",
      household: input.household ?? "",
      mohalla: input.mohalla ?? "",
      type: input.memberType ?? "member",
      status: "active",
      feePaise: input.feePaise ?? 50000,
      joinedOn: input.joinedOn ?? new Date().toISOString().slice(0, 10),
    };
  }

  const tenantId = await myTenantId();
  const { data, error } = await client()
    .from("members")
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      father_name: input.fatherName?.trim() || null,
      phone: input.phone?.trim() || null,
      household: input.household?.trim() || null,
      mohalla: input.mohalla?.trim() || null,
      member_type: input.memberType ?? "member",
      fee_paise: input.feePaise ?? 0,
      joined_on: input.joinedOn ?? new Date().toISOString().slice(0, 10),
    })
    .select("*")
    .single();

  if (error) throw error;
  return toMember(data);
}

/** Create this month's invoices for every active member (idempotent). */
export async function generateInvoices(period?: string): Promise<{ created: number }> {
  if (isDemoMode) return { created: 0 };

  const { data, error } = await client().rpc("generate_monthly_invoices", {
    p_tenant: await myTenantId(),
    p_period: period ?? null,
  });
  if (error) throw error;

  const r = (data ?? {}) as Row;
  return { created: num(r.created) };
}

export interface NewNotice {
  title: string;
  body: string;
  audience: Notice["audience"];
  pinned?: boolean;
  expiresAt?: string | null;
}

export async function createNotice(input: NewNotice): Promise<Notice> {
  if (isDemoMode) {
    return {
      id: `demo-notice-${Date.now()}`,
      tenantId: "demo",
      title: input.title,
      body: input.body,
      audience: input.audience,
      publishedAt: new Date().toISOString(),
      expiresAt: input.expiresAt ?? undefined,
      pinned: Boolean(input.pinned),
    };
  }

  const tenantId = await myTenantId();
  const { data, error } = await client()
    .from("notices")
    .insert({
      tenant_id: tenantId,
      title: input.title,
      body: input.body,
      audience: input.audience,
      pinned: Boolean(input.pinned),
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toNotice(data);
}

/** Queue this notice for every enabled channel; returns messages queued. */
export async function broadcastNotice(id: string): Promise<number> {
  if (isDemoMode) return 0;

  const { data, error } = await client().rpc("broadcast_notice", {
    p_notice_id: id,
  });
  if (error) throw error;
  return num(data);
}

// ═══════════════════════════════════════════════════════════════
// Donations
// ═══════════════════════════════════════════════════════════════

export async function listDonations(): Promise<Donation[]> {
  if (isDemoMode) return demoDonations;

  const { data, error } = await client()
    .from("donations")
    .select("*, funds(name)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []).map(toDonation);
}

export interface NewDonation {
  fundId: string;
  donorName: string;
  memberId?: string | null;
  amountPaise: number;
  method: Donation["method"];
  reference?: string;
  anonymous?: boolean;
  note?: string;
}

export async function createDonation(input: NewDonation): Promise<Donation> {
  if (isDemoMode) {
    return {
      id: `demo-don-${Date.now()}`,
      tenantId: "t-bhr",
      fundId: input.fundId,
      fundName: "",
      donorName: input.donorName,
      memberId: input.memberId ?? undefined,
      amountPaise: input.amountPaise,
      method: input.method,
      reference: input.reference ?? "",
      status: "pending",
      receiptNo: "",
      anonymous: input.anonymous ?? false,
      note: input.note,
      enteredBy: "demo",
      createdAt: new Date().toISOString(),
    };
  }

  const { data, error } = await client().rpc("create_donation", {
    p_fund_id: input.fundId,
    p_donor_name: input.donorName.trim(),
    p_member_id: input.memberId ?? null,
    p_amount_paise: input.amountPaise,
    p_method: input.method,
    p_reference: input.reference?.trim() ?? null,
    p_anonymous: input.anonymous ?? false,
    p_note: input.note?.trim() ?? null,
  });

  if (error) throw error;

  // Fetch the created donation
  const { data: donation, error: fetchError } = await client()
    .from("donations")
    .select("*, funds(name)")
    .eq("id", data)
    .single();

  if (fetchError) throw fetchError;
  return toDonation(donation);
}

export async function verifyDonation(id: string): Promise<string> {
  if (isDemoMode) return `D-DEMO-${Date.now()}`;

  const { data, error } = await client().rpc("verify_donation", {
    p_donation_id: id,
  });
  if (error) throw error;
  return String(data);
}

export async function rejectDonation(id: string, reason: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("reject_donation", {
    p_donation_id: id,
    p_reason: reason,
  });
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════
// Reminders
// ═══════════════════════════════════════════════════════════════

export interface ReminderResult {
  created: number;
  skipped?: number;
  reason: string;
  period: string;
}

/**
 * Queue dues reminders for a period. The database dedupes per
 * invoice/day, and the nightly job also calls this automatically —
 * so pressing the button can never double-send.
 */
export async function queueReminders(
  period?: string,
  force = true
): Promise<ReminderResult> {
  if (isDemoMode) {
    return { created: 0, reason: "demo_mode", period: period ?? "" };
  }

  const { data, error } = await client().rpc("queue_reminders", {
    p_tenant: await myTenantId(),
    p_period: period ?? null,
    p_force: force,
  });
  if (error) throw error;

  const r = (data ?? {}) as Row;
  return {
    created: num(r.created),
    skipped: r.skipped === undefined ? undefined : num(r.skipped),
    reason: String(r.reason ?? "queued"),
    period: String(r.period ?? period ?? ""),
  };
}
