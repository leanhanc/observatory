## REMOVED Requirements

### Requirement: historical numeric parity

**Reason**: Its reference scenario depends on a US market data fixture, which ADR 0006 keeps out of this repository.
**Migration**: Use "historical numeric parity on BYMA data", which keeps the same conventions with a BYMA fixture.

## ADDED Requirements

### Requirement: historical numeric parity on BYMA data

The implementation SHALL preserve the historical numeric conventions, checked against the committed GGAL fixture: EMA uses
`2/(period+1)` seeded from the first close; True Range uses the greatest of the bar range
and the two previous-close gaps, with the first bar using `high-low`; ATR uses Wilder
smoothing seeded by the first period True Ranges; RSI uses Wilder-smoothed gains and losses.

#### Scenario: GGAL reference session

- **WHEN** the 413-session GGAL fixture is calculated through 2026-09-30
- **THEN** EMA(20) is 6564.16 within 0.01
- **AND** EMA(50) is 6909.94 within 0.01
- **AND** EMA(200) is 7010.97 within 0.01
- **AND** ATR(14) is 236.15 within 0.01
- **AND** RSI(14) is 26.27 within 0.01
