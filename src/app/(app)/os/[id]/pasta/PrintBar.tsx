"use client";
import Link from "next/link";
import { sfx } from "@/lib/ui.ts";

/** Barra da pasta do cliente (some na impressão). */
export function PrintBar({ osId, number }: { osId: string; number: number }) {
  return (
    <section className="panel pasta-bar">
      <div className="ph" style={{ marginBottom: 8 }}>
        <h2>Pasta do cliente · OS {number}</h2>
        <div className="row">
          <Link className="key" href={`/os/${osId}`} onClick={() => sfx("tap")}>‹ O.S.</Link>
          <button className="key accent" onClick={() => { sfx("tap"); window.print(); }}>Imprimir</button>
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>Página 1: veículo, datas, fotos de entrada e descrição do serviço. Depois: Avarias, Peças e Serviço executado em sequência, aproveitando o espaço da folha. Para salvar em PDF, escolha “Salvar como PDF” na janela de impressão.</p>
    </section>
  );
}
