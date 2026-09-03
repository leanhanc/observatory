# Observatory

Observatory describes market conditions for supported instruments and identifies situations that deserve attention without making predictions or trade recommendations.

## Language

**Instrument**:
A legally and economically distinct market-listed asset that Observatory follows and describes. One Instrument may trade through multiple Trading Lines.
_Avoid_: Ticker, symbol, security

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

**Candlestick**:
A visual representation of a Daily Bar in a price chart.
_Avoid_: Daily Bar when referring to the market-data record

**Bar History**:
The chronological sequence of Daily Bars for one Trading Line.
_Avoid_: Candle history, price history
