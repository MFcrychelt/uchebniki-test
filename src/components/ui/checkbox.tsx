import * as React from "react";
import { cn } from "@/lib/utils";

// Лёгкий чекбокс на нативном input (без внешних зависимостей).
interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        // 24px визуально + вся строка списка кликабельна — попасть пальцем
        // можно по всей ширине, а не по маленькому квадратику.
        "checkbox-tick h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-input bg-card transition-[background-color,border-color]",
        "checked:border-primary checked:bg-primary checked:text-primary-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
