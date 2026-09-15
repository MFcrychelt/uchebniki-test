import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import LibrarianShell from "./shell";

// Защёлка: без сессии персонала — редирект на /login.
export default async function LibrarianPage() {
  const user = await requireStaff("/librarian");
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <LibrarianShell userName={`${user.lastName} ${user.firstName}`} />
    </Suspense>
  );
}
