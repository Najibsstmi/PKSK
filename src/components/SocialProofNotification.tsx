import { Crown, Sparkles, Star, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { SocialProofItem } from "../types/socialProof";
import { formatRelativeTime } from "../utils/socialProof";

type SocialProofNotificationProps = {
  item: SocialProofItem | null;
  onDismiss: () => void;
  onOpenPremium: () => void;
};

export function SocialProofNotification({ item, onDismiss, onOpenPremium }: SocialProofNotificationProps) {
  if (!item) {
    return null;
  }

  const isRealSubscriber = item.type === "real";
  const message = isRealSubscriber
    ? `${item.displayName} baru menyertai PKSK Academy Premium!`
    : `${item.displayName} telah menggunakan PKSK Academy Premium`;
  const subtext = isRealSubscriber ? formatRelativeTime(item.subscribedAt) : "Sebahagian daripada komuniti 1,000+ pengguna";
  const Icon = isRealSubscriber ? Sparkles : Star;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenPremium();
    }
  }

  return (
    <aside className="fixed bottom-[9.5rem] left-3 right-[5.5rem] z-40 sm:bottom-6 sm:left-6 sm:right-auto sm:w-[360px]" aria-live="polite">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpenPremium}
        onKeyDown={handleKeyDown}
        aria-label={`${message}. ${subtext}. Buka halaman Premium.`}
        className="social-proof-toast group relative flex cursor-pointer items-start gap-3 rounded-2xl border border-white/80 bg-white/95 p-4 text-left shadow-soft outline-none backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-4 focus-visible:ring-ocean-200"
      >
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isRealSubscriber ? "bg-ocean-50 text-ocean-700" : "bg-sun-100 text-amber-700"}`}>
          <Icon size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pr-8">
          <div className="mb-1 inline-flex items-center gap-1 rounded-lg bg-ocean-50 px-2 py-1 text-[11px] font-black text-ocean-700">
            <Crown size={13} aria-hidden="true" />
            Premium
          </div>
          <p className="text-sm font-black leading-5 text-slate-950">{message}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{subtext}</p>
        </div>
        <button
          type="button"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300"
          aria-label="Tutup notifikasi social proof"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
