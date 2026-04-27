import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

// JetBrains-like mono 대체: Geist_Mono — 숫자 정렬·코드 영역.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Algolink — AI Agentic 업무 지원",
    template: "%s · Algolink",
  },
  description:
    "AI Agentic 기반 한국 교육 컨설팅 워크플로우 — 의뢰부터 정산까지 한 화면에서.",
  applicationName: "Algolink",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="min-h-full bg-[var(--color-background)] text-[var(--color-text)] flex flex-col">
        {children}
      </body>
    </html>
  );
}
