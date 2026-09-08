export interface AnalyticsTransaction {
  id: string;
  type: 'income' | 'expense';
  detail: string;
  amount: string;
  date: string;
  startMonth?: string;
  isLoan?: boolean;
  totalLoanAmount?: string;
  monthsLeft?: string;
  isRepeated?: boolean;
  repeatDay?: string;
  paidMonths?: string[];
  category?: string;
}

export const money = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const parseAmount = (value: unknown) => {
  const amount = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};
export const amountOf = (item: AnalyticsTransaction) => {
  return parseAmount(item.amount);
};
export const normalizeDay = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const day = Number(text);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
};
export const localMonth = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
export const validMonth = (value?: string): value is string => !!value && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);
export const monthTitle = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
export const shiftMonth = (month: string, offset: number) => {
  const [year, number] = month.split('-').map(Number);
  return localMonth(new Date(year, number - 1 + offset, 1));
};

// Shared with Home: a recurring item represents one occurrence per active month.
export function transactionsForMonth<T extends AnalyticsTransaction>(items: T[], month: string): T[] {
  return items.filter(item => {
    if (item.startMonth && item.startMonth > month) return false;
    if (item.isLoan) {
      const balance = parseAmount(item.totalLoanAmount) - amountOf(item) * (item.paidMonths?.length || 0);
      if (balance <= 0.1) return !!item.paidMonths?.includes(month);
      if (validMonth(item.startMonth) && Number(item.monthsLeft) > 0) {
        const [sy, sm] = item.startMonth.split('-').map(Number);
        const [y, m] = month.split('-').map(Number);
        if ((y - sy) * 12 + m - sm >= Number(item.monthsLeft)) return !!item.paidMonths?.includes(month);
      }
      return true;
    }
    if (item.isRepeated) return true;
    return item.startMonth === month;
  });
}

export type ExpenseMode = 'all' | 'paid';
export interface Occurrence { key: string; item: AnalyticsTransaction; month: string; day: number | null; amount: number; paid: boolean }
export function occurrences(items: AnalyticsTransaction[], month: string, mode: ExpenseMode = 'all'): Occurrence[] {
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  return transactionsForMonth(items, month)
    .filter(item => item.type === 'expense' && (mode === 'all' || item.paidMonths?.includes(month)))
    .map(item => {
      const rawDay = normalizeDay((item.isLoan || item.isRepeated) && item.repeatDay ? item.repeatDay : item.date?.split('-')[0]);
      return { key: `${item.id}:${month}`, item, month, amount: amountOf(item), paid: !!item.paidMonths?.includes(month),
        day: rawDay === null ? null : Math.min(rawDay, lastDay) };
    });
}
export const sumOccurrences = (rows: Occurrence[]) => rows.reduce((sum, row) => sum + row.amount, 0);
const categoryInfo: Record<string, [string, string]> = {
  food: ['Food', '#2563EB'], transport: ['Transport', '#7C3AED'], bills: ['Bills', '#0891B2'],
  shopping: ['Shopping', '#DB2777'], entertainment: ['Entertainment', '#D97706'], health: ['Health', '#059669'],
  education: ['Education', '#4F46E5'], salary: ['Salary', '#15803D'], other: ['Other', '#64748B'],
};
export const categoryOf = (key?: string) => categoryInfo[key || 'other'] ? key || 'other' : 'other';
export function categoryTotals(rows: Occurrence[]) {
  const grouped = new Map<string, Occurrence[]>();
  rows.forEach(row => { const key = categoryOf(row.item.category); grouped.set(key, [...(grouped.get(key) || []), row]); });
  return [...grouped].map(([key, entries]) => ({ key, label: categoryInfo[key][0], color: categoryInfo[key][1], value: sumOccurrences(entries), rows: entries }))
    .filter(group => group.value > 0).sort((a, b) => b.value - a.value);
}
export type Granularity = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
export interface Bucket { key: string; label: string; value: number; rows: Occurrence[] }
export function trendBuckets(items: AnalyticsTransaction[], month: string, mode: ExpenseMode, granularity: Granularity): Bucket[] {
  const year = Number(month.slice(0, 4));
  const days = new Date(year, Number(month.slice(5)), 0).getDate();
  const rows = occurrences(items, month, mode);
  const bucket = (key: string, label: string, entries: Occurrence[]) => ({ key, label, rows: entries, value: sumOccurrences(entries) });
  if (granularity === 'Daily') return Array.from({ length: days }, (_, i) => bucket(String(i + 1), String(i + 1), rows.filter(row => row.day === i + 1)));
  // Deliberately month-contained weeks, with date ranges visible in the UI.
  if (granularity === 'Weekly') return Array.from({ length: Math.ceil(days / 7) }, (_, i) => bucket(String(i), `${i * 7 + 1}–${Math.min(i * 7 + 7, days)}`, rows.filter(row => row.day !== null && row.day > i * 7 && row.day <= i * 7 + 7)));
  const monthsForYear = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  if (granularity === 'Monthly') return monthsForYear(year).map(m => bucket(m, new Date(`${m}-01T12:00:00`).toLocaleDateString('en-MY', { month: 'short' }), occurrences(items, m, mode)));
  return Array.from({ length: 5 }, (_, i) => year - 4 + i).map(y => bucket(String(y), String(y), monthsForYear(y).flatMap(m => occurrences(items, m, mode))));
}
