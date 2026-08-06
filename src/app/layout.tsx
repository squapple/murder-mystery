import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NAN 2026 — 머더 미스터리",
  description: "심문 프로토타입 (이현우 × ESTP)",
};

// Phase 36 — 라이트 테마를 지원한 적이 없는 다크 전용 UI인데, 모바일 브라우저(특히
// 안드로이드 Chrome의 "웹사이트 다크 테마 간소화" 같은 자동 다크모드 보정 기능)가
// color-scheme 힌트가 없는 페이지를 임의로 다시 반전시키면서 가독성이 깨지는 사례가
// 보고됐다. viewport의 colorScheme을 명시해 이런 브라우저 자체 보정을 끈다.
export const viewport: Viewport = {
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <div className="app-background" aria-hidden="true" />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
