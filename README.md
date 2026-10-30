# Petrosupply Financeiro

Plataforma web interna para gestão de **clientes, projetos comerciais e controle de recebíveis**: cadastro de clientes e projetos, geração automática do cronograma de parcelas, controle central de pagamentos, dashboard financeiro, agenda e relatórios.

- **Frontend:** Next.js 16 (App Router) · React 19 · TypeScript
- **Estilo:** Tailwind CSS 3 · design system **GREEN UX** (escala verde de 7 tons)
- **Banco e autenticação:** Supabase (PostgreSQL + Supabase Auth) com **RLS** em todas as tabelas
- **Gráficos:** Recharts · **Ícones:** lucide-react
- **Deploy:** Vercel · **Código:** GitHub

## Módulos

| Rota | Módulo |
| --- | --- |
| `/` | Dashboard financeiro (KPIs, gráficos, rankings, filtros de período) |
| `/clientes`, `/clientes/[id]` | Cadastro de clientes e detalhamento individual |
| `/projetos`, `/projetos/[id]` | Projetos, cronograma, recálculo de parcelas |
| `/pagamentos` | Controle geral de pagamentos (todas as parcelas, filtros, exportação) |
| `/agenda` | Agenda financeira em calendário + próximos vencimentos |
| `/relatorios` | 6 relatórios com exportação Excel/CSV e impressão |
| `/configuracoes` | Condições de pagamento, usuários, histórico de alterações, dados de demonstração |

## Como colocar no ar

### 1. Supabase

1. Crie um projeto em <https://supabase.com> (ou use o existente).
2. Aplique as migrations **na ordem** (SQL Editor do Supabase, ou `supabase db push`):
   `supabase/migrations/20261030000001_schema.sql` → `…02_views.sql` → `…03_functions.sql` → `…04_seed_conditions.sql` → `…05_harden_functions.sql` → `…06_user_management.sql` → `…07_admin_update_user.sql` → `…08_project_invoice.sql`.
3. Em **Authentication → Providers → Email**: mantenha e-mail/senha ativo. Depois de criar os usuários da equipe, considere **desativar “Allow new users to sign up”** para impedir novos cadastros externos.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable** (nunca use a `service_role` no front-end).

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` (desenvolvimento) e cadastre as mesmas variáveis na Vercel:

| Variável | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon/publishable |

### 3. Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # testes de cálculo, métricas e banco (PGlite)
npm run typecheck
npm run build
```

### 4. Deploy na Vercel

1. Suba o repositório para o GitHub.
2. Na Vercel: **Add New → Project → Import** o repositório (framework Next.js é detectado sozinho).
3. Em **Environment Variables**, cadastre as duas variáveis acima (Production, Preview e Development).
4. **Deploy.** A cada `git push` na branch principal a Vercel publica automaticamente.

### 5. Primeiro acesso

Abra a URL, clique em **“Primeiro acesso? Criar conta”**. **O primeiro usuário cadastrado vira administrador ativo.** Depois, o administrador cria os demais acessos em *Configurações → Usuários → Novo usuário*, escolhendo o perfil **Administrador** (cria e exclui usuários, gerencia configurações) ou **Colaborador** (usa o sistema, sem acesso à gestão de usuários). Contas criadas por cadastro aberto entram inativas até serem liberadas.

> Dica: em *Configurações → Dados de demonstração* há dados fictícios (marcados `[DEMO]`) para explorar o sistema; remova-os com um clique.

## Estrutura do banco

```
auth.users ──1:1── profiles (role: admin|user, active)

clients ──1:N── projects ──1:N── installments ──1:N── payments
                   │
                   └── payment_condition_id → payment_conditions (items jsonb)

audit_log  ← preenchida por trigger em clients, projects, installments e payments
```

| Tabela | Função |
| --- | --- |
| `profiles` | Usuários do sistema (papel e ativação) |
| `clients` | Razão social, CNPJ único (14 dígitos), contato |
| `projects` | Tipo (6 opções), início, valor total, 1º vencimento, condição, situação |
| `payment_conditions` | Modelos de parcelamento (`[{label, percent, offset_days}]`, soma = 100%) |
| `installments` | Parcelas: número, %, valor, vencimento, cancelamento; único por `(project_id, number)` |
| `payments` | Recebimentos (parciais permitidos) vinculados à parcela |
| `audit_log` | Histórico de alterações (valores antigos e novos) |

