// PDF do orçamento como arquivo (Baixar PDF e anexo no compartilhamento do celular). Exige login (RLS).
import { orcPdf, orcPdfName } from "@/lib/orc-pdf.ts";
import { portalLink } from "@/lib/msgs.ts";
import { loadQuote } from "../../data.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await loadQuote(id);
  if (!b) return new Response("Orçamento não encontrado.", { status: 404 });
  const bytes = await orcPdf({ ...b, portalUrl: b.os ? portalLink(b.os.portal_token, b.shop.portal_base_url || new URL(req.url).origin) : null });
  const name = orcPdfName(b.quote.number, b.quote.plate || b.os?.plate);
  const dl = new URL(req.url).searchParams.has("baixar");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
