export interface Transaction {
  amount: string;
  type: "income" | "expense";
  category?: string;
  date?: string;
  startMonth?: string; // "YYYY-MM"
}


export function predictFutureSpending(
  transactions: Transaction[]
) {

  // Filter only expenses
  const expenses = transactions.filter(
    (item) => item.type === "expense"
  );


  // No data available
  if (expenses.length === 0) {
    return {
      prediction: 0,
      message:
        "Not enough spending data available"
    };
  }


  // Calculate total expense

  const totalExpense = expenses.reduce(
    (sum, item) =>
      sum + Number(item.amount),
    0
  );


  // Estimate how many months the data actually spans, using startMonth
  // ("YYYY-MM"). Falls back to 1 month when it's missing so the average
  // degrades to "total spent so far" instead of dividing by zero.

  const monthKeys = expenses
    .map((item) => item.startMonth)
    .filter((m): m is string => !!m && /^\d{4}-\d{2}$/.test(m));

  const toMonthIndex = (m: string) => {
    const [year, month] = m.split('-').map(Number);
    return year * 12 + month;
  };

  const monthsSpanned = monthKeys.length > 0
    ? Math.max(...monthKeys.map(toMonthIndex)) - Math.min(...monthKeys.map(toMonthIndex)) + 1
    : 1;


  // Average spending per month, based on the actual time span of the data
  // (previously this averaged per-transaction and multiplied by 30, which
  // overstated or understated spending depending on transaction count).

  const averageMonthlySpending =
    totalExpense / monthsSpanned;



  return {

    prediction:
      Number(averageMonthlySpending.toFixed(2)),


    message:
      `Estimated future spending is RM ${averageMonthlySpending.toFixed(2)} based on your average monthly spending over the last ${monthsSpanned} month${monthsSpanned > 1 ? 's' : ''}.`
  };

}