**Nota Fiscal:** `projects.invoice_number`, `invoice_file_path` e `invoice_file_name` (todos opcionais). O PDF fica no bucket privado `invoices` do Supabase Storage (somente PDF, até 10 MB; acesso só para usuários ativos) e é aberto/baixado por link temporário de 60 segundos.

**Views** (calculam status dinamicamente pela data de hoje em Brasília): `installments_view`, `projects_view`, `clients_view`.

**Funções (RPC):** `admin_create_user`, `admin_delete_user` (somente administrador), `create_project`, `replace_pending_installments`, `register_payment`, `load_demo_data`, `remove_demo_data`.

Todas as chaves primárias são `uuid`; todas as tabelas têm `created_at`/`updated_at` (exceto `payments`/`audit_log`, que são apenas de inserção).

### Segurança (RLS)

- RLS ativo em todas as tabelas; **anônimos não têm acesso a nada**.
- Acesso aos dados de negócio apenas para usuários **autenticados e ativos** (`is_active_user()`).
- `payment_conditions`: leitura para ativos, escrita só para administradores. `profiles`: cada um lê o seu; administradores gerenciam todos.
- `audit_log`: somente leitura; gravada apenas por trigger.
- Funções internas de gatilho e RPCs têm `EXECUTE` revogado para `anon`.

## Regras de negócio implementadas

- Soma das parcelas = valor contratado, **exatamente** (cálculo em centavos; a última parcela absorve o arredondamento). Validado no front-end e no banco (`create_project`).
- Percentuais configuráveis por parcela; a soma precisa ser 100%.
- Sinal vence na data informada; demais parcelas vencem **N dias após o sinal** (ex.: 01/11 → +30 = 01/12 → +60 = 31/12).
- Parcela só é **Paga** após recebimento registrado; **pagamento parcial** mantém o saldo em aberto.
- Status automático: *A vencer · Vence hoje · Atrasado · Pago parcialmente · Pago · Cancelado* (calculado na view; nada fica “congelado”).
- Data de recebimento não pode ser futura; valor não pode exceder o saldo da parcela.
- Alterar o valor do projeto recalcula **somente as parcelas pendentes**, mediante confirmação; parcelas com pagamento e canceladas são preservadas.
- Histórico preservado: parcelas/projetos com pagamentos não podem ser excluídos (use *Cancelar*); estornos e edições ficam no `audit_log`.
- Dashboard: *contratado* (projetos iniciados no período) ≠ *recebido* (pagamentos registrados no período) ≠ *previsão* (saldo das parcelas que vencem em 30 dias). Parcelas futuras **nunca** contam como recebidas.
- Moeda `R$ 0.000,00` e datas `DD/MM/AAAA` em todo o sistema.

## Estrutura do código

```
src/
  app/                  rotas (App Router): login e grupo (app) com as telas
  components/           ui.tsx (design system), forms/, charts, tabelas, shell
  lib/                  format, installments (cálculo), metrics (dashboard),
                        reports, data (acesso ao Supabase), audit, export
  proxy.ts              proteção de rotas / renovação de sessão (Next 16)
supabase/migrations/    SQL versionado
tests/                  testes (node:test + PGlite)
```

## Manutenção e evolução

- **Novas migrations:** crie `supabase/migrations/AAAAMMDDHHMMSS_descricao.sql` e aplique no Supabase; nunca edite uma migration já aplicada.
- **Novo tipo de projeto:** altere o `check` de `projects.project_type` (migration) e a lista `PROJECT_TYPES` em `src/lib/types.ts`.
- **Nova condição de pagamento:** em *Configurações → Condições de pagamento* (administrador), sem código.
- **Cores / identidade visual:** tokens em `tailwind.config.ts` (`brand`) e `src/app/globals.css`.
- **Novos relatórios:** adicione um item em `REPORTS` e um `case` em `buildReport` (`src/lib/reports.ts`).
- **Backups:** habilite backups automáticos no Supabase (plano Pro) ou exporte periodicamente pelo painel.
- Rode `npm test && npm run typecheck && npm run build` antes de cada deploy.
