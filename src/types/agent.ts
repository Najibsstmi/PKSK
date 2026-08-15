export type AgentStatus = "not_agent" | "pending" | "active" | "suspended";

export type CommissionStatus = "pending_14_days" | "eligible" | "paid" | "cancelled";

export type DiamondProfile = {
  id: string | null;
  user_id: string | null;
  referral_code: string | null;
  referral_link: string | null;
  status: AgentStatus;
  bank_account_name: string | null;
  bank_name: string | null;
  bank_account_last4: string | null;
  phone: string | null;
  commission_amount: number;
  approved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DiamondApplicationInput = {
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  phone: string;
  termsAccepted: boolean;
};

export type DiamondDashboardStats = {
  total_clicks: number;
  total_sales: number;
  total_commission: number;
  pending_14_days: number;
  eligible: number;
  paid: number;
};

export type AgentCommissionSummary = {
  id: string;
  buyer_name: string | null;
  buyer_email_masked: string | null;
  payment_confirmed_at: string;
  eligible_at: string;
  paid_at: string | null;
  amount: number;
  status: CommissionStatus;
  effective_status: CommissionStatus;
};

export type DiamondDashboard = {
  profile: DiamondProfile;
  stats: DiamondDashboardStats;
  commissions: AgentCommissionSummary[];
};

export type AdminDiamondPartnerRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  referral_code: string | null;
  status: AgentStatus;
  total_sales: number;
  total_commission: number;
  eligible_commission: number;
  paid_commission: number;
  bank_name: string | null;
  bank_account_last4: string | null;
  created_at: string;
  approved_at: string | null;
  total_count: number;
};

export type AdminDiamondPartnerDetail = {
  agent: AdminDiamondPartnerRow & {
    bank_account_name: string | null;
    bank_account_number: string | null;
    phone: string | null;
    commission_amount: number;
  };
  commissions: AgentCommissionSummary[];
};
