# Design

## Which session is the previous one

The day change compares with the line's previous trading session: its last corrected peso bar before the latest State's session. That is the close a reader saw on their broker the day before. The previous session is chosen without looking at rates, so a session without a MEP or CCL Rate is not skipped to find one: its change in that currency is `null` instead. Skipping it would compare across two days and call it a day change.

This differs from the period returns, which count windows over the sessions of the Dollarized Series so that all three currencies share their endpoints. A return compares with a date; a day change compares with the previous close the reader saw.

## Each previous close at its own rate

The previous close in MEP or CCL dollars is the previous peso close divided by the previous session's own rate. Converting it with the latest session's rate would leave the rate's move out, and the dollar change would equal the peso change: the plausible wrong version the tests reject, along with carrying an earlier session's rate into a session that has none.

## Shape

`latestClose` is one block with a part per currency, `{ close, previousClose, change, percentChange }`, so the page reads every figure and computes nothing. Its peso close repeats `pesoEquivalents.close` and its CCL close `cclEquivalents.close`; the block stays whole so each part reads the same way.

## Wording

Lean's calls: no label and no "en el día", since the close sits under the line's name and data date and the design slice will color the change green or red; and `$` for pesos and `U$S` for MEP and CCL dollars, as Argentines write them, where the page wrote `pesos` and `US$`. The `$` applies to every peso amount on the page. The word "pesos" stays only in sentences that name the currency: the currency note and the returns' unit.

| View | With a change                  | Without one |
| ---- | ------------------------------ | ----------- |
| ARS  | $ 5.940 (+$ 60, +1,0 %)        | $ 5.940     |
| USD  | U$S 4,00 (+U$S 0,04, +1,0 %)   | U$S 4,00    |
| CCL  | U$S 3,81 (−U$S 0,0105, −0,3 %) | U$S 3,81    |

A peso change takes the decimals its close is written with: whole on a close of a thousand or more, two decimals below. A dollar change is written as a dollar price, so one under a dollar keeps three significant digits. The sign goes before the currency, and a change that rounds to zero has none.
