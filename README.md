# Hausgrado — gestão de pátio (Autogrado)

Next.js + Supabase. Versão beta.

- **Contexto completo do produto:** `CLAUDE.md` (comece pela seção 0)
- **Publicar:** `SETUP-BETA.md`
- **Protótipo de referência:** `docs/prototipo/hausgrado-prototipo.html`

```bash
npm install
npm test          # regras de negócio
npm run dev       # http://localhost:3000
```

Estrutura:

```
supabase/migrations   banco: tabelas, regras, RLS, storage, views  (fonte da verdade)
supabase/seed.sql     dados iniciais da oficina Autogrado
supabase/functions    Edge Functions: portal (link do cliente) e plate-lookup (placas)
supabase/tests        testes SQL das regras (só no banco local)
src/lib               rules.ts (cálculos), permissions.ts (perfis), supabase/ (clientes)
src/app               telas (login, (app)/quadro, c/[token] = portal do cliente)
scripts               create-demo-users.mjs
```
