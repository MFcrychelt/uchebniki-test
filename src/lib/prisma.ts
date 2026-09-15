import "./temporal-polyfill"; // Подложить Temporal до создания клиента Prisma 8
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../../prisma/schema";
import contractJson from "../../prisma/schema.json";

/**
 * Единственный экземпляр ORM-клиента на процесс (Next.js server).
 * Не закрываем его в обработчиках — пул живёт весь цикл жизни приложения.
 */
export const db = postgres<Contract>({
  contractJson,
  url: process.env.DATABASE_URL!,
});
