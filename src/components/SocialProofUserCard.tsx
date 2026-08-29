import { Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchPublicSocialProofStats } from "../services/socialProofService";

const fallbackUserCount = 1000;

function displayCount(value: number): string {
  const formatted = Math.max(0, Math.round(value)).toLocaleString("en-US");
  return value >= fallbackUserCount ? `${formatted}+` : formatted;
}

export function SocialProofUserCard() {
  const [count, setCount] = useState(0);
  const [targetCount, setTargetCount] = useState(fallbackUserCount);
  const [hasAnimated, setHasAnimated] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchPublicSocialProofStats().then((stats) => {
      if (!isMounted || !stats) {
        return;
      }

      setTargetCount(Math.max(fallbackUserCount, stats.display_users));
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (hasAnimated) {
      setCount(targetCount);
    }
  }, [hasAnimated, targetCount]);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || hasAnimated) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(targetCount);
      setHasAnimated(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }

        setHasAnimated(true);
        observer.disconnect();

        const start = window.performance.now();
        const duration = 900;

        function tick(now: number) {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.round(targetCount * eased));

          if (progress < 1) {
            animationFrameRef.current = window.requestAnimationFrame(tick);
          } else {
            animationFrameRef.current = null;
            setCount(targetCount);
          }
        }

        animationFrameRef.current = window.requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [hasAnimated, targetCount]);

  return (
    <section ref={cardRef} className="social-proof-card" aria-label={`${displayCount(targetCount)} pengguna telah menggunakan PKSK Academy Simulator`}>
      <div className="relative z-10 grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ocean-600 text-white shadow-lg shadow-ocean-600/20">
          <Users size={28} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-4xl font-black leading-none text-slate-950 sm:text-5xl">{displayCount(count)}</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Pengguna</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 sm:text-base">
            Telah menggunakan PKSK Academy Simulator untuk membuat latihan dan persediaan PKSK.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-sm font-black text-ocean-700 shadow-sm">
          <Sparkles size={17} aria-hidden="true" />
          Belajar. Berlatih. Lebih Bersedia.
        </div>
      </div>
    </section>
  );
}
