"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookX, CheckCheck, Download, ListFilter, User } from "lucide-react";
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
import {
  enqueueOp,
  makeOp,
  DATA_CHANGED_EVENT,
} from "@/lib/offline-queue-browser";
import type { Book, ClassWithDetails } from "@/lib/types";

interface DebtStudent {
  id: string;
  lastName: string;
  firstName: string;
  qrToken: string | null;
  classId: string | null;
  class: { id: string; name: string } | null;
}

interface DebtItem {
  loanId: string;
  issuedAt: string;
  student: DebtStudent;
  book: { id: string; isbn: string; title: string; subject: string };
}

export default function DebtsView() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  const flash = (kind: Status["kind"], message: string) =>
    setStatus({ kind, message });

  const loadDebts = useCallback(async () => {
    const params = new URLSearchParams();
    if (classId) params.set("classId", classId);
    if (subject) params.set("subject", subject);
    const res = await fetch(`/api/reports/debts?${params}`);
    if (res.ok) setDebts(await res.json());
    else flash("error", "Не удалось загрузить отчёт");
  }, [classId, subject]);

  useEffect(() => {
    // r.ok ? … : [] — не r.ok && r.json(): на 401 (сессия истекла) это
    // вернуло бы false в useState, и classes.map и classes.find упали бы на пустом
    // экране. Список справочников пустой — отчёт всё равно читаем.
    fetch("/api/classes").then((r) => (r.ok ? r.json() : [])).then(setClasses).catch(() => {});
    fetch("/api/books").then((r) => (r.ok ? r.json() : [])).then(setBooks).catch(() => {});
    loadDebts().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  const subjects = useMemo(
    () => [...new Set(books.map((b) => b.subject))].sort((a, b) => a.localeCompare(b, "ru")),
    [books]
  );

  const byStudent = useMemo(() => {
    const map = new Map<string, { student: DebtStudent; items: DebtItem[] }>();
    for (const d of debts) {
      const key = d.student.id;
      if (!map.has(key)) map.set(key, { student: d.student, items: [] });
      map.get(key)!.items.push(d);
    }
    return [...map.values()].sort(
      (a, b) =>
        (a.student.class?.name ?? "zzz").localeCompare(b.student.class?.name ?? "zzz", "ru") ||
        a.student.lastName.localeCompare(b.student.lastName, "ru")
    );
  }, [debts]);

  const byClass = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of debts) {
      const name = d.student.class?.name ?? "Без класса";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [debts]);

  const studentLabel = (s: DebtStudent) => `${s.lastName} ${s.firstName}`;

  const returnLoan = async (
    loanId: string,
    title: string,
    student: DebtStudent
  ): Promise<"applied" | "queued"> => {
    try {
      const res = await fetch(`/api/loans/${loanId}/return`, { method: "PUT" });
      if (!res.ok) throw new Error("Не удалось оформить возврат");
      flash("success", `«${title}» возвращена.`);
      loadDebts();
      return "applied";
    } catch (e) {
      // Сетевой сбой (fetch бросает TypeError) — в очередь.
      if (e instanceof TypeError) {
        enqueueOp(
          makeOp("return", { loanId }, `${studentLabel(student)} — ${title}: возврат`)
        );
        flash("info", "Нет сети: возврат сохранён и будет отправлен позже.");
        return "queued";
      }
      throw e;
    }
  };

  const markLost = async (loanId: string, title: string, student: DebtStudent) => {
    if (!confirm(`Пометить «${title}» как утерянную? Выдача будет закрыта со статусом «Утеряно».`))
      return;
    try {
      const res = await fetch(`/api/loans/${loanId}`, { method: "PATCH" });
      if (!res.ok) {
        // Причина с сервера важнее общей фразы: «выдача уже закрыта» (409 —
        // возврат оформили, пока окно было открыто) выглядит как отказ
        // программы, если показывать просто «не удалось».
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Не удалось пометить как утерянную");
      }
      flash("success", `«${title}» помечена утерянной.`);
      loadDebts();
    } catch (e) {
      if (e instanceof TypeError) {
        enqueueOp(
          makeOp("lost", { loanId }, `${studentLabel(student)} — ${title}: утеряна`)
        );
        flash("info", "Нет сети: операция сохранена и будет отправлена позже.");
        return;
      }
      throw e;
    }
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (classId) params.set("classId", classId);
    if (subject) params.set("subject", subject);
    const res = await fetch(`/api/exports/debts?${params}`);
    if (!res.ok) {
      flash("error", "Не удалось экспортировать отчёт");
      return;
    }
    await downloadCsv(res, `debts-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const returnAllFor = async (items: DebtItem[]) => {
    setBusy(true);
    try {
      let failed = 0;
      let queued = 0;
      for (const it of items) {
        try {
          if ((await returnLoan(it.loanId, it.book.title, it.student)) === "queued") {
            queued++;
          }
        } catch {
          failed++;
        }
      }
      if (failed === 0 && queued > 0) {
        flash("info", `Сохранено в очередь (нет сети): ${queued} из ${items.length}.`);
      } else if (failed > 0) {
        flash("error", `Не все возвраты оформлены (ошибок: ${failed}).`);
      }
    } finally {
      setBusy(false);
    }
  };

  // После синхронизации офлайн-очереди долги могли измениться.
  useEffect(() => {
    const reload = () => loadDebts();
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
  }, [loadDebts]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <StatusBanner
        status={status}
        onClear={() => setStatus({ kind: "info", message: null })}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
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
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-2 text-base"
          >
            <option value="">Все предметы</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Долгов: <b className="text-foreground">{debts.length}</b>
            </span>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Пояснение для сотрудника: что значит каждая кнопка */}
      <p className="text-sm text-muted-foreground">
        «Возврат» — ученик отдал книгу. «Утеряна» — книги нет и ученик её
        компенсирует.
      </p>

      {byClass.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byClass.map(([name, count]) => (
            <Badge key={name} variant="warning">
              {name}: {count}
            </Badge>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {!loading && byStudent.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <BookX className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              Долгов нет — все книги возвращены. 🎉
            </p>
          </CardContent>
        </Card>
      )}

      {/* .cv-rows — строки вне экрана не рисуются: на «долгах» конца
          года это сотни карточек, и на слабом телефоне список иначе
          подлагивает при скролле. */}
      <div className="cv-rows space-y-2">
      {byStudent.map(({ student, items }) => (
        <Card key={student.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-semibold">
                  {student.lastName} {student.firstName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {student.class ? `Класс ${student.class.name}` : "Без класса"} ·{" "}
                  {items.length} книг
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {student.qrToken && (
                <Link
                  href={`/student?qr=${student.qrToken}`}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-primary hover:bg-primary/5"
                >
                  Кабинет
                </Link>
              )}
              <Button
                disabled={busy}
                onClick={() => returnAllFor(items)}
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" /> Всё вернуть
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {items.map((d) => (
                <li key={d.loanId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{d.book.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.book.subject} · <span className="num">выдана {new Date(d.issuedAt).toLocaleDateString("ru-RU")}</span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="h-10"
                    disabled={busy}
                    onClick={() => returnLoan(d.loanId, d.book.title, d.student)}
                  >
                    Возврат
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-10 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => markLost(d.loanId, d.book.title, d.student)}
                  >
                    <BookX className="mr-1 h-3.5 w-3.5" /> Утеряна
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      </div>
    </div>
  );
}
