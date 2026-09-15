"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookX,
  ClipboardList,
  RotateCcw,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBanner, type Status } from "@/components/status-banner";
import { Scanner } from "@/components/scanner";
import { enqueueOp, makeOp } from "@/lib/offline-queue-browser";
import type { ClassWithDetails } from "@/lib/types";
import type { StocktakeReport } from "@/lib/stocktake";
import { BOOK_FORMATS } from "@/lib/scanner-formats";

const LS_KEY = "uchebniki:stocktake";

interface Session {
  version: 1;
  classId: string | null;
  scans: string[];
  startedAt: string;
}

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { version: 1, classId: null, scans: [], startedAt: "" };
    const s = JSON.parse(raw) as Session;
    if (s?.version !== 1 || !Array.isArray(s.scans))
      return { version: 1, classId: null, scans: [], startedAt: "" };
    return s;
  } catch {
    return { version: 1, classId: null, scans: [], startedAt: "" };
  }
}

export default function StocktakeView() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [session, setSession] = useState<Session>(() => loadSession());
  const [report, setReport] = useState<StocktakeReport | null>(null);
  const [reportKey, setReportKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [computing, setComputing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  const flash = (kind: Status["kind"], message: string) =>
    setStatus({ kind, message });

  useEffect(() => {
    fetch("/api/classes").then((r) => r.ok && r.json()).then(setClasses).catch(() => {});
  }, []);

  const currentKey = `${session.classId ?? ""}|${session.scans.length}`;
  const reportStale = report !== null && currentKey !== reportKey;

  const persist = (s: Session) => {
    setSession(s);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch {
      /* переполнение localStorage — некритично */
    }
  };

  const addScan = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const count = session.scans.filter((s) => s.replace(/[-\s]/g, "") === value.replace(/[-\s]/g, "")).length;
    const scans = [...session.scans, value];
    persist({
      ...session,
      scans,
      startedAt: session.startedAt || new Date().toISOString(),
    });
    flash(
      count > 0 ? "info" : "success",
      count > 0
        ? `«${value}» уже в списке (${count + 1}-й раз) — учтён как дубль.`
        : `Записано: ${value} (всего ${scans.length}).`
    );
  };

  const removeScan = (index: number) => {
    const scans = session.scans.filter((_, i) => i !== index);
    persist({ ...session, scans });
  };

  const clearSession = () => {
    if (session.scans.length === 0) return;
    if (!confirm(`Очистить список сканов (${session.scans.length})?`)) return;
    persist({ version: 1, classId: session.classId, scans: [], startedAt: "" });
    setReport(null);
    setReportKey("");
  };

  const fetchReport = useCallback(async () => {
    setComputing(true);
    try {
      const res = await fetch("/api/stocktake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isbn: session.scans,
          classId: session.classId ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Ошибка отчёта");
      setReport(await res.json());
      setReportKey(`${session.classId ?? ""}|${session.scans.length}`);
      flash("success", "Отчёт рассчитан.");
    } catch (e) {
      flash("error", `Не удалось построить отчёт: ${e instanceof Error ? e.message : e}`);
    } finally {
      setComputing(false);
    }
  }, [session.scans, session.classId]);

  const applyLoanAction = async (
    loanId: string,
    title: string,
    kind: "lost" | "return"
  ) => {
    if (kind === "lost" && !confirm(`Пометить «${title}» как утерянную?`)) return;
    setBusy(true);
    try {
      const res =
        kind === "lost"
          ? await fetch(`/api/loans/${loanId}`, { method: "PATCH" })
          : await fetch(`/api/loans/${loanId}/return`, { method: "PUT" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Ошибка операции");
      flash("success", kind === "lost" ? `«${title}» помечена утерянной.` : `«${title}» возвращена.`);
      fetchReport();
    } catch (e) {
      if (e instanceof TypeError) {
        enqueueOp(
          makeOp(kind, { loanId }, `«${title}»: ${kind === "lost" ? "утеряна" : "возврат"}`)
        );
        flash("info", "Нет сети: операция сохранена и будет отправлена позже.");
        return;
      }
      flash("error", e instanceof Error ? e.message : "Ошибка операции");
    } finally {
      setBusy(false);
    }
  };

  const className = classes.find((c) => c.id === session.classId)?.name;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <StatusBanner
        status={status}
        onClear={() => setStatus({ kind: "info", message: null })}
      />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" />
            Переучёт книг в башнях
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={session.classId ?? ""}
              onChange={(e) =>
                persist({ ...session, classId: e.target.value || null })
              }
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              <option value="">Вся библиотека</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setShowScanner(true)}>
              <ScanLine className="mr-1 h-3.5 w-3.5" /> Сканировать ISBN
            </Button>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                addScan(manual);
                setManual("");
              }}
            >
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Ввести ISBN вручную"
                className="h-9 w-44 rounded-md border border-input bg-card px-2 text-sm"
              />
              <Button size="sm" type="submit" variant="secondary">
                +
              </Button>
            </form>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={fetchReport} disabled={computing}>
                <RotateCcw className={computing ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} />
                Рассчитать отчёт
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={clearSession}
                disabled={session.scans.length === 0}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Очистить
              </Button>
            </div>
          </div>

          {session.scans.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Отсканировано: {session.scans.length}
                {session.startedAt && (
                  <> · с {new Date(session.startedAt).toLocaleDateString("ru-RU")}</>
                )}
                {className ? ` · охват: ${className}` : " · охват: вся библиотека"}
              </p>
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {session.scans.map((s, i) => (
                  <li key={`${i}-${s}`} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <span className="flex-1 truncate">{s}</span>
                    <button
                      onClick={() => removeScan(i)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Убрать ${s}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Сканируйте штрихкоды с обложек книг, лежащих в башнях (или вводите ISBN
              вручную). Скан сохраняется в браузере — можно продолжить позже.
            </p>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
            <CardTitle className="text-base">Отчёт</CardTitle>
            {reportStale && (
              <Badge variant="warning">
                Список менялся — пересчитайте отчёт
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>Сканы: {report.scanned}</Badge>
              {report.duplicates > 0 && (
                <Badge variant="secondary">
                  Повторные сканы: {report.duplicates}
                </Badge>
              )}
            </div>

            <ReportSection
              title="Выданы и не найдены в башне (проверка)"
              tone="info"
              count={report.issuedNotFound.length}
              empty="Нет выданных книг, отсутствующих в башне."
            >
              {report.issuedNotFound.map((l) => (
                <li key={l.loanId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.student}
                      {l.className ? ` (${l.className})` : ""} · выдана{" "}
                      {new Date(l.issuedAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => applyLoanAction(l.loanId, l.title, "lost")}
                  >
                    <BookX className="mr-1 h-3.5 w-3.5" /> Утеряна
                  </Button>
                </li>
              ))}
            </ReportSection>

            <ReportSection
              title="Найдены в башне, но в учёте «выданы»"
              tone="warning"
              count={report.scannedButIssued.length}
              empty="Возвраты зарегистрированы корректно."
            >
              {report.scannedButIssued.map((l) => (
                <li key={l.loanId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.student}
                      {l.className ? ` (${l.className})` : ""} · выдана{" "}
                      {new Date(l.issuedAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => applyLoanAction(l.loanId, l.title, "return")}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Возврат
                  </Button>
                </li>
              ))}
            </ReportSection>

            <ReportSection
              title="В учёте «в библиотеке», но не найдены"
              tone="warning"
              count={report.missingFromTowers.length}
              empty="Все книги в учёте найдены."
            >
              {report.missingFromTowers.map((b) => (
                <li key={b.bookId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.subject} · ISBN {b.isbn}
                      {b.classNames.length > 0 && ` · ${b.classNames.join(", ")}`}
                    </p>
                  </div>
                  <Badge variant="destructive">
                    не хватает {b.missing}
                    {b.expected > 1 ? ` из ${b.expected}` : ""}
                  </Badge>
                </li>
              ))}
            </ReportSection>

            <ReportSection
              title="Сканов больше, чем копий в каталоге"
              tone="warning"
              count={report.overCatalog.length}
              empty="Число сканов совпадает с каталогом."
            >
              {report.overCatalog.map((o) => (
                <li key={o.isbn} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      ISBN {o.isbn}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    сканов {o.scanned} / в каталоге {o.total}
                  </Badge>
                </li>
              ))}
            </ReportSection>

            <ReportSection
              title="Не в каталоге"
              tone="info"
              count={report.unknown.length}
              empty="Все отсканированные ISBN есть в каталоге."
            >
              {report.unknown.map((u) => (
                <li key={u.isbn} className="flex items-center gap-3 py-2.5">
                  <p className="flex-1 truncate text-sm font-medium">ISBN {u.isbn}</p>
                  {u.count > 1 && <Badge variant="secondary">×{u.count}</Badge>}
                </li>
              ))}
            </ReportSection>
          </CardContent>
        </Card>
      )}

      {showScanner && (
        <Scanner
          formats={BOOK_FORMATS}
          onScan={(text) => {
            setShowScanner(false);
            addScan(text);
          }}
          onClose={() => setShowScanner(false)}
          onError={(m) => flash("error", m)}
        />
      )}
    </div>
  );
}

function ReportSection({
  title,
  tone,
  count,
  empty,
  children,
}: {
  title: string;
  tone: "destructive" | "warning" | "info";
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  const dot =
    tone === "destructive"
      ? "bg-destructive"
      : tone === "warning"
        ? "bg-amber-500"
        : "bg-sky-500";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </div>
  );
}
