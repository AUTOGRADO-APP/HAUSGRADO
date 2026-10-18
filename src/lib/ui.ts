"use client";
// Utilidades de navegador: toast, sons (Web Audio), tema e compactação de imagem. Portado do protótipo.

export interface ToastOpts { err?: boolean; undo?: () => void; sound?: SfxKey }
const ERR_RE = /^(Informe|Selecione|Preencha|Escolha|Digite|Celular|Não foi|Placa inválida|Esse nome|Aguarde|Usuário ou senha|Acesso restrito|Senha|Erro)/;

export function toast(msg: string, opt: ToastOpts = {}) {
  const err = opt.err ?? ERR_RE.test(msg);
  window.dispatchEvent(new CustomEvent("hg-toast", { detail: { msg, err, undo: opt.undo } }));
  if (err) sfx("err"); else if (opt.sound) sfx(opt.sound);
}

export type SfxKey = "tap" | "move" | "ok" | "err" | "cam" | "bell" | "login" | "au" | "out";
let AC: AudioContext | null = null;
export const somOn = () => { try { return localStorage.getItem("autogrado-som") !== "off"; } catch { return true; } };
export const setSom = (on: boolean) => { try { localStorage.setItem("autogrado-som", on ? "on" : "off"); } catch { /* sem storage */ } };

export function sfx(k: SfxKey) {
  if (typeof window === "undefined" || !somOn()) return;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    AC = AC || new Ctor();
    if (AC.state === "suspended") void AC.resume();
    const ac = AC, T = ac.currentTime;
    const tone = (f: number, d: number, t0 = 0, type: OscillatorType = "sine", v = .06, f2?: number) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, T + t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, T + t0 + d);
      g.gain.setValueAtTime(0, T + t0); g.gain.linearRampToValueAtTime(v, T + t0 + .008); g.gain.exponentialRampToValueAtTime(.0001, T + t0 + d);
      o.connect(g).connect(ac.destination); o.start(T + t0); o.stop(T + t0 + d + .02);
    };
    ({
      tap: () => tone(1400, .04, 0, "sine", .03),
      move: () => { tone(520, .07, 0, "triangle", .07); tone(780, .09, .06, "triangle", .06); },
      ok: () => { tone(660, .09, 0, "sine", .07); tone(990, .14, .08, "sine", .06); },
      err: () => { tone(220, .12, 0, "square", .035); tone(180, .16, .1, "square", .03); },
      cam: () => { tone(2400, .03, 0, "square", .03); tone(1200, .05, .04, "square", .025); },
      bell: () => { tone(1320, .25, 0, "sine", .05); tone(1760, .3, .05, "sine", .035); },
      login: () => { tone(523, .1, 0, "sine", .06); tone(659, .1, .09, "sine", .06); tone(784, .18, .18, "sine", .06); },
      au: () => { tone(520, .07, 0, "square", .035, 300); tone(560, .09, .11, "square", .035, 320); },
      out: () => { tone(660, .1, 0, "sine", .05); tone(440, .16, .08, "sine", .05); },
    } as Record<SfxKey, () => void>)[k]?.();
  } catch { /* sem áudio */ }
}

export type Tema = "light" | "dark" | "haus";
export const TEMAS: readonly { id: Tema; nome: string }[] = [{ id: "light", nome: "Claro" }, { id: "dark", nome: "Escuro" }, { id: "haus", nome: "Haus" }];
export const getTheme = (): Tema => {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || t === "haus" ? t : "light";
};
export function setTheme(t: Tema) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("autogrado-tema", t); } catch { /* sem storage */ }
}

/** Compacta imagem no navegador (lado maior 1600px, JPEG 0.82). Vídeos passam direto. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob(b => res(b || file), "image/jpeg", 0.82));
  } catch { return file; }
}

export async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); toast("Copiado"); } catch { toast("Não foi possível copiar", { err: true }); }
}

/** Texto de erro do Supabase em pt-BR, sem o prefixo técnico. */
export const errMsg = (e: { message?: string } | null | undefined) => (e?.message || "Não foi possível salvar").replace(/^.*?ERROR:\s*/, "");
