import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Выбор репозитория обновлений (админ → «Обновления»).
 *
 * По умолчанию обновления тянутся из git remote `origin`. Администратор
 * может указать другой GitHub-репозиторий — например, свой форк.
 *
 * Хранение — файл `.update-repo.json` в корне проекта (в .gitignore):
 * настройка переживает перезапуск процесса и не требует миграции БД.
 *
 * Безопасность: URL строго валидируется (только github.com, путь
 * owner/name, опционально токен в userinfo для приватных репо);
 * в статусе и логах маскируется (см. maskSecrets в update.ts).
 */

const REPO_FILE = path.join(process.cwd(), ".update-repo.json");

/** https://github.com/owner/name(.git), опционально https://<token>@github.com/… */
const REPO_RE =
  /^https:\/\/(?:[A-Za-z0-9_]{3,}@)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/;

export interface RepoOverride {
  repoUrl: string;
}

export function isValidRepoUrl(url: string): boolean {
  return REPO_RE.test(url.trim());
}

/** Нормализация: без хвостового слеша, .git оставляем как введено. */
export function normalizeRepoUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function getRepoOverride(): Promise<string | null> {
  try {
    const raw = await readFile(REPO_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<RepoOverride>;
    if (
      parsed &&
      typeof parsed.repoUrl === "string" &&
      isValidRepoUrl(parsed.repoUrl)
    ) {
      return normalizeRepoUrl(parsed.repoUrl);
    }
  } catch {
    // нет файла / битый JSON — работаем от origin
  }
  return null;
}

export async function setRepoOverride(url: string): Promise<string> {
  const normalized = normalizeRepoUrl(url);
  if (!isValidRepoUrl(normalized)) {
    throw new Error(
      "Репозиторий должен быть вида https://github.com/владелец/имя"
    );
  }
  await writeFile(REPO_FILE, JSON.stringify({ repoUrl: normalized }, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  return normalized;
}

export async function clearRepoOverride(): Promise<void> {
  try {
    await writeFile(REPO_FILE, JSON.stringify({ repoUrl: null }), {
      encoding: "utf8",
    });
  } catch {
    // файл недоступен — не критично, origin останется
  }
}
