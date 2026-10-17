# Observatory

Observatory describes market conditions for supported instruments and identifies situations that deserve attention without making predictions or trade recommendations.

## Language

**Instrument**:
A legally and economically distinct market-listed asset that Observatory follows and describes. One Instrument may trade through multiple Trading Lines.
_Avoid_: Ticker, symbol, security

**Instrument Catalog**:
The authoritative collection of Instruments Observatory currently recognizes, including each Instrument's Trading Lines and each CEDEAR's Underlying.
_Avoid_: Bar History, provider configuration, analysis configuration

**Underlying**:
The foreign asset a CEDEAR represents, such as a share, an ADR or an ETF, described by its market of origin and its ticker there. It is a description, not an Instrument Observatory follows, and a CEDEAR and its Underlying are never the same Instrument.
_Avoid_: Underlying Instrument, treating a CEDEAR and its foreign asset as the same Instrument

**Trading Line**:
One particular way an Instrument trades, distinguished by market, symbol, currency, settlement, or operative form. Different Trading Lines have independent prices, liquidity, volume, and Bar Histories.
_Avoid_: Quotation, price series, Instrument

**Quote**:
Current bid, ask, last-traded, or related price information for a Trading Line at a point in time.
_Avoid_: Trading Line, Daily Bar

**BYMA Especie**:
BYMA's term for the ticker or symbol shown for a negotiable security. It is source-specific language and does not by itself replace either Instrument or Trading Line.
_Avoid_: Species, using Especie as Observatory's canonical identity

**Leading Panel**:
BYMA's term (panel líder) for its list of leading local shares, identified with the S&P Merval constituents and rebalanced about twice a year. It is source-specific language: membership is a fact about a BYMA list on a date, not a property of an Instrument.
_Avoid_: Blue chips, Merval when referring to the panel's list of Trading Lines

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

**Peso Equivalent**:
A MEP-dollar price of a Dollarized Series expressed in pesos at one stated session's MEP Rate, by applying that rate in reverse. It shows a reader of the peso line where a level sits in the prices their broker shows on that session. It is not a peso market price and not a fixed trigger: the same level has a different Peso Equivalent on every session whose MEP Rate differs.
_Avoid_: Peso level, peso swing, converting with another session's rate

**CCL Equivalent**:
A price of a peso line expressed in CCL dollars at one stated session's CCL Rate: the peso price, or a MEP-dollar level's Peso Equivalent, divided by that session's CCL Rate. It is for display only. A session without a CCL Rate has no CCL Equivalent; no other session's rate stands in.
_Avoid_: CCL price, cable-line price, converting with another session's rate

**Chart Series**:
A line's corrected Daily Bars as candles in pesos, MEP dollars and CCL dollars, for drawing Candlesticks: each session's open, high, low and close, converted at that session's own MEP or CCL Rate. A session without a rate has no candle in that currency; no other session's rate stands in. It covers a recent window ending on the latest State's session. It is for display only: no analysis reads it.
_Avoid_: Price history, Bar History, chart data that fills a missing rate

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

**MEP Rate**:
The pesos-per-dollar exchange rate implied, for one Trading Session, by the closes of a bond's peso line and its local-dollar (MEP, "D") line with the same settlement. A session has a MEP Rate only when both lines traded. It is distinct from the CCL rate, which uses the cable line.
_Avoid_: Ratio, a third-party dólar MEP quote

**CCL Rate**:
The pesos-per-dollar exchange rate implied, for one Trading Session, by the closes of a bond's peso line and its cable (CCL, "C") line with the same settlement: the price of a dollar settled abroad. A session has a CCL Rate only when both lines traded. It usually sits a few percent above the MEP Rate. It is for display only and never dollarizes a series or enters analysis.
_Avoid_: Ratio, a third-party dólar CCL quote, dollarizing with it

**Dollarized Series**:
A peso-line Bar History expressed in **MEP dollars** by dividing each Daily Bar's prices by the same session's MEP Rate. Its bars are derived values, not market facts of any Trading Line. Sessions without a MEP Rate have no bar.
_Avoid_: Dollar-line history, Bar History

## Analysis Language

