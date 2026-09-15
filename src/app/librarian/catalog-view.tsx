"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Pencil, Plus, Search, X } from "lucide-react";
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
import { BookCover } from "@/components/book-cover";
import { BookEditor, type BookRow, type BookUpdated } from "@/components/book-editor";
import { cn } from "@/lib/utils";
import { useIsWide } from "@/lib/use-is-wide";

/**
 * Каталог + наборы.
 *
 * Два экрана из одного: на мониторе (lg+) это двухколонник «список ↔
 * предпросмотр книги» — обложка, поля, тираж, набор сезона и «кому на
 * руках» правятся, не теряя список из виду; на телефоне тот же
 * предпросмотр открывается шторкой поверх списка. Раньше карточка книги
 * дорисовывалась ПОСЛЕ всего списка, и чтобы её увидеть, нужно было
 * скроллить до конца страницы.
 *
 * Поиск/фильтр — по уже загруженному каталогу, без запроса на каждое
 * нажатие кнопки «Найти»: каталог школы целиком лежит в состоянии, а
 * сетевой поиск стоил секунды на слабых каналах.
 */

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

interface ClassRow {
  id: string;
  name: string;
}

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
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  // Учебник в предпросмотре: справа (монитор) или шторкой (телефон).
  const [selected, setSelected] = useState<CatalogBook | null>(null);
  const wide = useIsWide();

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
  // Классы, выбранные для «добавить набор в чек-листы».
  const [applyTo, setApplyTo] = useState<Set<string>>(new Set());

  const loadList = useCallback(async () => {
    const r = await fetch("/api/books")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setBooks((r ?? []) as CatalogBook[]);
  }, []);

  useEffect(() => {
    loadList().finally(() => setLoading(false));
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

  const matchesQuery = useCallback(
    (b: { title: string; subject: string; isbn: string }) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return (
        b.title.toLowerCase().includes(needle) ||
        b.subject.toLowerCase().includes(needle) ||
        b.isbn.toLowerCase().includes(needle)
      );
    },
    [q]
  );

  const openCard = (b: CatalogBook) => setSelected(b);
  const closeCard = () => setSelected(null);

  // Шторка на телефоне: страница под ней не скроллится; Escape закрывает.
  useEffect(() => {
    if (!selected || wide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected, wide]);

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
      setBooks((list) => list.map((x) => (x.id === b.id ? { ...x, grade } : x)));
      if (selected?.id === b.id) setSelected({ ...selected, grade });
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

  // Применить набор сезона ко всей параллели (все 8-е, все 5-е…).
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
      await loadList();
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setAdding(false);
    }
  };

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of books) {
      if (b.grade == null) continue;
      m.set(b.grade, (m.get(b.grade) ?? 0) + 1);
    }
    return m;
  }, [books]);

  const countFor = (g: number) => counts.get(g) ?? 0;
  const archiveCount = useMemo(() => books.filter((b) => b.grade == null).length, [books]);

  const visible = useMemo(
    () =>
      books
        .filter((b) => (sel === "archive" ? b.grade == null : b.grade === sel))
        .filter(matchesQuery),
    [books, sel, matchesQuery]
  );

  // Классы выбранного числа: «8» → 8-А, 8-Б.
  const assignClasses =
    sel === "archive" ? [] : classes.filter((c) => classNumber(c.name) === sel);

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
    setApplyTo(new Set());
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

  // Учебник исправили в предпросмотре — синхронизируем и строки каталога,
  // и содержимое наборов (иначе в наборе висело бы старое название).
  const applyEdit = (next: BookUpdated) => {
    setBooks((list) => list.map((x) => (x.id === next.id ? { ...x, ...next } : x)));
    setSets((list) =>
      list.map((s) => ({
        ...s,
        books: s.books.map((b) =>
          b.id === next.id
            ? { ...b, title: next.title, subject: next.subject, isbn: next.isbn, grade: next.grade }
            : b
        ),
      }))
    );
    setSelected((cur) => (cur && cur.id === next.id ? { ...cur, ...next } : cur));
  };

  const removeBook = (id: string) => {
    setBooks((list) => list.filter((x) => x.id !== id));
    setSets((list) =>
      list.map((s) => ({ ...s, books: s.books.filter((b) => b.id !== id) }))
    );
    setSelected((cur) => (cur?.id === id ? null : cur));
    setStatus({ kind: "success", message: "Учебник удалён из каталога." });
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
    const needle = setSearch.trim().toLowerCase();
    return books
      .filter((b) => !inSet.has(b.id))
      .filter(matchesQuery)
      .filter(
        (b) =>
          !needle ||
          b.title.toLowerCase().includes(needle) ||
          b.subject.toLowerCase().includes(needle) ||
          b.isbn.toLowerCase().includes(needle)
      )
      .slice(0, 30);
  };

  const toggleApplyClass = (id: string) => {
    setApplyTo((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pushSetToClasses = async (s: BookSetRow) => {
    const ids = [...applyTo];
    if (ids.length === 0) return;
    const names = classes
      .filter((c) => ids.includes(c.id))
      .map((c) => c.name)
      .join(", ");
    if (
      !confirm(
        `Добавить ${s.books.length} учебников набора «${s.name}» в чек-листы: ${names}?`
      )
    )
      return;
    setApplying(s.id);
    try {
      const r = await fetch(`/api/sets/${s.id}/apply-to-classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: ids }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось добавить набор");
      setStatus({
        kind: "success",
        message: `«${s.name}» → ${names}: добавлено привязок ${json?.added ?? 0}.`,
      });
      setApplyTo(new Set());
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setApplying(null);
    }
  };

  const currentSet = sets.find((s) => s.id === openSet) ?? null;

  const editor = selected ? (
    <BookEditor
      key={selected.id}
      book={selected as BookRow}
      onUpdated={applyEdit}
      onDeleted={removeBook}
      canDelete={false}
      onClose={wide ? undefined : closeCard}
      className={wide ? "max-h-[calc(100dvh-2.5rem)] overflow-y-auto" : undefined}
    />
  ) : null;

  const hint = (
    <div className="rounded-xl border border-dashed border-border p-5 text-center">
      <p className="text-sm font-medium">Предпросмотр учебника</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Нажмите на строку в списке слева: здесь появятся обложка, название,
        штрихкод, тираж и то, кому книга сейчас выдана — и всё это можно
        править на месте, не закрывая список.
      </p>
    </div>
  );

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
      {/* ================= ЛЕВАЯ КОЛОНКА: списки ================= */}
      <div className="space-y-4 lg:min-w-0">
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
              className="mt-2 h-12 w-full text-base lg:h-11 lg:text-sm"
              onClick={() => setAddOpen((v) => !v)}
            >
              {addOpen ? "Свернуть" : "Добавить учебник"}
            </Button>
          </CardHeader>
          {addOpen && (
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
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
                  <Label htmlFor="nb-subject">Предмет</Label>
                  <Input
                    id="nb-subject"
                    value={newBook.subject}
                    onChange={(e) => setNewBook((s) => ({ ...s, subject: e.target.value }))}
                    placeholder="Математика"
                    className="h-11"
                  />
                </div>
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
                    className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
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
                className="h-12 w-full text-base lg:h-11 lg:text-sm"
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
            <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-6">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSel(g)}
                  aria-current={sel === g ? "true" : undefined}
                  className={cn(
                    "flex h-12 flex-col items-center justify-center rounded-md border transition-colors",
                    sel === g
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted/60"
                  )}
                >
                  <span className="num text-[15px] font-semibold leading-none">{g}</span>
                  <span className="num mt-0.5 text-[10px] leading-none opacity-80">
                    {countFor(g)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSel("archive")}
                aria-current={sel === "archive" ? "true" : undefined}
                className={cn(
                  "col-span-2 flex h-12 flex-col items-center justify-center rounded-md border transition-colors sm:col-span-1",
                  sel === "archive"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted/60"
                )}
              >
                <span className="text-sm font-medium leading-none">Архив</span>
                <span className="num mt-0.5 text-[10px] leading-none opacity-80">
                  {archiveCount}
                </span>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {sel !== "archive" ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Параллель {sel}:</span>{" "}
                  {assignClasses.length > 0
                    ? assignClasses.map((c) => c.name).join(", ")
                    : "классов нет"}
                </p>
                <Button
                  className="h-11 shrink-0"
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
                Вне наборов: не выдаются и не видны ученикам. Чтобы вернуть
                учебник в набор, выберите число класса в его строке.
              </p>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Фильтр: название, предмет или ISBN…"
                aria-label="Фильтр учебников"
                className="h-11 pl-9 pr-10"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Очистить фильтр"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Строк в списке: {visible.length}
              {q ? " (с фильтром)" : ""}
            </p>

            <ul className="cv-rows mt-2 divide-y divide-border">
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
                    <li
                      key={b.id}
                      className={cn(
                        "flex items-center gap-1 py-0.5 transition-colors",
                        selected?.id === b.id && "bg-primary/5"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openCard(b)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60",
                          archived && "opacity-70"
                        )}
                      >
                        {/* Превью у КАЖДОЙ строки: с обложкой список
                            читается как полки, а не как таблица — и
                            ошибиться строкой сложнее. */}
                        <BookCover bookId={b.id} title={b.title} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {b.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {b.subject} · <span className="font-mono">{b.isbn}</span>
                            {typeof b.available === "number" && (
                              <span
                                className={cn(
                                  "num ml-1",
                                  b.available === 0 ? "font-medium text-destructive" : ""
                                )}
                              >
                                · {b.available} из {b.copies ?? 1}
                              </span>
                            )}
                          </span>
                        </span>
                        <Pencil className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
                      </button>
                      {archived ? (
                        <>
                          <Badge variant="outline" className="shrink-0">
                            архив
                          </Badge>
                          <select
                            value={gradeDraft[b.id] ?? ""}
                            onChange={(e) =>
                              setGradeDraft((m) => ({ ...m, [b.id]: e.target.value }))
                            }
                            className="h-11 w-20 shrink-0 rounded-lg border border-input bg-card px-2 text-base"
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
                          {moving === b.id ? "…" : "В архив"}
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" />
              Свои наборы
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Любые группы учебников: собрали один раз — добавляете в классы
              одной кнопкой. Открыт один набор за раз.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Выбор набора — чипы вместо аккордеона: все наборы и их
                размеры видны сразу, переключение одним кликом. */}
            <div className="flex flex-wrap gap-1.5">
              {sets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setOpenSet(openSet === s.id ? null : s.id)}
                  aria-current={openSet === s.id ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                    openSet === s.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted/60"
                  )}
                >
                  <span className="max-w-[12rem] truncate font-medium">{s.name}</span>
                  <span className="num text-xs opacity-80">{s.books.length}</span>
                </button>
              ))}
              {sets.length === 0 && (
                <p className="py-1 text-sm text-muted-foreground">
                  Наборов пока нет — создайте первый.
                </p>
              )}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                createSet();
              }}
            >
              <Input
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="Например: Гуманитарные"
                aria-label="Название нового набора"
                className="h-11 flex-1"
                maxLength={40}
              />
              <Button type="submit" className="h-11 shrink-0" disabled={setBusy}>
                <Plus className="mr-1 h-4 w-4" />
                Создать
              </Button>
            </form>

            {currentSet && (
              <div className="rounded-lg border border-border p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {renameDraft?.id === currentSet.id ? (
                    <>
                      <Input
                        value={renameDraft.name}
                        onChange={(e) =>
                          setRenameDraft({ id: currentSet.id, name: e.target.value })
                        }
                        className="h-10 min-w-[8rem] flex-1"
                        maxLength={40}
                        aria-label="Новое название набора"
                      />
                      <Button className="h-10" disabled={setBusy} onClick={() => renameSet(currentSet)}>
                        Сохранить
                      </Button>
                      <Button variant="outline" className="h-10" onClick={() => setRenameDraft(null)}>
                        Отмена
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                        {currentSet.name}
                        <span className="num ml-2 text-xs font-normal text-muted-foreground">
                          {currentSet.books.length} учебн.
                        </span>
                      </p>
                      <Button
                        variant="outline"
                        className="h-10 px-2.5 text-xs"
                        onClick={() =>
                          setRenameDraft({ id: currentSet.id, name: currentSet.name })
                        }
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Переименовать
                      </Button>
                    </>
                  )}
                </div>

                {/* Два стола: что в наборе | что в него добавить. На
                    мониторе — рядом, книгу видно с обеих сторон сразу. */}
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="min-w-0">
                    <p className="eyebrow mb-1.5 text-muted-foreground">
                      В наборе ({currentSet.books.length})
                    </p>
                    <ul className="cv-rows max-h-[22rem] divide-y divide-border overflow-y-auto rounded-md border border-border lg:max-h-[26rem]">
                      {currentSet.books.length === 0 && (
                        <li className="px-2 py-3 text-sm text-muted-foreground">
                          Пусто. Добавьте учебники справа.
                        </li>
                      )}
                      {currentSet.books.map((b) => (
                        <li key={b.id} className="flex items-center gap-2 px-2 py-2">
                          <BookCover bookId={b.id} title={b.title} />
                          <button
                            type="button"
                            onClick={() => {
                              const row = books.find((x) => x.id === b.id);
                              if (row) openCard(row);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm font-medium">
                              {b.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {b.subject} · {b.grade != null ? `${b.grade} кл.` : "архив"}
                            </span>
                          </button>
                          <Button
                            variant="outline"
                            className="h-9 shrink-0 px-2.5 text-xs"
                            disabled={setBusy}
                            onClick={() => removeFromSet(currentSet, b.id)}
                          >
                            Убрать
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="min-w-0">
                    <Label htmlFor="set-add-search" className="eyebrow text-muted-foreground">
                      Добавить из каталога
                    </Label>
                    <Input
                      id="set-add-search"
                      value={setSearch}
                      onChange={(e) => setSetSearch(e.target.value)}
                      placeholder="Название, предмет или ISBN…"
                      className="mt-1.5 h-11"
                    />
                    <ul className="cv-rows mt-2 max-h-[19rem] divide-y divide-border overflow-y-auto rounded-md border border-border lg:max-h-[26rem]">
                      {setCandidates(currentSet).length === 0 && (
                        <li className="px-2 py-2 text-sm text-muted-foreground">
                          Ничего не найдено.
                        </li>
                      )}
                      {setCandidates(currentSet).map((b) => (
                        <li key={b.id} className="flex items-center gap-2 px-2 py-2">
                          <BookCover bookId={b.id} title={b.title} />
                          <button
                            type="button"
                            onClick={() => openCard(b)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm">{b.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {b.subject} · {b.grade != null ? `${b.grade} кл.` : "архив"}
                            </span>
                          </button>
                          <Button
                            className="h-9 w-9 shrink-0 p-0"
                            aria-label={`Добавить «${b.title}» в набор`}
                            disabled={setBusy}
                            onClick={() => addToSet(currentSet, b)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Чек-листы классов: набор добавляется в выбранные классы */}
                {classes.length > 0 && (
                  <div className="mt-3 rounded-md bg-muted/40 p-2.5">
                    <p className="eyebrow mb-1.5 text-muted-foreground">
                      Добавить набор в чек-листы классов
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {classes.map((c) => {
                        const on = applyTo.has(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleApplyClass(c.id)}
                            aria-pressed={on}
                            className={cn(
                              "h-9 rounded-md border px-2.5 text-sm transition-colors",
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card hover:bg-muted/60"
                            )}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      className="mt-2 h-11 w-full sm:w-auto"
                      disabled={
                        applyTo.size === 0 ||
                        applying !== null ||
                        currentSet.books.length === 0
                      }
                      onClick={() => pushSetToClasses(currentSet)}
                    >
                      {applying === currentSet.id
                        ? "Добавляем…"
                        : `Добавить в выбранные (${applyTo.size})`}
                    </Button>
                  </div>
                )}

                <div className="mt-3">
                  <HoldToDelete
                    label="Удалить набор — держать 4 сек"
                    onDone={() => deleteSet(currentSet)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ ПРАВАЯ КОЛОНКА (монитор): предпросмотр и правка ============
          Один и тот же BookEditor, но в разных местах: на широком экране —
          колонка рядом со списком, на телефоне — шторка. Держим это
          раздельно, иначе компонент жил бы в двух экземплярах и грузил
          карточку дважды. */}
      <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
        {wide && editor ? editor : hint}
      </aside>

      {!wide && editor}
    </div>
  );
}
