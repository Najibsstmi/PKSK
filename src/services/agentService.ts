import { requireSupabase } from "../lib/supabase";
import type {
  AdminDiamondPartnerDetail,
  AdminDiamondPartnerRow,
  AgentCommissionSummary,
  AgentStatus,
  CommissionStatus,
  DiamondApplicationInput,
  DiamondDashboard,
  DiamondDashboardStats,
  DiamondProfile,
} from "../types/agent";

export async function fetchMyDiamondProfile(): Promise<DiamondProfile> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_diamond_profile");

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }

  return normalizeDiamondProfile(data as Partial<DiamondProfile> | null);
}

export async function applyForDiamond(input: DiamondApplicationInput): Promise<DiamondProfile> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("apply_for_diamond", {
    p_bank_account_name: input.bankAccountName,
    p_bank_name: input.bankName,
    p_bank_account_number: input.bankAccountNumber,
    p_phone: input.phone,
    p_terms_accepted: input.termsAccepted,
  });

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }

  return normalizeDiamondProfile(data as Partial<DiamondProfile> | null);
}

export async function updateMyDiamondBankInfo(input: Omit<DiamondApplicationInput, "termsAccepted">): Promise<DiamondProfile> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("update_my_diamond_bank_info", {
    p_bank_account_name: input.bankAccountName,
    p_bank_name: input.bankName,
    p_bank_account_number: input.bankAccountNumber,
    p_phone: input.phone,
  });

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }

  return normalizeDiamondProfile(data as Partial<DiamondProfile> | null);
}

export async function trackReferralClick(referralCode: string | null): Promise<void> {
  if (!referralCode) {
    return;
  }

  const client = requireSupabase();
  await client.rpc("track_referral_click", {
    p_referral_code: referralCode,
  });
}

export async function fetchDiamondDashboard(): Promise<DiamondDashboard> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_diamond_dashboard");

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }

  return normalizeDiamondDashboard(data as Partial<DiamondDashboard> | null);
}

export async function fetchAdminDiamondPartners(searchText: string, statusFilter: AgentStatus | "all"): Promise<AdminDiamondPartnerRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_diamond_partners", {
    search_text: searchText || null,
    status_filter: statusFilter,
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }

  return ((data ?? []) as Partial<AdminDiamondPartnerRow>[]).map(normalizeAdminDiamondPartner);
}

export async function fetchAdminDiamondPartner(agentId: string): Promise<AdminDiamondPartnerDetail> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_get_diamond_partner", {
    p_agent_id: agentId,
  });

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }

  const payload = (data ?? {}) as Partial<AdminDiamondPartnerDetail>;
  return {
    agent: {
      ...normalizeAdminDiamondPartner(payload.agent),
      bank_account_name: payload.agent?.bank_account_name ? String(payload.agent.bank_account_name) : null,
      bank_account_number: payload.agent?.bank_account_number ? String(payload.agent.bank_account_number) : null,
      phone: payload.agent?.phone ? String(payload.agent.phone) : null,
      commission_amount: Number(payload.agent?.commission_amount ?? 23),
    },
    commissions: ((payload.commissions ?? []) as Partial<AgentCommissionSummary>[]).map(normalizeAgentCommission),
  };
}

export async function approveDiamondPartner(agentId: string): Promise<void> {
  await runAdminDiamondAction("admin_approve_diamond_partner", agentId);
}

export async function rejectDiamondPartner(agentId: string): Promise<void> {
  await runAdminDiamondAction("admin_reject_diamond_partner", agentId);
}

export async function suspendDiamondPartner(agentId: string): Promise<void> {
  await runAdminDiamondAction("admin_suspend_diamond_partner", agentId);
}

export async function reactivateDiamondPartner(agentId: string): Promise<void> {
  await runAdminDiamondAction("admin_reactivate_diamond_partner", agentId);
}

export async function markAgentCommissionPaid(commissionId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_mark_agent_commission_paid", {
    p_commission_id: commissionId,
  });

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }
}

async function runAdminDiamondAction(functionName: "admin_approve_diamond_partner" | "admin_reject_diamond_partner" | "admin_suspend_diamond_partner" | "admin_reactivate_diamond_partner", agentId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc(functionName, {
    p_agent_id: agentId,
  });

  if (error) {
    throw new Error(mapDiamondMessage(error.message));
  }
}

function normalizeDiamondDashboard(payload: Partial<DiamondDashboard> | null): DiamondDashboard {
  return {
    profile: normalizeDiamondProfile(payload?.profile),
    stats: normalizeDiamondStats(payload?.stats),
    commissions: ((payload?.commissions ?? []) as Partial<AgentCommissionSummary>[]).map(normalizeAgentCommission),
  };
}

