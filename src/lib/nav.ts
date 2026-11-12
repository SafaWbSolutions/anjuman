import type { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: Role[];
  badge?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ALL: Role[] = [
  "super_admin",
  "sadar",
  "khajanchi",
  "secretary",
  "auditor",
  "collector",
  "member",
];
const OFFICE: Role[] = ["sadar", "khajanchi", "secretary", "auditor"];

export const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard/", icon: "LayoutDashboard", roles: ALL },
      { label: "Notifications", href: "/notifications/", icon: "BellRing", roles: ALL },
      { label: "Approvals", href: "/approvals/", icon: "ShieldCheck", roles: ["sadar", "khajanchi", "auditor"] },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Members", href: "/members/", icon: "Users", roles: [...OFFICE, "collector", "super_admin"] },
      { label: "Households", href: "/households/", icon: "Home", roles: OFFICE },
      { label: "ID Cards", href: "/id-cards/", icon: "IdCard", roles: ["sadar", "secretary", "super_admin"] },
      { label: "My ID card", href: "/id-cards/", icon: "IdCard", roles: ["member"] },
      { label: "Namaz & Azan", href: "/namaz/", icon: "MoonStar", roles: [...OFFICE, "member"] },
      { label: "Notices", href: "/notices/", icon: "Megaphone", roles: ALL },
      { label: "Complaints", href: "/complaints/", icon: "MessageSquareWarning", roles: [...OFFICE, "member"] },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Fee Plans", href: "/finance/fees/", icon: "ReceiptText", roles: ["sadar", "secretary", "auditor"] },
      { label: "Collections", href: "/finance/collections/", icon: "HandCoins", roles: ["sadar", "khajanchi", "collector", "auditor"] },
      { label: "Donations", href: "/finance/donations/", icon: "HeartHandshake", roles: ["sadar", "khajanchi", "auditor"] },
      { label: "Expenses", href: "/finance/expenses/", icon: "Wallet", roles: ["sadar", "khajanchi", "auditor"] },
      { label: "Ledger", href: "/finance/ledger/", icon: "BookOpenCheck", roles: ["sadar", "khajanchi", "auditor"] },
      { label: "Reports", href: "/finance/reports/", icon: "BarChart3", roles: OFFICE },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Contact Admin", href: "/contact-admin/", icon: "LifeBuoy", roles: ["sadar", "secretary"] },
      { label: "My Profile", href: "/profile/", icon: "UserRound", roles: ALL },
      { label: "Anjuman Profile", href: "/settings/anjuman/", icon: "Building2", roles: ["sadar", "secretary"] },
      { label: "Payments", href: "/settings/payments/", icon: "CreditCard", roles: ["sadar", "khajanchi"] },
      { label: "Alert Channels", href: "/settings/notifications/", icon: "BellRing", roles: ["sadar", "secretary"] },
      { label: "Roles & Access", href: "/settings/roles/", icon: "KeyRound", roles: ["sadar", "secretary"] },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Anjumans", href: "/platform/tenants/", icon: "Network", roles: ["super_admin"] },
      { label: "Registration Requests", href: "/platform/registrations/", icon: "ClipboardList", roles: ["super_admin"] },
      { label: "All Members", href: "/platform/members/", icon: "Users", roles: ["super_admin"] },
      { label: "Team & Roles", href: "/platform/team/", icon: "ShieldCheck", roles: ["super_admin"] },
      { label: "Plans", href: "/platform/plans/", icon: "Layers", roles: ["super_admin"] },
      { label: "Billing Gateway", href: "/platform/billing/", icon: "Landmark", roles: ["super_admin"] },
      { label: "Support Inbox", href: "/platform/support/", icon: "Inbox", roles: ["super_admin"] },
    ],
  },
];

export function navForRole(role: Role): NavSection[] {
  return NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles.includes(role)),
  })).filter((s) => s.items.length > 0);
}
