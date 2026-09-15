// Аудит-журнал: запись о том, кто из персонала что изменил в справочниках.
// Вызывается из API-роутов после успешного мутации. Ошибка аудита никогда
// не должна ломать основной flow — поэтому всё в try/catch без бросания.
import { db } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

export type AuditEntity =
  | "class"
  | "student"
  | "book"
  | "classbook"
  | "set"
  | "import"
  | "request"
  | "loan"
  | "auth"
  | "update";

/**
 * Записать событие в audit_log.
 * @param action  что сделали: "class.create", "student.delete", "import.books", "auth.login"
 * @param entity  над чем: class | student | book | classbook | import | request | loan | auth
 * @param actor   кто (из сессии); null — системная/анонимная запись
 * @param entityId id объекта (или id класса для classbook)
 * @param details произвольные метаданные (имя, ISBN, счётчики) — сериализуются в JSON
 */
export async function logAudit(
  action: string,
  entity: AuditEntity,
  actor: SessionUser | null,
  entityId?: string | null,
  details?: Record<string, unknown> | null
): Promise<void> {
  try {
    await db.orm.public.AuditLog.create({
      actorId: actor?.id ?? null,
      actorName: actor ? `${actor.lastName} ${actor.firstName}` : null,
      actorRole: actor?.role ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      details: details ? JSON.stringify(details) : null,
    });
  } catch {
    // Аудит — сопутствующая запись; сбой не должен падать на основной flow.
  }
}

/** Короткая подпись исполнителя для UI: «Иванова А. (ADMIN)» или «система». */
export function auditActorLabel(
  name: string | null,
  role: string | null
): string {
  if (!name) return "система";
  return role ? `${name} (${role})` : name;
}
