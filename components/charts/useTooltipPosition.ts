"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Positions an absolutely-placed tooltip near a point given in SVG viewBox
// coordinates: horizontally centered and clamped to the chart container,
// above the point unless that would overflow the top edge.
export function useTooltipPosition(
  point: { vx: number; vy: number } | null,
  view: { W: number; H: number },
) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const vx = point?.vx;
  const vy = point?.vy;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || vx == null || vy == null) return;
    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return;

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pW = parent.clientWidth;
    const pH = parent.clientHeight;

    // viewBox units → rendered pixels
    const targetX = (vx / view.W) * pW;
    const targetY = (vy / view.H) * pH;

    // Horizontally center, but clamp to parent bounds
    let posX = targetX - w / 2;
    posX = Math.max(4, Math.min(pW - w - 4, posX));

    // Vertically place above the point, flip below if it overflows the top
    let posY = targetY - h - 24;
    if (posY < 4) {
      posY = targetY + 24;
    }
    posY = Math.max(4, Math.min(pH - h - 4, posY));

    const next = { left: `${Math.round(posX)}px`, top: `${Math.round(posY)}px`, opacity: 1 };
    setStyle((prev) =>
      prev.left === next.left && prev.top === next.top && prev.opacity === next.opacity ? prev : next,
    );
  }, [vx, vy, view.W, view.H]);

  return { ref, style };
}
