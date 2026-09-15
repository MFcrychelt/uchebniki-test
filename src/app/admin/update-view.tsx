"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCw,
  Rocket,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GitVersion {
  short: string;
  full: string;
  subject: string;
  branch: string;
  date: string;
}

interface UpdateJob {
  running: boolean;
  phase: "pull" | "deps" | "build" | "restart" | null;
  message: string | null;
  logTail: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  outcome: "ok" | "error" | null;
}

interface UpdateStatus {
  version: GitVersion | null;
  branch: string | null;
  remote: string | null;
  /** Админ выбрал репозиторий обновлений, отличный от origin. */
  repoOverride: boolean;
  behind: number | null;
  newCommits: { short: string; subject: string }[];
  fetchError: string | null;
  job: UpdateJob;
}

const PHASE_LABELS: Record<NonNullable<UpdateJob["phase"]>, string> = {
  pull: "Обновление кода (git pull)",
  deps: "Зависимости (npm ci)",
  build: "Сборка сайта (npm run build)",
  restart: "Перезапуск сервера",
};

/**
 * «Обновления» — саммоуфр сайта из админки.
 * Сайт на сервере школы, разработчик пушит код в GitHub: здесь видно
 * текущую версию, проверяется отставание от origin и запускается
 * обновление (pull → npm ci → build → перезапуск).
 */