function normalizeDiamondProfile(payload: Partial<DiamondProfile> | null | undefined): DiamondProfile {
  return {
    id: payload?.id ? String(payload.id) : null,
    user_id: payload?.user_id ? String(payload.user_id) : null,
    referral_code: payload?.referral_code ? String(payload.referral_code) : null,
    referral_link: payload?.referral_link ? String(payload.referral_link) : null,
    status: normalizeAgentStatus(payload?.status),
    bank_account_name: payload?.bank_account_name ? String(payload.bank_account_name) : null,
    bank_name: payload?.bank_name ? String(payload.bank_name) : null,
    bank_account_last4: payload?.bank_account_last4 ? String(payload.bank_account_last4) : null,
    phone: payload?.phone ? String(payload.phone) : null,
    commission_amount: Number(payload?.commission_amount ?? 23),
    approved_at: payload?.approved_at ? String(payload.approved_at) : null,
    created_at: payload?.created_at ? String(payload.created_at) : null,
    updated_at: payload?.updated_at ? String(payload.updated_at) : null,
  };
}

function normalizeDiamondStats(payload: Partial<DiamondDashboardStats> | null | undefined): DiamondDashboardStats {
  return {
    total_clicks: Number(payload?.total_clicks ?? 0),
    total_sales: Number(payload?.total_sales ?? 0),
    total_commission: Number(payload?.total_commission ?? 0),
    pending_14_days: Number(payload?.pending_14_days ?? 0),
    eligible: Number(payload?.eligible ?? 0),
    paid: Number(payload?.paid ?? 0),
  };
}

function normalizeAdminDiamondPartner(payload: Partial<AdminDiamondPartnerRow> | null | undefined): AdminDiamondPartnerRow {
  return {
    id: String(payload?.id ?? ""),
    user_id: String(payload?.user_id ?? ""),
    name: payload?.name ? String(payload.name) : null,
    email: payload?.email ? String(payload.email) : null,
    referral_code: payload?.referral_code ? String(payload.referral_code) : null,
    status: normalizeAgentStatus(payload?.status),
    total_sales: Number(payload?.total_sales ?? 0),
    total_commission: Number(payload?.total_commission ?? 0),
    eligible_commission: Number(payload?.eligible_commission ?? 0),
    paid_commission: Number(payload?.paid_commission ?? 0),
    bank_name: payload?.bank_name ? String(payload.bank_name) : null,
    bank_account_last4: payload?.bank_account_last4 ? String(payload.bank_account_last4) : null,
    created_at: String(payload?.created_at ?? new Date().toISOString()),
    approved_at: payload?.approved_at ? String(payload.approved_at) : null,
    total_count: Number(payload?.total_count ?? 0),
  };
}

function normalizeAgentCommission(payload: Partial<AgentCommissionSummary>): AgentCommissionSummary {
  return {
    id: String(payload.id ?? ""),
    buyer_name: payload.buyer_name ? String(payload.buyer_name) : null,
    buyer_email_masked: payload.buyer_email_masked ? String(payload.buyer_email_masked) : null,
    payment_confirmed_at: String(payload.payment_confirmed_at ?? new Date().toISOString()),
    eligible_at: String(payload.eligible_at ?? new Date().toISOString()),
    paid_at: payload.paid_at ? String(payload.paid_at) : null,
    amount: Number(payload.amount ?? 0),
    status: normalizeCommissionStatus(payload.status),
    effective_status: normalizeCommissionStatus(payload.effective_status ?? payload.status),
  };
}

function normalizeAgentStatus(status: unknown): AgentStatus {
  return status === "pending" || status === "active" || status === "suspended" || status === "not_agent" ? status : "not_agent";
}

function normalizeCommissionStatus(status: unknown): CommissionStatus {
  return status === "eligible" || status === "paid" || status === "cancelled" || status === "pending_14_days" ? status : "pending_14_days";
}

export function mapDiamondMessage(message: string): string {
  if (message.includes("ADMIN_REQUIRED")) {
    return "Akses admin diperlukan.";
  }
  if (message.includes("LOGIN_REQUIRED")) {
    return "Sila log masuk dahulu.";
  }
  if (message.includes("PREMIUM_REQUIRED")) {
    return "Akaun Premium aktif diperlukan sebelum memohon Diamond Partner.";
  }
  if (message.includes("DIAMOND_TERMS_REQUIRED")) {
    return "Sila sahkan persetujuan syarat program Diamond Partner.";
  }
  if (message.includes("DIAMOND_BANK_INFO_REQUIRED")) {
    return "Sila lengkapkan maklumat bank dan nombor telefon.";
  }
  if (message.includes("DIAMOND_ALREADY_ACTIVE")) {
    return "Akaun ini sudah aktif sebagai Diamond Partner.";
  }
  if (message.includes("DIAMOND_SUSPENDED")) {
    return "Akses Diamond Partner akaun ini sedang digantung.";
  }
  if (message.includes("DIAMOND_NOT_ACTIVE")) {
    return "Akses Diamond Partner belum aktif.";
  }
  if (message.includes("DIAMOND_AGENT_NOT_FOUND")) {
    return "Rekod Diamond Partner tidak ditemui.";
  }
  if (message.includes("COMMISSION_NOT_ELIGIBLE")) {
    return "Komisen ini belum melepasi tempoh 14 hari.";
  }
  if (message.includes("COMMISSION_CANCELLED")) {
    return "Komisen ini sudah dibatalkan.";
  }
  if (message.includes("COMMISSION_NOT_FOUND")) {
    return "Rekod komisen tidak ditemui.";
  }

  return message;
}
