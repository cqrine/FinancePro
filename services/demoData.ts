import type { AnalyticsTransaction } from './analytics';
import { localMonth, shiftMonth } from './analytics';
import { addTransaction } from './transactionService';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateFor = (month: string, day: number) => `${String(day).padStart(2, '0')}-${MONTH_NAMES[Number(month.slice(5)) - 1]}`;
const monthsBack = (count: number) => Array.from({ length: count }, (_, index) => shiftMonth(localMonth(), -index));

/**
 * Creates a repeatable demo dataset for the currently authenticated user.
 * The caller owns the duplicate guard so this service remains usable from tests
 * and other development tooling without querying the account first.
 */
export async function seedDemoData(uid: string) {
  const months = monthsBack(12).reverse();
  const current = localMonth();
  const paidThroughLastMonth = months.filter(month => month !== current);
  const demo: Omit<AnalyticsTransaction, 'id'>[] = [
    { type: 'income', detail: 'Demo · Salary', amount: '5500', date: dateFor(months[0], 1), startMonth: months[0], isLoan: false, isRepeated: true, repeatDay: '01', paidMonths: paidThroughLastMonth, category: 'salary' },
    { type: 'expense', detail: 'Demo · Rent', amount: '1500', date: dateFor(months[0], 5), startMonth: months[0], isLoan: false, isRepeated: true, repeatDay: '05', paidMonths: paidThroughLastMonth, category: 'bills' },
    { type: 'expense', detail: 'Demo · Car loan', amount: '500', date: dateFor(months[0], 15), startMonth: months[0], isLoan: true, totalLoanAmount: '6000', monthsLeft: '12', isRepeated: false, repeatDay: '15', paidMonths: paidThroughLastMonth, category: 'transport' },
    { type: 'expense', detail: 'Demo · Internet', amount: '129', date: dateFor(months[0], 20), startMonth: months[0], isLoan: false, isRepeated: true, repeatDay: '20', paidMonths: months.slice(0, -2), category: 'bills' },
  ];

  months.forEach((month, index) => {
    const paid = month !== current;
    const add = (detail: string, amount: number, day: number, category: string) => demo.push({ type: 'expense', detail: `Demo · ${detail}`, amount: String(amount), date: dateFor(month, day), startMonth: month, isLoan: false, isRepeated: false, paidMonths: paid ? [month] : [], category });
    add('Groceries', 180 + index * 8, 7, 'food');
    add('Fuel', 70 + (index % 3) * 15, 12, 'transport');
    if (index % 2 === 0) add('Shopping', 120 + index * 6, 18, 'shopping');
    if (index % 3 === 0) add('Movie night', 55 + index * 3, 24, 'entertainment');
  });

  await Promise.all(demo.map(data => addTransaction(uid, data)));
  return demo.length;
}
