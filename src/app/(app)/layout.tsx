import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/lib/auth";
import { getDefaultLandingPath } from "@/lib/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  if (session.role === "unknown") {
    redirect(getDefaultLandingPath(session.role));
  }

  return (
    <AppShell
      user={{
        email: session.user.email ?? "",
        displayName: session.displayName,
      }}
      role={session.role}
      unreadNotifications={0}
    >
      {children}
    </AppShell>
  );
}
