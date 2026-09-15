import { cn } from "@/lib/utils";

interface SectionTitleProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  /** Число в бейдже (например, «Выданные учебники (3)»). */
  count?: number;
  /** Справа: ссылка/кнопка. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Единый заголовок секции: иконка + название + счётчик/действие.
 *
 * Число — моноширинными табличными цифрами и в «капсе»: счётчик меняется
 * на глазах у стоящего рядом человека, и он не должен «прыгать» по ширине.
 */
export function SectionTitle({
  icon: Icon,
  title,
  count,
  action,
  className,
}: SectionTitleProps) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center justify-between gap-2",
        className
      )}
    >
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="truncate">{title}</span>
        {typeof count === "number" && (
          <span className="num rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold text-primary">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}
