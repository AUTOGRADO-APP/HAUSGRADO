"use client";
// Compressão leve de vídeo no navegador, antes do envio (WebCodecs via mediabunny).
// Regra (videoTarget): no máximo 1080p e ~6 Mbps em 1080p (proporcional em resoluções menores); áudio copiado.
// Se o aparelho não suportar, demorar a abrir, ou o resultado não ficar ao menos 15% menor, sobe o original.

/** Lado maior da saída e bitrate de referência em 1080p. */
export const VIDEO_MAX_SIDE = 1920;
export const VIDEO_BPS_1080 = 6_000_000;

/** Tamanho e bitrate de saída para um vídeo de w×h (já com rotação aplicada). */
export function videoTarget(w: number, h: number) {
  const s = Math.min(1, VIDEO_MAX_SIDE / Math.max(w, h));
  const ow = Math.round(w * s / 2) * 2, oh = Math.round(h * s / 2) * 2;
  const bps = Math.max(1_500_000, Math.round(VIDEO_BPS_1080 * (ow * oh) / (1920 * 1080)));
  return { width: ow, height: oh, bitrate: bps, resize: s < 1 };
}

/** Comprime o vídeo; devolve o original quando não compensa ou não é possível. */
export async function compressVideo(file: File, onProgress?: (p: number) => void): Promise<Blob> {
  if (!file.type.startsWith("video/") || typeof window === "undefined" || !("VideoEncoder" in window)) return file;
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return file;
    const dur = await input.computeDuration();
    const t = videoTarget(track.displayWidth, track.displayHeight);
    // já está leve (bitrate médio abaixo do alvo + 30%): não mexe
    if (!t.resize && dur > 0 && (file.size * 8) / dur < t.bitrate * 1.3) return file;
    if (!(await mb.canEncodeVideo("avc", { width: t.width, height: t.height, bitrate: t.bitrate }))) return file;
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conv = await mb.Conversion.init({
      input, output,
      video: { codec: "avc", bitrate: t.bitrate, ...(t.resize ? (t.width >= t.height ? { width: t.width } : { height: t.height }) : {}), forceTranscode: true },
    });
    if (!conv.isValid) return file;
    if (onProgress) conv.onProgress = p => onProgress(p);
    await conv.execute();
    const buf = output.target.buffer;
    if (!buf || buf.byteLength > file.size * 0.85) return file;
    return new Blob([buf], { type: "video/mp4" });
  } catch (e) {
    console.warn("Compressão de vídeo falhou; enviando o original.", e);
    return file;
  }
}
