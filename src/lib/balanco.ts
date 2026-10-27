"use client";
// Modo Balanço: o prazo vem do servidor (stock_count_until); aqui só o estado compartilhado entre a página Produtos e o mascote.
import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "./supabase/client.ts";

let ate: number | null = null;
let carregado = false;
const subs = new Set<() => void>();
const avisa = () => subs.forEach(f => f());

export function setBalanco(iso: string | null) { ate = iso ? new Date(iso).getTime() : null; carregado = true; avisa(); }

export async function carregaBalanco() {
  const { data } = await createClient().rpc("stock_count_until");
  setBalanco((data as string | null) ?? null);
}

/** "59:07" ou "2:59:07" a partir dos milissegundos que faltam. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000)), p2 = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}

/** Fim do balanço (ms) ou null. Atualiza a cada segundo enquanto ativo e desliga sozinho ao vencer. */
export function useBalanco(): number | null {
  const v = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ate, () => null);
  useEffect(() => { if (!carregado) { carregado = true; void carregaBalanco(); } }, []);
  useEffect(() => {
    if (v == null) return;
    const t = setTimeout(() => { ate = null; avisa(); }, Math.max(0, v - Date.now()));
    return () => clearTimeout(t);
  }, [v]);
  return v;
}

/** Tempo restante em ms, atualizado a cada segundo (0 quando desligado). */
export function useRestante(fim: number | null): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (fim == null) return;
    setAgora(Date.now());
    const iv = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [fim]);
  return fim == null ? 0 : Math.max(0, fim - agora);
}
