import { NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/prisma";
import { adminGuard } from "@/lib/auth";

// Аудит-журнал: кто что изменил в справочниках (только ADMIN).
// Фильтры: ?entity=class&action=class.create&from=2026-09-01&to=2026-09-13&limit=200
export async function GET(request: Request) {
  const guard = await adminGuard();
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const action = url.searchParams.get("action");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 200) || 200,
    500
  );

  let query = db.orm.public.AuditLog;

  if (entity) {
    query = query.where((a) => a.entity.eq(entity));
  }
  if (action) {
    query = query.where((a) => a.action.eq(action));
  }
  if (from) {
    const instant = Temporal.Instant.from(`${from}T00:00:00Z`);
    query = query.where((a) => a.ts.gte(instant));
  }
  if (to) {
    const instant = Temporal.Instant.from(`${to}T23:59:59Z`);
    query = query.where((a) => a.ts.lte(instant));
  }

  const rows = await query.orderBy((a) => a.ts.desc()).limit(limit).all();

  const items = rows.map((r) => {
    let details: Record<string, unknown> | null = null;
    if (r.details) {
      try {
        details = JSON.parse(r.details as string);
      } catch {
        details = { raw: r.details as string };
      }
    }
    return {
      id: r.id,
      ts: (r.ts as Temporal.Instant).toString(),
      actorId: r.actorId ?? null,
      actorName: r.actorName ?? null,
      actorRole: r.actorRole ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ?? null,
      details,
    };
  });

  return NextResponse.json(items);
}
