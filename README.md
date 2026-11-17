# GTA VI Twitch CCU Forecaster

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/RaynaldyRyan/gta6-twitch-ccu-forecaster/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/RaynaldyRyan/gta6-twitch-ccu-forecaster/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecasts how many people watch Grand Theft Auto VI live on Twitch in each
hour of its release day (2026-11-19 UTC), as five quantiles per hour, from
everything recorded up to the end of the day's first hour.

## Method

Comparable-launch curves. Every past big launch in the case's comparables
contributes its release-day hourly curve as log-ratios to its own hour-1
print. For each forecast hour the log-ratios are pooled with a Gaussian
kernel weight: launches whose hour 1 looked like this launch's hour 1 count
most — similar hour-1 print relative to the previous evening's peak, and
similar absolute hour-1 level. The weighted median log-ratio, anchored on
this case's hour-1 print, is the forecast median; the weighted spread of the
log-ratios sets the 5/25/50/75/95% quantiles. The overnight dip, the
morning climb and the US-evening peak all come from the comparables, not
from a flat persistence assumption.

## Run

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) reads every `*.in` file in
`$MAKEFUN_INPUT_DIR` (else `/input/`) and writes `/output/<id>.out`
(else `$MAKEFUN_OUTPUT_DIR`) per case. Deterministic: no randomness, no
network, no clock reads.

## Validation (practice cases p00–p03)

- Pinball loss **0.224** vs house baseline **0.387** (typical miss 45.5%
  vs 82.7%, 90% coverage 0.891)
- Per case: p00 0.340, p01 0.210, p02 0.146, p03 0.200
- All 4 outputs valid (exact shape, ≤ 65,536 bytes); two runs produce
  byte-identical outputs; ~0.3 s for all 4 cases locally
