"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  LogOut,
  PenLine,
  QrCode,
  ScanLine,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTitle } from "@/components/ui/section-title";
import { EmptyState } from "@/components/ui/empty-state";
import { Scanner } from "@/components/scanner";
import { StatusBanner, type Status } from "@/components/status-banner";
import { LOAN_STATUS_LABELS, type Student } from "@/lib/types";
import { extractQrToken } from "@/lib/qr-token";
import { QR_FORMATS } from "@/lib/scanner-formats";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

interface ProfileData {
  student: Student;
  classBooks: { classId: string; bookId: string; book: { title: string; subject: string; isbn: string } }[];
  loans: {
    id: string;
    bookId: string;
    status: string;
    issuedAt: string;
    returnedAt: string | null;
    compensatedAt?: string | null;
    book?: { title: string; subject: string; isbn: string };
  }[];
  /** bookId → { total, out, available }: сколько экземпляров ещё можно выдать. */
  availability?: Record<string, { total: number; out: number; available: number }>;
}

interface MyRequest {
  id: string;
  bookId: string;
  status: "PENDING" | "ISSUED" | "DECLINED";
  comment: string | null;
  createdAt: string;
  handledAt: string | null;
  book: { id: string; isbn: string; title: string; subject: string };
}

const REQUEST_LABELS: Record<MyRequest["status"], string> = {
  PENDING: "На рассмотрении",
  ISSUED: "Выдана",
  DECLINED: "Отказано",
};

const LOAN_COLORS: Record<string, string> = {
  ISSUED:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  RETURNED:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  LOST:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200",
};

