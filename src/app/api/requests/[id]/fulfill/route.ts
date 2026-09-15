import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bookAvailability } from "@/lib/availability";

// Выполнить заявку: выдать учебник ученику (создаётся выдача) и закрыть
// заявку со статусом ISSUED. Если книга уже выдана этому ученику — выдача
// не дублируется, заявка закрывается (цель достигнута).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const req = await db.orm.public.BookRequest
    .where({ id })
    .include("student")
    .include("book")
    .first();

  if (!req) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }
  if (req.status !== "PENDING") {
    return NextResponse.json(
      { error: "Заявка уже обработана" },
      { status: 409 }
    );
  }

  const student = req.student as { id: string; lastName: string; firstName: string } | null;
  const book = req.book as { id: string; title: string } | null;
  if (!student || !book) {
    return NextResponse.json({ error: "Заявка повреждена" }, { status: 400 });
  }

  const now = Temporal.Now.instant();

  // Уже есть активная выдача этой книги этому ученику?
  const existingLoan = await db.orm.public.Loan
    .where((l) => l.studentId.eq(student.id))
    .where((l) => l.bookId.eq(book.id))
    .where((l) => l.status.eq("ISSUED"))
    .first();

  let loanId: string | null = null;
  if (!existingLoan) {
    // Учебник не в наборе сезона (архив) — выдать нельзя.
    const bookRow = await db.orm.public.Book
      .where({ id: book.id })
      .first();
    if (bookRow && bookRow.grade == null) {
      return NextResponse.json(
        { error: `«${bookRow.title}» не в наборе этого года — заявку можно отклонить` },
        { status: 409 }
      );
    }
    // Остались ли экземпляры? Нет — заявку оставляем PENDING: выполним,
    // когда кто-то вернёт копию.
    const avail = await bookAvailability(book.id);
    if (avail.available <= 0) {
      return NextResponse.json(
        { error: `Все экземпляры выданы (${avail.total} шт.) — заявка остаётся в очереди` },
        { status: 409 }
      );
    }
    const loan = await db.orm.public.Loan.create({
      studentId: student.id,
      bookId: book.id,
      librarianId: me.id,
      status: "ISSUED",
    });
    loanId = loan.id;
  }

  await db.orm.public.BookRequest.where({ id }).update({
    status: "ISSUED",
    handledAt: now,
    handledById: me.id,
  });

  void logAudit(
    "request.fulfill",
    "request",
    me,
    id,
    {
      student: `${student.lastName} ${student.firstName}`,
      title: book.title,
      alreadyIssued: Boolean(existingLoan),
    }
  );

  return NextResponse.json({
    ok: true,
    status: "ISSUED",
    loanId,
    alreadyIssued: Boolean(existingLoan),
  });
}
