"use client";

/**
 * Браузерная обвязка офлайн-очереди: localStorage + fetch.
 * Чистая логика синхронизации — в offline-queue.ts (тестируется в node).
 */

import {
  opRequest,
  type OpOutcome,
  type QueueOp,
  type QueueOpKind,
} from "@/lib/offline-queue";

const QUEUE_KEY = "uchebniki:queue";
const MAX_OPS = 200;

export function readQueue(): QueueOp[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as QueueOp[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(queue: QueueOp[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_OPS)));
  } catch {
    // localStorage недоступен (private mode) — работаем без очереди
  }
}

export function makeOp(
  kind: QueueOpKind,
  payload: QueueOp["payload"],
  label: string
): QueueOp {
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
}

/** Сохранить операцию в очередь (вызывается при сетевом сбое). */
export function enqueueOp(op: QueueOp): void {
  const q = readQueue();
  q.push(op);
  writeQueue(q);
  window.dispatchEvent(new CustomEvent("uchebniki:queue-changed"));
}

/**
 * Исполнить одну операцию: HTTP-статус плюс причина отказа (`code`/`error`
 * из тела ответа) или null при сетевом сбое. Причина нужна, чтобы 409 вида
 * «нет свободных экземпляров» не съедался очередью как «уже сделано».
 */
export async function executeOp(op: QueueOp): Promise<OpOutcome> {
  const req = opRequest(op);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.body ? { "Content-Type": "application/json" } : undefined,
      body: req.body,
    });
    if (res.ok) return { status: res.status };
    const data = (await res.json().catch(() => null)) as
      | { code?: unknown; error?: unknown }
      | null;
    return {
      status: res.status,
      code: typeof data?.code === "string" ? data.code : undefined,
      error: typeof data?.error === "string" ? data.error : undefined,
    };
  } catch {
    return { status: null };
  }
}

/** Событие для вьюшек: данные могли измениться (после синхронизации). */
export const DATA_CHANGED_EVENT = "uchebniki:data-changed";

export function emitDataChanged(): void {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}
