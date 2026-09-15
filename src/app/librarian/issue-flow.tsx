"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCheck,
  ScanLine,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tap } from "@/lib/haptics";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Scanner } from "@/components/scanner";
import { StatusBanner, type Status } from "@/components/status-banner";
import { BOOK_FORMATS, QR_FORMATS } from "@/lib/scanner-formats";
import { extractQrToken } from "@/lib/qr-token";
import { sameIsbn } from "@/lib/isbn";
import {
  enqueueOp,
  makeOp,
  DATA_CHANGED_EVENT,
} from "@/lib/offline-queue-browser";
import type { Book, ClassBook, Loan, Student } from "@/lib/types";

interface ProfileData {
  student: Student;
  classBooks: ClassBook[];
  loans: Loan[];
  /** bookId → { total, out, available }: сколько ещё можно выдать. */
  availability?: Record<
    string,
    { total: number; out: number; available: number }
  >;
}

/**
 * Чем открыть профиль: личный QR-токен (карточка или телефон ученика) либо
 * id ученика — путь для случая «карточки не печатали / потерял», когда
 * выдача идёт по списку класса. id принимает только staff-роут
 * /api/student/:id, поэтому путать их опасно нечем.
 */
type ProfileRef = { kind: "token" | "id"; value: string };

/** Ответ /api/loans/bulk — счётчики и то, что не выдалось. */
interface BulkResult {
  created: number;
  already: number;
  noStock: number;
  notInSet: number;
  total: number;
  students: number;
  books: number;
  exceptionsTotal: number;
  exceptions: {
    studentId: string;
    studentName: string;
    bookId: string;
    bookTitle: string;
    reason: "already" | "no_stock" | "not_in_set";
  }[];
}

/** Недавние ученики: вернуться к прошлому профилю одним тапом. */
interface RecentStudent {
  ref: ProfileRef;
  name: string;
  className: string | null;
}

const RECENT_KEY = "uchebniki:recentStudents";
const RECENT_MAX = 6;

function readRecent(): RecentStudent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    // Записи прежней версии лежали по одному полю token — мигрируем на месте,
    // чтобы список «Недавних» не обнулился из-за смены формата.
    return v
      .map((x): RecentStudent | null => {
        if (!x || typeof x !== "object") return null;
        const o = x as { ref?: ProfileRef; token?: string; name?: string; className?: string | null };
        const ref: ProfileRef | null =
          o.ref && typeof o.ref.value === "string"
            ? o.ref
            : typeof o.token === "string"
              ? { kind: "token", value: o.token }
              : null;
        if (!ref || typeof o.name !== "string") return null;
        return { ref, name: o.name, className: o.className ?? null };
      })
      .filter((x): x is RecentStudent => x !== null);
  } catch {
    return [];
  }
}

function rememberRecent(item: RecentStudent) {
  try {
    const key = (r: ProfileRef) => `${r.kind}:${r.value}`;
    const rest = readRecent().filter((x) => key(x.ref) !== key(item.ref));
    localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...rest].slice(0, RECENT_MAX)));
  } catch {
    // private mode — не критично
  }
}

/**
 * `scanNonce` > 0 — внешний запрос «сразу открыть камеру» (кнопка «Скан» в
 * нижнем доке: с любой вкладки один тап до сканера). Отработали — просим
 * сбросить счётчик, чтобы возврат на вкладку «Выдача» камеру не включал.
 */
