# CLAUDE.md — Hausgrado

> Arquivo de contexto do projeto. Leia inteiro antes de escrever código.
> Ele descreve **o que** construir (produto, regras de negócio, telas, dados e identidade visual) e **como** a versão final deve ser organizada.
> O protótipo funcional em HTML está em `docs/prototipo/hausgrado-prototipo.html`. Ele é a **referência visual e de comportamento**: abra no navegador, entre com `master / master123` e navegue antes de implementar cada tela. O código do protótipo **não** deve ser copiado como arquitetura: ele é um arquivo único, guarda tudo no navegador e simula o login.

---

## 0. Estado atual do repositório (kit inicial da versão beta — LEIA PRIMEIRO)

Este repositório já começa com uma base pronta. **O banco em `supabase/migrations/` é a fonte da verdade** — onde a seção 6 deste arquivo divergir dele, vale o SQL.

**Já feito e testado (fora do Supabase real):**
- `supabase/migrations/…01_schema.sql` — todas as tabelas (inglês, snake_case), com `shop_id` em tudo.
- `…02_logic.sql` — regras no banco: numeração de O.S./orçamento, histórico automático, **O.S. só finaliza por `register_receipt()`** (confere pagamento, senha de desconto, grava taxas como despesa) e só volta por `undo_receipt()`; desconto de orçamento só por `apply_quote_discount()`; senha de desconto com bcrypt (`set_discount_password`, só master); compras → despesa "Compra de mercadorias" sincronizada; comissão paga → despesa "Comissão"; portal do cliente (`portal_get`/`portal_decide_quote`, limite de 5 erros em 15 min, só service_role).
- `…03_rls.sql` — RLS em todas as tabelas: cada usuário só vê a própria oficina; financeiro só master/admin; configurações só master; anon não executa funções.
- `…04_storage.sql` — bucket privado `os-media`, caminho `{shop_id}/{service_order_id}/{arquivo}`.
- `…05_views.sql` — `v_board` (quadro).
- `supabase/seed.sql` — oficina Autogrado (id fixo `00000000-0000-4000-8000-000000000001`), mecânicos, catálogo de serviços, produtos, fornecedores, 3 clientes e 3 O.S. Senha de desconto da demo: `1234`.
- `supabase/tests/regras_test.sql` — 23 verificações (T1–T23) de RLS e regras; **todas passaram num Postgres 16 puro com stubs de auth/storage**. Rode no Supabase local para confirmar.
- `…20261015000000_stock.sql` — **estoque** dos produtos cadastrados: `products.stock_qty` só muda por `stock_movements` (trigger). Entra quando a compra é **recebida** (só itens com `product_id`; item avulso não soma nem cadastra produto) e o custo vira o último custo pago; sai quando a O.S. é finalizada (peças cadastradas do orçamento; garantia também) e volta no `undo_receipt()`; ajuste manual por `adjust_stock()`; `product_stock_extra()` dá reservado (orçamentos aprovados no pátio) e a caminho. Estoque negativo é permitido (a tela avisa). `estoque.ts` tem a leitura da tela; testes T25–T34.
- `…20261015120000_review_fixes.sql` — **um orçamento ativo por O.S.** (`os_quote()`: o aprovado, senão o mais recente não recusado; total, comissão e baixa de estoque usam o mesmo); orçamento **aprovado fica travado** (volta para Rascunho para editar) e, com a O.S. finalizada, travado de vez; desconto nunca maior que os itens; aplicar desconto/fechar com valor menor exige ter conferido a senha (`verify_discount_password`, 5 erros em 15 min) nos últimos 15 min; O.S. finalizada não pode ser excluída; `undo_receipt` só em O.S. finalizada; `register_receipt` recusa valores negativos. Testes T35–T38.
- `…20261019120000_ncm_balanco.sql` — **NCM** nos produtos (8 dígitos, exibido 0000.00.00) e **modo Balanço**: o ajuste manual de estoque (`adjust_stock`) só funciona com o balanço ativo, ligado em Produtos com a senha de desconto (`start_stock_count`, mesmo limite de tentativas) e válido por 3 horas para o usuário que ativou (`…20261027120000_balanco_3h.sql`) (`stock_count_until`, `end_stock_count`). Compras e O.S. continuam mexendo no estoque. Testes T42–T44.
- `…20261019200000_servicos_executar.sql` — **Serviços a executar** na O.S.: `os_tasks()` devolve os itens do orçamento ativo **sem preços** para todos os perfis (o mecânico não lê `quotes`), e `set_task_done()` marca/desmarca um item como feito (só com orçamento aprovado e O.S. não finalizada), gravando em `quote_item_done` e no histórico ("Feito: …"). Testes T69–T71.
- `…20261020200000_cliente_mecanico.sql` — **mecânico não lê o contato do cliente**: `customers` só para o escritório (master/admin/atendente); todos os perfis leem o nome por `customer_names` (id, nome) e `v_board` usa essa visão. Nas telas que o mecânico abre, use `loadCustomers()` (`src/lib/customers.ts`), nunca `customers(...)` embutido. Na O.S., o mecânico não vê telefone, WhatsApp, Acesso do cliente nem a situação/valor do orçamento (continua com Serviços a executar, sem preços). Testes T72–T73.
- `…20261020220000_fotos_estepe_oleo.sql` — fotos de entrada ganham `estepe` (Nova O.S.) e `oleo` (nível do óleo, pedido na O.S. de Serviço/Garantia por um balão; sai com as fotos de entrada na pasta). A Nova O.S. não tem mais itens conferidos: pergunta só o **segredo de roda** (SIM/NÃO; SIM pede a localização e exige marcar CHAVE SEGREDO IDENTIFICADA), gravado em `service_orders.checklist` (`segredo_roda`, `segredo_local`, `chave_segredo_ok`). A pasta do cliente encaixa Avarias, Peças e Serviço em sequência, sem pular folha (`pasta/PastaDoc.tsx` mede os blocos).
- `src/lib/rules.ts` + `permissions.ts` com testes (`npm test`, 10 testes passando). Os números dos testes batem com os do SQL.

**Escrito mas NÃO executado** (o ambiente onde foi gerado não tinha acesso ao npm): todo o app Next.js (`src/app`, `src/components`, `middleware.ts`), as Edge Functions (`supabase/functions/portal`, `plate-lookup`) e `scripts/create-demo-users.mjs`. Primeira tarefa: `npm install && npm run typecheck && npm run build`, corrigir o que aparecer, e rodar o fluxo login → quadro → mover cartão → finalizar com pagamento.

**Telas:** Login, Quadro (arrastar, alerta de parado, popup de pagamento) e portal do cliente (`/c/{token}`) estão implementados. As demais são páginas "Em construção" (`src/components/EmBreve.tsx`) — portar uma a uma seguindo a seção 13 e o protótipo.

**Convenções do kit:**
- Login por usuário: o app transforma `master` em `master@NEXT_PUBLIC_AUTH_EMAIL_DOMAIN` (Supabase Auth exige e-mail). Cadastro público de contas deve ficar **desligado** no Supabase.
- Toda regra que envolve dinheiro ou permissão fica no banco; a tela só pré-visualiza (`rules.ts`). Se mudar uma, mude a outra e os dois testes.
- `SUPABASE_SERVICE_ROLE_KEY` só em código de servidor (`src/lib/supabase/admin.ts`, Edge Functions, scripts). Nunca em componente `"use client"`.
- Imports locais com extensão `.ts`/`.tsx` (permite rodar os testes com `node --experimental-strip-types`).
- Nova migration = novo arquivo com timestamp maior; nunca editar uma migration já aplicada em produção. Toda tabela nova precisa de `enable row level security` + policies na mesma migration.
- Passo a passo de publicação: `SETUP-BETA.md`.

---

## 1. Visão geral

**Hausgrado** é uma plataforma web (SaaS de uso interno) para gestão do pátio de uma oficina mecânica. Para a versão final, o cliente piloto é a oficina **Autogrado**.

- Nome da plataforma: **HAUSGRADO**. Subtítulo: "Gestão de pátio".
- Nome da oficina (configurável): **Autogrado**. Ele aparece nas mensagens de WhatsApp, nos PDFs e no rodapé.
- Rodapé fixo (só na tela, não sai na impressão): `Aplicativo desenvolvido por Vinícius de Albuquerque para uso exclusivo da Autogrado.`
- Idioma da interface: **português do Brasil**. Moeda BRL. Fuso `America/Sao_Paulo`.
- A plataforma é **um site**: não haverá app instalável nem executável. Precisa funcionar bem no computador do balcão e no celular dos mecânicos, que usam câmera e ditado.

### Público
| Quem | Uso |
|---|---|
| Dono / gestor (perfil **Master**) | Tudo, inclusive configurações, usuários e números financeiros |
| Gerente / administrativo (**Administrador**) | Operação completa e números, sem Configurações |
| Atendente / recepção (**Atendente**) | Entrada de carros, quadro, agenda, clientes, orçamentos e produtos; sem Gestão, Comissões e Configurações |
| Mecânicos | Hoje entram como Atendente ou Administrador. Os profissionais responsáveis pelas O.S. ficam numa lista ("equipe") separada dos usuários |
| Cliente final | Acessa **só** o portal público da sua O.S., pelo link enviado no WhatsApp. A senha é o celular dele |

---

## 2. Stack da versão final (decisão sugerida — confirmar com o Vinícius antes de começar)

O guia de identidade (ver `docs/identidade-visual-autogrado.md`) pede HTML/CSS/JS vanilla em arquivo único "salvo instrução contrária". **A instrução contrária é esta:** a versão final é uma aplicação web com backend. A stack recomendada é:

