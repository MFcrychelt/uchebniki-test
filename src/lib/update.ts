import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { getGitVersion, type GitVersion } from "./version";
import { getRepoOverride } from "./update-repo";

const pExecFile = promisify(execFile);

const GIT_TIMEOUT_MS = 60_000;
const CMD_TIMEOUT_MS = 15 * 60_000; // npm ci / build на слабом сервере
const STATUS_TTL_MS = 30_000;

/**
 * Саммоуфр сайта из админки (расширенная админка, этап 2).
 *
 * Сценарий: сайт развёрнут на сервере школы, разработчик дома пушит код
 * в GitHub. Администратор из вкладки «Обновления»:
 *   1) видит текущую версию (git HEAD);
 *   2) нажимает «Проверить» — `git fetch origin <ветка>` + отставание;
 *   3) нажимает «Обновить» (подтверждение паролем админа) —
 *      `git pull --ff-only` → `npm ci` (если менялся package-lock.json) →
 *      `npm run build` → перезапуск.
 *
 * Перезапуск: если задан RESTART_CMD в .env (например,
 * `pm2 restart school-library` или `systemctl restart school-library`) —
 * выполняем его; иначе процесс сам завершается, и поднимает его
 * надзиратель (pm2/systemd/docker --restart).
 *
 * Безопасность:
 *  - только ADMIN (adminGuard) + повторный ввод пароля администратора;
 *  - git/npm — через execFile/spawn без shell (инъекций нет);
 *  - только ветка, на которой сейчас сервер, и только remote `origin`;
 *  - `--ff-only`: дивергенция не приводит к «честному» merge;
 *  - URL remote и ошибки маскируются (токен не попадает в UI/логи).
 */

export interface UpdateJob {
  running: boolean;
  phase: "pull" | "deps" | "build" | "restart" | null;
  message: string | null;
  logTail: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Результат предыдущего запуска. */
  outcome: "ok" | "error" | null;
}

const job: UpdateJob = {
  running: false,
  phase: null,
  message: null,
  logTail: [],
  error: null,
  startedAt: null,
  finishedAt: null,
  outcome: null,
};

function pushLog(line: string) {
  job.logTail = [...job.logTail.slice(-49), line];
}

// --- git ---

function runGit(args: string[]): Promise<string> {
  return pExecFile("git", args, {
    cwd: process.cwd(),
    timeout: GIT_TIMEOUT_MS,
  }).then((r) => r.stdout.trim());
}

/** Маскируем учётные данные (токен в URL), если они попали в строку. */
export function maskSecrets(s: string): string {
  // Всё между "://" и первым "@" в URL — userinfo (логин, токен, пароль).
  return s
    .replace(/:\/\/([^/@]+)@/g, "://••••••••@")
    .replace(/https?:\/\/(gh[pousr]_?[\w-]+|[\w-]{30,})@/g, "https://••••••••@");
}

/** Извлекаем человекочитаемую строку ошибки из вывода git. */
export function extractGitError(e: unknown): string {
  const msg = e instanceof Error ? e.message || String(e) : String(e);
  const lines = msg
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const interesting =
    lines.find((l) => /^(fatal|error|warning):/i.test(l)) ??
    lines[lines.length - 1];
  return maskSecrets(interesting ?? "неизвестная ошибка git");
}

async function currentBranch(): Promise<string | null> {
  try {
    const b = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    return b && b !== "HEAD" ? b : null;
  } catch {
    return null;
  }
}

async function remoteUrl(): Promise<string | null> {
  try {
    const u = await runGit(["remote", "get-url", "origin"]);
    return u || null;
  } catch {
    return null;
  }
}

// --- статус (проверка доступных обновлений) ---

export interface UpdateStatus {
  version: GitVersion | null;
  branch: string | null;
  remote: string | null; // маскированный URL
  /** На сколько коммитов мы отстаём от origin/<ветка>; null — не удалось проверить. */
  behind: number | null;
  newCommits: { short: string; subject: string }[];
  fetchError: string | null; // маскированная
  job: UpdateJob;
}

interface RemoteStatus {
  version: GitVersion | null;
  branch: string | null;
  remote: string | null;
  /** Админ выбрал репозиторий обновлений, отличный от origin. */
  repoOverride: boolean;
  behind: number | null;
  newCommits: { short: string; subject: string }[];
  fetchError: string | null;
}

let statusCache: { at: number; value: RemoteStatus } | null = null;

