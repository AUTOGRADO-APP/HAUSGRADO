// Mensagens de WhatsApp (texto igual ao do protótipo / seção 8.2).
import { brl, isBlankItem } from "./rules.ts";
import { digits, primeiroNome } from "./labels.ts";

export function waURL(tel: string | null | undefined, msg: string) {
  let d = digits(tel); if (!d) return null;
  if (!d.startsWith("55")) d = "55" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}

export function portalLink(token: string, base?: string | null) {
  const b = (base || process.env.NEXT_PUBLIC_SITE_URL || (typeof location !== "undefined" ? location.origin : "")).replace(/[#/]+$/, "");
  return `${b}/c/${token}`;
}

export function msgLemb(a: { date: string; time: string; plate: string | null; reason: string | null; customer_name: string }, oficina: string) {
  const d = new Date(a.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return `Olá, ${primeiroNome(a.customer_name)}! Aqui é da ${oficina}.\n\nPassando para lembrar do seu agendamento amanhã, ${d}, às ${a.time}${a.plate ? ` (veículo placa ${a.plate})` : ""}.${a.reason ? `\nMotivo: ${a.reason}` : ""}\n\nSe não puder vir, responda esta mensagem que a gente reagenda.`;
}

export function msgOS(o: { make: string | null; model: string | null; plate: string; number: number; customer_name: string; link: string }, oficina: string) {
  return `Olá, ${primeiroNome(o.customer_name)}! Aqui é da ${oficina}.\n\nSeu veículo ${o.make || ""} ${o.model || ""} — placa ${o.plate} — está registrado na OS nº ${o.number}.\n\nAcompanhe o serviço em tempo real, com fotos e vídeos:\n${o.link}\n\nSenha de acesso: o seu número de celular com DDD (somente números).`;
}

export function msgOrc(r: { number: number; plate: string | null; discount: number; validity_days: number; customer_name: string; items: { description: string; qty: number; unit_price: number }[]; link?: string | null }) {
  const sub = r.items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const l = r.items.filter(i => !isBlankItem(i)).map(i => `• ${i.description} (${i.qty}x) — ${brl(i.qty * i.unit_price)}`).join("\n");
  return `Olá, ${primeiroNome(r.customer_name)}! Segue o orçamento nº ${r.number} para o veículo placa ${r.plate || ""}:\n\n${l}\n${+r.discount ? `Desconto: −${brl(+r.discount)}\n` : ""}\n*Total: ${brl(sub - (+r.discount || 0))}*\nValidade: ${r.validity_days} dias.\n\n${r.link ? `Você pode aprovar pelo link de acompanhamento:\n${r.link}\nSenha: seu celular com DDD.` : ""}`;
}
