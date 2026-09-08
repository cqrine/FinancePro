const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// Compile the pure calculation module in memory; no native runtime or backend needed.
const source = fs.readFileSync(path.join(__dirname, '../services/analytics.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exportsForTest = {};
new Function('exports', compiled.outputText)(exportsForTest);
const { transactionsForMonth, occurrences, sumOccurrences, trendBuckets, categoryTotals, amountOf, normalizeDay, parseAmount, shiftMonth } = exportsForTest;
const validationSource = fs.readFileSync(path.join(__dirname, '../services/transactionValidation.ts'), 'utf8');
const validationCompiled = ts.transpileModule(validationSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const validationExports = {};
new Function('exports', 'require', validationCompiled.outputText)(validationExports, (moduleName) => moduleName === './analytics' ? exportsForTest : require(moduleName));
const { validateTransactionDraft } = validationExports;
const entry = (id, values = {}) => ({ id, type: 'expense', detail: id, amount: '100', date: '05-Sep', startMonth: '2026-09', ...values });

test('one-off entries stay in their year and month; recurring entries start once', () => {
  const items = [entry('one'), entry('repeat', { isRepeated: true }), entry('future', { startMonth: '2026-11' })];
  assert.deepEqual(transactionsForMonth(items, '2026-08'), []);
  assert.deepEqual(transactionsForMonth(items, '2026-09').map(x => x.id), ['one', 'repeat']);
  assert.deepEqual(transactionsForMonth(items, '2027-09').map(x => x.id), ['repeat']);
});
test('daily and weekly buckets reconcile with monthly totals including leap-day recurrence', () => {
  const items = [entry('rent', { isRepeated: true, startMonth: '2024-01', repeatDay: '31' }), entry('food', { startMonth: '2024-02', date: '08-Feb', amount: '25' })];
  const daily = trendBuckets(items, '2024-02', 'all', 'Daily');
  assert.equal(daily.length, 29);
  assert.equal(daily[28].value, 100);
  const weekly = trendBuckets(items, '2024-02', 'all', 'Weekly');
  assert.equal(weekly[1].value, 25);
  assert.equal(weekly[4].label, '29–29');
  for (const buckets of [daily, weekly]) assert.equal(buckets.reduce((s, b) => s + b.value, 0), 125);
});
test('paid filter checks the occurrence month, not whether an item was ever paid', () => {
  const items = [entry('bill', { isRepeated: true, paidMonths: ['2026-09'] }), entry('unpaid'), entry('income', { type: 'income' })];
  assert.equal(sumOccurrences(occurrences(items, '2026-09', 'paid')), 100);
  assert.equal(sumOccurrences(occurrences(items, '2026-10', 'paid')), 0);
});
test('loan duration and settled historical payments follow the Home rules', () => {
  const loan = entry('loan', { isLoan: true, totalLoanAmount: '200', monthsLeft: '2', paidMonths: ['2026-09', '2026-10'] });
  assert.equal(transactionsForMonth([loan], '2026-09').length, 1);
  assert.equal(transactionsForMonth([loan], '2026-11').length, 0);
  assert.equal(transactionsForMonth([{ ...loan, paidMonths: [] }], '2026-11').length, 0);
});
test('missing dates remain in monthly/category totals but not daily buckets', () => {
  const items = [entry('missing', { date: '' })];
  const rows = occurrences(items, '2026-09');
  assert.equal(rows[0].day, null);
  assert.equal(sumOccurrences(rows), 100);
  assert.equal(categoryTotals(rows)[0].value, 100);
  assert.equal(trendBuckets(items, '2026-09', 'all', 'Daily').reduce((s, b) => s + b.value, 0), 0);
});
test('category sorting, unknown categories, and malformed amounts are safe', () => {
  const rows = occurrences([entry('food', { category: 'food', amount: '200' }), entry('unknown', { category: 'legacy' }), entry('bad', { amount: 'oops' })], '2026-09');
  assert.deepEqual(categoryTotals(rows).map(g => [g.label, g.value]), [['Food', 200], ['Other', 100]]);
  assert.equal(amountOf(entry('negative', { amount: '-20' })), 0);
});
test('monthly and yearly trends expand recurring occurrences exactly once', () => {
  const items = [entry('bill', { isRepeated: true, startMonth: '2026-11' })];
  const months = trendBuckets(items, '2026-12', 'all', 'Monthly');
  assert.equal(months.reduce((s, b) => s + b.value, 0), 200);
  const years = trendBuckets(items, '2026-12', 'all', 'Yearly');
  assert.deepEqual(years.map(b => b.value), [0, 0, 0, 0, 200]);
  assert.equal(new Set(months.flatMap(b => b.rows.map(r => r.key))).size, 2);
});
test('empty charts and month navigation across years', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(trendBuckets([], '2026-09', 'all', 'Monthly').length, 12);
  assert.deepEqual(categoryTotals([]), []);
});
test('input normalization rejects malformed days and amounts', () => {
  assert.equal(normalizeDay('05'), 5);
  assert.equal(normalizeDay('5abc'), null);
  assert.equal(normalizeDay('32'), null);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('-1'), 0);
  assert.equal(parseAmount('not-a-number'), 0);
});
test('transaction validation blocks incomplete and inconsistent drafts', () => {
  const valid = { type: 'expense', detail: 'Groceries', amount: '45.50', date: '9-Sep', startMonth: '2026-09', isLoan: false, isRepeated: false, totalLoanAmount: '', monthsLeft: '', repeatDay: '', category: 'food' };
  assert.equal(validateTransactionDraft(valid), null);
  assert.match(validateTransactionDraft({ ...valid, amount: '45.999' }), /up to two decimal places/);
  assert.match(validateTransactionDraft({ ...valid, detail: ' ' }), /description/);
  assert.match(validateTransactionDraft({ ...valid, isRepeated: true, repeatDay: '' }), /recurring day/);
  assert.match(validateTransactionDraft({ ...valid, isLoan: true, totalLoanAmount: '100', monthsLeft: '2', repeatDay: '1', amount: '150' }), /cannot exceed/);
});
