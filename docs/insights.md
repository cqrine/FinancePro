# Insights

The bottom navigation contains Home and Insights (the existing `/explore` route).
Home keeps its budget progress and transaction controls, with a compact spending
preview linking to Insights for the selected month.

Insights includes:

- Overview: monthly totals, a category doughnut (top four plus remaining categories), and income versus expenses.
- Trends: daily, month-contained weekly groups, monthly, and five-year annual charts. Tap bars for their entries.
- Categories: descending category totals and transaction drill-downs.
- All expenses / Marked paid filters, period navigation, loading, error/retry, and empty states.

## Calculation rules

`services/analytics.ts` supplies Home and Insights with the same monthly selection.
One-off entries use `startMonth`. Recurring entries appear once per active month.
Loan selection respects the existing duration, remaining balance, and paid-month rules.
All expenses includes unpaid and scheduled amounts; Marked paid checks `paidMonths`
for each occurrence. Income is the scheduled monthly income in either mode.

Daily charts use the entry day or recurring due day, not a payment timestamp.
Days 29–31 are clamped to the last day of a shorter month. Missing days remain in
monthly/category totals but are excluded from daily/weekly charts with a notice.
Weeks are explicitly labeled day ranges: 1–7, 8–14, 15–21, 22–28, and remaining days.
Monthly charts cover January–December; yearly charts cover five complete years.
All-expense trends include scheduled future occurrences. Averages include zero periods.

Historical trends are reconstructed from current records, not an immutable payment
ledger. Editing/deleting a recurring record changes its history. Legacy recurring
records without a start month follow the existing Home behavior and can appear in
every month. Precise historical cash-flow reporting needs dated payment records.

## Development

```sh
npm start
npm test
npm run typecheck
npm run lint
```

In development mode, sign in to the test account, open Home’s menu, and choose
**Data Manager → Load Demo Data**. This adds 38 entries across the last 12 months
(salary, recurring bills, a loan, paid/unpaid entries, and several categories).
The action is shown only when `__DEV__` is true and refuses to duplicate a set
whose details begin with `Demo ·`. Use the existing **Reset All Data** action to
remove it only if the account contains disposable test data.

The calculation tests run locally without Firebase access. Charts use React Native
views and SVG paths/circles, with labels outside SVG to avoid the prior web
`transform-origin` error. No new dependencies or Firestore writes are required.
