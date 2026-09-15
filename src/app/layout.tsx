import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme";
import {
  THEME_COLORS,
  a11yInitScript,
  themeInitScript,
} from "@/lib/init-scripts";

export const metadata: Metadata = {
  title: {
    default: "Школьная библиотека — учёт учебников",
    template: "%s · Школьная библиотека",
  },
  description:
    "Система учёта выдачи и возврата учебников: QR-коды учеников, сканирование ISBN, цифровые чек-листы",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    /* iOS на «домашний экран» берёт apple-touch-icon (180×180, без
       скруглений — их делает система). Без него iOS делает снимок страницы:
       размытая плашка вместо иконки. */
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    // «default» — системная полоса в цвет theme-color; контент не залезает
    // под вырез, поэтому паддинги безопасных зон не ломает вёрстку.
    statusBarStyle: "default",
    title: "Библиотека",
  },
  other: {
    // iOS превращает длинные цифры (ISBN!) в tel:-ссылки — тап по строке
    // с ISBN предлагал набрать номер. Отключаем.
    "format-detection": "telephone=no, address=no, email=no",
    // Для старых Android (Chrome < 108): полноэкранный режим PWA.
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // viewport-fit=cover нужен, чтобы env(safe-area-inset-*) вообще
  // считывались (челка iPhone, полоска жестов Android). Все отступы
  // безопасных зон — утилитами .safe-t/.safe-b/.safe-x в globals.css.
  viewportFit: "cover",
  // Android Chrome ≥108: при открытой клавиатуре контент перераспределяется,
  // а не уезжает под неё — нижняя кнопка «Выдать» остаётся доступной.
  interactiveWidget: "resizes-content",
  // theme-color ОДИН (не пара с media): его правит инлайн-скрипт темы
  // до первой отрисовки — на телефоне с ночной темой статус-бар сразу
  // тёмный. Варианты с media ломались бы при ручном переключении темы
  // внутри приложения.
  themeColor: THEME_COLORS.light,
  width: "device-width",
  initialScale: 1,
  // Максимальное масштабирование НЕ ограничиваем: user-scalable=no —
  // это провал по доступности (людям с плохим зумом нельзя увеличивать),
  // а «неожиданный зум при фокусе» лечится 16px в полях ввода.
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
      <body className="min-h-dvh antialiased">
        {/* Класс темы и режимы доступности ставятся до первой отрисовки —
            иначе тёмная тема мигает белым (FOUC). suppressHydrationWarning:
            содержимое этих <script> правит документ, а не React, и сравнивать
            его при гидрации бессмысленно — малейший сдвиг чанка (Fast Refresh,
            устаревший кэш, расширение браузера) давал бы «hydration mismatch»
            при полностью рабочей теме. */}
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{ __html: a11yInitScript }}
          suppressHydrationWarning
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