function StudentProfile({ data }: { data: ProfileData }) {
  const { student, loans, classBooks } = data;
  const issued = loans.filter((l) => l.status === "ISSUED");
  const returned = loans.filter((l) => l.status === "RETURNED");
  const lost = loans.filter((l) => l.status === "LOST");

  const qrValue = `${window.location.origin}/student?qr=${student.qrToken ?? student.id}`;

  // --- Данные для входа (логин + пароль, только по собственной сессии) ---
  const [creds, setCreds] = useState<{ login: string; password: string } | null>(null);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"login" | "password" | null>(null);

  useEffect(() => {
    fetch("/api/student/me/credentials")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: { login: string; password: string }) => setCreds(j))
      .catch(() =>
        setCredsError("Появятся после первого входа по ссылке от учителя.")
      );
  }, []);

  const copyCred = async (key: "login" | "password", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // буфер обмена недоступен — можно скопировать вручную
    }
  };

  // --- Заявки на учебники ---
  const token = student.qrToken ?? student.id;
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqStatus, setReqStatus] = useState<Status>({ kind: "info", message: null });

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/student/qr/${token}/requests`);
      if (res.ok) setRequests(await res.json());
    } catch {
      // сеть недоступна — просто не показываем заявки
    }
  }, [token]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const requestBook = async (bookId: string, title: string) => {
    setReqBusy(true);
    try {
      const res = await fetch(`/api/student/qr/${token}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      if (res.ok) {
        setReqStatus({ kind: "success", message: `Заявка на «${title}» отправлена.` });
        loadRequests();
      } else {
        setReqStatus({ kind: "error", message: (await res.json()).error ?? "Не удалось создать заявку" });
      }
    } catch {
      setReqStatus({ kind: "error", message: "Нет сети — попробуйте позже." });
    } finally {
      setReqBusy(false);
    }
  };

  const cancelRequest = async (id: string, title: string) => {
    if (!confirm(`Отменить заявку на «${title}»?`)) return;
    setReqBusy(true);
    try {
      const res = await fetch(`/api/student/qr/${token}/requests/${id}`, { method: "DELETE" });
      if (res.ok) {
        setReqStatus({ kind: "success", message: `Заявка на «${title}» отменена.` });
        loadRequests();
      } else {
        setReqStatus({ kind: "error", message: (await res.json()).error ?? "Не удалось отменить" });
      }
    } catch {
      setReqStatus({ kind: "error", message: "Нет сети — попробуйте позже." });
    } finally {
      setReqBusy(false);
    }
  };

  const issuedBookIds = useMemo(
    () => new Set(issued.map((l) => l.bookId)),
    [issued]
  );
  const pendingBookIds = useMemo(
    () => new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.bookId)),
    [requests]
  );

  const initials = `${student.lastName[0] ?? ""}${student.firstName[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-5 pb-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-5">
          <div className="flex w-full items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight">
                {student.lastName} {student.firstName}
              </p>
              {student.class && (
                <p className="text-sm text-muted-foreground">
                  Класс {student.class.name}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <QRCodeSVG value={qrValue} size={176} level="M" />
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <QrCode className="h-4 w-4 shrink-0" />
            Покажите этот QR-код библиотекарю
          </p>
          <Link
            href={`/print/qr-cards?qr=${student.qrToken ?? student.id}`}
            target="_blank"
            className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80"
          >
            Печать моей QR-карточки
          </Link>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Ваши данные для входа
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Сохраните логин и пароль (или скриншот этого экрана) — по ним вы
            войдёте в кабинет с любого устройства, когда сессия закончится.
          </p>
          {creds ? (
            <div className="space-y-2">
              {(
                [
                  ["login", "Логин", creds.login],
                  ["password", "Пароль", creds.password],
                ] as const
              ).map(([key, label, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-white/80 px-3 py-2 dark:bg-card"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="truncate font-mono text-sm font-semibold">
                      {value}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => copyCred(key, value)}
                  >
                    {copied === key ? (
                      <Check className="mr-1 h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="mr-1 h-4 w-4" />
                    )}
                    {copied === key ? "Скопировано" : "Копировать"}
                  </Button>
                </div>
              ))}
            </div>
          ) : credsError ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {credsError}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          )}
        </CardContent>
      </Card>

      <section>
        <SectionTitle
          icon={BookOpen}
          title="Выданные учебники"
          count={issued.length}
        />
        <p className="mb-3 flex items-start gap-2 rounded-md bg-primary/5 p-3 text-sm text-muted-foreground">
          <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Не забудьте вписать свою фамилию в конце каждой выданных книги.
        </p>
        {issued.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Пока нет выданных учебников"
            description="Когда библиотекарь выдаст книги, они появятся здесь."
          />
        ) : (
          <ul className="space-y-2">
            {issued.map((loan) => (
              <li
                key={loan.id}
                className={`rounded-lg border p-3 ${LOAN_COLORS[loan.status]}`}
              >
                <p className="font-medium">
                  {loan.book?.title ?? "Учебник"}
                </p>
                <p className="text-sm opacity-80">
                  {loan.book?.subject} · ISBN {loan.book?.isbn}
                </p>
                <p className="mt-1 text-xs opacity-70">
                  Выдан: {new Date(loan.issuedAt).toLocaleDateString("ru-RU")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {student.qrToken && (
        <section>
          <SectionTitle icon={Clock} title="Запрошенные учебники" />
          <StatusBanner
            status={reqStatus}
            onClear={() => setReqStatus({ kind: "info", message: null })}
          />
          <p className="mb-3 text-sm text-muted-foreground">
            Нет нужной книги? Попросите её — библиотекарь увидит заявку и
            выдаст учебник.
          </p>
          {classBooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Для вашего класса пока нет списка учебников.
            </p>
          ) : (
            <ul className="space-y-2">
              {classBooks.map((cb) => {
                const isIssued = issuedBookIds.has(cb.bookId);
                const isPending = pendingBookIds.has(cb.bookId);
                const avail = data.availability?.[cb.bookId];
                const outOfStock = !isIssued && !isPending && avail?.available === 0;
                return (
                  <li
                    key={cb.bookId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{cb.book.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {cb.book.subject}
                        {outOfStock && (
                          <span className="text-amber-700">
                            {" "}· нет в наличии — выдадим, когда появится
                          </span>
                        )}
                      </p>
                    </div>
                    {isIssued ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Выдана
                      </span>
                    ) : isPending ? (
                      <button
                        onClick={() => cancelRequest(
                          requests.find((r) => r.bookId === cb.bookId && r.status === "PENDING")!.id,
                          cb.book.title
                        )}
                        disabled={reqBusy}
                        className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                        title="Отменить заявку"
                      >
                        Ожидает · отменить
                      </button>
                    ) : (
                      <button
                        onClick={() => requestBook(cb.bookId, cb.book.title)}
                        disabled={reqBusy}
                        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {outOfStock ? "Попросить (ожидание)" : "Попросить"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {requests.length > 0 && (
            <ul className="mt-3 space-y-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.book.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Отправлена {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                      {r.handledAt &&
                        ` · обработана ${new Date(r.handledAt).toLocaleDateString("ru-RU")}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.status === "PENDING"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : r.status === "ISSUED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {REQUEST_LABELS[r.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(returned.length > 0 || lost.length > 0) && (
        <section>
          <SectionTitle
            icon={CheckCircle2}
            title="История"
            count={returned.length + lost.length}
          />
          <ul className="space-y-2">
            {[...lost, ...returned].map((loan) => (
              <li
                key={loan.id}
                className={`rounded-lg border p-3 ${LOAN_COLORS[loan.status]}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{loan.book?.title ?? "Учебник"}</p>
                  {loan.status === "LOST" ? (
                    <XCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  )}
                </div>
                <p className="text-sm opacity-80">{LOAN_STATUS_LABELS[loan.status as keyof typeof LOAN_STATUS_LABELS]}</p>
                <p className="mt-1 text-xs opacity-70">
                  {loan.status === "LOST"
                    ? `Выдан: ${new Date(loan.issuedAt).toLocaleDateString("ru-RU")}`
                    : `Возвращён: ${new Date(loan.returnedAt ?? loan.issuedAt).toLocaleDateString("ru-RU")}`}
                  {loan.status === "LOST" && loan.compensatedAt && (
                    <span className="block">
                      Компенсирована:{" "}
                      {new Date(loan.compensatedAt).toLocaleDateString("ru-RU")}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface LastStudent {
  token: string;
  name: string;
  className: string | null;
}

const LAST_STUDENT_KEY = "uchebniki:lastStudent";

function readLastStudent(): LastStudent | null {
  try {
    const raw = window.localStorage.getItem(LAST_STUDENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastStudent;
    return v && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Вход в личный кабинет по личному QR-коду ученика.
 * Список учеников анонимам не показывается: кабинет открывает только
 * тот, кто предъявил свой QR (сканер приложения или камера телефона —
 * QR кодирует ссылку /student?qr=<токен>).
 */
function StudentLogin({
  lastStudent,
  onOpenLast,
  onToken,
  onError,
}: {
  lastStudent: LastStudent | null;
  onOpenLast: () => void;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  // Ручной ввод кода с карточки — если камеры нет или она недоступна.
  const [manualQr, setManualQr] = useState("");
  const [busy, setBusy] = useState(false);

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      onError("Введите логин и пароль.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/auth/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim(), password }),
      });
      // Прокси может ответить не-JSON (challenge) — не даём этому
      // уронить обработчик и оставить кнопку «Войти» занятой навсегда.
      const j = (await res.json().catch(() => null)) as
        | { qrToken?: string; error?: string }
        | null;
      if (res.ok && j?.qrToken) {
        onToken(j.qrToken);
      } else {
        onError(j?.error ?? `Сервер ответил ошибкой (HTTP ${res.status}).`);
      }
    } catch {
      // Таймаут (зависший через прокси запрос) или обрыв сети.
      onError("Сервер не отвечает. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  };

  // extractQrToken принимает и голый токен, и полную ссылку с карточки.
  const submitManualQr = () => {
    const token = extractQrToken(manualQr);
    if (!token) {
      onError("Введите код или ссылку с карточки.");
      return;
    }
    setManualQr("");
    onToken(token);
  };

  return (
    <div className="w-full space-y-4">
      {lastStudent && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Ваш кабинет</p>
              <p className="font-medium">{lastStudent.name}</p>
              {lastStudent.className && (
                <p className="text-xs text-muted-foreground">{lastStudent.className}</p>
              )}
            </div>
            <Button size="sm" onClick={onOpenLast}>
              Открыть
            </Button>
          </CardContent>
        </Card>
      )}

      {!scanning ? (
        <Card>
          {/* Шапка — как у входа персонала на /login: иконка, заголовок,
              подпись. Обе страницы входа выглядят родственными. */}
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <QrCode className="h-6 w-6 animate-icon-sway" />
            </div>
            <CardTitle className="text-xl">Вход в личный кабинет</CardTitle>
            <CardDescription>Кабинет ученика</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <form onSubmit={submitLogin} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="student-login" className="px-3">Логин</Label>
                <Input
                  id="student-login"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  // Логин чувствителен к регистру: гасим автокапитализацию
                  // и автозамену мобильной клавиатуры.
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="ivanov-8k2m"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="student-password" className="px-3">Пароль</Label>
                <PasswordInput
                  id="student-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? "Входим…" : "Войти"}
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground">
              Логин и пароль — у библиотекаря. Первый раз можно войти по
              ссылке от учителя или QR-коду.
            </p>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">или</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => setScanning(true)}
            >
              <ScanLine className="mr-2 h-5 w-5" /> Сканировать свой QR-код
            </Button>
            <div className="space-y-1">
              <div className="flex gap-2">
                <Input
                  value={manualQr}
                  onChange={(e) => setManualQr(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitManualQr()}
                  placeholder="Код с QR-карточки"
                  // Токен — hex/uuid: клавиатура не должна ничего «исправлять».
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-9"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={!manualQr.trim()}
                  onClick={submitManualQr}
                >
                  Открыть
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Нет камеры — введите код с карточки.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Scanner
          formats={QR_FORMATS}
          onScan={(text) => {
            setScanning(false);
            const token = extractQrToken(text);
            if (token) onToken(token);
            else onError("Не удалось распознать QR-код.");
          }}
          onClose={() => setScanning(false)}
          onError={(m) => {
            setScanning(false);
            onError(m);
          }}
        />
      )}
    </div>
  );
}

function StudentPageInner({ initialQr }: { initialQr: string | null }) {
  const searchParams = useSearchParams();
  const qr = searchParams.get("qr");
  const [data, setData] = useState<ProfileData | null>(null);
  // Активный кабинет ведём в состоянии, а не по живым searchParams:
  // history.replaceState не уведомляет роутер (иначе «Выйти» терялся бы).
  const [activeQr, setActiveQr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });
  const [lastStudent, setLastStudent] = useState<LastStudent | null>(null);

  useEffect(() => {
    setLastStudent(readLastStudent());
  }, []);

  const remember = (token: string, student: Student) => {
    const last: LastStudent = {
      token,
      name: `${student.lastName} ${student.firstName}`,
      className: student.class?.name ?? null,
    };
    try {
      window.localStorage.setItem(LAST_STUDENT_KEY, JSON.stringify(last));
      setLastStudent(last);
    } catch {
      // localStorage недоступен (private mode) — просто не запоминаем
    }
  };

  const forget = () => {
    try {
      window.localStorage.removeItem(LAST_STUDENT_KEY);
    } catch {
      // ignore
    }
    setLastStudent(null);
  };

  const loadProfile = useCallback(
    (token: string) => {
      fetchWithTimeout(`/api/student/qr/${token}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((json: ProfileData) => {
          setData(json);
          remember(token, json.student);
        })
        .catch(() => {
          // Неверный/чужой токен — на экран входа с ошибкой.
          setActiveQr(null);
          setStatus({
            kind: "error",
            message: "Не удалось открыть кабинет: проверьте код и связь.",
          });
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const openByToken = useCallback(
    (token: string) => {
      if (!token) return;
      setActiveQr(token);
      window.history.replaceState(null, "", `/student?qr=${token}`);
      loadProfile(token);
    },
    [loadProfile]
  );

  // Глубокая ссылка: QR-код с карточки, открытый камерой телефона —
  // /student?qr=<токен> (токен и есть личное доказательство ученика).
  useEffect(() => {
    if (qr) openByToken(qr);
  }, [qr, openByToken]);

  // Cookie-сессия (magic link или вход по логину/паролю): при первом
  // рендере открываем кабинет вошедшего ученика, если нет явного ?qr=.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!qr && initialQr) openByToken(initialQr);
  }, [qr, initialQr, openByToken]);

  const isProfile = activeQr !== null;

  const logout = () => {
    forget();
    setData(null);
    setActiveQr(null);
    // Cookie и полная перезагрузка: иначе сервер снова отдаст initialQr.
    void fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    }).finally(() => {
      window.location.assign("/student");
    });
  };

  return (
    <main className="flex min-h-screen flex-col">
      <PageHeader
        icon={QrCode}
        title={
          isProfile && data
            ? `${data.student.lastName} ${data.student.firstName}`
            : "Личный кабинет"
        }
        subtitle={
          isProfile && data?.student.class
            ? `Класс ${data.student.class.name}`
            : undefined
        }
        backLabel={isProfile ? undefined : "Назад"}
        actions={
          isProfile ? (
            <button
              onClick={logout}
              className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          ) : undefined
        }
      />

      {/* Экран входа центрируем по вертикали, как у персонала на /login;
          кабинет (профиль) — обычный поток сверху вниз. */}
      <div
        className={`mx-auto w-full max-w-md px-4 py-6${
          isProfile ? "" : " flex flex-1 flex-col justify-center"
        }`}
      >
        <StatusBanner
          status={status}
          onClear={() => setStatus({ kind: "info", message: null })}
        />

        {isProfile && !data && status.message === null && (
          <div className="space-y-3" aria-hidden>
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </div>
        )}

        {isProfile && data && <StudentProfile data={data} />}

        {!isProfile && (
          <StudentLogin
            lastStudent={lastStudent}
            onOpenLast={() =>
              lastStudent && openByToken(lastStudent.token)
            }
            onToken={openByToken}
            onError={(m) => setStatus({ kind: "error", message: m })}
          />
        )}
      </div>
    </main>
  );
}

export default function StudentPageClient({
  initialQr,
}: {
  initialQr: string | null;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Загрузка…</p>
        </main>
      }
    >
      <StudentPageInner initialQr={initialQr} />
    </Suspense>
  );
}
