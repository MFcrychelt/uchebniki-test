"use client";

import Link from "next/link";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Тулбар печатной страницы: печать и возврат. Скрывается при печати.
export default function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="no-print safe-t isolate-paint sticky top-0 z-10 mb-6 flex items-center justify-between gap-2 border-b border-border bg-background py-2">
      <Link
        href={backHref}
        className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" /> Закрыть
      </Link>
      <Button size="sm" variant="default" onClick={() => window.print()}>
        <Printer className="mr-1 h-4 w-4" /> Печать
      </Button>
    </div>
  );
}
