"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "uchebniki:installHint";

/**
 * Подсказка «установить на телефон».
 *
 * Зачем: приложение, открытое с домашнего экрана, стартует с локального
 * кэша ассетов — на слабом Android и iPhone это самый заметный выигрыш в
 * «открылось за секунду». Поэтому подсказку показываем ровно один раз и
 * только тем, кто ещё не установил приложение.
 *
 * Никакого веса не добавляет: компонент возвращает null, а DOM-узлов —
 * две строки. iOS не отдаёт событие установки (beforeinstallprompt),
 * поэтому там — короткая инструкция про «Поделиться».
 */
export function InstallHint({ variant = "light" }: { variant?: "light" | "panel" }) {
  const [state, setState] = useState<"hidden" | "android" | "ios">("hidden");

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // private mode — просто не показываем
    }
    const displayMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS 12.1+: единственный способ отличить «домашний экран» от Safari
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (displayMode) return;

    const ua = navigator.userAgent;
    if (/iP(hone|ad|od)/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) {
      setState("ios");
    } else {
      setState("android");
    }
  }, []);

  if (state === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // не запомнится — не страшно
    }
    setState("hidden");
  };

  const cls =
    variant === "panel"
      ? "panel-field flex items-start gap-3 p-3 text-panel-foreground"
      : "flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-card";
  const muted =
    variant === "panel" ? "text-panel-muted" : "text-muted-foreground";

  return (
    <div className={cls}>
      <Download className={`mt-0.5 h-4 w-4 shrink-0 ${muted}`} aria-hidden />
      <p className={`min-w-0 flex-1 text-sm ${muted}`}>
        {state === "ios" ? (
          <>
            <span className="font-semibold text-foreground">
              Работает быстрее на телефоне:
            </span>{" "}
            <Share
              className="inline h-3.5 w-3.5 -translate-y-px"
              aria-hidden
            />{" "}
            «Поделиться» → «На экран „Домой“»: после этого кабинет
            открывается мгновенно, прямо с домашнего экрана.
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">
              Установка на телефон:
            </span>{" "}
            меню браузера → «Установить приложение». Кабинет и выдача
            открываются мгновенно.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Скрыть подсказку"
        data-tight
        className={`-m-1 shrink-0 rounded p-1 ${muted} hover:opacity-70`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
