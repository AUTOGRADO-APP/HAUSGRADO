"use client";
// Mascote: doberman em pixel art (40×32), desenhado em canvas. Portado do protótipo (sprite()).
const MP: Record<string, string> = {K:'#151010',B:'#2a201d',b:'#45352f',T:'#b8652a',t:'#dd8e44',W:'#ffffff',E:'#f6f1ea',N:'#0b0808',P:'#e2667a',
  BL:'#2f5fa8',bl:'#4a7bc8',GR:'#7f878f',gr:'#c3c9ce',WD:'#6e4325',wd:'#94603a',SC:'#1d2730',OR:'#FF5C00',or:'#c94a00',Y:'#f2c230',R:'#d64545',G:'#2FAE60',PA:'#f7f3ea',LC:'#a9b892',GD:'#c9a15a',gd:'#a8803e'};

export const POSE: Record<string, string> = {gestao:'gestao',quadro:'mecanico',os:'mecanico',pasta:'papel',agenda:'agenda',clientes:'acena',orcamentos:'orcamento',orcpdf:'papel',guiapdf:'prancheta',historico:'lupa',comissoes:'grana',config:'obra',entrada:'prancheta',login:'acena',produtos:'oleo',servcat:'mecanico',fin_entradas:'grana',fin_saidas:'orcamento',fin_compra:'orcamento',fin_cal:'agenda',fin_desp:'orcamento',fin_forn:'acena'};
export const FALAS: Record<string, string[]> = {gestao:['Fechando as contas do mês. Não me distraia!','Ticket médio subindo? Au au!','Calculadora na pata, café na mesa.'],
  mecanico:['Bora tirar esses carros do pátio!','Chave 10 na mão, cadê o próximo?','Carro parado é carro triste. Au!'],
  agenda:['Amanhã tem cliente, já mandou o lembrete?','Agenda cheia, rabo abanando!'],
  acena:['Olá! Cliente bem atendido volta sempre.','Au! Pronto pra mais um dia?'],
  orcamento:['Peça, mão de obra, desconto... tudo certinho.','Orçamento claro, cliente feliz.'],
  papel:['Saindo do forno, digo, da impressora!','Papel na mão, cliente satisfeito.'],
  lupa:['Investigando o passado das O.S.…','Nenhuma O.S. escapa do meu faro.'],
  grana:['Comissão é bom e todo mundo gosta!','Au au! Dia de pagamento?'],
  obra:['Mexendo nas configurações. Cuidado aí!','Capacete na cabeça, segurança em primeiro lugar.'],
  prancheta:['Fotos de todos os lados, hein!','Checklist primeiro, chave depois.'],
  oleo:['5W30, 0W20… eu sei de cor!','Estoque organizado, oficina feliz. Au!']};

