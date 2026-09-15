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

/** Исполнить одну операцию: HTTP-статус или null при сетевом сбое. */
export async function executeOp(op: QueueOp): Promise<OpOutcome> {
  const req = opRequest(op);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.body ? { "Content-Type": "application/json" } : undefined,
      body: req.body,
    });
    return { status: res.status };
  } catch {
    return { status: null };
  }
}

/** Событие для вьюшек: данные могли измениться (после синхронизации). */
export const DATA_CHANGED_EVENT = "uchebniki:data-changed";

export function emitDataChanged(): void {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}
