import { normalizeDay, parseAmount, validMonth, type AnalyticsTransaction } from './analytics';

export type TransactionDraft = Pick<AnalyticsTransaction, 'type' | 'detail' | 'amount' | 'date' | 'startMonth' | 'isLoan' | 'isRepeated' | 'totalLoanAmount' | 'monthsLeft' | 'repeatDay' | 'category'>;

export function validateTransactionDraft(draft: TransactionDraft): string | null {
  const detail = draft.detail.trim();
  if (!detail) return 'Add a description for this entry.';
  if (detail.length > 100) return 'Description must be 100 characters or fewer.';
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(draft.amount.trim())) return 'Amount must be a positive number with up to two decimal places.';
  const amount = parseAmount(draft.amount);
  if (amount <= 0) return 'Amount must be greater than RM 0.00.';
  if (amount > 100000000) return 'Amount is too large.';
  if (draft.type !== 'income' && draft.type !== 'expense') return 'Choose income or expense.';
  if (!validMonth(draft.startMonth)) return 'The entry month is invalid.';

  if (draft.isLoan && draft.type !== 'expense') return 'Loans must be recorded as expenses.';
  if (draft.isRepeated || draft.isLoan) {
    if (normalizeDay(draft.repeatDay) === null) return 'Choose a recurring day from 1 to 31.';
  } else if (normalizeDay(draft.date.split('-')[0]) === null) {
    return 'Choose a date for this entry.';
  }

  if (draft.isLoan) {
    const total = parseAmount(draft.totalLoanAmount);
    const months = Number(draft.monthsLeft);
    if (total <= 0) return 'Enter a total loan value greater than RM 0.00.';
    if (total > 100000000) return 'Total loan value is too large.';
    if (!Number.isInteger(months) || months < 1 || months > 600) return 'Loan duration must be between 1 and 600 months.';
    if (amount > total) return 'Monthly payment cannot exceed the total loan value.';
  }
  if (draft.category && draft.category.length > 40) return 'Category is invalid.';
  return null;
}
