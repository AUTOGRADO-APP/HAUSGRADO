// Quem vê o quê. O menu e o middleware usam esta tabela; o banco (RLS) garante de verdade.
import type { Role } from "./rules.ts";

export interface NavItem { href: string; label: string; roles: Role[]; children?: NavItem[] }

const ALL: Role[] = ["master", "admin", "atendente"];
const FIN: Role[] = ["master", "admin"];

export const NAV: NavItem[] = [
  { href: "/gestao", label: "Gestão", roles: FIN },
  {
    href: "/financeiro", label: "Financeiro", roles: FIN, children: [
      { href: "/financeiro/entradas", label: "Entradas", roles: FIN },
      { href: "/financeiro/compras", label: "Compras", roles: FIN },
      { href: "/financeiro/despesas", label: "Despesas", roles: FIN },
      { href: "/financeiro/fornecedores", label: "Fornecedores", roles: FIN },
      { href: "/financeiro/comissoes", label: "Comissões", roles: FIN },
      { href: "/financeiro/calendario", label: "Calendário financeiro", roles: FIN },
    ],
  },
  { href: "/quadro", label: "Quadro", roles: ALL },
  { href: "/calendario", label: "Calendário", roles: ALL },
  { href: "/clientes", label: "Clientes", roles: ALL },
  { href: "/orcamentos", label: "Orçamentos", roles: ALL },
  { href: "/produtos", label: "Produtos", roles: ALL },
  { href: "/servicos", label: "Serviços", roles: ALL },
  { href: "/historico", label: "Histórico de O.S.", roles: ALL },
];

/** Páginas restritas por prefixo (o resto é liberado para qualquer usuário logado). */
const RESTRICTED: { prefix: string; roles: Role[] }[] = [
  { prefix: "/config", roles: ["master"] },
  { prefix: "/gestao", roles: FIN },
  { prefix: "/financeiro", roles: FIN },
];

export function canAccess(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const rule = RESTRICTED.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return rule ? rule.roles.includes(role) : true;
}

export const homeFor = (role: Role) => (role === "atendente" ? "/quadro" : "/gestao");

export function navFor(role: Role): NavItem[] {
  return NAV.filter(i => i.roles.includes(role)).map(i => ({ ...i, children: i.children?.filter(c => c.roles.includes(role)) }));
}