const cache: Record<string, string> = {};
export function sprite(pose: string, blink = false): string {
  const key = pose + (blink ? '_b' : ''); if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = 40; c.height = 32; const x = c.getContext('2d')!;
  const r = (X: number, Y: number, w: number, h: number, col: string) => { x.fillStyle = MP[col] || col; x.fillRect(X, Y, w, h); }, p = (X: number, Y: number, col: string) => r(X, Y, 1, 1, col);
  const blob = (X: number, Y: number, w: number, h: number, f: string) => { r(X+1,Y,w-2,h,'K'); r(X,Y+1,w,h-2,'K'); r(X+1,Y+1,w-2,h-2,f); };
  const ear = (X0: number, dir: number) => { const rows=[[1,1],[1,2],[0,3],[0,4],[0,4],[0,4],[0,5]]; rows.forEach(([o,w],y)=>{const xs=dir>0?X0+o:X0-o-w+1;r(xs-1,y,w+2,1,'K')}); rows.forEach(([o,w],y)=>{if(y===0)return;const xs=dir>0?X0+o:X0-o-w+1;r(xs,y,w,1,'B')}); [[2,1],[3,2],[4,2]].forEach(([y,w])=>{r(dir>0?X0+1:X0-w,y,w,1,'T')}); };
  const glasses = () => { [[13,7],[22,7]].forEach(([gx,gy])=>{r(gx,gy,5,1,'gr');r(gx,gy+4,5,1,'gr');r(gx,gy,1,5,'gr');r(gx+4,gy,1,5,'gr')}); r(18,8,4,1,'gr'); };
  const happy = ['acena','grana','mecanico','agenda'].includes(pose);
  if(pose==='comissoes'||pose==='grana'){blob(29,19,10,13,'GD');r(32,18,4,2,'WD');r(33,22,1,7,'G');r(32,23,3,1,'G');r(32,25,3,1,'G');r(32,27,3,1,'G');p(31,24,'G');p(35,26,'G');
    [[1,29],[1,26],[2,23]].forEach(([cx,cy])=>{blob(cx,cy,7,3,'Y');r(cx+2,cy+1,3,1,'gd')})}
  if(pose==='lupa'){blob(27,23,12,9,'wd');r(29,25,8,3,'PA');r(31,26,4,1,'GR')}
  ear(13,1);ear(26,-1);
  blob(14,17,12,15,'B');r(18,19,4,3,'T');r(19,22,2,2,'T');r(15,29,3,2,'T');r(22,29,3,2,'T');r(15,28,3,1,'K');r(22,28,3,1,'K');
  blob(12,5,16,14,'B');r(13,6,1,3,'b');
  r(13,12,2,2,'T');r(25,12,2,2,'T');
  r(16,12,8,6,'T');r(15,13,10,4,'T');r(16,18,8,1,'T');r(17,12,6,1,'t');
  r(17,11,6,3,'N');r(18,14,4,1,'N');p(18,11,'gr');p(19,11,'b');
  p(19,15,'K');p(20,15,'K');r(17,16,2,1,'K');r(21,16,2,1,'K');p(16,15,'K');p(23,15,'K');
  if(happy){r(19,16,2,2,'P');r(19,18,2,1,'#b84a5a')}
  if(blink){r(14,10,3,1,'K');r(23,10,3,1,'K')}else{r(14,8,3,3,'E');r(15,9,2,2,'N');p(15,9,'W');r(23,8,3,3,'E');r(23,9,2,2,'N');p(24,9,'W')}
  if(!['gestao','orcamento','obra'].includes(pose)){r(14,6,2,1,'T');r(24,6,2,1,'T')}
  if(pose==='mecanico'){r(15,22,10,9,'BL');r(17,20,6,3,'BL');r(15,18,1,5,'BL');r(24,18,1,5,'BL');r(19,24,3,2,'bl');p(17,21,'Y');p(22,21,'Y');r(15,28,3,1,'bl');r(22,28,3,1,'bl');
    r(16,3,8,3,'OR');r(15,4,1,2,'OR');r(24,4,1,2,'OR');r(17,3,6,1,'or');r(11,5,4,1,'OR');p(17,15,'K');p(14,14,'#000');
    r(27,13,4,3,'gr');x.clearRect(28,13,2,1);r(28,16,2,8,'GR');p(28,17,'gr');blob(25,21,4,4,'T')}
  if(pose==='gestao'){glasses();r(0,23,40,9,'WD');r(0,23,40,1,'wd');r(0,31,40,1,'K');
    blob(0,10,12,11,'SC');r(1,11,10,9,'SC');p(2,18,'OR');p(3,17,'OR');p(4,17,'OR');p(5,15,'OR');p(6,16,'OR');p(7,14,'OR');p(8,13,'OR');p(9,12,'OR');r(5,21,2,2,'GR');r(3,22,6,1,'GR');
    blob(29,16,9,8,'GR');r(30,17,7,2,'LC');[[30,20],[32,20],[34,20],[30,22],[32,22],[34,22]].forEach(([a,b2])=>r(a,b2,1,1,'gr'));r(36,20,1,3,'OR');
    blob(25,19,5,4,'T');blob(11,20,5,4,'T');r(12,26,3,3,'W');r(15,27,1,1,'W');p(13,25,'gr')}
  if(pose==='agenda'){blob(13,19,14,12,'PA');r(14,20,12,3,'R');p(16,19,'GR');p(23,19,'GR');[[15,24],[18,24],[21,24],[24,24],[15,27],[18,27],[21,27]].forEach(([a,b2])=>r(a,b2,2,2,'gr'));r(24,27,2,2,'OR');
    r(27,3,1,6,'Y');p(27,9,'K');p(27,2,'R')}
  if(pose==='acena'){r(17,18,2,2,'OR');r(21,18,2,2,'OR');r(19,18,2,2,'or');blob(27,9,4,9,'B');blob(26,6,6,4,'T');p(33,6,'gr');p(34,8,'gr');p(33,10,'gr')}
  if(pose==='orcamento'||pose==='papel'){if(pose==='orcamento')glasses();blob(12,19,16,13,'PA');r(14,21,9,1,'gr');r(14,23,11,1,'gr');r(14,25,7,1,'gr');r(14,27,10,1,'gr');r(19,29,7,1,'OR');
    blob(10,22,4,4,'T');blob(26,22,4,4,'T');if(pose==='orcamento'){r(29,18,1,7,'Y');p(29,25,'K')}}
  if(pose==='lupa'){for(let a=0;a<360;a+=12){const px=Math.round(24+4.2*Math.cos(a*Math.PI/180)),py=Math.round(9+4.2*Math.sin(a*Math.PI/180));p(px,py,'K')}
    x.fillStyle='rgba(150,200,255,.35)';x.beginPath();x.arc(24.5,9.5,3.6,0,7);x.fill();r(23,8,4,4,'E');r(23,9,3,3,'N');p(24,9,'W');
    [[27,13],[28,14],[29,15],[30,16],[31,17]].forEach(([a,b2])=>{r(a,b2,2,2,'WD')});blob(29,17,4,4,'T')}
  if(pose==='grana'){blob(26,20,4,4,'T');r(14,8,3,3,'Y');p(15,9,'W');r(23,8,3,3,'Y');p(24,9,'W')}
  if(pose==='obra'){r(14,2,12,4,'Y');r(12,5,16,2,'Y');r(16,2,8,1,'#f7d867');r(19,1,2,2,'Y');glasses();
    r(29,13,2,5,'R');r(29,18,1,7,'gr');blob(27,20,4,4,'T')}
  if(pose==='oleo'){blob(25,14,9,16,'Y');r(27,11,4,4,'K');r(28,10,2,2,'R');r(26,18,7,6,'PA');r(27,20,5,1,'OR');r(27,22,3,1,'gr');blob(23,22,5,4,'T');blob(12,22,5,4,'T');
    blob(2,24,8,8,'GR');r(3,25,6,6,'gr');r(4,27,4,1,'GR')}
  if(pose==='prancheta'){blob(13,19,13,13,'wd');r(15,21,9,10,'PA');r(17,18,5,3,'GR');[[16,23],[16,26],[16,29]].forEach(([a,b2])=>{p(a,b2+1,'G');p(a+1,b2+2,'G');p(a+2,b2+1,'G');p(a+3,b2,'G');r(a+5,b2+1,4,1,'gr')});
    r(15,17,10,1,'K');blob(9,22,5,4,'T')}
  return cache[key] = c.toDataURL();
}

