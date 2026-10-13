// Página ainda não portada do protótipo. Referência: docs/prototipo/hausgrado-prototipo.html + CLAUDE.md.
export function EmBreve({ title, secao }: { title: string; secao: string }) {
  return (
    <main id="view">
      <section className="panel">
        <div className="ph"><h2>{title}</h2></div>
        <p style={{ margin: 0 }}><b>Em construção.</b> Esta tela está sendo portada do protótipo.</p>
        <p className="hint" style={{ margin: "6px 0 0" }}>Especificação: CLAUDE.md › {secao}</p>
      </section>
    </main>
  );
}
