import { redirect } from "next/navigation";
import { getMe } from "@/lib/supabase/server.ts";
import { loadShell } from "@/lib/shell-data.ts";
import { AppShell } from "@/components/AppShell.tsx";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) return redirect("/login");
  const data = await loadShell(me);
  return <AppShell data={data}>{children}</AppShell>;
}
