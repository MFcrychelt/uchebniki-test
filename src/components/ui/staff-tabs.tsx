"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Лента разделов для панелей персонала (библиотекарь / администратор).
 *
 * Один и тот же список разделов живёт в трёх формах — потому что телефон
 * и монитор требуют разного:
 *
 *  < sm  — **нижний док** (большой палец дотягивается сам) с 2–3 ежедневными
 *          разделами + «Ещё» (шторка со всем остальным). Верхнюю ленту
 *          из 9 кнопок раньше нужно было скроллить пальцем и тянуться к
 *          ней через весь экран; док всегда на месте, а счётчики «Долги 4»
 *          видно, не открывая вкладку.
 *  sm–lg — липкая горизонтальная лента сверху (как была): на планшете
 *          ширина позволяет держать все разделы в ряд.
 *  lg+   — вертикальная панель слева, все разделы с подписями и счётчиками.
 *
 * Компонент ничего не знает о содержимом вкладок: только value/onChange.
 */
export interface StaffTabItem {
  id: string;
  label: string;
  icon: typeof ScanLine;
  /** Цифра на кнопке (0 и undefined — чипа нет). */
  badge?: number;
  /** Показывать в нижнем доке на телефоне (держим 2–3, иначе тесно). */
  inDock?: boolean;
}

function BadgeChip({ n, tone }: { n: number; tone: "on" | "off" }) {
  return (
    <span
      className={cn(
        "num inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none",
        tone === "on"
          ? "bg-white/25 text-panel-foreground"
          : "bg-destructive/12 text-destructive"
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function StaffTabs({
  items,
  value,
  onChange,
  scan,
  ariaLabel = "Разделы",
}: {
  items: StaffTabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Быстрый запуск сканера из дока (без перехода во вкладку). */
  scan?: { label: string; onStart: () => void };
  /** Подпись области навигации (скринридер). */
  ariaLabel?: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const dockItems = items.filter((t) => t.inDock).slice(0, 3);
  const rest = items.filter((t) => !t.inDock);

  // Шторка «Ещё» на телефоне: блокируем прокрутку страницы за ней, иначе
  // список уезжает под пальцем и тап мажет по нужной строке.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLButtonElement>("button[data-tab-btn]")?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // Стрелки в ленте/панели: с клавиатуры (и с пультов интерактивных
  // досок) переключать разделы быстрее, чем Tab-ом по девяти кнопкам.
  const onArrow = (e: React.KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const host = e.currentTarget as HTMLElement;
    const btns = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button[data-tab-btn]")
    );
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1 || btns.length === 0) return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? btns.length - 1
          : (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + btns.length) %
            btns.length;
    btns[next]?.focus();
    btns[next]?.click();
  };

  const button = (
    t: StaffTabItem,
    variant: "strip" | "rail" | "dock" | "sheet"
  ) => {
    const on = value === t.id;
    const Icon = t.icon;
    return (
      <button
        key={t.id}
        type="button"
        data-tab-btn
        aria-current={on ? "page" : undefined}
        onClick={() => {
          onChange(t.id);
          if (variant === "sheet") setMoreOpen(false);
        }}
        className={cn(
          // min-w-max + shrink-0 — в мобильной ленте подпись не ломается;
          // min-h-11/12 — попадание пальцем (пожилому сотруднику важнее,
          // чем «плотность» интерфейса).
          "flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors active:scale-[0.985]",
          variant === "strip" && "min-h-11 min-w-max shrink-0 snap-start px-3 py-2 text-sm",
          variant === "rail" && "min-h-11 w-full justify-start px-3 py-2 text-left text-sm",
          variant === "dock" && "h-full min-h-[3.25rem] flex-1 flex-col gap-1 rounded-xl text-[11px] leading-none",
          variant === "sheet" && "min-h-14 w-full justify-start px-3.5 text-[15px]",
          on
            ? "bg-panel text-panel-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Icon className={cn("shrink-0", variant === "dock" ? "h-5 w-5" : "h-4 w-4")} />
        <span className="min-w-0 flex-1 truncate text-left">{t.label}</span>
        {typeof t.badge === "number" && t.badge > 0 && (
          <BadgeChip n={t.badge} tone={on ? "on" : "off"} />
        )}
      </button>
    );
  };

  return (
    <>
      {/* ---------------- sm–lg: липкая лента сверху ---------------- */}
      <nav
        aria-label={ariaLabel}
        className="safe-t isolate-paint sticky top-0 z-20 -mx-4 border-b border-border bg-background px-4 pb-2 sm:mx-0 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-1 sm:pb-1 lg:hidden"
      >
        <div
          onKeyDown={onArrow}
          className="flex snap-x gap-1 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-flow-col sm:auto-cols-fr sm:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          {items.map((t) => button(t, "strip"))}
        </div>
      </nav>

      {/* ---------------- lg+: вертикальная панель разделов ---------------- */}
      <nav
        aria-label={ariaLabel}
        className="hidden lg:block rounded-xl border border-border bg-card p-1.5"
      >
        <div onKeyDown={onArrow} className="flex flex-col gap-0.5">
          {items.map((t) => button(t, "rail"))}
        </div>
        {scan && (
          <button
            type="button"
            onClick={scan.onStart}
            className="mt-1.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.985]"
          >
            <ScanLine className="h-4 w-4" />
            {scan.label}
          </button>
        )}
      </nav>

      {/* ---------------- телефон: нижний док ---------------- */}
      <div className="safe-b isolate-paint fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-2 py-1.5 sm:hidden">
        <div className="flex items-stretch gap-1">
          {scan && (
            <button
              type="button"
              onClick={scan.onStart}
              className="flex h-[3.25rem] min-w-[4.5rem] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              <ScanLine className="h-5 w-5" />
              {scan.label}
            </button>
          )}
          {dockItems.map((t) => button(t, "dock"))}
          {rest.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className="relative flex h-[3.25rem] min-w-[3.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold leading-none text-muted-foreground"
            >
              <ChevronDown className="h-5 w-5 rotate-180" />
              Ещё
              {rest.some((t) => (t.badge ?? 0) > 0) && (
                <span
                  className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-destructive"
                  aria-hidden
                />
              )}
            </button>
          )}
        </div>
      </div>

      {/* шторка «Ещё» — остальные разделы на телефоне */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="Все разделы">
          <button
            type="button"
            aria-label="Закрыть список разделов"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-foreground/35"
          />
          <div
            ref={sheetRef}
            className="sheet-in safe-b absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-2 pb-3"
          >
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border" aria-hidden />
            <div className="flex flex-col gap-0.5">{rest.map((t) => button(t, "sheet"))}</div>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="mt-1 min-h-11 w-full rounded-lg text-sm font-semibold text-muted-foreground hover:bg-accent"
            >
              Свернуть
            </button>
          </div>
        </div>
      )}
    </>
  );
}
