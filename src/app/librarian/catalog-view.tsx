"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Clock,
  History,
  Plus,
  Search,
  User,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBanner, type Status } from "@/components/status-banner";
import { BookCover, CoverUploader } from "@/components/book-cover";
import { cn } from "@/lib/utils";

interface CatalogBook {
  id: string;
  isbn: string;
  title: string;
  subject: string;
  /** Сколько экземпляров ещё можно выдать (GET /api/books). */
  available?: number;
  copies?: number;
  /** Сколько экземпляров списано (LOST). */
  lost?: number;
  /** Номер набора сезона (1–11); null — архив. */
  grade?: number | null;
  hasCover?: boolean;
}

interface StudentInfo {
  id: string;
  name: string;
  className: string | null;
}

interface CardData {
  book: CatalogBook;
  classes: string[];
  loans: {
    id: string;
    status: "ISSUED" | "RETURNED" | "LOST";
    issuedAt: string;
    returnedAt: string | null;
    student: StudentInfo | null;
  }[];
  pendingRequests: {
    id: string;
    comment: string | null;
    createdAt: string;
    student: StudentInfo | null;
  }[];
}

interface ClassRow {
  id: string;
  name: string;
}

interface SetBook {
  id: string;
  title: string;
  subject: string;
  isbn: string;
  grade: number | null;
}

interface BookSetRow {
  id: string;
  name: string;
  books: SetBook[];
}

const STATUS_LABEL: Record<string, { text: string; variant: "default" | "secondary" | "destructive" | "warning" }> = {
  ISSUED: { text: "Выдан", variant: "default" },
  RETURNED: { text: "Возвращён", variant: "secondary" },
  LOST: { text: "Утерян", variant: "destructive" },
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("ru-RU");

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

// Номер класса из названия: «8-А» → 8.
function classNumber(name: string): number | null {
  const m = /^\s*(\d{1,2})/.exec(name ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 11 ? n : null;
}

// Кнопка «нажми и держи»: срабатывает, если удерживать HOLD_MS.
// Отпустил раньше — сброс. Защита от случайного удаления набора.
const HOLD_MS = 4000;

function HoldToDelete({ label, onDone }: { label: string; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const fired = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const begin = () => {
    if (holding) return;
    fired.current = false;
    setHolding(true);
    startedAt.current = Date.now();
    timer.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - startedAt.current) / HOLD_MS) * 100);
      setProgress(p);
      if (p >= 100 && !fired.current) {
        fired.current = true;
        stop();
        onDone();
      }
    }, 100);
  };

  const rest = Math.max(0, (HOLD_MS * (100 - progress)) / 100 / 1000);

  return (
    <button
      type="button"
      className="relative h-11 w-full select-none overflow-hidden rounded-md border border-destructive/50 bg-destructive/10 text-sm font-medium text-destructive [-webkit-touch-callout:none]"
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className="absolute inset-y-0 left-0 bg-destructive/70 transition-[width] duration-100"
        style={{ width: `${progress}%` }}
        aria-hidden
      />
      <span className="relative">
        {holding ? `Держите… ${rest.toFixed(1)} сек` : label}
      </span>
    </button>
  );
}



type Selection = number | "archive";

