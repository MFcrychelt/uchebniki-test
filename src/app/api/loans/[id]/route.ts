import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";

// Пометить выдачу как утерянную (книга закрыта, ученик «должен» компенсацию).
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const loan = await db.orm.public.Loan
    .where({ id })
    .where((l) => l.status.eq("ISSUED"))
    .update({ status: "LOST", lostAt: Temporal.Now.instant() });

  if (!loan) {
    return NextResponse.json(
      { error: "Выдача не найдена или уже закрыта" },
      { status: 404 }
    );
  }

  return NextResponse.json(loan);
}

// Полное удаление записи (служебное действие администратора).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const removed = await db.orm.public.Loan.where({ id }).delete();

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
