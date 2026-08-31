import type { AppSettings } from "./access";

export type PaymentRequestStatus = "pending" | "approved" | "rejected" | "expired" | "paid" | "failed" | "cancelled";
export type PaymentMethod = "manual_qr" | "toyyibpay" | string;

export type PaymentRequest = {
  id: string;
  user_id: string | null;
  email: string | null;
  amount: number;
  currency: string;
  status: PaymentRequestStatus;
  provider: string;
  payment_method: PaymentMethod;
  provider_bill_code: string | null;
  provider_reference: string | null;
  external_reference: string | null;
  referral_code: string | null;
  referral_agent_id: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminPaymentRequestRow = PaymentRequest & {
  display_name: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  total_count: number;
};

export type ManualPaymentConfig = Pick<
  AppSettings,
  | "payment_price"
  | "payment_currency"
  | "payment_whatsapp_number"
  | "payment_account_name"
  | "payment_bank_name"
  | "payment_account_number"
  | "payment_qr_image_url"
>;

export type CreatePaymentRequestResult = {
  id: string;
  user_id: string | null;
  email: string | null;
  amount: number;
  currency: string;
  status: PaymentRequestStatus;
  provider: string;
  payment_method: PaymentMethod;
  referral_code: string | null;
  referral_agent_id: string | null;
};

export type ToyyibPayBillResult = {
  paymentId: string;
  billCode: string;
  paymentUrl: string;
  callbackUrl: string;
};

export type ToyyibPayVerifyTarget = {
  paymentId?: string;
  billCode?: string;
  externalReference?: string;
};

export type ToyyibPayVerifyResult = {
  ok: boolean;
  status: PaymentRequestStatus;
  paymentId: string;
  providerReference: string | null;
  premiumActivated: boolean;
};

export type ToyyibPayCustomerInput = {
  displayName: string;
  email: string;
  phone: string;
  password: string;
  marketingConsent?: boolean;
};
