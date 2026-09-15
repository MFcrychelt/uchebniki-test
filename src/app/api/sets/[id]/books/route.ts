import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Книги именованного набора.
// POST { bookId } — добавить книгу в набор (можно в несколько наборов сразу).
// DELETE ?bookId= — убрать книгу из набора.

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
  const bookId = (body as { bookId?: unknown })?.bookId;
  if (typeof bookId !== "string" || !bookId) {
    return NextResponse.json({ error: "Нужен bookId" }, { status: 400 });
  }

  const set = await db.orm.public.BookSet.where({ id }).first();
  if (!set) {
    return NextResponse.json({ error: "Набор не найден" }, { status: 404 });
  }

  const book = await db.orm.public.Book.where({ id: bookId }).first();
  if (!book) {
    return NextResponse.json({ error: "Учебник не найден" }, { status: 404 });
  }

  const existing = await db.orm.public.BookSetItem
    .where((it) => it.setId.eq(id))
    .where((it) => it.bookId.eq(bookId))
    .first();
  if (existing) {
    return NextResponse.json({ ok: true, already: true });
  }

  await db.orm.public.BookSetItem.create({ setId: id, bookId });
  void logAudit("set.add", "set", me, id, {
    name: set.name,
    title: book.title,
    isbn: book.isbn,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;
  const bookId = new URL(request.url).searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "Нужен bookId" }, { status: 400 });
  }

  const set = await db.orm.public.BookSet.where({ id }).first();
  if (!set) {
    return NextResponse.json({ error: "Набор не найден" }, { status: 404 });
  }

  const existing = await db.orm.public.BookSetItem
    .where((it) => it.setId.eq(id))
    .where((it) => it.bookId.eq(bookId))
    .first();
  if (!existing) {
    return NextResponse.json({ ok: true });
  }

  await db.orm.public.BookSetItem
    .where((it) => it.setId.eq(id))
    .where((it) => it.bookId.eq(bookId))
    .delete();

  const book = await db.orm.public.Book.where({ id: bookId }).first();
  void logAudit("set.remove", "set", me, id, {
    name: set.name,
    title: book?.title ?? null,
  });
  return NextResponse.json({ ok: true });
}
