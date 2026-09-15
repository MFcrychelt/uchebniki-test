import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme";
import { a11yInitScript } from "@/components/accessibility";

export const metadata: Metadata = {
  title: {
    default: "Школьная библиотека — учёт учебников",
    template: "%s · Школьная библиотека",
  },
  description:
    "Система учёта выдачи и возврата учебников: QR-коды учеников, сканирование ISBN, цифровые чек-листы",
  manifest: "/manifest.json",
  icons: {
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Библиотека",
  },
};

export const viewport: Viewport = {
  // Переключается скриптом темы под фактический режим.
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: класс dark на <html> ставит инлайн-скрипт
    // до гидрации — разметка сервера и клиента осознанно различается.
    <html lang="ru" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* Ставим класс темы до первой отрисовки — иначе тёмная тема
            мигает белым (FOUC). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: a11yInitScript }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
