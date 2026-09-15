import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";

// Выдачи ученика по id — только персонал (кабинет ученика — по QR-ключу).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;

  const loans = await db.orm.public.Loan
    .where((l) => l.studentId.eq(id))
    .include("book")
    .orderBy((l) => l.issuedAt.desc())
    .all();

  return NextResponse.json(loans);
}
