"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Кнопка «Печать» для страниц-инструкций.
 *
 * Инструкции библиотеки читают с листа: пожилому сотруднику проще держать
 * перед глазами распечатку, чем вкладку. `window.print()` — нативный диалог,
 * никаких библиотек; сама кнопка помечена `no-print` и на бумагу не попадёт.
 */
export function PrintButton({ label = "Печать инструкции" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="no-print w-full sm:w-auto"
      onClick={() => window.print()}
    >
      <Printer className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
