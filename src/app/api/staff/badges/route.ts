import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";

// Счётчики для ленты разделов панели библиотекаря: «Долги» и «Заявки»
// видно прямо на кнопке, без перехода во вкладку — на телефоне это
// «открыл приложение → вижу, что горит → иду туда», а не «открыл каждую
// вкладку и посмотрел».
//
// Предикаты совпадают со списками самих вкладок (Loan.status = ISSUED,
// BookRequest.status = PENDING), чтобы цифра на кнопке не расходилась с
// тем, что человек увидит внутри.
//
// Берём только id: лишние колонки в SELECT стоят работы на каждый показ
// экрана, а нужна ровно длина списка.
export async function GET() {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const [debts, requests] = await Promise.all([
    db.orm.public.Loan.where((l) => l.status.eq("ISSUED")).select("id").all(),
    db.orm.public.BookRequest.where((r) => r.status.eq("PENDING"))
      .select("id")
      .all(),
  ]);

  return NextResponse.json(
    { debts: debts.length, requests: requests.length },
    { headers: { "Cache-Control": "no-store" } }
  );
}
