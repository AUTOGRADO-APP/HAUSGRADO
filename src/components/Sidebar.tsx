"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/permissions.ts";
import { logout } from "@/app/login/actions.ts";

const ROLE_LABEL = { master: "Master", admin: "Administrador", atendente: "Atendente" } as const;

export function Sidebar({ nav, name, role }: { nav: NavItem[]; name: string; role: keyof typeof ROLE_LABEL }) {
  const path = usePathname();
  const on = (href: string) => (path === href || path.startsWith(href + "/") ? "on" : "");
  return (
    <aside className="side">
      <div className="brand">HAUSGRADO<small>Gestão de pátio • beta</small></div>
      <nav className="side-nav">
        {nav.map(i => (
          <div key={i.href} style={{ display: "contents" }}>
            <Link href={i.children?.length ? i.children[0].href : i.href} className={i.children?.length ? "" : on(i.href)}>{i.label}</Link>
            {i.children?.map(c => <Link key={c.href} href={c.href} className={`sub ${on(c.href)}`}>{c.label}</Link>)}
          </div>
        ))}
      </nav>
      <div className="side-user">
        <strong>{name}</strong><div className="muted">{ROLE_LABEL[role]}</div>
        <form action={logout}><button className="btn" style={{ marginTop: 10, width: "100%" }}>Sair</button></form>
      </div>
    </aside>
  );
}
