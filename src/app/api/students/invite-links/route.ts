import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureStudentCredentials } from "@/lib/student-credentials";
import { db } from "@/lib/prisma";

// «Создать для всех»: у учеников без magic link (например, созданных до
// magic links) создать логин/пароль и одноразовую ссылку для входа.
export async function POST() {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const withoutLinks = await db.orm.public.User
    .where((u) => u.role.eq("STUDENT"))
    .where((u) => u.inviteToken.isNull())
    .all();

  if (withoutLinks.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  const allLogins = await db.orm.public.User.select("login").all();
  const takenLogins = new Set(
    allLogins.map((u) => u.login).filter((l): l is string => !!l)
  );

  let created = 0;
  for (const s of withoutLinks) {
    const r = await ensureStudentCredentials(s.id, s.lastName, takenLogins);
    if (r) created++;
  }

  void logAudit("student.invite_links", "student", guard.user, null, {
    created,
  });

  return NextResponse.json({ created });
}