- **Frontend:** Next.js (App Router) + TypeScript + React.
- **Estilo:** CSS Modules ou CSS global usando **exatamente os tokens CSS** da seção 4. Nada de biblioteca de componentes com visual próprio (MUI, Chakra etc.). Tailwind só é aceitável se for configurado para usar os mesmos tokens.
- **Backend / dados:** Supabase:
  - Postgres;
  - Auth (e-mail/usuário + senha);
  - Storage para fotos e vídeos;
  - Realtime para o quadro, o sino e o portal do cliente;
  - Edge Functions para a API de placas, a autenticação do portal do cliente e os jobs.
- **Hospedagem:** Vercel (front) + Supabase (dados).
- **PDFs:** gerados no servidor (route handler) com `@react-pdf/renderer` ou `pdf-lib`. Alternativa: página de impressão com `@media print` e `window.print()`. No protótipo, os PDFs são desenhados em canvas; a versão final deve gerar **PDF com texto selecionável**.
- **Validação:** `zod` nas entradas de formulário e nas rotas.
- **Datas:** `date-fns` com locale `pt-BR`.
- **Testes:** Vitest para as regras de negócio (cálculos da seção 9) e Playwright para os fluxos principais (login por perfil, abrir O.S., mover card, gerar PDF).

Convenções de código: código, nomes de tabelas e colunas em **inglês** (snake_case no banco, camelCase no TS); textos de interface em **pt-BR**. Mantenha os textos da UI num lugar só (ex.: `src/i18n/pt-BR.ts`) para facilitar a revisão.

---

## 3. Perfis e permissões

| Recurso / página | Master | Administrador | Atendente | Mecânico |
|---|:-:|:-:|:-:|:-:|
| Gestão | ✅ | ✅ | ❌ | ❌ |
| Financeiro: Entradas, Compras, Fornecedores | ✅ | ✅ | ✅ | ❌ |
| Financeiro: Despesas, Comissões, Metas, Calendário financeiro | ✅ | ✅ | ❌ | ❌ |
| Receber pagamento ao finalizar O.S. | ✅ | ✅ | ✅ | ❌ |
| Desfazer recebimento | ✅ | ✅ | ❌ | ❌ |
| Quadro, Nova O.S., O.S. | ✅ | ✅ | ✅ | ✅ |
| Excluir O.S., orçamentos e clientes | ✅ | ❌ | ❌ | ❌ |
| Calendário | ✅ | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ✅ | ❌ (vê o nome na O.S. e cadastra na Nova O.S.) |
| Orçamentos (+ PDFs e guia) | ✅ | ✅ | ✅ | ❌ |
| Produtos, Serviços (catálogo), Histórico de O.S. | ✅ | ✅ | ✅ | ✅ (Histórico sem valores) |
| Comissão estimada no card do mecânico (Gestão) | ✅ | ✅ | ❌ | ❌ |
| Configurações (engrenagem), Usuários, Equipe, % de comissão | ✅ | ❌ | ❌ | ❌ |

Perfis (migration `20261019130000_perfis.sql`): `master`, `admin`, `atendente`, `mecanico`. No banco: `is_master()`, `is_fin()` (master/admin) e `is_office()` (todos menos mecânico). Na tela: `canDelete`, `isFin`, `isOffice` em `src/lib/permissions.ts`. Excluir uma O.S. leva junto orçamento, mídias, histórico e, se finalizada, entrada, taxas, comissão e baixa de estoque; excluir um cliente leva junto as O.S., orçamentos e agendamentos dele.

Regras:
- As permissões precisam valer **no banco**, com RLS do Supabase e uma função `current_role()`, e não só escondendo botões. O menu mostra apenas as páginas permitidas, e acessar uma rota proibida redireciona para o Quadro com o aviso "Acesso restrito ao seu perfil".
- Sempre deve existir **pelo menos um Master ativo**. O sistema não deixa rebaixar nem bloquear o último.
- O Master não altera o próprio perfil.
- Usuários podem ser **bloqueados** (não entram) em vez de excluídos.
- Toda alteração relevante numa O.S. grava **quem fez** (`historico.por`).

---

## 4. Identidade visual (obrigatória)

O guia completo está em `docs/identidade-visual-autogrado.md`. Os valores são obrigatórios. Resumo do que mais importa:

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

- **Laranja `#FF5C00` é o único acento.** Verde e vermelho são só estado (sucesso/erro, alta/queda), nunca enfeite.
- Texto sobre fundo verde usa `color: var(--bg)`; sobre vermelho, branco.
- Plus Jakarta Sans na interface. **JetBrains Mono** em números, valores em R$, placas, horários, SKU e EAN.
- Tamanhos: 12pt texto geral, 16pt títulos de seção, 22pt destaque máximo, 8,5–9,5pt microlabels. Pesos: 800 títulos, 700 botões e valores, 600 labels.
- Raios: cartões 2rem, painel de destaque 1.4rem, linhas dentro de cartões 1.2rem, controles 1rem, botão excluir .8rem, badge numérico .6rem.
- Cada cartão tem o **badge de seção** (quadrado laranja 26×26 com número mono `01`, `02`…) antes do título. No protótipo isso é feito com contador CSS.
- **Tema claro é o padrão.** O seletor Claro/Escuro fica no topo e a escolha é salva em `localStorage` (dentro de `try/catch`).
- Movimento: só transições curtas (0,15s hover/foco, 0,12s pressionar, 0,35s troca de tema, 0,25s toast). Respeitar `prefers-reduced-motion`.
- Toast: invertido (`background: var(--text)`), centralizado embaixo; vermelho quando é erro. Pode ter ação **Desfazer**.

### Layout geral (como no protótipo atual)
- **Menu lateral fixo** à esquerda, com 252px de largura e altura total da tela:
  - no topo, a marca (pílula laranja + **HAUSGRADO** + "Gestão de pátio");
  - no meio, os botões das páginas, centralizados verticalmente, com ícones;
  - na base, avatar com iniciais, primeiro nome, perfil e o botão **Sair**.
- **Barra do topo**, alinhada à direita: botão **+ Nova O.S.** (laranja, atalho `N`), **LCD de dicas** (ver abaixo), mascote, sino de lembretes, botão de som, engrenagem (só Master), seletor de tema e relógio (hora em mono laranja + data por extenso).
- Abaixo de 980px o menu lateral vira uma faixa horizontal rolável no topo, e a marca volta para a barra superior.
- O painel de números do pátio (No pátio · Em serviço · Aguardando peças · Carros atendidos no mês) aparece **logo abaixo do menu**, apenas na página **Quadro**.
- Ordem do menu: **Gestão, Financeiro (submenu: Entradas · Compras · Despesas · Fornecedores · Comissões · Calendário financeiro), Quadro, Calendário, Clientes, Orçamentos, Produtos, **Serviços**, Histórico de O.S.** Comissões deixou de ser item principal e virou submenu do Financeiro. Ao clicar em Financeiro, o item se expande com os três subitens e abre Entradas. Configurações não está no menu: abre pela engrenagem.

### Mascote
- Um **doberman em pixel art** (preto com marcações caramelo), caricato, com orelhas em pé.
- Fica ao lado do botão + Nova O.S. Por enquanto é só visual.
- No protótipo, cada sprite é desenhado em canvas numa grade de 40×32 e exibido em 2× com `image-rendering: pixelated`. Na versão final, transformar em **PNG/SVG estáticos**, um por pose.
- Poses por página:
  | Página | Pose |
  |---|---|
  | Gestão | Atrás de uma mesa, de óculos, com monitor mostrando um gráfico, calculadora e caneca |
  | Quadro / O.S. | Mecânico: macacão azul, boné laranja virado, chave inglesa, mancha de graxa |
  | Calendário | Segura um calendário, com lápis atrás da orelha |
  | Clientes / Login | Acenando, com gravata-borboleta laranja |
  | Orçamentos | De óculos, lendo um orçamento, com lápis |
  | Histórico | Lupa no olho, ao lado de uma caixa de arquivo |
  | Comissões | Olhos de moeda, saco de dinheiro, pilha de moedas |
  | Configurações | Capacete de obra e chave de fenda |
  | Nova O.S. / Guia de serviço | Prancheta de checklist |
  | Produtos | Segura um frasco de óleo |
  | Pasta / PDF do orçamento | Segura o documento impresso |
- Pisca a cada ~4s; fica parado com `prefers-reduced-motion`.
- Ao clicar, mostra um balão com uma frase aleatória da página e toca um latidinho. As frases estão em `FALAS` no protótipo.

### LCD de dicas (ao lado de + Nova O.S.)
- Visual de **visor LCD de calculadora em pixel art**:
  - fundo cinza quase preto (`#1a1b19`), cantos de 1rem e borda interna;
  - linhas de varredura e grade de pixels bem sutis por cima;
  - um LED quadrado laranja aceso;
  - texto em **Press Start 2P** (Google Fonts), 11px, caixa alta, **laranja neon** (`#ff8a2b` com brilho via `text-shadow`).
- **Funciona sempre no tema escuro**, independente do tema da interface.
- O texto passa da direita para a esquerda (≈45 px/s, em passos de 2px para parecer pixelado), uma mensagem por vez, com bordas esmaecidas.
  - Com `prefers-reduced-motion`, não rola: troca de mensagem a cada 6 s.
  - A animação é feita em JS (estado global de posição), para não recomeçar quando a tela é redesenhada.
