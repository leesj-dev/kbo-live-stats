"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { LATEST_SEASON } from "@/lib/seasons";

// Shared top navigation: the "KBO 144" wordmark plus the two equal sections —
// 시즌 (season-long margin/win-rate chart) and 경기 (per-game live win prob).
const TABS = [
  { key: "season", label: "시즌 승률", href: `/${LATEST_SEASON}` },
  { key: "live", label: "경기 승리확률", href: "/live" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Persists across client-side navigations (the module stays loaded while the
// nav remounts), letting the underline slide from the previously active tab to
// the new one.
let lastActive: TabKey | null = null;

export function SiteNav({ active }: { active: TabKey }) {
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<TabKey, HTMLAnchorElement>());
  const [bar, setBar] = useState<{ left: number; width: number; animate: boolean }>({
    left: 0,
    width: 0,
    animate: false,
  });

  useLayoutEffect(() => {
    const measure = (key: TabKey) => {
      const el = tabRefs.current.get(key);
      return el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
    };

    const target = measure(active);
    if (!target) return;

    // Arriving from the other tab → park the bar under it (no transition), then
    // on the next frame slide it to the active tab.
    // `lastActive` is committed inside the rAF (not synchronously) so the slide
    // survives Strict Mode's mount→unmount→remount: the first pass's rAF is
    // cancelled by cleanup before it runs, leaving `lastActive` pointing at the
    // previous tab for the second pass to animate from.
    const from = lastActive && lastActive !== active ? measure(lastActive) : null;
    let raf = 0;
    if (from) {
      setBar({ ...from, animate: false });
      raf = requestAnimationFrame(() => {
        setBar({ ...target, animate: true });
        lastActive = active;
      });
    } else {
      // Fresh load (or already on this tab) → appear in place, no animation.
      setBar({ ...target, animate: false });
      lastActive = active;
    }

    // Keep the bar aligned on resize (instantly, no slide).
    const onResize = () => {
      const t = measure(active);
      if (t) setBar({ ...t, animate: false });
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [active]);

  return (
    <header className="relative z-30 flex items-end gap-5 border-b border-[var(--color-line)]">
      <Link
        href={`/${LATEST_SEASON}`}
        className="pb-3 text-3xl font-extrabold leading-none text-[var(--color-fg)]"
      >
        KBO <span className="text-[var(--color-muted)]">144</span>
      </Link>
      <nav
        ref={navRef}
        className="relative -mb-px flex items-end gap-0.5"
      >
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              ref={(el) => {
                if (el) tabRefs.current.set(t.key, el);
                else tabRefs.current.delete(t.key);
              }}
              href={t.href}
              prefetch={true}
              aria-current={on ? "page" : undefined}
              className={`px-2.5 pb-3 pt-1 text-[15px] font-semibold transition-colors ${
                on ? "text-[var(--color-fg)]" : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        {/* Sliding active-tab underline. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute bottom-0 h-0.5 bg-[var(--color-fg)] ${
            bar.animate ? "transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]" : ""
          }`}
          style={{ left: `${bar.left}px`, width: `${bar.width}px` }}
        />
      </nav>
    </header>
  );
}
