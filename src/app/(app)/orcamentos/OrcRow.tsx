"use client";
// Linha clicável da lista de orçamentos (abre o editor).
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function OrcRow({ id, children }: { id: string; children: ReactNode }) {
  const router = useRouter();
  const go = () => router.push(`/orcamentos/${id}`);
  return (
    <tr className="click" tabIndex={0} onClick={go} onKeyDown={e => { if (e.key === "Enter") go(); }}>{children}</tr>
  );
}
