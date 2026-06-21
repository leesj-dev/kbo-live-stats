"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Small "i" badge that reveals a popover on hover. There is no click handler;
// on touch a tap fires pointerenter to open it (and the touch pointerleave that
// fires right after is ignored so it stays open), then a tap elsewhere or Escape
// dismisses it. Keyboard focus opens it too.
export function InfoTooltip({ children, label = "도움말" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={(e) => {
        // Touch fires pointerleave immediately after the tap; ignore it so the
        // popover stays open until the user taps elsewhere.
        if (e.pointerType !== "touch") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-[var(--color-line-strong)] text-[10px] font-semibold leading-none text-[var(--color-muted)] transition-colors hover:border-[var(--color-fg)] hover:text-[var(--color-fg)]"
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-[230px] rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-panel-2)]/97 px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-fg)] shadow-lg backdrop-blur"
        >
          <span
            className="absolute -top-1.5 left-[5px] h-3 w-3 rotate-45 border-l border-t border-[var(--color-line-strong)] bg-[var(--color-panel-2)]"
            aria-hidden
          />
          <div className="relative">{children}</div>
        </div>
      )}
    </div>
  );
}
