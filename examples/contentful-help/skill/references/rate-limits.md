# Contentful Rate Limits

- **Content Delivery API (CDA):** 78 requests/second
- **Content Management API (CMA):** 10 requests/second
- **Content Preview API (CPA):** 14 requests/second

Rate limit headers are included in every response:

- `X-Contentful-RateLimit-Hour-Limit`
- `X-Contentful-RateLimit-Hour-Remaining`
- `X-Contentful-RateLimit-Second-Limit`
- `X-Contentful-RateLimit-Second-Remaining`

When rate-limited, retry after the number of seconds in the `X-Contentful-RateLimit-Reset` header.
