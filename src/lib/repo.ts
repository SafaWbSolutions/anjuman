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
  activeTenant,
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
  Invitation,
  LedgerEntry,
  Member,
  MemberStatus,
  MemberType,
  NewInvitation,
  Notice,
  Payment,
  PlanType,
  PrayerDay,
  Role,
  Tenant,
  TenantStatus,
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
    features: typeof r.features === "object" && r.features !== null ? (r.features as Record<string, boolean>) : {},
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
    email: r.email ?? "",
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
    requiresDualApproval: Boolean(r.requires_dual_approval),
    firstApprovedBy: r.first_approved_by ?? undefined,
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
  if (isDemoMode) return activeTenant;

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
  feeStartPeriod: string | null;
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
  feeStartPeriod: null,
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
    feeStartPeriod: data.fee_start_period ?? null,
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

/** Change the member ID prefix (tenant code). Existing codes stay as-is. */
export async function setMemberPrefix(prefix: string): Promise<string> {
  if (isDemoMode) return prefix.toUpperCase();

  const { data, error } = await client().rpc("set_member_prefix", {
    p_prefix: prefix,
  });
  if (error) throw error;
  return String(data);
}

/**
 * From which month does chanda counting start (e.g. 2024-11 for
 * two years back) and on which day of the month is it due.
 */
export async function setFeeCycle(
  start: string | null,
  dueDay: number
): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("set_fee_cycle", {
    p_start: start,
    p_due_day: dueDay,
  });
  if (error) throw error;
}

/** Backdated dues for one member — December 2025 se aaj tak, ek click. */export async function generateMemberDues(
  memberId: string,
  from: string,
  to?: string | null
): Promise<{ months: number; created: number; amountPaise: number; monthlyPaise: number }> {
  if (isDemoMode) return { months: 0, created: 0, amountPaise: 0, monthlyPaise: 0 };

  const { data, error } = await client().rpc("generate_member_dues", {
    p_member: memberId,
    p_from: from,
    p_to: to ?? null,
  });
  if (error) throw error;

  const r = (data ?? {}) as Row;
  return {
    months: num(r.months),
    created: num(r.created),
    amountPaise: num(r.amount_paise),
    monthlyPaise: num(r.monthly_paise),
  };
}

