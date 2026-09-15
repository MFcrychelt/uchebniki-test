// Тесты офлайн-очереди (чистое ядро). Запуск:
//   node --experimental-strip-types scripts/test-offline-queue.mjs
import { runQueueSync, opRequest, frozenOps } from "../src/lib/offline-queue.ts";

let passed = 0;
let failed = 0;
const ok = (cond, name) => {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗", name);
  }
};
const op = (kind, extra = {}) => ({
  id: Math.random().toString(36).slice(2),
  kind,
  label: kind,
  payload: extra,
  createdAt: Date.now(),
  attempts: 0,
  status: "pending",
});
const statuses = (list) => {
  let i = 0;
  return async () => ({ status: list[Math.min(i++, list.length)] });
};

console.log("1. Все операции применены (2xx)");
{
  const q = [op("issue"), op("return", { loanId: "l1" }), op("lost", { loanId: "l2" })];
  const s = await runQueueSync(q, statuses([200, 201, 204]));
  ok(q.length === 0, "очередь пуста");
  ok(s.applied === 3, "applied=3");
}

console.log("2. 409/404 — уже обработано на сервере, вынимаем");
{
  const q = [op("return", { loanId: "l1" }), op("return", { loanId: "l2" })];
  const s = await runQueueSync(q, statuses([409, 404]));
  ok(q.length === 0, "очередь пуста");
  ok(s.resolved === 2, "resolved=2");
}

console.log("3. Конфликт (400/500) — оставляем, сжигаем попытки, заморозка");
{
  const q = [op("issue"), op("issue")];
  for (let i = 0; i < 5; i++) {
    const s = await runQueueSync(q, statuses([500, 400]));
    if (i < 4) ok(s.failed === 2, `итерация ${i + 1}: failed=2`);
  }
  ok(q.length === 2, "обе остались");
  ok(q.every((o) => o.attempts === 5), "attempts=5 у всех");
  ok(q.every((o) => o.status === "frozen"), "заморожены");
  ok(frozenOps(q).length === 2, "frozenOps=2");
  // замороженные не исполняются
  const calls = [];
  await runQueueSync(q, async (o) => {
    calls.push(o.id);
    return { status: 200 };
  });
  ok(calls.length === 0, "замороженные не исполняются");
}

console.log("4. Сетевой сбой — стоп, хвост сохраняется, попытки не сжигаются");
{
  const q = [op("issue"), op("return", { loanId: "a" }), op("lost", { loanId: "b" })];
  const s = await runQueueSync(q, statuses([200, null, 200]));
  ok(s.stoppedOnNetwork, "stoppedOnNetwork=true");
  ok(s.applied === 1, "applied=1 (первая)");
  ok(q.length === 2, "хвост сохранён (2 операции)");
  ok(q.every((o) => o.attempts === 0), "попытки не сжигаются");
}

console.log("5. FIFO-порядок исполнения");
{
  const q = [op("issue"), op("return", { loanId: "x" }), op("lost", { loanId: "y" })];
  const order = [];
  await runQueueSync(q, async (o) => {
    order.push(o.kind);
    return { status: 200 };
  });
  ok(JSON.stringify(order) === JSON.stringify(["issue", "return", "lost"]), "порядок сохранён");
}

console.log("6. opRequest — маппинг на HTTP");
{
  const r1 = opRequest(op("issue", { studentId: "s1", bookId: "b1" }));
  ok(r1.method === "POST" && r1.url === "/api/loans" && JSON.parse(r1.body).bookId === "b1", "issue → POST /api/loans");
  const r2 = opRequest(op("return", { loanId: "l9" }));
  ok(r2.method === "PUT" && r2.url === "/api/loans/l9/return", "return → PUT /api/loans/:id/return");
  const r3 = opRequest(op("lost", { loanId: "l9" }));
  ok(r3.method === "PATCH" && r3.url === "/api/loans/l9", "lost → PATCH /api/loans/:id");
  const r4 = opRequest(op("delete-loan", { loanId: "l9" }));
  ok(r4.method === "DELETE" && r4.url === "/api/loans/l9", "delete-loan → DELETE /api/loans/:id");
}

console.log("7. 409 по смыслу: «уже сделано» вынимаем, отказ оставляем");
{
  // no_stock / not_in_set — это НЕ «сервер уже обработал»: выдачи нет.
  const q = [op("issue", { studentId: "s1", bookId: "b1" }), op("issue", { studentId: "s2", bookId: "b1" })];
  const s = await runQueueSync(q, async () => ({
    status: 409,
    code: "no_stock",
    error: "Все экземпляры книги выданы (3 шт.)",
  }));
  ok(q.length === 2, "обе операции остались в очереди");
  ok(s.resolved === 0 && s.failed === 2, "не «выполнено», а конфликт");
  ok(q[0].lastError === "Все экземпляры книги выданы (3 шт.)", "причина сохранена для панели");

  // 5 прогонов — заморозка с той же причиной (не молча).
  for (let i = 0; i < 4; i++) {
    await runQueueSync(q, async () => ({ status: 409, code: "no_stock", error: "нет книг" }));
  }
  ok(q.every((o) => o.status === "frozen"), "после 5 попыток заморожены");
}
{
  const q = [op("return", { loanId: "l1" }), op("issue", { studentId: "s", bookId: "b" })];
  let i = 0;
  const s = await runQueueSync(q, async () => ({
    status: 409,
    code: ["already_closed", "already_issued"][i++],
  }));
  ok(q.length === 0 && s.resolved === 2, "идемпотентные коды → вынимаем");
}
{
  // Обратная совместимость: 409 без кода (старые/чужие роуты) — как раньше.
  const q = [op("lost", { loanId: "l1" })];
  const s = await runQueueSync(q, async () => ({ status: 409 }));
  ok(q.length === 0 && s.resolved === 1, "409 без code → считаем обработанным");
}

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed === 0 ? 0 : 1);
