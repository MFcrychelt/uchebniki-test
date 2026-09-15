import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { Serwist } from "serwist";

// Минимальная типизация глобала service worker'а
// (без lib.webworker, чтобы не конфликтовать с DOM-типами проекта).
interface SWScope {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
}

declare const self: SWScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
