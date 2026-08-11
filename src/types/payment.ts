import type { AppSettings } from "./access";

export type PaymentRequestStatus = "pending" | "approved" | "rejected" | "expired";

export type PaymentRequest = {
  id: string;
  user_id: string | null;
  email: string | null;
  amount: number;
  status: PaymentRequestStatus;
  provider: string;
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
  status: PaymentRequestStatus;
};
