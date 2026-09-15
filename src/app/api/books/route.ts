import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bookAvailabilityMap } from "@/lib/availability";
import { coverIds } from "@/lib/covers";

// Каталог учебников. ?q= — поиск по названию/предмету/ISBN (без учёта
// регистра). Каждая книга несёт available — сколько ещё можно выдать.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const all = await db.orm.public.Book
    .orderBy((b) => b.subject.asc())
    .all();

  // Поиск по названию, предмету или ISBN (без учёта регистра).
  // Фильтр на стороне приложения: в dev-БД коллация C, и lower() в SQL
  // не конвертирует кириллицу — ilike искал бы только латиницу/цифры.
  const filtered = q
    ? all.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.subject.toLowerCase().includes(q) ||
          b.isbn.toLowerCase().includes(q)
      )
    : all;

  const [availabilityMap, covers] = await Promise.all([
    bookAvailabilityMap(filtered.map((b) => b.id)),
    coverIds(),
  ]);
  const books = filtered.map((b) => ({
    ...b,
    available: availabilityMap.get(b.id)?.available ?? 0,
    hasCover: covers.has(b.id),
  }));

  return NextResponse.json(books);
}

// Добавить учебник. Доступно любому сотруднику (LIBRARIAN/ADMIN): завести
// новый учебник может и классный руководитель — без ожидания админа.
// grade — номер набора сезона (1–11) или null (вне наборов, архив).
export async function POST(request: Request) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = await request.json();
  const { isbn, title, subject, copies, grade } = body;

  if (!isbn || !title || !subject) {
    return NextResponse.json(
      { error: "Нужны isbn, title и subject" },
      { status: 400 }
    );
  }

  if (
    grade !== undefined &&
    grade !== null &&
    !(Number.isInteger(grade) && grade >= 1 && grade <= 11)
  ) {
    return NextResponse.json(
      { error: "grade — число от 1 до 11 или пусто" },
      { status: 400 }
    );
  }

  const dup = await db.orm.public.Book
    .where((b) => b.isbn.eq(isbn))
    .first();

  if (dup) {
    return NextResponse.json(
      { error: "Учебник с таким ISBN уже существует" },
      { status: 409 }
    );
  }

  // Тираж: целое ≥ 1 (по умолчанию 1).
  const safeCopies =
    typeof copies === "number" && Number.isInteger(copies) && copies >= 1
      ? copies
      : 1;

  const book = await db.orm.public.Book.create({
    isbn,
    title,
    subject,
    copies: safeCopies,
    grade: grade ?? null,
  });
  void logAudit("book.create", "book", me, book.id, {
    title,
    subject,
    isbn,
    copies: safeCopies,
    grade: grade ?? null,
  });
  return NextResponse.json(book, { status: 201 });
}
