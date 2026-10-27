"use client";
// Barra de botões das páginas de impressão (some na impressão).
import Link from "next/link";
import { sfx } from "@/lib/ui.ts";

export function PrintBar({ title, hint, back, backLabel = "‹ Voltar ao orçamento" }: { title: string; hint: string; back: string; backLabel?: string }) {
  return (
    <section className="panel pasta-bar">
      <div className="ph" style={{ marginBottom: 8 }}>
        <h2>{title}</h2>
        <div className="row">
          <Link className="key" href={back}>{backLabel}</Link>
          <button className="key accent" onClick={() => { sfx("tap"); window.print(); }}>Imprimir</button>
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>{hint} Para salvar em PDF, escolha “Salvar como PDF” na janela de impressão.</p>
    </section>
  );
}
