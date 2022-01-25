# Cloudflare FTX Trading Worker

Do you want to connect your live-runnning [TradingView Strategy](https://www.tradingview.com/pine-script-docs/en/v4/essential/Strategies.html) to [FTX](https://ftx.com/) in a robust way? If yes, this project is most likely for u! If you are not sure, then this project is most likely not for u as it has a very special purpose. 

# Architecture

[TradingView Alert Web-hook](https://www.tradingview.com/support/solutions/43000481368-strategy-alerts/)

[Cloudflare Worker](https://workers.cloudflare.com/)

**TODO**: ASCII system design

# Quick Start (only requires Cloudflare Workers account)

You will not be able to do much trading but you can quickly try out this project by deploying it to your Cloudflare Workers account.

1. Creating a KV namespace with and populate it with some test data:
    ```shell
    export WORKER_SECRET=UEO3GZGOYXWVNIXOQPH5TCVOAGHUPKGLI54ECTKUR6VAAVP2
    export FTX_SECRET=usAFwoAldHBBKy-PzQA3tNR8oMHu7riudUk66ncn:KHaWQHb0kMTnCuw_Tx5h5DhCyP2Wh8fMOoHycd5A:TEST_SUBACCOUNT
    wrangler kv:namespace create FTX_SECRETS
    wrangler kv:key put -c wrangler.toml --binding=FTX_SECRETS "$WORKER_SECRET" "$FTX_SECRET"
    ```
1. Add the returned `kv_namespaces` to `wrangler.toml`
1. Publish your worker with:
    ```shell
    wrangler publish
    ```
1. Connect to your the logs with:
    ```shell
    wrangler tail --env=staging
    ```
1. Test your worker with:

    ```shell
    export WORKERS_SUBDOMAIN=example.workers.dev
    curl -v -X POST "https://tradingview-ftx-worker.$WORKERS_SUBDOMAIN/$WORKER_SECRET" \
        -d "MY BOT: buy 0.0001 BTCPERP @ 20000"
    ```

Your worker should whine about "Not logged in: Invalid API key" because the `$FTX_SECRET` is invalid.

## Key Takeaways

1. Each Bot has a **unique and secret URL**, which must only be known to the TradingView alert. **Having access to the URL allows anybody to trade with the associated FTX account**.
2. A worker can serve multiple TradingView alerts by  adding more `$WORKER_SECRET`/`$FTX_SECRET` pairs to the `FTX_SECRETS` KV namespace.

# Pre-requisites

1. Get a (free) Cloudflare Workers account as described [here]](https://developers.cloudflare.com/workers/get-started/guide).
1. Sign up for a (payed) [TradingView Pro](https://www.tradingview.com/gopro/#plans) plan.
1. Sign up for a (free) FTX Trading account. You can get 5% discount by using my referral [here](https://ftx.com/profile#a=tradingviewftxworker).
1. Create an FTX sub-account and corresponding API Key with trading capabilities.

# Security

1. By using TLS >=1.2 (enforced by Cloudflare), we rely on the fact that the path (`$WORKER_SECRET`) of the URL is kept secret during TLS handshake. In fact the only information that can be intercepter is leaked during the TLS handshake is the DNS hostname (which is not our security anchor).

1. It is important that the `$WORKER_SECRET` has "enough" entropy so that malicios actors cannot guess it. As the URL can be quite long we recommend the following command for generating strong "enough" (>256-bits of entropy) `$WORKER_SECRET`s:
   ```shell
   head -c 55 /dev/urandom | base32
   ```
1. Cloudflare's core bussiness is DoS protection. We rely on the fact that they will detect and miticate brute force attempts to the URL - even though the search space is ridiculously big.

# Static Configuration

**NOTE**: Although you can change this from the Cloudflare UI, the values get reset to whatever is in [wrangler.toml](./wrangler.toml) every time you publish your worker with the `wrangler` CLI.

| Name | Purpose |
| --- | --- |
| `ALERT_PATTERN` | [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) for parsing the TradeView alert message. Feel free to change but keep the named groups. |
| `ALLOWED_IPS` | Whitelists the [TradingView Alert Service IPs](https://www.tradingview.com/support/solutions/43000529348-about-webhooks/). Normally, you don't want to change these. |
| `COOLDOWN_SECONDS` | Seconds of delay before retrying failed  (HTTP >=500) FTX API requests. You can decrease this down to 1 seconds if you are really eager. |
| `MAX_RETRIES` | Seconds of times failed (HTTP >=500) FTX API requests are retryied before timeout occurs. |

# TradingView Alert Setup

Specify your Worker's **secret** URL as **Webhook URL**. 

For **MARKET** orders use the following message:
```
TEST_SUBACCOUNT: {{strategy.order.action}} {{strategy.order.contracts}} {{ticker}}
```

For **LIMIT** orders use the following alert message:
```
TEST_SUBACCOUNT: {{strategy.order.action}} {{strategy.order.contracts}} {{ticker}} @ {{strategy.order.price}}
```

Change `TEST_SUBACCOUNT` to match your FTX sub-account.
