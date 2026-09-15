import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { bookAvailabilityMap, type BookAvailability } from "@/lib/availability";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Явный select: в ответ не попадают секретные поля ученика
  // (passwordHash/passwordEnc/inviteToken) — токен QR не даёт право
  // на их чтение (пароль показывается только в кабинете по сессии).
  const student = await db.orm.public.User
    .where((u) => u.qrToken.eq(token))
    .select(
      "id",
      "role",
      "qrToken",
      "lastName",
      "firstName",
      "classId",
      "login",
      "createdAt"
    )
    .include("class")
    .first();

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Чек-лист класса: только учебники из наборов сезона. Архивные
  // (прошлогодние издания) не показываются; выданные копии видны в loans.
  const allClassBooks = student.classId
    ? await db.orm.public.ClassBook
        .where((cb) => cb.classId.eq(student.classId!))
        .include("book")
        .all()
    : [];
  const classBooks = allClassBooks.filter(
    (cb) => (cb.book as { grade?: number | null } | null)?.grade != null
  );

  const loans = await db.orm.public.Loan
    .where((l) => l.studentId.eq(student.id))
    .include("book")
    .orderBy((l) => l.issuedAt.desc())
    .all();

  // Остатки по учебникам класса: сколько ещё можно выдать.
  const classBookIds = classBooks.map(
    (cb) => (cb.book as { id: string } | null)?.id ?? ""
  ).filter(Boolean);
  const availabilityMap = await bookAvailabilityMap(classBookIds);
  const availability: Record<string, BookAvailability> = {};
  for (const [id, a] of availabilityMap) availability[id] = a;

  return NextResponse.json({ student, classBooks, loans, availability });
}
