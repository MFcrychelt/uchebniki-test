import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

/**
 * Версия развёрнутого кода (git HEAD). Используется в подвале главной и
 * во вкладке «Обновления» админки.
 *
 * Приложение работает из корня репозитория (process.cwd()), git есть на
 * сервере — это же нужно для обновления (см. src/lib/update.ts).
 */
export interface GitVersion {
  short: string;
  full: string;
  subject: string;
  branch: string;
  /** Время коммита (ISO 8601). */
  date: string;
}

const TTL_MS = 30_000;
let cache: { at: number; value: GitVersion | null } | null = null;

function run(args: string[]): Promise<string> {
  return pExecFile("git", args, { cwd: process.cwd(), timeout: 10_000 }).then(
    (r) => r.stdout.trim()
  );
}

export async function getGitVersion(): Promise<GitVersion | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const [short, full, subject, branch, date] = await Promise.all([
      run(["rev-parse", "--short", "HEAD"]),
      run(["rev-parse", "HEAD"]),
      run(["log", "-1", "--pretty=%s"]),
      run(["rev-parse", "--abbrev-ref", "HEAD"]),
      run(["log", "-1", "--pretty=%cI"]),
    ]);
    const value: GitVersion = { short, full, subject, branch, date };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    // git недоступен (не из репозитория) — версия не показывается.
    cache = { at: Date.now(), value: null };
    return null;
  }
}