- **Mensagens** (recalculadas a cada volta):
  - carros no pátio e em serviço, carros parados há 3 dias ou mais, lembretes de agendamento a enviar e clientes agendados hoje;
  - **só Master/Admin:** contas a pagar vencendo e faturamento/ticket do mês;
  - 3 **dicas** sorteadas (atalhos N, / e Esc, arrastar card, foto rápida, ditado, link no WhatsApp, guia de serviço, peça cadastrada, chave pix do fornecedor, despesas recorrentes).
- Fica escondido abaixo de 980px.

### Sons
- Curtos e baixos, gerados com Web Audio (sem arquivos).
- Eventos: clique de navegação, mover card, sucesso/salvar/finalizar, erro (grave), foto, abrir lembretes, login, logout e latido do mascote.
- Botão de alto-falante no topo liga e desliga, e a escolha fica salva em `localStorage`.

### Atalhos de teclado
- `N`: Nova O.S.
- `/`: busca do Quadro.
- `Esc`: fecha um modal ou os lembretes, ou volta da O.S. para o Quadro.
- Os atalhos não disparam enquanto o foco estiver num campo de texto.

---

## 5. Entidades e regras de domínio

### 5.1 Status da O.S. (colunas do Quadro, nesta ordem)
| chave | rótulo |
|---|---|
| `orcamento` | Orçamento |
| `aprovado` | Aprovado |
| `pecas` | Aguardando peças |
| `servico` | Em serviço |
| `entrega` | Esperando entrega |
| `finalizado` | Finalizado |

- Ao marcar `finalizado`, preencher `data_saida = agora` se estiver vazia. A data de saída continua editável.
- **Toda passagem para `finalizado`** (arrastar o card, botão ›, barra de status da O.S.) abre antes o pop-up **Receber e finalizar** (seção 7.15). A O.S. só é finalizada depois que o pagamento é confirmado; cancelar mantém o status anterior.
- Toda mudança de status gera um registro no histórico ("Status: Em serviço") com autor e data.

### 5.2 Tipo de entrada
`servico` (Serviço), `manutencao` (Manutenção), `garantia` (Garantia).

### 5.3 Fotos obrigatórias da entrada (6 posições)
`frontal` Frontal · `lat_esq` Lateral esquerda · `lat_dir` Lateral direita · `traseira` Traseira · `motor` Cofre do motor · `painel` Painel.

### 5.4 Itens conferidos na entrada (checklist de entrada)
Estepe · Macaco / chave de roda · Triângulo · Documento (CRLV) · Rádio / multimídia · Tapetes.

### 5.5 Abas de registro dentro da O.S.
**AVARIAS**, **PEÇAS**, **SERVIÇO**. Cada aba é uma lista de registros. Um registro pode ter:
- uma mídia (foto ou vídeo) com descrição;
- ou só texto ("Registro só com texto").

A descrição é editável a qualquer momento, e o registro pode ser excluído (com confirmação).

### 5.6 Status do orçamento
`rascunho` Rascunho · `enviado` Enviado ao cliente · `aprovado` Aprovado · `recusado` Recusado.

- Ao **aprovar** um orçamento cuja O.S. está em `orcamento`, mover a O.S. para `aprovado` automaticamente e registrar no histórico.
- O cliente também pode aprovar ou recusar pelo portal.
- Enviar pelo WhatsApp muda `rascunho` para `enviado`.

### 5.7 Status do agendamento
`agendado` Agendado · `atendido` O.S. aberta · `faltou` Faltou. Um agendamento pode ser reagendado (volta para `agendado`).

### 5.8 Categorias de produto e características
| categoria (chave) | rótulo | características (aparecem só para a categoria) |
|---|---|---|
| `oleo_motor` | Óleo motor | **Viscosidade**: lista com 0W16, 0W20, 0W30, 5W20, 5W30, 5W40, 10W40, 15W40, 20W50, 10W60 · **API**: SF, SJ, SL, SN, SP, SQ (checkbox, **só uma**) · **Volume**: 1L, 4L, 5L (checkbox, **só um**) · **Especificação de aplicação** (texto livre) |
| `oleo_trans` | Óleo transmissão | **Especificação de aplicação** (texto livre) |
| `peca` | Peça | **Aplicação em** (várias): Audi, BMW, Mercedes Benz, Mini, Hyundai, KIA, Honda, Toyota, Mitsubishi, BYD, GWM, Fiat, Volkswagen, Chevrolet, Ford. Tem atalhos "Todas" e "Limpar" |
| `filtros` | Filtros | igual a Peça |
| `aditivos` | Aditivos | **Tipo** (lista): Combustível, Óleo, Transmissão, Direção, Arrefecimento |

Ao trocar a categoria, as características que não se aplicam são descartadas no salvamento.

---

## 6. Modelo de dados (Postgres / Supabase)

Use `uuid` como chave primária (`gen_random_uuid()`) e `created_at timestamptz default now()` em todas as tabelas. Valores monetários em `numeric(12,2)`. Para multi-oficina no futuro, inclua `shop_id` em todas as tabelas desde já, mesmo com uma oficina só.

```sql
-- Oficina e configurações
shops(id, name text default 'Autogrado', phone text, portal_base_url text,
      commission_pct numeric(5,2) default 5, plate_api_provider text,
      fee_debit_pct numeric(5,2), fee_pix_pct numeric(5,2),
      fee_credit_pct numeric(5,2)[12])   -- índice 1..12 = taxa do crédito em Nx

-- Usuários do sistema (1:1 com auth.users)
profiles(id uuid references auth.users, shop_id, full_name text, username text unique,
         role text check (role in ('master','admin','atendente')), active boolean default true)

-- Profissionais (mecânicos) que podem ser responsáveis por O.S.
technicians(id, shop_id, name text, active boolean default true)
-- seed: 'Arthur Chagas', 'Iago Martins'

customers(id, shop_id, name text not null, phone text not null,   -- só dígitos, com DDD (ex.: 61981234567)
          document text, zip_code text)                    -- CEP: 8 dígitos, exibido 00000-000 (substituiu o e-mail)

vehicles(id, shop_id, customer_id, plate text not null,            -- ABC1234 ou ABC1D23, maiúsculas
         make text, model text, year text, color text, fuel text)
-- unique(shop_id, plate)

service_orders(id, shop_id, number int not null,                   -- sequencial por oficina, começa em 1001
               vehicle_id, customer_id,
               plate text, make text, model text, year text, color text, fuel text,  -- snapshot na entrada
               km text, fuel_level text check (fuel_level in ('Reserva','1/4','1/2','3/4','Cheio')),
               entry_type text check (entry_type in ('servico','manutencao','garantia')),
               status text check (status in ('orcamento','aprovado','pecas','servico','entrega','finalizado')),
               entered_at timestamptz not null, exited_at timestamptz,
               technician_id uuid references technicians,
               customer_complaint text,       -- "Relato do cliente / observações"
               service_description text,      -- "Descrição do serviço" (vai na pasta do cliente)
               checklist jsonb,               -- {estepe:true, macaco:true, ...}
               portal_token text unique not null, -- aleatório, longo (≥ 32 chars), usado no link do cliente
               appointment_id uuid)

service_order_photos(id, service_order_id, position text check (position in
               ('frontal','lat_esq','lat_dir','traseira','motor','painel')), storage_path text)
-- unique(service_order_id, position)

service_order_records(id, service_order_id,
               tab text check (tab in ('avarias','pecas','servicos')),
               storage_path text, mime text, file_name text,  -- null = registro só com texto
               description text, created_by uuid references profiles)

service_order_history(id, service_order_id, text text, created_by uuid, created_by_name text)

products(id, shop_id, name text not null, manufacturer text, sku text, ean text,
         cost numeric(12,2) default 0, price numeric(12,2) not null,
         category text check (category in ('oleo_motor','oleo_trans','peca','filtros','aditivos')),
         viscosity text, api text, volume text, application_spec text,
         application_brands text[] default '{}', additive_type text)
-- unique(shop_id, sku) where sku is not null

service_catalog(id, shop_id, name text not null, description text, price numeric(12,2) not null, active boolean default true)
-- unique(shop_id, lower(name)); ex.: "Check list viagem" · "Verificação do sistema elétrico, suspensão, freios e motor" · 350,00

quotes(id, shop_id, number int not null,                           -- sequencial, começa em 501
       service_order_id uuid null, customer_id, plate text,
       discount numeric(12,2) default 0, validity_days int default 7,
       status text check (status in ('rascunho','enviado','aprovado','recusado')),
       decided_at timestamptz, decided_by text)  -- 'oficina' | 'cliente'

quote_items(id, quote_id, kind text check (kind in ('peca','mao')),
            description text, qty numeric(10,2) default 1, unit_price numeric(12,2) default 0,
            product_id uuid null references products, sku text,
            service_id uuid null references service_catalog, details text,  -- details = descrição do serviço do catálogo
            position int)

appointments(id, shop_id, date date, time time, customer_id, plate text, reason text,
             status text check (status in ('agendado','atendido','faltou')),
             service_order_id uuid null, reminder_sent_at timestamptz)

commission_payments(id, shop_id, service_order_id unique, paid_at timestamptz, paid_by uuid)

-- Financeiro: entradas (1 por O.S. finalizada) e suas formas de pagamento
receipts(id, shop_id, service_order_id unique, received_at timestamptz,
         total numeric(12,2),            -- soma recebida
         difference numeric(12,2),       -- recebido − total da O.S. (negativo = desconto no fechamento; positivo = troco/acréscimo)
         received_by uuid references profiles)
receipt_payments(id, receipt_id, method text check (method in ('dinheiro','credito','debito','pix')),
         amount numeric(12,2), installments int default 1)   -- parcelas só para crédito (1–12)

-- Financeiro: fornecedores
suppliers(id, shop_id, name text not null, salesperson text, salesperson_phone text, pix_key text)
-- unique(shop_id, lower(name)); compra com fornecedor novo cria o fornecedor automaticamente

-- Financeiro: despesas (lançamentos manuais e automáticos)
expenses(id, shop_id, description text,
         category text check (category in ('Água','Aluguel','Antecipação de lucros','Compra de mercadorias','Contabilidade',
           'Energia','Equipamentos','Estornos','Financeiro','Folha de pagamento','Comissão','Impostos','Internet',
           'Prejuízos diversos','Reformas','Sistemas','Taxa de pagamento','Terceiros')),
         amount numeric(12,2) not null, due_date date not null,
         payment_code text,              -- código de barras do boleto ou chave pix (campo com ícone de chave + Copiar)
         paid boolean default false, paid_on date,
         source text check (source in ('manual','purchase','fee','commission')) default 'manual',
         purchase_id uuid null, receipt_id uuid null, service_order_id uuid null)
-- Regras: cada compra gera/atualiza 1 despesa 'Compra de mercadorias' (source=purchase, valor=total, vencimento=boleto ou data da compra,
--   pago espelhado); cada entrada gera 1 despesa 'Taxa de pagamento' (source=fee, paga, vencimento=data do recebimento);
--   marcar comissão como paga gera 1 despesa 'Comissão' (source=commission). Fazer por trigger ou na mesma transação.

-- Financeiro: compras de peças
purchases(id, shop_id, supplier_id, invoice_number text,
         purchased_on date not null, received_on date,        -- recebimento pode ficar vazio
         freight numeric(12,2) default 0, notes text,
         payment_method text check (payment_method in ('pix','boleto','debito','credito','dinheiro','transferencia')),
         payment_code text,             -- código do boleto ou chave pix (pix: preenchido com a chave do fornecedor)
         due_date date,                 -- obrigatório quando boleto
         paid boolean, paid_on date)    -- não-boleto: paid=true, paid_on=purchased_on
purchase_items(id, purchase_id, description text, qty numeric(10,2), unit_cost numeric(12,2),
         product_id uuid null references products, sku text, position int)
```

