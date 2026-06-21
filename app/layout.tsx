import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
// Self-hosted Pretendard: the dynamic-subset CSS splits the variable font into
// unicode-range chunks, so browsers fetch only the subsets a page actually
// renders. Next copies the woff2 files into /_next/static at build time.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";


// Served from /_next/static as well — next/font downloads at build time.
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "오늘의 승패마진",
  description: "KBO 리그 10개 구단의 승패마진과 승률을 날짜별·경기별로 확인할 수 있는 웹사이트입니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={plexMono.variable}
    >
      <body className="min-h-dvh antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
