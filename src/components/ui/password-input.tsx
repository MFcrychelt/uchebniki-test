"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Поле пароля с кнопкой показать/скрыть.
 *
 * Мобильная клавиатура и автозамена часто портят ввод, а «не могу войти»
 * из-за опечатки в пароле — самый частый тупик пользователя. Toggle даёт
 * проверить ввод, не стирая его.
 *
 * `size="lg"` — для экранов персонала (17px, h-12): поле и кнопка-«глаз»
 * становятся крупнее, палец/мышь не мажут мимо.
 */
type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "default" | "lg";
};

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, size = "default", ...props }, ref) {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          size={size}
          // type после spread: страница может передать свой — перекрываем
          // осознанно, вид поля здесь решает компонент.
          {...props}
          type={visible ? "text" : "password"}
          className={size === "lg" ? `pr-12 ${className ?? ""}` : `pr-11 ${className ?? ""}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={visible}
          data-tight
          // currentColor: кнопка одинаково видна и на светлой карточке, и
          // внутри тёмной панели (--panel), где muted-foreground нечитаем.
          className={`absolute inset-y-0 right-0 flex items-center justify-center rounded-r-lg text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            size === "lg" ? "w-12" : "w-11"
          }`}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
