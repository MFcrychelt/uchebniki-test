import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Убрать учебники набора из классов одной кнопкой.
// Юзкейс: собрали набор старых учебников, отметили классы (конкретные
// «8-А» или все классы числа — клиент разворачивает в список id) — и чек-листы
// классов очищаются от этих книг. Выдачи и долги не трогаются.
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

  // Привязки книг набора к отмеченным классам.
  const links = await db.orm.public.ClassBook
    .where((cb) => cb.classId.in(classIds))
    .where((cb) => cb.bookId.in(bookIds))
    .all();

  for (const cb of links) {
    await db.orm.public.ClassBook
      .where((c) => c.classId.eq(cb.classId))
      .where((c) => c.bookId.eq(cb.bookId))
      .delete();
  }

  const classesTouched = new Set(links.map((cb) => cb.classId)).size;
  void logAudit("set.unlink-classes", "set", me, id, {
    name: set.name,
    books: bookIds.length,
    classes: classIds.length,
    removed: links.length,
  });

  return NextResponse.json({
    ok: true,
    removed: links.length,
    classes: classesTouched,
  });
}