**Storage:** bucket privado `os-media` com caminho `shop_id/service_order_id/{entrada|avarias|pecas|servicos}/uuid.ext`. O frontend usa URLs assinadas; o portal do cliente recebe URLs assinadas geradas pela Edge Function. Compactar imagens no cliente antes do envio (ex.: lado maior com 1600px, JPEG 0.82). Vídeos: limite de tamanho a definir (sugestão: 100 MB).

**RLS:** em todas as tabelas, só usuários `active` da mesma `shop_id` acessam. Regras extras:
- `commission_payments`, a configuração de comissão e as consultas da Gestão: só `master` e `admin`.
- `profiles` (gestão de usuários), `technicians` (escrita) e `shops` (escrita): só `master`.
- Excluir `service_orders`: só `master` e `admin`.
- O portal do cliente **nunca** acessa tabelas direto. Ele passa sempre pela Edge Function (seção 8).

**RLS do financeiro:** `receipts`/`receipt_payments` podem ser **inseridos** por qualquer perfil (o atendente fecha O.S.), mas só `master`/`admin` leem a página Financeiro; `purchases`, `purchase_items` e `suppliers`: só `master`/`admin`.

**Realtime:** assinar `service_orders`, `service_order_records`, `appointments` e `quotes`. Assim o Quadro, o sino, a O.S. aberta e o portal atualizam sem recarregar.

---

## 7. Telas e funcionalidades

> Para cada tela, o protótipo mostra o layout e o comportamento esperados. Abaixo estão as regras que precisam existir.

### 7.1 Login
- Campos usuário e senha, botão "Mostrar senha", Enter envia.
- Erro: "Usuário ou senha incorretos." Usuário bloqueado: "Este usuário está bloqueado. Fale com o administrador master."
- O mascote acena: "Au! Bem-vindo de volta."
- Os botões de "entrar como" do protótipo são **só para demonstração** e não vão para produção.
- A sessão persiste entre recarregamentos.

### 7.2 Gestão (Master e Admin)
Sempre mostra **um mês**, por padrão o atual, com setas para os meses anteriores (não avança além do mês atual). A base é **O.S. finalizadas no mês pela data de saída**.

- **KPIs** (cada um com variação percentual sobre o mês anterior, em verde se melhorou e vermelho se piorou):
  1. Faturamento de serviços finalizados (cartão de destaque escuro);
  2. O.S. finalizadas;
  3. Ticket médio;
  4. Tempo médio de pátio. Aqui **cair é bom**: a cor do selo inverte.
- **Faturamento diário (gráfico de linha):**
  - **últimos 7 dias** (linha laranja forte com área suave) contra os **7 dias anteriores** (mesma cor, apagada e tracejada);
  - eixo X com dia da semana e data, e "Hoje" no último ponto; o rótulo com o valor fica no ponto de hoje;
  - ao passar o mouse, linha vertical + tooltip com o valor do dia, nº de O.S., o valor do dia equivalente da semana anterior e a variação;
  - totais dos dois períodos com a variação, legenda com duas entradas e a opção "Ver em tabela";
  - o texto do gráfico precisa ter o tamanho da interface (renderizar na largura real do container, sem escalar o SVG).
- **Indicadores de operação** (independem do mês):
  - "A faturar no pátio": soma dos orçamentos aprovados das O.S. em andamento;
  - "Orçamentos aguardando resposta": rascunho + enviado;
  - "Taxa de aprovação": aprovados ÷ (aprovados + recusados).
- **Serviço por mecânico:** um cartão por técnico com:
  - faturamento do mês e barra de participação no total;
  - O.S. finalizadas, ticket médio, mão de obra e tempo médio;
  - carros dele no pátio agora e quantos em serviço;
  - comissão estimada.

  Também há um cartão "Sem responsável" (borda vermelha) quando houver O.S. finalizadas sem técnico.
- **Serviços mais feitos:** ranking dos itens de mão de obra, com quantidade e valor. Agrupar pela descrição sem o prefixo "Mão de obra — ".
- **Composição:** barra dividida peças × mão de obra, e contagem por tipo de entrada.

### 7.3 Quadro
- Seis colunas (seção 5.1), numeradas de 01 a 06, com contagem.
- Arrastar o card entre colunas ou usar os botões ‹ ›. Depois de mover, aparece o toast "PLACA → Etapa" com **Desfazer** por 6s.
- A coluna **Finalizado** mostra só as O.S. com saída nos **últimos 3 dias**, com um link para o Histórico.
- **Card:**
  - placa em estilo Mercosul (faixa "BRASIL"), chip do tipo e marca/modelo;
  - cliente, nº da O.S. e responsável;
  - tempo no pátio ("5 h", "3 d"; nos finalizados, "de pátio" contado até a saída) e nº de registros;
  - botão de **foto rápida**, que abre a câmera e salva direto na aba **Serviço** daquela O.S.
- **Alerta de carro parado:** se o card está há **3 dias ou mais** na mesma etapa (desde a última mudança de status), ganha borda vermelha e a faixa "Parado há X dias nesta etapa".
- Busca por placa ou nome do cliente (atalho `/`).
- O Quadro ocupa toda a largura disponível ao lado do menu; as colunas rolam na horizontal se faltar espaço.

### 7.4 Nova O.S. (checklist de entrada)
1. **Veículo:**
   - campo de placa em estilo placa Mercosul, que força maiúsculas e aceita os formatos `ABC1234` e `ABC1D23`;
   - o botão **Consultar placa** chama a API de placas (seção 8) e preenche marca, modelo, ano fab./mod., cor e combustível;
   - se a placa já estiver no pátio, avisa; se já tiver vindo antes, sugere o mesmo cliente;
   - campos editáveis: quilometragem e nível de combustível.
2. **Fotos de entrada:** os 6 quadros da seção 5.3. No celular, abrem a câmera traseira (`capture="environment"`).
3. **Tipo de entrada** (3 botões), itens conferidos (seção 5.4) e relato do cliente (com botão de ditado).
4. **Cliente:** escolher um existente ou cadastrar na hora (nome + celular com DDD).
- **Abrir checklist:** cria a O.S. em `orcamento`, gera o `portal_token` e abre a O.S.
- Quando a entrada vem de um agendamento, mostrar um aviso com a data e a hora. Ao abrir, ligar o agendamento à O.S. (status `atendido`).

### 7.5 O.S. (detalhe)
- **Cabeçalho:**
  - placa grande, marca/modelo, ano, cor, km e combustível, com chips de nº da O.S., tipo e entrada;
  - botões "‹ Quadro" e **Imprimir pasta do cliente**;
  - campos: data de entrada (editável), **profissional responsável** (lista da equipe) e data de saída (preenchida ao finalizar);
  - barra com os 6 status para trocar com um clique; Finalizado fica verde.
- **Descrição do serviço:** texto livre com ditado. É o texto da primeira página da pasta do cliente.
- **Abas AVARIAS · PEÇAS · SERVIÇO**, com contagem:
  - área de envio de várias fotos e vídeos (arrastar ou escolher), botões **Foto rápida** e **Vídeo rápido** e "+ Registro só com texto";
  - cada registro mostra a prévia, a data e uma descrição editável com botão **Ditar**.
- **Lateral:**
  - Acesso do cliente: link do portal, senha = celular, botões **Enviar no WhatsApp**, **Copiar mensagem** e **Ver como o cliente vê**;
  - resumo do orçamento (ou "Criar orçamento");
  - fotos de entrada, itens conferidos e relato;
  - tipo de entrada editável;
  - histórico (data, texto e autor);
  - Excluir O.S. (Master/Admin, com confirmação).

