import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Применить набор сезона к классу одной кнопкой: чек-лист класса становится
// ровно набором этого числа (grade). Привязки, которых нет в наборе,
// снимаются; выдачи и долги не трогаются (они живут в Loan, не в ClassBook).
// Доступно любому сотруднику. POST { grade: 1..11 }
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
  if (!(typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 11)) {
    return NextResponse.json(
      { error: "grade — число от 1 до 11" },
      { status: 400 }
    );
  }
  const grade = raw;

  const cls = await db.orm.public.Class.where({ id }).first();
  if (!cls) {
    return NextResponse.json({ error: "Класс не найден" }, { status: 404 });
  }

  // Набор этого числа класса.
  const setBooks = await db.orm.public.Book
    .where((b) => b.grade.eq(grade))
    .all();

  // Текущие привязки класса.
  const current = await db.orm.public.ClassBook
    .where((cb) => cb.classId.eq(id))
    .all();
  const currentIds = new Set(current.map((cb) => cb.bookId));
  const setIds = new Set(setBooks.map((b) => b.id));

  const toAdd = setBooks.filter((b) => !currentIds.has(b.id));
  const toRemove = current.filter((cb) => !setIds.has(cb.bookId));

  for (const cb of toRemove) {
    await db.orm.public.ClassBook
      .where((cb2) => cb2.classId.eq(id))
      .where((cb2) => cb2.bookId.eq(cb.bookId))
      .delete();
  }
  for (const b of toAdd) {
    await db.orm.public.ClassBook.create({ classId: id, bookId: b.id });
  }

  void logAudit("class.season", "class", me, id, {
    name: cls.name,
    grade,
    applied: setBooks.length,
    added: toAdd.length,
    removed: toRemove.length,
  });

  return NextResponse.json({
    ok: true,
    grade,
    className: cls.name,
    applied: setBooks.length,
    added: toAdd.length,
    removed: toRemove.length,
  });
}
