# Identidade Visual Autogrado — Guia para o Claude

**Instrução para o Claude:** ao construir qualquer interface (HTML/CSS/JS ou outro stack) para a Autogrado, siga rigorosamente este guia. Os valores são obrigatórios, não sugestões. Use HTML5, CSS3 e JavaScript vanilla, sem frameworks, em arquivo único, salvo instrução contrária.

## 1. Conceito
Minimalista, estilo Apple, aplicado a uma ferramenta de oficina. Fundos neutros e quentes, cantos muito arredondados, bastante respiro. **Laranja é o único acento de marca.** Verde e vermelho são apenas cores de estado (sucesso/erro), nunca decoração.

## 2. Tokens (copiar como estão)

```css
:root{
  --bg:#ebe8e8; --text:#403D3C; --card:#F7F6F5;
  --accent:#FF5C00; --accent-ink:#ffffff;
  --border:rgba(64,61,60,.10); --border-strong:rgba(64,61,60,.18);
  --muted:rgba(64,61,60,.55);
  --success:#2FAE60; --danger:#D64545; --input-bg:#ffffff;
  --shadow:0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05);
  --r-card:2rem; --r-control:1rem;
  --font-ui:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --font-num:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
html[data-theme="dark"]{
  --bg:#2A3036; --text:#D3DADE; --card:#1E2328;
  --border:rgba(211,218,222,.09); --border-strong:rgba(211,218,222,.16);
  --muted:rgba(211,218,222,.55);
  --danger:#E06767; --input-bg:#262c32;
  --shadow:0 1px 2px rgba(0,0,0,.25), 0 10px 30px rgba(0,0,0,.35);
}
```

Tema claro é o padrão; o escuro é ativado com `data-theme="dark"` no `<html>`. Oferecer seletor de tema e persistir a escolha em `localStorage` dentro de `try/catch`.

## 3. Regras de cor (obrigatórias)
- Fundo da página = `--bg`; cartões/containers = `--card`; texto e labels = `--text`.
- Laranja `#FF5C00` (igual nos dois temas) é usado em: pílula da marca, botões primários, numeração de seções, relógio, valores calculados em destaque, borda e anel de foco dos inputs.
- **Contraste do verde:** todo container/painel/badge verde (sucesso, lucro positivo) usa como cor de texto o **fundo da página do tema ativo** → `color: var(--bg)` (`#ebe8e8` no claro, `#2A3036` no escuro).
- Container vermelho (erro, lucro negativo): fundo `--danger`, texto branco.
- Estado neutro/zero: fundo `--bg`, borda `--border-strong`.

## 4. Tipografia
- **Plus Jakarta Sans** → interface, labels, botões, textos. Carregar via Google Fonts com fallback completo (o app deve funcionar offline com as fontes do sistema).
- **JetBrains Mono** → números, valores em R$, percentuais, placas, relógio.
- Tamanhos: **12pt** texto geral/labels/inputs/selects/tabelas; **16pt** títulos de seção e cabeçalho; **22pt** valor de destaque máximo (ex.: lucro); 8,5–9,5pt microlabels, dicas e rodapé.
- Pesos: 800 títulos · 700 botões e valores · 600 labels · 500 subtítulos.
- Microlabel de coluna: caixa alta, 8,5pt, `letter-spacing:.05em`, cor `--muted`.
- Rodapé de assinatura: caixa alta, 9,5pt, `letter-spacing:.14em`, centralizado, `--muted`.

## 5. Formas e profundidade

| Elemento | `border-radius` |
|---|---|
| Cartões e containers | `2rem` |
| Painel de destaque (ex.: lucro) | `1.4rem` |
| Linhas de itens dentro de cartão | `1.2rem` |
| Inputs, selects, botões | `1rem` |
| Botão de excluir | `.8rem` |
| Badge numérico | `.6rem` |

- Cartão: `background:var(--card)`, `border:1px solid var(--border)`, `box-shadow:var(--shadow)`, padding ~24px, espaçamento entre cartões 22px.
- Linhas de itens dentro do cartão usam `background:var(--bg)` (profundidade sem sombra) e `border:1px solid var(--border)`; no hover, borda `--border-strong`.

## 6. Componentes

