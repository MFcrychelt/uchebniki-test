"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Темы: светлая / тёмная / системная (автоопределение по настройкам
 * устройства). Выбор хранится в localStorage, класс `dark` вешается
 * на <html> — переменные цветов описаны в globals.css.
 */

export type Theme = "light" | "dark" | "system";

/**
 * Значения — в src/lib/init-scripts.ts (единственный источник для
 * серверного layout и клиента). Отсюда реэкспорт, чтобы не плодить два
 * места, где правят цвет хрома мобильного браузера.
 */
export { THEME_COLORS } from "@/lib/init-scripts";
import { THEME_COLORS, THEME_KEY } from "@/lib/init-scripts";

interface ThemeCtx {
  /** Выбор пользователя. */
  theme: Theme;
  /** Во что фактически превратился (system → light/dark). */
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});

function applyTheme(t: Theme): "light" | "dark" {
  const dark =
    t === "dark" ||
    (t === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  // color-scheme: нативные скроллбары/инпуты под тему
  el.style.colorScheme = dark ? "dark" : "light";
  // Цвет статус-бара мобильного браузера — под тему
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute(
      "content",
      dark ? THEME_COLORS.dark : THEME_COLORS.light
    );
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // private mode — тема работает, но не запомнится
    }
    setResolved(applyTheme(t));
  }, []);

  // Инициализация: класс уже стоит (инлайн-скрипт), читаем выбор.
  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      // нет localStorage — «системная»
    }
    setThemeState(stored);
    setResolved(applyTheme(stored));
  }, []);

  // Системная тема меняется (вечером включили тёмную) — реагируем,
  // пока выбран режим «Системная».
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (localStorage.getItem(THEME_KEY) !== "dark" && localStorage.getItem(THEME_KEY) !== "light") {
        setResolved(applyTheme("system"));
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Солнце / луна. «Как в системе» не показываем — на телефоне иконка
 * монитора ни о чём не говорит. До первого нажатия тема всё равно
 * следует за устройством (значение system в storage).
 */
export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const shown = theme === "system" ? resolved : theme;
  const dark = shown === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={dark ? "Тёмная тема" : "Светлая тема"}
      className="relative z-50 flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
