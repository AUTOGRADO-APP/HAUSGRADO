"use client";
// Envio de fotos/vídeos para o Storage (bucket privado os-media) + registro na O.S.
import type { SupabaseClient } from "@supabase/supabase-js";
import { compressImage } from "./ui.ts";
import { compressVideo } from "./video.ts";

export const BUCKET = "os-media";
const MAX_VIDEO = 50 * 1024 * 1024;        // limite do bucket, depois da compressão
const MAX_VIDEO_IN = 500 * 1024 * 1024;    // arquivo bruto aceito para comprimir

function extOf(file: File, blob: Blob) {
  if (blob.type === "image/jpeg") return "jpg";
  if (blob !== file && blob.type === "video/mp4") return "mp4";
  const m = /\.([a-z0-9]+)$/i.exec(file.name); return (m?.[1] || blob.type.split("/")[1] || "bin").toLowerCase();
}

/** Sobe um arquivo e devolve o caminho no Storage: {shop}/{os}/{pasta}/{uuid}.ext */
export async function uploadFile(sb: SupabaseClient, shopId: string, osId: string, folder: string, file: File, onProgress?: (p: number) => void) {
  const video = file.type.startsWith("video/");
  if (video && file.size > MAX_VIDEO_IN) throw new Error("Vídeo muito grande. Grave um trecho menor.");
  const blob = video ? await compressVideo(file, onProgress) : await compressImage(file);
  if (video && blob.size > MAX_VIDEO) throw new Error("Vídeo maior que 50 MB mesmo depois de comprimido. Grave um trecho menor.");
  const path = `${shopId}/${osId}/${folder}/${crypto.randomUUID()}.${extOf(file, blob)}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (error) throw error;
  return { path, mime: blob.type || file.type };
}

/** Registro de mídia numa aba da O.S. (avarias, pecas, servicos). */
export async function addMediaRecord(sb: SupabaseClient, shopId: string, osId: string, tab: string, file: File, description = "", onProgress?: (p: number) => void) {
  const { path, mime } = await uploadFile(sb, shopId, osId, tab, file, onProgress);
  const { error } = await sb.from("service_order_records").insert({ service_order_id: osId, tab, storage_path: path, mime, file_name: file.name, description });
  if (error) { await sb.storage.from(BUCKET).remove([path]); throw error; }
}

/** URLs assinadas (1 h) para vários caminhos. */
export async function signedUrls(sb: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const ps = paths.filter(Boolean); if (!ps.length) return {};
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(ps, 3600);
  return Object.fromEntries((data ?? []).filter(x => x.signedUrl).map(x => [x.path!, x.signedUrl as string]));
}
