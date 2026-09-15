"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Loader2,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookCover, CoverUploader } from "@/components/book-cover";
import { cn } from "@/lib/utils";

/**
 * Предпросмотр и правка учебника.
 *
 * Сделан отдельным компонентом, потому что одинаковая задача («посмотреть
 * книгу и поправить её») есть в двух местах: каталог у библиотекаря и
 * «Книги» у администратора. Раньше библиотекарь мог только переложить книгу
 * между наборами и убрать в архив, а название/штрихкод правил админ —
 * из-за опечатки приходилось удалять запись и заводить заново, теряя историю
 * выдач.
 *
 * Справа (на широком экране) или шторкой (на телефоне) показывается всё, что
 * нужно для решения на месте: обложка, поля, тираж, набор сезона, классы,
 * кому книга сейчас выдана.
 */
export interface BookRow {
  id: string;
  isbn: string;
  title: string;
  subject: string;
  copies?: number;
  available?: number;
  grade?: number | null;
  hasCover?: boolean;
}

export interface BookUpdated {
  id: string;
  isbn: string;
  title: string;
  subject: string;
  copies: number;
  available: number;
  grade: number | null;
  hasCover?: boolean;
}

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

const LOAN_LABEL: Record<string, string> = {
  ISSUED: "выдан",
  RETURNED: "возвращён",
  LOST: "утерян",
};

interface Details {
  classes: string[];
  loans: {
    id: string;
    status: "ISSUED" | "RETURNED" | "LOST";
    issuedAt: string;
    returnedAt: string | null;
    student: { name: string; className: string | null } | null;
  }[];
  pendingRequests: { id: string; student: { name: string } | null }[];
}

