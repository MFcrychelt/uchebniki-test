"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCheck,
  ScanLine,
  UserPlus,
  Users,
} from "lucide-react";
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

/** Недавние ученики: вернуться к прошлому профилю одним тапом. */
interface RecentStudent {
  token: string;
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
    return Array.isArray(v) ? v.filter((x) => x && typeof x.token === "string") : [];
  } catch {
    return [];
  }
}

function rememberRecent(item: RecentStudent) {
  try {
    const rest = readRecent().filter((x) => x.token !== item.token);
    localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...rest].slice(0, RECENT_MAX)));
  } catch {
    // private mode — не критично
  }
}

export default function IssueFlow() {
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
  // Журнал непрерывного скана ISBN: последние отсканированные книги.
  const [scanLog, setScanLog] = useState<{ title: string; ok: boolean; note?: string }[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  const flash = useCallback(
    (kind: Status["kind"], message: string) =>
      setStatus({ kind, message }),
    []
  );

  const loadProfile = useCallback(
    async (token: string) => {
      const res = await fetch(`/api/student/qr/${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error("Ученик не найден");
      const data = (await res.json()) as ProfileData;
      setProfile(data);
      setScanningQr(false);
      setPicking(false);
      flash("success", `Профиль: ${data.student.lastName} ${data.student.firstName}`);
      // Запоминаем для «Недавних» — вернуться одним тапом.
      const item: RecentStudent = {
        token,
        name: `${data.student.lastName} ${data.student.firstName}`,
        className: data.student.class?.name ?? null,
      };
      rememberRecent(item);
      setRecent((prev) => [item, ...prev.filter((x) => x.token !== token)].slice(0, RECENT_MAX));
    },
    [flash]
  );

  const openByToken = (token: string) => {
    loadProfile(token).catch((e: Error) =>
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
  useEffect(() => {
    const token = profile?.student.qrToken ?? profile?.student.id;
    if (!token) return;
    const reload = () =>
      fetch(`/api/student/qr/${encodeURIComponent(token)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setProfile(data))
        .catch(() => {});
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
  }, [profile?.student.qrToken, profile?.student.id]);

  // Недавние ученики — из localStorage при первом рендере.
  useEffect(() => {
    setRecent(readRecent());
  }, []);

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

  const activeLoanFor = (bookId: string) =>
    profile?.loans.find((l) => l.bookId === bookId && l.status === "ISSUED");

  const issueBook = async (
    bookId: string
  ): Promise<Loan | "queued" | "dup" | "nostock" | null> => {
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
      const json = await res.json().catch(() => null);
      const msg =
        json && typeof json === "object" && "error" in json
          ? String((json as { error: unknown }).error)
          : "";
      if (msg.includes("экземпляры")) {
        flash("error", `«${book?.title ?? "Книга"}»: ${msg}`);
        return "nostock";
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
        if (created === "nostock") {
          setProfile(prev); // нет экземпляров: откат
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
    const cb = profile.classBooks.find(
      (b) => b.book.isbn.replace(/-/g, "") === clean.replace(/-/g, "")
    );
    if (!cb) {
      flash("error", `ISBN ${clean} не входит в список учебников этого класса.`);
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
      if (created) {
        setProfile((p) => (p ? { ...p, loans: [created, ...p.loans] } : p));
        flash("success", `«${cb.book.title}» выдана.`);
        logScan(cb.book.title, true, "выдана");
      }
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Ошибка");
      logScan(cb.book.title, false, "ошибка");
    } finally {
      setBusy(false);
      setManualIsbn("");
    }
  };

  const issueAll = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const missing = profile.classBooks.filter(
        (cb) => !activeLoanFor(cb.bookId)
      );
      if (missing.length === 0) {
        flash("info", "Все учебники уже выданы.");
        return;
      }
      let failed = 0;
      let queued = 0;
      let dup = 0;
      let nostock = 0;
      for (const cb of missing) {
        try {
          const r = await issueBook(cb.bookId);
          if (r === "queued") queued++;
          else if (r === "dup") dup++;
          else if (r === "nostock") nostock++;
        } catch {
          failed++;
        }
      }
      // Перечитываем профиль после пакетной выдачи (если сеть есть).
      if (queued === 0) {
        const res = await fetch(
          `/api/student/qr/${encodeURIComponent(profile.student.qrToken!)}`
        );
        if (res.ok) setProfile(await res.json());
      }
      const issued = missing.length - failed - queued - dup - nostock;
      const parts: string[] = [];
      if (issued > 0) parts.push(`выдано ${issued}`);
      if (nostock > 0) parts.push(`нет в наличии: ${nostock}`);
      if (dup > 0) parts.push(`уже выданы: ${dup}`);
      if (failed > 0) parts.push(`ошибок: ${failed}`);
      if (queued > 0) parts.push(`в очереди (нет сети): ${queued}`);
      if (failed === 0 && queued === 0 && dup === 0 && nostock === 0) {
        flash("success", `Выдано учебников: ${missing.length}.`);
      } else if (failed > 0 || nostock > 0) {
        flash("error", `Выданы не все книги (${parts.join(", ")}).`);
      } else {
        flash("info", parts.join(", "));
      }
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
              <CardTitle>Выбор ученика из класса</CardTitle>
              <button
                onClick={() => setPicking(false)}
                className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Назад
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                value={pickedClassId}
                onChange={(e) => pickClass(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-card px-2 text-base"
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {classStudents
                    .filter((s) => s.qrToken)
                    .map((s) => (
                      <Button
                        key={s.id}
                        variant="outline"
                        className="h-11 justify-start"
                        onClick={() => openByToken(s.qrToken!)}
                      >
                        {s.lastName} {s.firstName}
                      </Button>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!profile && !scanningQr && !picking && (
          <Card>
            {/* Пустой экран — это инструкция: пожилому сотруднику нужно
                видеть ВСЮ последовательность сразу, а не одну кнопку. */}
            <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
              <div className="text-center">
                <p className="text-lg font-semibold">Выдача учебников</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Три шага — на каждого ученика
                </p>
              </div>
              <ol className="space-y-3">
                {[
                  "Отсканируйте QR-код ученика — с его карточки или телефона",
                  "Отметьте учебники, которые отдаёте (или нажмите «Выдать всё»)",
                  "Нажмите «Следующий ученик» внизу",
                ].map((text, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="text-sm sm:text-base">{text}</span>
                  </li>
                ))}
              </ol>
              <Button size="lg" className="h-12 w-full text-base" onClick={() => setScanningQr(true)}>
                <ScanLine className="mr-2 h-6 w-6" /> Сканировать QR-код ученика
              </Button>

              {/* Быстрые пути без скана: недавние ученики и выбор из
                  класса — на случай «забыл карточку». */}
              <div className="space-y-2">
                {recent.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Недавние
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((r) => (
                        <button
                          key={r.token}
                          onClick={() => openByToken(r.token)}
                          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
                        >
                          {r.name}
                          {r.className && (
                            <span className="text-xs text-muted-foreground">
                              {r.className}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 w-full"
                  onClick={openPicker}
                >
                  <Users className="mr-2 h-5 w-5" /> Нет карточки — выбрать из класса
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">
                    нет камеры — введите код с карточки
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={manualQr}
                    onChange={(e) => setManualQr(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitManualQr()}
                    placeholder="Код с карточки ученика"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-11"
                  />
                  <Button
                    variant="secondary"
                    className="h-11 shrink-0"
                    disabled={!manualQr.trim()}
                    onClick={submitManualQr}
                  >
                    Открыть
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {scanningQr && (
          <Scanner
            formats={QR_FORMATS}
            onScan={handleQrScan}
            onClose={() => setScanningQr(false)}
            onError={(m) => {
              flash("error", m);
              setScanningQr(false);
            }}
          />
        )}

        {profile && (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">
                    {profile.student.lastName} {profile.student.firstName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {profile.student.class
                      ? `Класс ${profile.student.class.name}`
                      : "Без класса"}
                  </p>
                </div>
                <Badge variant={issuedCount === profile.classBooks.length ? "success" : "secondary"}>
                  {issuedCount} / {profile.classBooks.length} выдано
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Прогресс-бар: сколько выдано, видно без чтения цифр */}
                <div
                  className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={profile.classBooks.length}
                  aria-valuenow={issuedCount}
                  aria-label="Выдано учебников"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${
                        profile.classBooks.length
                          ? (issuedCount / profile.classBooks.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Отметьте учебник, когда отдаёте его ученику. Сняли галочку —
                  вернули книгу.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="lg"
                    className="h-11 flex-1"
                    disabled={busy}
                    onClick={() => {
                      setScanLog([]);
                      setScanningBook(true);
                    }}
                  >
                    <ScanLine className="mr-2 h-5 w-5" /> Сканировать ISBN
                  </Button>
                  <Button
                    size="lg"
                    className="h-11 flex-1"
                    disabled={busy || issuedCount === profile.classBooks.length}
                    onClick={issueAll}
                  >
                    <CheckCheck className="mr-2 h-5 w-5" /> Выдать всё
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={manualIsbn}
                    onChange={(e) => setManualIsbn(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleIsbn(manualIsbn)}
                    placeholder="Ввести ISBN вручную"
                    inputMode="numeric"
                    className="h-11"
                  />
                  <Button
                    variant="secondary"
                    className="h-11 shrink-0"
                    disabled={busy || !manualIsbn.trim()}
                    onClick={() => handleIsbn(manualIsbn)}
                  >
                    Выдать
                  </Button>
                </div>
              </CardContent>
            </Card>

            {scanningBook && (
              <>
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
                              ? "text-sm text-success"
                              : "text-sm text-destructive"
                          }
                        >
                          {s.ok ? "✓" : "✗"} {s.title}
                          {s.note && (
                            <span className="text-muted-foreground"> — {s.note}</span>
                          )}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Чек-лист учебников</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
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
                        className={
                          busy
                            ? "flex items-center gap-3.5 py-3.5 opacity-60"
                            : "flex cursor-pointer touch-manipulation select-none items-center gap-3.5 py-3.5 active:bg-accent/60"
                        }
                      >
                        <Checkbox
                          checked={Boolean(active)}
                          onCheckedChange={() => toggleBook(cb.bookId)}
                          // Тап по чекбоксу не должен дойти до строки —
                          // иначе двойное переключение.
                          onClick={(e) => e.stopPropagation()}
                          disabled={busy || pending.has(cb.bookId)}
                          aria-label={cb.book.title}
                          className="h-6 w-6"
                        />
                        <div className="min-w-0 flex-1">
                          {/* div, а не p: внутри Badge (div) — div в <p>
                              даёт ошибку гидратации и лишний re-render */}
                          <div className="truncate font-medium">
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
                          <p className="truncate text-sm text-muted-foreground">
                            {cb.book.subject} · ISBN {cb.book.isbn}
                          </p>
                        </div>
                        {active && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            выдана{" "}
                            {new Date(active.issuedAt).toLocaleDateString("ru-RU")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            <Button size="lg" variant="outline" onClick={reset} className="h-12 w-full text-base">
              <UserPlus className="mr-2 h-5 w-5" /> Следующий ученик
            </Button>
          </>
        )}
    </div>
  );
}
