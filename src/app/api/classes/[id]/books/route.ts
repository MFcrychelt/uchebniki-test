import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Привязать учебник к классу. Доступно библиотекарю на странице класса.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id: classId } = await params;
  const body = await request.json();
  const { bookId } = body;

  if (!bookId) {
    return NextResponse.json({ error: "Нужен bookId" }, { status: 400 });
  }

  const existing = await db.orm.public.ClassBook
    .where((cb) => cb.classId.eq(classId))
    .where((cb) => cb.bookId.eq(bookId))
    .first();

  if (existing) {
    return NextResponse.json(existing);
  }

  const book = await db.orm.public.Book.where({ id: bookId }).first();
  const link = await db.orm.public.ClassBook.create({ classId, bookId });
  void logAudit(
    "classbook.link",
    "classbook",
    me,
    classId,
    { bookId, title: book?.title ?? null, isbn: book?.isbn ?? null }
  );
  return NextResponse.json(link, { status: 201 });
}
