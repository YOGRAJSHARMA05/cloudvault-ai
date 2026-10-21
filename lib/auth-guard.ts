import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

export async function requireRole(role: UserRole) {
  const user = await requireUser();
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!currentUser || currentUser.role !== role) redirect("/dashboard");
  return { ...user, role: currentUser.role };
}