### 7.6 Calendário
- Mês em grade (Dom–Sáb), com navegação e botão Hoje. Cada dia mostra até 3 agendamentos ("08:30 PLACA") e "+N".
- Verde = O.S. aberta; vermelho = faltou. No celular, cada dia mostra só a contagem.
- **Lateral:**
  - lista do dia selecionado, cada item com hora, placa, cliente, telefone e motivo;
  - ações: **Abrir O.S.** (vai para Nova O.S. preenchida com cliente, placa e motivo, e com os dados do veículo se a placa já for conhecida), **Faltou**, **Reagendar** e Excluir;
  - formulário de novo agendamento: data, hora, cliente, placa (sugere as placas do cliente) e motivo.

### 7.7 Lembretes (sino)
- O sino fica **laranja com contador** quando há agendamentos de **amanhã** com status `agendado` e lembrete ainda não enviado.
- **Contador do sino** = agendamentos de amanhã sem lembrete + (só Master/Admin) contas a pagar **vencidas, de hoje ou de amanhã** (compras, despesas). O número fica vermelho se houver alguma vencida.
- O painel **Lembretes**:
  - **Atendente:** só a coluna **Agendamentos de amanhã**.
  - **Master/Admin:** duas colunas: **Agendamentos de amanhã** e **Financeiro · contas vencidas, de hoje e de amanhã**. Cada conta mostra o selo "Vencida" (vermelho), "Vence hoje" ou "Vence amanhã", com valor, código do boleto/chave pix (Copiar) e os botões **Marcar como pago**, Ver compra ou Editar.
- **O clique sempre abre primeiro o painel.** Cada item tem o botão **Enviar lembrete no WhatsApp**. Ao clicar, marca `reminder_sent_at` e o item mostra "Lembrete enviado hh:mm" / "Enviar de novo".

### 7.8 Clientes
- Lista com busca por nome ou celular, mostrando os veículos (placas clicáveis que abrem a O.S.) e as ações Editar e Nova entrada.
- Formulário com nome, celular/WhatsApp (obrigatório, com DDD; é a senha do portal), CPF/CNPJ e **CEP** (máscara `00000-000`, guarda só os dígitos). Não há campo de e-mail. A lista mostra CPF/CNPJ e CEP sob o nome. Sugestão para a versão final: preencher o endereço pelo CEP (ViaCEP), consultado no servidor.
- Máscara de telefone: `(61) 98765-4321`. Guardar só os dígitos.

### 7.9 Orçamentos
- **Lista:** nº, placa, cliente, situação e total.
- **Editor:**
  - escolher o veículo (O.S.), que define cliente e placa;
  - tabela de itens (tipo, descrição, qtd, valor unitário, subtotal), editável na própria linha;
  - botões **+ Peça**, **+ Mão de obra** e **+ Peça cadastrada**;
  - **desconto em R$ protegido:** o valor aparece só para leitura, com o botão "Aplicar"/"Alterar" (ícone de chave). Ele abre um pop-up que pede a **senha de autorização** e só então libera o campo do valor (não pode passar do subtotal). O histórico da O.S. registra quem aplicou;
  - validade em dias;
  - painel de totais com peças, mão de obra e TOTAL;
  - **Enviar orçamento no WhatsApp**, Copiar texto, **Gerar PDF do orçamento** e **Gerar guia de serviço**;
  - situação com 4 botões (aprovar move a O.S., seção 5.6) e atalho para a O.S.
- **Pop-up "+ Peça cadastrada":**
  - busca com foco automático (nome, fabricante, SKU, EAN e aplicação), filtro por categoria e lista com fabricante, SKU, resumo das características, preço e botão **Adicionar**;
  - adicionar de novo soma 1 à quantidade, e o botão mostra quantas já estão no orçamento;
  - uma linha de peça vazia é reaproveitada;
  - o item guarda `product_id` e `sku`;
  - fecha com Esc, Concluir ou clique fora.

### 7.10 Produtos
- **Lista:**
  - busca (nome, fabricante, SKU, EAN) e filtros por categoria com contagem;
  - colunas: produto (nome, fabricante e resumo, ex. "5W30 · API SN · 1L" ou "Aplicação: VW, Fiat"), categoria, SKU/EAN, custo, preço e **margem**;
  - margem = (preço − custo) ÷ preço, em verde se ≥ 30% e em vermelho se < 10%;
  - clicar num produto o abre para edição.
- **Formulário:** nome*, fabricante, categoria*, SKU, EAN, custo, preço* e margem calculada ao vivo. O painel **Características** muda conforme a categoria (seção 5.8).
- **Validações:**
  - EAN com 8 ou 13 dígitos e dígito verificador correto;
  - SKU único (maiúsculas);
  - preço > 0.

### 7.10b Serviços (catálogo de serviços prontos)
- Página abaixo de Produtos, para cadastrar **serviços pré-planejados** e vendê-los no orçamento com um clique (ex.: "Revisão 60 mil km Kwid", "Check list viagem", "Alinhamento e balanceamento").
- Campos: **Serviço*** (nome único), **Descrição** (o que está incluído) e **Valor*** (R$).
- Lista em cartões com nome, valor em laranja, descrição e "Usado em N orçamentos". Tem busca, e clicar num cartão abre a edição/exclusão no formulário lateral.
- **No orçamento:** botão laranja **+ Serviço cadastrado**, ao lado de "+ Peça cadastrada". Ele abre um pop-up com busca e o botão Adicionar.
  - O serviço entra como item de **mão de obra**, com nome, `details` (descrição), valor e `service_id`.
  - Adicionar de novo soma a quantidade.
  - Uma linha de mão de obra vazia é reaproveitada.
  - A descrição aparece embaixo do item no editor, no **PDF do orçamento** e na **guia de serviço** (texto menor, em cinza).
- Seed: Check list viagem 350, Revisão 60 mil km Kwid 890, Revisão 10 mil km 280, Alinhamento e balanceamento 120, Higienização do ar-condicionado 150, Diagnóstico eletrônico 120, Troca de pastilhas dianteiras 150, Revisão de freios completa 220, Polimento de faróis 180.

### 7.11 Histórico de O.S.
- Só O.S. finalizadas, filtradas pela **data de saída**.
- Atalhos de período: Este mês, Mês passado, Últimos 30 dias, Este ano e Tudo. Também há campos De/Até e busca por placa, cliente ou nº.
- Resumo: nº de O.S. no período e soma dos orçamentos aprovados.
- Tabela: O.S., placa, veículo, cliente, tipo, entrada, saída e orçamento. Clicar abre a O.S.

### 7.12 Comissões (Master e Admin)
- Regra na seção 9.
- Filtros de período como no Histórico.
- Resumo: mão de obra no período, comissões no período e valor a pagar.
- Cartões por profissional: comissão, nº de O.S., mão de obra e valor a pagar. Clicar filtra a tabela; há um cartão vermelho "Sem responsável".
- Tabela: O.S., placa, saída, responsável, mão de obra, comissão e **Marcar paga** / "Paga dd/mm" (clicar desfaz).

### 7.13 Configurações (engrenagem, só Master)
- **Senha de autorização de desconto:** criar ou trocar (senha + confirmação, mínimo 4 caracteres). Mostra se está ativa, quem definiu e quando. Só o Master acessa. É usada no fechamento com valor menor e no desconto do orçamento. Na versão final, guardar só o hash (bcrypt/argon2) no servidor e validar por Edge Function/RPC, com limite de tentativas. Senha de demonstração: `1234`.
- **Taxas de pagamento:** percentuais de **Débito**, **Pix** e **Crédito por número de parcelas (1x a 12x, um campo para cada)**. Dinheiro não tem taxa. A cada entrada registrada, o sistema cria uma despesa "Taxa de pagamento" = Σ(valor da forma × taxa da forma), paga na data do recebimento, com a descrição "Taxas O.S. 1041 (Cartão de crédito 3,19% + Pix 0,99%)". Desfazer o recebimento remove a taxa. Mudar a taxa vale só para os recebimentos seguintes. Padrão da demonstração: débito 1,39%, pix 0,99%, crédito 1x 3,19% · 2x 4,59% · 3x 5,29% · 4x 5,99% · 5x 6,69% · 6x 7,39% · 7x 8,09% · 8x 8,79% · 9x 9,49% · 10x 10,19% · 11x 10,89% · 12x 11,59%. No pop-up de recebimento, cada forma mostra a taxa que será aplicada (o crédito muda conforme as parcelas).
- **Entradas** mostram também as taxas e o líquido (recebido − taxas).
- **Usuários e acessos:** lista com perfil editável, Ativo/Bloqueado, Trocar senha e Bloquear/Ativar, além do formulário de novo usuário (nome, usuário com 3+ caracteres, senha com 6+ caracteres e perfil).
- **Oficina:** nome e endereço base do link do cliente.
- **Consulta de placa:** provedor e token (o token fica guardado no servidor, nunca no navegador).
- **Equipe e comissão:** profissionais (adicionar e remover) e o % de comissão sobre a mão de obra (padrão 5).
- **Dados:** começar do zero ou recarregar exemplos. Só no ambiente de demonstração.

