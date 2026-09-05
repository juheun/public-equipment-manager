import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { TextSizeProvider } from "@/components/shared/text-size-provider";
import "./globals.css";

// hydration 전에 미리 글자 크기를 적용해 새로고침 시 깜빡임(FOUC)을 막는다.
// next-themes는 자체적으로 이런 스크립트를 주입해 다크모드 깜빡임을 막아주지만,
// 글자 크기는 이 앱만의 기능이라 같은 방식을 직접 구현했다.
const TEXT_SIZE_INIT_SCRIPT = `
(function() {
  try {
    var percents = [100, 110, 120, 135, 150];
    var level = Number(localStorage.getItem("text-size-level"));
    var percent = percents[level] || 100;
    document.documentElement.style.fontSize = percent + "%";
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "장비 재고 관리 시스템",
  description: "산업용 장비 및 부속품 통합 렌탈·재고 관리 시스템",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "장비 재고 관리",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-muted/30">
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_INIT_SCRIPT }} />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TextSizeProvider>
            {children}
            <Toaster />
          </TextSizeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
