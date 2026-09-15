import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { issueLoan } from "@/lib/loan-writes";

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

  // Выдача — общим атомарным путём (src/lib/loan-writes.ts): дубль, набор
  // сезона и остаток проверяются внутри одной транзакции под блокировкой
  // книги. Раньше здесь был тот же «посчитал → записал», и два «Выдать» по
  // одной заявке (два сотрудника на одном экране заявок) давали две выдачи.
  const res = await issueLoan({
    studentId: student.id,
    bookId: book.id,
    librarianId: me.id,
  });

  let loanId: string | null = null;
  let alreadyIssued = false;
  if (res.ok) {
    loanId = (res.loan as { id: string }).id;
  } else if (res.code === "already_issued") {
    // Книга уже на руках — заявку просто закрываем, выдачу не удваиваем.
    alreadyIssued = true;
  } else if (res.code === "not_in_set") {
    return NextResponse.json(
      { error: `${res.error} — заявку можно отклонить` },
      { status: 409 }
    );
  } else {
    // no_stock: заявку держим в очереди — выполним, когда вернут копию.
    return NextResponse.json(
      { error: `${res.error} — заявка остаётся в очереди` },
      { status: 409 }
    );
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
      alreadyIssued,
    }
  );

  return NextResponse.json({
    ok: true,
    status: "ISSUED",
    loanId,
    alreadyIssued,
  });
}
