// Link público do PDF do orçamento, enviado ao cliente no WhatsApp: /c/orcamento/{id}/{assinatura}.
// Sem login: vale só com a assinatura certa (orc-link.ts). Lê com service_role, no servidor.
import { createAdminClient } from "@/lib/supabase/admin.ts";
import { orcSigOk } from "@/lib/orc-link.ts";
import { orcPdf, orcPdfName } from "@/lib/orc-pdf.ts";
import { portalLink } from "@/lib/msgs.ts";
import { loadQuote } from "@/app/(app)/orcamentos/data.ts";

export const dynamic = "force-dynamic";

const nao = () => new Response("Link inválido ou orçamento removido.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string; sig: string }> }) {
  const { id, sig } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !orcSigOk(id, sig)) return nao();
  const b = await loadQuote(id, createAdminClient());
  if (!b) return nao();
  const bytes = await orcPdf({ ...b, portalUrl: b.os ? portalLink(b.os.portal_token, b.shop.portal_base_url || new URL(req.url).origin) : null });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${orcPdfName(b.quote.number, b.quote.plate || b.os?.plate)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
