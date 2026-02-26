const API_TOKEN_HEADER = 'x-api-token';

function getApiBaseUrl() {
  const raw = (process.env.API_BASE_URL || 'http://localhost:8080/api').trim().replace(/\/+$/, '');
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

function buildUpstreamUrl(req) {
  const base = getApiBaseUrl();
  const incoming = new URL(req.url || '/', 'http://localhost');
  // When rewritten from /api/:path*, path is in query
  const pathFromQuery = incoming.searchParams.get('path');
  const suffix = typeof pathFromQuery === 'string'
    ? (pathFromQuery.startsWith('/') ? pathFromQuery : `/${pathFromQuery}`)
    : incoming.pathname.replace(/^\/api\/?/, '') || '';
  const pathPart = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}${pathPart}${incoming.search}`;
}

function getForwardHeaders(req) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(','));
    } else {
      headers.set(key, value);
    }
  }

  headers.delete('host');
  headers.delete(API_TOKEN_HEADER);

  const apiToken = (process.env.API_TOKEN || '').trim();
  if (apiToken) {
    headers.set(API_TOKEN_HEADER, apiToken);
  }

  return headers;
}

export default async function handler(req, res) {
  const upstreamUrl = buildUpstreamUrl(req);
  const headers = getForwardHeaders(req);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? 'half' : undefined,
  });

  res.statusCode = upstreamResponse.status;
  const skipHeaders = ['transfer-encoding', 'content-encoding', 'content-length'];
  upstreamResponse.headers.forEach((value, key) => {
    if (skipHeaders.includes(key.toLowerCase())) return;
    res.setHeader(key, value);
  });

  const body = Buffer.from(await upstreamResponse.arrayBuffer());
  res.end(body);
}