export default function UpdateView() {
  const [data, setData] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const runningRef = useRef(false);
  // Выбор репозитория обновлений (свой форк вместо origin).
  const [repoInput, setRepoInput] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoMsg, setRepoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const res = await fetch(
        `/api/admin/update/status${force ? "?refresh=1" : ""}`
      );
      if (res.ok) {
        const j = (await res.json()) as UpdateStatus;
        setData(j);
        runningRef.current = j.job.running;
        if (!j.job.running) setRestarting(false);
      } else if (runningRef.current) {
        setRestarting(true);
      }
    } catch {
      if (runningRef.current) setRestarting(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveRepo = async () => {
    setRepoSaving(true);
    setRepoMsg(null);
    try {
      const res = await fetch("/api/admin/update/repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoInput.trim() }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; repoUrl?: string | null; error?: string }
        | null;
      if (!res.ok) {
        setRepoMsg({ kind: "err", text: j?.error ?? "Не удалось сохранить" });
        return;
      }
      setRepoInput("");
      setRepoMsg({
        kind: "ok",
        text: j?.repoUrl
          ? `Обновления будут браться из ${j.repoUrl}`
          : "Вернулись к репозиторию origin",
      });
      load(true);
    } catch {
      setRepoMsg({ kind: "err", text: "Сервер не ответил" });
    } finally {
      setRepoSaving(false);
    }
  };

  // Опрос прогресса, пока обновление выполняется.
  useEffect(() => {
    if (!data?.job.running) return;
    const id = setInterval(() => load(), 2000);
    return () => clearInterval(id);
  }, [data?.job.running, load]);

  // Сервер ушёл на перезапуск: ждём, пока он поднимется, и перезагружаем.
  useEffect(() => {
    if (!restarting) return;
    const id = setInterval(() => window.location.reload(), 4000);
    return () => clearInterval(id);
  }, [restarting]);

  const checkUpdates = async () => {
    setChecking(true);
    await load(true);
    setChecking(false);
  };

  const runUpdate = async () => {
    setSubmitting(true);
    setDialogError(null);
    try {
      const res = await fetch("/api/admin/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = (await res.json()) as { started?: boolean; error?: string };
      if (res.ok && j.started) {
        setDialogOpen(false);
        setPassword("");
        load();
      } else {
        setDialogError(j.error ?? "Не удалось начать обновление");
      }
    } catch {
      setDialogError("Ошибка сети");
    } finally {
      setSubmitting(false);
    }
  };

  const job = data?.job;
  const behind = data?.behind;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Текущая версия
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data?.version ? (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                  {data.version.short}
                </span>
                <span className="font-medium">{data.version.subject}</span>
              </div>
              <p className="text-muted-foreground">
                Ветка{" "}
                <span className="font-mono text-xs">{data.version.branch}</span>
                {" · "}
                {new Date(data.version.date).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {data.remote && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  origin: {data.remote}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              {data ? "Версия неизвестна (git недоступен на сервере?)" : "Загрузка…"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Репозиторий обновлений</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Откуда получать обновления. По умолчанию —{" "}
            <span className="font-mono text-xs">origin</span>
            {data?.remote && (
              <>
                {" ("}
                <span className="font-mono text-xs break-all">
                  {data.remote}
                </span>
                {")"}
              </>
            )}
            . Можно указать свой форк на GitHub.
          </p>
          {data?.repoOverride && (
            <p className="rounded-md bg-warning/10 border border-warning/40 px-3 py-2 text-sm text-warning">
              Сейчас обновления тянутся из выбранного репозитория, а не из
              origin.
            </p>
          )}
          <div className="flex gap-2">
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && repoInput.trim() && saveRepo()}
              placeholder="https://github.com/владелец/имя"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              className="h-10"
            />
            <Button
              variant="secondary"
              className="h-10 shrink-0"
              disabled={repoSaving || (!repoInput.trim() && !data?.repoOverride)}
              onClick={saveRepo}
            >
              {repoSaving ? "Сохраняем…" : data?.repoOverride && !repoInput.trim() ? "Вернуть origin" : "Сохранить"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Приватный репозиторий — с токеном:{" "}
            <span className="font-mono">https://&lt;токен&gt;@github.com/…</span>{" "}
            (токен хранится только на сервере, в UI не показывается).
          </p>
          {repoMsg && (
            <p
              className={
                repoMsg.kind === "ok"
                  ? "text-sm text-success"
                  : "text-sm text-destructive"
              }
            >
              {repoMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Доступные обновления</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : data.fetchError ? (
            <div className="space-y-2">
              <p className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning-foreground">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Не удалось проверить обновления: {data.fetchError}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Если репозиторий приватный, серверу нужен доступ к GitHub:
                SSH-ключ на сервере либо токен в URL remote (
                <span className="font-mono text-xs">
                  git remote set-url origin https://&lt;токен&gt;@github.com/…
                </span>
                ).
              </p>
            </div>
          ) : behind === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Сайт на последней версии ветки {data.branch}.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Доступно обновлений: {behind}
              </p>
              <ul className="space-y-1">
                {data.newCommits.map((c) => (
                  <li
                    key={c.short}
                    className="flex items-baseline gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.short}
                    </span>
                    <span className="truncate">{c.subject}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={checkUpdates}
              disabled={checking || job?.running}
            >
              <RefreshCw className={checking ? "mr-1 h-4 w-4 animate-spin" : "mr-1 h-4 w-4"} />
              Проверить обновления
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Обновить сайт
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {restarting ? (
            <p className="flex items-center gap-2 rounded-md bg-primary/10 p-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Сервер перезапускается — страница обновится автоматически,
              когда сайт поднимется.
            </p>
          ) : job?.running ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {job.phase ? PHASE_LABELS[job.phase] : "Обновление…"}
                {job.message && (
                  <span className="font-normal text-muted-foreground">
                    — {job.message}
                  </span>
                )}
              </p>
              {job.logTail.length > 0 && (
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  {job.logTail.slice(-8).join("\n")}
                </pre>
              )}
              <p className="text-xs text-muted-foreground">
                Обновление обычно занимает 1–3 минуты. Не закрывайте страницу.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Сайт обновится до последней версии текущей ветки:
                <span className="font-mono text-xs"> git pull</span> →
                <span className="font-mono text-xs"> npm ci</span> (если
                менялись зависимости) →
                <span className="font-mono text-xs"> npm run build</span> →
                перезапуск. На это время (обычно 1–3 минуты) сайт будет
                недоступен.
              </p>
              {job?.outcome === "error" && job.error && (
                <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Предыдущее обновление не завершилось: {job.error}
                    {job.logTail.length > 0 && (
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-foreground">
                        {job.logTail.slice(-8).join("\n")}
                      </pre>
                    )}
                  </span>
                </p>
              )}
              <Button
                size="lg"
                disabled={behind === 0 || behind === null}
                onClick={() => {
                  setDialogError(null);
                  setDialogOpen(true);
                }}
              >
                <Rocket className="mr-2 h-4 w-4" />
                {behind
                  ? `Обновить сайт (${behind})`
                  : "Обновить сайт"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold">Обновить сайт?</h3>
              <button
                onClick={() => !submitting && setDialogOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Будут обновлены файлы на сервере: git pull, установка
              зависимостей и сборка. Сайт будет недоступен 1–3 минуты.
              Введите пароль администратора для подтверждения.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="update-password">Пароль администратора</Label>
                <Input
                  id="update-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runUpdate()}
                  autoFocus
                />
              </div>
              {dialogError && (
                <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                  {dialogError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                >
                  Отмена
                </Button>
                <Button
                  onClick={runUpdate}
                  disabled={submitting || !password}
                >
                  {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Обновить
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
