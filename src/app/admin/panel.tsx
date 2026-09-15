"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  KeyRound,
  Layers,
  Plus,
  Printer,
  QrCode,
  Rocket,
  ScrollText,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [bookToAdd, setBookToAdd] = useState<Record<string, string>>({});
  const [copiesDraft, setCopiesDraft] = useState<Record<string, string>>({});

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

  const saveCopies = async (b: Book) => {
    const raw = copiesDraft[b.id] ?? String(b.copies ?? 1);
    const value = Math.floor(Number(raw));
    if (!Number.isFinite(value) || value < 1) {
      flash("error", "Тираж — целое число не меньше 1.");
      setCopiesDraft((m) => ({ ...m, [b.id]: String(b.copies ?? 1) }));
      return;
    }
    const r = await api(`/api/books/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copies: value }),
    });
    if (r.ok) {
      setCopiesDraft((m) => {
        const { [b.id]: _drop, ...rest } = m;
        return rest;
      });
      flash("success", `«${b.title}»: тираж ${value}.`);
      refresh();
    } else flash("error", r.error ?? "Не удалось изменить тираж");
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

  const studentsByClass = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of students) {
      const key = s.classId ?? "none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [students]);

  const tabClass = (t: Tab) =>
    cn(
      // min-w-max + shrink-0 — в мобильной ленте кнопка не сжимается ниже
      // контента (текст не ломается), лента скроллится; в сетке (sm+)
      // разрешаем ячейке растянуться. Кнопки повыше — легче попасть.
      "flex min-w-max shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors sm:min-w-0",
      tab === t
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent"
    );

  return (
    <main className="min-h-screen">
      <PageHeader
        icon={Layers}
        title="Администратор"
        subtitle="Классы, ученики, каталог и настройки"
        actions={<StaffUser name={userName} />}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <StatusBanner
          status={status}
          onClear={() => setStatus({ kind: "info", message: null })}
        />

        {/* Мобильный (<sm): горизонтальная лента вкладок без видимого
            скроллбара (кнопки не сжимались и выезжали за экран).
            Начиная с sm — сетка по 4: все разделы видны, ничего не уезжает. */}
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible">
          <button className={tabClass("classes")} onClick={() => setTab("classes")}>
            <GraduationCap className="h-4 w-4" /> Классы
          </button>
          <button className={tabClass("students")} onClick={() => setTab("students")}>
            <Users className="h-4 w-4" /> Ученики
          </button>
          <button className={tabClass("books")} onClick={() => setTab("books")}>
            <BookOpen className="h-4 w-4" /> Книги
          </button>
          <button className={tabClass("links")} onClick={() => setTab("links")}>
            <KeyRound className="h-4 w-4" /> Ссылки
          </button>
          <button className={tabClass("import")} onClick={() => setTab("import")}>
            <Upload className="h-4 w-4" /> Импорт
          </button>
          <button className={tabClass("audit")} onClick={() => setTab("audit")}>
            <ScrollText className="h-4 w-4" /> Аудит
          </button>
          <button className={tabClass("update")} onClick={() => setTab("update")}>
            <Rocket className="h-4 w-4" /> Обновления
          </button>
        </nav>

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
                            <li key={cb.bookId} className="flex items-center gap-2 p-2.5">
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
                            className="h-10 flex-1 rounded-md border border-input bg-card px-3 text-sm"
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
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
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
              <CardHeader>
                <CardTitle>Новый учебник</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>ISBN (штрихкод с обложки)</Label>
                  <Input
                    value={newBook.isbn}
                    onChange={(e) => setNewBook((b) => ({ ...b, isbn: e.target.value }))}
                    inputMode="numeric"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Название</Label>
                    <Input
                      value={newBook.title}
                      onChange={(e) => setNewBook((b) => ({ ...b, title: e.target.value }))}
                      placeholder="Математика, 8 класс (Атанасян)"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Предмет</Label>
                    <Input
                      value={newBook.subject}
                      onChange={(e) => setNewBook((b) => ({ ...b, subject: e.target.value }))}
                      placeholder="Математика"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Экземпляров</Label>
                    <Input
                      value={newBook.copies}
                      onChange={(e) => setNewBook((b) => ({ ...b, copies: e.target.value }))}
                      inputMode="numeric"
                      placeholder="1"
                    />
                  </div>
                </div>
                <Button
                  onClick={addBook}
                  disabled={!newBook.isbn.trim() || !newBook.title.trim() || !newBook.subject.trim()}
                >
                  <Plus className="mr-1 h-4 w-4" /> В каталог
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Link href="/print/labels" target="_blank" className="mb-2">
                <Button variant="secondary" size="sm">
                  <Printer className="mr-1 h-4 w-4" /> Печать этикеток
                </Button>
              </Link>
            </div>

            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {books.map((b) => (
                <li key={b.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate font-medium">
                      {b.title}
                      {b.grade != null ? (
                        <Badge variant="outline">{b.grade} кл.</Badge>
                      ) : (
                        <Badge variant="outline">вне набора</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.subject} · ISBN {b.isbn}
                      {typeof b.available === "number" &&
                        ` · в наличии: ${b.available}`}
                    </p>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    экз.
                    <input
                      value={copiesDraft[b.id] ?? String(b.copies ?? 1)}
                      onChange={(e) =>
                        setCopiesDraft((m) => ({ ...m, [b.id]: e.target.value }))
                      }
                      onBlur={() => saveCopies(b)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      inputMode="numeric"
                      className="h-8 w-14 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                      aria-label={`Тираж: ${b.title}`}
                    />
                  </label>
                  <button
                    onClick={() => deleteBook(b)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Удалить учебник"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
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
    </main>
  );
}