export function BookEditor({
  book,
  onUpdated,
  onDeleted,
  canDelete = false,
  onClose,
  className,
}: {
  book: BookRow;
  /** Сохранение прошло — список снаружи обновляет строку. */
  onUpdated?: (next: BookUpdated) => void;
  /** Учебник удалён (только администратор). */
  onDeleted?: (id: string) => void;
  canDelete?: boolean;
  /** Для мобильной шторки: кнопка «Назад» в шапке. */
  onClose?: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => ({
    title: book.title,
    subject: book.subject,
    isbn: book.isbn,
    copies: String(book.copies ?? 1),
  }));
  const [grade, setGrade] = useState<string>(book.grade == null ? "" : String(book.grade));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [coverVersion, setCoverVersion] = useState(0);

  // Смена книги в этой же панели (клик по следующей строке списка) —
  // черновик обязан перезаписаться, иначе «правим одну, сохраняем другую».
  useEffect(() => {
    setDraft({
      title: book.title,
      subject: book.subject,
      isbn: book.isbn,
      copies: String(book.copies ?? 1),
    });
    setGrade(book.grade == null ? "" : String(book.grade));
    setErr(null);
    setOk(null);
  }, [book.id, book.title, book.subject, book.isbn, book.copies, book.grade]);

  useEffect(() => {
    let alive = true;
    setDetails(null);
    fetch(`/api/books/${book.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setDetails({
          classes: (j.classes ?? []).filter(Boolean) as string[],
          loans: (j.loans ?? []) as Details["loans"],
          pendingRequests: (j.pendingRequests ?? []) as Details["pendingRequests"],
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [book.id]);

  const dirty = useMemo(() => {
    const copies = Math.floor(Number(draft.copies) || 1);
    return (
      draft.title.trim() !== book.title ||
      draft.subject.trim() !== book.subject ||
      draft.isbn.trim().replace(/[\s-]/g, "") !== book.isbn ||
      copies !== (book.copies ?? 1) ||
      (grade === "" ? null : Number(grade)) !== (book.grade ?? null)
    );
  }, [draft, grade, book]);

  const save = useCallback(async () => {
    const title = draft.title.trim();
    const subject = draft.subject.trim();
    const isbn = draft.isbn.trim().replace(/[\s-]/g, "");
    const copies = Math.floor(Number(draft.copies) || 1);
    if (!title || !subject || !isbn) {
      setErr("Название, предмет и ISBN не могут быть пустыми.");
      return;
    }
    if (!Number.isInteger(copies) || copies < 1) {
      setErr("Экземпляров — целое число не меньше 1.");
      return;
    }
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      // Отправляем только то, что человек реально изменил (PATCH):
      // «улучшить» название не должно из-за этого проходить через
      // проверку тиража и ловить отказ «выдано больше, чем экземпляров».
      const payload: Record<string, string | number> = {};
      if (title !== book.title) payload.title = title;
      if (subject !== book.subject) payload.subject = subject;
      if (isbn !== book.isbn) payload.isbn = isbn;
      if (copies !== (book.copies ?? 1)) payload.copies = copies;
      if (Object.keys(payload).length === 0) {
        setErr(null);
        setOk("Изменений нет.");
        return;
      }
      const r = await fetch(`/api/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => null)) as
        | { error?: string; book?: BookUpdated }
        | null;
      if (!r.ok) throw new Error(j?.error ?? "Не удалось сохранить");

      // Набор сезона меняется своим эндпоинтом: у него своя бизнес-логика
      // (архив = «не выдаётся», но история сохраняется) и своя запись в аудит.
      const wantGrade = grade === "" ? null : Number(grade);
      if (wantGrade !== (book.grade ?? null)) {
        const g = await fetch(`/api/books/${book.id}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade: wantGrade }),
        });
        if (!g.ok) {
          const gj = (await g.json().catch(() => null)) as { error?: string } | null;
          throw new Error(gj?.error ?? "Карточку сохранили, а набор изменить не вышло");
        }
      }

      const saved = j?.book;
      const next: BookUpdated = {
        id: book.id,
        isbn: saved?.isbn ?? isbn,
        title: saved?.title ?? title,
        subject: saved?.subject ?? subject,
        copies: saved?.copies ?? copies,
        available: saved?.available ?? book.available ?? 0,
        grade: wantGrade,
        hasCover: saved?.hasCover,
      };
      onUpdated?.(next);
      setOk("Сохранено.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  }, [book, draft, grade, onUpdated]);

  const remove = useCallback(async () => {
    if (!confirm(`Удалить «${book.title}» из каталога? История выдач исчезнет.`)) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Не удалось удалить");
      onDeleted?.(book.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  }, [book, onDeleted]);

  const issuedNow = (details?.loans ?? []).filter((l) => l.status === "ISSUED");

  const body = (
    <div className="space-y-4">
      {/* ---------------- предпросмотр ---------------- */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setCoverVersion((v) => v + 1)}
          className="shrink-0 rounded-md"
          title="Обновить обложку"
          aria-label="Обновить обложку"
        >
          <BookCover
            bookId={book.id}
            title={draft.title}
            size="lg"
            version={coverVersion}
            className="ring-1 ring-border"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{book.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {book.subject} · <span className="font-mono">{book.isbn}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {book.grade != null ? (
              <Badge variant="outline">набор {book.grade} класса</Badge>
            ) : (
              <Badge variant="outline">вне наборов</Badge>
            )}
            {typeof book.available === "number" && (
              <Badge variant={book.available === 0 ? "destructive" : "secondary"}>
                {book.available} в наличии
              </Badge>
            )}
            {details && details.classes.length > 0 && (
              <Badge variant="secondary">
                <Users className="mr-1 inline h-3 w-3" />
                {details.classes.length} кл.
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- поля ---------------- */}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`be-title-${book.id}`}>Название</Label>
          <Input
            id={`be-title-${book.id}`}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`be-subject-${book.id}`}>Предмет</Label>
            <Input
              id={`be-subject-${book.id}`}
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`be-isbn-${book.id}`}>ISBN / штрихкод</Label>
            <Input
              id={`be-isbn-${book.id}`}
              value={draft.isbn}
              onChange={(e) => setDraft((d) => ({ ...d, isbn: e.target.value }))}
              inputMode="numeric"
              className="font-mono"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`be-copies-${book.id}`}>Экземпляров</Label>
            <Input
              id={`be-copies-${book.id}`}
              value={draft.copies}
              onChange={(e) => setDraft((d) => ({ ...d, copies: e.target.value }))}
              type="number"
              min={1}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`be-grade-${book.id}`}>Набор сезона</Label>
            <select
              id={`be-grade-${book.id}`}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
            >
              <option value="">Архив (не выдаётся)</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g} класс
                </option>
              ))}
            </select>
          </div>
        </div>

        {err && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}
        {ok && !err && (
          <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {ok}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11 min-w-[9rem] flex-1" disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={saving}
              onClick={() => {
                setDraft({
                  title: book.title,
                  subject: book.subject,
                  isbn: book.isbn,
                  copies: String(book.copies ?? 1),
                });
                setGrade(book.grade == null ? "" : String(book.grade));
                setOk(null);
              }}
            >
              Отменить
            </Button>
          )}
        </div>
      </form>

      {/* ---------------- обложка ---------------- */}
      <div className="rounded-lg border border-border p-3">
        <p className="eyebrow mb-2 text-muted-foreground">Обложка</p>
        <CoverUploader bookId={book.id} isbn={book.isbn} showPreview={false} onDone={() => setCoverVersion((v) => v + 1)} />
      </div>

      {/* ---------------- кому на руках ---------------- */}
      <div className="rounded-lg border border-border p-3">
        <p className="eyebrow mb-2 text-muted-foreground">Сейчас на руках</p>
        {!details && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка…
          </p>
        )}
        {details && issuedNow.length === 0 && (
          <p className="text-sm text-muted-foreground">Все экземпляры в библиотеке.</p>
        )}
        {details && issuedNow.length > 0 && (
          <ul className="cv-rows divide-y divide-border">
            {issuedNow.map((l) => (
              <li key={l.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.student?.name ?? "—"}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {l.student?.className ? `${l.student.className} · ` : ""}
                  с {new Date(l.issuedAt).toLocaleDateString("ru-RU")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {details && details.pendingRequests.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Ждут выдачи заявок: {details.pendingRequests.length} — обработка во
            вкладке «Заявки».
          </p>
        )}
      </div>

      {/* История — последние движения по книге: «кто и когда» без перехода
          в журнал (в карточке каталога она жила раньше и терять её нельзя). */}
      {details && details.loans.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="eyebrow mb-2 text-muted-foreground">
            Движения (последние {Math.min(details.loans.length, 6)})
          </p>
          <ul className="divide-y divide-border">
            {details.loans.slice(0, 6).map((l) => (
              <li key={l.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {l.student?.name ?? "—"}
                  <span className="text-xs text-muted-foreground">
                    {l.student?.className ? ` · ${l.student.className}` : ""}
                  </span>
                </span>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {new Date(l.issuedAt).toLocaleDateString("ru-RU")}
                  {l.returnedAt
                    ? ` → ${new Date(l.returnedAt).toLocaleDateString("ru-RU")}`
                    : ""}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    l.status === "LOST"
                      ? "text-destructive"
                      : l.status === "ISSUED"
                        ? "text-warning-foreground"
                        : "text-muted-foreground"
                  )}
                >
                  {LOAN_LABEL[l.status] ?? l.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canDelete && (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={saving}
          onClick={() => void remove()}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Удалить из каталога
        </Button>
      )}
    </div>
  );

  // Шторка на телефоне: свой скролл, «Назад» и закрытие по фону.
  if (onClose) {
    return (
      <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Учебник">
        <button
          type="button"
          aria-label="Закрыть карточку учебника"
          onClick={onClose}
          className="absolute inset-0 bg-foreground/35"
        />
        <div className="sheet-in absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">Карточка учебника</span>
            </p>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
              Назад
            </button>
          </div>
          {body}
        </div>
      </div>
    );
  }

  return <div className={cn("rounded-xl border border-border bg-card p-4", className)}>{body}</div>;
}