### 7.15 Pop-up "Receber e finalizar O.S."
- Abre sempre que uma O.S. vai para **Finalizado**. Mostra placa, veículo, cliente e o **Total da O.S.** (total do orçamento não recusado; 0 se não houver).
- **Forma de pagamento**, com várias opções marcáveis: Dinheiro, Cartão de crédito, Cartão de débito e Pix. Cada forma marcada ganha um campo de valor em R$; o crédito tem também as **parcelas** (1x–12x).
- Ao marcar uma forma, o valor é preenchido sozinho com o que **falta** para fechar o total.
- **Resumo ao vivo:**
  - "Valor confere com o total da O.S." (verde);
  - "Troco de R$ X", quando há dinheiro e o valor passa do total;
  - "Recebendo R$ X a mais";
  - "Faltam R$ X. Para dar desconto, informe a senha de autorização." (vermelho).
- **Regra:** a O.S. **não pode ser finalizada sem o pagamento total**. Se o recebido for menor que o total:
  - aparece o bloco **"Desconto exige autorização"** com o campo da **senha de autorização**, criada só pelo Master em Configurações;
  - com a senha correta (validada no servidor na versão final), o resumo vira "Desconto de R$ X autorizado" e o botão habilita;
  - o histórico registra "Desconto de R$ X autorizado com senha de administrador", e a entrada guarda `diferenca` < 0 e `autorizado = true`.
  - Se nenhuma senha foi criada, o sistema avisa para pedir ao Master.
- O.S. com total R$ 0 (ex.: garantia sem cobrança) mostra "Esta O.S. não tem valor a receber" e o botão **Finalizar sem cobrança**.
- O botão **Receber e finalizar** só habilita quando o recebido cobre o total ou quando o desconto foi autorizado.
- **Ao confirmar:**
  - cria o registro em `receipts` com as formas, finaliza a O.S. (com a data de saída) e grava no histórico "Pagamento recebido: Pix R$ 300,00 + Cartão de crédito 3x R$ 413,60";
  - mostra um toast com **Desfazer**, que remove a entrada e volta o status.
- Cancelar, Esc ou clique fora não alteram nada.

### 7.16 Financeiro (Master e Admin)
O menu tem o item **Financeiro** com três subpáginas.

**Entradas.** Recebimentos gerados automaticamente ao finalizar O.S. (7.15).
- **Layout do topo:** duas colunas.
  - **Esquerda:** cartão escuro "Recebido no período" com o valor grande, uma barra empilhada com a divisão por forma (Pix = laranja, Crédito = laranja claro, Débito e Dinheiro = cinzas), a legenda com percentuais e, embaixo, quatro números: recebimentos, ticket médio, taxas e líquido.
  - **Direita:** grade 2×2 com um cartão por forma (valor, % do total, barra na cor da forma e nº de recebimentos).
- Filtros de período (Este mês, Mês passado, Últimos 30 dias, Este ano, Tudo e De/Até, pela data do recebimento) e busca por placa, cliente ou nº.
- KPIs: recebido no período (destaque) e total de cada forma, com barra e percentual.
- Tabela: data/hora, O.S., placa, cliente, formas (chips com valor e parcelas) e valor. Quando houver, mostra o "Desconto no fechamento". Clicar abre a O.S.

**Compras (antes chamado "Saídas").**
- **Lista:**
  - filtros de período pela data da compra e busca por fornecedor, NF ou item;
  - KPIs: compras no período, a pagar (boletos em aberto) e vencidos (em vermelho);
  - tabela: data da compra, fornecedor ("Recebido dd/mm" ou "Aguardando recebimento"), NF, nº de itens, forma (com o vencimento quando boleto), situação (Pago / Pendente / Vencido) e total;
  - botão **+ Registrar nova compra**.
- **Editor, parecido com o de orçamento:**
  - **fornecedor*** (autocomplete com os fornecedores já usados), nota fiscal, **data da compra*** e **data do recebimento** (pode ficar vazia; não pode ser antes da compra);
  - **frete de entrega**;
  - tabela de peças (descrição, qtd, valor unitário, subtotal), com **+ Item** e **+ Produto cadastrado**. Este último usa o mesmo pop-up de busca do orçamento, mas preenche o **custo** do produto;
  - observações;
  - painel de totais: peças + frete = **total da compra**.
- **Pagamento** (escolha única): Pix, **Boleto**, Cartão de débito, Cartão de crédito, Dinheiro ou Transferência.
  - Se for **Boleto**, aparece o **vencimento do boleto*** e a compra entra no **Calendário financeiro como pagamento pendente**. Na edição, há a caixa "Boleto pago".
  - As outras formas ficam como pagas na data da compra.
- A compra pode ser editada e excluída.

**Despesas.**
- Mostra **todas as saídas de dinheiro**: lançamentos manuais, compras (automáticas, categoria "Compra de mercadorias"), comissões pagas (categoria "Comissão") e taxas automáticas de cartão/pix.
- As taxas aparecem **agrupadas por dia** ("Taxas de cartão e pix · 3 recebimentos").
- Filtros de período (pelo vencimento), categoria e busca.
- KPIs: total, pago, a pagar e vencido. Gráfico "Por categoria" (top 6).
- **Formulário de nova despesa:**
  - categoria (lista com as 18 categorias), descrição, **valor***, **data de vencimento***;
  - campo **Código do boleto ou chave pix** com ícone de chave e botão Copiar;
  - **Repetir** todo mês (3, 6 ou 12 meses), útil para aluguel, internet e sistemas;
  - "Já está paga".
- Só os lançamentos manuais são editáveis aqui. Compras abrem a compra, e taxas/comissões são somente leitura. Qualquer pendente tem **Pagar** (com Desfazer).

**Fornecedores.**
- Campos: **Fornecedor***, **Vendedor**, **Contato do vendedor** (telefone com DDD, com link para o WhatsApp) e **Chave pix** (campo com ícone de chave e Copiar).
- A lista mostra o nº de compras, o total comprado e o valor em aberto de cada fornecedor.
- Não dá para excluir um fornecedor que tenha compras.
- Renomear o fornecedor atualiza as compras.
- Na compra: o campo fornecedor sugere os cadastrados e mostra vendedor e contato. Escolhendo **Pix**, a chave do fornecedor já vem preenchida.

**Comissões:** agora fica dentro do Financeiro. Marcar uma comissão como paga cria a despesa "Comissão".

**Calendário financeiro** (todas as contas a pagar: compras, despesas e comissões; as taxas ficam só em Despesas).
- KPIs: a pagar no mês exibido, pago no mês e vencido (todos os meses, em vermelho).
- Grade mensal (como o Calendário de agendamentos), em que cada dia mostra os pagamentos ("R$ 370 Fornecedor"):
  - laranja = pendente, vermelho = vencido (não pago e vencimento antes de hoje), verde = pago;
  - boletos aparecem no vencimento; as outras formas, na data da compra.
- **Lateral:** pagamentos do dia selecionado e **Próximos a pagar** (os 6 próximos em aberto), cada um com **Marcar como pago** (com Desfazer) e **Ver compra**.

### 7.14 Portal do cliente (público)
- Rota pública: `/acompanhar/{portal_token}`. Senha = celular do cliente com DDD, só números; aceitar com ou sem o 55 na frente.
- Mostra:
  - oficina, nº da O.S., placa, veículo e "Olá, {primeiro nome}";
  - selo **AO VIVO** e barra de etapas com os 6 status;
  - última atualização;
  - **orçamento** com itens e total, e botões **Aprovar orçamento** e **Recusar** quando o status é rascunho ou enviado;
  - galerias de **Serviço**, **Peças** e **Avarias** com descrições, e as fotos da entrada.
- Atualiza em tempo real.
- Segurança: limitar tentativas por token e IP (ex.: 5 por 15 min), sessão curta (cookie httpOnly) e token longo e aleatório.

---

## 8. Integrações

### 8.1 API de placas
- Provedor a definir (opções: API Placas, WDAPI, Placa Fipe). Chamada **só pela Edge Function** `plate-lookup`, com o token guardado como segredo.
- Retornar `{make, model, year, color, fuel}`. Guardar o resultado em cache por placa (ex.: 30 dias) para economizar consultas.
- No protótipo há uma base simulada com 11 placas (ex.: `ABC1D23`, `PXT9H41`, `LMN2B56`, `DEF4G67`).

### 8.2 WhatsApp
- Por enquanto, só com links `https://wa.me/55{DDD}{número}?text={mensagem}`, abertos em nova aba. O sistema **não** envia mensagens sozinho; a pessoa toca em enviar. Uma integração com a WhatsApp Business API pode vir no futuro.
- Templates (manter o texto):

**Link de acompanhamento**
```
Olá, {primeiro nome}! Aqui é da {oficina}.

Seu veículo {marca} {modelo} — placa {placa} — está registrado na OS nº {número}.

Acompanhe o serviço em tempo real, com fotos e vídeos:
{link do portal}

Senha de acesso: o seu número de celular com DDD (somente números).
```

**Orçamento**
```
Olá, {primeiro nome}! Segue o orçamento nº {número} para o veículo placa {placa}:

• {descrição} ({qtd}x) — {subtotal}
...
Desconto: −{desconto}            ← só se houver

*Total: {total}*
Validade: {dias} dias.

Você pode aprovar pelo link de acompanhamento:
{link do portal}
Senha: seu celular com DDD.
```

**Lembrete (véspera do agendamento)**
```
Olá, {primeiro nome}! Aqui é da {oficina}.

Passando para lembrar do seu agendamento amanhã, {dia da semana, dd de mês}, às {hh:mm} (veículo placa {placa}).
Motivo: {motivo}

Se não puder vir, responda esta mensagem que a gente reagenda.
```

