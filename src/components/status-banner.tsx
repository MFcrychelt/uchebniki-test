"use client";

import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusKind = "success" | "error" | "info";

export interface Status {
  kind: StatusKind;
  message: string | null;
}

interface StatusBannerProps {
  status: Status;
  onClear?: () => void;
  className?: string;
}

// Информационная плашка (вместо alert()).
export function StatusBanner({ status, onClear, className }: StatusBannerProps) {
  if (!status.message) return null;

  // Текст — сам ЦВЕТ статуса (как в error/info), а не «-foreground»-вариант:
  // *-foreground — белый, он предназначен для текста на СОЛИДНОМ цвете,
  // а фон плашки — прозрачный тинт (/10). Получался белый на белом.
  const styles: Record<StatusKind, string> = {
    success: "bg-success/10 border-success/40 text-success",
    error: "bg-destructive/10 border-destructive/40 text-destructive",
    info: "bg-primary/10 border-primary/40 text-primary",
  };
  const Icon =
    status.kind === "success" ? CheckCircle2 : status.kind === "error" ? AlertCircle : Info;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        styles[status.kind],
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1 break-words">{status.message}</span>
      {onClear && (
        <button
          onClick={onClear}
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
