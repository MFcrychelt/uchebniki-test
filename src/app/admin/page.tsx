import { requireAdmin } from "@/lib/auth";
import AdminPanel from "./panel";

// Защёлка: только роль ADMIN (остальной персонал — в /librarian).
export default async function AdminPage() {
  const user = await requireAdmin("/admin");
  return <AdminPanel userName={`${user.lastName} ${user.firstName}`} />;
}
