import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Пометить, что утерянная книга компенсирована (выдана замена/покупка,
// долг закрыт). Только для LOST-выдач.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const loan = await db.orm.public.Loan
    .where({ id })
    .include("student")
    .include("book")
    .first();

  if (!loan) {
    return NextResponse.json({ error: "Выдача не найдена" }, { status: 404 });
  }
  if (loan.status !== "LOST") {
    return NextResponse.json(
      { error: "Компенсация — только по утерянным книгам" },
      { status: 409 }
    );
  }
  if (loan.compensatedAt) {
    return NextResponse.json(
      { error: "Уже отмечена как компенсированная" },
      { status: 409 }
    );
  }

  const updated = await db.orm.public.Loan
    .where({ id })
    .update({
      compensatedAt: Temporal.Now.instant(),
      compensatedById: me.id,
    });

  const student = loan.student as { lastName: string; firstName: string } | null;
  const book = loan.book as { title: string; isbn: string } | null;
  void logAudit(
    "loan.compensate",
    "loan",
    me,
    id,
    {
      student: student ? `${student.lastName} ${student.firstName}` : null,
      title: book?.title ?? null,
      isbn: book?.isbn ?? null,
    }
  );

  return NextResponse.json(updated);
}

// Снять отметку о компенсации (ошибка — отменили).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const loan = await db.orm.public.Loan
    .where({ id })
    .include("book")
    .first();

  if (!loan) {
    return NextResponse.json({ error: "Выдача не найдена" }, { status: 404 });
  }
  if (!loan.compensatedAt) {
    return NextResponse.json(
      { error: "Отметка о компенсации отсутствует" },
      { status: 409 }
    );
  }

  const updated = await db.orm.public.Loan
    .where({ id })
    .update({ compensatedAt: null, compensatedById: null });

  const book = loan.book as { title: string; isbn: string } | null;
  void logAudit(
    "loan.compensate.cancel",
    "loan",
    me,
    id,
    { title: book?.title ?? null, isbn: book?.isbn ?? null }
  );

  return NextResponse.json(updated);
}
