# Observatory

Observatory describes market conditions for supported instruments and identifies situations that deserve attention without making predictions or trade recommendations.

## Language

**Instrument**:
A legally and economically distinct market-listed asset that Observatory follows and describes. One Instrument may trade through multiple Trading Lines.
_Avoid_: Ticker, symbol, security

**Instrument Catalog**:
The authoritative collection of Instruments Observatory currently recognizes, including each Instrument's Trading Lines and any CEDEAR-to-Underlying-Instrument relationship.
_Avoid_: Bar History, provider configuration, analysis configuration

**Underlying Instrument**:
An Instrument whose economic value another Instrument references, such as the foreign share represented by a CEDEAR. The CEDEAR and its Underlying Instrument remain distinct Instruments.
_Avoid_: Treating a CEDEAR and its foreign share as the same Instrument

**Trading Line**:
One particular way an Instrument trades, distinguished by market, symbol, currency, settlement, or operative form. Different Trading Lines have independent prices, liquidity, volume, and Bar Histories.
_Avoid_: Quotation, price series, Instrument

**Quote**:
Current bid, ask, last-traded, or related price information for a Trading Line at a point in time.
_Avoid_: Trading Line, Daily Bar

**BYMA Especie**:
BYMA's term for the ticker or symbol shown for a negotiable security. It is source-specific language and does not by itself replace either Instrument or Trading Line.
_Avoid_: Species, using Especie as Observatory's canonical identity

**Trading Session**:
The market period represented by one Daily Bar. A completed Trading Session has final market facts; an active Trading Session does not.
_Avoid_: Day

**Daily Bar**:
The normalized Open, High, Low, Close, and Volume market facts for one completed Trading Session of a Trading Line.
_Avoid_: Candle, Candlestick

**Provisional Bar**:
An explicitly temporary reading of an active or recently closed Trading Session whose final dated market facts are not yet available. It may inform same-evening analysis, but it is not part of Bar History and cannot advance the Checked-Through Session.
_Avoid_: Daily Bar, confirmed bar

**Continuity Data**:
A source value repeated to keep a displayed series continuous when no real trade occurred. It does not represent a Trading Session and must not become a Daily Bar.
_Avoid_: Carried Close, no-trade bar

**Candlestick**:
A visual representation of a Daily Bar in a price chart.
_Avoid_: Daily Bar when referring to the market-data record

**Bar History**:
The chronological sequence of Daily Bars for one Trading Line.
_Avoid_: Candle history, price history

**Checked-Through Session**:
The latest completed Trading Session through which Observatory has accepted an answer from the market-data source, even when no real Daily Bar existed for that session.
_Avoid_: Latest bar, last trading date

**Requested-Through Session**:
The latest completed Trading Session an update is authorized to accept. It becomes the Checked-Through Session only after the requested interval is accepted and stored successfully.
_Avoid_: Requested interval, requested sessions, Checked-Through Session before acceptance

**Acquisition Mode**:
The declared kind of work needed to bring one Bar History through a requested completed Trading Session: Initial Backfill, Refresh, or Reconciliation.
_Avoid_: Inferring the required work from the newest Daily Bar

**Initial Backfill**:
The first population of a Trading Line's Bar History with all completed Daily Bars currently available from its source.
_Avoid_: Refresh, Reconciliation

**Refresh**:
The recovery of every dated completed session after the Checked-Through Session, whether one session or several is missing.
_Avoid_: Ordinary Refresh, Catch-up, using an undated market row

**Reconciliation**:
The deliberate recheck of previously accepted sessions against the source to detect corrections while preserving valid history outside the source's available window.
_Avoid_: Initial Backfill, ordinary daily update
