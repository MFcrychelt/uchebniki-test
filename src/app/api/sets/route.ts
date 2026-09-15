import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Именованные наборы учебников: «Гуманитарные», «Английские», «Старые
// учебники»… Книга может входить в несколько наборов одновременно.
// Числовые наборы классов (1–11) живут в Book.grade — это отдельная история.

// Список наборов с книгами (для панели библиотекаря).
export async function GET() {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const rows = await db.orm.public.BookSet
    .include("items", (it) => it.include("book"))
    .orderBy((s) => s.name.asc())
    .all();

  return NextResponse.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      books: s.items
        .map(
          (it) =>
            it.book as
              | { id: string; title: string; subject: string; isbn: string; grade: number | null }
              | null
        )
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .map((b) => ({
          id: b.id,
          title: b.title,
          subject: b.subject,
          isbn: b.isbn,
          grade: b.grade ?? null,
        })),
    }))
  );
}

// Проверка названия: непустая строка до 40 символов.
function nameError(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "Введите название";
  if (name.trim().length > 40) return "Не длиннее 40 символов";
  return null;
}

// Создать набор.
export async function POST(request: Request) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = (body as { name?: unknown })?.name;
  const err = nameError(name);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }
  const clean = (name as string).trim();

  const dup = await db.orm.public.BookSet
    .where((s) => s.name.eq(clean))
    .first();
  if (dup) {
    return NextResponse.json(
      { error: "Набор с таким названием уже есть" },
      { status: 409 }
    );
  }

  const set = await db.orm.public.BookSet.create({ name: clean });
  void logAudit("set.create", "set", me, set.id, { name: clean });
  return NextResponse.json({ id: set.id, name: set.name, books: [] }, { status: 201 });
}
