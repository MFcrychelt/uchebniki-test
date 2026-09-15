/**
 * Офлайн-очередь операций с книгами (чистое ядро — без DOM).
 *
 * Библиотекарь работает при обрыве сети: неудавшиеся мутации (выдача,
 * возврат, «утеряна», удаление) сохраняются в очередь (localStorage,
 * см. offline-queue-browser.ts) и применяются при появлении соединения.
 *
 * Правила синхронизации (runQueueSync), FIFO:
 * - 2xx               → операция применена, вынимается из очереди;
 * - 409               → сервер уже обработал действие (повторный запрос
 *                        после обрыва или другое устройство) — считаем
 *                        выполненной, вынимаем;
 * - 404               → выдача уже не существует (удалена/закрыта) —
 *                        вынимаем, повторять нечего;
 * - 400/401/5xx       → конфликт: attempts+1, оставляем; при maxAttempts
 *                        — «замораживаем» (ручное решение в UI);
 * - сетевая ошибка    → останавливаем пробег, остальное храним как есть
 *                        (попытки не сжигаем — запрос до сервера не дошёл).
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
}

export interface OpOutcome {
  /** HTTP-статус; null — сетевая ошибка (запрос не дошёл до сервера). */
  status: number | null;
}

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
    } else if (s === 409 || s === 404) {
      summary.resolved++;
    } else {
      op.attempts++;
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
