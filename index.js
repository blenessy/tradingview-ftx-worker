// TradingView ticker pattern
const TICKER_PATTERN = /(\w+)(PERP|USD|\d{4,})/i;

/**
 * Sleep for the given amount of time,
 * @param {String} ms - Number of milliseconds to sleep.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate FTX Request headers with authentication information.
 * @param {String} apiKey - FTX API key
 * @param {String} secret - FTX API secret
 * @param {String} method - HTTP request method
 * @param {String} path - HTTP request path
 * @param {String} body - HTTP body to POST or empty String
 * @param {String} [subAccount] - FTX sub-account or null
 */
async function generateFtxRequestHeaders(apiKey, secret, method, path, body, subAccount) {
  const encoder = new TextEncoder()
  // instantiate a HMAC
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

  const timestamp = Date.now()
  // this is what we want to sign
  const signable = `${timestamp}${method}${path}${body}`
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(signable))
  // really messy way to get a hex-digest
  const signature = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  // this are the mandatory FTX auth headers
  const headers = {
      "content-type": "application/json",
      "ftx-key": apiKey,
      "ftx-ts": timestamp.toString(),
      "ftx-sign": signature
  }
  if (subAccount) {
    headers["ftx-subaccount"] = subAccount
  }
  console.log("signable: ", signable)
  console.log("headers: ", headers)
  return headers
}

/**
 * Converts a TradeView ticker to and FTX market
 * @param {String} ticker - the ticker to convert
 */
function convertTickerToMarket(ticker) {
  const match = ticker.match(TICKER_PATTERN)
  if (match) {
    const quote = match[1].toUpperCase()
    const base = match[2].toUpperCase()
    return base === "USD" ? `${quote}/${base}` : `${quote}-${base}`
  }
  return null
}

/**
 * Parse the given text and return the a valid body to POST to FTX /api/orders API.
 * 
 * @note The text needs to contain a valid token otherwise null is returned.
 * 
 * @param {String} pattern - the pattern to match
 * @param {String} text - the String to parse
 * @param {String} token - the expected token in text
 */
function parseOrder(pattern, text) {
  try {
    const match = text.match(new RegExp(pattern, 'sm'))
    if (match) {
      const market = convertTickerToMarket(match.groups.ticker)
      const size = parseFloat(match.groups.size)
      if (market && size > 0) {
        const price = match.groups.price ? parseFloat(match.groups.price) : null
        return {
          "market": market,
          "side": match.groups.side === "buy" ? "buy" : "sell",
          "type": price ? "limit" : "market",
          "size": size,
          "price": price
        }
      }
    }
  } catch (_) {
  }
  return null
}

function createGrafanaGraphiteMetric(timestampSeconds, type, key, value, labels) {
  return {
    "name": key,
    "metric": key,
    "value": value,
    "interval": 10,  // in millis
    "unit": "",
    "time": timestampSeconds,
    "mtype": type,
    "tags": labels,
  }
}

/**
 * Make an attempt to send metrics to Grafana Cloud over Graphite proto.
 *
 * @param {String} url to Graphite @ Grafana Cloud
 * @param {Object} order the processed order
 * @param {Number} startTime the start time in millis when the request was made to FTX
 */
async function notifyGrafanaGraphite(url, order, startTime) {
  const headers = {"content-type": "application/json"}
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.username && parsedUrl.password) {
      headers['Authorization'] = 'Basic ' + btoa(`${parsedUrl.username}:${decodeURIComponent(parsedUrl.password)}`)
      // remove username/password from the URL
      url = `${parsedUrl.origin}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
    }
  } catch (error) {
    /* url is null */ 
    console.warn("Invalid Grafana Graphite URL: ", url)
  }
  // https://github.com/grafana/cloud-graphite-scripts/blob/master/send/main.go
  const timestamp = Math.floor(startTime / 1000)
  const ftxRespTime = new Date().getTime() - startTime
  const labels = ["broker=ftx", `market=${order.market}`, `side=${order.side}`]
  const metrics = [
    createGrafanaGraphiteMetric(timestamp, "gauge", "bots_order_size", order.size, labels),
    createGrafanaGraphiteMetric(timestamp, "gauge", "bots_broker_response_time", ftxRespTime, labels),
  ]
  if (order.price) {
    metrics.push(
      createGrafanaGraphiteMetric(timestamp, "gauge", "bots_order_price", order.price, labels)
    )
  }
  const fetchInit = {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(metrics)
  }
  console.log("fetchInit: ", fetchInit)
  response = await fetch(url, fetchInit)
  text = await response.text()
  if (response.status != 200) {
    console.warn(`unexpeced ${response.status} response from Grafana Cloud: ${text}`)
  }
}

/**
 * Respond with the FTX API response.
 * @param {Request} request - the incoming request to handler
 */
async function handleRequest(request) {
  const headers = {
    "content-type": "application/json"
  }

  // make sure that mandatory Environment variables are defined
  if (typeof FTX_SECRETS === 'undefined') {
    console.error('The FTX_SECRETS kw:namespace is undefined')
    return new Response('', { status: 500, headers: headers })
  }
  
  if (ALLOWED_IPS && !ALLOWED_IPS.includes(request.headers.get('CF-Connecting-IP'))) {
    return new Response('', { status: 401, headers: headers })
  }

  console.log("alertPattern: ", ALERT_PATTERN)
  const order = parseOrder(ALERT_PATTERN, await request.text())
  if (!order) {
    console.error("Request body is not valid")
    return new Response('', { status: 400, headers: headers })    
  }
  console.log("order: ", order)

  const url = new URL(request.url);
  // expecting a 240 to 480 bit base32 encoded token 
  const token = url.pathname.replace(/.*\/([A-Z2-7=]{48,96})$/, '$1')
  if (!token) {
    return new Response('', { status: 401, headers: headers })
  }
  const secret = await FTX_SECRETS.get(token)
  if (!secret) {
    return new Response('', { status: 401, headers: headers })
  }
  const auth = secret.split(':')

  const ftxBody = JSON.stringify(order)

  // fetch FTX API
  const ftxSubAccount = auth.length == 3 ? auth[2] : null
  const ftxHeaders = await generateFtxRequestHeaders(
    auth[0], auth[1], 'POST', '/api/orders', ftxBody, ftxSubAccount
  )
  const fetchInit = {
    method: 'POST',
    headers: ftxHeaders,
    body: ftxBody
  }
  
  // retry order until finished or timer expired
  const cooldownMillis = Math.max(COOLDOWN_SECONDS, 1) * 1000  // lets be nice to the FTX API (min 1 seconds)
  const reqStartTime =  new Date().getTime();
  for (let i = 1; i <= MAX_RETRIES; i++) {
    const response = await fetch('https://ftx.com/api/orders', fetchInit)
    // consume the Response object otherwise we will run out of connections quickly
    const text = await response.text()
    if (response.status < 500) {
      if (typeof GRAFANA_GRAPHITE_URL !== 'undefined') {
        await notifyGrafanaGraphite(GRAFANA_GRAPHITE_URL, order, reqStartTime)
      }
      return new Response(text, { status: response.status, headers: headers })
    }
    console.warn(`FTX returned ${response.status} (attempt: ${i})- trying again later ...`)
    await sleep(cooldownMillis)
  }

  return new Response(text, { status: 504, headers: headers })
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
