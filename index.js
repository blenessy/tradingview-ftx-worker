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
  return headers
}

/**
 * Parse the given text and return an Object or null if it is invalid
 * @param {String} text - the String to parse
 */
function tryParseJSON(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch(e) {
    return null
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

  // When ALLOWED_IPS is defined, only those IP addresses are allowed to connect.
  const allowedIPs = tryParseJSON(typeof ALLOWED_IPS !== 'undefined' ? ALLOWED_IPS : null)
  if (allowedIPs && !allowedIPs.includes(request.headers.get('CF-Connecting-IP'))) {
    return new Response('', { status: 401, headers: headers })
  }

  // Mandatory Environment
  const whitelist = tryParseJSON(typeof FTX_API_WHITELIST !== 'undefined' ? FTX_API_WHITELIST : null)
  if (!whitelist) {
    console.error("FTX_API_WHITELIST not defined or not valid JSON")
    return new Response('', { status: 500, headers: headers })
  }

  if (request.method.toUpperCase() !== "POST") {
    return new Response('', { status: 405, headers: headers })
  }

  // Parse the request object
  const ftx = tryParseJSON(await request.text())
  if (!ftx) {
    console.error("request body is not a valid JSON")
    return new Response('', { status: 400, headers: headers })
  }

  // Optional (default) Environment
  const ftxApiKey = ftx.apiKey || (typeof FTX_API_KEY !== 'undefined' ? FTX_API_KEY : null)
  const ftxSecret = ftx.secret || (typeof FTX_SECRET !== 'undefined' ? FTX_SECRET : null)
  const ftxSubAccount = ftx.subAccount || (typeof FTX_SUBACCOUNT !== 'undefined' ? FTX_SUBACCOUNT : null)
  if (!ftxApiKey || !ftxSecret) {
    console.error('missing FTX API authentication credentials')
    return new Response('', { status: 400, headers: headers })
  }
  if (!ftx.path || !ftx.path.startsWith("/api/")) {
    console.error('missing or invalid FTX API path')
    return new Response('', { status: 400, headers: headers })
  }
  const ftxMethod = (ftx.method || 'GET').toUpperCase()
  if (!["GET", "POST", "DELETE"].includes(ftxMethod)) {
    console.error(`invalid FTX API method: ${ftxMethod}`)
    return new Response('', { status: 400, headers: headers })
  }
  if (ftxMethod === "POST" && !ftx.body) {
    console.error("missing body for FTX POST request")
    return new Response('', { status: 400, headers: headers })
  }

  // make sure that the invoked API has been whitelisted
  if (!(ftx.path in whitelist && whitelist[ftx.path].methods.includes(ftxMethod))) {
    console.error(`FTX API method or path is not allowed: ${ftxMethod} ${ftx.path}`)
    return new Response('', { status: 403, headers: headers })
  }

  // fetch Request init object
  const ftxBody = ftx.body ? JSON.stringify(ftx.body) : ''
  const response = await fetch(`https://ftx.com${ftx.path}`, {
    method: ftxMethod,
    headers: await generateFtxRequestHeaders(
      ftxApiKey, ftxSecret, ftxMethod, ftx.path, ftxBody, ftxSubAccount
    ),
    body: ftxBody || null,
  })

  // return the response code and body
  return new Response(await response.text(), { status: response.status, headers: headers })
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
