import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";

interface PageHeaderProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /** Правая часть: user, «Выйти», кастомные кнопки. */
  actions?: React.ReactNode;
  /** На экране входа — стрелка и «Назад» вместо домика. */
  backLabel?: string;
  className?: string;
}

/**
 * Единая шапка защищённых/кабинетных страниц: липкая, с брендом-иконкой,
 * заголовком и действиями справа. Даёт три экранам (ученик, сотрудник)
 * одинаковый «app-like» вид.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  backLabel,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        // Без backdrop-blur: блюр на sticky-шапке при скролле — главный
        // источник лагов на слабых телефонах (постоянная перерисовка).
        // Сплошной фон выглядит так же и почти ничего не стоит.
        "sticky top-0 z-20 border-b border-border bg-background",
        className
      )}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <ThemeToggle />
          {backLabel ? (
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          ) : (
            <Link
              href="/"
              aria-label="На главную"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Home className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