**Feature**:
A measured property of an Instrument for a Trading Session, derived from its Bar History. A Feature may be continuous, such as price relative to an average, or comparative, such as a percentile over a stated window.
_Example_: If the close is 105, EMA(20) is 100, and ATR(14) is 2.5, the Feature “price relative to EMA(20) in ATR units” is 2: `(105 - 100) / 2.5`. It is a measurement, not the report sentence used to present it.
_Avoid_: State, score, recommendation

**Instrument State**:
A structured description of what is true about an Instrument for a Trading Session, including classifications, measurements, and whether each part could be evaluated.
_Example_: For one Trading Session, an Instrument State of a recently listed Instrument may record range-bound Structure, RSI(14) at 61.6, price 2 ATRs above EMA(20), and Regime as unavailable because there is not enough history. Together these facts describe the Instrument without predicting what happens next.
_Avoid_: Signal, verdict, snapshot when referring to a single fact

**Regime**:
A slower-moving description of the broader price context, conventionally described as bullish, bearish, mixed, or undefined. These labels describe the observed context and do not predict the next move or recommend an action.
_Avoid_: Using rising or falling as the canonical regime labels, buy signal, sell signal

**Regime Transition**:
An Event in which an already established readable Regime changes to a different readable Regime after the required confirming Trading Sessions. The first readable Regime after unavailable history is initial availability, not a Regime Transition.
_Avoid_: Treating warm-up completion, an unconfirmed proposal, or an unchanged Regime as an Event

**Pending Regime Transition**:
A readable Regime proposal that differs from the settled Regime and has not yet gathered the required confirming Trading Sessions, together with how many it has. It is part of the Instrument State, not an Event: a proposal equal to the settled Regime clears it, and a different proposal replaces it and restarts the count. It describes how far confirmation has progressed and predicts nothing about whether the transition will happen.
_Avoid_: Regime Transition, early signal, imminent change

**Regime Tipping Close**:
A tipping point of the Regime rule. It is the approximate close at which the price meets its half of the rule: half a typical daily move (ATR) above the 200-session average for bullish, or that far below it for bearish. Crossing it is not enough by itself. The 50-session average must be on the same side, and the change must hold for the confirming sessions. It moves a little every session, because each close moves the averages and the ATR.
_Avoid_: Target, trigger price, breakout level

**Structure**:
The sequence and relationships of confirmed swing highs and lows in price, conventionally described as an uptrend, downtrend, range, or undefined. A directional Structure depends on a confirmed swing level. That level and the current price's distance from it are Evidence about Structure; they are not a separate state beside Structure and Regime. A completed close beyond that level may produce a structure-break Event and makes Structure undefined rather than automatically reversing it. A range means the last two confirmed highs and the last two confirmed lows disagree on direction while the close stays within the last confirmed high and low; a completed close beyond either makes Structure undefined, with no Event, until a new swing confirms.
_Avoid_: Pattern, signal, prediction, Structural Hold as a separate state

**Confirmed Swing**:
A local high or low of a completed Trading Session that becomes knowable only after the required number of later completed Trading Sessions. Its occurrence session and confirmation session are distinct.
_Avoid_: Current price, unconfirmed turning point

**Support**:
The last place price stopped falling: the last confirmed swing low, while the close is at or above it. It says where price turned before, not that it will turn there again. Once a close is below it, there is no confirmed Support until a new swing low confirms.
_Avoid_: Floor that will hold, "it will turn there again", buy zone

**Resistance**:
The last place price stopped rising: the last confirmed swing high, while the close is at or below it. It says where price turned before, not that it will turn there again. Once a close is above it, there is no confirmed Resistance until a new swing high confirms.
_Avoid_: Ceiling that will hold, "it will turn there again", sell zone

**Volatile Session**:
A direction-neutral Event in which one completed Trading Session's True Range, including the gap from the previous close, is unusually large relative to the line's average range (ATR) known before that session. "Volatile" is relative to the line's own recent range, not an absolute level: a calm line can have a Volatile Session that would be an ordinary day for a turbulent one. Each qualifying session is a separate historical fact; it does not mark the start of a phase of widening ranges.
_Avoid_: Volatility Expansion, wide-range session, bullish or bearish signal, continuation, reversal, opportunity, price target

**Period Return**:
How much the close moved over a recent stretch, in percent: one month, three months or one year, counted in calendar months back from the latest State's session (the windows are set in the Analysis Configuration). It starts from the last close on or before that date. It is measured in MEP dollars, and also in pesos and in CCL dollars for display, over the same sessions: a peso return includes the peso's devaluation, which is what a holder of the peso line got. It says how far, not why. When the history is too short, it is unavailable, never zero.
_Avoid_: Performance, gain, distance below a level when referring to the whole move

