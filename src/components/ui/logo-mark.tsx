import { Library } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Знак библиотеки — общая плитка на двух экранах входа (персонал и
 * ученик) и в шапке главной. Один компонент, чтобы анимация и размер
 * не разъезжались: раньше на /login икалась одна иконка, на /student —
 * другая, и живого знака на главной не было вовсе.
 *
 * `halo={false}` — на светлой поверхности (карточка на белом фоне):
 * светящееся кольцо там не читается, остаётся только наклон «полки».
 */
export function LogoMark({
  size = "md",
  halo = true,
  className,
  title,
}: {
  size?: "sm" | "md" | "lg";
  halo?: boolean;
  className?: string;
  /** Подпись для скринридера; по умолчанию знак декоративный. */
  title?: string;
}) {
  const box =
    size === "lg"
      ? "h-14 w-14 rounded-2xl"
      : size === "md"
        ? "h-11 w-11 rounded-xl"
        : "h-9 w-9 rounded-lg";
  const icon =
    size === "lg" ? "h-7 w-7" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        halo && "logo-tile",
        "bg-white/15",
        box,
        className
      )}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <Library className={cn("logo-book", icon)} aria-hidden />
    </span>
  );
}
