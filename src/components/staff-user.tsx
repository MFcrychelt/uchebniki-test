"use client";

import { useState } from "react";
import { LogOut, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// В шапке защищённых страниц: кто вошёл + выход.
export default function StaffUser({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // cookie могли не сброситься из-за сети — всё равно уходим с экрана
    }
    // Полная перезагрузка: иначе RSC/клиентский кэш снова открывает кабинет.
    window.location.assign("/login?out=1");
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
        <UserCircle2 className="h-4 w-4" />
        {name}
      </span>
      <Button variant="ghost" size="sm" onClick={logout} disabled={busy}>
        <LogOut className="mr-1 h-4 w-4" />
        Выйти
      </Button>
    </div>
  );
}
