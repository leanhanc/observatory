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

## Analysis Language

**Feature**:
A measured property of an Instrument for a Trading Session, derived from its Bar History. A Feature may be continuous, such as price relative to an average, or comparative, such as a percentile over a stated window.
_Example_: If the close is 105, EMA(20) is 100, and ATR(14) is 2.5, the Feature “price relative to EMA(20) in ATR units” is 2: `(105 - 100) / 2.5`. It is a measurement, not the report sentence used to present it.
_Avoid_: State, score, recommendation

**Instrument State**:
A structured description of what is true about an Instrument for a Trading Session, including classifications, measurements, and whether each part could be evaluated.
_Example_: For one Trading Session, an Instrument State may record a mixed Regime, range-bound Structure, RSI(14) at 61.6, price 2 ATRs above EMA(20), and volume comparison as unavailable because there is not enough history. Together these facts describe the Instrument without predicting what happens next.
_Avoid_: Signal, verdict, snapshot when referring to a single fact

**Regime**:
A slower-moving description of the broader price context, conventionally described as bullish, bearish, mixed, or undefined. These labels describe the observed context and do not predict the next move or recommend an action.
_Avoid_: Using rising or falling as the canonical regime labels, buy signal, sell signal

**Structure**:
The sequence and relationships of confirmed swing highs and lows in price, conventionally described as an uptrend, downtrend, range, or undefined. Structure can remain intact, come under pressure, or break without immediately becoming the opposite trend.
_Avoid_: Pattern, signal, prediction

**Situation**:
A named combination of Features and Instrument State that Observatory recognizes as worth describing.
_Avoid_: Signal, prediction, opportunity

**Event**:
A precise change that occurred in an Instrument's state or measurable market behavior, such as a structure break or new period high.
_Avoid_: Alert, recommendation

**Observation**:
An optional result that identifies a Situation or Event as deserving attention and carries the structured Evidence needed to understand it.
_Avoid_: State, notification

**Evidence**:
The structured facts, values, references, windows, and evaluation status supporting an Instrument State, Situation, or Observation.
_Avoid_: Explanation when referring to human-readable wording

**Evidence Status**:
The conclusion available for a tested claim: supported, contradicted, no evidence, or untestable. These statuses must remain distinct. “No evidence” means the test did not find clear support for the claim; it does not mean the test showed the claim was false.
_Avoid_: Confidence score, pass/fail when referring to research evidence

**Analysis Configuration**:
The versioned, project-wide set of measurement conventions and interpretation thresholds used to produce comparable analysis, such as indicator periods, warm-up rules, and event thresholds.
_Avoid_: User preference, Attention Preference

**Attention Preference**:
A user's instruction about which already-computed Observations to order, filter, or deliver. It never combines evidence into a score or changes the meaning of an Analysis Configuration.
_Avoid_: Weight, score, personalized analysis

**User-Context Projection**:
The interpretation of canonical analysis together with user context, such as Holdings, Watched Instruments, notification preferences, or the CEDEAR Trading Line to which an underlying level may be translated.
_Avoid_: Reanalysis, customized analysis

## User Scope

**Holding**:
An Instrument the user has told Observatory they own or currently hold.
_Avoid_: Position when referring to the user's relationship with an Instrument

**Watched Instrument**:
An Instrument the user has explicitly chosen to follow, whether or not they hold it.
_Avoid_: Holding, watchlist item when referring to the Instrument itself

**Notification**:
A user-configured delivery of an Observation. Notifications are separate from analysis: Observatory may analyze every eligible Instrument while delivering only the Observations the user's preferences permit. Watched Instruments have notifications enabled by default; users may change that preference.
_Avoid_: Event, alert when referring to the user preference and delivery

**Quiet**:
A presentation label for an Instrument with a valid current Instrument State but no recent Observation. Quiet must not describe missing, insufficient, or failed analysis.
_Avoid_: No data, inactive, nothing happened
