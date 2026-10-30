/**
 * Testa as migrations e as regras de negócio do banco em um Postgres local
 * (PGlite), simulando o schema `auth` e os papéis do Supabase.
 * Rodar: npm test
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dir = join(__dirname, "..", "supabase", "migrations");
let db: PGlite;

const USER_A = "00000000-0000-0000-0000-0000000000a1"; // primeiro usuário => admin
const USER_B = "00000000-0000-0000-0000-0000000000b2"; // segundo => inativo

async function asUser(uid: string | null) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  await db.exec(uid ? `set role authenticated;` : `set role anon;`);
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), "utf8").replace(/create extension if not exists pgcrypto;/i, "");
    await db.exec(sql);
  }
  await db.exec(`
    insert into auth.users (id, email) values ('${USER_A}', 'a@x.com'), ('${USER_B}', 'b@x.com');
  `);
});

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];

test("primeiro usuário vira admin ativo; o seguinte fica inativo", async () => {
  const a = await one<{ role: string; active: boolean }>(`select role, active from profiles where id = '${USER_A}'`);
  const b = await one<{ role: string; active: boolean }>(`select role, active from profiles where id = '${USER_B}'`);
  assert.deepEqual(a, { role: "admin", active: true });
  assert.deepEqual(b, { role: "user", active: false });
});

test("RLS: anônimo e usuário inativo não enxergam nem gravam dados", async () => {
  await asUser(USER_A);
  await db.query(`insert into clients (name, cnpj) values ('Cliente RLS', '99888777000166')`);

  await asUser(null);
  await assert.rejects(db.query(`select * from clients`)); // anon sem grant
  await asUser(USER_B);
  const rows = await db.query(`select * from clients`);
  assert.equal(rows.rows.length, 0, "inativo não pode ler");
  await assert.rejects(db.query(`insert into clients (name, cnpj) values ('X', '11111111000111')`));
  await asUser(USER_A);
  await db.query(`delete from clients where cnpj = '99888777000166'`);
});

test("condições padrão: 4 condições, todas somando 100%", async () => {
  await asUser(USER_A);
  const r = await db.query<{ name: string; total: number }>(
    `select name, (select sum((i->>'percent')::numeric) from jsonb_array_elements(items) i) as total from payment_conditions`,
  );
  assert.equal(r.rows.length, 4);
  for (const row of r.rows) assert.equal(Number(row.total), 100, row.name);
  await assert.rejects(
    db.query(`insert into payment_conditions (name, items) values ('Ruim', '[{"label":"x","percent":90,"offset_days":0}]')`),
  );
});

let projectId = "";
let clientId = "";

test("create_project: gera parcelas atômicas e valida soma", async () => {
  await asUser(USER_A);
  clientId = (await one<{ id: string }>(`insert into clients (name, cnpj) values ('Empresa ABC', '11222333000181') returning id`)).id;

  await assert.rejects(
    db.query(
      `select create_project($1,'Assessoria CRC','2026-11-01',10000,'2026-11-01',null,null,$2::jsonb)`,
      [clientId, JSON.stringify([{ label: "Sinal", percent: 50, amount: 4000, due_date: "2026-11-01" }, { label: "2ª", percent: 50, amount: 5000, due_date: "2026-12-01" }])],
    ),
    /difere do valor/,
  );
  await assert.rejects(
    db.query(
      `select create_project($1,'Assessoria CRC','2026-11-01',10000,'2026-11-01',null,null,$2::jsonb)`,
      [clientId, JSON.stringify([{ label: "Sinal", percent: 60, amount: 5000, due_date: "2026-11-01" }, { label: "2ª", percent: 50, amount: 5000, due_date: "2026-12-01" }])],
    ),
    /percentuais/,
  );
  assert.equal((await one<{ n: number }>(`select count(*)::int n from projects`)).n, 0, "nada gravado nas falhas");

  const r = await one<{ id: string }>(
    `select create_project($1,'Assessoria CRC','2026-11-01',10000,'2026-11-01',null,'obs',$2::jsonb) as id`,
    [
      clientId,
      JSON.stringify([
        { label: "Sinal", percent: 50, amount: 5000, due_date: "2026-11-01" },
        { label: "2ª parcela", percent: 25, amount: 2500, due_date: "2026-12-01" },
        { label: "3ª parcela", percent: 25, amount: 2500, due_date: "2026-12-31" },
      ]),
    ],
  );
  projectId = r.id;
  const sum = await one<{ s: string; n: number }>(`select sum(amount)::text s, count(*)::int n from installments where project_id = $1`, [projectId]);
  assert.equal(sum.s, "10000.00");
  assert.equal(sum.n, 3);
});

test("pagamentos: parcial, total, excesso e data futura", async () => {
  await asUser(USER_A);
  const inst = await db.query<{ id: string; number: number }>(`select id, number from installments where project_id = $1 order by number`, [projectId]);
  const [i1, i2] = inst.rows;

  await assert.rejects(db.query(`select register_payment($1, 6000, current_date, null)`, [i1.id]), /excede o saldo/);
  await assert.rejects(db.query(`select register_payment($1, 100, current_date + 5, null)`, [i1.id]), /futura/);
  await assert.rejects(db.query(`select register_payment($1, 0, current_date, null)`, [i1.id]));

  await db.query(`select register_payment($1, 2000, '2026-10-30', 'parcial')`, [i1.id]);
  let s = await one<{ status: string; paid_amount: string; balance: string }>(
    `select status, paid_amount::text, balance::text from installments_view where id = $1`, [i1.id]);
  assert.deepEqual(s, { status: "parcial", paid_amount: "2000.00", balance: "3000.00" });

  await db.query(`select register_payment($1, 3000, '2026-10-30', null)`, [i1.id]);
  s = await one(`select status, paid_amount::text, balance::text from installments_view where id = $1`, [i1.id]);
  assert.deepEqual(s, { status: "pago", paid_amount: "5000.00", balance: "0.00" });

  const pv = await one<{ total_received: string; total_pending: string; schedule_diff: string }>(
    `select total_received::text, total_pending::text, schedule_diff::text from projects_view where id = $1`, [projectId]);
  assert.deepEqual(pv, { total_received: "5000.00", total_pending: "5000.00", schedule_diff: "0.00" });

  // parcela paga não pode ser apagada (histórico preservado)
  await assert.rejects(db.query(`delete from installments where id = $1`, [i1.id]), /foreign key/);
  // parcela futura sem pagamento continua "a vencer" / não conta como recebida
  s = await one(`select status, paid_amount::text, balance::text from installments_view where id = $1`, [i2.id]);
  assert.equal(s.paid_amount, "0.00");
});

test("status dinâmico por data: a_vencer, vence_hoje, atrasado, cancelado", async () => {
  await asUser(USER_A);
  const pid = (await one<{ id: string }>(
    `select create_project($1,'Treinamento', current_date, 400, current_date - 5, null, null, $2::jsonb) as id`,
    [clientId, JSON.stringify([
      { label: "p1", percent: 25, amount: 100, due_date: new Date(Date.now() - 864e5 * 3).toISOString().slice(0, 10) },
      { label: "p2", percent: 25, amount: 100, due_date: new Date(Date.now() + 864e5 * 3).toISOString().slice(0, 10) },
      { label: "p3", percent: 25, amount: 100, due_date: new Date(Date.now() + 864e5 * 9).toISOString().slice(0, 10) },
      { label: "p4", percent: 25, amount: 100, due_date: "2026-01-01" },
    ])]
  )).id;
  await db.query(`update installments set due_date = brazil_today() where project_id = $1 and label = 'p3'`, [pid]);
  await db.query(`update installments set due_date = brazil_today() - 3 where project_id = $1 and label = 'p1'`, [pid]);
  await db.query(`update installments set due_date = brazil_today() + 3 where project_id = $1 and label = 'p2'`, [pid]);
  await db.query(`update installments set canceled_at = now() where project_id = $1 and label = 'p4'`, [pid]);
  const rows = await db.query<{ label: string; status: string }>(`select label, status from installments_view where project_id = $1 order by label`, [pid]);
  assert.deepEqual(Object.fromEntries(rows.rows.map((r) => [r.label, r.status])), {
    p1: "atrasado", p2: "a_vencer", p3: "vence_hoje", p4: "cancelado",
  });
  const pv = await one<{ total_overdue: string; total_pending: string }>(`select total_overdue::text, total_pending::text from projects_view where id = $1`, [pid]);
  assert.deepEqual(pv, { total_overdue: "100.00", total_pending: "300.00" });
});

test("replace_pending_installments: preserva pagas e fecha o novo total", async () => {
  await asUser(USER_A);
  // projeto original: 10.000 (1ª parcela 5.000 já paga). Novo valor: 12.000
  await assert.rejects(
    db.query(`select replace_pending_installments($1, 12000, $2::jsonb)`, [projectId, JSON.stringify([{ label: "x", percent: 10, amount: 1000, due_date: "2026-12-01" }])]),
    /não fecham/,
  );
  await db.query(`select replace_pending_installments($1, 12000, $2::jsonb)`, [
    projectId,
    JSON.stringify([
      { label: "2ª parcela", percent: 35, amount: 4200, due_date: "2026-12-01" },
      { label: "3ª parcela", percent: 25, amount: 2800, due_date: "2027-01-01" },
    ]),
  ]);
  const rows = await db.query<{ number: number; amount: string; status: string }>(
    `select number, amount::text, status from installments_view where project_id = $1 order by number`, [projectId]);
  assert.equal(rows.rows.length, 3);
  assert.equal(rows.rows[0].status, "pago");
  assert.equal(rows.rows[0].amount, "5000.00");
  const pv = await one<{ total_value: string; schedule_diff: string }>(`select total_value::text, schedule_diff::text from projects_view where id = $1`, [projectId]);
  assert.deepEqual(pv, { total_value: "12000.00", schedule_diff: "0.00" });
});

test("histórico: auditoria registra alterações; usuário comum não grava auditoria", async () => {
  await asUser(USER_A);
  const n = await one<{ n: number }>(`select count(*)::int n from audit_log where table_name in ('payments','installments','projects')`);
  assert.ok(n.n >= 5);
  await assert.rejects(db.query(`insert into audit_log (table_name, action) values ('x','y')`));
});

test("dados de demonstração: carregam e removem sem afetar dados reais", async () => {
  await asUser(USER_A);
  await db.query(`select load_demo_data()`);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from clients where is_demo`)).n, 3);
  await db.query(`select remove_demo_data()`);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from clients where is_demo`)).n, 0);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from clients where cnpj = '11222333000181'`)).n, 1);
});
