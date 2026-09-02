# Observatory

Observatory describes market conditions for supported instruments and identifies situations that deserve attention without making predictions or trade recommendations.

## Language

**Instrument**:
A market-listed asset that Observatory follows and describes.
_Avoid_: Ticker, symbol, security

**Trading Session**:
The market period represented by one Daily Bar. A completed Trading Session has final market facts; an active Trading Session does not.
_Avoid_: Day

**Daily Bar**:
The normalized Open, High, Low, Close, and Volume market facts for one Trading Session of an Instrument.
_Avoid_: Candle, Candlestick

**Candlestick**:
A visual representation of a Daily Bar in a price chart.
_Avoid_: Daily Bar when referring to the market-data record

**Bar History**:
The chronological sequence of Daily Bars for one Instrument.
_Avoid_: Candle history, price history
