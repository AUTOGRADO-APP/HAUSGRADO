// Orçamento que vale para a O.S. e o "próximo passo" de cada etapa (quadro e detalhe da O.S.).
import type { Status } from "./rules.ts";

export type QuoteStatus = "rascunho" | "enviado" | "aprovado" | "recusado";
export interface QuoteLite { id: string; status: QuoteStatus; created_at: string }

/** Mesmo critério de os_quote() no banco: o aprovado; senão o mais recente que não foi recusado. */
export function activeQuote<T extends QuoteLite>(quotes: T[]): T | null {
  const vivos = quotes.filter(q => q.status !== "recusado");
  return vivos.find(q => q.status === "aprovado")
    ?? vivos.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
    ?? null;
}

/** Selo do card no quadro. */
export function quoteBadge(status: Status, q: { status: QuoteStatus } | null): { text: string; tone: "warn" | "ok" | "" } | null {
  if (status === "finalizado") return null;
  if (!q) return { text: "Sem orçamento", tone: "warn" };
  if (q.status === "rascunho") return { text: "Orçamento em rascunho", tone: "warn" };
  if (q.status === "enviado") return { text: "Aguardando cliente", tone: "" };
  return { text: "Aprovado", tone: "ok" };
}

export type NextAction =
  | { kind: "quote-new" }
  | { kind: "quote-open" }
  | { kind: "status"; to: Status }
  | { kind: "pay" }
  | { kind: "pasta" };
export interface NextStep { title: string; hint: string; button: string; short: string; action: NextAction }

/** O que fazer agora com a O.S., conforme a etapa e o orçamento. */
export function nextStep(status: Status, q: { status: QuoteStatus } | null): NextStep {
  switch (status) {
    case "orcamento":
      if (!q) return { title: "Montar o orçamento", hint: "Registre as avarias e monte o orçamento para o cliente aprovar.", button: "Criar orçamento", short: "Orçamento", action: { kind: "quote-new" } };
      if (q.status === "rascunho") return { title: "Enviar o orçamento ao cliente", hint: "O orçamento está em rascunho. Envie pelo WhatsApp para o cliente aprovar pelo link.", button: "Abrir e enviar orçamento", short: "Enviar orç.", action: { kind: "quote-open" } };
      if (q.status === "enviado") return { title: "Aguardando o cliente", hint: "O cliente ainda não respondeu. Se ele aprovou por telefone, registre a aprovação no orçamento.", button: "Abrir orçamento", short: "Orçamento", action: { kind: "quote-open" } };
      return { title: "Orçamento aprovado", hint: "Passe o carro para Aprovado.", button: "Mover para Aprovado", short: "Aprovado ›", action: { kind: "status", to: "aprovado" } };
    case "aprovado":
      return { title: "Começar o serviço", hint: "Se faltar alguma peça, use Aguardando peças na barra de etapas.", button: "Mover para Em serviço", short: "Em serviço ›", action: { kind: "status", to: "servico" } };
    case "pecas":
      return { title: "Peças chegaram?", hint: "Quando as peças chegarem, passe o carro para Em serviço.", button: "Mover para Em serviço", short: "Em serviço ›", action: { kind: "status", to: "servico" } };
    case "servico":
      return { title: "Registrar e concluir o serviço", hint: "Fotografe o serviço feito na aba Serviço. Ao terminar, passe para Esperando entrega.", button: "Mover para Esperando entrega", short: "Entrega ›", action: { kind: "status", to: "entrega" } };
    case "entrega":
      return { title: "Entregar o carro", hint: "Receba o pagamento do cliente para finalizar a O.S.", button: "Receber e finalizar", short: "Receber", action: { kind: "pay" } };
    default:
      return { title: "O.S. finalizada", hint: "Imprima a pasta do cliente com as fotos e a descrição do serviço.", button: "Imprimir pasta do cliente", short: "Pasta", action: { kind: "pasta" } };
  }
}

/** Aba aberta ao entrar na O.S.: avarias no orçamento, peças enquanto espera peças, serviço depois. */
export const defaultTab = (status: Status) =>
  status === "orcamento" ? "avarias" : status === "aprovado" || status === "pecas" ? "pecas" : "servicos";
