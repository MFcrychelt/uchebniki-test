import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";
import { closeLoan } from "@/lib/loan-writes";

// Пометить выдачу как утерянную (книга закрыта, ученик «должен» компенсацию).
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  // Тот же закрывающий путь, что и возврат: перечитать статус внутри
  // транзакции — значит не перезаписать чужой возврат (404, если уже
  // закрыто, — семантика прежняя: очередь считает это «сделано»).
  const res = await closeLoan({ loanId: id, status: "LOST" });
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error, ...(res.code === "not_found" ? {} : { code: res.code }) },
      { status: res.code === "not_found" ? 404 : 409 }
    );
  }

  return NextResponse.json(res.loan);
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