### 8.3 Ditado por voz
- `SpeechRecognition` / `webkitSpeechRecognition` com `lang='pt-BR'`, contínuo e com resultados parciais. O texto vai sendo anexado ao campo.
- O botão mostra "Ouvindo… parar" em vermelho. Esconder o botão quando o navegador não oferece a API.
- Campos com ditado: descrição de cada registro de mídia, descrição do serviço e relato do cliente.

### 8.4 Câmera
- `<input type="file" accept="image/*" capture="environment">` para foto e `accept="video/*"` para vídeo. No computador, isso abre o seletor de arquivo.

---

## 9. Regras de cálculo (cobrir com testes unitários)

- **Total do orçamento** = Σ(qtd × valor unitário) − desconto.
- **Faturamento de uma O.S.** = total do orçamento ligado, se não estiver `recusado`; senão 0.
- **Faturamento do mês** = Σ faturamento das O.S. `finalizado` com `exited_at` no mês.
- **Ticket médio** = faturamento ÷ nº de O.S. finalizadas no mês.
- **Tempo de pátio** de uma O.S. = `exited_at − entered_at`. Média no mês. Exibir como "4 d 3 h" ou "18 h".
- **Variação** = (atual − anterior) ÷ anterior. Sem base: "sem base".
- **Comissão** = `commission_pct` × Σ(itens `mao` do orçamento) das O.S. `finalizado` cujo orçamento **não** está `recusado`, atribuída ao `technician_id` da O.S. e filtrada pela data de saída. O desconto do orçamento **não** reduz a base. Isso foi uma escolha do protótipo; confirmar com o Vinícius.
- **Carros atendidos no mês** = O.S. finalizadas com saída no mês corrente.
- **Carro parado** = agora − data do último evento de status (ou da entrada) ≥ 3 dias, para O.S. não finalizadas.
- **Finalizado no Quadro** = `exited_at` ≥ agora − 72 h.
- **Taxa de aprovação** = orçamentos aprovados ÷ (aprovados + recusados).
- **Total da compra** = Σ(qtd × custo unitário) + frete.
- **Taxa automática de uma entrada** = Σ formas (valor × taxa% da forma; no crédito, a taxa da quantidade de parcelas), arredondado a centavos. Descrição: "Taxas O.S. 1041 (Cartão de crédito 6x 7,39% + Pix 0,99%)".
- **Situação de qualquer despesa:** pago → Pago; vencimento < hoje → Vencido; senão Pendente.
- **Situação da compra:** pago → "Pago"; senão, vencimento < hoje → "Vencido"; senão "Pendente".
- **Diferença no recebimento** = soma das formas − total da O.S. (negativo = desconto concedido no fechamento).
- **Valor sugerido ao marcar uma forma** = total da O.S. − soma das formas já preenchidas (se > 0).
- **Margem do produto** = (preço − custo) ÷ preço.
- **EAN-13:** dígito verificador com pesos 1/3 alternados, contados da direita (sem o dígito final).

---

## 10. Documentos PDF (A4, preto e branco, texto selecionável)

Padrão comum a todos:
- margens de 10 mm (vertical) e 12 mm (lateral);
- título em 13pt 800, subtítulo com oficina, número e data/hora de emissão;
- etiqueta da via no canto superior direito (caixa com borda preta, mono 8pt);
- linha preta de 1,4px sob o cabeçalho;
- seções com título 7pt 800 em caixa alta e linha inferior;
- rodapé de página "{oficina} · {documento} · {placa}" e "Página X de Y" em mono 7pt;
- divisórias `#e3e3e3`;
- sem cores, exceto as fotos.

### 10.1 Pasta do cliente (botão na O.S.) — "VIA DO CLIENTE"
- **Página 1:**
  - Veículo: placa, marca, modelo, ano, cor, km, combustível e tipo de entrada;
  - Cliente (nome, celular) e Datas (entrada, saída ou "Em aberto", responsável);
  - as 6 fotos de entrada (3×2, recorte 4:3, "Sem foto" quando faltar);
  - Descrição do serviço (se vazia, usar as descrições dos registros de Serviço) e "Relato do cliente na entrada".
- **Páginas seguintes:** seções **Avarias registradas**, **Peças** e **Fotos do serviço executado**, nesta ordem.
  - Cada seção começa em página nova, com 4 registros por página (2×2) e "(1/2)" quando houver várias.
  - Cada registro tem foto, data/hora e descrição. Vídeo entra como um quadro do vídeo ("quadro do vídeo"); registro só com texto mostra "Registro sem foto".
  - Aba vazia não gera página.

### 10.2 PDF do orçamento
**Layout moderno (ver protótipo):**
- **Cabeçalho:** barra preta vertical e o **nome da oficina bem grande** (AUTOGRADO, 28pt 800, caixa alta, espaçado) com o subtítulo "Centro automotivo · orçamento de serviços". À direita, um bloco preto "ORÇAMENTO / Nº 501" (número em mono) e, embaixo, "Emitido em dd/mm/aaaa · O.S. 1041".
- **Dois cartões cinza** lado a lado:
  - Cliente: nome grande, celular em mono e CPF/CNPJ;
  - Veículo: marca, modelo em destaque, ano · cor · km, e a placa desenhada no estilo Mercosul.
- **Tabela:** cabeçalho preto, grupos "PEÇAS" e "MÃO DE OBRA" com nº de itens e subtotal do grupo, linhas zebradas e subtotal em negrito.
- **Rodapé da página:**
  - à direita, Peças, Mão de obra, Desconto e o **TOTAL num bloco preto** com o valor grande em branco;
  - à esquerda, a caixa "Condições" (validade com data, situação, aviso de alteração de valores e link de acompanhamento), com a altura ajustada ao conteúdo;
  - linhas de "Aprovação do cliente" (com o nome) e "Data".

**Conteúdo (mantido):**
- Cliente (nome, celular, CPF/CNPJ) e Veículo (placa, modelo, ano, km).
- Tabela: Tipo, Descrição, Qtd, Valor un. e Subtotal; o cabeçalho se repete em cada página.
- Totais: Peças, Mão de obra, Desconto e **TOTAL** em caixa com borda de 1,5px.
- "Validade: N dias (até dd/mm/aaaa). Situação: X."
- Nota: "Valores sujeitos a alteração caso sejam encontrados outros problemas durante o serviço, sempre com nova aprovação do cliente."
- Linhas para "Aprovação do cliente" e "Data".

