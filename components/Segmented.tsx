"use client";

import { ReactNode, useLayoutEffect, useRef, useState } from "react";

// Labeled segmented control (pill buttons), used for the chart/axis toggles.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  info,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  info?: ReactNode;
}) {
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);
  // The last selection we've positioned the badge for. The badge only slides
  // when this changes to a *different* value — so it appears in place on mount.
  const prevValueRef = useRef<T | null>(null);
  const [bgStyle, setBgStyle] = useState<{ left: number; width: number; opacity: number; animate: boolean }>({
    left: 0,
    width: 0,
    opacity: 0,
    animate: false,
  });

  const updateBg = (animate: boolean) => {
    const activeEl = activeBtnRef.current;
    if (activeEl) {
      setBgStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        opacity: 1,
        animate,
      });
    }
  };

  // useLayoutEffect positions the badge before the first paint, so there's no
  // flash from the initial (0, 0) state. `animate` is off on mount (and on
  // resize) and only on when the selection actually changes — comparing against
  // a ref makes this robust to Strict Mode's double-invoked effects, which a
  // plain "is mounted" flag is not.
  useLayoutEffect(() => {
    const animate = prevValueRef.current !== null && prevValueRef.current !== value;
    updateBg(animate);
    prevValueRef.current = value;

    const onResize = () => updateBg(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [value, options]);

  return (
    <div className="flex flex-col gap-[5px]">
      <span className="flex items-center gap-1 ml-1 text-[12px] text-[var(--color-muted)]">
        {label}
        {info}
      </span>
      <div className="relative inline-flex rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-0.5 select-none">
        {/* Sliding background badge */}
        <span
          className={`absolute top-0.5 bottom-0.5 rounded-[6px] bg-[var(--color-panel-2)] shadow-[inset_0_0_0_1px_var(--color-line-strong)] pointer-events-none ${
            bgStyle.animate ? "transition-all duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]" : ""
          }`}
          style={{
            left: `${bgStyle.left}px`,
            width: `${bgStyle.width}px`,
            opacity: bgStyle.opacity,
          }}
        />

        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={active ? activeBtnRef : null}
              onClick={() => !o.disabled && onChange(o.value)}
              disabled={o.disabled}
              className={`relative z-10 rounded-[6px] px-3 sm:px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer select-none active:scale-[0.98] ${
                active
                  ? "text-[var(--color-fg)]"
                  : o.disabled
                    ? "cursor-not-allowed text-[var(--color-muted)]/40"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
