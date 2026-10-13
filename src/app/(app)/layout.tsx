import { redirect } from "next/navigation";
import { getMe } from "@/lib/supabase/server.ts";
import { navFor } from "@/lib/permissions.ts";
import { Sidebar } from "@/components/Sidebar.tsx";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) return redirect("/login");
  return (
    <>
      <Sidebar nav={navFor(me.role)} name={me.full_name} role={me.role} />
      <main className="main">{children}</main>
    </>
  );
}
