# FinancePro Changes

## Important: Expo Go compatibility

**Expo Go version used for this project: 57.0.0**

The project uses Expo SDK 57 (`expo` `^57.0.20`), Expo Router `~57.0.19`, and React Native `0.86.3`. The Expo Go app on the phone must support SDK 57. Do not update the project dependencies immediately before the presentation unless the whole app is retested.

## If Expo Go fails to run

1. Make sure the phone and computer are on the same Wi-Fi network, then start the project:

   ```powershell
   npm.cmd start
   ```

2. If the QR code cannot connect, use a tunnel:

   ```powershell
   npx expo start --tunnel
   ```

3. If Metro has stale cache, stop the server with `Ctrl+C` and restart with:

   ```powershell
   npx expo start -c
   ```

4. If port 8081 or 8082 is occupied, stop the existing Node/Expo process or choose another port:

   ```powershell
   npx expo start --port 8082
   ```

   On PowerShell, use `npm.cmd` instead of `npm` if the execution-policy error says that `npm.ps1` is not digitally signed.

5. Confirm that `.env` exists and contains the Firebase variables listed in `.env.example`. `EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK` must be a boolean such as `true`, not `1n`.

6. If the installed Expo Go app does not support SDK 57, use the web fallback or an emulator for the presentation:

   ```powershell
   npm.cmd run web
   npm.cmd run android
   ```

   Upgrading Expo should be treated as a separate migration and tested on every screen; it is not a last-minute troubleshooting step.

## Development commands

```powershell
npm.cmd start                 # Expo development server with QR code
npm.cmd run web               # Run the web target
npm.cmd run android           # Open Android emulator/device
npm.cmd run ios               # Open iOS simulator (macOS only)
npm.cmd run typecheck         # TypeScript check
npm.cmd run lint              # Expo ESLint check
npm.cmd test                  # Analytics and validation tests
```

Expo automatically hot reloads JavaScript/TypeScript edits while the development server is running. If the screen does not update, press `r` in the Expo terminal or reload the Expo Go app. A full cache reset is available with `npx expo start -c`.

## Features and UI changes

- Added an Insights tab with spending snapshot, category allocation, daily/weekly trends, monthly/yearly trends, and a paid/unpaid filter.
- Added shared analytics calculations for recurring entries, loans, categories, dates, and malformed amounts.
- Added a compact spending preview to the Home screen.
- Added development-only demo data seeding for a signed-in test account.
- Fixed the web chart fallback and Expo/React Native compatibility issues.

## Reliability and data-safety changes

- Added transaction validation for descriptions, amounts, dates, recurring days, categories, and loan limits.
- Added inline save errors, disabled save buttons while writing, and duplicate-submit protection.
- Added busy guards for delete and paid/unpaid updates.
- Normalized invalid legacy amounts and dates so calculations do not become `NaN`.
- Preserved an edited transaction's original date and start month.
- Stored monthly budgets under the signed-in Firebase user's ID instead of one global local-storage key.
- Added visible Edit/Delete controls and accessibility labels for transaction controls and forms.
- Made the transaction listener respond to Firebase auth changes so one account's data is not retained after switching accounts.

## Verification

The current codebase passes:

- TypeScript: `npm.cmd run typecheck`
- Lint: `npm.cmd run lint` (0 errors, 0 warnings)
- Tests: `npm.cmd test` (10/10 passing)
- Local Expo web bundle on port 8082: HTTP 200

