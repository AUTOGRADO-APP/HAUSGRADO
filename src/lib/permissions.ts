// Quem vê o quê. O menu e o middleware usam esta tabela; o banco (RLS) garante de verdade.
//   Master        tudo.
//   Administrador tudo, menos Configurações e excluir O.S., orçamentos e clientes.
//   Atendente     sem Gestão, Despesas, Comissões, Metas e Calendário financeiro.
//   Mecânico      como o Atendente, mas sem Financeiro (nem receber pagamento), Orçamentos e Clientes
//                 (na O.S. vê só o nome do cliente: sem telefone, WhatsApp, link do portal nem orçamento).
import type { Role } from "./rules.ts";

export interface NavItem { href: string; label: string; roles: Role[]; children?: NavItem[] }

const ALL: Role[] = ["master", "admin", "atendente", "mecanico"];
const FIN: Role[] = ["master", "admin"];
const OFFICE: Role[] = ["master", "admin", "atendente"];

export const NAV: NavItem[] = [
  { href: "/gestao", label: "Visão geral", roles: FIN },
  {
    href: "/financeiro", label: "Financeiro", roles: OFFICE, children: [
      { href: "/financeiro/entradas", label: "Entradas", roles: OFFICE },
      { href: "/financeiro/compras", label: "Compras", roles: OFFICE },
      { href: "/financeiro/despesas", label: "Despesas", roles: FIN },
      { href: "/financeiro/fornecedores", label: "Fornecedores", roles: OFFICE },
      { href: "/financeiro/comissoes", label: "Comissões", roles: FIN },
      { href: "/financeiro/metas", label: "Metas", roles: FIN },
      { href: "/financeiro/calendario", label: "Calendário financeiro", roles: FIN },
    ],
  },
  { href: "/quadro", label: "Quadro", roles: ALL },
  { href: "/calendario", label: "Calendário", roles: ALL },
  { href: "/clientes", label: "Clientes", roles: OFFICE },
  { href: "/orcamentos", label: "Orçamentos", roles: OFFICE },
  { href: "/produtos", label: "Produtos", roles: ALL },
  { href: "/servicos", label: "Serviços", roles: ALL },
  { href: "/historico", label: "Histórico de O.S.", roles: ALL },
];

/** Páginas restritas por prefixo, da mais específica para a mais geral (o resto é liberado para qualquer usuário logado). */
const RESTRICTED: { prefix: string; roles: Role[] }[] = [
  { prefix: "/config", roles: ["master"] },
  { prefix: "/gestao", roles: FIN },
  { prefix: "/financeiro/despesas", roles: FIN },
  { prefix: "/financeiro/comissoes", roles: FIN },
  { prefix: "/financeiro/metas", roles: FIN },
  { prefix: "/financeiro/calendario", roles: FIN },
  { prefix: "/financeiro", roles: OFFICE },
  { prefix: "/clientes", roles: OFFICE },
  { prefix: "/orcamentos", roles: OFFICE },
];

export function canAccess(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const rule = RESTRICTED.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return rule ? rule.roles.includes(role) : true;
}

/** Números financeiros (Gestão, despesas, comissões, metas, desfazer recebimento). */
export const isFin = (role: Role | null | undefined) => role === "master" || role === "admin";
/** Escritório = todos menos o mecânico: orçamentos, clientes, receber pagamento, entradas, compras e fornecedores. */
export const isOffice = (role: Role | null | undefined) => role === "master" || role === "admin" || role === "atendente";
/** Excluir O.S., orçamentos e clientes. */
export const canDelete = (role: Role | null | undefined) => role === "master";

export const homeFor = (role: Role) => (isFin(role) ? "/gestao" : "/quadro");

export function navFor(role: Role): NavItem[] {
  return NAV.filter(i => i.roles.includes(role)).map(i => ({ ...i, children: i.children?.filter(c => c.roles.includes(role)) }));
}

export const MSG_RECEBER = "Receber o pagamento e finalizar a O.S. fica com o atendimento, o administrador ou o master.";
