"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  KeyRound,
  Layers,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Rocket,
  Search,
  ScrollText,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffTabs, type StaffTabItem } from "@/components/ui/staff-tabs";
import { BookCover } from "@/components/book-cover";
import { BookEditor, type BookUpdated } from "@/components/book-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBanner, type Status } from "@/components/status-banner";
import StaffUser from "@/components/staff-user";
import { PageHeader } from "@/components/ui/page-header";
import type { Book, ClassInfo, ClassWithDetails, Student } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsWide } from "@/lib/use-is-wide";
// Редкие вкладки — ленивые чанки: начальный бандл админки меньше,
// грузится быстрее на слабых телефонах (как во вкладках библиотекаря).
const ImportView = lazy(() => import("./import-view"));
const AuditView = lazy(() => import("./audit-view"));
const InviteLinksView = lazy(() => import("./invite-links-view"));
const UpdateView = lazy(() => import("./update-view"));

// Заглушка на время подгрузки ленивой вкладки.
function TabFallback() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

type Tab =
  | "classes"
  | "students"
  | "books"
  | "links"
  | "import"
  | "audit"
  | "update";

/**
 * Разделы администровки в одном списке — вид (нижний док на телефоне,
 * лента на планшете, панель слева на мониторе) выбирает сам StaffTabs.
 * В док вынесено то, что трогают каждый день; редкое (импорт, аудит,
 * обновления) — под «Ещё».
 */
const ADMIN_TABS: (StaffTabItem & { id: Tab })[] = [
  { id: "classes", label: "Классы", icon: GraduationCap, inDock: true },
  { id: "students", label: "Ученики", icon: Users, inDock: true },
  { id: "books", label: "Книги", icon: BookOpen, inDock: true },
  { id: "links", label: "Ссылки", icon: KeyRound },
  { id: "import", label: "Импорт", icon: Upload },
  { id: "audit", label: "Аудит", icon: ScrollText },
  { id: "update", label: "Обновления", icon: Rocket },
];

async function api<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const res = await fetch(url, init);
  let data: T | null = null;
  let error: string | undefined;
  try {
    const json = await res.json();
    data = json as T;
    if (!res.ok) error = typeof json === "object" && json && "error" in json ? String((json as { error: unknown }).error) : undefined;
  } catch {
    // пустой ответ
  }
  return { ok: res.ok, status: res.status, data, error };
}

