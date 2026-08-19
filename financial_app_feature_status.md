# Financial Application – Feature Status

## ✅ Done

| Function | Notes |
|---|---|
| Login/Register | Firebase Authentication (`app/login.tsx`, `app/register.tsx`, `services/authService.ts`) |
| User-specific data | Transactions stored under `users/{uid}/transactions` in Firestore |
| Income & expense tracking | Add/edit/delete, long-press to edit or delete |
| Financial summary | Income, expense, balance shown on dashboard |
| Calendar view | Monthly calendar with color-coded transaction markers |
| Backup/Restore | Share/export as JSON; restore re-imports into Firestore |
| Category system | Food, Transport, Bills, Shopping, Entertainment, Health, Education, Salary, Other — tagged per transaction |
| Budget setting | Monthly budget input, persisted locally (AsyncStorage) |
| Budget monitoring | Animated budget bar (spend vs. budget), color-coded by usage |
| Smart alerts | Push notification when projected spending crosses the budget (fires once per crossing, not per transaction) |
| Spending prediction | Average-monthly-spend forecast (`services/aiService.ts`), now visible on-screen via the **Spending Forecast** card + detail modal, not just a background notification |
| Loan tracking | Loan balance, repayment schedule, remaining-balance math; duration can be entered in months or years (auto-converts) |

## 🟡 Partial / Known limitations

| Function | What's missing |
|---|---|
| Long-press item menu (Edit/Delete/Cancel) | Uses `Alert.alert`'s 3-button menu, which only works on native (iOS/Android) — no working equivalent on web yet |
| Explore tab | Still the default Expo Router template content, not app-specific |
| Category-based budgets | Categories are tracked per transaction, but there's no per-category budget or spend breakdown yet (single overall monthly budget only) |

## ❌ Missing

Nothing outstanding from the original feature list — everything below has been implemented since the list was first written:
- ~~Login/Register~~
- ~~User-specific data~~
- ~~Budget setting~~
- ~~Budget monitoring~~
- ~~Smart alerts~~
- ~~Spending prediction~~
- ~~Category system~~
