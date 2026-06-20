"use client";

import Link from "next/link";

// Header entry point to the LIVE page (경기별 승리확률).
export function LiveBadge() {
  return (
    <Link
      href="/live"
      aria-label="경기별 승리확률 보기"
      className="inline-flex items-center rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1 text-[12px] font-semibold tracking-wide text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)]/60 hover:text-[var(--color-fg)]"
    >
      경기별 승리확률
    </Link>
  );
}
