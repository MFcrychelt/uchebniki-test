import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";

// Кто сейчас вошёл (для шапки страниц).
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      role: user.role,
      name: `${user.lastName} ${user.firstName}`,
    },
  });
}
