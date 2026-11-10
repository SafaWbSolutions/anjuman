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
  expenses as mockExpenses,
  funds as mockFunds,
  invoices as mockInvoices,
  ledger as mockLedger,
  members as mockMembers,
  notices as mockNotices,
  payments as mockPayments,
  pendingPayments as mockPendingPayments,
  stats as mockStats,
} from "./mock";
import type {
  Approval,
  Expense,
  Fund,
  Invoice,
  LedgerEntry,
  Member,
  Notice,
  Payment,
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
      items: [],
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
