import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { adminGuard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  // Без секретных полей (passwordHash/passwordEnc) — см. /api/students.
  const student = await db.orm.public.User
    .where({ id })
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

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const existing = await db.orm.public.User
    .where({ id })
    .include("class")
    .first();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removed = await db.orm.public.User.where({ id }).delete();
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cls = existing.class as { name: string } | null;
  void logAudit("student.delete", "student", guard.user, id, {
    name: `${existing.lastName} ${existing.firstName}`,
    class: cls?.name ?? null,
  });

  return NextResponse.json({ ok: true });
}
