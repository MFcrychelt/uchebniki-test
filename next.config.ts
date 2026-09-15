import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { spawnSync } from "node:child_process";
import path from "node:path";

// Реvisions для явной precache-записи офлайн-страницы.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      // Cloudflare (и другие обратные прокси) по умолчанию могут кэшировать
      // GET-ответы API и статику. Для API это расшатывает авторизацию
      // (чужой ответ вместо своего), для sw.js — намертво блокирует
      // обновление PWA после передеплоя: телефоны продолжают жить со
      // старым service worker'ом.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      // Клиентская часть @serwist/window (~245 КБ) не нужна: sw-entry.mjs
      // лишь регистрирует sw.js, а вся кэш-логика живёт в нём самом.
      // Алиас заменяет её лёгкими stub'ами (см. src/lib/sw-client*), чтобы
      // каждый initial-бандл не тащил весь клиентский Workbox.
      // Ключ подпути — первым (webpack выбирает первое совпадение).
      config.resolve.alias = {
        ...config.resolve.alias,
        "@serwist/window/internal": path.join(
          __dirname,
          "src/lib/sw-client-internal.ts"
        ),
        "@serwist/window": path.join(__dirname, "src/lib/sw-client.ts"),
      };
    }
    return config;
  },
};

// PWA: service worker собирается из serwist.ts при production-сборке.
// В dev SW выключен, чтобы не кэшировать меняющиеся ресурсы.
const withSerwist = withSerwistInit({
  cacheOnNavigation: true,
  swSrc: "serwist.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