export default function IssueFlow({
  scanNonce = 0,
  onScanConsumed,
}: {
  scanNonce?: number;
  onScanConsumed?: () => void;
} = {}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [scanningQr, setScanningQr] = useState(false);
  const [scanningBook, setScanningBook] = useState(false);
  const [manualIsbn, setManualIsbn] = useState("");
  // Ручной ввод кода ученика — запасной путь, когда камеры нет
  // (ПК библиотекаря) или доступ к камере запрещён.
  const [manualQr, setManualQr] = useState("");
  const [busy, setBusy] = useState(false);
  // Книги «в полёте»: галочка реагирует мгновенно (оптимистично), сервер
  // подтверждает в фоне. На слабом телефоне в медленной сети сотрудник
  // отмечает учебники подряд, не дожидаясь ответа на каждый.
  const [pending, setPending] = useState<Set<string>>(new Set());
  // Недавние ученики — быстро вернуться без повторного скана.
  const [recent, setRecent] = useState<RecentStudent[]>([]);
  // Выбор ученика из класса (когда карточка забыта).
  const [picking, setPicking] = useState(false);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [pickedClassId, setPickedClassId] = useState("");
  const [classStudents, setClassStudents] = useState<
    { id: string; lastName: string; firstName: string; qrToken: string | null }[]
  >([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  // «Весь класс пришёл»: выдача набором всем сразу (один запрос на Bulk).
  const [classBusy, setClassBusy] = useState(false);
  const [classResult, setClassResult] = useState<BulkResult | null>(null);
  // Журнал непрерывного скана ISBN: последние отсканированные книги.
  const [scanLog, setScanLog] = useState<{ title: string; ok: boolean; note?: string }[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  const flash = useCallback(
    (kind: Status["kind"], message: string) =>
      setStatus({ kind, message }),
    []
  );

  const loadProfile = useCallback(
    async (ref: ProfileRef) => {
      const url =
        ref.kind === "token"
          ? `/api/student/qr/${encodeURIComponent(ref.value)}`
          : `/api/student/${encodeURIComponent(ref.value)}?profile=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Ученик не найден");
      const data = (await res.json()) as ProfileData;
      setProfile(data);
      setScanningQr(false);
      setPicking(false);
      flash("success", `Профиль: ${data.student.lastName} ${data.student.firstName}`);
      // Запоминаем для «Недавних» — вернуться одним тапом.
      const item: RecentStudent = {
        ref,
        name: `${data.student.lastName} ${data.student.firstName}`,
        className: data.student.class?.name ?? null,
      };
      rememberRecent(item);
      const same = (r: ProfileRef) => r.kind === ref.kind && r.value === ref.value;
      setRecent((prev) => [item, ...prev.filter((x) => !same(x.ref))].slice(0, RECENT_MAX));
    },
    [flash]
  );

  const openByToken = (token: string) => {
    loadProfile({ kind: "token", value: token }).catch((e: Error) =>
      flash("error", e.message === "Ученик не найден"
        ? `Ученик с кодом не найден: ${token}`
        : "Ошибка сети")
    );
  };

  const handleQrScan = (text: string) => {
    const token = extractQrToken(text);
    if (!token) {
      flash("error", "Не удалось распознать QR-код.");
      setScanningQr(false);
      return;
    }
    openByToken(token);
  };

  // Тот же extractQrToken: принимает и голый токен, и полную ссылку
  // с карточки (${origin}/student?qr=<токен>).
  const submitManualQr = () => {
    const token = extractQrToken(manualQr);
    if (!token) return;
    setManualQr("");
    openByToken(token);
  };

  // После синхронизации офлайн-очереди профиль мог измениться — перечитываем.
  // Всегда по id (staff-роут): раньше здесь подставлялся qrToken, и у ученика
  // без карточки получался запрос /api/student/qr/null → профиль молча
  // оставался устаревшим («0 из 11» после «Выдать всё»).
  useEffect(() => {
    const id = profile?.student.id;
    if (!id) return;
    const reload = () =>
      fetch(`/api/student/${encodeURIComponent(id)}?profile=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setProfile(data))
        .catch(() => {});
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
  }, [profile?.student.id]);

  // Недавние ученики — из localStorage при первом рендере.
  useEffect(() => {
    setRecent(readRecent());
  }, []);

  // Запуск сканера из дока: если профиль уже открыт, не вмешиваемся —
  // человек посреди выдачи, и камера поверх чек-листа была бы ловушкой.
  useEffect(() => {
    if (!scanNonce) return;
    if (!profile && !picking) setScanningQr(true);
    onScanConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanNonce]);

  // --- Выбор ученика из класса (карточка забыта/потеряна) ---
  const openPicker = () => {
    setPicking(true);
    if (classes.length === 0) {
      fetch("/api/classes")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: { id: string; name: string }[]) => setClasses(list))
        .catch(() => flash("error", "Не удалось загрузить классы."));
    }
  };

  const pickClass = (classId: string) => {
    setPickedClassId(classId);
    setClassStudents([]);
    setClassResult(null);
    if (!classId) return;
    setStudentsLoading(true);
    fetch(`/api/students?classId=${encodeURIComponent(classId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (
          list: {
            id: string;
            lastName: string;
            firstName: string;
            qrToken: string | null;
          }[]
        ) => setClassStudents(list)
      )
      .catch(() => flash("error", "Не удалось загрузить список класса."))
      .finally(() => setStudentsLoading(false));
  };

  /**
   * Выдача набора всему классу. QR-коды здесь не нужны в принципе: нарядом
   * служит список класса, а книги физически лежат перед сотрудником. Сервер
   * пропускает тех, кому уже выдано, и отдаёт список исключений — их правят
   * построчно. Офлайна не касается: пачка требует связи (одиночные выдачи в
   * очередь при обрыве пишутся как раньше).
   */
  const issueToClass = async () => {
    if (!pickedClassId || classBusy || classStudents.length === 0) return;
    if (
      !confirm(
        `Выдать набор класса всем ученикам (${classStudents.length} чел.)?\n` +
          "Кому уже выдано — пропустим; там, где книги кончились — покажем списком."
      )
    )
      return;
    setClassBusy(true);
    setClassResult(null);
    try {
      const res = await fetch("/api/loans/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: pickedClassId }),
      });
      const data = (await res.json().catch(() => null)) as
        | (BulkResult & { error?: string })
        | null;
      if (!res.ok || !data) {
        flash("error", data?.error || "Не удалось выдать классу");
        return;
      }
      setClassResult(data);
      flash("success", `Классу выдано учебников: ${data.created}.`);
      tap(12);
      // Если профиль кого-то из этого класса открыт — обновляем его.
      if (profile) {
        const fresh = await fetch(
          `/api/student/${encodeURIComponent(profile.student.id)}?profile=1`
        );
        if (fresh.ok) setProfile((await fresh.json()) as ProfileData);
      }
    } catch {
      flash(
        "error",
        "Нет сети: выдача на весь класс требует связи. По одному ученику офлайн работает."
      );
    } finally {
      setClassBusy(false);
    }
  };

  const activeLoanFor = (bookId: string) =>
    profile?.loans.find((l) => l.bookId === bookId && l.status === "ISSUED");

  const issueBook = async (
    bookId: string
  ): Promise<Loan | "queued" | "dup" | "nostock" | "notInSet" | null> => {
    if (!profile) return null;
    const book = profile.classBooks.find((cb) => cb.bookId === bookId)?.book;
    let res: Response;
    try {
      res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: profile.student.id, bookId }),
      });
    } catch {
      // Нет сети — сохраняем в очередь, отправим при появлении соединения.
      enqueueOp(
        makeOp(
          "issue",
          { studentId: profile.student.id, bookId },
          `${profile.student.lastName} ${profile.student.firstName} — ${book?.title ?? "книга"}: выдать`
        )
      );
      flash("info", "Нет сети: операция сохранена и будет отправлена позже.");
      return "queued";
    }
    if (res.status === 409) {
      const json = (await res.json().catch(() => null)) as
        | { error?: unknown; code?: unknown }
        | null;
      const msg = typeof json?.error === "string" ? json.error : "";
      const code = typeof json?.code === "string" ? json.code : "";
      // Разбор по machine-readable коду: по одному лишь 409 было непонятно,
      // «уже выдано» это или отказ, и оптимистичная галочка оставалась
      // отмеченной там, где выдача не создалась.
      const noStock = code === "no_stock" || (!code && msg.includes("экземпляры"));
      if (noStock) {
        flash("error", `«${book?.title ?? "Книга"}»: ${msg}`);
        return "nostock";
      }
      if (code === "not_in_set") {
        flash("error", `«${book?.title ?? "Книга"}»: ${msg || "не в наборе этого года"}`);
        return "notInSet";
      }
      flash("info", msg || "Эта книга уже выдана.");
      return "dup";
    }
    if (!res.ok) throw new Error("Не удалось выдать книгу");
    return (await res.json()) as Loan;
  };

  const returnBook = async (
    loanId: string,
    bookTitle?: string
  ): Promise<Loan | "queued" | null> => {
    if (!profile) return null;
    let res: Response;
    try {
      res = await fetch(`/api/loans/${loanId}/return`, { method: "PUT" });
    } catch {
      enqueueOp(
        makeOp(
          "return",
          { loanId },
          `${profile.student.lastName} ${profile.student.firstName} — ${bookTitle ?? "книга"}: возврат`
        )
      );
      flash("info", "Нет сети: операция сохранена и будет отправлена позже.");
      return "queued";
    }
    if (res.status === 409) {
      flash("info", "Эта выдача уже закрыта.");
      return null;
    }
    if (!res.ok) throw new Error("Не удалось оформить возврат");
    return (await res.json()) as Loan;
  };

  const toggleBook = async (bookId: string) => {
    if (!profile || pending.has(bookId) || busy) return;
    const book = profile.classBooks.find((cb) => cb.bookId === bookId)?.book;
    const active = activeLoanFor(bookId);
    const prev = profile; // снимок для отката
    const tempId = `temp-${bookId}`;

    // Оптимистичный отклик: галочка меняется в тот же миг.
    setProfile((p) =>
      !p
        ? p
        : active
          ? {
              ...p,
              loans: p.loans.filter((l) => l.id !== active.id),
            }
          : {
              ...p,
              loans: [
                {
                  id: tempId,
                  studentId: p.student.id,
                  bookId,
                  librarianId: null,
                  status: "ISSUED" as const,
                  issuedAt: new Date().toISOString(),
                  returnedAt: null,
                },
                ...p.loans,
              ],
            }
    );
    // Тактильный отклик сразу (оптимистично): «галочка нажата» чувствуется
    // пальцем, а не вычитывается глазами из списка.
    tap(active ? 5 : 12);
    setPending((s) => new Set(s).add(bookId));
    try {
      if (active) {
        const updated = await returnBook(active.id, book?.title);
        if (updated === "queued") {
          setProfile(prev); // нет сети: откат, операция ушла в очередь
          return;
        }
        if (typeof updated === "object" && updated) {
          flash("success", `«${book?.title}» возвращена.`);
        }
        // null — выдача уже закрыта кем-то ещё: состояние уже верное
      } else {
        const created = await issueBook(bookId);
        if (created === "queued") {
          setProfile(prev); // откат, операция в очереди
          return;
        }
        if (created === "dup") {
          flash("info", `«${book?.title}» уже выдана.`);
          return;
        }
        if (created === "nostock" || created === "notInSet") {
          setProfile(prev); // отказ сервера: галочка не должна остаться
          return;
        }
        if (created) {
          // подменяем временную запись настоящей (с id с сервера)
          setProfile((p) =>
            p
              ? { ...p, loans: p.loans.map((l) => (l.id === tempId ? created : l)) }
              : p
          );
          flash("success", `«${book?.title}» выдана.`);
        }
      }
    } catch (e) {
      setProfile(prev); // ошибка: возвращаем как было
      flash("error", e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(bookId);
        return n;
      });
    }
  };

  // Журнал непрерывного скана: последние книги — видны под камерой.
  const logScan = (title: string, ok: boolean, note?: string) =>
    setScanLog((l) => [{ title, ok, note }, ...l].slice(0, 4));

  const handleIsbn = async (isbn: string) => {
    if (!profile) return;
    const clean = isbn.trim();
    if (!clean) return;
    if (clean.includes("student") || clean.includes("qr=")) {
      flash("info", "Это QR-код ученика — используйте кнопку «Сканировать QR».");
      return;
    }
    // Сверка через формы ISBN, а не через точное совпадение строк: скан
    // EAN-13 обязан находить издание, заведённое в каталоге по 10-значному
    // ISBN (старые переиздания печатают его на обложке), и наоборот.
    const cb = profile.classBooks.find((b) => sameIsbn(b.book.isbn, clean));
    if (!cb) {
      flash("error", `ISBN ${clean} не входит в список учебников этого класса.`);
      tap([8, 40, 8]); // «не тот штрихкод» ощущается, не читается
      logScan(`ISBN ${clean}`, false, "не из списка класса");
      return;
    }
    const active = activeLoanFor(cb.bookId);
    if (active) {
      flash("info", `«${cb.book.title}» уже выдана — отмечьте чекбокс, чтобы принять возврат.`);
      logScan(cb.book.title, false, "уже выдана");
      return;
    }
    setBusy(true);
    try {
      const created = await issueBook(cb.bookId);
      if (created === "queued") {
        logScan(cb.book.title, true, "нет сети — в очереди");
        setManualIsbn("");
        return;
      }
      if (created === "dup") {
        logScan(cb.book.title, false, "уже выдана");
        setManualIsbn("");
        return;
      }
      if (created === "nostock") {
        logScan(cb.book.title, false, "нет в наличии");
        setManualIsbn("");
        return;
      }
      if (created === "notInSet") {
        logScan(cb.book.title, false, "не в наборе года");
        setManualIsbn("");
        return;
      }
      if (created) {
        setProfile((p) => (p ? { ...p, loans: [created, ...p.loans] } : p));
        flash("success", `«${cb.book.title}» выдана.`);
        logScan(cb.book.title, true, "выдана");
        tap(12);
      }
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Ошибка");
      logScan(cb.book.title, false, "ошибка");
    } finally {
      setBusy(false);
      setManualIsbn("");
    }
  };

  /**
   * «Выдать всё» — ОДИН запрос на /api/loans/bulk. Цикл по книгам стоил
   * round-trip на каждый учебник (11 на человека, 275 на класс), а на слабом
   * школьном сервере ещё и шанс поймать оборванный ответ посреди пачки.
   * В офлайне путь прежний — по одной операции в очередь: очередь умеет
   * только одиночные выдачи, и они хотя бы не теряются (см. offline-queue).
   */
  const issueAll = async () => {
    if (!profile || busy) return;
    const missing = profile.classBooks.filter((cb) => !activeLoanFor(cb.bookId));
    if (missing.length === 0) {
      flash("info", "Все учебники уже выданы.");
      return;
    }
    setBusy(true);

    let res: Response | null = null;
    try {
      res = await fetch("/api/loans/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: [profile.student.id],
          bookIds: missing.map((cb) => cb.bookId),
        }),
      });
    } catch {
      res = null; // сети нет: запрос до сервера не дошёл
    }

    if (!res) {
      let queued = 0;
      for (const cb of missing) {
        if ((await issueBook(cb.bookId)) === "queued") queued++;
      }
      flash(
        "info",
        `Нет сети: ${queued} операций сохранены — отправим при соединении.`
      );
      setBusy(false);
      return;
    }

    try {
      const data = (await res.json().catch(() => null)) as
        | (BulkResult & { error?: string })
        | null;
      if (!res.ok || !data) {
        flash("error", data?.error || "Не удалось выдать учебники");
        return;
      }
      const fresh = await fetch(
        `/api/student/${encodeURIComponent(profile.student.id)}?profile=1`
      );
      if (fresh.ok) setProfile((await fresh.json()) as ProfileData);
      const parts: string[] = [];
      if (data.noStock > 0) parts.push(`нет в наличии: ${data.noStock}`);
      if (data.notInSet > 0) parts.push(`не в наборе года: ${data.notInSet}`);
      if (data.already > 0) parts.push(`уже выданы: ${data.already}`);
      if (parts.length === 0) {
        flash("success", `Выдано учебников: ${data.created}.`);
        tap(12);
      } else if (data.created > 0) {
        flash("info", `Выдано ${data.created}, ${parts.join(", ")}.`);
      } else {
        flash("error", `Не выдано ничего (${parts.join(", ")}).`);
      }
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const issuedCount = useMemo(
    () =>
      profile
        ? profile.classBooks.filter((cb) => activeLoanFor(cb.bookId)).length
        : 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile]
  );

  const reset = () => {
    setProfile(null);
    setManualIsbn("");
    setManualQr("");
    setScanLog([]);
    setStatus({ kind: "info", message: null });
    // Следующее действие почти всегда — скан следующего ученика:
    // открываем камеру сразу (минус один тап на каждого ученика).
    // Не нужна камера — «Отмена» в сканере вернёт на этот экран.
    setScanningQr(true);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <StatusBanner
        status={status}
        onClear={() => setStatus({ kind: "info", message: null })}
      />

        {!profile && !scanningQr && picking && (
          <Card>
            {/* Выбор ученика из класса — когда карточка забыта или
                потеряна: класс → фамилия → профиль. Без QR. */}
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Выдача на класс</CardTitle>
              <button
                onClick={() => setPicking(false)}
                className="rounded-lg px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Назад
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              <label htmlFor="pick-class" className="eyebrow block text-muted-foreground">
                Класс
              </label>
              <select
                id="pick-class"
                value={pickedClassId}
                onChange={(e) => pickClass(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
              >
                <option value="">Выберите класс…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {studentsLoading && (
                <p className="text-sm text-muted-foreground">Загрузка…</p>
              )}
              {!studentsLoading && pickedClassId && classStudents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  В этом классе нет учеников.
                </p>
              )}
              {classStudents.length > 0 && (
                <>
                  {/* Без .filter(s => s.qrToken): раньше «карточки не
                      печатали» означало «выбрать некого», хотя это ровно тот
                      случай, когда список класса и есть путь к выдаче.
                      Ученик без карточки открывается по id (staff-роут). */}
                  <div className="cv-rows grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {classStudents.map((s) => (
                      <Button
                        key={s.id}
                        variant="outline"
                        className="h-11 justify-between gap-2"
                        onClick={() =>
                          loadProfile(
                            s.qrToken
                              ? { kind: "token", value: s.qrToken }
                              : { kind: "id", value: s.id }
                          ).catch(() =>
                            flash("error", "Не удалось открыть ученика")
                          )
                        }
                      >
                        <span className="truncate">
                          {s.lastName} {s.firstName}
                        </span>
                        {!s.qrToken && (
                          <span className="num shrink-0 text-[11px] text-muted-foreground">
                            без карточки
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>

                  <div className="border-t border-border pt-3">
                    <Button
                      variant="outline"
                      className="min-h-11 w-full"
                      disabled={classBusy}
                      onClick={issueToClass}
                    >
                      <CheckCheck className="mr-2 h-4 w-4" />
                      {classBusy
                        ? "Выдаю набор всему классу…"
                        : `Выдать набор всему классу (${classStudents.length})`}
                    </Button>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Учебники по списку класса, без сканирования: кому уже
                      выдано — пропустим, чего не хватило — покажем списком.
                    </p>

                    {classResult && (
                      <div className="mt-2 rounded-md border border-input bg-muted/40 p-3">
                        <p className="text-sm font-semibold">
                          Выдано {classResult.created} строк из{" "}
                          {classResult.total}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            classResult.already > 0 &&
                              `уже было выдано: ${classResult.already}`,
                            classResult.noStock > 0 &&
                              `не хватило экземпляров: ${classResult.noStock}`,
                            classResult.notInSet > 0 &&
                              `вне набора года: ${classResult.notInSet}`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "замечаний нет"}
                        </p>
                        {classResult.exceptions.length > 0 && (
                          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                            {classResult.exceptions.map((e, i) => (
                              <li
                                key={`${e.studentId}-${e.bookId}-${i}`}
                                className="flex items-baseline gap-2 text-xs"
                              >
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {e.studentName}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                  {e.bookTitle}
                                </span>
                                <span className="num shrink-0 text-destructive">
                                  {e.reason === "no_stock"
                                    ? "нет в наличии"
                                    : "не в наборе"}
                                </span>
                              </li>
                            ))}
                            {classResult.exceptionsTotal >
                              classResult.exceptions.length && (
                              <li className="text-xs text-muted-foreground">
                                …и ещё{" "}
                                {classResult.exceptionsTotal -
                                  classResult.exceptions.length}
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {!profile && !scanningQr && !picking && (
          <section className="panel p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow text-panel-muted">Рабочий экран</span>
              <span className="num text-sm text-panel-muted">3 шага</span>
            </div>
            {/* Пустой экран — это инструкция: пожилому сотруднику нужно
                видеть ВСЮ последовательность сразу, а не одну кнопку. */}
            <h2 className="mt-3 text-[1.6rem] leading-[1.2] sm:text-[1.9rem]">
              Выдача учебников
            </h2>
            <ol className="mt-5 space-y-2">
              {[
                "Отсканируйте QR-код ученика — с его карточки или телефона",
                "Отметьте учебники, которые отдаёте (или «Выдать всё»)",
                "Нажмите «Следующий ученик» внизу",
              ].map((text, i) => (
                <li
                  key={i}
                  className="panel-field flex items-center gap-3 p-3.5"
                >
                  <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm leading-snug sm:text-base">{text}</span>
                </li>
              ))}
            </ol>
            {/* Обычное начертание вместо CAPS-«кричалки»: главный жест и
                так самый крупный на экране, а читается строка короче. */}
            <Button
              size="lg"
              variant="hero"
              className="mt-5 w-full"
              onClick={() => setScanningQr(true)}
            >
              <ScanLine className="mr-2 h-5 w-5" />
              Сканировать QR ученика
            </Button>

            {/* Быстрые пути без скана: недавние ученики и выбор из
                класса — на случай «забыл карточку». */}
            {recent.length > 0 && (
              <div className="mt-5">
                <p className="eyebrow mb-2 text-panel-muted">Недавние</p>
                <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {recent.map((r) => (
                    <button
                      key={`${r.ref.kind}:${r.ref.value}`}
                      onClick={() =>
                        loadProfile(r.ref).catch(() =>
                          flash("error", "Профиль больше не открывается")
                        )
                      }
                      className="panel-field inline-flex min-h-11 shrink-0 snap-start items-center gap-2 px-3 text-sm font-semibold transition-colors hover:bg-white/20 active:scale-[0.985]"
                    >
                      {r.name}
                      {r.className && (
                        <span className="num text-xs font-normal text-panel-muted">
                          {r.className}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="panel"
                className="min-h-11 flex-1"
                onClick={openPicker}
              >
                <Users className="mr-2 h-4 w-4" /> Выбрать из класса
              </Button>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-panel-line" />
              <span className="eyebrow text-panel-muted">нет камеры — код с карточки</span>
              <div className="h-px flex-1 bg-panel-line" />
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                value={manualQr}
                size="lg"
                onChange={(e) => setManualQr(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitManualQr()}
                placeholder="Код с карточки ученика"
                aria-label="Код с карточки ученика"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className="flex-1 border-panel-line bg-white/12 text-panel-foreground shadow-none placeholder:text-panel-muted focus-visible:ring-2 focus-visible:ring-panel-foreground/50"
              />
              <Button
                variant="panel"
                disabled={!manualQr.trim()}
                onClick={submitManualQr}
              >
                Открыть
              </Button>
            </div>
          </section>
        )}

        {scanningQr && (
          <Card>
            <CardContent className="p-4">
              <Scanner
                formats={QR_FORMATS}
                onScan={handleQrScan}
                onClose={() => setScanningQr(false)}
                onError={(m) => {
                  flash("error", m);
                  setScanningQr(false);
                }}
              />
            </CardContent>
          </Card>
        )}

        {profile && (
          <>
            {/* Профиль ученика = панель жеста: имя крупно, прогресс, две
                кнопки действия и ручной ввод ISBN — всё на одном экране,
                без прокрутки. */}
            <section className="panel p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow text-panel-muted">
                    {profile.student.class
                      ? `Класс ${profile.student.class.name}`
                      : "Без класса"}
                  </p>
                  <h2 className="mt-1 truncate text-2xl font-extrabold leading-tight">
                    {profile.student.lastName} {profile.student.firstName}
                  </h2>
                </div>
                <span className="num shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold">
                  {issuedCount} / {profile.classBooks.length}
                </span>
              </div>

              {/* Прогресс: сколько выдано — видно без чтения цифр.
                  Track/fill — белый с прозрачностью: один fill, без градиентов. */}
              <div
                className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/20"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={profile.classBooks.length}
                aria-valuenow={issuedCount}
                aria-label="Выдано учебников"
              >
                <div
                  className="h-full rounded-full bg-panel-foreground"
                  style={{
                    width: `${
                      profile.classBooks.length
                        ? (issuedCount / profile.classBooks.length) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="hero"
                  className="min-h-12 flex-1 rounded-xl px-4 text-sm font-bold"
                  disabled={busy}
                  onClick={() => {
                    setScanLog([]);
                    setScanningBook(true);
                  }}
                >
                  <ScanLine className="mr-2 h-5 w-5" /> Сканировать ISBN
                </Button>
                <Button
                  variant="panel"
                  className="min-h-12 flex-1 rounded-xl"
                  disabled={busy || issuedCount === profile.classBooks.length}
                  onClick={issueAll}
                >
                  <CheckCheck className="mr-2 h-5 w-5" /> Выдать всё
                </Button>
              </div>

              <div className="mt-3 flex gap-2">
                <Input
                  size="lg"
                  value={manualIsbn}
                  onChange={(e) => setManualIsbn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleIsbn(manualIsbn)}
                  placeholder="ISBN вручную"
                  aria-label="Ввести ISBN вручную"
                  inputMode="numeric"
                  enterKeyHint="go"
                  className="flex-1 border-panel-line bg-white/12 font-mono text-panel-foreground shadow-none placeholder:text-panel-muted focus-visible:ring-2 focus-visible:ring-panel-foreground/50"
                />
                <Button
                  variant="panel"
                  disabled={busy || !manualIsbn.trim()}
                  onClick={() => handleIsbn(manualIsbn)}
                >
                  Выдать
                </Button>
              </div>
            </section>

            {scanningBook && (
              <>
                <Card>
                  <CardContent className="p-4">
                    <Scanner
                      formats={BOOK_FORMATS}
                      qrbox={{ width: 320, height: 140 }}
                      continuous
                      closeLabel="Готово"
                      onScan={(text) => {
                        handleIsbn(text);
                      }}
                      onClose={() => setScanningBook(false)}
                      onError={(m) => {
                        flash("error", m);
                        setScanningBook(false);
                      }}
                    />
                  </CardContent>
                </Card>
                {/* Отсканированное — сразу видно под камерой (баннер
                    наверху мог уехать за экран). */}
                {scanLog.length > 0 && (
                  <Card>
                    <CardContent className="space-y-1.5 p-3">
                      {scanLog.map((s, i) => (
                        <p
                          key={i}
                          className={
                            s.ok
                              ? "text-sm font-medium text-success"
                              : "text-sm font-medium text-destructive"
                          }
                        >
                          {s.ok ? "✓" : "✗"} {s.title}
                          {s.note && (
                            <span className="font-normal text-muted-foreground"> — {s.note}</span>
                          )}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Чек-лист учебников</CardTitle>
                <p className="text-xs text-muted-foreground">
                  тап по строке = выдать / вернуть
                </p>
              </CardHeader>
              <CardContent className="p-0 sm:p-0">
                {/* .cv-rows: строки вне экрана не раскладываются и не
                    рисуются — на списке из 30+ учебников и на «Журнале»
                    это самый заметный выигрыш плавности на слабом телефоне. */}
                <ul className="cv-rows divide-y divide-border">
                  {profile.classBooks.map((cb) => {
                    const active = activeLoanFor(cb.bookId);
                    const avail = profile.availability?.[cb.bookId];
                    const showStock =
                      !active && avail && avail.available < avail.total;
                    return (
                      <li
                        key={cb.bookId}
                        onClick={() =>
                          !busy && !pending.has(cb.bookId) && toggleBook(cb.bookId)
                        }
                        className={cn(
                          "flex min-h-16 items-center gap-3 px-4 py-3.5",
                          busy
                            ? "opacity-60"
                            : "cursor-pointer touch-manipulation select-none active:bg-accent/60",
                          active && "row-done"
                        )}
                      >
                        <Checkbox
                          checked={Boolean(active)}
                          onCheckedChange={() => toggleBook(cb.bookId)}
                          // Тап по чекбоксу не должен дойти до строки —
                          // иначе двойное переключение.
                          onClick={(e) => e.stopPropagation()}
                          disabled={busy || pending.has(cb.bookId)}
                          aria-label={cb.book.title}
                          className="h-7 w-7"
                        />
                        <div className="min-w-0 flex-1">
                          {/* div, а не p: внутри Badge (div) — div в <p>
                              даёт ошибку гидратации и лишний re-render */}
                          <div className="font-semibold leading-snug">
                            {cb.book.title}
                            {showStock && (
                              <Badge
                                variant={avail.available === 0 ? "destructive" : "warning"}
                                className="ml-2 align-middle"
                              >
                                {avail.available === 0
                                  ? "нет в наличии"
                                  : `${avail.available} в наличии`}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
                            {cb.book.subject} · <span className="num">ISBN {cb.book.isbn}</span>
                          </p>
                        </div>
                        {active && (
                          <span className="num shrink-0 rounded-full bg-success/15 px-2 py-1 text-[11px] font-bold text-success">
                            выдана {new Date(active.issuedAt).toLocaleDateString("ru-RU")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            {/* Нижний «док»: главный жест всегда под большим пальцем, а не
                в конце прокрутки. Sticky вместо fixed — на iOS при
                открытой клавиатуре fixed-панель уходит под неё. */}
            <div className="dock">
              <div className="flex items-center gap-2">
                <Button
                  size="pill"
                  className="min-w-0 flex-1"
                  onClick={reset}
                  disabled={busy}
                >
                  <UserPlus className="mr-2 h-5 w-5" />
                  Следующий ученик
                </Button>
                <Button
                  size="pill"
                  variant="outline"
                  onClick={() => {
                    setProfile(null);
                    setManualIsbn("");
                    setManualQr("");
                    setScanLog([]);
                    setStatus({ kind: "info", message: null });
                  }}
                >
                  Готово
                </Button>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
