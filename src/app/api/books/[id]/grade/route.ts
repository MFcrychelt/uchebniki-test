import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Наборы сезона: у каждого числа класса (1–11) свой набор учебников.
// Этот роут перемещает учебник между наборами или убирает в архив
// (grade = null: не выдаётся, не виден в чек-листах, но остаётся в каталоге
// и истории). Доступно любому сотруднику.
// POST { grade: 1..11 | null }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const raw: unknown = (body as { grade?: unknown })?.grade;
  if (
    raw !== null &&
    !(typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 11)
  ) {
    return NextResponse.json(
      { error: "grade — число от 1 до 11 или null" },
      { status: 400 }
    );
  }
  const grade = raw as number | null;

  const book = await db.orm.public.Book.where({ id }).first();
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (book.grade === grade) {
    return NextResponse.json({ ok: true, grade });
  }

  await db.orm.public.Book.where({ id }).update({ grade });
  void logAudit("book.season", "book", me, id, {
    title: book.title,
    isbn: book.isbn,
    grade,
    from: book.grade,
  });

  return NextResponse.json({ ok: true, grade });
}
