import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSchedule, validateSchedule, applyPercents, splitCents } from "../src/lib/installments";
import { addDaysISO, formatBRL, formatDate, isValidCNPJ, parseMoney, monthsBetween } from "../src/lib/format";

const COND_50_25_25 = [
  { label: "Sinal", percent: 50, offset_days: 0 },
  { label: "2ª parcela", percent: 25, offset_days: 30 },
  { label: "3ª parcela", percent: 25, offset_days: 60 },
];

test("exemplo do briefing: R$ 10.000, sinal 01/11/2026, 50% + 30 + 60 dias", () => {
  const rows = generateSchedule(10000, "2026-11-01", COND_50_25_25);
  assert.deepEqual(
    rows.map((r) => [r.percent, r.amount, r.due_date]),
    [
      [50, 5000, "2026-11-01"],
      [25, 2500, "2026-12-01"],
      [25, 2500, "2026-12-31"],
    ],
  );
  assert.equal(validateSchedule(10000, rows).ok, true);
});

test("a soma das parcelas fecha exatamente o valor, mesmo com dízima", () => {
  const items = [
    { label: "A", percent: 33.3333, offset_days: 0 },
    { label: "B", percent: 33.3333, offset_days: 30 },
    { label: "C", percent: 33.3334, offset_days: 60 },
  ];
  for (const total of [100.01, 1000, 9999.99, 0.1, 12345.67]) {
    const rows = generateSchedule(total, "2026-01-31", items);
    const cents = rows.reduce((s, r) => s + Math.round(r.amount * 100), 0);
    assert.equal(cents, Math.round(total * 100), `total ${total}`);
  }
});

test("splitCents não perde centavos", () => {
  assert.deepEqual(splitCents(10001, [50, 50]).reduce((a, b) => a + b, 0), 10001);
  assert.deepEqual(splitCents(1, [50, 50]).reduce((a, b) => a + b, 0), 1);
});

test("validação acusa percentuais que não somam 100% e valores divergentes", () => {
  const rows = generateSchedule(10000, "2026-11-01", COND_50_25_25);
  rows[1].percent = 30; // 105%
  const check = validateSchedule(10000, rows);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => e.includes("100%")));

  const adjusted = applyPercents(10000, [
    { ...rows[0], percent: 60 },
    { ...rows[1], percent: 20 },
    { ...rows[2], percent: 20 },
  ]);
  assert.deepEqual(adjusted.map((r) => r.amount), [6000, 2000, 2000]);
  assert.equal(validateSchedule(10000, adjusted).ok, true);

  rows[0].amount = 1;
  rows[1].percent = 25;
  assert.equal(validateSchedule(10000, rows).ok, false);
});

test("datas: soma de dias sem efeito de fuso e formato brasileiro", () => {
  assert.equal(addDaysISO("2026-11-01", 30), "2026-12-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2028-02-28", 1), "2028-02-29");
  assert.equal(formatDate("2026-11-01"), "01/11/2026");
  assert.deepEqual(monthsBetween("2026-10-15", "2027-01-02"), ["2026-10", "2026-11", "2026-12", "2027-01"]);
});

test("moeda brasileira e parsing", () => {
  assert.match(formatBRL(1234.5).replace(/\s/g, " "), /^R\$ 1\.234,50$/);
  assert.equal(parseMoney("1.234,56"), 1234.56);
  assert.equal(parseMoney("R$ 10.000,00"), 10000);
  assert.equal(parseMoney("1234.56"), 1234.56);
  assert.ok(Number.isNaN(parseMoney("")));
});

test("CNPJ: dígito verificador", () => {
  assert.equal(isValidCNPJ("11.222.333/0001-81"), true);
  assert.equal(isValidCNPJ("11.222.333/0001-82"), false);
  assert.equal(isValidCNPJ("00000000000000"), false);
});
