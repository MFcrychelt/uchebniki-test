// Prisma 8 читает/пишет timestamptz через глобальный Temporal.
// В Node 22 его ещё нет по умолчанию — подкладываем полифилл до создания клиента.
import { Temporal } from "@js-temporal/polyfill";

const g = globalThis as { Temporal?: unknown };
if (!g.Temporal) {
  Object.defineProperty(g, "Temporal", {
    value: Temporal,
    writable: true,
    configurable: true,
  });
}

export {};
