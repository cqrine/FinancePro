export interface Transaction {
  amount: string;
  type: "income" | "expense";
  category?: string;
  date?: string;
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


  // Calculate average spending

  const averageSpending =
    totalExpense / expenses.length;



  // Estimate next month spending

  const predictedAmount =
    averageSpending * 30;



  return {

    prediction:
      Number(predictedAmount.toFixed(2)),


    message:
      `Estimated future spending is RM ${predictedAmount.toFixed(2)} based on previous spending behaviour.`
  };

}