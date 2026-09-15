import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { staffUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { bookAvailability } from "@/lib/availability";

// Выдать книгу ученику.
export async function POST(request: Request) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = await request.json();
  const { studentId, bookId } = body;
  const librarianId = me.id; // аудит: кто произвёл выдачу

  if (!studentId || !bookId) {
    return NextResponse.json(
      { error: "Нужны studentId и bookId" },
      { status: 400 }
    );
  }

  // Уже есть активная выдача этой книги этому ученику?
  const existing = await db.orm.public.Loan
    .where((l) => l.studentId.eq(studentId))
    .where((l) => l.bookId.eq(bookId))
    .where((l) => l.status.eq("ISSUED"))
    .first();

  if (existing) {
    return NextResponse.json(
      { error: "Книга уже выдана" },
      { status: 409 }
    );
  }

  // Учебник должен быть в каком-нибудь наборе сезона (не в архиве).
  const book = await db.orm.public.Book.where({ id: bookId }).first();
  if (book && book.grade == null) {
    return NextResponse.json(
      { error: `«${book.title}» не в наборе этого года` },
      { status: 409 }
    );
  }

  // Остались ли экземпляры в фонде?
  const avail = await bookAvailability(bookId);
  if (avail.available <= 0) {
    return NextResponse.json(
      { error: `Все экземпляры книги выданы (${avail.total} шт.)` },
      { status: 409 }
    );
  }

  const loan = await db.orm.public.Loan.create({
    studentId,
    bookId,
    librarianId: librarianId ?? null,
    status: "ISSUED",
  });

  return NextResponse.json(loan, { status: 201 });
}

// Журнал выдач: все операции с фильтрами.
// ?status=ISSUED|RETURNED|LOST &classId= &subject= &from=YYYY-MM-DD &to=YYYY-MM-DD &limit=
export async function GET(request: Request) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const classId = url.searchParams.get("classId");
  const subject = url.searchParams.get("subject");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 200) || 200,
    1000
  );

  let query = db.orm.public.Loan
    .include("student", (s) => s.include("class"))
    .include("book")
    .include("librarian")
    .include("compensatedBy");

  if (status === "ISSUED" || status === "RETURNED" || status === "LOST") {
    query = query.where((l) => l.status.eq(status));
  }
  if (classId) {
    query = query.where((l) => l.student.some((s) => s.classId.eq(classId)));
  }
  if (subject) {
    query = query.where((l) => l.book.some((b) => b.subject.eq(subject)));
  }
  if (from) {
    const instant = Temporal.Instant.from(`${from}T00:00:00Z`);
    query = query.where((l) => l.issuedAt.gte(instant));
  }
  if (to) {
    const instant = Temporal.Instant.from(`${to}T23:59:59Z`);
    query = query.where((l) => l.issuedAt.lte(instant));
  }

  const rows = await query
    .orderBy((l) => l.issuedAt.desc())
    .limit(limit)
    .all();

  const items = rows.map((r) => ({
    id: r.id,
    status: r.status,
    issuedAt: r.issuedAt.toString(),
    returnedAt: r.returnedAt ? r.returnedAt.toString() : null,
    lostAt: r.lostAt ? (r.lostAt as Temporal.Instant).toString() : null,
    compensatedAt: r.compensatedAt
      ? (r.compensatedAt as Temporal.Instant).toString()
      : null,
    student: r.student as {
      id: string;
      lastName: string;
      firstName: string;
      classId: string | null;
      class: { id: string; name: string } | null;
    },
    book: r.book as {
      id: string;
      isbn: string;
      title: string;
      subject: string;
    },
    issuedBy: r.librarian
      ? `${(r.librarian as { lastName: string }).lastName} ${(r.librarian as { firstName: string }).firstName}`
      : null,
    compensatedBy: r.compensatedBy
      ? `${(r.compensatedBy as { lastName: string }).lastName} ${(r.compensatedBy as { firstName: string }).firstName}`
      : null,
  }));

  return NextResponse.json(items);
}
