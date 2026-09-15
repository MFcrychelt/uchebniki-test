"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Режимы для пользователей с особенностями зрения:
 *  - default        — обычные цвета;
 *  - contrast       — повышенная контрастность (тёмнее текст, жирнее
 *                     границы — для слабовидящих);
 *  - daltonism-rg   — красный/зелёный не различаются (протанопия,
 *                     дейтеранопия): статусы разводятся по
 *                     синий↔оранжевый — различимы и по оттенку, и по
 *                     яркости;
 *  - daltonism-by   — синий/жёлтый не различаются (тританопия):
 *                     статусы разводятся по оранжевый↔пурпурный.
 *
 * Режим ставится атрибутом data-a11y на <html>; палитры описаны в
 * globals.css (переопределение CSS-переменных). Выбор — в localStorage.
 */

export type A11yMode =
  | "default"
  | "contrast"
  | "daltonism-rg"
  | "daltonism-by";

const A11Y_KEY = "uchebniki:a11y";

const isMode = (v: string | null): v is A11yMode =>
  v === "default" ||
  v === "contrast" ||
  v === "daltonism-rg" ||
  v === "daltonism-by";

export function applyA11y(mode: A11yMode) {
  const el = document.documentElement;
  if (mode === "default") {
    el.removeAttribute("data-a11y");
  } else {
    el.setAttribute("data-a11y", mode);
  }
}

/** Инлайн-скрипт до первой отрисовки (как у темы — без мигания). */
export const a11yInitScript = `(function(){try{var m=localStorage.getItem("${A11Y_KEY}");if(m!=="contrast"&&m!=="daltonism-rg"&&m!=="daltonism-by")return;document.documentElement.setAttribute("data-a11y",m);}catch(e){}})();`;

const MODES: { id: A11yMode; label: string; hint?: string }[] = [
  { id: "default", label: "Обычные цвета" },
  {
    id: "contrast",
    label: "Повышенная контрастность",
    hint: "текст темнее, границы заметнее",
  },
  {
    id: "daltonism-rg",
    label: "Дальтонизм: красный – зелёный",
    hint: "протанопия, дейтеранопия",
  },
  {
    id: "daltonism-by",
    label: "Дальтонизм: синий – жёлтый",
    hint: "тританопия",
  },
];

/**
 * Шестерёнка с меню режимов зрения (на главной, под кнопкой темы).
 */
export function AccessibilityGear() {
  const [mode, setMode] = useState<A11yMode>("default");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(A11Y_KEY);
      if (isMode(raw)) setMode(raw);
    } catch {
      // нет localStorage — обычный режим
    }
  }, []);

  const choose = (m: A11yMode) => {
    setMode(m);
    applyA11y(m);
    try {
      localStorage.setItem(A11Y_KEY, m);
    } catch {
      // private mode — работает, но не запомнится
    }
    setOpen(false);
  };

  // Тап/клик мимо меню — закрыть. pointerdown ловит и палец, и мышь
  // (на iOS mousedown приходит с задержкой и может «промазать»).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={boxRef} className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Режимы отображения"
        aria-expanded={open}
        title="Режимы отображения"
        className={cn(
          "flex h-11 w-11 touch-manipulation items-center justify-center rounded-md transition-colors",
          mode === "default"
            ? "text-muted-foreground hover:bg-accent hover:text-foreground"
            : "bg-accent text-accent-foreground"
        )}
      >
        <Settings2 className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Режим отображения"
          className="absolute right-0 top-12 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-1.5 shadow-lg"
        >
          <p className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Режим для зрения
          </p>
          {MODES.map((m) => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={mode === m.id}
              onClick={() => choose(m.id)}
              className={cn(
                "w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                mode === m.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              <span className="block font-medium">{m.label}</span>
              {m.hint && (
                <span
                  className={cn(
                    "block text-xs",
                    mode === m.id
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  )}
                >
                  {m.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
