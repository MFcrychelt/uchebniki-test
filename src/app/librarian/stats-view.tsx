"use client";

import { useEffect, useState } from "react";
import { BarChart3, BookCopy, GraduationCap, Library, PackageX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBanner, type Status } from "@/components/status-banner";

interface Stats {
  totals: {
    books: number;
    students: number;
    classes: number;
    active: number;
    returned: number;
    lost: number;
  };
  activeBySubject: { name: string; count: number }[];
  activeByClass: { name: string; count: number }[];
  topBooks: { isbn: string; title: string; subject: string; count: number; active: number }[];
}

export default function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [banner, setBanner] = useState<Status>({ kind: "info", message: null });

  useEffect(() => {
    fetch("/api/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setStats(await r.json());
      })
      .catch(() => setBanner({ kind: "error", message: "Не удалось загрузить статистику" }));
  }, []);

  if (!stats) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <StatusBanner status={banner} onClear={() => setBanner({ kind: "info", message: null })} />
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  const kpis = [
    { label: "На руках у учеников", value: stats.totals.active, icon: BookCopy, tone: "text-warning" },
    { label: "Книг в фонде", value: stats.totals.books, icon: Library, tone: "text-primary" },
    { label: "Учеников", value: stats.totals.students, icon: GraduationCap, tone: "text-primary" },
    { label: "Утеряно", value: stats.totals.lost, icon: PackageX, tone: "text-destructive" },
  ];

  const BarList = ({ items, empty }: { items: { name: string; count: number }[]; empty: string }) => {
    const max = Math.max(1, ...items.map((i) => i.count));
    if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
    return (
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.name}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span>{i.name}</span>
              <span className="text-muted-foreground">{i.count}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary/70"
                style={{ width: `${(i.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <StatusBanner status={banner} onClear={() => setBanner({ kind: "info", message: null })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <k.icon className={`mb-1 h-5 w-5 ${k.tone}`} />
              <p className="text-2xl font-bold tabular-nums">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4" /> Предметы: книги на руках
          </h2>
          <BarList items={stats.activeBySubject} empty="Активных выдач нет." />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold">По классам: книги на руках</h2>
          <BarList items={stats.activeByClass} empty="Активных выдач нет." />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Чаще всего выдаваемые книги</h2>
          {stats.topBooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Выдач пока не было.</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.topBooks.map((b) => (
                <li key={b.isbn} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{b.subject}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>
                      выдано: <span className="font-medium tabular-nums text-foreground">{b.count}</span>
                    </p>
                    <p>
                      на руках: <span className="font-medium tabular-nums text-foreground">{b.active}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Всего операций: {stats.totals.active + stats.totals.returned + stats.totals.lost} (возвращено:{" "}
        {stats.totals.returned})
      </p>
    </div>
  );
}
