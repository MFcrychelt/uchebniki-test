import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Насыщенная панель — главный приём референса (fermi.gg): один сплошной
 * «чернильный» блок на экран, внутри него — крупные белые заголовки,
 * полупрозрачные поля и кнопка жеста. Всё остальное на странице — фон.
 *
 * Дешевизна сознательная: сплошной цвет + рамки, ноль блюра и градиентов,
 * поэтому панель на слабом Android стоит один fill, а не перерисовку слоя.
 */

/** Микро-надпись CAPS с разрядкой (как «your guess» / «STICKY NOTES»). */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("eyebrow text-muted-foreground", className)}>
      {children}
    </span>
  );
}

interface PanelProps {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Герой-блок на главной крупнее панели в кабинете — размер задаётся
   *  здесь, а не копированием вёрстки. */
  titleClassName?: string;
  /** Правый верхний угол (номер, дата, счётчик — как «No. 051»). */
  right?: React.ReactNode;
  /** Низ панели: поле ввода / кнопка жеста. */
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Panel({
  eyebrow,
  title,
  subtitle,
  titleClassName,
  right,
  footer,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  return (
    <section className={cn("panel p-5 sm:p-7", className)}>
      {(eyebrow || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {eyebrow ? (
            <span className="eyebrow text-panel-muted">{eyebrow}</span>
          ) : (
            <span />
          )}
          {right ? (
            <span className="num shrink-0 text-sm text-panel-muted">{right}</span>
          ) : null}
        </div>
      )}
      {title && (
        <h2
          className={cn(
            "text-[1.7rem] font-semibold leading-[1.18] text-balance sm:text-3xl",
            titleClassName
          )}
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="panel-muted mt-2 max-w-prose text-sm leading-relaxed sm:text-base">
          {subtitle}
        </p>
      )}
      {children && <div className={cn(bodyClassName)}>{children}</div>}
      {footer && <div className="mt-5">{footer}</div>}
    </section>
  );
}

/** Поле/плашка внутри панели: белый с прозрачностью, не новый цвет. */
export function PanelField({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("panel-field p-3.5", className)}>{children}</div>;
}
