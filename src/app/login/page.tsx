"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
// CaseUpper — ближайший к «Caps Lock» значок в lucide (самого
// CapsLock в иконочном наборе нет).
import { ArrowLeft, CaseUpper, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LogoMark } from "@/components/ui/logo-mark";
import { ThemeToggle } from "@/components/theme";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { useDesktopAutoFocus } from "@/lib/use-desktop-autofocus";

/**
 * Вход персонала. Экран рассчитан на аудиторию: библиотекарь за старым
 * TN-монитором (часто в очках) или с телефона в библиотечном шкафу.
 *
 * Эргономика:
 *  - `size="lg"` у полей — 17px вводе и 48px высота (16px — минимум, ниже
 *    нельзя: iOS зумит; для «в очках» взяли с запасом);
 *  - подсказка про Caps Lock прямо под полем: «не подходит пароль» в
 *    половине случаев — включённый верхний регистр или русская раскладка;
 *  - под кнопкой — явный путь помощи: «Забыли пароль?» и «Инструкция по
 *    входу» ведут на /help/login (страница open access, её можно дать
 *    учителю или распечатать);
 *  - заголовок и подписи полей — обычное полужирное начертание системного
 *    sans-serif, без «плакатной» плотности: экран должен читаться как
 *    рабочий инструмент, а не как лендинг;
 *  - labels связаны с полями (htmlFor/id), ошибка — role="alert",
 *    enterKeyHint — «Далее»/«Перейти» на клавиатуре;
 *  - автофокус в логин — ТОЛЬКО на устройствах с клавиатурой (см.
 *    useDesktopAutoFocus): на телефоне и в PWA клавиатура, открытая сама,
 *    пересобирала viewport и экран мигал по кругу.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/librarian";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  // Фокус в логин ставим только там, где есть физическая клавиатура:
  // на телефоне/в PWA автофокус открывал клавиатуру сам, viewport
  // пересобирался под неё, и экран входил в бесконечное мигание.
  const loginRef = useDesktopAutoFocus<HTMLInputElement>();

  // Caps Lock определяем по событию клавиатуры (getModifierState): статус
  // поля нужен ДО попытки входа, а не после красной ошибки.
  const modKeys = {
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) =>
      setCapsOn(Boolean(e.getModifierState?.("CapsLock"))),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) =>
      setCapsOn(Boolean(e.getModifierState?.("CapsLock"))),
    onBlur: () => setCapsOn(false),
  };

  // Уже вошёл? Тогда сразу на место. После «Выйти» (?out=1) не
  // перекидываем обратно — иначе кажется, что выход сломан.
  useEffect(() => {
    if (searchParams.get("out")) return;
    fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then(async (r) => {
        const j = await r.json();
        if (j.authenticated) router.replace(from);
      })
      .catch(() => {});
  }, [router, from, searchParams]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim(), password }),
      });
      // Прокси (Cloudflare и т.п.) может ответить HTML-страницей
      // (challenge) — без .catch() res.json() бросал необработанную
      // ошибку и кнопка «Входим…» висела навсегда.
      const j = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        setError(j?.error ?? `Сервер ответил ошибкой (HTTP ${res.status})`);
        return;
      }

      // Проверяем, что кука сессии реально сохранилась: при заблоки-
      // рованных cookie вход «получался», но /librarian тут же отсылал
      // обратно на /login — выглядело как «не входит» без объяснений.
      const me = await fetchWithTimeout("/api/auth/me")
        .then((r) => r.json())
        .catch(() => null);
      if (!me?.authenticated) {
        setError("Сессия не сохранилась — разрешите cookie и попробуйте снова.");
        return;
      }

      router.replace(from);
    } catch {
      // AbortController по таймауту или обрыв сети: показываем причину
      // вместо вечного «Входим…».
      setError("Сервер не отвечает. Проверьте связь и попробуйте снова.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="safe-x safe-b flex min-h-dvh flex-col pt-2">
      <div className="flex items-center justify-end gap-1">
        <ThemeToggle />
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Назад</span>
        </Link>
      </div>

      {/* items-start на телефоне: при открытой клавиатуре центр экрана
          уезжает вверх, и форма с кнопкой оказываются под ней. */}
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-start gap-4 pt-6 sm:justify-center sm:pt-0">
        <section className="panel p-5 sm:p-7">
          {/* Знак библиотеки — «живой»: экран входа с полем логина иначе
              выглядит как недогрузившаяся страница. */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="eyebrow text-panel-muted">Кабинет персонала</span>
            <LogoMark />
          </div>
          <h1 className="text-[1.7rem] leading-snug">Вход в систему</h1>

          <form onSubmit={submit} className="mt-6 space-y-2">
            <label htmlFor="login" className="block pt-1 text-[13px] font-semibold tracking-normal text-panel-muted">
              Логин
            </label>
            <Input
              ref={loginRef}
              id="login"
              name="username"
              size="lg"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              // Телефонная клавиатура по умолчанию делает первую букву
              // заглавной и «подправляет» слово — логин ломается.
              className="panel-field border-panel-line bg-white/12 text-panel-foreground shadow-none placeholder:text-panel-muted focus-visible:ring-2 focus-visible:ring-panel-foreground/50"
              placeholder="library"
              {...modKeys}
            />
            <label htmlFor="password" className="block pt-3 text-[13px] font-semibold tracking-normal text-panel-muted">
              Пароль
            </label>
            <PasswordInput
              id="password"
              name="password"
              size="lg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
              className="panel-field border-panel-line bg-white/12 text-panel-foreground shadow-none placeholder:text-panel-muted focus-visible:ring-2 focus-visible:ring-panel-foreground/50"
              {...modKeys}
            />

            {/* Статус, а не ошибка: подсказка появляется в тот момент, когда
                человек ещё печатает, и объясняет «почему не входит» до
                попытки. Роль status — чтобы не перебивала чтение формы. */}
            {capsOn && (
              <p
                role="status"
                className="flex items-center gap-2 pt-1 text-[13px] font-medium text-panel-foreground"
              >
                <CaseUpper className="h-4 w-4 shrink-0" aria-hidden />
                Caps Lock включён · логин и пароль — строчными латинскими
                буквами
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-panel-line bg-destructive/25 px-3 py-2.5 text-[15px] font-medium leading-snug text-panel-foreground"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              variant="hero"
              disabled={busy}
              className="mt-3 w-full"
            >
              <KeyRound className="mr-2 h-5 w-5" />
              {busy ? "Входим…" : "Войти"}
            </Button>

            {/* Путь помощи: «не могу войти» без этой ссылки = звонок
                администратору или брошенная работа. */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pb-1 text-[15px]">
              <Link
                href="/help/login#zabyli-parol"
                className="inline-flex min-h-10 items-center gap-1.5 text-panel-foreground underline decoration-panel-line underline-offset-4 transition-opacity hover:opacity-80"
              >
                Забыли пароль?
              </Link>
              <Link
                href="/help/login"
                className="inline-flex min-h-10 items-center gap-1.5 text-panel-muted underline decoration-panel-line underline-offset-4 transition-colors hover:text-panel-foreground"
              >
                Инструкция по входу
              </Link>
            </div>
          </form>

          {/* Куда идти ученику, который открыл не тот адрес: подпись
              убрана из-под заголовка (персоналу она только мешала) и
              поставлена в самый низ блока — после «Войти» и помощи. */}
          <p className="mt-5 border-t border-panel-line pt-3.5 text-center text-[15px] text-panel-muted">
            Ученик — в{" "}
            <Link
              href="/student"
              className="inline-flex min-h-10 items-center font-semibold text-panel-foreground underline underline-offset-4 transition-opacity hover:opacity-85"
            >
              личный кабинет
            </Link>
          </p>
        </section>

      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-muted-foreground">Загрузка…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
