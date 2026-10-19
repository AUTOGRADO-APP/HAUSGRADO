// Rótulos e formatação de interface (pt-BR). Mesmos nomes/valores do protótipo.
import type { Role, Status } from "./rules.ts";

export const TIPOS: Record<string, string> = { servico: "Serviço", manutencao: "Manutenção", garantia: "Garantia" };
export const FOTOS: [string, string][] = [["frontal", "Frontal"], ["lat_esq", "Lateral esquerda"], ["lat_dir", "Lateral direita"], ["traseira", "Traseira"], ["motor", "Cofre do motor"], ["painel", "Painel"]];
export const ITENS_CK: [string, string][] = [["estepe", "Estepe"], ["macaco", "Macaco / chave de roda"], ["triangulo", "Triângulo"], ["documento", "Documento (CRLV)"], ["multimidia", "Rádio / multimídia"], ["tapetes", "Tapetes"]];
export const ORC_ST: Record<string, string> = { rascunho: "Rascunho", enviado: "Enviado ao cliente", aprovado: "Aprovado", recusado: "Recusado" };
export const ABAS: [string, string, string][] = [["avarias", "AVARIAS", "Avarias"], ["pecas", "PEÇAS", "Peças"], ["servicos", "SERVIÇO", "Serviço"]];
export const AG_ST: Record<string, string> = { agendado: "Agendado", atendido: "O.S. aberta", faltou: "Faltou" };
export const PAPEIS: Record<Role, string> = { master: "Master", admin: "Administrador", atendente: "Atendente", mecanico: "Mecânico" };
export const NIVEIS = ["Reserva", "1/4", "1/2", "3/4", "Cheio"];
export const FORMAS: [string, string][] = [["dinheiro", "Dinheiro"], ["credito", "Cartão de crédito"], ["debito", "Cartão de débito"], ["pix", "Pix"]];
export const FORMAN: Record<string, string> = Object.fromEntries(FORMAS);
export const FPAG: [string, string][] = [["pix", "Pix"], ["boleto", "Boleto"], ["debito", "Cartão de débito"], ["credito", "Cartão de crédito"], ["dinheiro", "Dinheiro"], ["transferencia", "Transferência"]];
export const FPAGN: Record<string, string> = Object.fromEntries(FPAG);
export const CATS: [string, string][] = [["oleo_motor", "Óleo motor"], ["oleo_trans", "Óleo transmissão"], ["peca", "Peça"], ["filtros", "Filtros"], ["aditivos", "Aditivos"]];
export const CATN: Record<string, string> = Object.fromEntries(CATS);
export const VISC = ["0W16", "0W20", "0W30", "5W20", "5W30", "5W40", "10W40", "15W40", "20W50", "10W60"];
export const APIS = ["SF", "SJ", "SL", "SN", "SP", "SQ"];
export const VOLS = ["1L", "4L", "5L"];
export const MARCAS = ["Audi", "BMW", "Mercedes Benz", "Mini", "Hyundai", "KIA", "Honda", "Toyota", "Mitsubishi", "BYD", "GWM", "Fiat", "Volkswagen", "Chevrolet", "Ford"];
export const ADIT = ["Combustível", "Óleo", "Transmissão", "Direção", "Arrefecimento"];
export const CATDESP = ["Água", "Aluguel", "Antecipação de lucros", "Compra de mercadorias", "Contabilidade", "Energia", "Equipamentos", "Estornos", "Financeiro", "Folha de pagamento", "Comissão", "Impostos", "Internet", "Prejuízos diversos", "Reformas", "Sistemas", "Taxa de pagamento", "Terceiros"];
export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const STATUS_IDX: Record<Status, number> = { orcamento: 0, aprovado: 1, pecas: 2, servico: 3, entrega: 4, finalizado: 5 };

export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const fmtCep = (v: string | null | undefined) => { const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d; };
export function fmtFone(s: string | null | undefined) {
  const d = digits(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const normPlaca = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
export const placaOk = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p);
export const iniciais = (n: string) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
export const primeiroNome = (n: string | null | undefined) => String(n || "").split(" ")[0];

const TZ = "America/Sao_Paulo";
/** dd/mm hh:mm */
export const dt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
/** dd/mm/aaaa hh:mm */
export const dtFull = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
/** dd/mm/aaaa a partir de 'aaaa-mm-dd' ou ISO */
export const dataBR = (d: string | null | undefined) => {
  if (!d) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ });
};
export const ddmm = (d: string | null | undefined) => dataBR(d).slice(0, 5);
/** 'aaaa-mm-dd' no fuso de São Paulo */
export function ymd(d: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p;
}
export const addDays = (k: string, n: number) => { const d = new Date(k + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** valor para <input type="datetime-local"> no fuso de São Paulo */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return p.replace(" ", "T");
}
/** converte datetime-local (hora de São Paulo, UTC−3) em ISO */
export const fromLocalInput = (v: string) => (v ? new Date(v + ":00-03:00").toISOString() : null);
export const fmtDias = (d: number) => { if (!d) return "—"; const h = Math.round(d * 24); return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d ${h % 24} h`; };
export const pct = (v: number) => `${String(Math.round(v * 100) / 100).replace(".", ",")}%`;
/** número digitado "1.234,50" ou "1234.5" → 1234.5 */
export function parseNum(s: string | number | null | undefined) {
  if (typeof s === "number") return s;
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}
export const numBR = (v: number | null | undefined) => (v ? String(v).replace(".", ",") : "");

/** Período rápido (Este mês, Mês passado...) → [de, até] em 'aaaa-mm-dd' */
export const FPER: [string, string][] = [["mes", "Este mês"], ["ant", "Mês passado"], ["30", "Últimos 30 dias"], ["ano", "Este ano"], ["tudo", "Tudo"]];
export function periodo(k: string): [string, string] {
  const h = ymd(); const [y, m] = h.split("-").map(Number);
  const z = (n: number) => String(n).padStart(2, "0");
  const fimMes = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (k === "mes") return [`${y}-${z(m)}-01`, `${y}-${z(m)}-${z(fimMes(y, m))}`];
  if (k === "ant") { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return [`${yy}-${z(mm)}-01`, `${yy}-${z(mm)}-${z(fimMes(yy, mm))}`]; }
  if (k === "30") return [addDays(h, -29), h];
  if (k === "ano") return [`${y}-01-01`, `${y}-12-31`];
  return ["", ""];
}
