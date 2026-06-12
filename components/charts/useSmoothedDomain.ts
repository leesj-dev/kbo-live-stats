import { useRef } from "react";

/**
 * Smoothly interpolates yMin/yMax toward the target domain on each render.
 * During playback or slider drag the component re-renders at ~60 fps,
 * so applying a lerp factor each frame produces a buttery-smooth transition.
 *
 * Uses frame-time-aware lerping so the smoothing rate is consistent
 * regardless of frame rate, and converges quickly to avoid visible
 * micro-trembling on dense charts (e.g. the detailed win-probability view).
 */
export function useSmoothedDomain(
  target: { yMin: number; yMax: number },
  /** Duration in ms for the domain to reach ~95% of its target. */
  duration = 150,
): { yMin: number; yMax: number } {
  const current = useRef<{ yMin: number; yMax: number } | null>(null);
  const lastTime = useRef<number>(0);

  // First call — snap immediately, no animation.
  if (current.current === null) {
    current.current = { ...target };
    lastTime.current = performance.now();
    return { ...target };
  }

  // Time-aware lerp: compute a per-frame factor from the elapsed time
  // so that smoothing feels identical at 30 fps and 144 fps.
  const now = performance.now();
  const dt = Math.min(now - lastTime.current, 64); // cap to avoid huge jumps after tab-switch
  lastTime.current = now;

  // Exponential decay factor: after `duration` ms, ~95% of the gap is closed.
  // factor = 1 - e^(-3 * dt / duration)   (3 ≈ -ln(0.05))
  const factor = 1 - Math.exp((-3 * dt) / duration);

  const diffMin = target.yMin - current.current.yMin;
  const diffMax = target.yMax - current.current.yMax;

  // Snap when close enough to avoid endless micro-updates.
  const span = Math.abs(target.yMax - target.yMin) || 1;
  const threshold = span * 0.005;

  if (Math.abs(diffMin) < threshold && Math.abs(diffMax) < threshold) {
    current.current = { ...target };
  } else {
    current.current = {
      yMin: current.current.yMin + diffMin * factor,
      yMax: current.current.yMax + diffMax * factor,
    };
  }

  return { ...current.current };
}
