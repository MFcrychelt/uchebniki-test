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

/** Единый заголовок секции: иконка + название + счётчик/действие. */
export function SectionTitle({
  icon: Icon,
  title,
  count,
  action,
  className,
}: SectionTitleProps) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
        {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" />}
        <span className="truncate">{title}</span>
        {typeof count === "number" && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}
