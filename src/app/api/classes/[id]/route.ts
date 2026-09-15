import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

import { adminGuard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Удалить класс (привязки книг удалятся каскадно, у учеников classId обнулится).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const existing = await db.orm.public.Class.where({ id }).first();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removed = await db.orm.public.Class.where({ id }).delete();
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  void logAudit("class.delete", "class", guard.user, id, { name: existing.name });
  return NextResponse.json({ ok: true });
}
