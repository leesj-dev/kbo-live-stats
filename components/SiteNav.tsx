import Link from "next/link";
import { LATEST_SEASON } from "@/lib/seasons";

// Shared top navigation: the "KBO 144" wordmark plus the two equal sections —
// 시즌 (season-long margin/win-rate chart) and 경기 (per-game live win prob).
const TABS = [
  { key: "season", label: "시즌 승률", href: `/${LATEST_SEASON}` },
  { key: "live", label: "경기 승리확률", href: "/live" },
] as const;

export function SiteNav({ active }: { active: "season" | "live" }) {
  return (
    <header className="relative z-30 flex items-end gap-5 border-b border-[var(--color-line)]">
      <Link
        href={`/${LATEST_SEASON}`}
        className="pb-3 text-3xl font-extrabold leading-none text-[var(--color-fg)]"
      >
        KBO <span className="text-[var(--color-muted)]">144</span>
      </Link>
      <nav className="-mb-px flex items-end gap-0.5">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`border-b-2 px-2.5 pb-3 pt-1 text-[15px] font-semibold transition-colors ${
                on ? "border-[var(--color-fg)] text-[var(--color-fg)]" : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