export default function AdminPanel({ userName }: { userName: string }) {
  const [tab, setTab] = useState<Tab>("classes");
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  const [className, setClassName] = useState("");
  const [newStudent, setNewStudent] = useState({ lastName: "", firstName: "", classId: "" });
  const [newBook, setNewBook] = useState({ isbn: "", title: "", subject: "", copies: "1" });
  const [openClass, setOpenClass] = useState<string | null>(null);
  // Каталог: фильтр по строке (без запроса — список уже целиком в состоянии)
  // и учебник, открытый в предпросмотре справа / шторкой на телефоне.
  const [bookQ, setBookQ] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const wide = useIsWide();
  const [bookToAdd, setBookToAdd] = useState<Record<string, string>>({});

  const flash = useCallback(
    (kind: Status["kind"], message: string) => setStatus({ kind, message }),
    []
  );

  const refresh = useCallback(async () => {
    const [c, s, b] = await Promise.all([
      api<ClassWithDetails[]>("/api/classes"),
      api<Student[]>("/api/students"),
      api<Book[]>("/api/books"),
    ]);
    setClasses(c.data ?? []);
    setStudents(s.data ?? []);
    setBooks(b.data ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const classList = useMemo(
    () => classes.map((c) => ({ id: c.id, name: c.name })),
    [classes]
  );

  // --- Действия ---
  const addClass = async () => {
    if (!className.trim()) return;
    const r = await api("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: className }),
    });
    if (r.ok) {
      setClassName("");
      flash("success", "Класс создан.");
      refresh();
    } else flash("error", r.error ?? "Не удалось создать класс");
  };

  const deleteClass = async (id: string) => {
    if (!confirm("Удалить класс? Привязки книг будут удалены, ученики останутся без класса.")) return;
    const r = await api(`/api/classes/${id}`, { method: "DELETE" });
    if (r.ok) {
      flash("success", "Класс удалён.");
      refresh();
    } else flash("error", r.error ?? "Ошибка");
  };

  const addStudent = async () => {
    if (!newStudent.lastName.trim() || !newStudent.firstName.trim()) return;
    const r = await api("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastName: newStudent.lastName,
        firstName: newStudent.firstName,
        classId: newStudent.classId || null,
      }),
    });
    if (r.ok) {
      setNewStudent({ lastName: "", firstName: "", classId: "" });
      flash("success", "Ученик создан — QR-код готов в его кабинете.");
      refresh();
    } else flash("error", r.error ?? "Ошибка");
  };

  const deleteStudent = async (s: Student) => {
    if (!confirm(`Удалить ученика ${s.lastName} ${s.firstName}? Выдачи будут удалены.`)) return;
    const r = await api(`/api/students/${s.id}`, { method: "DELETE" });
    if (r.ok) {
      flash("success", "Ученик удалён.");
      refresh();
    } else flash("error", r.error ?? "Ошибка");
  };

  const addBook = async () => {
    if (!newBook.isbn.trim() || !newBook.title.trim() || !newBook.subject.trim()) return;
    const copies = Math.max(1, Math.floor(Number(newBook.copies) || 1));
    const r = await api("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newBook, copies }),
    });
    if (r.ok) {
      setNewBook({ isbn: "", title: "", subject: "", copies: "1" });
      flash("success", "Учебник добавлен в каталог.");
      refresh();
    } else flash("error", r.error ?? "Ошибка");
  };

  const deleteBook = async (b: Book) => {
    if (!confirm(`Удалить «${b.title}» из каталога?`)) return;
    const r = await api(`/api/books/${b.id}`, { method: "DELETE" });
    if (r.ok) {
      flash("success", "Учебник удалён.");
      refresh();
    } else flash("error", r.error ?? "Ошибка");
  };

  const linkBook = async (classId: string) => {
    const bookId = bookToAdd[classId];
    if (!bookId) return;
    const r = await api(`/api/classes/${classId}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId }),
    });
    if (r.ok) {
      flash("success", "Учебник привязан к классу.");
      refresh();
    } else flash("error", r.error ?? "Ошибка");
  };

  const unlinkBook = async (classId: string, bookId: string) => {
    const r = await api(`/api/classes/${classId}/books/${bookId}`, {
      method: "DELETE",
    });
    if (r.ok) {
      flash("success", "Привязка удалена.");
      refresh();
    } else flash("error", r.error ?? "Ошибка");
  };

  const filteredBooks = useMemo(() => {
    const needle = bookQ.trim().toLowerCase();
    if (!needle) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(needle) ||
        b.subject.toLowerCase().includes(needle) ||
        b.isbn.toLowerCase().includes(needle)
    );
  }, [books, bookQ]);

  const studentsByClass = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of students) {
      const key = s.classId ?? "none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [students]);

  return (
    <main className="min-h-dvh">
      <PageHeader
        icon={Layers}
        title="Администратор"
        subtitle="Классы, ученики, каталог и настройки"
        actions={<StaffUser name={userName} />}
        sticky={false}
        buttonsOnlyOnMobile
      />

      {/* Телефон: одна колонка + нижний док. Планшет: лента разделов
          сверху. Монитор: панель разделов слева и широкая рабочая область
          (в две колонки работает «Книги»: список + предпросмотр). */}
      <div className="safe-x mx-auto w-full max-w-2xl px-4 lg:max-w-[1440px] lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-5 lg:px-6 lg:py-5">
        <div className="lg:sticky lg:top-5">
          <StaffTabs
            items={ADMIN_TABS}
            value={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel="Разделы администратора"
          />
        </div>

        <div className="min-w-0 space-y-4 py-4 pb-28 sm:pb-6 lg:py-0">
          <StatusBanner
            status={status}
            onClear={() => setStatus({ kind: "info", message: null })}
          />

        {tab === "classes" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Новый класс</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addClass()}
                    placeholder="Например, 8-В"
                  />
                  <Button onClick={addClass} disabled={!className.trim()}>
                    <Plus className="mr-1 h-4 w-4" /> Создать
                  </Button>
                </div>
              </CardContent>
            </Card>

            <ul className="space-y-3">
              {classes.map((c) => (
                <li key={c.id}>
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setOpenClass(openClass === c.id ? null : c.id)}
                          className="text-left"
                        >
                          <p className="font-semibold">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.students} уч. · {c.books.length} книг
                          </p>
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/print/qr-cards?classId=${c.id}`}
                          target="_blank"
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Печать QR-карточек учеников класса"
                          aria-label="Печать QR-карточек"
                        >
                          <QrCode className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/print/class-list?classId=${c.id}`}
                          target="_blank"
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Печать списка учебников класса"
                          aria-label="Печать списка"
                        >
                          <Printer className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => deleteClass(c.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Удалить класс"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </CardHeader>

                    {openClass === c.id && (
                      <CardContent className="pt-0">
                        <p className="mb-2 text-sm font-medium text-muted-foreground">
                          Учебники класса
                        </p>
                        <ul className="mb-3 divide-y divide-border rounded-md border border-border">
                          {c.books.length === 0 && (
                            <li className="p-3 text-sm text-muted-foreground">
                              Учебники не привязаны.
                            </li>
                          )}
                          {c.books.map((cb) => (
                            <li key={cb.bookId} className="flex items-center gap-2.5 p-2.5">
                              {/* Обложка и в списке класса: «какая именно
                                  книга» угадывается быстрее, чем по названию. */}
                              <BookCover bookId={cb.bookId} title={cb.book.title} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{cb.book.title}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {cb.book.subject} · {cb.book.isbn}
                                </p>
                              </div>
                              <button
                                onClick={() => unlinkBook(c.id, cb.bookId)}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label="Отвязать"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>

                        <div className="flex gap-2">
                          <select
                            value={bookToAdd[c.id] ?? ""}
                            onChange={(e) =>
                              setBookToAdd((m) => ({ ...m, [c.id]: e.target.value }))
                            }
                            className="h-11 flex-1 rounded-lg border border-input bg-card px-3 text-base"
                          >
                            <option value="">Выбрать учебник…</option>
                            {books
                              .filter(
                                (b) =>
                                  b.grade != null &&
                                  !c.books.some((cb) => cb.bookId === b.id)
                              )
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.title} — {b.isbn} ({b.grade} кл.)
                                </option>
                              ))}
                          </select>
                          <Button
                            variant="secondary"
                            onClick={() => linkBook(c.id)}
                            disabled={!bookToAdd[c.id]}
                          >
                            <Plus className="mr-1 h-4 w-4" /> Привязать
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "students" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Новый ученик</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Фамилия</Label>
                    <Input
                      value={newStudent.lastName}
                      onChange={(e) =>
                        setNewStudent((s) => ({ ...s, lastName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Имя</Label>
                    <Input
                      value={newStudent.firstName}
                      onChange={(e) =>
                        setNewStudent((s) => ({ ...s, firstName: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>Класс</Label>
                    <select
                      value={newStudent.classId}
                      onChange={(e) =>
                        setNewStudent((s) => ({ ...s, classId: e.target.value }))
                      }
                      className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                    >
                      <option value="">Без класса</option>
                      {classList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button onClick={addStudent} disabled={!newStudent.lastName.trim() || !newStudent.firstName.trim()}>
                    <Plus className="mr-1 h-4 w-4" /> Создать
                  </Button>
                </div>
              </CardContent>
            </Card>

            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {students.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Учеников пока нет.</li>
              )}
              {students.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {s.lastName} {s.firstName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.class?.name ?? "Без класса"} · QR: {s.qrToken ? "есть" : "нет"}
                    </p>
                  </div>
                  <Link
                    href={`/student?qr=${s.qrToken ?? s.id}`}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-primary hover:bg-primary/5"
                  >
                    Кабинет
                  </Link>
                  <button
                    onClick={() => deleteStudent(s)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Удалить ученика"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "books" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Новый учебник</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ab-isbn">ISBN (штрихкод с обложки)</Label>
                    <Input
                      id="ab-isbn"
                      value={newBook.isbn}
                      onChange={(e) => setNewBook((b) => ({ ...b, isbn: e.target.value }))}
                      inputMode="numeric"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ab-copies">Экземпляров</Label>
                    <Input
                      id="ab-copies"
                      value={newBook.copies}
                      onChange={(e) => setNewBook((b) => ({ ...b, copies: e.target.value }))}
                      inputMode="numeric"
                      placeholder="1"
                      className="h-11"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ab-title">Название</Label>
                    <Input
                      id="ab-title"
                      value={newBook.title}
                      onChange={(e) => setNewBook((b) => ({ ...b, title: e.target.value }))}
                      placeholder="Математика, 8 класс (Атанасян)"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ab-subject">Предмет</Label>
                    <Input
                      id="ab-subject"
                      value={newBook.subject}
                      onChange={(e) => setNewBook((b) => ({ ...b, subject: e.target.value }))}
                      placeholder="Математика"
                      className="h-11"
                    />
                  </div>
                </div>
                <Button
                  className="h-11 w-full sm:w-auto"
                  onClick={addBook}
                  disabled={!newBook.isbn.trim() || !newBook.title.trim() || !newBook.subject.trim()}
                >
                  <Plus className="mr-1 h-4 w-4" /> В каталог
                </Button>
              </CardContent>
            </Card>

            {/* Каталог: список + предпросмотр. На мониторе карточка книги
                стоит справа и не даёт списку уехать, на телефоне
                открывается шторкой. */}
            <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[12rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={bookQ}
                      onChange={(e) => setBookQ(e.target.value)}
                      placeholder="Фильтр: название, предмет или ISBN…"
                      aria-label="Фильтр каталога"
                      className="h-11 pl-9"
                    />
                  </div>
                  <Link href="/print/labels" target="_blank">
                    <Button variant="secondary" size="sm" className="h-11 px-3">
                      <Printer className="mr-1 h-4 w-4" /> Этикетки
                    </Button>
                  </Link>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Учебников в фильтре: {filteredBooks.length}
                </p>

                <ul className="cv-rows divide-y divide-border rounded-lg border border-border bg-card">
                  {filteredBooks.length === 0 && (
                    <li className="p-4 text-sm text-muted-foreground">
                      Ничего не найдено.
                    </li>
                  )}
                  {filteredBooks.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedBook(b)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 pl-1 pr-2 text-left transition-colors hover:bg-muted/60",
                          selectedBook?.id === b.id && "bg-primary/5"
                        )}
                      >
                        <BookCover bookId={b.id} title={b.title} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{b.title}</span>
                            {b.grade != null ? (
                              <Badge variant="outline" className="shrink-0">{b.grade} кл.</Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0">вне набора</Badge>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {b.subject} · <span className="font-mono">{b.isbn}</span>
                            {typeof b.available === "number" &&
                              ` · в наличии: ${b.available} из ${b.copies ?? 1}`}
                          </span>
                        </span>
                        <Pencil className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
                      </button>
                      <button
                        onClick={() => deleteBook(b)}
                        className="rounded p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Удалить «${b.title}»`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <aside className="hidden lg:sticky lg:top-5 lg:block lg:self-start">
                {wide && selectedBook ? (
                  <BookEditor
                    key={selectedBook.id}
                    book={selectedBook}
                    canDelete
                    onUpdated={(next: BookUpdated) => {
                      setBooks((list) =>
                        list.map((x) => (x.id === next.id ? { ...x, ...next } : x))
                      );
                      refresh();
                    }}
                    onDeleted={() => {
                      setSelectedBook(null);
                      refresh();
                    }}
                    onClose={undefined}
                    className="max-h-[calc(100dvh-2.5rem)] overflow-y-auto"
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-5 text-center">
                    <p className="text-sm font-medium">Карточка учебника</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Выберите строку слева — можно поправить название,
                      штрихкод, тираж и набор, загрузить обложку.
                    </p>
                  </div>
                )}
              </aside>

              {!wide && selectedBook && (
                <BookEditor
                  key={`sheet-${selectedBook.id}`}
                  book={selectedBook}
                  canDelete
                  onUpdated={(next: BookUpdated) => {
                    setBooks((list) =>
                      list.map((x) => (x.id === next.id ? { ...x, ...next } : x))
                    );
                    refresh();
                  }}
                  onDeleted={() => {
                    setSelectedBook(null);
                    refresh();
                  }}
                  onClose={() => setSelectedBook(null)}
                />
              )}
            </div>
          </div>
        )}

        {tab === "links" && (
          <Suspense fallback={<TabFallback />}>
            <InviteLinksView />
          </Suspense>
        )}
        {tab === "import" && (
          <Suspense fallback={<TabFallback />}>
            <ImportView onDone={refresh} />
          </Suspense>
        )}
        {tab === "audit" && (
          <Suspense fallback={<TabFallback />}>
            <AuditView />
          </Suspense>
        )}
        {tab === "update" && (
          <Suspense fallback={<TabFallback />}>
            <UpdateView />
          </Suspense>
        )}
        </div>
      </div>
    </main>
  );
}
