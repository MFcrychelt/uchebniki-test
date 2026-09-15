import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

/**
 * Кнопки: крупные, сплошные, с мгновенным откликом на тап.
 *
 * Мелочи, которые решают «практичность» на телефоне:
 *  - touch-manipulation — убирает 300-мс паузу двойного тапа;
 *  - active:scale — отклик тапа через transform (дёшево GPU), а не через
 *    тень/свечение (перерисовка слоя);
 *  - transition только по цвету/трансформации: transition по box-shadow на
 *    длинных списках — заметная нагрузка на слабом Android;
 *  - min-height 44px на тач-устройствах добавляет CSS (Apple HIG /
 *    Material), поэтому h-9/h-10 здесь не «мелкие» — они дотянутся до 44px;
 *  - hover-эффекты только там, где есть мышь (@media hover: hover), иначе
 *    на телефоне состояние «залипает» после тапа.
 */
const buttonVariants = cva(
  "inline-flex touch-manipulation select-none items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 transition-[background-color,color,transform] duration-100",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /** Полупрозрачная «чипа» внутри тёмной панели (ферми-стиль). */
        panel:
          "border border-panel-line bg-white/12 text-panel-foreground hover:bg-white/20",
        /** Главный жест дня: сплошная «белая фишка» на панели. */
        hero: "bg-panel-foreground text-panel shadow-card hover:bg-panel-foreground/92",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-xl px-6 text-base",
        /** Пилюля-CTA («LOCK IT IN ↵»): крупный тап, разрядка в надписи. */
        pill: "h-12 rounded-full px-7 text-sm font-bold tracking-[0.08em]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
