## Why

Observatory needs reliable daily market history before it can explain what is happening in the market. This change gives it a safe way to collect, check, store, and read that history after each market session closes. Each configured market, currency, or settlement variant keeps its own facts, but Bar History does not decide which history should feed technical analysis.

## What Changes

- Store each completed session's opening price, highest price, lowest price, closing price, and trading volume.
- Keep separate histories for each configured market, currency, or settlement variant of an asset. Observatory calls each variant a **Trading Line**.
- Load all available history when a Trading Line is added, then incorporate newly completed sessions.
- Periodically compare stored history with the source so legitimate corrections can be detected.
- Reject invalid or suspicious updates without silently damaging the previously stored history.
- Report missing or failed histories explicitly instead of hiding them.
- Store the histories as private JSON files in Railway.
- Initially obtain BYMA history from Open BYMADATA.
- Keep the original market prices. Dividend-adjusted prices and corporate actions will be handled separately in the future.
- Leave the choice of analysis history to consuming capabilities. In the first version, Argentine stocks use their own BYMA history while CEDEAR technical analysis uses the foreign Underlying Instrument's history.

## Capabilities

### New Capabilities

- `bar-history`: Maintains reliable daily BYMA market history for configured Trading Lines.

### Modified Capabilities

None.

## Impact

- Adds Observatory's first stored market-data capability.
- Gives future consumers one consistent place to obtain daily market history without deciding which history represents an Instrument for analysis.
- Depends on the instrument catalog to describe which assets and trading variants Observatory follows.
- Does not add analysis, level translation, current-price selection, charts, scheduling, or browser-side market-data fetching.
- Does not choose or adapt the provider for foreign Underlying Instrument history.
