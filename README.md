# Cloudflare FTX Trading Worker

This project implements a simple Cloudflare FTX Trading Worker. 

This project started when I needed to glue together my back-tested [TradingView](https://www.tradingview.com/)
strategies with the FTX Trading APIs:

**TODO**: ASCII system design

# Features

- **Anti-Spoof Protection**: The TradingView Alert needs to authenticate itself.
- **Security**: Your FTX credentials is only known to your Cloudflare worker.
- **API Firewall**: Only explicitly whitelisted APIs are allowed.
- **API Firewall**: Only explicitly whitelisted APIs are allowed.

# Usage

The following assumes that you have whitelisted (see `FTX_API_WHITELIST`) `POST` to `/api/orders`.

```shell
export MY_WORKER=my-worker.my-org.workers.dev
cat >order.json <<EOF
{
  "apiKey": "OkiMqf4ryc72qYEplYQwT9cI1ebHgYwwpcEk5qSf",
  "path": "/api/orders",
  "method": "POST",
  "body": {
    "market": "BTC-PERP",
    "side": "buy",
    "type": "limit",
    "size": 0.0001,
    "price": 20000
  }
}
EOF
curl -v -X POST "https://$MY_WORKER" --data-binary @order.json
```

# Secrets

Most secrets can be configured both statically as [secret Cloudflare Worker environment variables](https://developers.cloudflare.com/workers/platform/environment-variables) and dynamically in each POST (JSON) request sent to the Worker.

Dynamic secrets has precedence over corresponding static secret.

| Static Secret | Dynamic Secret | Notes |
| --- | --- | --- |
| `FTX_API_WHITELIST` | | All FTX API calls need to be explicitly whitelisted. Example: `{"/api/orders":{"methods":["POST"]}}` |
| `ALLOWED_IPS` | | Optional whitelist of allowed IPs, for example: `["1.1.1.1"]`. By default all IPs are allowed to connect to the Worker. |
| `FTX_API_KEY` | `{ "apiKey": "..." }` | Your FTX API Key. Optional - see "Security Best Practices" |
| `FTX_SECRET` | `{ "secret": "..." }` | Your FTX API Secret. Optional - see "Security Best Practices" |
| `FTX_SUBACCOUNT` | `{ "subAccount": "..." }` | Your FTX sub-account. Optional - see "Security Best Practices" |

## Static Secrets

For example, this is how to define the `FTX_API_WHITELIST` with [wrangler](https://developers.cloudflare.com/workers/get-started/guide):

```shell
wrangler secret put FTX_API_WHITELIST
```

## Dynamic Secrets

The POST data to the worker can optionally include any of the following FTX API credentials:

```shell
{
    "apiKey": "...",
    "secret": "...",
    "subAccount": "...",
    ...
}
```
## Security Best Practices

1. Create and use a dedicated FTX sub-account if you intend to trade.
1. Your FTX Key/Secret should have minimal privileges - create read-only Key/Secret if you do not need to trade.
1. **Never define both `FTX_API_KEY` and `FTX_SECRET` when trading - this will leave your Worker unsecured.**
