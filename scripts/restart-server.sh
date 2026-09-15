#!/usr/bin/env bash
# Перезапуск production-сервера (next start) после саммоуффа из админки.
#
# Вызывается приложением (env RESTART_CMD) в detached-режиме: приложение
# само завершится через ~1.5 с, скрипт дожидается освобождения порта
# 3000 и поднимает новый сервер, полностью отделённый от текущей сессии.
#
# Если у вас есть надзиратель (pm2/systemd/docker), задайте вместо этого:
#   RESTART_CMD="pm2 restart school-library"
#   RESTART_CMD="systemctl restart school-library"
set -u
cd "$(dirname "$0")/.."
LOG="${RESTART_LOG:-/tmp/school-library-restart.log}"
exec >>"$LOG" 2>&1

echo "=== restart-server.sh $(date -Is) pid=$$ ==="

# Ждём, пока старый процесс освободит порт 3000 (до 30 с).
for i in $(seq 1 30); do
  if ! (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
    break
  fi
  exec 3>&- 2>/dev/null || true
  sleep 1
done

# Страховка от «зависшего» next. `next start` — это обёртка (npm/sh),
# а реальный сервер — процесс `next-server`; гоняем оба паттерна,
# но не себя (свой pid и родителей исключаем по умолчанию: pkill не
# убивает себя, а скрипт не называется next*).
pkill -f "next-server" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
sleep 1

# Поднимаем новый сервер в отдельной сессии, чтобы он пережил завершение
# и этого скрипта, и исходного процесса.
if command -v setsid >/dev/null 2>&1; then
  setsid nohup npm start >/dev/null 2>&1 < /dev/null &
else
  nohup npm start >/dev/null 2>&1 < /dev/null &
fi
echo "new server started (npm start), parent pid=$!"
