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
  console.log(signable)
  console.log(JSON.stringify(headers))
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

  console.log(`alertPattern: '${ALERT_PATTERN}'`)
  const order = parseOrder(ALERT_PATTERN, await request.text())
  if (!order) {
    console.error("Request body is not valid")
    return new Response('', { status: 400, headers: headers })    
  }

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
  console.log(`ftxBody: '${ftxBody}'`)

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
  for (let i = 1; i <= MAX_RETRIES; i++) {
    const response = await fetch('https://ftx.com/api/orders', fetchInit)
    // consume the Response object otherwise we will run out of connections quickly
    const text = await response.text()
    if (response.status < 500) {
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
