// CSS dos documentos A4 (PDF do orçamento e guia de serviço): preto e branco, texto selecionável.
// Tudo escopado por .doc-a4; o rodapé de página ("Página X de Y") sai pelas margens do @page.
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function docCss(footer: string) {
  return `
@page{size:A4;margin:10mm 12mm 14mm;
  @bottom-left{content:"${q(footer)}";font:7pt 'JetBrains Mono',ui-monospace,monospace;color:#555;vertical-align:top;padding-top:3mm;border-top:.2mm solid #bbb}
  @bottom-right{content:"Página " counter(page) " de " counter(pages);font:7pt 'JetBrains Mono',ui-monospace,monospace;color:#555;vertical-align:top;padding-top:3mm;border-top:.2mm solid #bbb}}
.doc-a4{--g1:#f2f2f2;--g2:#e0e0e0;--g3:#8a8a8a;background:#fff;color:#000;width:210mm;max-width:100%;margin:0 auto;padding:10mm 12mm;
  box-shadow:var(--shadow);border-radius:4px;font-family:var(--font-ui);font-size:9pt;line-height:1.3;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-x:auto}
.doc-a4 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc-a4 .mono{font-family:var(--font-num)}
.doc-a4 .gray{color:var(--g3)}
.doc-a4 .lbl{font-size:6.5pt;font-weight:800;color:var(--g3);letter-spacing:.06em;text-transform:uppercase}
.doc-a4 .bar{display:block;width:5mm;background:#000;border-radius:2mm;flex:none}
.doc-a4 .head{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}
.doc-a4 .brand{display:flex;gap:4mm;align-items:stretch;min-width:0}
.doc-a4 .blk{background:#000;color:#fff;border-radius:3mm;text-align:center;display:flex;flex-direction:column;justify-content:center}
.doc-a4 .rule{border:0;border-top:1.4px solid #000;margin:3mm 0 6mm}
.doc-a4 .plate-d{display:inline-flex;flex-direction:column;border:.5mm solid #000;border-radius:1.6mm;overflow:hidden;background:#fff;text-align:center;flex:none}
.doc-a4 .plate-d i{background:#000;color:#fff;font-style:normal;font-weight:800;font-size:5pt;letter-spacing:.2em;padding:.5mm 0}
.doc-a4 .plate-d b{font-family:var(--font-num);font-weight:700;padding:.8mm 3mm 1mm;letter-spacing:.04em}
.doc-a4 table{width:100%;border-collapse:separate;border-spacing:0}
.doc-a4 thead th{background:#000;color:#fff;font-size:6.8pt;font-weight:800;letter-spacing:.06em;text-align:left;padding:1.6mm 4mm}
.doc-a4 thead th:first-child{border-radius:1.6mm 0 0 1.6mm}.doc-a4 thead th:last-child{border-radius:0 1.6mm 1.6mm 0}
.doc-a4 th.r,.doc-a4 td.r{text-align:right}
.doc-a4 tbody td{padding:1.6mm 4mm;vertical-align:middle}
.doc-a4 tbody tr{break-inside:avoid}
.doc-a4 tr.z td{background:var(--g1)}
.doc-a4 tr.z td:first-child{border-radius:1.4mm 0 0 1.4mm}.doc-a4 tr.z td:last-child{border-radius:0 1.4mm 1.4mm 0}
.doc-a4 tr.grp td{padding:4mm 1mm 1mm;border-bottom:.25mm solid var(--g2);font-size:7.5pt;font-weight:800;letter-spacing:.05em}
.doc-a4 .det{font-size:7.8pt;color:#666;margin-top:.4mm}
.doc-a4 .box{display:inline-block;width:3.4mm;height:3.4mm;border:.3mm solid #000;border-radius:.6mm;background:#fff;vertical-align:-.5mm;flex:none;position:relative}
.doc-a4 .box.on::after{content:"";position:absolute;left:.9mm;top:.1mm;width:1mm;height:2mm;border:solid #000;border-width:0 .45mm .45mm 0;transform:rotate(45deg)}
.doc-a4 .fill{display:inline-block;border-bottom:.2mm solid #555;height:3.6mm;vertical-align:baseline}
.doc-a4 .avoid{break-inside:avoid}
.doc-a4 .sign{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:14mm;break-inside:avoid}
.doc-a4 .sign div{border-top:.35mm solid #000;padding-top:1.4mm;font-size:8pt;font-weight:700}
.doc-a4 .sign small{display:block;font-weight:400;font-size:7.5pt;color:var(--g3);margin-top:.6mm}
.doc-a4 .scr-foot{display:flex;justify-content:space-between;gap:4mm;margin-top:10mm;padding-top:1.5mm;border-top:.2mm solid #bbb;font-family:var(--font-num);font-size:7pt;color:#555}
@media (max-width:640px){.doc-a4{padding:6mm}}
@media print{
  body:has(.doc-a4){padding:0!important;background:#fff!important}
  body:has(.doc-a4) .wrap{padding:0!important;max-width:none!important}
  body:has(.doc-a4) .casing,body:has(.doc-a4) main{gap:0!important;display:block!important}
  .doc-a4{width:auto;padding:0;box-shadow:none;border-radius:0;overflow:visible}
  .doc-a4 .scr-foot{display:none}
}`;
}
