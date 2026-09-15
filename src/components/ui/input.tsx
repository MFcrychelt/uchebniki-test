import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  // `size` у input — нативный атрибут ширины в символах; здесь он
  // переопределён осознанно (нативный size в приложении не используется).
  /**
   * `lg` — экраны, где работают «в очках и за старым монитором»: вход
   * персонала, фильтры. 17px вместо 16px: ниже нельзя — iOS зумит, а
   * 16px на TN-матрице с косого угла уже «сыплется».
   */
  size?: "default" | "lg";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", ...props }, ref) => (
    <input
      type={type}
      className={cn(
        // text-base (16px) минимум всегда: iOS Safari зумит страницу при
        // фокусе, если шрифт input < 16px, и потом «забывает» отзумить.
        // h-11 (44px) — зона тапа по Apple HIG / Material; на тач-устройствах
        // min-height 44px дополнительно выставлен в globals.css.
        "w-full rounded-lg border border-input bg-card py-2 shadow-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:border-0 file:bg-transparent file:font-medium",
        size === "lg"
          ? "h-12 px-4 text-[17px] file:text-[15px]"
          : "h-11 px-3.5 text-base file:text-base",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
