"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  KIND_LABELS,
  runQueueSync,
  type QueueOp,
} from "@/lib/offline-queue";
import {
  emitDataChanged,
  executeOp,
  readQueue,
  writeQueue,
} from "@/lib/offline-queue-browser";

const MAX_ATTEMPTS = 5;
const SYNC_INTERVAL_MS = 30_000;

/**
 * Панель офлайн-очереди (в шапке панели библиотекаря):
 * индикатор сети, список сохранённых операций, ручная/авто-синхронизация.
 */
export default function QueuePanel() {
  const [queue, setQueue] = useState<QueueOp[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refresh = useCallback(() => setQueue(readQueue()), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onQueueChanged = () => refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("uchebniki:queue-changed", onQueueChanged);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("uchebniki:queue-changed", onQueueChanged);
    };
  }, [refresh]);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    const q = readQueue();
    if (!q.some((o) => o.status === "pending")) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const summary = await runQueueSync(q, executeOp, MAX_ATTEMPTS);
      writeQueue(q);
      setQueue([...q]);
      if (summary.applied + summary.resolved > 0) emitDataChanged();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Автосинхронизация: при появлении сети и при изменении очереди.
  useEffect(() => {
    if (online && queue.some((o) => o.status === "pending")) sync();
  }, [online, queue, sync]);

  // И периодически, пока есть что отправить.
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => {
      if (readQueue().some((o) => o.status === "pending")) sync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(t);
  }, [online, sync]);

  const removeOp = (id: string) => {
    const q = readQueue().filter((o) => o.id !== id);
    writeQueue(q);
    setQueue([...q]);
  };

  const clearFrozen = () => {
    const q = readQueue().filter((o) => o.status !== "frozen");
    writeQueue(q);
    setQueue([...q]);
  };

  if (queue.length === 0 && online) return null;

  return (
    <div className="space-y-2">
      {!online && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <WifiOff className="h-4 w-4 shrink-0" />
          Нет соединения — действия сохраняются в очередь и отправятся позже.
        </div>
      )}

      {queue.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Офлайн-очередь: {queue.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={sync}
                  disabled={syncing || !online}
                >
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  Синхронизировать
                </Button>
                {queue.some((o) => o.status === "frozen") && (
                  <Button size="sm" variant="ghost" onClick={clearFrozen}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Убрать неудачные
                  </Button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-border">
              {queue.map((op) => (
                <li key={op.id} className="flex items-center gap-2 py-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      op.status === "frozen" ? "bg-destructive" : "bg-amber-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="text-muted-foreground">
                        [{KIND_LABELS[op.kind]}]
                      </span>{" "}
                      {op.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(op.createdAt).toLocaleTimeString("ru-RU")}
                      {op.attempts > 0 && ` · попыток: ${op.attempts}`}
                      {op.status === "frozen" && (
                        <span className="text-destructive">
                          {" "}
                          · не отправлено — проверьте вручную
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => removeOp(op.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Убрать из очереди"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
