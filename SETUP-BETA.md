# Hausgrado · como publicar a versão beta

Passo a passo para fazer no **seu computador**, com o Claude Code ajudando. Você faz os logins; ninguém precisa da sua senha.
Tempo estimado: 1 a 2 horas na primeira vez.

> Segurança, antes de tudo
> - Ative a verificação em duas etapas (2FA) no GitHub, Vercel e Supabase.
> - A chave `service_role` do Supabase é a "chave mestra" do banco: só no `.env.local` e nas variáveis da Vercel. Nunca no GitHub, nunca em chat.
> - O arquivo `.env.local` já está no `.gitignore`.

---

## 1. Programas necessários

| Programa | Para quê | Como conferir |
|---|---|---|
| Node.js 22 LTS | rodar o site | `node -v` |
| Git | versionar e enviar ao GitHub | `git --version` |
| Docker Desktop | Supabase local (testes) | `docker -v` |
| Supabase CLI | migrations e funções | `npx supabase --version` |
| GitHub CLI (opcional) | criar o repositório | `gh --version` |

## 2. Rodar tudo no seu computador primeiro

```bash
cd hausgrado-beta
npm install
npm test                       # 10 testes das regras devem passar
npm run typecheck              # corrigir o que aparecer (o código não foi compilado antes)

npx supabase init              # cria supabase/config.toml (mantenha as pastas migrations/ e functions/)
npx supabase start             # sobe o Supabase local no Docker; anote "API URL", "anon key" e "service_role key"
npx supabase db reset          # aplica as migrations + seed.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/regras_test.sql
                               # confira T1..T23 (os ERROR que aparecem são bloqueios esperados)
npx supabase db reset          # limpa os usuários de teste criados acima
```

Crie o `.env.local` a partir do `.env.example` com os dados do Supabase **local** e rode:

```bash
npm run users:demo             # cria master, admin e atendente e mostra as senhas UMA vez
npm run dev                    # abra http://localhost:3000 e entre com "master"
```

Teste: quadro aparece com 3 O.S. → arraste uma → arraste "Esperando entrega" para "Finalizado" → popup de pagamento → finalize.
Entre como `atendente` e confirme que Gestão/Financeiro não aparecem.

## 3. Supabase de produção (beta)

1. No painel do Supabase, crie o projeto **hausgrado-beta**, região **South America (São Paulo)**. Guarde a senha do banco no seu gerenciador de senhas.
2. **Authentication → Sign In / Providers → Email:** deixe ativo e **desligue "Allow new users to sign up"** (só o master cria contas). Desligue "Confirm email".
3. No terminal:
   ```bash
   npx supabase login                       # abre o navegador; você faz o login
   npx supabase link --project-ref SEU_REF  # o "ref" está na URL do projeto
   npx supabase db push                     # aplica as migrations
   ```
4. Dados iniciais: **SQL Editor →** cole o conteúdo de `supabase/seed.sql` → Run.
5. **Troque a senha de desconto** da demo (`1234`) assim que tiver a tela de Configurações; até lá, no SQL Editor:
   `update shop_secrets set discount_password_hash = extensions.crypt('NOVA-SENHA', extensions.gen_salt('bf'));`
6. Edge Functions:
   ```bash
   npx supabase functions deploy portal --no-verify-jwt
   npx supabase functions deploy plate-lookup
   # quando contratar a API de placas:
   npx supabase secrets set PLATE_API_URL="https://.../{plate}" PLATE_API_TOKEN="..."
   ```
7. Usuários: atualize o `.env.local` com a URL e as chaves de **produção** (Project Settings → API), rode `npm run users:demo` e anote as senhas. Depois **volte o `.env.local` para o ambiente local**.

## 4. GitHub

```bash
git init && git add . && git commit -m "Hausgrado beta: base inicial"
gh auth login                                  # ou crie o repositório pelo site
gh repo create hausgrado --private --source=. --push
```
Repositório **privado**. Confira no site que `.env.local` não foi enviado.

## 5. Vercel

1. vercel.com → **Add New → Project →** importe o repositório `hausgrado`.
2. **Environment Variables** (Production e Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (sem `NEXT_PUBLIC`!)
   - `NEXT_PUBLIC_AUTH_EMAIL_DOMAIN=usuarios.hausgrado.app` (o mesmo usado ao criar os usuários)
   - `NEXT_PUBLIC_SITE_URL=https://app.seudominio.com.br`
3. Deploy. O `vercel.json` já coloca as funções em São Paulo (`gru1`).

## 6. Domínio (Registro.br)

1. Vercel → Project → **Settings → Domains →** adicione `app.seudominio.com.br` (e, se quiser, `acompanhe.seudominio.com.br` para o link do cliente).
2. No Registro.br → **DNS → Editar zona →** crie o registro **CNAME** `app` apontando para o valor que a Vercel mostrar (ex.: `cname.vercel-dns.com`). Se o domínio usar DNS de outro serviço, crie lá.
3. Aguarde o certificado (cadeado) aparecer na Vercel.
4. Supabase → **Authentication → URL Configuration → Site URL:** `https://app.seudominio.com.br`.
5. Na tabela `shops`, preencha `portal_base_url` com `https://app.seudominio.com.br/c/`.

## 7. Checklist antes de chamar a equipe

- [ ] Login dos 3 perfis funcionando no domínio.
- [ ] Atendente não vê Gestão/Financeiro (nem pela URL).
- [ ] Finalizar O.S. sem pagamento completo é bloqueado; com senha de desconto, passa.
- [ ] Link do cliente abre com o celular cadastrado e bloqueia após 5 erros.
- [ ] Senhas dos usuários e de desconto trocadas.
- [ ] Backup: no plano Pro do Supabase os backups diários já vêm ligados — confira em Database → Backups.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Login sempre "incorreto" | `NEXT_PUBLIC_AUTH_EMAIL_DOMAIN` diferente do usado no `users:demo` |
| Telas vazias depois do login | usuário sem linha em `profiles` (rode o script de novo) |
| "Para finalizar a O.S., registre o pagamento" | correto: finalizar só pelo popup |
| Portal: "Não foi possível abrir agora" | função `portal` não publicada ou sem `--no-verify-jwt` |
