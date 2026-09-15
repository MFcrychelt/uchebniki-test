/**
 * Офлайн-очередь операций с книгами (чистое ядро — без DOM).
 *
 * Библиотекарь работает при обрыве сети: неудавшиеся мутации (выдача,
 * возврат, «утеряна», удаление) сохраняются в очередь (localStorage,
 * см. offline-queue-browser.ts) и применяются при появлении соединения.
 *
 * Правила синхронизации (runQueueSync), FIFO:
 * - 2xx               → операция применена, вынимается из очереди;
 * - 404               → записи больше нет (удалена/закрыта кем-то ещё) —
 *                        вынимаем, повторять нечего;
 * - 409 с идемпотентным кодом (already_issued, already_closed) или без кода
 *                        → сервер уже обработал действие (повтор после
 *                        обрыва, то же сделал другой сотрудник) — вынимаем;
 * - 409 с другим кодом  → ЭТО ОТКАЗ, а не «уже сделано»: no_stock (книги
 *                        кончились) или not_in_set (учебник не в наборе
 *                        года). Такую операцию не считаем выполненной:
 *                        attempts+1 и причина в lastError. Раньше любой 409
 *                        трактовался как «сделано» — очередь «разгребалась»
 *                        с зелёной галочкой, а выдачи в журнале не было.
 *
 * - 400/401/5xx       → конфликт: attempts+1, оставляем; при maxAttempts
 *                        — «замораживаем» (ручное решение в UI);
 * - сетевая ошибка    → останавливаем пробег, остальное храним как есть
 *                        (попытки не сжигаем — запрос до сервера не дошёл).
 *
 * Отсюда правило для API: у 409 обязан быть machine-readable `code`, если
 * он не означает «действие уже выполнено». Текст ошибки для этого не годится:
 * его перефразируют, и очередь молча меняет поведение.
 */

export type QueueOpKind = "issue" | "return" | "lost" | "delete-loan";

export interface QueueOp {
  id: string;
  kind: QueueOpKind;
  /** Человекочитаемое описание для UI (например, «Иванов И. — Математика: выдать»). */
  label: string;
  payload: { studentId?: string; bookId?: string; loanId?: string };
  createdAt: number;
  attempts: number;
  status: "pending" | "frozen";
  /** Почему застряла (текст отказа с сервера) — показывает панель очереди. */
  lastError?: string;
}

export interface OpOutcome {
  /** HTTP-статус; null — сетевая ошибка (запрос не дошёл до сервера). */
  status: number | null;
  /** machine-readable причина отказа (решает, «сделано» это или конфликт). */
  code?: string;
  /** Текст ошибки с сервера — его показываем человеку в панели. */
  error?: string;
}

/**
 * Коды 409, означающие «это уже сделано»: операцию можно вынуть из очереди
 * без повторной попытки. Любой другой 409 — отказ, он остаётся и замораживается.
 */
export const IDEMPOTENT_CONFLICT_CODES = new Set([
  "already_issued",
  "already_closed",
]);

export interface SyncSummary {
  applied: number;
  resolved: number;
  failed: number;
  stoppedOnNetwork: boolean;
}

/** Операция → HTTP-запрос. */
export function opRequest(op: QueueOp): {
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: string;
} {
  switch (op.kind) {
    case "issue":
      return {
        url: "/api/loans",
        method: "POST",
        body: JSON.stringify({
          studentId: op.payload.studentId,
          bookId: op.payload.bookId,
        }),
      };
    case "return":
      return { url: `/api/loans/${op.payload.loanId}/return`, method: "PUT" };
    case "lost":
      return { url: `/api/loans/${op.payload.loanId}`, method: "PATCH" };
    case "delete-loan":
      return { url: `/api/loans/${op.payload.loanId}`, method: "DELETE" };
  }
}

export const KIND_LABELS: Record<QueueOpKind, string> = {
  issue: "выдать",
  return: "возврат",
  lost: "утеряна",
  "delete-loan": "удаление",
};

/**
 * Прогон очереди (FIFO). Меняет массив `queue` на месте:
 * применённые/решённые операции вынимает, остальное сохраняет.
 */
export async function runQueueSync(
  queue: QueueOp[],
  exec: (op: QueueOp) => Promise<OpOutcome>,
  maxAttempts = 5
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    applied: 0,
    resolved: 0,
    failed: 0,
    stoppedOnNetwork: false,
  };
  const kept: QueueOp[] = [];

  for (const op of queue) {
    if (summary.stoppedOnNetwork || op.status === "frozen") {
      kept.push(op);
      continue;
    }

    let outcome: OpOutcome;
    try {
      outcome = await exec(op);
    } catch {
      // exec бросает только при сетевом сбое — запрос не ушёл на сервер.
      summary.stoppedOnNetwork = true;
      kept.push(op);
      continue;
    }

    const s = outcome.status;
    if (s === null) {
      summary.stoppedOnNetwork = true;
      kept.push(op);
      continue;
    }
    if (s >= 200 && s < 300) {
      summary.applied++;
    } else if (
      s === 404 ||
      (s === 409 &&
        (!outcome.code || IDEMPOTENT_CONFLICT_CODES.has(outcome.code)))
    ) {
      summary.resolved++;
    } else {
      op.attempts++;
      op.lastError =
        outcome.error ?? (s === null ? "нет связи" : `отказ сервера (${s})`);
      if (op.attempts >= maxAttempts) op.status = "frozen";
      summary.failed++;
      kept.push(op);
    }
  }

  queue.length = 0;
  queue.push(...kept);
  return summary;
}

/** Операции, требующие внимания (не удалось применить maxAttempts раз). */
export function frozenOps(queue: QueueOp[]): QueueOp[] {
  return queue.filter((o) => o.status === "frozen");
}
