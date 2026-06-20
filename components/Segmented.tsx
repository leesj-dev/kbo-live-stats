"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

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
  const [bgStyle, setBgStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const updateBg = () => {
    const activeEl = activeBtnRef.current;
    if (activeEl) {
      setBgStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        opacity: 1,
      });
    }
  };

  useEffect(() => {
    updateBg();
    
    // Reposition the background sliding badge on window resize
    window.addEventListener("resize", updateBg);
    return () => window.removeEventListener("resize", updateBg);
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
          className="absolute top-0.5 bottom-0.5 rounded-[6px] bg-[var(--color-panel-2)] shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-all duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] pointer-events-none"
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