export default function CatalogView() {
  const [books, setBooks] = useState<CatalogBook[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CatalogBook | null>(null);
  const [card, setCard] = useState<CardData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  // Выбранный набор (1–11) или архив.
  const [sel, setSel] = useState<Selection>(1);
  // Перемещение книги между наборами / применение набора к классу.
  const [moving, setMoving] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  // Черновики: выбор набора у архивной книги.
  const [gradeDraft, setGradeDraft] = useState<Record<string, string>>({});

  // Форма добавления учебника.
  const [addOpen, setAddOpen] = useState(false);
  const [newBook, setNewBook] = useState({ isbn: "", title: "", subject: "", copies: "1", grade: "" });
  const [adding, setAdding] = useState(false);

  // Именованные наборы: список, раскрытый набор (один за раз), формы.
  const [sets, setSets] = useState<BookSetRow[]>([]);
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState("");
  const [renameDraft, setRenameDraft] = useState<{ id: string; name: string } | null>(null);
  const [setSearch, setSetSearch] = useState("");
  const [setBusy, setSetBusy] = useState(false);

  const loadList = useCallback(async (query: string) => {
    const url = query
      ? `/api/books?q=${encodeURIComponent(query)}`
      : "/api/books";
    const r = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setBooks((r ?? []) as CatalogBook[]);
  }, []);

  useEffect(() => {
    loadList("").finally(() => setLoading(false));
    fetch("/api/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setClasses((list ?? []).map((c: ClassRow) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, [loadList]);

  // По умолчанию открываем набор с наибольшим числом учебников.
  useEffect(() => {
    if (!loading && books.length > 0 && sel === 1) {
      const counts = new Map<number, number>();
      for (const b of books) {
        if (b.grade != null) counts.set(b.grade, (counts.get(b.grade) ?? 0) + 1);
      }
      let best = 1;
      let max = 0;
      for (const [g, n] of counts) {
        if (n > max) { max = n; best = g; }
      }
      if (max > 0) setSel(best);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const search = async () => {
    setLoading(true);
    await loadList(q);
    setLoading(false);
  };

  const openCard = async (b: CatalogBook) => {
    setSelected(b);
    setCard(null);
    setCardLoading(true);
    try {
      const r = await fetch(`/api/books/${b.id}`);
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось открыть карточку");
      setCard(json as CardData);
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setCardLoading(false);
    }
  };

  // Переместить учебник в набор (grade 1–11) или в архив (null).
  const setGrade = async (b: CatalogBook, grade: number | null) => {
    setMoving(b.id);
    try {
      const r = await fetch(`/api/books/${b.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось изменить набор");
      setBooks((list) =>
        list.map((x) => (x.id === b.id ? { ...x, grade } : x))
      );
      if (selected?.id === b.id) {
        setSelected({ ...selected, grade });
        setCard((c) => (c ? { ...c, book: { ...c.book, grade } } : c));
      }
      setGradeDraft((m) => {
        const { [b.id]: _drop, ...rest } = m;
        return rest;
      });
      setStatus({
        kind: "success",
        message:
          grade == null
            ? `«${b.title}» убран в архив`
            : `«${b.title}» — в наборе ${grade} класса`,
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setMoving(null);
    }
  };

  // Применить набор ко всей параллели (все 8-е, все 5-е…).
  const applyToParallel = async (grade: number) => {
    const list = classes.filter((c) => classNumber(c.name) === grade);
    if (list.length === 0) return;
    const setSize = books.filter((b) => b.grade === grade).length;
    const names = list.map((c) => c.name).join(", ");
    const what =
      setSize > 0
        ? `Заменить чек-листы всей параллели ${grade} (${names}) набором ${grade} класса (${setSize} шт.)?`
        : `Набор ${grade} класса пуст: убрать все учебники из чек-листов параллели ${grade}?`;
    if (!confirm(what)) return;
    setApplying("parallel");
    try {
      let ok = 0;
      let lastError = "";
      for (const cls of list) {
        const r = await fetch(`/api/classes/${cls.id}/season`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade }),
        });
        const json = await r.json().catch(() => null);
        if (!r.ok) lastError = json?.error ?? "Ошибка";
        else ok++;
      }
      if (ok === 0) throw new Error(lastError || "Не удалось применить набор");
      setStatus({
        kind: "success",
        message: `Набор ${grade} класса применён к параллели: ${ok} из ${list.length} классов.`,
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setApplying(null);
    }
  };

  const addBook = async () => {
    if (!newBook.isbn.trim() || !newBook.title.trim() || !newBook.subject.trim()) {
      setStatus({ kind: "error", message: "Заполните ISBN, название и предмет." });
      return;
    }
    setAdding(true);
    try {
      const copies = Math.max(1, Math.floor(Number(newBook.copies) || 1));
      const grade = newBook.grade ? Number(newBook.grade) : null;
      const r = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newBook, copies, grade }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось добавить учебник");
      setNewBook({ isbn: "", title: "", subject: "", copies: "1", grade: newBook.grade });
      setAddOpen(false);
      if (grade != null) setSel(grade);
      setStatus({ kind: "success", message: "Учебник добавлен в каталог." });
      await loadList(q);
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setAdding(false);
    }
  };

  const countFor = (g: number) =>
    books.filter((b) => b.grade === g).length;
  const archiveCount = books.filter((b) => b.grade == null).length;

  // --- Именованные наборы ---

  const loadSets = useCallback(async () => {
    const r = await fetch("/api/sets")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setSets((r ?? []) as BookSetRow[]);
  }, []);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  // Какой набор раскрыт (книги могут повторяться в наборах — открыт
  // один за раз, выбор запоминается).
  useEffect(() => {
    const saved = localStorage.getItem("uchebniki:open-set");
    if (saved) setOpenSet(saved);
  }, []);
  useEffect(() => {
    if (openSet) localStorage.setItem("uchebniki:open-set", openSet);
  }, [openSet]);
  useEffect(() => {
    setSetSearch("");
    setRenameDraft(null);
  }, [openSet]);

  const createSet = async () => {
    const name = newSetName.trim();
    if (!name) {
      setStatus({ kind: "error", message: "Введите название набора." });
      return;
    }
    setSetBusy(true);
    try {
      const r = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось создать набор");
      setNewSetName("");
      await loadSets();
      setOpenSet(json.id);
      setStatus({ kind: "success", message: `Набор «${name}» создан.` });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setSetBusy(false);
    }
  };

  const renameSet = async (s: BookSetRow) => {
    const name = (renameDraft?.name ?? "").trim();
    if (!name || renameDraft?.id !== s.id) return;
    setSetBusy(true);
    try {
      const r = await fetch(`/api/sets/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось переименовать");
      setRenameDraft(null);
      await loadSets();
      setStatus({ kind: "success", message: `Набор переименован в «${name}».` });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setSetBusy(false);
    }
  };

  const deleteSet = async (s: BookSetRow) => {
    setSetBusy(true);
    try {
      const r = await fetch(`/api/sets/${s.id}`, { method: "DELETE" });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось удалить набор");
      if (openSet === s.id) setOpenSet(null);
      await loadSets();
      setStatus({
        kind: "success",
        message: `Набор «${s.name}» удалён. Книги остались в каталоге.`,
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setSetBusy(false);
    }
  };

  const addToSet = async (s: BookSetRow, b: CatalogBook) => {
    setSetBusy(true);
    try {
      const r = await fetch(`/api/sets/${s.id}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: b.id }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось добавить");
      const book: SetBook = {
        id: b.id,
        title: b.title,
        subject: b.subject,
        isbn: b.isbn,
        grade: b.grade ?? null,
      };
      setSets((list) =>
        list.map((x) =>
          x.id === s.id && !x.books.some((y) => y.id === b.id)
            ? { ...x, books: [...x.books, book] }
            : x
        )
      );
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setSetBusy(false);
    }
  };

  const removeFromSet = async (s: BookSetRow, bookId: string) => {
    setSetBusy(true);
    try {
      const r = await fetch(`/api/sets/${s.id}/books?bookId=${bookId}`, {
        method: "DELETE",
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось убрать книгу");
      setSets((list) =>
        list.map((x) =>
          x.id === s.id
            ? { ...x, books: x.books.filter((y) => y.id !== bookId) }
            : x
        )
      );
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setSetBusy(false);
    }
  };

  // Кандидаты на добавление в набор: книги каталога, которых в нём ещё нет.
  const setCandidates = (s: BookSetRow) => {
    const inSet = new Set(s.books.map((b) => b.id));
    const q = setSearch.trim().toLowerCase();
    return books
      .filter((b) => !inSet.has(b.id))
      .filter(
        (b) =>
          !q ||
          b.title.toLowerCase().includes(q) ||
          b.subject.toLowerCase().includes(q) ||
          b.isbn.toLowerCase().includes(q)
      )
      .slice(0, 20);
  };

  const visible = books.filter((b) =>
    sel === "archive" ? b.grade == null : b.grade === sel
  );

  // Классы выбранного числа: «8» → 8-А, 8-Б.
  const assignClasses =
    sel === "archive"
      ? []
      : classes.filter((c) => classNumber(c.name) === sel);

  const issuedNow = card?.loans.filter((l) => l.status === "ISSUED") ?? [];
  const history = (card?.loans ?? []).filter((l) => l.status !== "ISSUED");

  return (
    <div className="space-y-4">
      <StatusBanner
        status={status}
        onClear={() => setStatus({ kind: "info", message: null })}
      />

      {/* Добавление учебников — без администратора */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Новый учебник
          </CardTitle>
          <Button
            variant={addOpen ? "outline" : "default"}
            className="mt-2 h-12 w-full text-base"
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? "Свернуть" : "Добавить учебник"}
          </Button>
        </CardHeader>
        {addOpen && (
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nb-isbn">ISBN</Label>
              <Input
                id="nb-isbn"
                value={newBook.isbn}
                onChange={(e) => setNewBook((s) => ({ ...s, isbn: e.target.value }))}
                placeholder="Штрихкод на обороте"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-title">Название</Label>
              <Input
                id="nb-title"
                value={newBook.title}
                onChange={(e) => setNewBook((s) => ({ ...s, title: e.target.value }))}
                placeholder="Математика, 5 класс"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-subject">Предмет</Label>
              <Input
                id="nb-subject"
                value={newBook.subject}
                onChange={(e) => setNewBook((s) => ({ ...s, subject: e.target.value }))}
                placeholder="Математика"
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nb-copies">Экземпляров</Label>
                <Input
                  id="nb-copies"
                  type="number"
                  min={1}
                  value={newBook.copies}
                  onChange={(e) => setNewBook((s) => ({ ...s, copies: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nb-grade">Набор</Label>
                <select
                  id="nb-grade"
                  value={newBook.grade}
                  onChange={(e) => setNewBook((s) => ({ ...s, grade: e.target.value }))}
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Без набора</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g} класс
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              className="h-12 w-full text-base"
              disabled={adding}
              onClick={addBook}
            >
              {adding ? "Добавляем…" : "Добавить в каталог"}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Наборы на сезон: свой набор у каждого числа класса */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Наборы на учебный год</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            У каждого числа класса свой набор. Кнопкой ниже набор назначается классу.
          </p>
          <div className="mt-2 grid grid-cols-6 gap-1">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSel(g)}
                className={cn(
                  "flex h-12 flex-col items-center justify-center rounded-md border text-sm transition-colors",
                  sel === g
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted/60"
                )}
              >
                <span className="font-semibold leading-none">{g}</span>
                <span className="mt-0.5 text-[10px] leading-none opacity-80">
                  {countFor(g)}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSel("archive")}
              className={cn(
                "col-span-5 flex h-12 items-center justify-center gap-1 rounded-md border text-sm transition-colors",
                sel === "archive"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted/60"
              )}
            >
              Архив · {archiveCount}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {sel !== "archive" ? (
            <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Параллель {sel}: {assignClasses.length > 0
                  ? assignClasses.map((c) => c.name).join(", ")
                  : "классов нет"}
              </p>
              <Button
                className="mt-2 h-12 w-full text-base"
                disabled={applying !== null || assignClasses.length === 0}
                onClick={() => applyToParallel(sel)}
              >
                {applying === "parallel"
                  ? "Применяем…"
                  : `Назначить набор всем ${sel}-м`}
              </Button>
            </div>
          ) : (
            <p className="mb-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Вне наборов: не выдаются и не видны ученикам. Чтобы вернуть учебник в набор, выберите число класса в его строке.
            </p>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название, предмет или ISBN…"
              className="h-11 flex-1"
            />
            <Button type="submit" className="h-11" disabled={loading}>
              Найти
            </Button>
          </form>

          <ul className="mt-3 divide-y divide-border">
            {loading && (
              <li className="py-3 text-sm text-muted-foreground">Загрузка…</li>
            )}
            {!loading && visible.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                {sel === "archive"
                  ? "Архив пуст."
                  : `В наборе ${sel} класса пока нет учебников.`}
              </li>
            )}
            {!loading &&
              visible.map((b) => {
                const archived = b.grade == null;
                return (
                  <li key={b.id} className="flex items-center gap-2 py-1">
                    <button
                      type="button"
                      onClick={() => openCard(b)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/60",
                        selected?.id === b.id && "bg-muted",
                        archived && "opacity-60"
                      )}
                    >
                      <BookCover bookId={b.id} title={b.title} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {b.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {b.subject} · <span className="font-mono">{b.isbn}</span>
                        </span>
                      </span>
                      {archived ? (
                        <Badge variant="outline" className="shrink-0">
                          архив
                        </Badge>
                      ) : (
                        typeof b.available === "number" &&
                        (b.available === 0 ? (
                          <Badge variant="destructive" className="shrink-0">
                            нет в наличии
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            {b.available} в наличии
                          </Badge>
                        ))
                      )}
                    </button>
                    {archived ? (
                      <>
                        <select
                          value={gradeDraft[b.id] ?? ""}
                          onChange={(e) =>
                            setGradeDraft((m) => ({ ...m, [b.id]: e.target.value }))
                          }
                          className="h-11 w-20 shrink-0 rounded-md border border-input bg-card px-2 text-sm"
                          aria-label={`Набор для «${b.title}»`}
                        >
                          <option value="">класс</option>
                          {GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          className="h-11 shrink-0 px-3"
                          disabled={moving === b.id || !gradeDraft[b.id]}
                          onClick={() => setGrade(b, Number(gradeDraft[b.id]))}
                        >
                          {moving === b.id ? "…" : "В набор"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0 px-3"
                        disabled={moving === b.id}
                        onClick={() => setGrade(b, null)}
                      >
                        {moving === b.id ? "…" : "Убрать"}
                      </Button>
                    )}
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>

      {/* Свои наборы: именованные группировки книг */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Свои наборы</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Любые группы учебников. Открыт один набор за раз.
          </p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createSet();
            }}
          >
            <Input
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="Например: Гуманитарные"
              className="h-11 flex-1"
              maxLength={40}
            />
            <Button type="submit" className="h-11" disabled={setBusy}>
              Создать
            </Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-2">
          {sets.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              Наборов пока нет.
            </p>
          )}
          {sets.map((s) => {
            const open = openSet === s.id;
            return (
              <div key={s.id} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setOpenSet(open ? null : s.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {s.name}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {s.books.length}
                  </Badge>
                </button>

                {open && (
                  <div className="space-y-3 border-t border-border p-3">
                    {/* Книги набора */}
                    <ul className="divide-y divide-border">
                      {s.books.length === 0 && (
                        <li className="py-2 text-sm text-muted-foreground">
                          Пусто. Добавьте учебники ниже.
                        </li>
                      )}
                      {s.books.map((b) => (
                        <li key={b.id} className="flex items-center gap-2 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {b.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {b.subject} ·{" "}
                              {b.grade != null ? `${b.grade} кл.` : "архив"}
                            </span>
                          </span>
                          <Button
                            variant="outline"
                            className="h-9 shrink-0 px-3 text-xs"
                            disabled={setBusy}
                            onClick={() => removeFromSet(s, b.id)}
                          >
                            Убрать
                          </Button>
                        </li>
                      ))}
                    </ul>

                    {/* Добавление книг */}
                    <div>
                      <Label htmlFor={`set-search-${s.id}`}>
                        Добавить учебники
                      </Label>
                      <Input
                        id={`set-search-${s.id}`}
                        value={setSearch}
                        onChange={(e) => setSetSearch(e.target.value)}
                        placeholder="Поиск по каталогу…"
                        className="mt-1.5 h-11"
                      />
                      <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                        {setCandidates(s).length === 0 && (
                          <li className="px-2 py-2 text-sm text-muted-foreground">
                            Ничего не найдено.
                          </li>
                        )}
                        {setCandidates(s).map((b) => (
                          <li
                            key={b.id}
                            className="flex items-center gap-2 px-2 py-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">
                                {b.title}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {b.subject} ·{" "}
                                {b.grade != null ? `${b.grade} кл.` : "архив"}
                              </span>
                            </span>
                            <Button
                              className="h-9 shrink-0 px-3"
                              disabled={setBusy}
                              onClick={() => addToSet(s, b)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Переименование и удаление */}
                    {renameDraft?.id === s.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={renameDraft.name}
                          onChange={(e) =>
                            setRenameDraft({ id: s.id, name: e.target.value })
                          }
                          className="h-11 flex-1"
                          maxLength={40}
                        />
                        <Button
                          className="h-11"
                          disabled={setBusy}
                          onClick={() => renameSet(s)}
                        >
                          Сохранить
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => setRenameDraft(null)}
                        >
                          Отмена
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="h-11 w-full"
                        disabled={setBusy}
                        onClick={() => setRenameDraft({ id: s.id, name: s.name })}
                      >
                        Переименовать
                      </Button>
                    )}
                    <HoldToDelete
                      label="Удалить набор — держать 4 сек"
                      onDone={() => deleteSet(s)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              {selected.title}
              <Badge variant="secondary">{selected.subject}</Badge>
              {selected.grade != null ? (
                <Badge variant="outline">набор {selected.grade} класса</Badge>
              ) : (
                <Badge variant="outline">архив</Badge>
              )}
              {card && card.classes.length > 0 && (
                <Badge variant="outline">{card.classes.join(", ")}</Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              ISBN <span className="font-mono">{selected.isbn}</span>
              {card && (
                <span className="ml-2">
                  · экземпляров: {card.book.copies ?? selected.copies ?? 1}
                  {(card.book.lost ?? 0) > 0 &&
                    ` · утеряно: ${card.book.lost}`}
                  {" · "}
                  <span
                    className={
                      (card.book.available ?? 0) === 0
                        ? "font-medium text-destructive"
                        : "font-medium"
                    }
                  >
                    в наличии: {card.book.available ?? 0}
                  </span>
                </span>
              )}
            </p>
            {selected.grade == null && (
              <p className="mt-1 text-xs text-warning-foreground">
                Вне наборов. Выданные раньше экземпляры видны в долгах до возврата.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {cardLoading && (
              <p className="py-4 text-sm text-muted-foreground">Загрузка…</p>
            )}
            {!cardLoading && card && (
              <div className="space-y-4">
                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <User className="h-3.5 w-3.5 text-primary" />
                    Сейчас выданы ({issuedNow.length})
                  </h4>
                  {issuedNow.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Все копии в библиотеке.
                    </p>
                  ) : (
                    <ul className="mt-1 divide-y divide-border">
                      {issuedNow.map((l) => (
                        <li key={l.id} className="flex items-center gap-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {l.student?.name ?? "—"}
                            {l.student?.className
                              ? ` · ${l.student.className}`
                              : ""}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            с {fmt(l.issuedAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Ожидают (заявки)
                  </h4>
                  {card.pendingRequests.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Нет ожидающих заявок.
                    </p>
                  ) : (
                    <ul className="mt-1 divide-y divide-border">
                      {card.pendingRequests.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {r.student?.name ?? "—"}
                            {r.student?.className
                              ? ` · ${r.student.className}`
                              : ""}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {fmt(r.createdAt)}
                            {r.comment ? ` · «${r.comment}»` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Выполнить или отклонить — во вкладке «Заявки».
                  </p>
                </div>

                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <History className="h-3.5 w-3.5 text-primary" />
                    Последние возвраты
                  </h4>
                  {history.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      История пуста.
                    </p>
                  ) : (
                    <ul className="mt-1 divide-y divide-border">
                      {history.map((l) => {
                        const s = STATUS_LABEL[l.status] ?? {
                          text: l.status,
                          variant: "secondary" as const,
                        };
                        return (
                          <li key={l.id} className="flex items-center gap-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {l.student?.name ?? "—"}
                              {l.student?.className
                                ? ` · ${l.student.className}`
                                : ""}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {fmt(l.issuedAt)}
                              {l.returnedAt ? ` → ${fmt(l.returnedAt)}` : ""}
                            </span>
                            <Badge variant={s.variant}>{s.text}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