### 10.3 Guia de serviço (botão no orçamento; exige O.S. vinculada) — "VIA DA OFICINA"
**Layout (ver protótipo):** é o documento mais "visual" (pode usar cinzas claros #f1f1f1/#e2e2e2 e preto sólido, sem cor):
- **cabeçalho:** barra preta vertical + "GUIA DE SERVIÇO" (15pt 800) + oficina, data de emissão e nº do orçamento; à direita, um bloco preto "ORDEM DE SERVIÇO" com o número grande em mono branco e o rótulo "VIA DA OFICINA";
- **seções numeradas:** faixa cinza com um quadrado preto contendo o número (1 Veículo e entrada, 2 Peças e serviços a executar, 3 Checklist de saída);
- **veículo:** placa desenhada no estilo Mercosul (borda preta, faixa "BRASIL"), marca/modelo em destaque, ano · cor e cliente/telefone; à direita, a data e a hora da entrada em mono grande;
- **8 cartões de informação** (borda cinza): marca, modelo, ano fab./mod., cor, quilometragem, **nível de combustível como medidor de 4 segmentos**, **tipo de entrada com 3 caixas** (a do tipo da O.S. vem marcada) e profissional responsável;
- **tabela de itens:** cabeçalho preto (OK · # · Descrição · Qtd), agrupada em "PEÇAS · n" e "MÃO DE OBRA · n", com linhas zebradas, caixa de OK, número sequencial e quantidade numa caixinha. Sem preços;
- **"Reclamação do cliente"** em caixa com barra preta à esquerda;
- **checklist de saída:** cada grupo numa caixa arredondada com número em círculo preto. Os grupos 1 e 2 ocupam a largura toda, e os 3 e 4 ficam lado a lado. Os campos de preencher são linhas desenhadas (não sublinhados de texto). Um grupo nunca é quebrado entre páginas;
- **assinaturas:** "Assinatura do mecânico" (com o nome do responsável embaixo) e "Data e hora da conclusão".

**Conteúdo:**
- Subtítulo: O.S., placa, nº do orçamento e emissão.
- **TOPO, "Veículo e entrada"** (3 colunas): Marca · Modelo · Ano fab./mod. · Cor · Quilometragem · Nível de combustível · Tipo de entrada · Profissional responsável · Data e hora da entrada.
- **MEIO, "Peças e serviços a executar"**: colunas OK (quadradinho) · Tipo · Descrição · Qtd. Primeiro as peças, depois a mão de obra, **sem preços**. Abaixo: "Reclamação do cliente: …" (se houver).
- **RODAPÉ, "Checklist de saída"**. Texto exato, com quadradinhos ☐; uma seção nunca é quebrada entre páginas:

```
1. Serviço e segurança
☐ Conferir se todos os serviços autorizados na ordem de serviço foram concluídos.
☐ Conferir a montagem, fixação e os apertos dos componentes envolvidos no serviço.
☐ Conferir o aperto dos parafusos/porcas das rodas com torquímetro, conforme a especificação do fabricante.
   Torque aplicado: __________ N·m
☐ Conferir pressão dos pneus conforme a especificação do veículo.

2. Funcionamento e teste
☐ Dar partida e verificar funcionamento do motor.
☐ Conferir se há luzes de advertência ou mensagens anormais no painel. Se tiver qual:
   _______________________________
☐ Realizar teste de rodagem, quando aplicável e em condições seguras.
☐ Confirmar se a reclamação do cliente foi solucionada.
☐ Após o teste, verificar novamente possíveis vazamentos e anormalidades.
   Teste de rodagem: ☐ Realizado ☐ Não se aplica
   Responsável pelo teste: _______________________________________

3. Limpeza e apresentação
☐ Remover os cobre-placas dianteiro e traseiro.
☐ Remover as proteções plásticas de banco, volante e câmbio.
☐ Remover capas de para-lamas e demais proteções externas.
☐ Retirar ferramentas, panos, embalagens e materiais de serviço do veículo.
☐ Limpar marcas de mãos, graxa e sujeira geradas durante o serviço.

4. Conferência da entrega
☐ Registrar a quilometragem de saída e os serviços executados na OS.
☐ Conferir chaves e acessórios recebidos com o veículo.
   Quilometragem de saída: __________________ km

Assinatura do mecânico: _______________________________________
```

Na versão final, os botões de PDF podem oferecer **Imprimir** (direto) e **Baixar PDF**.

---

## 11. Dados de exemplo (seed do ambiente de demonstração)

- Oficina "Autogrado"; técnicos **Arthur Chagas** e **Iago Martins**; comissão de 5%.
- Usuários de demonstração: `master/master123` (Vinícius de Albuquerque, Master), `admin/admin123` (Paula Ribeiro, Administrador) e `atendente/atend123` (Bruna Lopes, Atendente). **Nunca levar esses usuários para produção.**
- ~19 clientes, com **90% dos celulares DDD 61 e 10% DDD 62**.
- ~47 O.S.:
  - O.S. finalizadas em quase todos os dias das **últimas 2 semanas**, de 1 a 3 por dia (menos no fim de semana), para o gráfico diário;
  - mais ~7 no mês anterior e ~6 dois meses antes;
  - ~11 no pátio, distribuídas pelas colunas.
- Orçamentos variados a partir de pacotes de serviço:
  - revisão 10 mil e 40 mil, troca de óleo, freios dianteiros e traseiros, suspensão, embreagem, correia dentada, arrefecimento, ar-condicionado, alinhamento, injeção e bateria;
  - preços com ±10% de variação, 25% com 5% de desconto e peças a R$ 0 na garantia;
  - mais 4 orçamentos recusados avulsos.
- 12 produtos de exemplo cobrindo as 5 categorias, com SKU e EAN válidos.
- Agendamentos: hoje, **amanhã (2)**, depois de amanhã e na semana seguinte.
- **Entradas:** uma para cada O.S. finalizada, com data igual à saída e formas variadas (Pix e crédito mais frequentes; ~25% divididas em duas formas; crédito parcelado em valores altos).
- **Fornecedores:** 5, com vendedor, contato e chave pix.
- **Despesas:** contas fixas de 4 meses (do mês retrasado ao próximo): aluguel, energia, água, internet, contabilidade, sistemas, folha e impostos, com códigos de boleto ou chave pix. Uma conta de água do mês está pendente. Também há despesas avulsas (equipamentos, reforma) e as taxas de todas as entradas. Gerador: `seedFinanceiro2()`.
- **Compras:** 12 compras nos últimos ~2 meses, de 5 fornecedores (Distribuidora Peças Brasília, Auto Peças Planalto, Lubrificantes Centro-Oeste, Disk Filtros DF, Freios & Cia Goiânia). Mistura de Pix, débito, crédito e **boletos**, com boletos pagos, **um vencido** e vários com vencimento nos próximos dias. Gerador: `seedFinanceiro()`.
- Comissões dos meses anteriores parcialmente marcadas como pagas.
- O protótipo tem o gerador determinístico em `genExtra()` e `seed()`; use como referência para um `supabase/seed.sql` ou um script `scripts/seed.ts`.

---

## 12. Requisitos não funcionais

- **LGPD:** o sistema guarda nome, celular, CPF/CNPJ e imagens. Incluir aviso de uso de dados no checklist de entrada e no portal, além de política de retenção de mídia de O.S. finalizadas (sugestão: 12 meses, configurável).
- **Backups:** backup diário do Postgres (plano pago do Supabase) e versionamento do bucket.
- **Auditoria:** histórico da O.S. com autor; registrar logins e mudanças de perfil.
- **Acessibilidade:**
  - foco visível (anel laranja), alvos de toque de 44px ou mais no celular e `aria-label` em botões só com ícone;
  - nada que dependa só de cor: o alerta de carro parado tem texto, e os selos de variação têm ▲/▼.
- **Responsivo:** sem rolagem horizontal da página em 400px; tabelas, quadro e gráfico rolam dentro do próprio container.
- **Desempenho:** imagens compactadas antes do envio, miniaturas no Quadro e listas paginadas no Histórico e em Produtos quando passarem de algumas centenas de linhas.
- **Formatação:** `toLocaleString('pt-BR', {style:'currency', currency:'BRL'})`; datas `dd/mm/aaaa hh:mm`; placas em maiúsculas e mono.

---

## 13. Plano de implementação sugerido (fases)

1. **Base:** projeto Next.js + TS, tokens CSS e fontes, layout (menu lateral fixo, barra do topo, tema, relógio, toast, sons), Supabase local (`supabase init`), migrações das tabelas e RLS, login e `current_role()`, proteção de rotas por perfil e tela de Usuários (Master).
2. **Cadastros:** Clientes, Veículos (implícitos pela placa), Produtos (com características e validação de EAN/SKU) e Equipe.
3. **O.S.:** Nova O.S. (placa, fotos de entrada no Storage, tipo, checklist, cliente), detalhe da O.S. (abas Avarias/Peças/Serviço com upload, descrição, ditado, foto rápida), histórico com autor e Quadro (drag-and-drop, desfazer, alerta de parado, regra de 3 dias, realtime).
4. **Orçamentos:** editor, pop-up de peça cadastrada, aprovação que move a O.S., WhatsApp e PDFs (orçamento e guia de serviço).
5. **Portal do cliente:** rota pública, Edge Function de autenticação por celular, galerias, aprovação/recusa e realtime. Depois, a pasta do cliente em PDF.
6. **Agenda:** calendário, abrir O.S. a partir do agendamento e sino de lembretes.
6b. **Financeiro:** pop-up de recebimento ao finalizar (com transação: receipt + status + histórico juntos), Entradas, Saídas (compras com itens e fornecedores) e Calendário financeiro.
7. **Gestão, Histórico e Comissões:** consultas no banco (views ou RPCs `SECURITY DEFINER` com checagem de perfil), gráfico diário e cartões por mecânico.
8. **API de placas:** Edge Function com cache.
9. **Acabamento:** mascote (sprites estáticos por pose), atalhos, acessibilidade, testes E2E por perfil, seed de demonstração e deploy (Vercel + Supabase), domínio próprio para o portal (ex.: `acompanhe.autogrado.com.br`).

Para cada fase: abrir o protótipo na tela correspondente, implementar, comparar visualmente nos temas claro e escuro e no celular (400px) e escrever os testes das regras da seção 9 que a fase tocar.

---

## 14. Pontos em aberto (perguntar antes de decidir)

- Confirmar a stack (seção 2) e se haverá mais de uma oficina (multi-tenant) no futuro.
- Provedor da API de placas e custo por consulta.
- A comissão considera o desconto do orçamento? Ela vale para O.S. de garantia?
- O cliente pode ver o valor das peças no portal, ou só o total?
- Limite de tamanho e prazo de retenção para vídeos.
- Mecânicos terão login próprio, com um perfil "Mecânico" que só vê as O.S. dele?
- Financeiro: compras com boleto **parcelado** (vários vencimentos)? Contas fixas avulsas (aluguel, energia) no calendário financeiro? Taxas de cartão (débito/crédito) descontadas do recebido? Aviso no sino para boletos vencendo?
- Ao registrar uma compra de produto cadastrado, atualizar o custo do produto e dar entrada no estoque?
- Integração futura: baixa de estoque de Produtos ao finalizar uma O.S. com peças cadastradas, emissão de NFS-e/NF-e e WhatsApp Business API.

---

## 15. Arquivos de referência

| Arquivo | O que é |
|---|---|
| `docs/prototipo/hausgrado-prototipo.html` | Protótipo funcional completo (abra no navegador; login de demonstração na tela inicial) |
| `docs/identidade-visual-autogrado.md` | Guia de identidade visual com os tokens e regras obrigatórias |
| `CLAUDE.md` | Este arquivo |
| `SETUP-BETA.md` | Passo a passo para publicar a beta (Supabase + GitHub + Vercel + domínio) |
| `supabase/tests/regras_test.sql` | Testes das regras do banco (rodar só no banco local) |

No protótipo, as funções e constantes mais úteis para consulta são:
- constantes: `STATUS`, `TIPOS`, `FOTOS`, `ITENS_CK`, `ORC_ST`, `AG_ST`, `CATS`, `VISC`, `APIS`, `VOLS`, `MARCAS`, `ADIT`;
- regras e mensagens: `mesDados`, `serieDias`, `comRows`, `eanOk`, `msgOS`, `msgOrc`, `msgLemb`;
- despesas e fornecedores: `allDespesas`, `despSit`, `taxaDeEntrada`, `vFinDesp`, `vFinForn`, `keyField`, `seedFinanceiro2`;
- financeiro: `pedePagamento`, `vPagamento`, `pagResumo`, `vFinEntradas`, `vFinSaidas`, `vFinCompra`, `vFinCal`, `compraSit`, `seedFinanceiro`;
- PDFs: `pastaPages`, `orcPages`, `guiaPages`;
- mascote e sons: `sprite`, `FALAS`, `POSE`, `sfx`.
