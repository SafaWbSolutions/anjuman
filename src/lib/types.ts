export type Role =
  | "super_admin"
  | "sadar"
  | "khajanchi"
  | "secretary"
  | "auditor"
  | "collector"
  | "member";

/** Roles that must pass 2FA before any money decision. */
export const MFA_ROLES: Role[] = [
  "super_admin",
  "sadar",
  "khajanchi",
  "secretary",
  "auditor",
  "collector",
];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Platform Admin",
  sadar: "Sadar (President)",
  khajanchi: "Khajanchi (Treasurer)",
  secretary: "Secretary",
  auditor: "Auditor",
  collector: "Collector",
  member: "Member",
};

export type TenantStatus = "active" | "trial" | "read_only" | "suspended";
export type PlanType = "free" | "fixed" | "custom";

export interface Tenant {
  id: string;
  code: string;
  name: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
  masjid: string;
  regNo: string;
  phone: string;
  email?: string;
  upiId: string;
  address?: string;
  logoUrl?: string;
  themeColor?: string;
  status: TenantStatus;
  planType: PlanType;
  planAmountPaise: number;
  planCycle: "monthly" | "yearly" | "lifetime";
  expiresAt: string | null;
  membersCount: number;
  createdAt: string;
  /** Used for the calculated prayer timetable. */
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  /** Feature flags for this anjuman. */
  features?: Record<string, boolean>;
}

export type MemberType = "member" | "donor" | "imam" | "muazzin" | "staff";
export type MemberStatus = "active" | "inactive" | "pending";

export interface Member {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  fatherName: string;
  phone: string;
  email?: string;
  household: string;
  mohalla: string;
  type: MemberType;
  status: MemberStatus;
  feePaise: number;
  joinedOn: string;
  bloodGroup?: string;
  photoUrl?: string;
  concession?: string;
}

export type InvoiceStatus = "paid" | "partial" | "pending" | "waived";
export interface Invoice {
  id: string;
  tenantId: string;
  memberId: string;
  period: string; // YYYY-MM
  amountPaise: number;
  paidPaise: number;
  status: InvoiceStatus;
  dueDate: string;
}

export type PaymentMethod = "cash" | "upi" | "gateway" | "cheque" | "adjustment";
export type PaymentStatus = "pending" | "verified" | "rejected" | "disputed";

export interface Payment {
  id: string;
  tenantId: string;
  memberId: string;
  amountPaise: number;
  method: PaymentMethod;
  reference: string;
  status: PaymentStatus;
  receiptNo: string;
  enteredBy: string;
  verifiedBy?: string;
  createdAt: string;
  settledAt?: string;
  note?: string;
}

export interface Expense {
  id: string;
  tenantId: string;
  fundId: string;
  fundName: string;
  category: string;
  amountPaise: number;
  vendor: string;
  billUrl?: string;
  status: "pending" | "approved" | "rejected";
  enteredBy: string;
  approvedBy?: string;
  createdAt: string;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  tenantId: string;
  date: string;
  account: string;
  narration: string;
  debitPaise: number;
  creditPaise: number;
  refType: "payment" | "expense" | "donation" | "opening" | "reversal" | "transfer";
  refNo: string;
  hash: string;
  prevHash: string;
}

export interface Fund {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  restricted: boolean;
  balancePaise: number;
}

export type FeeCycle = "monthly" | "quarterly" | "yearly";

export interface FeePlan {
  id: string;
  tenantId: string;
  name: string;
  amountPaise: number;
  cycle: FeeCycle;
  dueDay: number;
  graceDays: number;
  isActive: boolean;
  createdAt: string;
}

export interface FeeOverride {
  id: string;
  tenantId: string;
  memberId: string;
  amountPaise: number;
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  tenantId: string;
  entityType: "payment" | "expense" | "waiver" | "member";
  entityId: string;
  title: string;
  subtitle: string;
  amountPaise?: number;
  requestedBy: string;
  requestedAt: string;
  step: number;
  totalSteps: number;
  status: "pending" | "approved" | "rejected";
}

export interface Complaint {
  id: string;
  tenantId: string;
  trackingCode: string;
  category: string;
  subject: string;
  body: string;
  anonymous: boolean;
  memberId?: string;
  status: "open" | "assigned" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high";
  assignedTo?: string;
  createdAt: string;
  resolvedAt?: string;
  slaHours: number;
}

export interface Notice {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  audience: "all" | "members" | "office_bearers";
  publishedAt: string;
  expiresAt?: string;
  pinned: boolean;
}

export interface PrayerDay {
  date: string;
  hijri: string;
  fajr: string;
  zuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  jumuah?: string;
  iqamahOffset: number;
  source?: "calculated" | "manual" | "excel";
}

export type DonationMethod = "cash" | "upi" | "gateway" | "cheque";
export type DonationStatus = "pending" | "verified" | "rejected" | "disputed";

export interface Donation {
  id: string;
  tenantId: string;
  fundId: string;
  fundName: string;
  donorName: string;
  memberId?: string;
  amountPaise: number;
  method: DonationMethod;
  reference?: string;
  status: DonationStatus;
  receiptNo: string;
  anonymous: boolean;
  note?: string;
  enteredBy: string;
  verifiedBy?: string;
  createdAt: string;
  verifiedAt?: string;
}

export interface Integration {
  id: string;
  scope: "platform" | "tenant";
  tenantId?: string;
  type: "payment" | "sms" | "whatsapp" | "email" | "push";
  provider: string;
  mode: "test" | "live";
  enabled: boolean;
  status: "connected" | "not_configured" | "error";
  lastTestedAt?: string | null;
  maskedKey?: string;
}

export interface PlatformPlan {
  id: string;
  name: string;
  type: PlanType;
  pricePaise: number;
  cycle: "monthly" | "quarterly" | "yearly" | "lifetime";
  maxMembers: number | null;
  features: string[];
  active: boolean;
  sortOrder: number;
  activeTenants: number;
}

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

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: Role;
  tenantId: string | null;
  tenantName: string;
  /** Profile picture, if the user uploaded one. */
  photoUrl?: string | null;
  /** Members row linked to this profile, for the member portal. */
  memberId?: string | null;
}

export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  invitedBy: string;
  token: string;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
}

export interface NewInvitation {
  email: string;
  role: Role;
}
