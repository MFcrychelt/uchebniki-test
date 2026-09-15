import { NextResponse } from "next/server";
import { staffUser } from "@/lib/auth";
import { closeLoan } from "@/lib/loan-writes";

// Возврат книги.
export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  // Закрытие выдачи идёт через общий helper (см. src/lib/loan-writes.ts):
  // статус перечитывается внутри транзакции, поэтому «вернули оба» —
  // исключено, а второй ответ честно получает already_closed.
  const res = await closeLoan({ loanId: id, status: "RETURNED" });
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error, ...(res.code === "not_found" ? {} : { code: res.code }) },
      { status: res.code === "not_found" ? 404 : 409 }
    );
  }
  return NextResponse.json(res.loan);
}
