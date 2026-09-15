"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Режимы отображения (шестерёнка в шапке и на главной).
 *
 * Цвета зрения:
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
 * Производительность (то же меню, отдельный переключатель):
 *  - full — обычный вид;
 *  - lean — «лёгкий режим» для слабых телефонов: ни анимаций, ни теней,
 *           ни обложек книг (см. [data-perf="lean"] в globals.css).
 *           На дешёвом Android снимает основную часть перерисовки
 *           при скролле длинных списков.
 *
 * Режим ставится атрибутом data-a11y / data-perf на <html>; палитры
 * описаны в globals.css. Выбор — в localStorage, применяется
 * инлайн-скриптом до первой отрисовки (без мигания).
 */

export type A11yMode =
  | "default"
  | "contrast"
  | "daltonism-rg"
  | "daltonism-by";

export type PerfMode = "full" | "lean";

// Ключи и инлайн-скрипт — в src/lib/init-scripts.ts: их читает ещё и
// серверный layout, и держать копию здесь значит ловить расхождение
// разметки на гидрации.
import { A11Y_KEY, PERF_KEY } from "@/lib/init-scripts";

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

export function applyPerf(mode: PerfMode) {
  const el = document.documentElement;
  if (mode === "lean") el.setAttribute("data-perf", "lean");
  else el.removeAttribute("data-perf");
}


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
 * Шестерёнка: режимы для зрения + «лёгкий режим» для слабых устройств.
 */
export function AccessibilityGear() {
  const [mode, setMode] = useState<A11yMode>("default");
  const [perf, setPerf] = useState<PerfMode>("full");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(A11Y_KEY);
      if (isMode(raw)) setMode(raw);
      if (localStorage.getItem(PERF_KEY) === "lean") setPerf("lean");
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
  };

  const togglePerf = () => {
    const next: PerfMode = perf === "lean" ? "full" : "lean";
    setPerf(next);
    applyPerf(next);
    try {
      localStorage.setItem(PERF_KEY, next);
    } catch {
      // private mode — не запомнится
    }
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

  const active = mode !== "default" || perf === "lean";

  return (
    <div ref={boxRef} className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Режимы отображения"
        aria-expanded={open}
        title="Режимы отображения"
        className={cn(
          "flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Settings2 className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Режим отображения"
          className="safe-x absolute right-0 top-12 z-50 w-[min(19rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-1.5 shadow-panel"
        >
          <p className="eyebrow px-2.5 py-1.5 text-muted-foreground">
            Режим для зрения
          </p>
          {MODES.map((m) => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={mode === m.id}
              onClick={() => choose(m.id)}
              className={cn(
                "w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
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

          <div className="my-1.5 h-px bg-border" />

          <button
            role="menuitemcheckbox"
            aria-checked={perf === "lean"}
            onClick={togglePerf}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              perf === "lean"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            <Gauge
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                perf === "lean" ? "text-primary-foreground" : "text-muted-foreground"
              )}
            />
            <span className="min-w-0">
              <span className="block font-medium">Лёгкий режим</span>
              <span
                className={cn(
                  "block text-xs",
                  perf === "lean"
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground"
                )}
              >
                без теней, анимаций и обложек — для слабых телефонов
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
