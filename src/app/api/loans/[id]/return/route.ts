import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";

import { staffUser } from "@/lib/auth";

// Возврат книги.
export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const current = await db.orm.public.Loan.where({ id }).first();
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (current.status !== "ISSUED") {
    return NextResponse.json(
      { error: "Книга уже закрыта (возвращена или утеряна)" },
      { status: 409 }
    );
  }

  const loan = await db.orm.public.Loan
    .where({ id })
    .update({
      status: "RETURNED",
      returnedAt: Temporal.Now.instant(),
    });

  return NextResponse.json(loan);
}
