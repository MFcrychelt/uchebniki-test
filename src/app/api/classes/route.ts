import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { adminGuard, staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Список классов с количеством учеников и списком учебников — только для
// персонала: класс + число учеников + номенклатура фонда сами по себе
// сведения внутренние (и ключ к /print/class-list, где по classId
// печатается список класса).
export async function GET() {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const classes = await db.orm.public.Class
    .include("students", (students) => students.count())
    .include("books", (books) => books.include("book"))
    .orderBy((c) => c.name.asc())
    .all();

  return NextResponse.json(classes);
}

// Создать класс.
export async function POST(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Нужно имя класса" }, { status: 400 });
  }

  const cls = await db.orm.public.Class.create({ name: name.trim() });
  void logAudit("class.create", "class", guard.user, cls.id, { name: name.trim() });
  return NextResponse.json(cls, { status: 201 });
}