/** Pose do mascote conforme a rota. */
export function poseFor(path: string): string {
  const m: [RegExp, string][] = [[/^\/gestao/, 'gestao'], [/^\/os\/nova/, 'entrada'], [/^\/os\/[^/]+\/pasta/, 'pasta'], [/^\/os\//, 'os'], [/^\/quadro/, 'quadro'],
    [/^\/calendario/, 'agenda'], [/^\/clientes/, 'clientes'], [/^\/orcamentos\/[^/]+\/guia/, 'guiapdf'], [/^\/orcamentos\/[^/]+\/pdf/, 'orcpdf'], [/^\/orcamentos/, 'orcamentos'],
    [/^\/historico/, 'historico'], [/^\/financeiro\/comissoes/, 'comissoes'], [/^\/financeiro\/entradas/, 'fin_entradas'], [/^\/financeiro\/compras/, 'fin_saidas'],
    [/^\/financeiro\/despesas/, 'fin_desp'], [/^\/financeiro\/fornecedores/, 'fin_forn'], [/^\/financeiro\/calendario/, 'fin_cal'], [/^\/config/, 'config'],
    [/^\/produtos/, 'produtos'], [/^\/servicos/, 'servcat'], [/^\/login/, 'login']];
  const v = m.find(([re]) => re.test(path))?.[1] ?? 'login';
  return POSE[v] || 'acena';
}
