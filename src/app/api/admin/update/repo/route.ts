import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  clearRepoOverride,
  getRepoOverride,
  isValidRepoUrl,
  normalizeRepoUrl,
  setRepoOverride,
} from "@/lib/update-repo";
import { invalidateUpdateStatus } from "@/lib/update";
import { maskSecrets } from "@/lib/update";

// Репозиторий обновлений: откуда тянуть новые версии (по умолчанию —
// git remote origin). Только администратор; URL строго валидируется.
export async function GET() {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;
  const repo = await getRepoOverride();
  return NextResponse.json({ repoUrl: repo ? maskSecrets(repo) : null });
}

export async function POST(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  let body: { repoUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ожидался JSON { repoUrl }" },
      { status: 400 }
    );
  }

  const url = (body.repoUrl ?? "").trim();
  if (!url) {
    // Пустое значение — вернуться к origin.
    await clearRepoOverride();
    invalidateUpdateStatus();
    void logAudit("update.repo", "update", guard.user, null, { repo: "origin" });
    return NextResponse.json({ ok: true, repoUrl: null });
  }

  if (!isValidRepoUrl(url)) {
    return NextResponse.json(
      {
        error:
          "Некорректный адрес: нужен https://github.com/владелец/имя (можно с токеном https://<токен>@github.com/… для приватного репозитория)",
      },
      { status: 400 }
    );
  }

  const normalized = normalizeRepoUrl(url);
  try {
    await setRepoOverride(normalized);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Не удалось сохранить настройку: ${
          e instanceof Error ? e.message : "ошибка записи"
        }`,
      },
      { status: 500 }
    );
  }
  invalidateUpdateStatus();
  void logAudit("update.repo", "update", guard.user, null, {
    repo: maskSecrets(normalized),
  });
  return NextResponse.json({ ok: true, repoUrl: maskSecrets(normalized) });
}
