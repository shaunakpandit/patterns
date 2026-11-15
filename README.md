

## Goal

an application to teach stock market movements by way of predicting next movements shown a snapshot of the market with a set of indicator values at that point
meant to teach intutition of market. has user mark a buy or sell stock option, stop loss and take profit values. allows showing point in time inidcators for rsi, volume, previous day high/lows and any other interesting non forward looking accurate indicators would exist at that point of time


## Feature set

- real stock data for spy can use polygon given api key or if free and within limits, yahoo. 
- show random slices of data on 1 day timeframe over 3 months of data. user asked to take trade 1 month ish in 
- when determining right answer for data shift, moving x total points up/ from start to finish of timeframe counts as a "should long" "should short" style situation going to neither counts as a "neither" 
- ask user to set buy/sell, tp and sl. should show total profit or loss at end of time series

## teaching goals
- really want to minimize bias in this teacing. should be random situation, not guessable based on when being asked to take the trade

## Tech outline

a portable web application runnable as a docker container (potentially hosted on github as an official container image for easier install?). simple and fast. optimized for speed efficiency and simplicity.
Renderable on phones in portrait mode

## Run

```sh
docker run -p 8080:8080 -v patterns-data:/data ghcr.io/<owner>/patterns
# or from source (Node 22+, no dependencies)
node server.js
```

Open http://localhost:8080. SPY daily bars come from Yahoo and are cached in `/data/spy.json` for a day. If Yahoo fails and `POLYGON_API_KEY` is set, Polygon is used instead (its free tier only has about 2 years of data). If both fail, the stale cache is served. Behind an HTTP proxy, set `NODE_USE_ENV_PROXY=1`.

Each round shows 63 daily bars and stops at a random bar between 17 and 25. Prices are rescaled so the decision close is 100, so points equal percent. Dates stay hidden until the reveal. The answer is long or short if the close on the last bar is more than 2× ATR(14) away from the decision close, and neither otherwise. **Balanced** sampling gives each answer a 1/3 chance. **Random** uses the real base rates (SPY rises more often than it falls). If a stop loss and a take profit are both inside one daily bar, the trade counts as stopped out.

Tests: `node --test`
