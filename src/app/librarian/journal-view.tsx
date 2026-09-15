"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, Download, HandCoins, Printer, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBanner, type Status } from "@/components/status-banner";
import { downloadCsv } from "@/lib/csv";
import { DATA_CHANGED_EVENT } from "@/lib/offline-queue-browser";
import type { ClassWithDetails, LoanStatus } from "@/lib/types";

interface JournalRow {
  id: string;
  status: LoanStatus;
  issuedAt: string;
  returnedAt: string | null;
  lostAt: string | null;
  compensatedAt: string | null;
  compensatedBy: string | null;
  issuedBy: string | null;
  student: {
    id: string;
    lastName: string;
    firstName: string;
    classId: string | null;
    class: { id: string; name: string } | null;
  };
  book: { id: string; isbn: string; title: string; subject: string };
}

const STATUS_META: Record<
  LoanStatus,
  { label: string; variant: "warning" | "success" | "destructive" }
> = {
  ISSUED: { label: "выдана", variant: "warning" },
  RETURNED: { label: "возвращена", variant: "success" },
  LOST: { label: "утеряна", variant: "destructive" },
};

export default function JournalView() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Status>({ kind: "info", message: null });
  const [nonce, setNonce] = useState(0); // bump после синхронизации офлайн-очереди
  // Баннер, показанный действием («отмечена компенсированной» и т.п.),
  // не должен стираться перезагрузкой списка, которую само это действие
  // и вызвало (bump nonce → эффект → setBanner(null)). Флаг разрешает
  // один рефеч без сброса баннера; смена фильтров сбрасывает как раньше.
  const keepBannerRef = useRef(false);

  useEffect(() => {
    fetch("/api/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then(setClasses)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (classId) params.set("classId", classId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      try {
        const res = await fetch(`/api/loans?${params}`);
        if (!res.ok) throw new Error();
        const data: JournalRow[] = await res.json();
        if (!cancelled) {
          setRows(data);
          if (keepBannerRef.current) {
            keepBannerRef.current = false;
          } else {
            setBanner({ kind: "info", message: null });
          }
        }
      } catch {
        if (!cancelled) {
          keepBannerRef.current = false;
          setBanner({ kind: "error", message: "Не удалось загрузить журнал" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, classId, from, to, nonce]);

  // Синхронизация офлайн-очереди изменила данные — перечитываем.
  useEffect(() => {
    const bump = () => setNonce((n) => n + 1);
    window.addEventListener(DATA_CHANGED_EVENT, bump);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, bump);
  }, []);

  const summary = useMemo(() => {
    const counts: Record<LoanStatus, number> = { ISSUED: 0, RETURNED: 0, LOST: 0 };
    for (const r of rows) counts[r.status]++;
    return counts;
  }, [rows]);

  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("ru-RU");

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (classId) params.set("classId", classId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/exports/journal?${params}`);
    if (!res.ok) {
      setBanner({ kind: "error", message: "Не удалось экспортировать журнал" });
      return;
    }
    await downloadCsv(res, `journal-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const [busyLoan, setBusyLoan] = useState<string | null>(null);

  const setCompensated = async (
    row: JournalRow,
    compensate: boolean
  ) => {
    const verb = compensate ? "отметить компенсированной" : "снять отметку о компенсации";
    if (!confirm(`${row.book.title}: ${verb}?`)) return;
    setBusyLoan(row.id);
    try {
      const res = await fetch(
        `/api/loans/${row.id}/compensate`,
        compensate ? { method: "POST" } : { method: "DELETE" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Ошибка операции");
      setBanner({
        kind: "success",
        message: compensate
          ? `«${row.book.title}» отмечена компенсированной.`
          : `Отметка о компенсации снята.`,
      });
      keepBannerRef.current = true;
      setNonce((n) => n + 1); // перечитать журнал (баннер сохраняем)
    } catch (e) {
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка операции",
      });
    } finally {
      setBusyLoan(null);
    }
  };

  // Ссылка на акт списания с текущими датами фильтра.
  const lossActHref = (() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    return `/print/loss-act${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <StatusBanner
        status={banner}
        onClear={() => setBanner({ kind: "info", message: null })}
      />

      <Card>
        <CardContent className="grid grid-cols-2 gap-2 p-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-2 text-base"
          >
            <option value="">Все статусы</option>
            <option value="ISSUED">Выданы</option>
            <option value="RETURNED">Возвращены</option>
            <option value="LOST">Утеряны</option>
          </select>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-2 text-base"
          >
            <option value="">Все классы</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {/* Диапазон дат — на всю ширину: двум date-инпутам тесно
              в трети строки, они выезжали за карточку. min-w-0 —
              разрешаем сжиматься ниже intrinsic-ширины. */}
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-base"
              aria-label="С даты"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-base"
              aria-label="По дату"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Всего: {rows.length}</Badge>
        <Badge variant="warning">Выданы: {summary.ISSUED}</Badge>
        <Badge variant="success">Возвращены: {summary.RETURNED}</Badge>
        <Badge variant="destructive">Утеряны: {summary.LOST}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={lossActHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input bg-card px-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" /> Акт списания
          </a>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
          >
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {!loading && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpenText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Операций по заданным фильтрам нет.</p>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li
                  key={r.id}
                  // content-visibility: браузер не рендерит строки за
                  // экраном — журнал на сотни записей скроллится плавно
                  // даже на слабом телефоне.
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 [contain-intrinsic-size:auto_72px] [content-visibility:auto]"
                >
                  <div className="w-20 shrink-0 text-xs text-muted-foreground">
                    {dateFmt(r.issuedAt)}
                  </div>
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="truncate text-sm font-medium">
                      {r.student.lastName} {r.student.firstName}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {r.student.class?.name}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.book.title}
                      {r.issuedBy && <span className="ml-1">· выдал(а) {r.issuedBy}</span>}
                      {r.returnedAt && (
                        <span className="ml-1">· возвращена {dateFmt(r.returnedAt)}</span>
                      )}
                      {r.lostAt && (
                        <span className="ml-1">· утрачена {dateFmt(r.lostAt)}</span>
                      )}
                      {r.compensatedAt && (
                        <span className="ml-1">
                          · компенсирована {dateFmt(r.compensatedAt)}
                          {r.compensatedBy ? ` (${r.compensatedBy})` : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant={STATUS_META[r.status].variant}>
                      {STATUS_META[r.status].label}
                    </Badge>
                    {r.status === "LOST" &&
                      (r.compensatedAt ? (
                        <>
                          <Badge variant="success">компенсирована</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyLoan === r.id}
                            onClick={() => setCompensated(r, false)}
                            title="Снять отметку о компенсации"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyLoan === r.id}
                          onClick={() => setCompensated(r, true)}
                        >
                          <HandCoins className="mr-1 h-3.5 w-3.5" />
                          Компенсирована
                        </Button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
