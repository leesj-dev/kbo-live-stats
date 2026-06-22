"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LiveGameCard as Card } from "@/lib/live";
import { LiveGameCard } from "./LiveGameCard";
import { DatePicker } from "./DatePicker";

const dashed = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const undashed = (d: string) => d.replace(/-/g, "");
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(ymd: string): string {
  const mm = Number(ymd.slice(4, 6));
  const dd = Number(ymd.slice(6, 8));
  const wd = WEEK[new Date(`${dashed(ymd)}T00:00:00Z`).getUTCDay()];
  return `${mm}월 ${dd}일 (${wd})`;
}

export function LiveBoard({
  initialYmd,
  initialGames,
  dates,
  todayYmd,
}: {
  initialYmd: string; // YYYYMMDD
  initialGames: Card[];
  dates: string[]; // navigable dates, YYYY-MM-DD ascending
  todayYmd: string; // YYYYMMDD (KST)
}) {
  const [ymd, setYmd] = useState(initialYmd);
  const [games, setGames] = useState<Card[]>(initialGames);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const modalCardRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef(true);
  const prevZoomRef = useRef(1.5);

  const selectedGame = games.find((g) => g.gameId === selectedGameId) ?? null;

  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getZoom = useCallback((srcWidth: number) => {
    const width = windowWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1200);
    const maxWidth = Math.min(width - 32, 600);
    return Math.max(1.0, Math.min(1.5, maxWidth / srcWidth));
  }, [windowWidth]);

  const zoom = sourceRect ? getZoom(sourceRect.width) : 1.5;

  // --- FLIP open animation (with zoom) ---
  useLayoutEffect(() => {
    if (!selectedGameId || !sourceRect || isClosing) return;
    const el = modalCardRef.current;
    if (!el) return;

    const destRect = el.getBoundingClientRect();
    const destCx = destRect.left + destRect.width / 2;
    const destCy = destRect.top + destRect.height / 2;
    const srcCx = sourceRect.left + sourceRect.width / 2;
    const srcCy = sourceRect.top + sourceRect.height / 2;

    const initTx = srcCx - destCx;
    const initTy = srcCy - destCy;
    const initSx = sourceRect.width / destRect.width;
    const initSy = sourceRect.height / destRect.height;

    // Invert: place at source position and size
    el.style.transition = "none";
    el.style.transform = `translate(${initTx}px, ${initTy}px) scale(${initSx}, ${initSy})`;
    el.getBoundingClientRect(); // force reflow

    // Play: animate to center with zoom. This runs once per open; resizes are
    // handled by the separate effect below so they don't replay the whole flip.
    prevZoomRef.current = zoom;
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.transform = `translate(0px, 0px) scale(${zoom})`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId, sourceRect, isClosing]);

  // On window resize while open, smoothly re-settle to the zoom that fits the
  // new screen width — instead of re-triggering the flip from the source rect.
  useEffect(() => {
    if (zoom === prevZoomRef.current) return;
    prevZoomRef.current = zoom;
    if (!selectedGameId || isClosing) return;
    const el = modalCardRef.current;
    if (!el) return;
    el.style.transition = "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)";
    el.style.transform = `translate(0px, 0px) scale(${zoom})`;
  }, [zoom, selectedGameId, isClosing]);

  const handleCardClick = useCallback((e: React.MouseEvent<HTMLDivElement>, gId: string) => {
    setSourceRect(e.currentTarget.getBoundingClientRect());
    setSelectedGameId(gId);
    setIsClosing(false);
  }, []);

  const handleClose = useCallback(() => {
    if (!selectedGameId) return;
    const el = modalCardRef.current;
    const gridCard = document.querySelector(`[data-game-id="${selectedGameId}"]`) as HTMLElement | null;

    if (el && gridCard) {
      const targetRect = gridCard.getBoundingClientRect();
      const currentRect = el.getBoundingClientRect();

      // Current state is scale(zoom), so layout width = visual width / zoom
      const layoutW = currentRect.width / zoom;
      const layoutH = currentRect.height / zoom;

      const currentCx = currentRect.left + currentRect.width / 2;
      const currentCy = currentRect.top + currentRect.height / 2;
      const targetCx = targetRect.left + targetRect.width / 2;
      const targetCy = targetRect.top + targetRect.height / 2;

      const tx = targetCx - currentCx;
      const ty = targetCy - currentCy;
      const sx = targetRect.width / layoutW;
      const sy = targetRect.height / layoutH;

      setIsClosing(true);
      el.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;

      const onEnd = () => {
        el.removeEventListener("transitionend", onEnd);
        clearTimeout(fallback);
        setSelectedGameId(null);
        setSourceRect(null);
        setIsClosing(false);
      };
      el.addEventListener("transitionend", onEnd, { once: true });
      const fallback = setTimeout(onEnd, 400);
    } else {
      setSelectedGameId(null);
      setSourceRect(null);
    }
  }, [selectedGameId, zoom]);

  // Escape key
  useEffect(() => {
    if (!selectedGameId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedGameId, handleClose]);

  // Scroll lock
  useEffect(() => {
    if (selectedGameId) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selectedGameId]);

  // Live polling
  useEffect(() => {
    let alive = true;
    const fetchGames = async () => {
      try {
        const res = await fetch(`/api/live?date=${ymd}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { games?: Card[] };
        if (alive) setGames(data.games ?? []);
      } catch {
        /* ignore transient poll errors */
      }
    };
    if (firstRef.current) firstRef.current = false;
    else fetchGames();
    const id = ymd === todayYmd ? setInterval(fetchGames, 30_000) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [ymd, todayYmd]);

  const curDash = dashed(ymd);
  const earlier = dates.filter((d) => d < curDash);
  const later = dates.filter((d) => d > curDash);
  const prevYmd = earlier.length ? undashed(earlier[earlier.length - 1]) : null;
  const nextYmd = later.length ? undashed(later[0]) : null;

  const go = (target: string | null) => {
    if (!target) return;
    setYmd(target);
    setSelectedGameId(null);
    setSourceRect(null);
    setIsClosing(false);
    window.history.replaceState(null, "", `/live/${target}`);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-center gap-3">
        <NavButton
          dir="prev"
          onClick={() => go(prevYmd)}
          disabled={!prevYmd}
        />
        <DatePicker
          value={ymd}
          label={dateLabel(ymd)}
          dates={dates}
          onSelect={go}
          todayYmd={todayYmd}
        />
        <NavButton
          dir="next"
          onClick={() => go(nextYmd)}
          disabled={!nextYmd}
        />
      </div>

      {games.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <div
              key={g.gameId}
              style={selectedGameId === g.gameId ? { visibility: "hidden" as const } : undefined}
            >
              <LiveGameCard
                card={g}
                onClick={(e) => handleCardClick(e, g.gameId)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-[var(--color-muted)]">이 날은 경기가 없습니다.</div>
      )}

      {selectedGame && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-50 bg-black/75 backdrop-blur-md transition-opacity duration-300 ${isClosing ? "opacity-0" : "animate-modal-fade-in"}`}
            onClick={handleClose}
          />
          {/* Expanded card — same width as grid card, scaled up */}
          <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4">
            <div
              ref={modalCardRef}
              className="pointer-events-auto will-change-transform"
              style={{ width: sourceRect?.width }}
            >
              <LiveGameCard
                card={selectedGame}
                isExpanded={true}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NavButton({ dir, onClick, disabled }: { dir: "prev" | "next"; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "이전 경기일" : "다음 경기일"}
      className="flex h-10 w-10 cursor-pointer items-center justify-center text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)] disabled:cursor-default disabled:opacity-20"
    >
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dir === "prev" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
