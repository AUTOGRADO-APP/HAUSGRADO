import { TopBar } from "./TopBar.tsx";
import { getMe } from "@/lib/supabase/server.ts";

// Página ainda não portada do protótipo. Referência: docs/prototipo/hausgrado-prototipo.html + CLAUDE.md.
export async function EmBreve({ title, secao }: { title: string; secao: string }) {
  const me = await getMe();
  return (
    <>
      <TopBar title={title} isMaster={me?.role === "master"} />
      <div className="card">
        <p><strong>Em construção.</strong> Esta tela será portada do protótipo.</p>
        <p className="muted">Especificação: CLAUDE.md › {secao}</p>
      </div>
    </>
  );
}
