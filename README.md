# Cloudflare FTX Trading Worker

Do you want to connect your live-runnning [TradingView Strategy](https://www.tradingview.com/pine-script-docs/en/v4/essential/Strategies.html) to [FTX](https://ftx.com/) in a robust way? If yes, this project is most likely for u! If you are not sure, then this project is most likely not for u as it is for a very special purpose. 

# Architecture

[TradingView Alert Web-hook](https://www.tradingview.com/support/solutions/43000481368-strategy-alerts/)

[Cloudflare Worker](https://workers.cloudflare.com/)

**TODO**: ASCII system design

# Quick Start (only requires Cloudflare Workers account)

You will not be able to do much trading but you can quickly try out this project by deploying it to your Cloudflare Workers account with:

```shell
wrangler publish --env=staging
```

Connect to your the logs with:

```shell
wrangler tail --env=staging
```

POST an TradingView alert with:

```shell
# TODO: change to your workers.dev subdomain
export WORKERS_SUBDOMAIN=example.workers.dev
# TODO: change to your own token
export TRADINGVIEW_TOKEN=iP3tGqlTu8PMeA7gDBY7CtVxt7P9Eaw55BWjsHAagX20+aRoojWAjTncMIBnfPe1/rBzyNWmkke/Efhp18nlbg==
curl -v "https://tradingview-ftx-worker-staging.$WORKERS_SUBDOMAIN" \
    -d "BTCPERP: buy 0.0001 @ 20000 $TRADINGVIEW_TOKEN"
```

Your worker should while about `FTX_API_KEY` not being defined at this point.

# Pre-requisites

1. Get a (free) Cloudflare Workers account as described [here]](https://developers.cloudflare.com/workers/get-started/guide).
1. Sign up for a (payed) [TradingView Pro](https://www.tradingview.com/gopro/#plans) plan.
1. Sign up for a (free) FTX Trading account. You can get 5% discount by using my referral [here](https://ftx.com/profile#a=tradingviewftxworker).
1. Create an FTX sub-account and corresponding API Key with trading capabilities.

# User Guide

## Cloudflare Workers Setup

### Secret Environment Variables

Define the following [secret environment variables](https://developers.cloudflare.com/workers/platform/environment-variables) to your Cloudflare worker:

| Name | Purpose |
| --- | --- |
| `FTX_API_KEY` | Your FTX API key, which you generate from your [FTX account settings](https://ftx.com/profile) |
| `FTX_SECRET` | Your FTX API secret associated with your `FTX_API_KEY` |
| `FTX_SUBACCOUNT` | Optional "sandbox" for your Worker. Highly recommended. |
| `TRADINGVIEW_TOKEN` | This authenticates your TradingView alerts and will need to be included in your alerts. It is recommended that you generate one with 512-bits of entropy: `head -c 64 /dev/urandom | base64`. |

### Normal (not-secret) Environment Variables

**NOTE**: Although you can change this from the Cloudflare UI, the values get reset to whatever is in [wrangler.toml](./wrangler.toml) every time you publish your worker with the `wrangler` CLI.

| Name | Purpose |
| --- | --- |
| `ALERT_PATTERN` | [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) for parsing the TradeView alert message. Feel free to change but keep the named groups. |
| `ALLOWED_IPS` | Whitelists the [TradingView Alert Service IPs](https://www.tradingview.com/support/solutions/43000529348-about-webhooks/). Normally, you don't want to change these. |
| `COOLDOWN_SECONDS` | Seconds of delay before retrying failed  (HTTP >=500) FTX API requests. You can decrease this down to 1 seconds if you are really eager. |
| `MAX_RETRIES` | Seconds of times failed (HTTP >=500) FTX API requests are retryied before timeout occurs. |

## TradingView Alert Setup

Specify your Worker's URL as **Webhook URL**.

For **LIMIT** orders use the following message (replace $TRADINGVIEW_TOKEN with your own token):
```
{{ticker}}: {{strategy.order.action}} {{strategy.order.contracts}} @ {{strategy.order.price}} $TRADINGVIEW_TOKEN
```

For **MARKET** orders use the following message (replace $TRADINGVIEW_TOKEN with your own token)
```
{{ticker}}: {{strategy.order.action}} {{strategy.order.contracts}} @ {{strategy.order.price}} $TRADINGVIEW_TOKEN
```
