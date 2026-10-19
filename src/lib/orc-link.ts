import "server-only";
// Link público do PDF do orçamento (vai na mensagem do WhatsApp): /c/orcamento/{id}/{assinatura}.
// A assinatura é um HMAC do id com um segredo do servidor, então só quem recebeu o link abre o PDF;
// o arquivo é gerado na hora, sempre com o orçamento atual.
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.ORC_PDF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** null quando o servidor não tem segredo configurado (aí a mensagem sai sem o link do PDF). */
export function orcSig(quoteId: string): string | null {
  const k = secret();
  if (!k) return null;
  return createHmac("sha256", k).update("orc-pdf:" + quoteId).digest("hex").slice(0, 32);
}

export function orcSigOk(quoteId: string, sig: string) {
  const ok = orcSig(quoteId);
  if (!ok || !/^[a-f0-9]{32}$/.test(sig)) return false;
  return timingSafeEqual(Buffer.from(ok), Buffer.from(sig));
}