**Day Change**:
How much the latest State's close moved since the line's previous session, as an amount and in percent, in pesos, MEP dollars and CCL dollars, for display. The previous session is the line's previous peso bar, whatever its rates, so it is the close the reader saw before; when the provider's bar for the session before was dropped as invalid, it is an earlier one. Each currency converts that previous close at its own session's rate: a peso day change includes the peso's move between the two sessions, and a dollar one removes it. A previous session without a rate in a currency has no day change in it; no other session's rate stands in.
_Avoid_: Daily return, skipping to a previous session that has a rate, converting the previous close at the latest session's rate

**Corporate Action**:
An issuer's decision, such as a split, a reverse split, a share distribution or a change of a CEDEAR's ratio, that changes the number of shares or CEDEARs and moves the price in inverse proportion, without changing what a holding is worth. A price step it causes is bookkeeping, not market behavior.
_Avoid_: Split when referring to every kind, adjustment when referring to the issuer's decision

**Large One-Session Move**:
A completed Trading Session whose dollarized close moved by a configured factor or more from the previous dollarized close, up or down. It is large enough to be an unadjusted Corporate Action; it describes the move's size and does not say what caused it.
_Avoid_: Split detection, anomaly, outlier

**Corporate Action Notice**:
A published notice, from an issuer or a CEDEAR program issuer, whose title announces an event that may be a Corporate Action for an analyzed Trading Line. It is a prompt for a person to read the notice, not a confirmed Corporate Action: only the notice's document gives the ex-date and the factor, and only a confirmed action is corrected.
_Avoid_: Corporate Action when nothing has been confirmed, signal, alert

**Situation**:
A named combination of Features and Instrument State that Observatory recognizes as worth describing.
_Avoid_: Signal, prediction, opportunity

**Below the Last Confirmed Low in a Bearish Regime**:
A fall with no confirmed floor yet. Regime is bearish and the close is below the last confirmed swing low, so nothing confirmed marks where the fall stopped. It ends when a new swing low confirms, when the close gets back to the low, or when Regime stops being bearish. It describes the fall; it does not say whether it continues.
_Avoid_: Falling knife as a label, "don't catch it", oversold

**Above the Last Confirmed High in a Bullish Regime**:
A rise with no confirmed ceiling yet, the mirror of the falling Situation. Regime is bullish and the close is above the last confirmed swing high, so nothing confirmed marks where the rise stopped. It ends when a new swing high confirms, when the close gets back to the high, or when Regime stops being bullish. It describes the rise; it does not say whether it continues.
_Avoid_: Breakout signal, overbought, "it will keep rising"

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

**Market Session**:
A Trading Session that has a MEP Rate. Measures that count sessions, such as Liquidity Eligibility, count only Market Sessions, because a session without a MEP Rate cannot be valued in MEP dollars.
_Avoid_: Calendar day, a session on which only some lines traded

**Liquidity Eligibility**:
Whether a Trading Line traded regularly enough, and with enough value, over a recent window of Market Sessions for indicators to describe market behavior rather than sparse trading. It is a yes/no gate on participation and median traded value, not a score, and says nothing about direction or opportunity.
_Avoid_: Liquidity score, tradability, quality filter

**Analysis Run**:
One execution of the canonical analysis through a completed Requested-Through Session, covering every analyzed Trading Line: the peso line of each stock and CEDEAR. It produces at most one Analysis Snapshot and is independent of any viewer.
_Avoid_: Calling an Analysis Run a Bar History update; per-visitor analysis

**Analysis Snapshot**:
The persisted result of one Analysis Run: for each analyzed Trading Line, its latest Instrument State and its Events, or why it could not be analyzed, together with the Analysis Configuration version that produced them.
_Avoid_: Snapshot when referring to a single Instrument State or Event

**Attention Preference**:
A user's instruction about which already-computed Observations to order, filter, or deliver. It never combines evidence into a score or changes the meaning of an Analysis Configuration.
_Avoid_: Weight, score, personalized analysis

**User-Context Projection**:
The interpretation of canonical analysis together with user context, such as Holdings, Watched Instruments, notification preferences, or the currency in which prices are displayed.
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
