import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";
import { AccessibilityGear } from "@/components/accessibility";

interface PageHeaderProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /** Правая часть: user, «Выйти», кастомные кнопки. */
  actions?: React.ReactNode;
  /** На экране входа — стрелка и «Назад» вместо домика. */
  backLabel?: string;
  /** Куда ведёт «Назад» (по умолчанию — на главную). */
  backHref?: string;
  /** Доступна ли шестерёнка режимов (по умолчанию — да). */
  withGear?: boolean;
  /** Липкая шапка (по умолчанию). На телефонах с длинным списком
   *  липкой лучше оставить навигацию — тогда шапка уходит при скролле. */
  sticky?: boolean;
  /** На телефоне — только кнопки: заголовок и подпись скрыты (до `sm`).
   *  В панелях персонала разделы и так подписаны в доке, а две строки
   *  текста в шапке на узком экране съедают место у рабочего стола.
   *  Заголовок не удаляется из DOM (sr-only) — скринридер его читает. */
  buttonsOnlyOnMobile?: boolean;
  className?: string;
}

/**
 * Единая шапка защищённых/кабинетных страниц: липкая, с брендом-иконкой,
 * заголовком и действиями справа. Даёт экранам (ученик, библиотекарь,
 * админ) одинаковый «app-like» вид.
 *
 * Что в ней заложено ради телефона:
 *  - .safe-t — паддинг под «челку» iPhone и строку состояния Android
 *    (без него первая строка уезжает под вырез в PWA-режиме);
 *  - сплошной фон БЕЗ backdrop-blur: полупрозрачный блюр на sticky-шапке
 *    пересчитывается каждый кадр скролла — на слабом Android это главный
 *    источник «тормозов интерфейса»;
 *  - contain:paint (.isolate-paint) — перерисовка шапки не задевает список
 *    под ней;
 *  - переключатели (тема/режимы) — свои, 44px: на телефоне их удобно
 *    попасть пальцем, а «шестерёнка» даёт лёгкий режим прямо из кабинета.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  backLabel,
  backHref = "/",
  withGear = true,
  sticky = true,
  buttonsOnlyOnMobile = false,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "safe-t isolate-paint border-b border-border bg-background",
        sticky && "sticky top-0 z-20",
        className
      )}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pb-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel text-panel-foreground">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div
            className={cn(
              "min-w-0",
              // max-sm:sr-only — визуально скрыто на телефоне, но остаётся
              // в дереве доступности: заголовок экрана не должен пропадать
              // у скринридера вместе с надписью.
              buttonsOnlyOnMobile && "max-sm:sr-only"
            )}
          >
            <h1 className="truncate text-[17px] font-semibold leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-[13px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          <ThemeToggle />
          {withGear && <AccessibilityGear />}
          {backLabel ? (
            <Link
              href={backHref}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
          ) : (
            <Link
              href="/"
              aria-label="На главную"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Home className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
