"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, KeyRound, Library } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { ThemeToggle } from "@/components/theme";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/librarian";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-3 top-3 flex items-center gap-1 sm:right-6 sm:top-6">
        <ThemeToggle />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Library className="h-6 w-6 animate-icon-sway" />
          </div>
          <CardTitle className="text-xl">Вход в систему</CardTitle>
          <CardDescription>Кабинет персонала</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="login" className="px-3 text-sm font-medium">
                Логин
              </label>
              <Input
                id="login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                // Телефонная клавиатура по умолчанию делает первую букву
                // заглавной и «подправляет» слово — логин ломается.
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="px-3 text-sm font-medium">
                Пароль
              </label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full">
              <KeyRound className="mr-2 h-4 w-4" />
              {busy ? "Входим…" : "Войти"}
            </Button>
          </form>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Вы ученик?{" "}
            <Link href="/student" className="text-primary underline">
              Личный кабинет
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Загрузка…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
