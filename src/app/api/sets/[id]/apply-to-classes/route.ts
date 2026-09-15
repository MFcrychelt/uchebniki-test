import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Добавить учебники набора в чек-листы отмеченных классов.
// Выдачи не трогаются. Уже привязанные книги пропускаются.
// POST { classIds: string[] }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const classIds = (body as { classIds?: unknown })?.classIds;
  if (
    !Array.isArray(classIds) ||
    classIds.length === 0 ||
    !classIds.every((c) => typeof c === "string")
  ) {
    return NextResponse.json(
      { error: "Отметьте хотя бы один класс" },
      { status: 400 }
    );
  }

  const set = await db.orm.public.BookSet.where({ id }).first();
  if (!set) {
    return NextResponse.json({ error: "Набор не найден" }, { status: 404 });
  }

  const items = await db.orm.public.BookSetItem
    .where((it) => it.setId.eq(id))
    .all();
  if (items.length === 0) {
    return NextResponse.json({ error: "Набор пуст" }, { status: 400 });
  }
  const bookIds = items.map((it) => it.bookId);

  const existing = await db.orm.public.ClassBook
    .where((cb) => cb.classId.in(classIds))
    .where((cb) => cb.bookId.in(bookIds))
    .all();
  const have = new Set(existing.map((cb) => `${cb.classId}:${cb.bookId}`));

  let added = 0;
  for (const classId of classIds) {
    for (const bookId of bookIds) {
      if (have.has(`${classId}:${bookId}`)) continue;
      await db.orm.public.ClassBook.create({ classId, bookId });
      added++;
    }
  }

  void logAudit("set.link-classes", "set", me, id, {
    name: set.name,
    books: bookIds.length,
    classes: classIds.length,
    added,
  });

  return NextResponse.json({
    ok: true,
    added,
    classes: classIds.length,
  });
}