async function computeRemoteStatus(): Promise<RemoteStatus> {
  const [version, branch, remote, override] = await Promise.all([
    getGitVersion(),
    currentBranch(),
    remoteUrl(),
    getRepoOverride(),
  ]);

  // Источник обновлений: выбранный админом репозиторий или origin.
  const source = override ?? (remote ? "origin" : null);

  const base: RemoteStatus = {
    version,
    branch,
    remote: override
      ? maskSecrets(override)
      : remote
        ? maskSecrets(remote)
        : null,
    /** Выбран ли отличный от origin репозиторий (для UI). */
    repoOverride: Boolean(override),
    behind: null,
    newCommits: [],
    fetchError: null,
  };
  if (!branch) {
    base.fetchError = "Не удалось определить ветку (git недоступен?)";
    return base;
  }
  if (!source) {
    base.fetchError = "Нет remote `origin` — сервер не может тянуть обновления";
    return base;
  }

  try {
    // FETCH_HEAD: fetch по URL/remote не всегда обновляет
    // refs/remotes/… — используем надёжный FETCH_HEAD.
    await runGit(["fetch", "--quiet", source, branch]);
    const behind = Number(
      await runGit(["rev-list", "--count", "HEAD..FETCH_HEAD"])
    );
    base.behind = Number.isFinite(behind) ? behind : 0;
    if (base.behind > 0) {
      // `--oneline=N` — невалидный синтаксис git: счётчик — отдельный аргумент.
      const log = await runGit([
        "log",
        "--oneline",
        `-${Math.min(base.behind, 10)}`,
        "HEAD..FETCH_HEAD",
      ]);
      base.newCommits = log
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [short, ...rest] = line.split(" ");
          return { short, subject: rest.join(" ") };
        });
    }
  } catch (e) {
    base.fetchError = extractGitError(e);
  }
  return base;
}

export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
  if (force || !statusCache || Date.now() - statusCache.at > STATUS_TTL_MS) {
    statusCache = { at: Date.now(), value: await computeRemoteStatus() };
  }
  return { ...statusCache.value, job: { ...job, logTail: [...job.logTail] } };
}

/** Смена репозитория обновлений — статус пересчитать немедленно. */
export function invalidateUpdateStatus() {
  statusCache = null;
}

// --- выполнение обновления ---

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      env: { ...process.env, CI: "1" },
    });
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trimEnd();
        buf = buf.slice(i + 1);
        if (line) pushLog(line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} не завершилась за ${CMD_TIMEOUT_MS / 60000} мин`));
    }, CMD_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} завершилась с кодом ${code}`));
    });
  });
}

async function runPipeline(): Promise<void> {
  try {
    const branch = await currentBranch();
    if (!branch) throw new Error("Неизвестная ветка — не могу обновляться");

    // 1) git pull --ff-only (из origin или выбранного админом репозитория)
    const override = await getRepoOverride();
    const source = override ?? "origin";
    job.phase = "pull";
    job.message = `git pull --ff-only ${override ? "выбранный репозиторий" : "origin"} ${branch}`;
    const oldHead = await runGit(["rev-parse", "HEAD"]);
    await runGit(["pull", "--ff-only", source, branch]);
    const newHead = await runGit(["rev-parse", "HEAD"]);

    // 2) зависимости: только если менялся package-lock.json
    job.phase = "deps";
    let installDeps = false;
    if (oldHead !== newHead) {
      try {
        await runGit(["diff", "--quiet", oldHead, newHead, "--", "package-lock.json"]);
      } catch {
        installDeps = true; // ненулевой exit = файл изменился
      }
    }
    if (installDeps) {
      job.message = "npm ci (установка зависимостей — может занять несколько минут)";
      await runCmd("npm", ["ci", "--no-audit", "--no-fund"]);
    } else {
      job.message = "Зависимости не изменились — пропускаем установку";
    }

    // 3) сборка
    job.phase = "build";
    job.message = "npm run build (сборка сайта)";
    await runCmd("npm", ["run", "build"]);

    // 4) перезапуск
    job.phase = "restart";
    const restartCmd = (process.env.RESTART_CMD ?? "").trim();
    job.running = false;
    job.outcome = "ok";
    job.finishedAt = new Date().toISOString();
    if (restartCmd) {
      job.message = `Перезапуск: ${restartCmd}`;
      // Скрипт/команда ждёт освобождения порта — даём клиенту увидеть
      // фазу рестарта, затем завершаем процесс.
      spawn(restartCmd, {
        shell: true,
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
      }).unref();
      setTimeout(() => process.exit(0), 1500);
    } else {
      job.message =
        "Готово. Процесс завершится — сервер поднимет надзиратель (pm2/systemd/docker).";
      setTimeout(() => process.exit(0), 2000);
    }
    job.phase = null;
  } catch (e) {
    job.running = false;
    job.outcome = "error";
    job.phase = null;
    job.finishedAt = new Date().toISOString();
    job.error = maskSecrets(e instanceof Error ? e.message || String(e) : String(e));
  }
}

export function startUpdate(): { started: boolean; error?: string } {
  if (job.running) {
    return { started: false, error: "Обновление уже выполняется" };
  }
  job.running = true;
  job.phase = "pull";
  job.message = "Начинаем обновление…";
  job.logTail = [];
  job.error = null;
  job.outcome = null;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  // Не держим промис: пайплайн живёт дольше HTTP-запроса.
  void runPipeline();
  return { started: true };
}