/** Member-side advance payment — stays pending until sadar + khajanchi approve. */
export async function submitAdvancePayment(input: {
  memberId: string;
  amountPaise: number;
  method: Payment["method"];
  reference?: string;
  note?: string;
}): Promise<string> {
  if (isDemoMode) return `demo-pay-${Date.now()}`;

  const { data, error } = await client().rpc("submit_advance_payment", {
    p_member: input.memberId,
    p_amount: input.amountPaise,
    p_method: input.method,
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return String(data);
}
export async function generateDuesRange(
  from?: string | null,
  to?: string | null
): Promise<{ months: number; created: number; amountPaise: number }> {
  if (isDemoMode) return { months: 0, created: 0, amountPaise: 0 };

  const { data, error } = await client().rpc("generate_dues_range", {
    p_from: from ?? null,
    p_to: to ?? null,
  });
  if (error) throw error;

  const r = (data ?? {}) as Row;
  return {
    months: num(r.months),
    created: num(r.created),
    amountPaise: num(r.amount_paise),
  };
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
  planType?: "free" | "fixed" | "custom";
  planAmountPaise?: number;
  status?: "active" | "trial" | "read_only" | "suspended";
  expiresAt?: string | null;
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
  if (patch.planType !== undefined) row.plan_type = patch.planType;
  if (patch.planAmountPaise !== undefined) row.plan_amount_paise = patch.planAmountPaise;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;

  if (Object.keys(row).length === 0) return;

  const { error } = await client()
    .from("tenants")
    .update(row)
    .eq("id", await myTenantId());
  if (error) throw error;
}

/** Update any tenant's profile — super admin only (RLS bypasses tenant scoping). */
export async function saveTenantProfileForTenant(
  tenantId: string,
  patch: TenantProfilePatch
): Promise<void> {
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
  if (patch.planType !== undefined) row.plan_type = patch.planType;
  if (patch.planAmountPaise !== undefined) row.plan_amount_paise = patch.planAmountPaise;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;

  if (Object.keys(row).length === 0) return;

  const { error } = await client().from("tenants").update(row).eq("id", tenantId);
  if (error) throw error;
}

/** Create a new anjuman record — super admin only. */
export async function createTenantRecord(profile: {
  code: string;
  name: string;
  village: string;
  district: string;
  state: string;
  pincode?: string;
  masjid?: string;
  regNo?: string;
  phone?: string;
  email?: string;
  upiId?: string;
  status?: TenantStatus;
  planType?: PlanType;
  planAmountPaise?: number;
  planCycle?: "monthly" | "yearly" | "lifetime";
  expiresAt?: string | null;
  features?: Record<string, unknown>;
}): Promise<string> {
  if (isDemoMode) return "demo-tenant";

  const { data, error } = await client()
    .from("tenants")
    .insert({
      code: profile.code,
      name: profile.name,
      village: profile.village,
      district: profile.district,
      state: profile.state,
      pincode: profile.pincode ?? "",
      masjid: profile.masjid ?? "",
      reg_no: profile.regNo ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      upi_id: profile.upiId ?? "",
      status: profile.status ?? "trial",
      plan_type: profile.planType ?? "free",
      plan_amount_paise: profile.planAmountPaise ?? 0,
      plan_cycle: profile.planCycle ?? "yearly",
      expires_at: profile.expiresAt ?? null,
      features: profile.features ?? { payments: true, whatsapp: true, idCards: true },
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/** Update any member across all anjumans — super admin only. */
export async function updateMemberAcrossTenants(
  memberId: string,
  tenantId: string,
  patch: {
    name?: string;
    fatherName?: string;
    phone?: string;
    email?: string;
    household?: string;
    mohalla?: string;
    type?: MemberType;
    status?: MemberStatus;
    feePaise?: number;
    bloodGroup?: string;
    concession?: string;
    photoUrl?: string;
  }
): Promise<void> {
  if (isDemoMode) return;

  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.fatherName !== undefined) row.father_name = patch.fatherName;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.household !== undefined) row.household = patch.household;
  if (patch.mohalla !== undefined) row.mohalla = patch.mohalla;
  if (patch.type !== undefined) row.member_type = patch.type;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.feePaise !== undefined) row.fee_paise = patch.feePaise;
  if (patch.bloodGroup !== undefined) row.blood_group = patch.bloodGroup;
  if (patch.concession !== undefined) row.concession = patch.concession;
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl;

  if (Object.keys(row).length === 0) return;

  const { error } = await client()
    .from("members")
    .update(row)
    .eq("id", memberId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

/** Activate or deactivate any member across anjumans — super admin only. */
export async function setMemberActiveAcrossTenants(
  memberId: string,
  tenantId: string,
  active: boolean
): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("members")
    .update({ status: active ? "active" : "inactive" })
    .eq("id", memberId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

/** List all members across all anjumans with tenant name — super admin only. */
export async function listAllMembers(): Promise<(Member & { tenantName: string })[]> {
  if (isDemoMode) {
    return mockMembers.map((m) => ({ ...m, tenantName: activeTenant.name }));
  }

  const { data, error } = await client()
    .from("members")
    .select("*, tenants(name)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r: Row) => ({
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
    tenantName: (r.tenants as any)?.name ?? "",
  }));
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
  active: boolean;
}

/** Office bearers of this tenant, for assigning complaints. */
export async function listStaff(): Promise<StaffMember[]> {
  if (isDemoMode) {
    return [
      { id: "u-sadar", name: "Sadar Muhammad Yusuf", role: "sadar", active: true },
      { id: "u-khaj", name: "Khajanchi Abdul Karim", role: "khajanchi", active: true },
      { id: "u-sec", name: "Secretary Nadeem Ahmad", role: "secretary", active: true },
    ];
  }

  const { data, error } = await client()
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("tenant_id", await myTenantId())
    .in("role", ["sadar", "secretary", "khajanchi", "auditor", "collector"])
    .order("role", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((p: Row) => ({
    id: p.id,
    name: p.full_name ?? "Office bearer",
    role: p.role,
    active: p.is_active ?? true,
  }));
}

/** Update a staff member's role (sadar/secretary only). */
export async function updateStaffRole(userId: string, role: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .eq("tenant_id", await myTenantId());
  if (error) throw error;
}

/** Enable/disable a staff member's access (sadar/secretary only). */
export async function updateStaffActive(userId: string, active: boolean): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("profiles")
    .update({ is_active: active })
    .eq("id", userId)
    .eq("tenant_id", await myTenantId());
  if (error) throw error;
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

export interface Integration {
  id: string;
  tenantId: string;
  scope: "platform" | "tenant";
  type: "payment" | "sms" | "whatsapp" | "email" | "push";
  provider: string;
  mode: "test" | "live";
  enabled: boolean;
  config: Record<string, unknown>;
  secretRef: string | null;
  status: "not_configured" | "connected" | "error";
  lastTestedAt: string | null;
  createdAt: string;
}

function toIntegration(r: Row): Integration {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    scope: r.scope ?? "tenant",
    type: r.type,
    provider: r.provider,
    mode: r.mode,
    enabled: r.enabled,
    config: r.config ?? {},
    secretRef: r.secret_ref ?? null,
    status: r.status,
    lastTestedAt: r.last_tested_at ?? null,
    createdAt: r.created_at,
  };
}

/** List integrations for this tenant. */
export async function listIntegrations(): Promise<Integration[]> {
  if (isDemoMode) return [];

  const { data, error } = await client()
    .from("integrations")
    .select("*")
    .eq("tenant_id", await myTenantId())
    .order("type")
    .order("provider");

  if (error) throw error;
  return (data ?? []).map(toIntegration);
}

/** Save (or create) an integration's encrypted secret. */
export async function saveIntegrationSecret(
  integrationId: string,
  secret: Record<string, unknown>
): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("save_integration_secret", {
    p_integration_id: integrationId,
    p_secret: secret,
  });
  if (error) throw error;
}

/** Test an integration via the admin-test edge function. */
export async function testIntegration(integrationId: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().functions.invoke("admin-test", {
    body: { integration_id: integrationId },
  });
  if (error) throw error;
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

// ═══════════════════════════════════════════════════════════════
// Platform plans (super admin)
// ═══════════════════════════════════════════════════════════════

export interface PlatformPlan {
  id: string;
  name: string;
  type: "free" | "fixed" | "custom";
  pricePaise: number;
  cycle: "monthly" | "quarterly" | "yearly" | "lifetime";
  maxMembers: number | null;
  features: string[];
  active: boolean;
  sortOrder: number;
  activeTenants: number;
}

function toPlatformPlan(r: Row): PlatformPlan {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    pricePaise: Number(r.price_paise),
    cycle: r.cycle,
    maxMembers: r.max_members === null ? null : Number(r.max_members),
    features: r.features ?? [],
    active: r.active,
    sortOrder: Number(r.sort_order),
    activeTenants: 0,
  };
}

/** List all platform plans (super admin). */
export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  if (isDemoMode) {
    // Return mock data matching the seeded values
    const base = [
      { id: "p-free", name: "Free", type: "free" as const, pricePaise: 0, cycle: "yearly" as const, maxMembers: 150, features: ["Members & households", "Basic collections", "Reports"], active: true, sortOrder: 1 },
      { id: "p-standard", name: "Standard", type: "fixed" as const, pricePaise: 120000, cycle: "yearly" as const, maxMembers: 1000, features: ["Everything in Free", "Payment gateway", "WhatsApp reminders", "ID cards"], active: true, sortOrder: 2 },
      { id: "p-pro", name: "Pro", type: "fixed" as const, pricePaise: 250000, cycle: "yearly" as const, maxMembers: null, features: ["Everything in Standard", "Multi-masjid", "Audit pack", "Priority support"], active: true, sortOrder: 3 },
      { id: "p-custom", name: "Custom", type: "custom" as const, pricePaise: 0, cycle: "yearly" as const, maxMembers: null, features: ["Negotiated pricing", "Custom limits", "Custom features"], active: true, sortOrder: 4 },
    ];
    return base.map((p) => ({ ...p, activeTenants: 0 }));
  }

  const { data, error } = await client()
    .from("platform_plans")
    .select("*")
    .order("sort_order");

  if (error) throw error;
  const plans = (data ?? []).map(toPlatformPlan);

  // Compute active tenant count per plan
  const { data: tenants } = await client()
    .from("tenants")
    .select("plan_type")
    .in("status", ["active", "trial"]);

  const counts = new Map<string, number>();
  for (const t of tenants ?? []) {
    const key = `p-${t.plan_type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return plans.map((p) => ({ ...p, activeTenants: counts.get(p.id) ?? 0 }));
}

export interface PlatformPlanPatch {
  name?: string;
  type?: "free" | "fixed" | "custom";
  pricePaise?: number;
  cycle?: "monthly" | "quarterly" | "yearly" | "lifetime";
  maxMembers?: number | null;
  features?: string[];
  active?: boolean;
  sortOrder?: number;
}

/** Update a platform plan (super admin). */
export async function savePlatformPlan(id: string, patch: PlatformPlanPatch): Promise<void> {
  if (isDemoMode) return;

  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.pricePaise !== undefined) row.price_paise = patch.pricePaise;
  if (patch.cycle !== undefined) row.cycle = patch.cycle;
  if (patch.maxMembers !== undefined) row.max_members = patch.maxMembers;
  if (patch.features !== undefined) row.features = patch.features;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;

  if (Object.keys(row).length === 0) return;

  const { error } = await client()
    .from("platform_plans")
    .update(row)
    .eq("id", id);
  if (error) throw error;
}

/** Create a new platform plan (super admin). */
export async function createPlatformPlan(input: PlatformPlanPatch & { id: string }): Promise<void> {
  if (isDemoMode) return;

  const row: Row = {
    id: input.id,
    name: input.name ?? "",
    type: input.type ?? "fixed",
    price_paise: input.pricePaise ?? 0,
    cycle: input.cycle ?? "yearly",
    max_members: input.maxMembers ?? null,
    features: input.features ?? [],
    active: input.active ?? true,
    sort_order: input.sortOrder ?? 0,
  };

  const { error } = await client()
    .from("platform_plans")
    .insert(row);
  if (error) throw error;
}

/** Platform invoice type (super admin billing). */
export interface PlatformInvoice {
  id: string;
  tenantId: string;
  tenantName: string;
  invoiceNo: string;
  amountPaise: number;
  status: "pending" | "paid" | "overdue" | "voided";
  periodFrom: string;
  periodTo: string;
  dueDate: string;
  paidAt?: string | null;
  paidAmountPaise?: number | null;
  createdAt: string;
}

function toPlatformInvoice(r: Row): PlatformInvoice {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: (r.tenants as any)?.name ?? "",
    invoiceNo: r.invoice_no,
    amountPaise: Number(r.amount_paise),
    status: r.status,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    dueDate: r.due_date,
    paidAt: r.paid_at ?? null,
    paidAmountPaise: r.paid_amount_paise === null ? null : Number(r.paid_amount_paise),
    createdAt: r.created_at,
  };
}

/** List all platform invoices (super admin). */
export async function listPlatformInvoices(): Promise<PlatformInvoice[]> {
  if (isDemoMode) return [];

  const { data, error } = await client()
    .from("platform_invoices")
    .select("*, tenants(name)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toPlatformInvoice);
}

export interface NewPlatformInvoice {
  tenantId: string;
  amountPaise: number;
  periodFrom: string;
  periodTo: string;
  dueDate: string;
}

/** Create a platform invoice (super admin). */
export async function createPlatformInvoice(input: NewPlatformInvoice): Promise<string> {
  if (isDemoMode) return `demo-plat-inv-${Date.now()}`;

  const invoiceNo = `PI-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0")}`;

  const { data, error } = await client()
    .from("platform_invoices")
    .insert({
      tenant_id: input.tenantId,
      invoice_no: invoiceNo,
      amount_paise: input.amountPaise,
      status: "pending",
      period_from: input.periodFrom,
      period_to: input.periodTo,
      due_date: input.dueDate,
    })
    .select("id")
    .single();

  if (error) throw error;
  return String(data.id);
}

/** Mark a platform invoice as paid (super admin). */
export async function markPlatformInvoicePaid(id: string, paidAmountPaise: number): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("platform_invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_amount_paise: paidAmountPaise,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Void a platform invoice (super admin). */
export async function voidPlatformInvoice(id: string): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client()
    .from("platform_invoices")
    .update({ status: "voided" })
    .eq("id", id);
  if (error) throw error;
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

/** Create a team invitation (sadar/secretary/super_admin). */
export async function createInvitation(input: NewInvitation): Promise<Invitation> {
  if (isDemoMode) {
    return {
      id: `demo-inv-${Date.now()}`,
      tenantId: "t-bhr",
      email: input.email,
      role: input.role,
      invitedBy: "demo-user",
      token: `demo-token-${Date.now()}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    };
  }

  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client()
    .from("invitations")
    .insert({
      tenant_id: await myTenantId(),
      email: input.email.toLowerCase().trim(),
      role: input.role,
      invited_by: (await client().auth.getUser()).data.user?.id,
      token,
      expires_at: expiresAt,
    })
    .select("*, tenants(name), profiles(full_name)")
    .single();

  if (error) throw error;
  return toInvitation(data);
}

/** List invitations for the current tenant (sadar/secretary/super_admin). */
export async function listInvitations(): Promise<Invitation[]> {
  if (isDemoMode) return [];

  const { data, error } = await client()
    .from("invitations")
    .select("*, tenants(name), profiles(full_name)")
    .eq("tenant_id", await myTenantId())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toInvitation);
}

/** Accept an invitation using its token. Creates the auth user + profile. */
export async function acceptInvitation(token: string): Promise<{ email: string; role: Role; tenantId: string }> {
  if (isDemoMode) {
    return { email: "demo@example.com", role: "member", tenantId: "t-bhr" };
  }

  // Verify the invite exists and is valid
  const { data: invite, error: fetchError } = await client()
    .from("invitations")
    .select("*, tenants(name)")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (fetchError || !invite) throw new Error("Invalid or expired invitation");

  // Mark as accepted
  const { error: updateError } = await client()
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (updateError) throw updateError;

  return {
    email: invite.email,
    role: invite.role,
    tenantId: invite.tenant_id,
  };
}

function toInvitation(r: Row): Invitation {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    email: r.email,
    role: r.role,
    invitedBy: r.invited_by,
    token: r.token,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at ?? null,
    createdAt: r.created_at,
  };
}

/** Create (or reset) a login for a member or office bearer via Edge Function. */
export async function createMemberLogin(input: {
  memberId?: string | null;
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: Role;
}): Promise<{ email: string }> {
  if (isDemoMode) return { email: input.email };

  const { data, error } = await client().functions.invoke("admin-create-user", {
    body: {
      member_id: input.memberId ?? null,
      email: input.email.trim().toLowerCase(),
      password: input.password,
      full_name: input.fullName ?? "",
      phone: input.phone ?? "",
      role: input.role ?? "member",
    },
  });

  if (error) {
    let message = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      const body = ctx ? await ctx.json() : null;
      if (body?.error) message = String(body.error);
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }

  if (!data?.ok) throw new Error(data?.error ?? "Login create nahi hua");
  return { email: String(data.email) };
}

export interface MyProfilePatch {
  name: string;
  phone: string;
  email: string;
  photoUrl?: string | null;
}

/** Update the signed-in user's own name / mobile / email / photo. */
export async function saveMyProfile(patch: MyProfilePatch): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("update_my_profile", {
    p_full_name: patch.name.trim(),
    p_phone: patch.phone,
    p_email: patch.email,
    p_photo_url: patch.photoUrl ?? null,
  });
  if (error) throw error;
}

/** Upload a profile picture to the public avatars bucket; returns its URL. */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  if (isDemoMode) return "";

  const ext =
    (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await client()
    .storage.from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
  if (error) throw error;

  return client().storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export interface MemberDetailsPatch {
  name: string;
  fatherName?: string;
  phone?: string;
  email?: string;
  household?: string;
  mohalla?: string;
  bloodGroup?: string;
  photoUrl?: string | null;
}

/** Sadar / secretary / platform admin edits a member's full details. */
export async function saveMemberDetails(
  memberId: string,
  patch: MemberDetailsPatch
): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("update_member_details", {
    p_member_id: memberId,
    p_name: patch.name.trim(),
    p_father_name: patch.fatherName ?? "",
    p_phone: patch.phone ?? "",
    p_email: patch.email ?? "",
    p_household: patch.household ?? "",
    p_mohalla: patch.mohalla ?? "",
    p_photo_url: patch.photoUrl ?? null,
    p_blood_group: patch.bloodGroup ?? "",
  });
  if (error) throw error;
}

/** The members row linked to the signed-in account, if any. */
export async function getMyMember(): Promise<Member | null> {
  if (isDemoMode) return null;

  const { data: auth } = await client().auth.getUser();
  if (!auth.user) return null;

  const { data: profile, error: profileError } = await client()
    .from("profiles")
    .select("member_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.member_id) return null;

  const { data, error } = await client()
    .from("members")
    .select("*")
    .eq("id", profile.member_id)
    .maybeSingle();
  if (error) throw error;
  return data ? toMember(data) : null;
}

export interface NewMember {
  name: string;
  fatherName?: string;
  phone?: string;
  email?: string;
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
export async function removeMember(
  memberId: string
): Promise<"DELETED" | "ARCHIVED"> {
  if (isDemoMode) return "DELETED";

  const { data, error } = await client().rpc("remove_member", {
    p_member: memberId,
  });
  if (error) throw error;
  return String(data) === "ARCHIVED" ? "ARCHIVED" : "DELETED";
}

/** Sadar asks the Khajanchi to reset one member's payments. */
export async function requestPaymentReset(
  memberId: string,
  reason: string
): Promise<string> {
  if (isDemoMode) return `demo-reset-${Date.now()}`;

  const { data, error } = await client().rpc("request_payment_reset", {
    p_member: memberId,
    p_reason: reason,
  });
  if (error) throw error;
  return String(data);
}

export async function createMember(input: NewMember): Promise<Member> {
  if (isDemoMode) {
    return {
      id: `demo-mem-${Date.now()}`,
      tenantId: "demo",
      code: "BHR-000031-9",
      name: input.name,
      fatherName: input.fatherName ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
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
      email: input.email?.trim().toLowerCase() || null,
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

// ═══════════════════════════════════════════════════════════════
// Platform · global accounts (Super Admin)
// ═══════════════════════════════════════════════════════════════

export interface PlatformAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  tenantId: string | null;
  tenantName: string;
  active: boolean;
  memberCode: string;
  createdAt: string;
}

export async function listAllAccounts(): Promise<PlatformAccount[]> {
  if (isDemoMode) return [];

  const { data, error } = await client().rpc("list_all_accounts");
  if (error) throw error;

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.full_name ?? "—",
    email: r.email ?? "",
    phone: r.phone ?? "",
    role: r.role,
    tenantId: r.tenant_id ?? null,
    tenantName: r.tenant_name ?? "Platform",
    active: Boolean(r.is_active),
    memberCode: r.member_code ?? "",
    createdAt: r.created_at,
  }));
}

export async function setAccountRole(id: string, role: Role): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("set_account_role", {
    p_profile: id,
    p_role: role,
  });
  if (error) throw error;
}

export async function setAccountActive(
  id: string,
  active: boolean
): Promise<void> {
  if (isDemoMode) return;

  const { error } = await client().rpc("set_account_active", {
    p_profile: id,
    p_active: active,
  });
  if (error) throw error;
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

// ── Sadar → Platform admin support messages ──────────────────────
export interface SupportMessage {
  id: string;
  tenantId: string | null;
  tenantName: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: "open" | "resolved";
  createdAt: string;
}

export async function sendSupportMessage(
  subject: string,
  message: string
): Promise<void> {
  if (isDemoMode) return;
  const { error } = await client().rpc("send_support_message", {
    p_subject: subject,
    p_message: message,
  });
  if (error) throw error;
}

export async function listSupportMessages(): Promise<SupportMessage[]> {
  if (isDemoMode) return [];

  const { data, error } = await client()
    .from("support_messages")
    .select("*, tenants(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id ?? null,
    tenantName: (r.tenants as Row | null)?.name ?? "",
    name: r.name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    subject: r.subject ?? "",
    message: r.message ?? "",
    status: r.status === "resolved" ? "resolved" : "open",
    createdAt: r.created_at,
  }));
}

export async function setSupportMessageStatus(
  id: string,
  status: "open" | "resolved"
): Promise<void> {
  if (isDemoMode) return;
  const { error } = await client()
    .from("support_messages")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function sendPublicSupportMessage(
  email: string,
  name: string,
  subject: string,
  message: string
): Promise<void> {
  if (isDemoMode) return;
  const { error } = await client().rpc("send_public_support_message", {
    p_email: email,
    p_name: name,
    p_subject: subject,
    p_message: message,
  });
  if (error) throw error;
}
