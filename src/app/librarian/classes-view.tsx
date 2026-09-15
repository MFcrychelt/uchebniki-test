"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  GraduationCap,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBanner, type Status } from "@/components/status-banner";
import { BookCover } from "@/components/book-cover";
import { cn } from "@/lib/utils";
import type { Book, ClassWithDetails } from "@/lib/types";

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

function classNumber(name: string): number | null {
  const m = /^\s*(\d{1,2})/.exec(name ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 11 ? n : null;
}

type DragPayload =
  | { kind: "named"; id: string; name: string }
  | { kind: "season"; grade: number };

type DragState = {
  payload: DragPayload;
  x: number;
  y: number;
  overId: string | null;
};

const HOLD_MS = 380;
const MOVE_CANCEL = 14;

function payloadKey(p: DragPayload) {
  return p.kind === "season" ? `s:${p.grade}` : `n:${p.id}`;
}

function payloadLabel(p: DragPayload) {
  return p.kind === "season" ? `Набор ${p.grade} класса` : p.name;
}

export default function ClassesView() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [sets, setSets] = useState<BookSetRow[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const [classQ, setClassQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setId, setSetId] = useState("");
  const [bookQ, setBookQ] = useState("");
  const [picked, setPicked] = useState<DragPayload | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // pointerId/target в снимке точки старта не нужны: перетаскивание считаем
  // по clientX/clientY + elementFromPoint (см. onChipMove), а не по
  // setPointerCapture — на тач-устройствах capture мешал «отпусканию».
  const startPt = useRef<{
    x: number;
    y: number;
    payload: DragPayload;
  } | null>(null);
  const skipClick = useRef(false);

  const load = useCallback(async () => {
    const [c, s, b] = await Promise.all([
      fetch("/api/classes").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sets").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/books").then((r) => (r.ok ? r.json() : [])),
    ]);
    setClasses((c ?? []) as ClassWithDetails[]);
    setSets((s ?? []) as BookSetRow[]);
    setBooks((b ?? []) as Book[]);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const grades = useMemo(() => {
    const nums = new Set<number>();
    for (const c of classes) {
      const n = classNumber(c.name);
      if (n) nums.add(n);
    }
    return [...nums].sort((a, b) => a - b);
  }, [classes]);

  const visible = useMemo(() => {
    const q = classQ.trim().toLowerCase();
    let list =
      gradeFilter === "all"
        ? classes
        : classes.filter((c) => classNumber(c.name) === gradeFilter);
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [classes, gradeFilter, classQ]);

  const cls = classes.find((c) => c.id === openId) ?? null;
  const linked = new Set(cls?.books.map((cb) => cb.bookId) ?? []);

  const classBooksSorted = useMemo(() => {
    if (!cls) return [];
    return [...cls.books].sort(
      (a, b) =>
        a.book.subject.localeCompare(b.book.subject, "ru") ||
        a.book.title.localeCompare(b.book.title, "ru")
    );
  }, [cls]);

  const addCandidates = useMemo(() => {
    const q = bookQ.trim().toLowerCase();
    return books
      .filter((b) => !linked.has(b.id))
      .filter(
        (b) =>
          !q ||
          b.title.toLowerCase().includes(q) ||
          b.subject.toLowerCase().includes(q) ||
          b.isbn.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [books, linked, bookQ]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Ошибка",
      });
    } finally {
      setBusy(false);
    }
  };

  const dropOnClass = (classId: string, payload: DragPayload) => {
    const target = classes.find((c) => c.id === classId);
    if (!target || busy) return;

    if (payload.kind === "season") {
      if (
        !confirm(
          `Заменить чек-лист «${target.name}» набором ${payload.grade} класса?`
        )
      )
        return;
      void run(async () => {
        const r = await fetch(`/api/classes/${target.id}/season`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade: payload.grade }),
        });
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.error ?? "Не удалось применить набор");
        await load();
        setStatus({
          kind: "success",
          message: `«${target.name}»: набор ${payload.grade} класса (${json.applied} учебников).`,
        });
      });
      return;
    }

    const s = sets.find((x) => x.id === payload.id);
    if (!s) return;
    if (s.books.length === 0) {
      setStatus({ kind: "error", message: `Набор «${s.name}» пуст.` });
      return;
    }
    void run(async () => {
      const r = await fetch(`/api/sets/${s.id}/apply-to-classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: [target.id] }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось добавить набор");
      await load();
      setStatus({
        kind: "success",
        message:
          json.added > 0
            ? `«${s.name}» → ${target.name}: +${json.added}`
            : `В «${target.name}» эти учебники уже были.`,
      });
    });
  };

  const classIdFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    return (
      el?.closest("[data-class-drop]")?.getAttribute("data-class-drop") ?? null
    );
  };

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    startPt.current = null;
  };

  const beginHold = (payload: DragPayload, e: React.PointerEvent) => {
    if (e.button === 2) return;
    startPt.current = { x: e.clientX, y: e.clientY, payload };
    holdTimer.current = setTimeout(() => {
      const st = startPt.current;
      if (!st) return;
      skipClick.current = true;
      setPicked(null);
      setDrag({
        payload: st.payload,
        x: st.x,
        y: st.y,
        overId: null,
      });
      try {
        navigator.vibrate?.(20);
      } catch {
        // нет вибрации
      }
    }, HOLD_MS);
  };

  const onChipMove = (e: React.PointerEvent) => {
    const st = startPt.current;
    if (st && holdTimer.current) {
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      if (dx * dx + dy * dy > MOVE_CANCEL * MOVE_CANCEL) clearHold();
    }
    if (!dragRef.current) return;
    e.preventDefault();
    const overId = classIdFromPoint(e.clientX, e.clientY);
    setDrag({
      payload: dragRef.current.payload,
      x: e.clientX,
      y: e.clientY,
      overId,
    });
  };

  const onChipUp = (e: React.PointerEvent) => {
    clearHold();
    const cur = dragRef.current;
    if (!cur) return;
    skipClick.current = true;
    const overId = classIdFromPoint(e.clientX, e.clientY) ?? cur.overId;
    setDrag(null);
    if (overId) dropOnClass(overId, cur.payload);
  };

  const tapChip = (payload: DragPayload) => {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    setPicked((p) =>
      p && payloadKey(p) === payloadKey(payload) ? null : payload
    );
  };

  const onClassClick = (id: string) => {
    if (dragRef.current) return;
    if (picked) {
      dropOnClass(id, picked);
      setPicked(null);
      return;
    }
    setOpenId(id);
  };

  const applySeason = (grade: number) => {
    if (!cls) return;
    if (!confirm(`Заменить чек-лист «${cls.name}» набором ${grade} класса?`))
      return;
    void run(async () => {
      const r = await fetch(`/api/classes/${cls.id}/season`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось применить набор");
      await load();
      setStatus({
        kind: "success",
        message: `Набор ${grade} класса: ${json.applied} учебников.`,
      });
    });
  };

  const applyNamedSet = () => {
    if (!cls || !setId) return;
    const s = sets.find((x) => x.id === setId);
    if (!s) return;
    if (
      !confirm(
        `Добавить ${s.books.length} учебников набора «${s.name}» в «${cls.name}»?`
      )
    )
      return;
    void run(async () => {
      const r = await fetch(`/api/sets/${s.id}/apply-to-classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: [cls.id] }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось добавить набор");
      await load();
      setStatus({
        kind: "success",
        message:
          json.added > 0
            ? `Добавлено привязок: ${json.added}.`
            : "Эти учебники уже были в классе.",
      });
    });
  };

  const removeNamedSet = () => {
    if (!cls || !setId) return;
    const s = sets.find((x) => x.id === setId);
    if (!s) return;
    if (
      !confirm(
        `Убрать учебники набора «${s.name}» из «${cls.name}»? Выдачи не трогаются.`
      )
    )
      return;
    void run(async () => {
      const r = await fetch(`/api/sets/${s.id}/remove-from-classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: [cls.id] }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось убрать из класса");
      await load();
      setStatus({
        kind: "success",
        message:
          json.removed > 0
            ? `Убрано привязок: ${json.removed}.`
            : "В классе этих учебников не было.",
      });
    });
  };

  const unlinkBook = (bookId: string, title: string) => {
    if (!cls) return;
    void run(async () => {
      const r = await fetch(`/api/classes/${cls.id}/books/${bookId}`, {
        method: "DELETE",
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось отвязать");
      await load();
      setStatus({ kind: "success", message: `«${title}» убран.` });
    });
  };

  const linkBook = (bookId: string, title: string) => {
    if (!cls) return;
    void run(async () => {
      const r = await fetch(`/api/classes/${cls.id}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось привязать");
      await load();
      setStatus({ kind: "success", message: `«${title}» добавлен.` });
    });
  };

  const chipClass = (payload: DragPayload) =>
    cn(
      "inline-flex h-11 max-w-full select-none items-center gap-1 rounded-md border px-2.5 text-sm font-medium",
      picked && payloadKey(picked) === payloadKey(payload)
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card active:bg-primary/10"
    );

  if (cls) {
    const n = classNumber(cls.name);
    const chosen = sets.find((s) => s.id === setId);

    return (
      <div className="space-y-4">
        <StatusBanner
          status={status}
          onClear={() => setStatus({ kind: "info", message: null })}
        />
        <Button
          variant="outline"
          className="h-11"
          onClick={() => {
            setOpenId(null);
            setSetId("");
            setBookQ("");
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> К списку классов
        </Button>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-5 w-5 text-primary" />
              Класс {cls.name}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {cls.students} уч. · {cls.books.length} учебников
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {n != null && (
              <Button
                className="h-12 w-full text-base"
                disabled={busy}
                onClick={() => applySeason(n)}
              >
                Назначить набор {n} класса
              </Button>
            )}

            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Свой набор</p>
              <select
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
                className="mt-2 h-12 w-full rounded-lg border border-input bg-card px-3 text-base"
              >
                <option value="">Выбрать набор…</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.books.length})
                  </option>
                ))}
              </select>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  className="h-12"
                  disabled={busy || !setId}
                  onClick={applyNamedSet}
                >
                  Добавить набор
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  disabled={busy || !setId}
                  onClick={removeNamedSet}
                >
                  Убрать набор
                </Button>
              </div>
              {chosen && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {chosen.books.map((b) => b.title).join(" · ") || "Пустой набор"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Учебники класса</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-md border border-border">
              {classBooksSorted.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">
                  Учебники не привязаны.
                </li>
              )}
              {classBooksSorted.map((cb) => (
                <li key={cb.bookId} className="flex items-center gap-2 p-2.5">
                  <BookCover bookId={cb.bookId} title={cb.book.title} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {cb.book.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {cb.book.subject}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 shrink-0 px-3"
                    disabled={busy}
                    onClick={() => unlinkBook(cb.bookId, cb.book.title)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Убрать
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Добавить учебник</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={bookQ}
              onChange={(e) => setBookQ(e.target.value)}
              placeholder="Поиск по каталогу…"
              className="h-12"
            />
            <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {addCandidates.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  Ничего не найдено.
                </li>
              )}
              {addCandidates.map((b) => (
                <li key={b.id} className="flex items-center gap-2 px-2 py-2">
                  <BookCover bookId={b.id} title={b.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {b.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {b.subject}
                      {b.grade != null ? ` · ${b.grade} кл.` : ""}
                    </span>
                  </span>
                  <Button
                    className="h-10 shrink-0 px-3"
                    disabled={busy}
                    onClick={() => linkBook(b.id, b.title)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatusBanner
        status={status}
        onClear={() => setStatus({ kind: "info", message: null })}
      />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Выберите класс</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            На телефоне: нажмите набор, затем класс. Либо удерживайте набор
            0,4 сек и перетащите.
          </p>
          <Input
            value={classQ}
            onChange={(e) => setClassQ(e.target.value)}
            placeholder="Найти класс: 8-Г…"
            className="mt-2 h-11"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setGradeFilter("all")}
              className={cn(
                "h-11 rounded-md border px-3 text-sm",
                gradeFilter === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted/60"
              )}
            >
              Все
            </button>
            {grades.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradeFilter(g)}
                className={cn(
                  "h-11 min-w-11 rounded-md border px-3 text-sm font-semibold",
                  gradeFilter === g
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted/60"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Наборы
            </p>
            <div className="flex flex-wrap gap-1.5">
              {grades.map((g) => {
                const payload: DragPayload = { kind: "season", grade: g };
                return (
                  <button
                    key={`g-${g}`}
                    type="button"
                    onPointerDown={(e) => beginHold(payload, e)}
                    onPointerMove={onChipMove}
                    onPointerUp={onChipUp}
                    onPointerCancel={clearHold}
                    onClick={() => tapChip(payload)}
                    className={chipClass(payload)}
                  >
                    <GripVertical className="h-4 w-4 opacity-70" />
                    {g} кл.
                  </button>
                );
              })}
              {sets.map((s) => {
                const payload: DragPayload = {
                  kind: "named",
                  id: s.id,
                  name: s.name,
                };
                return (
                  <button
                    key={s.id}
                    type="button"
                    onPointerDown={(e) => beginHold(payload, e)}
                    onPointerMove={onChipMove}
                    onPointerUp={onChipUp}
                    onPointerCancel={clearHold}
                    onClick={() => tapChip(payload)}
                    className={chipClass(payload)}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="truncate">{s.name}</span>
                    <span className="text-xs opacity-80">{s.books.length}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {picked && (
            <div className="rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm">
              Выбран «{payloadLabel(picked)}» — нажмите класс.
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setPicked(null)}
              >
                Отмена
              </button>
            </div>
          )}

          {loading && (
            <p className="py-3 text-sm text-muted-foreground">Загрузка…</p>
          )}
          {!loading && visible.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">Классов нет.</p>
          )}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  data-class-drop={c.id}
                  onClick={() => onClassClick(c.id)}
                  className={cn(
                    "flex h-24 w-full flex-col items-start justify-center rounded-lg border bg-card px-3 text-left transition-colors",
                    drag?.overId === c.id || picked
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary hover:bg-muted/60",
                    drag?.overId === c.id && "ring-2 ring-primary"
                  )}
                >
                  <span className="text-xl font-bold">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.students} уч. · {c.books.length} кн.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rounded-md border border-primary bg-card px-3 py-2 text-sm font-medium shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {payloadLabel(drag.payload)}
        </div>
      )}
    </div>
  );
}
