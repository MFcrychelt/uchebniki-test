import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { staffUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { issueLoan } from "@/lib/loan-writes";

// Выдать книгу ученику.
export async function POST(request: Request) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  let body: { studentId?: string; bookId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const studentId = body.studentId;
  const bookId = body.bookId;
  if (!studentId || !bookId) {
    return NextResponse.json(
      { error: "Нужны studentId и bookId" },
      { status: 400 }
    );
  }

  // Проверки и запись — в src/lib/loan-writes.ts: одна транзакция под
  // блокировкой книги. Раньше это было «посчитал → записал» без защиты, и
  // две параллельные выдачи (две вкладки, второе устройство, офлайн-очередь)
  // проходили проверку остатка обе.
  const res = await issueLoan({
    studentId,
    bookId,
    librarianId: me.id, // аудит: кто произвёл выдачу
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error, code: res.code },
      { status: 409 }
    );
  }

  return NextResponse.json(res.loan, { status: 201 });
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
