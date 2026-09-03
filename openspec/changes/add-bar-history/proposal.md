## Why

Observatory needs reliable daily market history before it can explain what is happening in the market. This change gives it a safe way to collect, check, store, and read that history after each market session closes, while keeping separate histories for variants such as the AAPL CEDEAR in pesos, MEP dollars, and CCL dollars.

## What Changes

- Store each completed session's opening price, highest price, lowest price, closing price, and trading volume.
- Keep separate histories for each market, currency, or settlement variant of an asset. Observatory calls each variant a **Trading Line**.
- Load all available history when a Trading Line is added, then incorporate newly completed sessions.
- Periodically compare stored history with the source so legitimate corrections can be detected.
- Reject invalid or suspicious updates without silently damaging the previously stored history.
- Report missing or failed histories explicitly instead of hiding them.
- Store the histories as private JSON files in Railway.
- Initially obtain the data from Open BYMADATA.
- Keep the original market prices. Dividend-adjusted prices and corporate actions will be handled separately in the future.

## Capabilities

### New Capabilities

- `bar-history`: Maintains reliable daily market history for every supported way an asset trades.

### Modified Capabilities

None.

## Impact

- Adds Observatory's first stored market-data capability.
- Gives future analysis features one consistent place to obtain daily market history.
- Depends on the instrument catalog to describe which assets and trading variants Observatory follows.
- Does not add analysis, charts, scheduling, or browser-side market-data fetching.
