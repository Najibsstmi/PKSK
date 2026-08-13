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
    <aside className="fixed left-1/2 top-[5.35rem] z-50 w-[min(calc(100vw-1.5rem),480px)] -translate-x-1/2 sm:top-[5.9rem]" aria-live="polite">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpenPremium}
        onKeyDown={handleKeyDown}
        aria-label={`${message}. ${subtext}. Buka halaman Premium.`}
        className="social-proof-toast group relative flex cursor-pointer items-start gap-3 rounded-2xl border border-rose-100/70 bg-gradient-to-br from-coral-500 via-rose-500 to-orange-400 p-4 text-left text-white shadow-[0_18px_46px_rgba(244,63,94,0.26)] outline-none backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(244,63,94,0.32)] focus-visible:ring-4 focus-visible:ring-rose-200"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-white ring-1 ring-white/30">
          <Icon size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pr-8">
          <div className="mb-1 inline-flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] font-black text-white ring-1 ring-white/25">
            <Crown size={13} aria-hidden="true" />
            Ramai dah subscribe
          </div>
          <p className="text-sm font-black leading-5 text-white sm:text-[15px]">{message}</p>
          <p className="mt-1 text-xs font-bold text-rose-50">{subtext}</p>
        </div>
        <button
          type="button"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-white/80 transition hover:bg-white/18 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
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
