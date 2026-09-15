import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { adminGuard, staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createStudentWithCredentials } from "@/lib/student-credentials";

/** Занятые логины (все роли) — чтобы генератор не сталкивался. */
async function loadTakenLogins(): Promise<Set<string>> {
  const users = await db.orm.public.User.select("login").all();
  return new Set(users.map((u) => u.login).filter((l): l is string => !!l));
}

// Список учеников (с классом) — только для персонала: список имён
// не должен быть доступен анонимно (ученики входят в кабинет по
// личному QR-коду, см. /api/student/qr/:token).
export async function GET(request: Request) {
  if (!(await staffUser())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");

  let query = db.orm.public.User
    .where((u) => u.role.eq("STUDENT"))
    .select(
      "id",
      "role",
      "lastName",
      "firstName",
      "classId",
      "login",
      "qrToken",
      "inviteToken",
      "inviteUsedAt",
      "createdAt"
    );

  if (classId) {
    query = query.where((u) => u.classId.eq(classId));
  }

  const students = await query
    .include("class")
    .orderBy((u) => u.lastName.asc())
    .all();

  return NextResponse.json(students);
}

// Создать ученика: автоматически QR-токен + логин/пароль + одноразовая
// ссылка для входа (magic link). Пароль админу не возвращаем — он виден
// ученику в кабинете.
export async function POST(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const body = await request.json();
  const { lastName, firstName, classId } = body;

  if (!lastName || !firstName) {
    return NextResponse.json(
      { error: "Нужны lastName и firstName" },
      { status: 400 }
    );
  }

  const takenLogins = await loadTakenLogins();
  const created = await createStudentWithCredentials({
    lastName: lastName.trim(),
    firstName: firstName.trim(),
    classId: classId ?? null,
    takenLogins,
  });

  const student = await db.orm.public.User
    .where({ id: created.id })
    .select(
      "id",
      "role",
      "lastName",
      "firstName",
      "classId",
      "login",
      "qrToken",
      "inviteToken",
      "inviteUsedAt",
      "createdAt"
    )
    .include("class")
    .first();

  void logAudit("student.create", "student", guard.user, student?.id ?? created.id, {
    name: `${lastName.trim()} ${firstName.trim()}`,
    class: student?.class?.name ?? null,
  });

  return NextResponse.json(student, { status: 201 });
}
