"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Download, FileText, Printer } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBanner, type Status } from "@/components/status-banner";
import { downloadCsv } from "@/lib/csv";

interface Split {
  name: string;
  issued: number;
  returned: number;
  lost: number;
}

interface Summary {
  period: { from: string | null; to: string | null };
  totals: {
    issued: number;
    returned: number;
    lost: number;
    compensated: number;
    active: number;
    debtors: number;
  };
  bySubject: Split[];
  byClass: Split[];
  topBooks: { title: string; subject: string; isbn: string; issued: number }[];
  requests: { created: number; fulfilled: number; declined: number };
}

const today = () => new Date().toISOString().slice(0, 10);

export default function ReportView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/summary?${p}`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Не удалось загрузить отчёт");
      }
      setData((await res.json()) as Summary);
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const preset = (kind: "year" | "month" | "all") => {
    if (kind === "all") {
      setFrom("");
      setTo("");
      return;
    }
    if (kind === "year") {
      setFrom(`${new Date().getFullYear()}-01-01`);
      setTo(today());
      return;
    }
    const d = new Date();
    setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    setTo(today());
  };

  const exportCsv = async () => {
    setBusy(true);
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const res = await fetch(`/api/exports/summary?${p}`);
      if (!res.ok) throw new Error("Не удалось выгрузить CSV");
      await downloadCsv(res, `report-${from ? `${from}_` : ""}${to ? `${to}.csv` : "all.csv"}`);
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setBusy(false);
    }
  };

  const printHref = (() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    return `/print/report${qs ? `?${qs}` : ""}`;
  })();

  const periodLabel =
    from || to
      ? `за период ${from || "…"} — ${to || "…"}`
      : "за всё время";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <StatusBanner
        status={status}
        onClear={() => setStatus({ kind: "info", message: null })}
      />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Отчёт для директора
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">С даты</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">По дату</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              />
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => preset("year")}>
                Год
              </Button>
              <Button size="sm" variant="ghost" onClick={() => preset("month")}>
                Месяц
              </Button>
              <Button size="sm" variant="ghost" onClick={() => preset("all")}>
                Всё
              </Button>
            </div>
            <div className="ml-auto flex gap-2">
              <a
                href={printHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Printer className="h-4 w-4" /> Печать
              </a>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={busy}>
                <Download className="mr-1 h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Период — {periodLabel}. Снимки («сейчас выдано», «должники») — на
            текущий день.
          </p>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {!loading && data && (
        <>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Итоги</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Выдано за период" value={data.totals.issued} />
                <Stat label="Возвращено" value={data.totals.returned} />
                <Stat label="Утеряно" value={data.totals.lost} />
                <Stat
                  label="Компенсировано"
                  value={data.totals.compensated}
                />
                <Stat
                  label="Сейчас выдано"
                  value={data.totals.active}
                  accent
                />
                <Stat
                  label="Учеников с долгами"
                  value={data.totals.debtors}
                  accent
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">
                  Заявок создано: {data.requests.created}
                </Badge>
                <Badge variant="outline">
                  выполнено: {data.requests.fulfilled}
                </Badge>
                <Badge variant="outline">
                  отклонено: {data.requests.declined}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <SplitTable
            title="По предметам"
            rows={data.bySubject}
            icon={<BarChart3 className="h-4 w-4 text-primary" />}
          />
          <SplitTable
            title="По классам"
            rows={data.byClass}
            icon={<BarChart3 className="h-4 w-4 text-primary" />}
          />

          {data.topBooks.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">
                  Самые востребованные учебники (за период)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {data.topBooks.map((b, i) => (
                    <li key={b.isbn} className="flex items-center gap-3 py-2">
                      <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {b.title}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {b.subject}
                        </span>
                      </span>
                      <Badge variant="secondary">{b.issued}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SplitTable({
  title,
  rows,
  icon,
}: {
  title: string;
  rows: Split[];
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Нет данных.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Название</th>
                <th className="py-1.5 px-2 text-right font-medium">Выдано</th>
                <th className="py-1.5 px-2 text-right font-medium">
                  Возвращено
                </th>
                <th className="py-1.5 pl-2 text-right font-medium">Утеряно</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-2">{r.name}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.issued}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {r.returned}
                  </td>
                  <td
                    className={`py-1.5 pl-2 text-right tabular-nums ${
                      r.lost > 0 ? "font-medium text-destructive" : ""
                    }`}
                  >
                    {r.lost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
