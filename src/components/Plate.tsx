/** Placa no estilo Mercosul (faixa BRASIL). */
export function Plate({ p, lg }: { p: string | null | undefined; lg?: boolean }) {
  return <span className={`plate${lg ? " lg" : ""}`}><i>BRASIL</i><b>{p || "—"}</b></span>;
}
