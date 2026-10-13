// Regras de produto usadas em Produtos, Orçamentos e Compras (mesmas do protótipo).
import { digits } from "./labels.ts";

export interface ProdCarac {
  category: string | null;
  viscosity?: string | null;
  api?: string | null;
  volume?: string | null;
  application_spec?: string | null;
  application_brands?: string[] | null;
  additive_type?: string | null;
}

/** EAN-8/13 válido (vazio = válido). Pesos 3/1 alternados a partir da direita, sem o dígito final. */
export function eanOk(e: string | null | undefined): boolean {
  const d = digits(e);
  if (!d) return true;
  if (d.length !== 13 && d.length !== 8) return false;
  const n = d.split("").map(Number);
  const ck = n.pop()!;
  const sum = n.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === ck;
}

/** Margem em % inteiro: (preço − custo) ÷ preço. null quando não há preço. */
export function margem(custo: number | string | null | undefined, preco: number | string | null | undefined): number | null {
  const c = Number(custo) || 0, p = Number(preco) || 0;
  return p ? Math.round(((p - c) / p) * 100) : null;
}

/** Resumo das características: "5W30 · API SN · 1L", "Aplicação: VW, Fiat", "Tipo: Arrefecimento"… */
export function prodResumo(p: ProdCarac): string {
  if (p.category === "oleo_motor") return [p.viscosity, p.api && "API " + p.api, p.volume].filter(Boolean).join(" · ");
  if (p.category === "oleo_trans") return p.application_spec || "";
  if (p.category === "aditivos") return p.additive_type ? "Tipo: " + p.additive_type : "";
  if (p.category === "peca" || p.category === "filtros") {
    const a = p.application_brands || [];
    return a.length ? "Aplicação: " + a.join(", ") : "";
  }
  return "";
}
