

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