- **Pílula da marca:** barra vertical laranja, 10px de largura, altura mínima 64px, `border-radius:1rem`, `box-shadow:0 4px 14px rgba(255,92,0,.35)`, ao lado do título do app.
- **Badge de seção:** quadrado 26×26px, fundo laranja, número em mono branco 10,5pt, antes do título de cada card.
- **Botão primário:** fundo `--accent`, texto branco, peso 700, `padding:10px 18px`. `:active` → `transform:scale(.97)`. Hover → `opacity:.92`.
- **Botão secundário (ghost):** transparente, `border:1px solid var(--border-strong)`; hover → borda e texto laranja.
- **Botão de excluir:** 34×34px, ícone "×" em `--danger`; hover → fundo `--danger` e texto branco.
- **Input/select:** `width:100%`, fundo `--input-bg`, `border:1px solid var(--border-strong)`, `padding:10px 13px`. Foco: `border-color:var(--accent)` + `box-shadow:0 0 0 3px rgba(255,92,0,.15)`. Inputs numéricos em `--font-num`.
- **Select:** `appearance:none` com seta SVG embutida (stroke `#403D3C` no claro, `#D3DADE` no escuro), `padding-right:32px`.
- **Campo corrigido/inválido:** borda `--danger` + anel `0 0 0 3px rgba(214,69,69,.15)`.
- **Dica de campo:** 9,5pt, `--muted`, peso 600; em limite atingido, `--danger`.
- **Relógio:** cartão pequeno; hora em mono, laranja, 16pt, 700; data por extenso (pt-BR, capitalizada) em 9,5pt `--muted`.
- **Seletor de tema:** pílula (cartão) com dois botões; o ativo tem fundo laranja e texto branco, o inativo `opacity:.55`.
- **Badge de contagem:** pílula `min-width:22px`, altura 22px, fundo `--border-strong`, texto `--muted`, mono 9,5pt.
- **Estado vazio:** borda tracejada `--border-strong`, texto `--muted`, centralizado.
- **Toast:** fixo, centralizado embaixo, invertido (`background:var(--text)`, `color:var(--bg)`), `border-radius:1rem`, aparece com fade e sobe 20px, some após ~3,5s.

## 7. Layout
- Container: `max-width:1400px`, centralizado, padding 28px.
- **Cabeçalho:** à esquerda pílula da marca + título (16pt/800) + subtítulo (12pt/`--muted`); à direita seletor de tema + relógio.
- **Duas colunas assimétricas:** `grid-template-columns:minmax(0,1fr) minmax(300px,34%)`, gap 22px. Conteúdo à esquerda; resumo/ações à direita, com `position:sticky; top:22px`.
- Abaixo de **920px** empilha em uma coluna; abaixo de **640–760px** os grids de campos viram 1–2 colunas.
- Linhas dinâmicas usam CSS grid, com microlabels acima de cada campo.

## 8. Movimento
Somente transições curtas: 0,15s (foco/hover), 0,12s (pressionar), 0,35s (troca de tema), 0,25s (toast). Nenhuma animação decorativa.

## 9. Impressão (`@media print`, A4)
- `@page{size:A4; margin:10mm 12mm}`; fundo branco, texto preto, **sem cor**, sem sombras, sem raios, sem botões/relógio/cabeçalho de sistema/rodapé de assinatura.
- Layout compacto: fonte base 8,5pt, `line-height:1.25`, cartões sem borda lateral (apenas linha inferior preta), itens em formato de tabela com cabeçalho de colunas impresso uma vez (7pt, 800, caixa alta, linha inferior 1,4px preta) e divisórias `#e3e3e3`.
- Inputs viram texto limpo (sem borda/fundo); mostrar o valor formatado em um elemento `print-only`.
- Cabeçalho do documento: título (13pt) + subtítulo com data/hora e dados principais + etiqueta da via (caixa com borda preta, mono 8pt).
- Painel de destaque verde/vermelho vira caixa branca com borda preta de 1,5px.
- Para múltiplas vias, usar `data-print-mode="client|internal"` no `<html>` (definido por JS antes de `window.print()` e removido em `afterprint`) e ocultar dados internos com uma classe `.internal-only`.

## 10. Convenções de interface
- Idioma: português do Brasil. Moeda com `toLocaleString('pt-BR',{style:'currency',currency:'BRL'})`.
- Campos de placa: forçar maiúsculas, mono.
- Cálculos em tempo real a cada alteração de campo; evitar sobrescrever o campo que o usuário está editando (`document.activeElement`).
- Exportar/importar dados em JSON, com validação e confirmação antes de substituir dados existentes.
- Rodapé (apenas em tela): "Aplicativo desenvolvido por Vinícius de Albuquerque para uso exclusivo da Autogrado." centralizado, com espaçamento largo.
- Evitar `<form>` quando não necessário; usar `onClick`/`addEventListener`. Não depender de CDN para funcionar.
