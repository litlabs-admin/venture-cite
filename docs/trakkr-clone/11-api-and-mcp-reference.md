# Trakkr replication spec - part 11: API and MCP reference

Source of record: `https://trakkr.ai/learn/api/**`, `https://trakkr.ai/openapi.json`,
`https://trakkr.ai/mcp.json`, `https://trakkr.ai/.well-known/mcp/server-card.json`.
Captured 2026-08-10.

Method:
- Every `/learn/api` page was fetched as server-rendered HTML and read in full.
- `/learn/api/mcp` fails server-side rendering. Its content was read from the shipped
  chunks `ApiMcp-CBgGy7v0.js`, `mcpToolManifest-D69j383n.js` and `index-Dguo47UF.js`.
  The tool list, resource list, workflow list and install snippets below are the exact
  literals from those chunks.
- Where the documentation says nothing, this file says `NOT DOCUMENTED`.

---

## 1. Base, auth, limits, errors

### 1.1 Base URL and transport

| Item | Value |
|---|---|
| Base URL | `https://api.trakkr.ai` |
| Transport | HTTPS only. "All API requests must be made over HTTPS. Calls made over plain HTTP will fail." |
| Style | REST. JSON request bodies, JSON responses, standard HTTP codes and verbs. |
| OpenAPI | `https://trakkr.ai/openapi.json`, version 3.1.0, info version 1.1.0 |
| MCP server card | `https://trakkr.ai/.well-known/mcp/server-card.json` |
| MCP manifest | `https://trakkr.ai/mcp.json` |
| Assistant maps | `https://trakkr.ai/llms.txt`, `https://trakkr.ai/llms-full.txt` |

OpenAPI `info.description`, verbatim:

> Track your brand's visibility across AI search engines. Monitor how ChatGPT, Claude,
> Perplexity, and other AI models mention and recommend your brand. All endpoints
> authenticate with an API key (`Authorization: Bearer sk_live_...`). Unless an operation
> explicitly says it is idempotent, do not blindly retry a write after a timeout because
> the first attempt may have completed. There is no API-wide Idempotency-Key contract.

### 1.2 Authentication

| Item | Value |
|---|---|
| Scheme | API key as a bearer token. OpenAPI security scheme `HTTPBearer`, type `http`, scheme `bearer`. |
| Header | `Authorization: Bearer sk_live_xxxxxxxxxxxx` |
| REST key prefix | `sk_live_` |
| REST key access | "Full read/write access to all brands your account can access." |
| REST key plan | Scale plan ($500/mo) and above. Free and Growth plans have no API access. |
| Where to generate | Settings → Developer |
| MCP token prefix | `mcp_connect_` |
| MCP token plan | Every paid plan (Growth or Scale) |
| MCP token display | "Tokens start with `mcp_connect_` and are shown once." |
| Token lifetime | NOT DOCUMENTED. No expiry period is stated. The docs describe manual rotation only. |
| Refresh flow | NOT DOCUMENTED |
| Scopes | NOT DOCUMENTED. One key type only. |

Documented security practice: use environment variables, rotate keys regularly, use a
separate key per environment, and call only from server-side code.

Authentication errors, verbatim from the table:

| Status | Error Message | Description |
|---|---|---|
| 401 | Missing API key | No Authorization header was provided |
| 403 | Invalid API key | The API key doesn't exist or has been revoked |

Example authentication failure:

```json
{
  "error": "Invalid API key"
}
```

### 1.3 Rate limits

Rules, verbatim in substance:
- One kind of limit only: a per-minute count on each endpoint.
- The same on every plan. No burst allowance, no daily quota, no higher tier.
- "Limits are counted per calling IP address, not per API key."
- Two keys behind one server, NAT gateway or egress proxy share one budget.
- No rate limit headers on any response. No `X-RateLimit-Remaining`, `X-RateLimit-Limit`,
  `X-RateLimit-Reset` or `Retry-After`, including on the 429.
- Windows are one minute long. On a 429, sleep 60 seconds and retry once.

Per-endpoint limits, verbatim:

| Endpoint | Method | Rate Limit | Notes |
|---|---|---|---|
| /get-brands | GET | 60/min | |
| /get-brands/markets | POST | 30/min | Market limit per plan |
| /get-brands/markets | DELETE | 30/min | |
| /get-brands/aliases | PUT | 30/min | |
| /get-scores | GET | 60/min | |
| /get-prompts | GET | 60/min | |
| /get-prompts | POST | 30/min | |
| /get-prompts | PUT | 30/min | |
| /get-prompts | DELETE | 30/min | |
| /get-citations | GET | 60/min | |
| /get-competitor-data | GET | 60/min | |
| /get-rankings | GET | 60/min | |
| /get-models | GET | 60/min | |
| /get-opportunities | GET | 60/min | |
| /get-perception | GET | 60/min | |
| /get-perception | POST | 10/min | Triggers new analysis |
| /get-content-ideas | GET | 60/min | |
| /get-content-ideas | POST | 10/min | Triggers refresh |
| /get-reports | GET | 60/min | |
| /get-reports | POST | 5/min | Generates PDF report |
| /crawler/overview | GET | 60/min | |
| /crawler/live | GET | 60/min | |
| /crawler/pages | GET | 60/min | |
| /crawler/access | GET | 60/min | |
| /crawler/access/preview-fix | POST | 30/min | Preview only |
| /crawler/verification-ping | POST | 30/min | Editor access required |
| /crawler/submit-to-search | POST | 30/min | Editor access required |
| /crawler/submit-to-search/status | GET | 60/min | |
| /narratives | GET | 60/min | |
| /narratives | POST | 10/min | |
| /narratives | PATCH | 30/min | |
| /narratives | DELETE | 30/min | |
| /diagnose | POST | 10/min | 200/mo quota (Scale) |
| /diagnose | GET | 60/min | |
| /get-actions | GET | 60/min | |
| /get-action-stats | GET | 60/min | |
| /manage-action | POST | 30/min | Editor access required |
| /get-audits | GET | 60/min | |
| /get-audit-findings | GET | 60/min | |
| /get-opportunity-pool | GET | 60/min | |
| /commit-opportunity | POST | 30/min | Editor access required |
| /get-results | GET | 60/min | |
| /get-pages | GET | 60/min | |
| /get-page-analyses | GET | 60/min | |
| /prism | GET | 60/min | |
| /export | GET | 10/min | |

### 1.4 Error envelope

Standard shape. One field, `detail`:

```json
{
  "detail": "brand_id is required"
}
```

Object form of `detail`, used only by endpoints that check paid access and plan
entitlements:

```json
{
  "detail": {
    "code": "entitlement_verification_unavailable",
    "message": "We could not verify paid access for this brand right now. Please retry."
  }
}
```

Field meanings, verbatim:
- `detail` - "What went wrong, written for a person to read. This is a string on almost every endpoint."
- `code` - "Only on the object form of detail. A short, stable string you can branch on, such as `entitlement_verification_unavailable`."
- `message` - "Only on the object form of detail. The human-readable version of the same problem."

The one exception is 429, produced by the limiter before the request reaches the endpoint:

```json
{
  "error": "Rate limit exceeded: 60 per 1 minute"
}
```

Stated absences: there is no `type` field, no API-wide error-code taxonomy, and no
request-id header.

Status codes, verbatim:

| Code | Description |
|---|---|
| 200 | OK - Request succeeded |
| 201 | Created - Resource successfully created |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 403 | Forbidden - No permission to access resource |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Something went wrong |
| 503 | Service Unavailable - Temporary outage |

Real `detail` messages, verbatim:

| Status | When it happens | Example detail |
|---|---|---|
| 400 | A required query parameter is missing | brand_id is required |
| 400 | A parameter value is not one of the allowed options | Invalid view 'weekly'. Must be one of: by_model, by_prompt, summary, time_series |
| 401 | No Authorization header was sent | Missing API key |
| 401 | The key does not look like a Trakkr key | Invalid API key format. Keys must start with 'sk_live_' |
| 403 | The key is not recognised | Invalid API key |
| 403 | A monthly quota is used up | Monthly diagnosis limit reached (200). Upgrade your plan for more. |
| 404 | The brand does not exist, or your key cannot see it | Brand not found or no data available |
| 409 | The thing you are creating already exists | Market GB already exists for this brand |
| 500 | Something failed on our side | Failed to fetch scores |
| 503 | A dependency is briefly unavailable | Authentication service temporarily unavailable |

Note: 409 appears in this table but not in the status-code table.

### 1.5 Pagination conventions

Two conventions coexist. Both are documented.

| Convention | Parameters | Response shape | Used by |
|---|---|---|---|
| Offset | `limit`, `offset` | `pagination: {total, limit, offset, has_more}` or top-level `total, limit, offset` | /get-prompts, /get-citations, /get-content-ideas, /get-reports, /get-actions, /export |
| Cursor | `limit`, `cursor` | `meta: {total, limit, next_cursor}` | /get-opportunity-pool, /get-results, /get-pages, /crawler/live, /crawler/pages |

Verbatim: "These endpoints use cursors, not offsets. Read `meta.next_cursor` and pass it
back as `cursor` to get the next page. A null cursor means you have reached the end.
Older endpoints such as `/get-actions` keep their existing offset pagination unchanged."

---

## 2. Endpoint reference

Every endpoint requires the bearer API key. Every endpoint returns the `detail` error
envelope in section 1.4 unless stated. Rate limits are in section 1.3.

### 2.1 Brands

Page: `/learn/api/endpoints/brands`.

#### GET /get-brands

"Returns every brand your account can currently read through direct membership, a team
grant, or an active client assignment. Restricted team grants are included only when they
allow viewing. Client assignments always return the viewer role and cannot use write
endpoints."

Query parameters:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | no | - | Filter to a single brand by UUID |
| include | string | no | - | Comma-separated: "markets", "aliases", "profile" |

Note: "The favicon and location fields always come back, with no include needed."

Brand object:

| Field | Type | Description |
|---|---|---|
| id | string | Unique brand identifier (UUID) |
| name | string | Display name of the brand |
| website | string | Brand website URL |
| favicon | string, nullable | Favicon URL saved for the brand. Always returned; null if none was saved. |
| active | boolean | Whether the brand is active |
| role | string | Your role: "owner", "editor", or "viewer" |
| location | string | Primary market ISO-2 country code (e.g. "US", "GB"). Null if the brand is not geo-pinned (global mode). |
| location_region | string | Primary market region/state, if set |
| location_city | string | Primary market city, if set |
| markets | array | Markets (only when include=markets). Array of market objects. |
| aliases | array | Brand aliases (only when include=aliases). Array of strings. |
| description | string, nullable | The brand's own description (only when include=profile). |

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-brands?include=markets,aliases'
```

Example response (200):

```json
{
  "brands": [
    {
      "id": "00000000-0000-4000-8000-81f286d10c3c",
      "name": "Nike",
      "website": "https://nike.com",
      "favicon": "https://www.google.com/s2/favicons?domain=nike.com&sz=64",
      "active": true,
      "role": "owner",
      "aliases": ["Nike Inc", "Nike.com", "Nike Running"],
      "markets": [
        {
          "id": "m1a2b3c4-d5e6-7890-abcd-ef1234567890",
          "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
          "location": "US",
          "is_primary": true,
          "active": true,
          "created_at": "2026-01-15T10:00:00Z"
        },
        {
          "id": "m9a8b7c6-d5e4-3210-abcd-ef0987654321",
          "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
          "location": "GB",
          "is_primary": false,
          "active": true,
          "created_at": "2026-02-20T14:30:00Z"
        }
      ]
    }
  ]
}
```

Error codes shown on the page: 200, 401, 429.

#### POST /get-brands/markets

Body parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | Brand UUID |
| location | string | yes | ISO-2 country code (e.g. "US", "GB", "DE") |
| market_name | string | no | Optional display name for the market |

"The first market added to a brand automatically becomes the primary market."

Example request:

```
curl -X POST 'https://api.trakkr.ai/get-brands/markets' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"brand_id": "00000000-0000-4000-8000-81f286d10c3c", "location": "GB"}'
```

Example response (201):

```json
{
  "id": "m9a8b7c6-d5e4-3210-abcd-ef0987654321",
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "location": "GB",
  "is_primary": false,
  "active": true,
  "created_at": "2026-03-07T10:00:00Z"
}
```

Error codes shown: 201, 409.

Market object:

| Field | Type | Description |
|---|---|---|
| id | string | Market UUID |
| brand_id | string | Parent brand UUID |
| location | string | ISO-2 country code (e.g. "US", "GB", "DE") |
| is_primary | boolean | Whether this is the primary market |
| active | boolean | Whether the market is active |
| created_at | string | ISO 8601 creation timestamp |

#### DELETE /get-brands/markets

Query parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | Brand UUID |
| market_id | string | yes | Market UUID to remove |

"You cannot remove the primary market."

Example response: NOT DOCUMENTED.

#### PUT /get-brands/location

Body parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | Brand UUID |
| country | string | yes | ISO-2 country code (e.g. "GB", "US", "DE"). The alias "UK" and full country names are also accepted. |
| location_region | string | no | Optional region/state to narrow the market |
| location_city | string | no | Optional city to narrow the market further |
| location_dataseo_code | number | no | Optional DataForSEO location code for precise sub-country targeting |

Example request:

```
curl -X PUT 'https://api.trakkr.ai/get-brands/location' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"brand_id": "00000000-0000-4000-8000-81f286d10c3c", "country": "GB"}'
```

Example response (200):

```json
{
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "location": "GB",
  "location_region": null,
  "location_city": null,
  "location_dataseo_code": null,
  "primary_market": {
    "id": "m1a2b3c4-d5e6-7890-abcd-ef1234567890",
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
    "location": "GB",
    "is_primary": true,
    "active": true,
    "created_at": "2026-05-28T10:00:00Z"
  }
}
```

Error codes shown: 200, 400.

#### PUT /get-brands/aliases

Body parameters:

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | Brand UUID |
| aliases | string[] | yes | Array of alias strings |

"This replaces all existing aliases. To add an alias, include the existing aliases plus
the new one. Duplicates are automatically removed."

Response fields: `success` (boolean), `brand_id` (string), `aliases` (string[]),
`reports_updated` (integer, "How many past reports were recounted with the new alias list").

Example request:

```
curl -X PUT 'https://api.trakkr.ai/get-brands/aliases' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"brand_id": "00000000-0000-4000-8000-81f286d10c3c", "aliases": ["Nike Inc", "Nike.com", "Nike Running"]}'
```

Example response (200):

```json
{
  "success": true,
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "aliases": ["Nike Inc", "Nike.com", "Nike Running"],
  "reports_updated": 42
}
```

### 2.2 Scores

Page: `/learn/api/endpoints/scores`.

#### GET /get-scores

Query parameters:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand | string | yes | - | Brand ID from /get-brands (also accepts brand_id) |
| days | integer | no | 90 | Historical period in days (7-365) |
| view | string | no | summary | Which shape to return: summary, time_series, by_model, or by_prompt |
| tag_ids | string | no | - | Comma-separated tag UUIDs to filter prompts. Scores are recalculated using only matching prompts. |
| prompt_id | string | no | - | Single prompt UUID to filter scores to one prompt |

Views, verbatim:

| view | What you get back |
|---|---|
| summary | Default. brand, latest_scores, trend, historical and filters_applied. |
| time_series | brand, period_days, and time_series[] with date, visibility, presence, average_rank, mentions and models_mentioned per report. |
| by_model | brand, period_days, and models[] with model, visibility, presence and trend, from the latest report. |
| by_prompt | brand, period_days, and prompts[] with prompt_id, prompt_text, visibility, presence and average_rank, from the latest report. |

"The three extra views return a smaller brand object, with only id and name. They also
ignore tag_ids and prompt_id; filtering only applies to the summary view." An unrecognised
view returns 400.

Top-level fields: `brand`, `latest_scores`, `trend`, `historical`, `filters_applied`
(nullable; echo of `tag_ids` and `prompt_id` plus `matched_prompts`).

`latest_scores`: `visibility` (0-100), `presence` (0-100), `average_rank` (1.0-10.0,
nullable), `mentions` (integer), `models_mentioned` (integer), `model_scores` (object),
`date` (ISO 8601).

`trend`: `visibility_change` (nullable), `presence_change` (nullable), `period_days`,
`reports_count`.

`historical[]`: `date` (YYYY-MM-DD), `visibility`, `presence`, `average_rank` (nullable,
"Null when filters are active"), `mentions`.

Model key mapping, verbatim:

| Model Key | AI Model |
|---|---|
| ChatGPT | OpenAI GPT-4o |
| Claude | Anthropic Claude 3.5 Sonnet |
| Gemini | Google Gemini 2.0 Flash |
| Perplexity | Perplexity Sonar |
| Grok | xAI Grok 2 |

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-scores?brand=75ffdeb9-0924-4ff9-8ded-c2470d73d224&days=30'
```

Example response (200):

```json
{
  "brand": {
    "id": "75ffdeb9-0924-4ff9-8ded-c2470d73d224",
    "name": "Notion",
    "website": "https://www.notion.so",
    "competitors": ["Asana", "Monday.com", "ClickUp"]
  },
  "latest_scores": {
    "visibility": 42.5,
    "presence": 58.0,
    "average_rank": 3.2,
    "mentions": 127,
    "models_mentioned": 6,
    "model_scores": {
      "ChatGPT": { "visibility": 48.1, "presence": 62.0 },
      "Claude": { "visibility": 39.4, "presence": 55.5 }
    },
    "date": "2026-07-30T06:12:04Z"
  },
  "trend": {
    "visibility_change": 5.2,
    "presence_change": 3.1,
    "period_days": 30,
    "reports_count": 28
  },
  "historical": [
    {
      "date": "2026-07-01",
      "visibility": 37.3,
      "presence": 54.9,
      "average_rank": 3.6,
      "mentions": 112
    },
    {
      "date": "2026-07-30",
      "visibility": 42.5,
      "presence": 58.0,
      "average_rank": 3.2,
      "mentions": 127
    }
  ],
  "filters_applied": null
}
```

Error codes shown: 200, 400, 404.

### 2.3 Prompts and tags

Page: `/learn/api/endpoints/prompts`.

Note on the page: "This endpoint uses Supabase UUIDs. Use the brand UUID from the Supabase
database, not the Bubble ID from /get-brands."

#### GET /get-prompts

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands |
| active_only | boolean | no | false | Only return active prompts |
| tag_ids | string | no | - | Comma-separated tag UUIDs to filter prompts by tag |
| limit | integer | no | 100 | Results per page (1-500) |
| offset | integer | no | 0 | Pagination offset |

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-prompts?brand_id=00000000-0000-4000-8000-234e03c0ef68'
```

Example response (200):

```json
{
  "prompts": [
    {
      "id": "00000000-0000-4000-8000-234e03c0ef68",
      "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
      "text": "What are the best CRM tools for enterprise?",
      "active": true,
      "focus_area": "enterprise",
      "intent": "recommendation",
      "audience": "enterprise",
      "specificity": 3,
      "quality_score": 85,
      "source": "generated",
      "created_at": "2026-01-05T08:00:00Z",
      "updated_at": "2026-01-08T14:30:00Z",
      "tags": [
        { "id": "a1b2c3d4-...", "name": "Enterprise", "colour": "#2563eb" }
      ]
    }
  ],
  "total": 25,
  "limit": 100,
  "offset": 0
}
```

Prompt object fields: `id`, `brand_id`, `text`, `active`, `focus_area` (nullable),
`intent` (nullable), `audience` (nullable), `specificity` (integer 1-5, nullable),
`quality_score` (integer 0-100, nullable), `source` ("generated", "manual", or "api"),
`created_at`, `updated_at`, `tags` (nullable array of `{id, name, colour}`).

Enums:
- `focus_area`: general, budget, enterprise, features, ux, integrations, comparisons, industry, geographic, trends
- `intent`: recommendation, comparison, alternative, discovery, best_for
- `audience`: enterprise, smb, consumer, developer, general

#### POST /get-prompts

Body parameters:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID |
| text | string | yes | - | Prompt text (max 500 characters) |
| active | boolean | no | true | Enable tracking immediately |
| focus_area | string | no | - | Topic category (see enum) |
| intent | string | no | - | User intent type (see enum) |
| audience | string | no | - | Target audience (see enum) |

Example request:

```
curl -X POST 'https://api.trakkr.ai/get-prompts' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
    "text": "What are the best CRM tools for healthcare?",
    "active": true,
    "focus_area": "industry",
    "intent": "recommendation"
  }'
```

Example response: NOT DOCUMENTED.

#### PUT /get-prompts

"Update an existing prompt. Include prompt_id in the request body." Other body parameters:
NOT DOCUMENTED. Example: NOT DOCUMENTED.

#### DELETE /get-prompts?prompt_id={id}

"Delete a prompt. Historical data for this prompt will be retained." Example:
NOT DOCUMENTED.

#### GET /get-tags

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | Brand UUID |

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-tags?brand_id=00000000-0000-4000-8000-81f286d10c3c'
```

Example response (200):

```json
{
  "tags": [
    {
      "id": "a1b2c3d4-...",
      "name": "Enterprise",
      "colour": "#2563eb",
      "prompt_count": 6
    }
  ],
  "total": 1
}
```

Tag object: `id`, `name` ("unique by name within the brand"), `colour` (nullable,
six-digit hex), `prompt_count`.

#### POST /manage-prompt-tags

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| action | string | yes | - | create, update, delete, add, or remove |
| brand_id | string | yes | - | Brand UUID |
| tag_id | string | no | - | Required for update/delete; optional selector for add/remove |
| tag_name | string | no | - | Required for create; optional selector for add/remove |
| colour | string | no | - | Optional six-digit hex colour such as #2563eb |
| prompt_ids | string[] | no | - | Required for add/remove; 1-200 brand prompt UUIDs |
| create_if_missing | boolean | no | true | Create a missing tag when adding by name |

"Add and remove are safe to retry. For add/remove, provide exactly one of tag_id or
tag_name. Editor access is required for every action."

Example request:

```
curl -X POST 'https://api.trakkr.ai/manage-prompt-tags' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "add",
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
    "tag_name": "Enterprise",
    "prompt_ids": ["00000000-0000-4000-8000-234e03c0ef68"]
  }'
```

Example response: NOT DOCUMENTED.

### 2.4 Citations

Page: `/learn/api/endpoints/citations`.

#### GET /get-citations

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands |
| view | string | no | list | View mode: list, history, queries, sources, feed, heatmap |
| limit | integer | no | 100 | Results per page (1-500) |
| offset | integer | no | 0 | Pagination offset |
| domain | string | no | - | Filter by domain (partial match). Required when view=sources. |
| days | integer | no | 30 | Historical period in days (7-365, for view=history) |
| days_back | integer | no | 7 | Days back for feed comparison (1-30, for view=feed) |
| tag_ids | string | no | - | Comma-separated tag UUIDs. Only returns citations from prompts with these tags. |
| prompt_text | string | no | - | Filter citations by prompt text (partial match) |

Views, verbatim:

| View | Description |
|---|---|
| list | Default. Paginated citation URLs. |
| history | Time series of citation counts, brand mentions, and sentiment. |
| queries | Query-level analytics with intent clustering and gap analysis. |
| sources | Full domain profile. Requires domain parameter. |
| feed | Change feed: new, lost, and changed citations. |
| heatmap | Brand vs competitors presence matrix across top domains. |

Citation object: `id`, `url`, `domain`, `page_title` (nullable), `prompt.text`,
`prompt.type`, `metrics.appearances`, `metrics.sentiment` (positive, neutral, negative),
`metrics.visibility_score` (0-100), `seo.domain_rating` (0-100), `source_type` (organic,
paid, direct), `search_model`, `date` (YYYY-MM-DD).

Example request (default list view):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-citations?brand_id=00000000-0000-4000-8000-81f286d10c3c&limit=50'
```

Example response (200):

```json
{
  "brand": {
    "id": "00000000-0000-4000-8000-81f286d10c3c",
    "name": "Notion"
  },
  "citations": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "url": "https://techcrunch.com/notion-review",
      "domain": "techcrunch.com",
      "page_title": "Notion Review: The Best Workspace Tool for 2026",
      "prompt": {
        "text": "What are the best CRM tools for enterprise?",
        "type": "commercial"
      },
      "metrics": {
        "appearances": 5,
        "sentiment": "positive",
        "visibility_score": 85
      },
      "seo": {
        "domain_rating": 92
      },
      "source_type": "organic",
      "search_model": "gpt-4o",
      "date": "2026-01-08"
    }
  ],
  "pagination": {
    "total": 250,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

Example request (view=history):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-citations?brand_id=BRAND_ID&view=history&days=30'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "brand_time_series": [
    {
      "date": "2026-02-01",
      "total_citations": 142,
      "brand_mentions": 98,
      "unique_sources": 67,
      "avg_sentiment": 72.4
    }
  ],
  "competitor_time_series": {
    "Coda": [{ "date": "2026-02-01", "mentions": 45 }]
  },
  "snapshots_available": 8,
  "date_range": { "start": "2026-02-01", "end": "2026-03-01" }
}
```

Example request (view=queries):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-citations?brand_id=BRAND_ID&view=queries'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "clusters": [
    {
      "intent": "comparison",
      "label": "Comparison Queries",
      "queries": ["notion vs coda", "notion vs confluence"],
      "total_citations": 24,
      "brand_appears_in": 18,
      "coverage_rate": 75.0
    }
  ],
  "top_queries": [
    {
      "query": "best project management tools",
      "intent": "recommendation",
      "frequency": 12,
      "citations_found": 8,
      "brand_appears": true,
      "top_sources": ["techcrunch.com", "g2.com"],
      "competitors_appearing": ["Coda", "Confluence"],
      "is_new": false,
      "trend": "up"
    }
  ],
  "gap_queries": [],
  "coverage_by_intent": { "comparison": 75.0, "recommendation": 60.0 },
  "new_queries_count": 3,
  "rising_queries_count": 5
}
```

Example request (view=sources):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-citations?brand_id=BRAND_ID&view=sources&domain=techcrunch.com'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "domain": "techcrunch.com",
  "total_citations": 45,
  "unique_pages": 12,
  "mentions_you": true,
  "mention_count": 8,
  "competitors_on_domain": ["Coda", "Confluence"],
  "avg_sentiment": 74.2,
  "pages": [
    {
      "url": "https://techcrunch.com/notion-review",
      "h1": "Notion Review 2026",
      "sentiment": 82,
      "mentions_brand": true,
      "competitors": ["Coda"],
      "appearance_count": 5
    }
  ],
  "first_seen": "2025-11-15",
  "last_seen": "2026-03-01"
}
```

"Returns 400 if the domain parameter is not provided, or 404 if no citations exist for
that domain."

Example request (view=feed):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-citations?brand_id=BRAND_ID&view=feed&days_back=7'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "events": [
    {
      "event_type": "new",
      "url": "https://zapier.com/blog/notion-tips",
      "domain": "zapier.com",
      "h1": "10 Notion Tips for 2026",
      "source_type": "earned_media",
      "timestamp": "2026-03-01",
      "mentions_brand": true,
      "sentiment": 78,
      "appearance_count": 3,
      "prompts": ["best productivity tools"]
    },
    {
      "event_type": "lost",
      "url": "https://old-blog.com/notion",
      "domain": "old-blog.com",
      "timestamp": "2026-02-25"
    }
  ],
  "current_snapshot_date": "2026-03-01",
  "previous_snapshot_date": "2026-02-22",
  "total_current": 250,
  "total_previous": 245
}
```

Feed event types: new, lost, sentiment_changed, competitor_appeared. Field
`prev_sentiment` is present only for sentiment_changed.

Example request (view=heatmap):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-citations?brand_id=BRAND_ID&view=heatmap'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "domains": ["techcrunch.com", "g2.com", "zapier.com"],
  "brands": ["Notion", "Coda", "Confluence"],
  "your_brand": "Notion",
  "cells": [
    { "domain": "techcrunch.com", "brand": "Notion", "is_present": true, "mention_count": 8 },
    { "domain": "techcrunch.com", "brand": "Coda", "is_present": true, "mention_count": 3 }
  ],
  "your_coverage": 86.7,
  "competitor_coverage": { "Coda": 60.0, "Confluence": 46.7 }
}
```

### 2.5 Competitors

Page: `/learn/api/endpoints/competitors`.

#### GET /get-competitor-data

"The default response has exactly three keys: brand_performance_summary,
top_spot_ownership and primary_brand_cooccurrences."

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands. The legacy `brand` alias is also accepted. |
| view | string | no | summary | View mode: summary, arena, head-to-head, by-model, threats, heatmap, over_time |
| competitor | string | conditional | - | Competitor name (required when view=head-to-head) |

"Any other value returns 400 with the list of valid views."

Views, verbatim:

| View | Description |
|---|---|
| summary | Default. Full competitive analysis with rankings and co-occurrences. |
| arena | Prompt-by-prompt battlegrounds with leaders, gaps, and rankings. |
| head-to-head | Direct 1v1 comparison. Requires competitor parameter. |
| by-model | Competitive breakdown per AI model. |
| threats | Competitive threats, opportunity prompts, alerts, and summary counts. |
| heatmap | Brand-by-model cells, plus your best and worst model. |
| over_time | Visibility per brand over the last 90 days. |

Default example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-competitor-data?brand_id=00000000-0000-4000-8000-81f286d10c3c'
```

```json
{
  "brand_performance_summary": [
    { "brand_name": "Notion", "total_mentions": 127, "avg_rank": 2.8 },
    { "brand_name": "Coda", "total_mentions": 98, "avg_rank": 3.4 }
  ]
}
```

Note: the docs show only the first key of the default example. The other two documented
keys are `top_spot_ownership` (fields `prompt`, `top_brand`, `count`; up to 10 rows) and
`primary_brand_cooccurrences` (fields `competitor`, `count`, `primary_wins_pct`; up to 10
rows).

view=arena:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-competitor-data?brand_id=BRAND_ID&view=arena'
```

```json
{
  "prompts": [
    {
      "prompt_text": "best team knowledge base",
      "your_rank": 2,
      "your_score": 2.4,
      "leader": "Coda",
      "leader_score": 1.6,
      "gap_to_leader": 0.8,
      "total_competitors": 6,
      "rankings": [
        { "rank": 1, "name": "Coda", "score": 1.6, "is_you": false },
        { "rank": 2, "name": "Notion", "score": 2.4, "is_you": true }
      ]
    }
  ],
  "total_prompts": 45,
  "prompts_you_lead": 12,
  "prompts_top_3": 31
}
```

view=head-to-head:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-competitor-data?brand_id=BRAND_ID&view=head-to-head&competitor=Coda'
```

```json
{
  "you": {
    "name": "Notion",
    "visibility": 42.5,
    "visibility_change": 3.1,
    "avg_rank": 2.4,
    "rank1_count": 12
  },
  "rival": {
    "name": "Coda",
    "visibility": 36.2,
    "visibility_change": null,
    "avg_rank": 3.1,
    "rank1_count": 8
  },
  "head_to_head": {
    "your_wins": 18,
    "rival_wins": 10,
    "ties": 4,
    "your_win_rate": 0.56,
    "total_matchups": 32
  },
  "where_rival_wins": [
    {
      "prompt_text": "best document collaboration tools",
      "your_rank": 3,
      "rival_rank": 1
    }
  ],
  "where_you_win": [
    {
      "prompt_text": "best project management tools 2026",
      "your_rank": 1,
      "rival_rank": 4
    }
  ],
  "available_rivals": ["Coda", "Confluence", "Slite"]
}
```

"Returns 400 if the competitor parameter is not provided, or 404 if the competitor is not
found in your competitive set."

view=by-model:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-competitor-data?brand_id=BRAND_ID&view=by-model'
```

```json
{
  "llms": ["ChatGPT", "Claude", "Perplexity"],
  "brands": ["Notion", "Coda", "Confluence"],
  "your_brand": "Notion",
  "heatmap": [
    {
      "brand": "Notion",
      "llm": "ChatGPT",
      "visibility": 48.2,
      "avg_rank": 2.4,
      "mentions": 45,
      "is_you": true
    }
  ],
  "insights": [
    { "type": "strength", "llm": "ChatGPT", "message": "You perform best on ChatGPT" }
  ],
  "your_best_llm": "ChatGPT",
  "your_worst_llm": "Gemini"
}
```

view=threats:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-competitor-data?brand_id=BRAND_ID&view=threats'
```

```json
{
  "threats": [
    {
      "competitor": "Coda",
      "severity": "high",
      "pressure_score": 0,
      "win_rate_against_you": 0.61,
      "cooccurrence_count": 32,
      "trend": "gaining",
      "description": "Wins 61% of 32 head-to-head matchups"
    }
  ],
  "opportunities": [
    {
      "prompt_text": "best CRM for startups",
      "your_rank": 0,
      "gap_to_next": 0,
      "next_competitor": "Coda",
      "opportunity_score": 6,
      "category": "comparison"
    }
  ],
  "alerts": [
    {
      "type": "threat",
      "severity": "high",
      "message": "Coda is gaining on comparison prompts",
      "prompt": "best team knowledge base",
      "competitor": "Coda"
    }
  ],
  "summary": {
    "total_threats": 1,
    "critical_threats": 0,
    "high_threats": 1,
    "total_opportunities": 1,
    "high_value_opportunities": 1
  }
}
```

Documented caveat: "pressure_score is not populated yet and always comes back as 0."

view=over_time:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-competitor-data?brand_id=BRAND_ID&view=over_time'
```

```json
{
  "brands": [
    {
      "name": "Notion",
      "is_you": true,
      "data_points": [
        { "date": "2026-05-02", "visibility": 38.2 },
        { "date": "2026-05-09", "visibility": 41.1 }
      ]
    },
    {
      "name": "Coda",
      "is_you": false,
      "data_points": [
        { "date": "2026-05-09", "visibility": 36.4 }
      ]
    }
  ],
  "period_days": 90,
  "date_range": { "start": "2026-05-02", "end": "2026-07-28" }
}
```

`period_days` is "Always 90". view=heatmap example: NOT DOCUMENTED.

### 2.6 Rankings

Page: `/learn/api/endpoints/rankings`.

#### GET /get-rankings

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands |
| view | string | no | overall | View mode: overall, by-prompt |
| days | integer | no | 30 | Lookback period in days (7-365) |
| include_volume | boolean | no | false | Merge search volume data (only for view=by-prompt) |

view=overall:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-rankings?brand_id=BRAND_ID&days=30'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "your_rank": 2,
  "total_competitors": 6,
  "your_visibility": 72.4,
  "your_visibility_change": 3.1,
  "win_rate": 61.5,
  "threat_count": 2,
  "rankings": [
    {
      "rank": 1,
      "name": "Competitor A",
      "visibility": 79.8,
      "visibility_change": 1.2,
      "is_you": false,
      "h2h_win_rate": 48.5
    },
    {
      "rank": 2,
      "name": "Notion",
      "visibility": 72.4,
      "visibility_change": 3.1,
      "is_you": true,
      "h2h_win_rate": null
    }
  ]
}
```

view=by-prompt:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-rankings?brand_id=BRAND_ID&view=by-prompt&days=30'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "prompts": [
    {
      "prompt_id": "abc-123",
      "prompt_text": "best project management tools 2026",
      "markets": [
        {
          "location": "US",
          "is_primary": true,
          "score": 74.2
        },
        {
          "location": "UK",
          "is_primary": false,
          "score": 68.1
        }
      ]
    }
  ]
}
```

With `include_volume=true`:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-rankings?brand_id=BRAND_ID&view=by-prompt&include_volume=true'
```

```json
{
  "brand": { "id": "...", "name": "Notion" },
  "prompts": [
    {
      "prompt_id": "abc-123",
      "prompt_text": "best project management tools 2026",
      "markets": [
        {
          "location": "US",
          "is_primary": true,
          "score": 74.2,
          "search_volume": 12400,
          "priority_score": 82.0
        }
      ]
    }
  ]
}
```

### 2.7 Models

Page: `/learn/api/endpoints/models`.

#### GET /get-models

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands |
| days | integer | no | 30 | Analysis period (7-365) |
| include_trends | boolean | no | false | Include daily breakdown |

Model object: `model`, `total_queries`, `mentions`, `visibility_rate` (0-100),
`average_position` (1.0-10.0), `top_3_rate`, `top_3_count`.

Models tracked, verbatim:

| Model Name | Provider | Model ID |
|---|---|---|
| ChatGPT | OpenAI | gpt-4o |
| Claude | Anthropic | claude-3-5-sonnet |
| Gemini | Google | gemini-2.0-flash |
| Perplexity | Perplexity AI | llama-3.1-sonar |
| Grok | xAI | grok-2 |

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-models?brand_id=00000000-0000-4000-8000-81f286d10c3c&days=30'
```

Example response (200):

```json
{
  "models": [
    {
      "model": "ChatGPT",
      "total_queries": 150,
      "mentions": 68,
      "visibility_rate": 45.3,
      "average_position": 2.1,
      "top_3_rate": 82.4,
      "top_3_count": 56
    },
    {
      "model": "Claude",
      "total_queries": 150,
      "mentions": 72,
      "visibility_rate": 48.0,
      "average_position": 1.9,
      "top_3_rate": 88.9,
      "top_3_count": 64
    },
    {
      "model": "Gemini",
      "total_queries": 150,
      "mentions": 52,
      "visibility_rate": 34.7,
      "average_position": 2.8,
      "top_3_rate": 71.2,
      "top_3_count": 37
    }
  ],
  "summary": {
    "total_results": 450,
    "total_mentions": 192,
    "overall_visibility_rate": 42.7,
    "model_count": 3
  }
}
```

Note: the `summary` object continues past `model_count` in the page source. Remaining
keys: NOT DOCUMENTED.

### 2.8 Opportunities

Page: `/learn/api/endpoints/opportunities`.

#### GET /get-opportunities

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands |
| days | integer | no | 30 | Analysis period (7-365) |
| limit | integer | no | 50 | Max opportunities to return (1-200) |

Opportunity types: `not_mentioned` (HIGH), `uncited` (MEDIUM), `low_position` (LOW).

Opportunity object: `result_id`, `prompt_text` (truncated to 200 chars), `llm`, `date`,
`competitors` (name + position), `opportunity_type`, `priority` (high, medium, low),
`reason`.

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-opportunities?brand_id=00000000-0000-4000-8000-81f286d10c3c&days=30'
```

Example response (200):

```json
{
  "opportunities": [
    {
      "result_id": "e5f6a7b8-c9d0-1234-ef56-789012345678",
      "prompt_text": "What are the best CRM tools for real estate agents?",
      "llm": "gpt-4o",
      "date": "2026-01-08",
      "competitors": [
        { "name": "Competitor A", "position": 1 },
        { "name": "Competitor B", "position": 2 }
      ],
      "opportunity_type": "not_mentioned",
      "priority": "high",
      "reason": "Competitors mentioned (2) but your brand is not"
    },
    {
      "result_id": "f6a7b8c9-d0e1-2345-f678-901234567890",
      "prompt_text": "Best enterprise CRM with Salesforce integration",
      "llm": "claude-3-5-sonnet",
      "date": "2026-01-08",
      "competitors": [],
      "opportunity_type": "uncited",
      "priority": "medium",
      "reason": "Your brand is mentioned but no citation URL"
    }
  ],
  "summary": {
    "total_opportunities": 23,
    "not_mentioned_count": 12,
    "uncited_count": 7,
    "low_position_count": 4,
    "period_days": 30
  },
  "brand": {
    "name": "Notion",
    "website": "https://notion.so"
  }
}
```

### 2.9 Export

Page: `/learn/api/endpoints/export`.

#### GET /export

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands |
| data_type | string | yes | - | What to export: prompts, results, citations, reports |
| format | string | no | json | Output format: json or csv |
| days | integer | no | 30 | For time-based data (results, citations) |
| limit | integer | no | 1000 | Max records to export |

Data types, verbatim:

| data_type | Description | Time Filter |
|---|---|---|
| prompts | All prompts for the brand | No |
| results | AI response results with mentions | Yes (days param) |
| citations | Citation URLs | Yes (days param) |
| reports | Daily report summaries | Yes (days param) |

CSV export sends `Content-Type: text/csv`, a `Content-Disposition` header with filename,
and column headers in the first row.

Limits: max records per request 10,000. Max days for time-based exports 365.

Example request (JSON):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/export?brand_id=00000000-0000-4000-8000-81f286d10c3c&data_type=prompts&format=json'
```

Example response (200):

```json
{
  "data_type": "prompts",
  "count": 25,
  "data": [
    {
      "id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
      "text": "What are the best CRM tools?",
      "active": true,
      "focus_area": "general",
      "intent": "recommendation",
      "quality_score": 85,
      "created_at": "2026-01-05T08:00:00Z"
    }
  ],
  "exported_at": "2026-01-09T10:30:00Z"
}
```

Example request (CSV):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/export?brand_id=00000000-0000-4000-8000-81f286d10c3c&data_type=results&format=csv&days=90' \
  -o trakkr_results.csv
```

### 2.10 AI Pages (prism)

Page: `/learn/api/endpoints/prism`. The page title is "AI Pages".

#### GET /ai-pages

"The legacy path `/prism` still works as an alias for `/ai-pages`, but new integrations
should use `/ai-pages`."

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | The brand UUID to get AI Pages data for |

Top-level: `brand`, `config` (nullable), `usage` (nullable).

`config`: `enabled`, `domain`, `platform` (cloudflare, vercel, netlify, nextjs,
cloudfront, wordpress, node, or other), `features`, `crawlers`.

`usage`: `requests_this_month`, `requests_limit`, `percentage_used`, `reset_date`.

Requirements: "This endpoint requires a paid plan with the AI Pages entitlement. Returns a
403 if your plan does not include this feature."

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/ai-pages?brand_id=00000000-0000-4000-8000-81f286d10c3c'
```

Example response (200):

```json
{
  "brand": {
    "id": "00000000-0000-4000-8000-81f286d10c3c",
    "name": "Notion",
    "website": "https://notion.so"
  },
  "config": {
    "enabled": true,
    "domain": "notion.so",
    "platform": "cloudflare",
    "features": [
      "structureddatainjection",
      "keyfactsextraction",
      "automatedfaqgeneration",
      "aisummaryblock"
    ],
    "crawlers": [
      "gptbot",
      "claudebot",
      "perplexitybot",
      "googleother"
    ]
  },
  "usage": {
    "requests_this_month": 4280,
    "requests_limit": 10000,
    "percentage_used": 42.8,
    "reset_date": "2026-04-01T00:00:00+00:00"
  }
}
```

Not-enabled response (200):

```json
{
  "brand": {
    "id": "00000000-0000-4000-8000-81f286d10c3c",
    "name": "Notion",
    "website": "https://notion.so"
  },
  "config": null,
  "usage": null
}
```

### 2.11 Webhooks

Page: `/learn/api/endpoints/webhooks`. See section 4 for the full webhook contract.

Quick reference, verbatim:

| Endpoint | Description |
|---|---|
| POST /webhooks | Create a webhook |
| GET /webhooks | List webhooks |
| GET /webhooks/:id | Retrieve a webhook |
| DELETE /webhooks/:id | Delete a webhook |
| POST /webhooks/:id/test | Send a test webhook |

Rate limit shown on the page header: "10 to 60 req/min".

### 2.12 Crawler

Page: `/learn/api/endpoints/crawler`. Header: "60 req/min reads, 30 req/min actions".

"The legacy `/get-crawler` endpoint still exists as a compatibility route."

#### GET /crawler/overview

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand ID from /get-brands |
| range_preset | string | no | 30d | "24h", "7d", "30d", "90d", or "custom" |
| start_date | string | conditional | - | Required when range_preset=custom. Format YYYY-MM-DD |
| end_date | string | conditional | - | Required when range_preset=custom. Format YYYY-MM-DD |
| compare_to | string | no | none | "none" or "previous_period" |

Endpoint suite, verbatim:

| Method | Path | Description |
|---|---|---|
| GET | /crawler/overview | Hero stats, chart, setup state, top pages, and recent preview. |
| GET | /crawler/live | Live tab views: activity, pages, and sessions with dashboard filters. |
| GET | /crawler/pages | Pages tab lenses: pages, paths, and bots with dashboard sorting and pagination. |
| GET | /crawler/page-details | Page drawer sections: verdict, pipeline, health, traffic, diagnostics. |
| GET | /crawler/path-details | Path drawer sections: verdict, pipeline, top pages, top bots, diagnostics. |
| GET | /crawler/bot-details | Bot drawer sections: verdict, pipeline, top pages, top paths, diagnostics. |
| GET | /crawler/access | Access tab data: findings, bot access matrix, robots.txt, llms.txt, submit-to-search. |
| POST | /crawler/access/preview-fix | Preview an access fix without applying it. |
| POST | /crawler/verification-ping | Send the synthetic verification ping shown in the dashboard. |
| POST | /crawler/submit-to-search | Submit URLs to AI search via Bing IndexNow. |
| GET | /crawler/submit-to-search/status | Read submit-to-search status and the current summary. |

Filter vocabulary: `intent` supports all, interaction, search, training. Page status uses
converting, cited, crawled, healthy, cold.

"POST /crawler/access/preview-fix is preview-only. Fix application remains internal."
There is no public endpoint to auto-apply crawler fixes.

Parameters for the other crawler endpoints: NOT DOCUMENTED on this page. The MCP tool
reference in section 3 lists them.

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/crawler/overview?brand_id=00000000-0000-4000-8000-81f286d10c3c&range_preset=30d&compare_to=previous_period'
```

Example response (200):

```json
{
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "range": {
    "range_preset": "30d",
    "start": "2026-03-18",
    "end": "2026-04-17",
    "days": 30,
    "compare_to": "previous_period"
  },
  "state": {
    "has_tracking_id": true,
    "has_historical_data": true,
    "tracking_id": "00000000-0000-4000-8000-81f286d10c3c"
  },
  "hero": {
    "total_visits": 1842,
    "total_visits_change": 23.5,
    "unique_pages": 47,
    "unique_pages_change": 12.0,
    "avg_daily_visits": 61.4,
    "top_crawler": "ChatGPT"
  },
  "chart": {
    "series": [
      { "date": "2026-04-10", "count": 72, "by_crawler": { "ChatGPT": 38, "Perplexity": 21 } }
    ],
    "distribution": [
      { "crawler": "ChatGPT", "count": 892, "percentage": 48.4 }
    ],
    "bot_type_summary": { "training": 621, "search": 504, "interaction": 717, "agent": 0, "other": 0 }
  },
  "breakdown": {
    "distribution": [
      { "crawler": "ChatGPT", "count": 892, "percentage": 48.4 }
    ],
    "top_crawler": "ChatGPT",
    "search_bot_visits": 821,
    "crawl_efficiency_pct": 71.3
  },
  "top_pages": [
    { "url": "https://example.com/pricing", "count": 312, "crawlers": ["ChatGPT", "Perplexity"] }
  ],
  "recent_preview": [
    {
      "id": "0",
      "url": "https://example.com/pricing",
      "platform": "ChatGPT",
      "intent": "interaction",
      "visited_at": "2026-04-17T13:11:00Z",
      "status_code": 200
    }
  ]
}
```

Error codes shown: 200, 403.

### 2.13 Content ideas

Page: `/learn/api/endpoints/content-ideas`.

#### GET /get-content-ideas

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID from /get-brands |
| limit | integer | no | 50 | Results per page (1-200) |
| offset | integer | no | 0 | Pagination offset |
| status | string | no | - | Filter by status: active, dismissed, or implemented |

Idea types, verbatim:

| Type | Description |
|---|---|
| prompt_gap | Queries where competitors appear but your brand doesn't |
| citation_gap | High-citation queries where your brand could be referenced |
| position_weak | Queries where your brand ranks low and could improve |
| rising | Trending topics gaining traction in AI responses |
| campaign | Multi-piece content campaigns targeting a theme |

Idea object: `id`, `type`, `query`, `insight` (nullable), `opportunity_score` (0-100),
`status`, `recommended_template` (nullable), `competitors_appearing` (string[]),
`ai_models` (string[]), `your_position` (integer, nullable), `created_at`.

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-content-ideas?brand_id=00000000-0000-4000-8000-81f286d10c3c&status=active&limit=20'
```

Example response (200):

```json
{
  "ideas": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "prompt_gap",
      "query": "best project management tools for remote teams",
      "insight": "Competitors appear in 4 AI models but your brand is absent",
      "opportunity_score": 87,
      "status": "active",
      "recommended_template": "Comparison Roundup",
      "competitors_appearing": ["Asana", "Monday.com", "ClickUp"],
      "ai_models": ["ChatGPT", "Claude", "Perplexity", "Gemini"],
      "your_position": null,
      "created_at": "2026-03-07T08:00:00Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
      "type": "citation_gap",
      "query": "how to improve team collaboration",
      "insight": "High citation potential with 12 source appearances",
      "opportunity_score": 72,
      "status": "active",
      "recommended_template": "How-To Guide",
      "competitors_appearing": ["Slack", "Notion"],
      "ai_models": ["ChatGPT", "Perplexity"],
      "your_position": 5,
      "created_at": "2026-03-07T08:00:00Z"
    }
  ],
  "pagination": {
    "total": 24,
    "limit": 20,
    "offset": 0,
    "has_more": true
  },
  "meta": {
    "generated_at": "2026-03-07T08:00:00Z",
    "generation_status": "completed",
    "total_opportunities": 24
  }
}
```

Error codes shown: 200, 400.

#### POST /get-content-ideas

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | Brand UUID |
| action | string | yes | Must be "refresh" |

Example request:

```
curl -X POST 'https://api.trakkr.ai/get-content-ideas' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"brand_id": "00000000-0000-4000-8000-81f286d10c3c", "action": "refresh"}'
```

Example response (200):

```json
{
  "status": "generating",
  "message": "Content ideas refresh started. Poll GET /get-content-ideas to check progress."
}
```

"If generation is already in progress, the endpoint returns `already_generating` without
starting a duplicate job."

### 2.14 Pool, results and pages

Page: `/learn/api/endpoints/pool-results-pages`. The path
`/learn/api/endpoints/pool-proof-pages` serves byte-identical content.

"`/get-opportunity-pool` is not the same thing as `/get-opportunities`."

#### GET /get-opportunity-pool

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | The brand to read. |
| family | string | no | - | fix, refresh, create, earn, discuss, optimize, setup or play. |
| kind | string | no | - | Comma-separated kinds, e.g. 'search_gap,audit_fix'. |
| impact | string | no | - | low, medium or high. |
| limit | int | no | 50 | 1-200. |
| cursor | string | no | - | Opaque cursor from meta.next_cursor. |

"Only two statuses ever come back: new and seen."

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-opportunity-pool?brand_id=00000000-0000-4000-8000-81f286d10c3c&family=fix&limit=20'
```

Example response (200):

```json
{
  "opportunities": [
    {
      "id": "e1f2a3b4-...",
      "kind": "audit_fix",
      "family": "fix",
      "title": "Add a meta description to /help/returns",
      "impact": "high",
      "status": "new",
      "evidence": [
        {
          "kind": "signal",
          "source": "site_audit",
          "observed_at": "2026-07-28T06:00:00Z",
          "payload": { "label": "Missing since", "value": "12 days" },
          "deep_link": "https://app.trakkr.ai/optimize"
        }
      ],
      "page_id": "9a8b...",
      "page_url": "https://example.com/help/returns",
      "dedup_key": "audit_fix:meta_description:https://example.com/help/returns",
      "expires_at": "2026-08-18T06:00:00Z",
      "created_at": "2026-07-28T06:00:00Z"
    }
  ],
  "meta": { "total": 137, "limit": 20, "next_cursor": "o:20" }
}
```

#### POST /commit-opportunity

| Name | Type | Required | Default | Location | Description |
|---|---|---|---|---|---|
| brand_id | string | yes | - | query | The brand that owns the suggestion. |
| opportunity_id | string | yes | - | body | The suggestion to decide on. |
| action | string | no | 'commit' | body | commit, dismiss or snooze. |
| reason | string | no | - | body | Why it was dismissed. Recommended for action='dismiss'. |
| snooze_days | int | no | 7 | body | 1-90. |

Behaviour, verbatim:
- A commit returns `status`, `opportunity_id`, `action_id` and the frozen
  `measurement_plan`.
- Dismiss and snooze return only `status` and `opportunity_id`.
- Setup work is never measured, so its plan comes back null.
- Committing something already committed returns `already_accepted` with the existing
  action id.
- `snooze_days` outside 1-90 is rejected with 422 before the call runs.
- An action other than commit, dismiss or snooze returns 400.
- An `opportunity_id` that belongs to another brand returns 404.
- "This endpoint cannot grant an agent permission to do anything."

Example request:

```
curl -X POST 'https://api.trakkr.ai/commit-opportunity?brand_id=00000000-0000-4000-8000-81f286d10c3c' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"opportunity_id": "e1f2...", "action": "commit"}'
```

Example response (200):

```json
{
  "status": "committed",
  "opportunity_id": "e1f2a3b4-...",
  "action_id": "a1b2c3d4-...",
  "measurement_plan": {
    "subject": { "page_id": "9a8b7c6d-..." },
    "primary": { "metric": "bot_fetches", "source": "crawler_logs" },
    "secondary": [],
    "window_days": 14,
    "moved_if": "after >= max(before*1.25, before+min_gain)",
    "harm_if": "after <= before*0.75",
    "rollback_ref": null
  }
}
```

#### GET /get-results

Four verdicts: `earned`, `no_change`, `harm`, `couldnt_measure`.

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | The brand to read. |
| verdict | string | no | - | earned, no_change, harm or couldnt_measure. |
| family | string | no | - | Narrow to one verb family. |
| days | int | no | - | Only results measured in the last 1-3650 days. |
| limit | int | no | 50 | 1-200. |
| cursor | string | no | - | Opaque cursor from meta.next_cursor. |

"`/get-proof` remains available as a deprecated compatibility alias."

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-results?brand_id=00000000-0000-4000-8000-81f286d10c3c&verdict=earned&limit=20'
```

Example response (200):

```json
{
  "results": [
    {
      "id": "r1...",
      "action_id": "a1...",
      "verdict": "earned",
      "family": "fix",
      "summary": "Citations went from 2 to 6 over 14 days.",
      "primary_metric": {
        "label": "Citations",
        "before": 2,
        "after": 6,
        "source": "citations"
      },
      "window_days": 14,
      "reason": null,
      "measured_at": "2026-07-28T06:00:00Z",
      "rolled_back": false,
      "page_url": "https://example.com/help/returns"
    }
  ],
  "meta": { "total": 41, "limit": 20, "next_cursor": null },
  "verdict_counts": {
    "earned": 12,
    "no_change": 9,
    "couldnt_measure": 20
  }
}
```

#### GET /get-pages

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | The brand to read. |
| ownership | string | no | - | owned, competitor, editorial, social, video or other. |
| tracked | bool | no | - | True for pages someone chose to watch. |
| limit | int | no | 50 | 1-200. |
| cursor | string | no | - | Opaque cursor from meta.next_cursor. |

"Rows come back newest `last_seen_at` first." Bottleneck values are funnel stage names:
available, reached, understood, relevant, selected or visited. "Both are null until there
is enough data to name one."

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-pages?brand_id=00000000-0000-4000-8000-81f286d10c3c&ownership=owned&limit=50'
```

Example response (200):

```json
{
  "pages": [
    {
      "id": "9a8b7c6d-...",
      "url": "https://example.com/help/returns",
      "slug": "/help/returns",
      "ownership": "owned",
      "title": "Returns and refunds",
      "tracked": true,
      "bottleneck": "reached",
      "verdict": "This page is available but AI crawlers aren't fetching it.",
      "last_seen_at": "2026-07-28T06:00:00Z"
    }
  ],
  "meta": { "total": 812, "limit": 50, "next_cursor": "o:50" }
}
```

### 2.15 Reports

Page: `/learn/api/endpoints/reports`.

#### GET /get-reports

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | conditional | - | Brand UUID from /get-brands (required unless report_id is provided) |
| report_id | string | no | - | Report UUID to retrieve a single report with full data |
| report_type | string | no | - | Filter by type: executive, weekly, full, intelligence |
| status | string | no | - | Filter by status: pending, generating, completed, failed, expired |
| limit | integer | no | 20 | Results per page (1-100) |
| offset | integer | no | 0 | Pagination offset |

"The `report_data` field is only included in single-report responses."

Report object: `id`, `brand_id`, `report_type`, `report_name` (nullable), `time_range`
(7d, 14d, 30d), `status`, `file_url` (nullable), `file_size_bytes` (nullable),
`page_count` (nullable), `error_message` (nullable), `created_at`, `expires_at` (nullable,
"reports expire after 30 days").

`report_data` sub-objects: `metrics`, `competitive`, `wins_losses`, `recommendations`,
`platforms`, `executive`.

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-reports?brand_id=00000000-0000-4000-8000-81f286d10c3c'
```

Example response (200, truncated in the docs):

```json
{
  "reports": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
      "report_type": "executive",
      "report_name": null,
      "time_range": "7d",
      "status": "completed",
      "file_url": "https://api.trakkr.ai/get-reports/a1b2c3d4-e5f6-7890-abcd-ef1234567890/download",
      "file_size_bytes": 245000
    }
  ]
}
```

Error codes shown: 200, 400.

#### POST /get-reports

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | Brand UUID |
| report_type | string | no | executive | Report type: executive, weekly, or full |
| time_range | string | no | 7d | Analysis period: 7d, 14d, or 30d |

Example request:

```
curl -X POST 'https://api.trakkr.ai/get-reports' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"brand_id": "00000000-0000-4000-8000-81f286d10c3c", "report_type": "executive", "time_range": "7d"}'
```

Example response (200):

```json
{
  "report_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "download_url": "https://api.trakkr.ai/get-reports/a1b2c3d4-e5f6-7890-abcd-ef1234567890/download"
}
```

Error codes shown: 200, 500.

#### GET /get-reports/{report_id}/download

"Downloads PDF bytes directly. This endpoint checks the API key and current brand access
on every request." The URL is not a bearer link; send the same API key.

Example request:

```
curl -L \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -o trakkr-report.pdf \
  'https://api.trakkr.ai/get-reports/a1b2c3d4-e5f6-7890-abcd-ef1234567890/download'
```

Report types, verbatim:

| Type | Description |
|---|---|
| executive | Concise executive summary with key metrics and actions |
| weekly | Weekly performance review with trend analysis |
| full | Comprehensive report with all sections and detailed data |

### 2.16 Perception

Page: `/learn/api/endpoints/perception`.

#### GET /get-perception

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | The brand ID to get perception data for |
| view | string | no | dashboard | View type: "dashboard", "metrics", or "narrative" |
| days | integer | no | 90 | Number of days of data to return (7-365) |
| tracked_brand | string | no | - | Filter by specific tracked brand (metrics view only) |

Dashboard schema keys: `metadata`, `perception_score`, `category_scores`, `insights`,
`brand_summaries`, `detailed_sentiment_timeseries`, `competitor_gaps`,
`radar_chart_data`, `metric_rankings`, `primary_brand_overall_timeseries`.

The 20 metrics, in 5 categories:
- Trust & Reliability: overall_trust, reliability_score, transparency_level, safety_perception
- Quality & Performance: overall_quality, problem_resolution, responsiveness, user_satisfaction
- Value & Experience: value_for_money, ease_of_interaction, accessibility, necessity_level
- Market Position: brand_recognition, professional_image, recommendation_likelihood, uniqueness
- Innovation & Appeal: forward_thinking, adaptability, likability, confidence_inspiring

Example request (dashboard):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-perception?brand_id=YOUR_BRAND_ID&view=dashboard&days=90'
```

Example response (200, truncated in the docs):

```json
{
  "metadata": {
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
    "primary_brand": "Notion",
    "date_range_start": "2025-12-01",
    "date_range_end": "2026-03-01",
    "total_brands_tracked": 4,
    "days_of_data": 90
  },
  "perception_score": {
    "score": 72.5,
    "change_7d": 1.3,
    "percentile": 82.0
  },
  "category_scores": {
    "trust_reliability": 78.2,
    "quality_performance": 71.0,
    "value_experience": 68.5,
    "market_position": 75.3,
    "innovation_appeal": 69.8
  },
  "insights": {
    "strengths": ["High trust scores across all models", "Strong brand recognition"],
    "opportunities": ["Improve value perception", "Increase adaptability messaging"]
  },
  "brand_summaries": [
    {
      "brand_name": "Notion",
      "is_primary": true,
      "rank_1_in": ["overall_quality", "ease_of_interaction"],
      "rank_last_in": []
    }
  ]
}
```

Example request (metrics):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-perception?brand_id=YOUR_BRAND_ID&view=metrics&days=30'
```

Example response for metrics: NOT DOCUMENTED.

Example request (narrative):

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-perception?brand_id=YOUR_BRAND_ID&view=narrative'
```

```json
{
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "narrative": {
    "positioning": "Notion is consistently positioned as an all-in-one workspace that combines notes, docs, and project management. AI models describe it as a flexible productivity tool favored by teams and individuals.",
    "strengths": [
      "All-in-one workspace",
      "Flexible and customizable",
      "Strong template ecosystem",
      "AI-powered features",
      "Team collaboration"
    ],
    "weaknesses": [
      "Performance concerns",
      "Steep learning curve"
    ],
    "opportunities": [
      "AI integration leadership",
      "Enterprise adoption",
      "Offline capabilities"
    ],
    "sentiment_summary": null
  },
  "snapshot_date": "2026-03-20T14:30:00Z"
}
```

"The legacy `sentiment_summary` field remains in the response for compatibility and
returns null."

#### POST /get-perception

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | The brand ID to analyze |
| include_competitors | boolean | no | true | Also analyze competitor brands |

"Analysis queries 4 AI models and takes 30-60 seconds to complete."

Example request:

```
curl -X POST 'https://api.trakkr.ai/get-perception' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
    "include_competitors": true
  }'
```

Example response (200):

```json
{
  "status": "success",
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "primary_brand": "Notion",
  "run_date": "2026-03-07",
  "brands_analyzed": ["Notion", "Coda", "Confluence", "Monday.com"],
  "error": null
}
```

### 2.17 Narratives

Page: `/learn/api/endpoints/narratives`.

"Narratives require the Scale plan. You can have up to 5 active narratives per brand.
Archiving a narrative frees up the slot."

#### GET /narratives

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| brand_id | string | yes | - | The brand ID to list narratives for |
| narrative_id | string | no | - | Get a single narrative by ID (detail view) |
| include | string | no | - | Comma-separated: "snapshots", "correctives" |
| days | integer | no | 90 | Days of snapshot history to include (7-365) |

Narrative object: `id`, `brand_id`, `name`, `description`, `keywords` (string[]),
`comparison_brand` (nullable), `status` ("critical", "active", "monitoring", or
"resolved"), `created_at`, `latest_snapshot` (nullable), `correctives` (nullable),
`snapshots` (nullable).

Example request:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/narratives?brand_id=YOUR_BRAND_ID&include=correctives'
```

Example response (200, truncated in the docs):

```json
{
  "narratives": [
    {
      "id": "narr_abc123",
      "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
      "name": "Product Quality Perception",
      "description": "How AI models describe our product quality vs competitors",
      "keywords": ["quality", "reliability", "performance"],
      "comparison_brand": "Competitor Inc",
      "status": "active",
      "created_at": "2026-02-15T10:30:00Z"
    }
  ]
}
```

The docs continue with a `latest_snapshot` object whose fields are not shown in full:
NOT DOCUMENTED.

#### POST /narratives

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | The brand ID |
| name | string | yes | Narrative name (1-200 chars) |
| description | string | yes | What this narrative tracks (1-2000 chars) |
| keywords | string[] | yes | Keywords to monitor (1-10 items) |
| comparison_brand | string | no | Optional brand to compare against |

Example request:

```
curl -X POST 'https://api.trakkr.ai/narratives' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
    "name": "Product Quality Perception",
    "description": "How AI models describe our product quality vs competitors",
    "keywords": ["quality", "reliability", "performance"],
    "comparison_brand": "Competitor Inc"
  }'
```

Example response (200):

```json
{
  "narrative_id": "narr_abc123",
  "status": "created",
  "message": "Narrative created and first analysis started"
}
```

#### PATCH /narratives

| Name | Type | Required | Description |
|---|---|---|---|
| narrative_id | string | yes | The narrative ID to update |
| name | string | no | Updated name |
| description | string | no | Updated description |
| keywords | string[] | no | Updated keywords |
| comparison_brand | string | no | Updated comparison brand |
| status | string | no | Status: "critical", "active", "monitoring", "resolved" |

Example request:

```
curl -X PATCH 'https://api.trakkr.ai/narratives' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "narrative_id": "narr_abc123",
    "name": "Updated Narrative Name",
    "status": "monitoring"
  }'
```

Example response: NOT DOCUMENTED.

#### DELETE /narratives

"Archive (soft-delete) a narrative. Sets status to resolved." Pass `narrative_id` as a
query parameter.

```
curl -X DELETE 'https://api.trakkr.ai/narratives?narrative_id=narr_abc123' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY'
```

Example response: NOT DOCUMENTED.

### 2.18 Diagnose

Page: `/learn/api/endpoints/diagnose`.

"Diagnose has a monthly usage quota of 200 diagnoses per month on the Scale plan. Every
plan has a fixed monthly number; there is no unlimited tier."

#### POST /diagnose

| Name | Type | Required | Description |
|---|---|---|---|
| brand_id | string | yes | The brand ID to diagnose |
| query | string | yes | The search query to diagnose (3-500 characters) |

Documented immediate response:

```json
{
  "diagnosis_id": "diag_abc123xyz",
  "status": "pending",
  "message": "Diagnosis started"
}
```

"Diagnosis runs asynchronously and takes 30-60 seconds. Poll `GET
/diagnose?diagnosis_id=X` every 3 seconds until status is 'completed' or 'failed'."

Example request:

```
curl -X POST 'https://api.trakkr.ai/diagnose' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
    "query": "best project management tools for remote teams"
  }'
```

The page's code panel shows a completed diagnosis for the same call (200):

```json
{
  "id": "diag_abc123xyz",
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "query": "best project management tools for remote teams",
  "status": "completed",
  "visibility_score": 45.0,
  "best_position": 3,
  "model_positions": {
    "chatgpt": 3,
    "claude": 5,
    "gemini": null,
    "perplexity": 2
  },
  "competitors": [
    {"name": "Asana", "positions": {"chatgpt": 1, "claude": 2}, "score": 85.0},
    {"name": "Monday.com", "positions": {"chatgpt": 2, "claude": 1}, "score": 82.0}
  ],
  "confidence_score": 72,
  "confidence_level": "High",
  "recommendations": [
    {
      "id": "rec_001",
      "title": "Create comparison page vs Asana",
      "gap": "Missing direct comparison content",
      "effort": "medium",
      "impact": "high",
      "validation_status": "SUPPORTED",
      "confidence": "high",
      "mentioned_by_models": 3
    }
  ]
}
```

#### GET /diagnose

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| diagnosis_id | string | no | - | Get a specific diagnosis result (for polling) |
| brand_id | string | no | - | Brand ID (required for history and usage views) |
| view | string | no | history when brand_id is given | "history" or "usage" |
| limit | integer | no | 20 | Max results for history view (1-100) |

Diagnosis object: `id`, `status` ("pending", "running", "validating", "completed", or
"failed"), `query`, `visibility_score` (float, nullable), `best_position` (nullable),
`model_positions` (nullable), `competitors` (nullable), `confidence_score` (0-100,
nullable), `confidence_level` ("High", "Medium", or "Low", nullable), `recommendations`
(nullable), `summary` (nullable), `visibility_change` (float, nullable), `duration_ms`
(nullable), `models_succeeded` (string[], nullable), `models_failed` (string[], nullable).

view=history example:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/diagnose?brand_id=YOUR_BRAND_ID&view=history&limit=10'
```

```json
{
  "diagnoses": [
    {
      "id": "diag_abc123xyz",
      "query": "best project management tools for remote teams",
      "visibility_score": 45.0,
      "best_position": 3,
      "status": "completed",
      "created_at": "2026-03-07T10:00:00Z",
      "visibility_change": 5.0
    }
  ]
}
```

view=usage example:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/diagnose?brand_id=YOUR_BRAND_ID&view=usage'
```

```json
{
  "used": 12,
  "limit": 200,
  "remaining": 188
}
```

"The count runs per brand and resets on the first of the month. `limit` is always a
number, and `remaining` never goes below zero."

### 2.19 Endpoints present in the OpenAPI file but with no documentation page

The OpenAPI file exposes 96 paths. The endpoint pages describe about half of them. The
following authenticated paths are in `openapi.json` but have no dedicated documentation
page. Parameters and responses for these: NOT DOCUMENTED in the endpoint pages. The MCP
tool table in section 3 gives their parameters.

| Method | Path |
|---|---|
| POST | /competitors/manage |
| POST | /get-prompts/suggest |
| POST, DELETE | /get-prompts/bulk |
| PATCH | /get-prompts/activate |
| PATCH | /get-prompts/deactivate |
| POST | /get-prompts/rerun |
| POST | /get-reports/compare |
| GET | /get-crawler (legacy) |
| GET | /api/v1/crawler/access |
| POST | /api/v1/crawler/verification-ping |
| POST | /mcp/crawler/verification-ping |
| POST | /api/v1/crawler/submit-to-search |
| GET | /api/v1/crawler/submit-to-search/status |
| GET | /traffic/status |
| GET | /traffic/report |
| GET | /traffic/visitors |
| GET, POST | /traffic/conversions |
| DELETE | /traffic/conversions/{event_name} |
| GET | /get-actions |
| GET | /get-action-stats |
| POST | /manage-action |
| GET | /get-audits |
| GET | /get-audit-findings |
| GET | /get-page-analyses |
| GET | /research/runs |
| GET | /research/runs/{run_id} |
| GET | /research/latest |
| GET | /research/snapshot-credits |
| POST | /research/snapshot |
| GET | /reddit |
| POST | /reddit/subreddits |
| DELETE | /reddit/subreddits/{subreddit_id} |
| POST | /reddit/triggers |
| DELETE | /reddit/triggers/{trigger_id} |
| POST | /reddit/opportunities/{opportunity_id}/dismiss |
| POST | /reddit/opportunities/{opportunity_id}/respond |
| POST | /reddit/scan |
| GET | /workflows |
| PATCH, DELETE | /workflows/{workflow_id} |
| DELETE | /api/v1/workflows/{workflow_id} |
| POST | /workflows/from-template |
| GET | /notifications |
| GET | /api/v1/notifications |
| POST | /notifications/read |
| POST | /api/v1/notifications/read |
| GET | /content/knowledge |
| GET | /content/articles |
| GET | /content/writing-style |
| POST | /content/knowledge/sources/text |
| POST | /content/knowledge/sources/url |
| DELETE | /content/knowledge/sources/{source_id} |
| POST | /content/knowledge/sources/{source_id}/reprocess |
| POST | /content/articles/generate |
| GET | /agency/brand-groups |
| POST | /agency/compare-brands |
| GET | /agency/portfolio-actions |
| GET | /get-proof (deprecated alias of /get-results) |

---

## 3. MCP

Page: `/learn/api/mcp`. Cookbook: `/learn/api/mcp/recipes`.

### 3.1 Two servers

| Server | URL | Auth | Purpose |
|---|---|---|---|
| Authenticated customer MCP | `https://api.trakkr.ai/mcp` | MCP connect token or OAuth flow in the client | Private brand data. 76 tools, 18 resources, 6 workflows. |
| Public Knowledge MCP | `https://api.trakkr.ai/public/mcp` | none | Read-only public marketing content, docs, research and dataset metadata. 4 tools. |

Public MCP transport is `streamable_http`. Public server card tools, verbatim from
`mcp.json`:

```json
{
  "name": "Trakkr Public Knowledge MCP",
  "url": "https://api.trakkr.ai/public/mcp",
  "transport": "streamable_http",
  "authentication": "none",
  "description": "Read-only public MCP for Trakkr marketing content, docs, research and public dataset metadata.",
  "documentation_url": "https://trakkr.ai/learn/api/mcp#public-knowledge-mcp",
  "server_card_url": "https://trakkr.ai/.well-known/mcp/server-card.json",
  "tools": [
    { "name": "search", "description": "Search public Trakkr content. Call before fetch.", "readOnlyHint": true },
    { "name": "fetch", "description": "Fetch citeable public Trakkr content by id.", "readOnlyHint": true },
    { "name": "get_public_dataset", "description": "Return whitelisted public dataset metadata and download URLs.", "readOnlyHint": true },
    { "name": "get_authenticated_mcp_setup", "description": "Explain how to connect the paid customer MCP.", "readOnlyHint": true }
  ]
}
```

Server card instructions, verbatim: "Cite Trakkr URLs returned by fetch.", "Use search
before fetch.", "Route private account questions to https://api.trakkr.ai/mcp."

Privacy block: `stores_private_account_data: false`. Telemetry: "Redacted tool name, query
preview, result ids, client hint, hashed IP or session, duration and status."

Package facts: PyPI package `trakkr-mcp`, version `0.17.0`, Python `≥ 3.10`, licence MIT.

Plan gate: "MCP access is included on every paid plan. The direct REST API and `sk_live_`
keys remain Scale-only."

Logging: "Trakkr stores MCP activity logs for security, support, and product improvement:
tool names, timing, status, short intent hints supplied by the assistant, and bounded
redacted input and result previews. Full assistant conversations are not stored."

### 3.2 Install snippets

Placeholder token in every snippet: `mcp_connect_your_token_here`.

Claude (web, remote connector):
- Kind: remote. Connector URL `https://api.trakkr.ai/mcp`.
- Steps, verbatim:
  1. "In Claude, open Customize > Connectors."
  2. "Choose Add custom connector and use https://api.trakkr.ai/mcp as the remote MCP server URL."
  3. "Click Connect, then paste your MCP connect token on the Trakkr authorization page when Claude prompts you."

Claude App (desktop) - file `~/Library/Application Support/Claude/claude_desktop_config.json`
(Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "trakkr": {
      "command": "uvx",
      "args": [
        "trakkr-mcp"
      ],
      "env": {
        "TRAKKR_API_KEY": "mcp_connect_your_token_here"
      }
    }
  }
}
```

Claude Code - CLI, run once in any terminal:

```
claude mcp add trakkr \
  -e TRAKKR_API_KEY=mcp_connect_your_token_here \
  -- uvx trakkr-mcp
```

Cursor - file `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project root):

```json
{
  "mcpServers": {
    "trakkr": {
      "command": "uvx",
      "args": [
        "trakkr-mcp"
      ],
      "env": {
        "TRAKKR_API_KEY": "mcp_connect_your_token_here"
      }
    }
  }
}
```

VS Code - file `.vscode/mcp.json` (or user `settings.json` under `"mcp.servers"`). Without
a token pasted, the page emits the prompt-input form:

```json
{
  "servers": {
    "trakkr": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "trakkr-mcp"
      ],
      "env": {
        "TRAKKR_API_KEY": "${input:trakkr-api-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "trakkr-api-key",
      "description": "Trakkr MCP connect token",
      "password": true
    }
  ]
}
```

With a token, VS Code gets the plain form:

```json
{
  "servers": {
    "trakkr": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "trakkr-mcp"
      ],
      "env": {
        "TRAKKR_API_KEY": "mcp_connect_your_token_here"
      }
    }
  }
}
```

Codex - file `~/.codex/config.toml`, format TOML:

```toml
[mcp_servers.trakkr]
command = "uvx"
args = ["trakkr-mcp"]
env = { TRAKKR_API_KEY = "mcp_connect_your_token_here" }
```

Windsurf - file `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "trakkr": {
      "command": "uvx",
      "args": [
        "trakkr-mcp"
      ],
      "env": {
        "TRAKKR_API_KEY": "mcp_connect_your_token_here"
      }
    }
  }
}
```

Zed - file `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "trakkr": {
      "source": "custom",
      "command": {
        "path": "uvx",
        "args": [
          "trakkr-mcp"
        ],
        "env": {
          "TRAKKR_API_KEY": "mcp_connect_your_token_here"
        }
      }
    }
  }
}
```

Cline - file `cline_mcp_settings.json` (open from Cline panel → MCP Servers → Configure).
Same `mcpServers` shape as Cursor.

Manual / other - file `mcp.json`. Same `mcpServers` shape as Cursor.

ChatGPT - remote, marked "coming soon" with developer mode available. Steps, verbatim:
1. "In ChatGPT, open Settings → Apps & Connectors → Advanced settings and turn on Developer mode."
2. "Back in Apps & Connectors, click Create app and paste https://api.trakkr.ai/mcp as the MCP server URL."
3. "When ChatGPT opens the Trakkr authorization page, paste your MCP connect token to finish connecting."

Client docs links, verbatim:

| Client | Surface | Docs URL |
|---|---|---|
| Claude | Web | https://support.claude.com/en/articles/11175166-how-do-i-connect-mcp-servers-to-claude-ai |
| Claude App | Desktop | https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop |
| Claude Code | Terminal | https://code.claude.com/docs/en/mcp |
| Cursor | Editor | https://docs.cursor.com/en/tools/mcp |
| VS Code | Editor | https://code.visualstudio.com/docs/copilot/customization/mcp-servers |
| Codex | Terminal | https://github.com/openai/codex/blob/main/codex-rs/config.md#connecting-to-mcp-servers |
| Windsurf | Editor | https://docs.windsurf.com/windsurf/cascade/mcp |
| Zed | Editor | https://zed.dev/docs/ai/mcp |
| Cline | Editor | https://docs.cline.bot/mcp/configuring-mcp-servers |
| Manual | - | https://modelcontextprotocol.io/docs/getting-started/intro |
| ChatGPT | Web | https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta |

### 3.3 The 76 tools

Group order as declared in the page: Core, Visibility, Intelligence, Research, Audit,
Crawler, Reddit, Automations, Activity, Content, Agency, Actions.

Note: the shipped manifest file `mcpToolManifest-D69j383n.js` labels five tools with the
group `Workflows`/`Audit` where the page body uses `Automations`/`Actions`. The page body
is authoritative and is used below.

#### Core (10 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| report_unmet_need | (none) | Record a request that no current Trakkr tool can complete, without forcing an unrelated action. Records a product signal only. | user_request (string, required), missing_capability (string, required), attempted_tools (string) |
| list_brands | /get-brands | List all tracked brands. Returns IDs needed for other tools. | brand_id (string), include (string: 'markets', 'aliases') |
| set_brand_location | /get-brands/location | Set a brand primary market so competitor and AI-search analysis uses the right geography. | brand_id (string, required), country (string, required, ISO-2), region (string), city (string) |
| get_visibility_scores | /get-scores | Visibility scores and trends over time. | brand_id (string, required), days (int, default 90, 7-365), tag_ids (string), prompt_id (string) |
| list_prompts | /get-prompts | List tracked search queries for a brand. | brand_id (string, required), active_only (bool, default false), tag_ids (string), limit (int, default 100, 1-500), offset (int, default 0) |
| list_tags | /get-tags | List every prompt tag for a brand, including unused tags and prompt counts. | brand_id (string, required) |
| manage_prompt | /get-prompts | Create, update, or delete a tracked prompt. | action ('create' \| 'update' \| 'delete', required), brand_id (string), prompt_id (string), text (string), active (bool), intent (string) |
| manage_prompt_tags | /manage-prompt-tags | Create, rename, recolour, or delete a prompt tag, or add/remove it across prompts. | action ('create' \| 'update' \| 'delete' \| 'add' \| 'remove', required), brand_id (string, required), tag_id (string), tag_name (string), colour (string), prompt_ids (string \| string[], max 200), create_if_missing (bool, default true) |
| suggest_prompts | /get-prompts/suggest | Suggest fresh AI-search prompts to track, grounded in the brand's own profile. Nothing is created. | brand_id (string, required), focus (string), limit (int, default 8, 1-10) |
| update_brand_aliases | /get-brands/aliases | Update a brand's aliases (alternate names folded into its visibility). | brand_id (string, required), aliases (string, required, comma-separated), action ('add' \| 'remove' \| 'set', default 'add') |

#### Visibility (5 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_citations | /get-citations | Citation URLs, history, queries, sources, feed, heatmap. | brand_id (string, required), view (string, default 'list'), days (int, default 30, 7-365), limit (int, default 100, 1-500), offset (int, default 0), domain (string, required when view='sources'), tag_ids (string), prompt_text (string), response_format ('concise' \| 'detailed', default 'concise') |
| get_rankings | /get-rankings | Competitive rankings in AI search results. | brand_id (string, required), view (string, default 'overall'), days (int, default 30, 7-365), include_volume (bool, default false) |
| get_model_breakdown | /get-models | Visibility by AI model (ChatGPT, Perplexity, Gemini, etc.). | brand_id (string, required), days (int, default 30, 7-365), include_trends (bool, default false) |
| get_competitors | /get-competitor-data | Competitor analysis: summary, arena, head-to-head, threats. | brand_id (string, required), view (string, default 'summary'), competitor (string, required for 'head-to-head'), response_format ('concise' \| 'detailed', default 'concise') |
| manage_competitor | /competitors/manage | Track, untrack, hide, or unhide a competitor for a brand. | brand_id (string, required), action ('list' \| 'add' \| 'remove' \| 'hide' \| 'unhide', required), competitor (string, required for every action except 'list') |

`get_citations` views: list, history, queries, sources, feed, heatmap.
`get_rankings` views: overall, by-prompt.
`get_competitors` views: summary, arena, head-to-head, by-model, threats.

#### Intelligence (5 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_opportunities | /get-opportunities | Citation gaps where competitors appear but you don't. | brand_id (string, required), days (int, default 30, 7-365), limit (int, default 50, 1-200) |
| get_content_ideas | /get-content-ideas | AI-generated content ideas to improve visibility. | brand_id (string, required), limit (int, default 50, 1-200), offset (int, default 0), status (string: 'active', 'dismissed', 'implemented') |
| get_perception | /get-perception | How AI models describe, position, and talk about the brand. Read-only. | brand_id (string, required), view (string, default 'dashboard': dashboard, metrics, story, narrative_drift, narrative), days (int, default 90, 7-365), tracked_brand (string) |
| get_prism | /ai-pages | AI Pages connection state and monthly usage. Setup and quota, not analysis. Requires a paid plan. | brand_id (string, required) |
| get_narratives | /narratives | Narrative intelligence: tracked topics and storylines. Requires Scale plan. | brand_id (string, required), narrative_id (string), include (string: 'snapshots', 'correctives'), days (int, default 90, 7-365) |

`get_perception` views: dashboard, metrics, story, narrative_drift, narrative. The MCP
tool exposes two views (`story`, `narrative_drift`) that the REST endpoint page does not
list.

#### Research (5 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_research_runs | /research/runs | List prompt research runs (newest first) with visibility, mention rate, and top competitors. | brand_id (string, required), report_type ('full_research' \| 'topic_snapshot'), ready_only (bool, default true), limit (int, default 20, 1-100), offset (int, default 0) |
| get_research_run | /research/runs/{run_id} | Full analytics payload for one run. | run_id (string, required), results_limit (int, default 100, 1-500), results_offset (int, default 0), response_format ('concise' \| 'detailed', default 'concise') |
| get_latest_research | /research/latest | Most recent completed prompt research run with the full analytics payload. | brand_id (string, required), report_type ('full_research' \| 'topic_snapshot'), results_limit (int, default 100, 1-500), results_offset (int, default 0) |
| get_research_credits | /research/snapshot-credits | Topic snapshot credit usage for the current month. | brand_id (string, required) |
| run_research_snapshot | /research/snapshot | Trigger a topic snapshot - 50 focused prompts on the supplied topic. Consumes one monthly credit. | brand_id (string, required), topic (string, required, 2-200 chars), topic_context (string, up to 500 chars) |

Snapshot limits, verbatim: "Trial 1, Growth 5, Scale 5 per month (per active brand)."
Snapshots are async, "typically 3-5 minutes". Full research runs are not exposed; they
run daily on a schedule.

#### Audit (7 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_actions | /get-actions | Unified recommendation queue across audit, crawler, citations, competitors, and more. | brand_id (string, required), status (string, default 'open'), category (string), source (string), action_type (string), lens (string), quick_win (bool), search (string), url (string), sort_by (string, default 'priority_score'), sort_dir (string, default 'desc'), limit (int, default 50, 1-200), offset (int, default 0) |
| get_action_stats | /get-action-stats | Aggregate counts for the brand action queue: totals, quick-wins, completion rate, breakdowns. | brand_id (string, required) |
| list_audits | /get-audits | List site audits for a brand, or fetch one by ID. | brand_id (string, required), audit_id (string), status (string), limit (int, default 20, 1-100) |
| get_audit_findings | /get-audit-findings | Audit issues + flagged pages for an AI-search technical audit. Read-only; never triggers an audit. | brand_id (string, required), audit_id (string), severity (string, default 'critical,high'), issue_status (string, default 'open,in_progress'), check_name (string), page_url (string), page_type (string), url_pattern (string), min_score (int, 0-100), max_score (int, 0-100), issues_limit (int, default 20, 1-50), pages_limit (int, default 20, 1-50) |
| list_page_analyses | /get-page-analyses | List recent deep page analyses for a brand. | brand_id (string, required), limit (int, default 20, 1-100) |
| get_page_analysis | /get-page-analyses | Cached deep analysis for a single URL: diagnosis, verdict, schema, entities, bot visibility. | brand_id (string, required), url (string, required), max_age_days (int, default 30, 1-365) |
| list_pages | /get-pages | The page registry: one row per URL the brand owns or appears on, with its bottleneck and verdict. | brand_id (string, required), ownership (string), tracked (bool), limit (int, default 50, 1-200), cursor (string) |

`get_actions` return fields, verbatim: "title, description, detail, first_step, category,
action_type, effort, impact, priority_score, status, source, action_data (the raw
supporting evidence) and a deep_link. Actions that carry them also return family, page_id,
page_url and result (verdict, summary, primary_metric, window_days, measured_at,
rolled_back). result stays null until the measurement window closes. proof remains as a
deprecated compatibility alias."

`get_audit_findings` returns `status='no_audit_yet'` if the brand has no completed audit.

#### Crawler (9 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_crawler_overview | /crawler/overview | Hero stats, chart, setup state, top pages, and recent preview. | brand_id (string, required), range_preset (string, default '30d'), start_date (string), end_date (string), compare_to (string, default 'none') |
| get_crawler_live | /crawler/live | Live tab data: activity feed, top pages, or sessions. | brand_id (string, required), view (string, default 'activity'), range_preset (string, default '30d'), intent (string, default 'all'), platform (string), http_status (string), search (string), cursor (string), limit (int, default 25, 1-100) |
| get_crawler_pages | /crawler/pages | Pages tab data: URLs, grouped paths, or normalized bots. | brand_id (string, required), lens (string, default 'pages'), range_preset (string, default '30d'), intent (string, default 'all'), platform (string), search (string), status (string, default 'all'), cursor (string), limit (int, default 25, 1-100) |
| get_crawler_detail | /crawler/page-details, /crawler/path-details, /crawler/bot-details | Drawer sections (verdict, pipeline, health, traffic, diagnostics) for one page, path, or bot. | brand_id (string, required), kind (string, required: 'page', 'path', 'bot'), entity_id (string, required), range_preset (string, default '30d'), intent (string, default 'all'), platform (string), search (string), status (string, default 'all') |
| get_crawler_access | /crawler/access | Access tab data: findings, bot matrix, robots.txt, llms.txt, submit-to-search. | brand_id (string, required), range_preset (string, default '30d') |
| preview_crawler_access_fix | /crawler/access/preview-fix | Preview an Access fix without applying it. | brand_id (string, required), finding_id (string, required), range_preset (string, default '30d') |
| send_crawler_verification_ping | /crawler/verification-ping | Send the verification ping shown in the crawler dashboard. | brand_id (string, required) |
| submit_crawler_to_search | /crawler/submit-to-search | Submit crawler pages to AI search via IndexNow. | brand_id (string, required), urls (string, required, comma-separated absolute URLs) |
| get_crawler_submit_status | /crawler/submit-to-search/status | Get submit-to-search status and summary for crawler URLs. | brand_id (string, required), range_preset (string, default '30d'), urls (string), status (string: 'pending', 'success', 'failed') |

#### Reddit (5 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_reddit | /reddit | Reddit monitoring data: connection state, mentions feed, opportunities, threads, subreddits, triggers, and analytics. | brand_id (string, required), view (string, default 'overview'), thread_id (string, required when view='thread'), status (string), subreddit (string), days (int, default 30, 1-180), page_size (int, default 30, 1-100) |
| manage_reddit_subreddit | /reddit/subreddits | Add or remove a subreddit from the Reddit monitor. | brand_id (string, required), action ('add' \| 'remove', required), subreddit (string, required for 'add'), subreddit_id (string, required for 'remove') |
| manage_reddit_trigger | /reddit/triggers | Add or remove a keyword trigger that drives Reddit scanning. | brand_id (string, required), action ('add' \| 'remove', required), keyword (string, required for 'add'), trigger_id (string, required for 'remove') |
| manage_reddit_opportunity | /reddit/opportunities | Update the status of a single Reddit opportunity (dismiss or mark responded). | brand_id (string, required), opportunity_id (string, required), action ('dismiss' \| 'mark_responded', required) |
| scan_reddit | /reddit/scan | Trigger an on-demand Reddit scan for the brand. | brand_id (string, required) |

`get_reddit` views: overview, feed, opportunities, thread, subreddits, triggers, analytics.

#### Automations (2 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_workflows | /workflows | Read exact-rule automation state: list, single rule, recent runs, run detail, or starter templates. | brand_id (string, required), view (string, default 'list'), workflow_id (string), run_id (string), status (string), days (int, default 30, 1-90), limit (int, default 50, 1-200), offset (int, default 0) |
| manage_workflow | /workflows | Pause, resume, delete, or instantiate an exact rule from a template. | brand_id (string, required), action ('pause' \| 'resume' \| 'delete' \| 'from_template', required), workflow_id (string), template_id (string), name (string) |

`get_workflows` views: list, get, runs, run_detail, templates.

#### Activity (4 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_changes | /notifications | What moved for a brand since you last looked. Returns a `latest_seen` cursor to pass back as `since`. | brand_id (string, required), since (string, ISO-8601), days (int, default 7, 1-180), limit (int, default 50, 1-200) |
| get_notifications | /notifications | Read the in-product activity feed: visibility shifts, citations, competitors, actions, workflows, audits. | brand_id (string, required), view (string, default 'list': 'list' or 'unread_count'), unread_only (bool, default false), event_type (string), days (int, default 30, 1-180), limit (int, default 50, 1-200) |
| mark_notifications_read | /notifications/read | Mark notifications as read by ID or clear the entire unread inbox. | brand_id (string, required), notification_ids (string[]), mark_all (bool, default false) |
| manage_webhook | /webhooks | List, inspect, create, delete, or test outgoing webhooks for the brand. | brand_id (string, required), action ('list' \| 'get' \| 'create' \| 'delete' \| 'test', required), webhook_id (string), url (string, required for 'create'), events (string[], required for 'create'), signing_secret (string) |

`get_changes` note, verbatim: "A daily watch digest, not a live feed: most changes are
detected when the daily research run completes."

`mark_notifications_read`: "One of notification_ids or mark_all=true is required."

#### Content (6 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| get_knowledge | /content/knowledge | Read the brand's knowledge base sources. Read-only. | brand_id (string, required), view (string, default 'sources': 'sources' or 'stats') |
| get_articles | /content/articles | Read brand articles authored inside Trakkr. | brand_id (string, required), view (string, default 'list'), article_id (string, required for 'detail'), status (string), standalone_only (bool, default false), limit (int, default 50, 1-200), offset (int, default 0) |
| get_writing_style | /content/writing-style | Read the brand's configured voice - tone, vocabulary, do's and don'ts, sample sentences. | brand_id (string, required), view (string, default 'profile': 'profile' or 'samples') |
| add_knowledge | /content/knowledge/sources | Add a source to the brand's knowledge base from raw text or a URL. Processed async. | brand_id (string, required), source_type (string, required: 'text' or 'url'), content (string), url (string), name (string) |
| manage_knowledge | /content/knowledge/sources/{id} | Delete or reprocess a knowledge source. | action (string, required: 'delete' or 'reprocess'), source_id (string, required) |
| generate_article | /content/articles/generate | Generate a brand article from a prompt, grounded in the brand's knowledge and voice. Async; never publishes. | brand_id (string, required), primary_prompt (string, required), secondary_prompts (string[]), word_target (int, default 2000, 300-6000), template_id (string) |

`generate_article` consumes one article credit and returns `status=queued`.

#### Agency (3 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| list_brand_groups | /agency/brand-groups | List brand groups (agency portfolios) accessible to the API key, with rollup stats. | (none) |
| compare_brands | /agency/compare-brands | Compare 2-10 brands side by side across visibility, citations, and open actions. | brand_ids (string[], required, 2-10), days (int, default 30, 7-365), metrics (string[]: 'visibility', 'citations', 'actions'; default all) |
| get_portfolio_actions | /agency/portfolio-actions | Highest-impact actions across every brand in the portfolio, ranked. | group_id (string), quick_win (bool), limit (int, default 50, 1-200) |

#### Actions (15 tools)

| Tool | Maps to | Purpose | Parameters |
|---|---|---|---|
| manage_action | /manage-action | Act on one action in the queue. One explicit verb per call, no destructive default. Editor access required. | action (string, required: complete, dismiss, reopen, start, snooze, unsnooze, pin, unpin, assign, note), brand_id (string, required), action_id (string, required), note (string, required for 'note'), snooze_until (string, required for 'snooze'), assignee (string, required for 'assign') |
| list_opportunity_pool | /get-opportunity-pool | Suggestions waiting on a decision, from every recommendation system at once. | brand_id (string, required), family (string), kind (string), impact (string), limit (int, default 50, 1-200), cursor (string) |
| commit_opportunity | /commit-opportunity | Decide on one suggestion: commit, dismiss or snooze. Cannot grant an agent any permission. | brand_id (string, required), opportunity_id (string, required), action (string, default 'commit'), reason (string), snooze_days (int, default 7, 1-90) |
| get_results | /get-results | What completed work changed, measured before and after by the pipeline. Never a causal claim. | brand_id (string, required), verdict (string), family (string), days (int, 1-3650), limit (int, default 50, 1-200), cursor (string) |
| get_proof | /get-proof | Legacy compatibility alias for get_results. | brand_id (string, required), verdict (string), family (string), days (int, 1-3650), limit (int, default 50, 1-200), cursor (string) |
| run_diagnosis | /diagnose | Diagnose a search query across AI models in real-time. Subject to monthly usage limits. Results take 30-60 seconds. | brand_id (string, required), query (string, required, 3-500 characters) |
| get_diagnosis_result | /diagnose | Get diagnosis results, history, or usage quota. | brand_id (string), diagnosis_id (string), view (string: 'history' or 'usage'), limit (int, default 20, 1-100) |
| generate_report | /get-reports | Generate an AI visibility report. Reports take 1-2 minutes to generate. | brand_id (string, required), report_type (string, default 'executive'), time_range (string, default '7d') |
| get_reports | /get-reports | List or retrieve generated reports. | brand_id (string), report_id (string), report_type (string), status (string), limit (int, default 20, 1-100), offset (int, default 0), response_format ('concise' \| 'detailed', default 'concise') |
| export_data | /export | Export data as JSON or CSV. | brand_id (string, required), data_type (string, required: 'prompts', 'results', 'citations', 'reports'), format (string, default 'json'), days (int, default 30, 1-365), limit (int, default 1000, 1-10000) |
| bulk_manage_prompts | /get-prompts | Create, delete, activate, or deactivate prompts in bulk. | action ('bulk_create' \| 'bulk_delete' \| 'activate' \| 'deactivate', required), brand_id (string, required), prompts (string, JSON array for bulk_create), prompt_ids (string, comma-separated) |
| rerun_prompt | /get-prompts | Trigger a fresh visibility scan for a specific prompt. Subject to monthly usage limits. | brand_id (string, required), prompt_id (string, required) |
| compare_reports | /get-reports | Compare visibility between two report periods. | brand_id (string, required), baseline_start (string, required, YYYY-MM-DD), baseline_end (string, required), comparison_start (string, required), comparison_end (string, required) |
| get_search_performance | NOT DOCUMENTED (no mapsTo on the page) | Google Search Console performance for the brand. Purpose text: NOT DOCUMENTED. | NOT DOCUMENTED |
| get_traffic | /traffic/status | Live AI referral traffic status, reports, and visitor sessions. Requires traffic tracking to be connected. | brand_id (string, required), view (string, default 'status': 'status', 'report', 'visitors'), days (int, default 30, 1-365) |
| manage_conversions | /traffic/conversions | Manage conversion values for AI-referred traffic. Requires traffic tracking to be connected. | action ('list' \| 'set' \| 'delete', required), brand_id (string, required), event_name (string, required for 'set' and 'delete'), value (float, required for 'set') |

Warning: `get_search_performance` appears in the shipped tool manifest under group
`Actions` and is used by the Search Console recipe, but the page body carries no
description or parameter list for it. That is the one gap in the 76.

Count check: the page asserts the manifest and the page body must match exactly and
throws "MCP docs manifest drift detected" if they do not. The manifest holds 76 names.

### 3.4 The 18 resources

Resources are read with an @-mention, for example `@trakkr://brand/<id>/briefing`. "Each is
read-only and bounded, so reading one never triggers analysis or compute."

Group 1 - "Your brand (paste-ready briefings)". "Dense markdown you can @-attach to any
chat, so the model gets your brand right. `brand-book` is the one to paste."

| URI | Description |
|---|---|
| trakkr://brand | The index of your brands and their IDs, each linked to the briefings below. Start here to find a brand ID. |
| trakkr://brand/{id}/brand-book | Paste-ready context so any AI describes the brand right: what it is, how AI frames it now, what to set straight, and the proof. |
| trakkr://brand/{id}/snapshot | Latest AI visibility: headline scores, a by-model table, and the prompts where you win and lose. |
| trakkr://brand/{id}/citation-gaps | Prompts where AI cites a rival but not you, ranked, with who gets cited and what to publish. |
| trakkr://brand/{id}/prompts | The AI-search questions Trakkr is tracking for this brand, active and paused. |

Group 2 - "Your brand (live state, JSON)".

| URI | Description |
|---|---|
| trakkr://brands | The brands you can access, with the IDs the per-brand resources need. |
| trakkr://brand/{id}/briefing | Headline visibility and trend, plus the open-action snapshot. |
| trakkr://brand/{id}/actions | The brand top open actions, most impactful first. |
| trakkr://brand/{id}/changes | What moved in the last week (the get_changes digest). |
| trakkr://brand/{id}/latest-report | The most recent generated report. |

Group 3 - "Data & research". "These expose Trakkr's public research on what actually gets
brands cited, drawn live from our /data studies."

| URI | Description |
|---|---|
| trakkr://data | Index of the research briefings below. |
| trakkr://data/what-gets-cited | Which page types earn AI citations, and owned vs third-party. |
| trakkr://data/crawler-personalities | What each AI bot actually fetches and reads. |
| trakkr://data/llms-txt-truth | The honest null result: llms.txt shows no citation lift. |
| trakkr://data/schema-advantage | How structured data correlates with getting cited. |
| trakkr://data/citation-decay | How fast AI citations fade. |
| trakkr://data/model-divergence | Where AI models disagree on who to recommend. |
| trakkr://data/playbook | The synthesis: the rules for getting cited, with links. |

### 3.5 The 6 workflows

"Workflows are server prompts that appear as slash commands in your assistant's prompt
menu the moment Trakkr connects. Each one chains the right tools and research into a
single finished briefing, most important first. Arguments are optional; leave the brand
out and the workflow resolves it for you."

| Command | Arguments | Description |
|---|---|---|
| /weekly-review | brand, period | Your Monday brief: visibility and trend, who is gaining, the biggest citation gaps, and the easy wins, as five tight bullets. |
| /competitor-teardown | brand, competitor | Where a rival beats you, where you beat them, and three concrete moves to close the gap. |
| /citation-gap-plan | brand | The prompts you are losing, cross-referenced with the research on what actually gets cited, ending in a ranked plan of what to publish. |
| /content-brief | brand, topic | A citation-optimised outline plus the on-page schema to include for one piece, ready to hand to a writing tool. |
| /setup-tracking | domain | Onboarding in one chat: confirm the brand, set its market, then propose a starter set of prompts to track and create them on your say-so. |
| /trakkr-watch | brand_id, since | A watch playbook: pulls what moved for a brand, summarizes it plainly, and offers next steps. Pass the last cursor to see only what is new. |

### 3.6 MCP error codes and troubleshooting

| Status | Message | What to do |
|---|---|---|
| 401 | Invalid token format or expired session | Use an mcp_connect_ token, restart the assistant, or clear ~/.trakkr/mcp.json. |
| 403 | Invalid connect token, access denied, or paid plan required | Regenerate the connect token, confirm the account is paid, and check brand permissions. |
| 404 | Resource not found | Verify brand_id or other identifiers. |
| 429 | Rate limited | Wait a moment. 60 reads/min, 30 writes/min. |
| 5xx | Temporarily unavailable | Retry after a few seconds. |
| Timeout | Request timed out (60s) | For long ops, poll for results. |

Common issues, verbatim:

| Problem | Solution |
|---|---|
| "TRAKKR_API_KEY environment variable is required" | If you're using local config, set TRAKKR_API_KEY to your MCP connect token from Settings → Developer. Scale users can still use a sk_live_ REST key for legacy local mode. |
| Tools appear but return "Invalid or expired Trakkr MCP token" | Regenerate your MCP connect token from Settings → Developer, update the local config, and restart your assistant. If the local bridge keeps using an old session, remove ~/.trakkr/mcp.json and connect again. |
| "Access denied. This feature may require a paid plan" | The MCP server requires any paid plan (Growth or Scale). Some features like narratives and the REST API require the Scale plan. Check your plan at Settings → Billing. |
| Tools aren't showing up in my AI assistant | Restart your assistant after adding the config. Make sure you have Python 3.10+ and uv installed (brew install uv on macOS). |
| "Rate limited. Wait a moment and try again" | The MCP server respects API rate limits (60 reads/min, 30 writes/min). Your assistant will retry automatically in most cases. |
| "Request timed out" | Some operations (diagnosis, report generation) take longer. The server uses a 60-second timeout. For diagnosis, use get_diagnosis_result to poll for results. |

### 3.7 MCP Cookbook (`/learn/api/mcp/recipes`)

The cookbook teaches one loop: Diagnose (Trakkr finds the gap and the fix), Act (your
other MCP makes the change), Verify (Trakkr confirms it landed). Verbatim caveat: "most
changes are detected when the daily research run completes, so the verify step is a
next-day check, not a live refresh."

Bands: "Start here" (no setup, just chat), "Go deeper" (cross with search and analytics
data), "For developers" (ship the fix in code).

| Recipe | Band | Partner | Trakkr tools used | Example prompt |
|---|---|---|---|---|
| Post the Monday brief to your team | start | Slack (Team chat) | /weekly-review, get_changes | "Run /weekly-review for my brand, then post the five bullets to the #marketing channel in Slack as a clean message." |
| Keep one brand book every AI reads | start | Notion or Google Docs (Docs) | trakkr://brand/{id}/brand-book, get_perception | "Pull my Trakkr brand-book resource and create (or update) a Notion page called \"How to describe us\" with it: what we are, how AI frames us today, what to set straight, and the proof." |
| Turn this week's wins into tickets | start | Linear or Jira (Project tracker) | get_actions, get_action_stats | "Get this week's quick-win actions from Trakkr. For each one, create a Linear issue with the action title, why it matters, and the steps to take, and label them \"ai-search\"." |
| Draft the citation-winning post in your CMS | start | Webflow, Sanity or WordPress (CMS) | /content-brief, get_writing_style, get_opportunities | "Use /content-brief for my brand on the topic \"best running shoes for flat feet\". Then create a draft post in Webflow with the outline as headings and the FAQ block in place, ready for my writer to finish." |
| Find pages strong in Google but invisible to AI | data | Google Search Console (Search data) | get_search_performance, get_citations, get_opportunities | "Pull my top organic pages and their positions from Search Console. Cross-reference with Trakkr's citation data and tell me which pages rank well in Google but never get cited in AI search. Rank them by the size of the gap." |
| Tie AI referral traffic to revenue | data | PostHog or GA (Analytics) | get_traffic, manage_conversions | "Get my AI referral traffic and sessions from Trakkr for the last 30 days. Pull conversions for the same window from PostHog, join them on landing page, and show me which AI-cited pages actually drive signups." |
| Close a citation gap with a pull request | dev | GitHub (Version control) | get_opportunities, /content-brief, get_page_analysis | "Find my top 3 AI citation gaps in Trakkr. Take the biggest one, draft a citation-optimised brief and the JSON-LD schema for it, then open a GitHub pull request that adds the page and the schema to my repo." |
| Fix a page right on disk | dev | Filesystem (Local files) | get_page_analysis, get_audit_findings | "Read my /pricing page from disk. Pull Trakkr's deep analysis of that URL, then rewrite the file in place: add the missing FAQ schema, tighten the answer copy, and keep my existing layout." |

Prerequisites named in the cookbook:
- Slack recipe: pair with a scheduler (a cron MCP or your assistant's scheduled tasks).
- Search Console recipe: needs Google Search Console connected to the brand in Trakkr.
- Analytics recipe: needs Trakkr traffic tracking connected first.

---

## 4. Webhooks

Page: `/learn/api/endpoints/webhooks`.

### 4.1 Event types

| Event | Description |
|---|---|
| visibility_changed | Visibility score increased or decreased significantly |
| report_completed | A new research report has been generated |
| competitor_added | A new competitor was detected or added |
| citation_gained | Brand gained a new citation source |
| citation_lost | Brand lost a citation source |
| page_cited | One of your pages was cited by an AI model |
| action_created | A new action landed in the queue |
| action_completed | An action was marked complete |

### 4.2 Create a webhook

POST `/webhooks`.

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| url | string | yes | - | The webhook endpoint URL (must be HTTPS in production) |
| events | array | yes | - | Array of event types to subscribe to |
| brand_id | string | yes | - | Brand UUID to receive events for |
| auth_type | string | no | "none" | Authentication: "none", "bearer", "basic", or "api_key" |
| auth_token | string | no | - | Bearer token (if auth_type is "bearer") |
| signing_secret | string | no | - | Secret for HMAC-SHA256 signature verification |
| headers | object | no | - | Custom headers to include in webhook requests |

Basic auth uses `auth_username` and `auth_password`. API-key auth uses `api_key_header`
and `api_key_value`. Those four fields are named in the Authentication section but are not
in the body-parameter table.

"The provider is automatically detected from the URL."

Example request:

```
curl -X POST 'https://api.trakkr.ai/webhooks' \
  -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://hooks.zapier.com/hooks/catch/123456/abcdef",
    "events": ["visibility_changed", "report_completed"],
    "brand_id": "00000000-0000-4000-8000-81f286d10c3c"
  }'
```

Example response (200):

```json
{
  "id": "whk_abc123xyz",
  "object": "webhook",
  "url": "https://hooks.zapier.com/hooks/catch/123456/abcdef",
  "events": ["visibility_changed", "report_completed"],
  "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
  "provider": "zapier",
  "active": true,
  "signing_secret": "redacted-example",
  "created_at": "2026-01-09T10:00:00Z"
}
```

Webhook object fields: `id`, `object` (always "webhook"), `url`, `events`, `brand_id`,
`provider` ("webhook", "zapier", "make", "discord", "slack", "teams_webhook"), `active`,
`signing_secret` (nullable), `created_at`.

### 4.3 Payload shape

```json
{
  "event": {
    "id": "evt_xyz789abc",
    "type": "visibility_changed",
    "triggered_at": "2026-01-09T14:30:00Z",
    "data": {
      "brand_id": "00000000-0000-4000-8000-81f286d10c3c",
      "previous_score": 42.5,
      "current_score": 38.2,
      "change_percent": -10.1,
      "direction": "down"
    }
  },
  "brand": {
    "id": "00000000-0000-4000-8000-81f286d10c3c",
    "name": "Notion",
    "website": "https://notion.so"
  },
  "workflow": {
    "id": "wf_123abc",
    "name": "Visibility Drop Alert"
  },
  "summary": "Visibility dropped 10.1% from 42.5 to 38.2",
  "meta": {
    "source": "trakkr",
    "version": "2.0",
    "event_id": "evt_xyz789abc",
    "timestamp": "2026-01-09T14:30:00Z"
  }
}
```

Top-level fields: `event` (object), `brand` (object), `workflow` (object, nullable),
`summary` (string), `meta` (object).

"Use the `meta.event_id` field for idempotency. Store processed event IDs to prevent
duplicate handling if a webhook is retried."

`event.data` for events other than `visibility_changed`: NOT DOCUMENTED.

### 4.4 Payload templating

Double curly braces substitute values:

```json
{
  "text": "Alert: {{brand.name}} visibility changed!",
  "score": "{{event.data.current_score}}",
  "change": "{{event.data.change_percent}}%"
}
```

Available variables: `{{brand.id}}`, `{{brand.name}}`, `{{brand.website}}`,
`{{event.type}}`, `{{event.data.*}}`, `{{summary}}`, `{{workflow.name}}`, `{{timestamp}}`.

### 4.5 Signing and verification

"Verify webhook authenticity using HMAC-SHA256 signatures. When you provide a
`signing_secret`, every request includes an `X-Trakkr-Signature` header."

```
X-Trakkr-Signature: sha256=abc123def456...
```

Verification example, verbatim:

```python
import hmac
import hashlib

def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

Note: the signature is computed over the raw body only. No timestamp is mixed into the
signed string, so there is no documented replay window.

### 4.6 Retry behaviour

Verbatim:
- "3 retries with delays of 1s, 2s, 4s (exponential backoff)"
- "5xx errors and timeouts trigger retries"
- "429 rate limits respect the Retry-After header"
- "4xx client errors (except 429) are not retried. Ensure your endpoint returns 2xx status
  codes to acknowledge receipt."

### 4.7 Provider formatting

| Provider | Formatting |
|---|---|
| Discord | Rich embeds with title, description, fields, and Trakkr green accent color. |
| Slack | Block Kit formatting with headers, sections, and context elements. |
| Zapier & Make | Standard JSON payload with all fields available for mapping. |
| Microsoft Teams | Adaptive cards (named in Supported Integrations). |

---

## 5. Cross-check: documented versus seen live

Sources:
- "documented" = the path appears in `openapi.json` or on a `/learn/api` page.
- "seen live" = the path appears in part 07 section 3.2 (calls captured from the signed-in
  account) or section 3.3 (request literals in the shipped bundle).

The two surfaces barely overlap. The public API uses verb-in-path names such as
`/get-brands`. The application's own backend uses resource paths such as
`/brands/{id}/markets` and `/citations/{brandId}`. Only the crawler and webhook families
share names.

### 5.1 Documented public endpoints

| Endpoint | Documented | Seen live |
|---|---|---|
| GET /get-brands | yes | no |
| POST /get-brands/markets | yes | no |
| DELETE /get-brands/markets | yes | no |
| PUT /get-brands/aliases | yes | no |
| PUT /get-brands/location | yes | no |
| GET /get-scores | yes | no |
| GET /get-prompts | yes | no |
| POST /get-prompts | yes | no |
| PUT /get-prompts | yes | no |
| DELETE /get-prompts | yes | no |
| POST /get-prompts/suggest | yes | no |
| POST /get-prompts/bulk | yes | no |
| DELETE /get-prompts/bulk | yes | no |
| PATCH /get-prompts/activate | yes | no |
| PATCH /get-prompts/deactivate | yes | no |
| POST /get-prompts/rerun | yes | no |
| GET /get-tags | yes | no |
| POST /manage-prompt-tags | yes | no |
| GET /get-citations | yes | no |
| GET /get-competitor-data | yes | no |
| POST /competitors/manage | yes | no |
| GET /get-rankings | yes | no |
| GET /get-models | yes | no |
| GET /get-opportunities | yes | no |
| GET /get-content-ideas | yes | no |
| POST /get-content-ideas | yes | no |
| GET /get-perception | yes | no |
| POST /get-perception | yes | no |
| GET /narratives | yes | no |
| POST /narratives | yes | no |
| PATCH /narratives | yes | no |
| DELETE /narratives | yes | no |
| POST /diagnose | yes | no |
| GET /diagnose | yes | no |
| GET /get-reports | yes | no |
| POST /get-reports | yes | no |
| GET /get-reports/{report_id}/download | yes | no |
| POST /get-reports/compare | yes | no |
| GET /export | yes | no |
| GET /ai-pages | yes | no |
| GET /prism | yes (rate-limit table) | no (bundle uses /prism/status, /prism/config, others) |
| GET /get-actions | yes (OpenAPI, rate limits, MCP) | no (bundle uses /actions) |
| GET /get-action-stats | yes | no (bundle uses /actions/stats) |
| POST /manage-action | yes | no (bundle uses /actions/{id}/complete and siblings) |
| GET /get-audits | yes | no |
| GET /get-audit-findings | yes | no (bundle uses /audit-issues, /audit-pages) |
| GET /get-page-analyses | yes | no (bundle uses /api/page-analyses/recent) |
| GET /get-opportunity-pool | yes | no (bundle uses /opportunity-pool) |
| POST /commit-opportunity | yes | no (bundle uses /opportunity-pool/{id}/commit) |
| GET /get-results | yes | no (bundle uses /proof/feed) |
| GET /get-proof | yes (deprecated) | no |
| GET /get-pages | yes | no (bundle uses /pages) |
| GET /get-crawler | yes (legacy in OpenAPI) | no (bundle uses /crawler/dashboard) |
| GET /crawler/overview | yes | no |
| GET /crawler/live | yes | no |
| GET /crawler/pages | yes | no |
| GET /crawler/page-details | yes | no |
| GET /crawler/path-details | yes | no |
| GET /crawler/bot-details | yes | no |
| GET /crawler/access | yes | yes |
| POST /crawler/access/preview-fix | yes | yes |
| POST /crawler/verification-ping | yes | yes |
| POST /crawler/submit-to-search | yes | yes |
| GET /crawler/submit-to-search/status | yes | yes |
| GET /api/v1/crawler/access | yes | no |
| POST /api/v1/crawler/verification-ping | yes | no |
| POST /mcp/crawler/verification-ping | yes | no |
| POST /api/v1/crawler/submit-to-search | yes | no |
| GET /api/v1/crawler/submit-to-search/status | yes | no |
| POST /webhooks | yes | no |
| GET /webhooks | yes | no |
| GET /webhooks/{webhook_id} | yes | no |
| DELETE /webhooks/{webhook_id} | yes | no |
| POST /webhooks/{webhook_id}/test | yes | no |
| GET /traffic/status | yes | no |
| GET /traffic/report | yes | no |
| GET /traffic/visitors | yes | no |
| GET /traffic/conversions | yes | no (bundle uses /ga/conversion-values) |
| POST /traffic/conversions | yes | no |
| DELETE /traffic/conversions/{event_name} | yes | no |
| GET /research/runs | yes | no |
| GET /research/runs/{run_id} | yes | no (bundle uses /api/prompt-research/{id}) |
| GET /research/latest | yes | no |
| GET /research/snapshot-credits | yes | no (bundle uses /snapshots/credits/{id}) |
| POST /research/snapshot | yes | no (bundle uses /snapshots/run) |
| GET /reddit | yes | no |
| POST /reddit/subreddits | yes | no |
| DELETE /reddit/subreddits/{subreddit_id} | yes | no |
| POST /reddit/triggers | yes | no |
| DELETE /reddit/triggers/{trigger_id} | yes | no |
| POST /reddit/opportunities/{opportunity_id}/dismiss | yes | no |
| POST /reddit/opportunities/{opportunity_id}/respond | yes | no |
| POST /reddit/scan | yes | no |
| GET /workflows | yes | yes (bundle `/workflows/`) |
| PATCH /workflows/{workflow_id} | yes | yes (bundle `/workflows/{p}`) |
| DELETE /workflows/{workflow_id} | yes | yes |
| DELETE /api/v1/workflows/{workflow_id} | yes | no |
| POST /workflows/from-template | yes | no (bundle uses /workflows/templates/{id}/use) |
| GET /notifications | yes | yes |
| POST /notifications/read | yes | no |
| GET /api/v1/notifications | yes | no |
| POST /api/v1/notifications/read | yes | no |
| GET /content/knowledge | yes | no |
| GET /content/articles | yes | no |
| GET /content/writing-style | yes | no |
| POST /content/knowledge/sources/text | yes | no |
| POST /content/knowledge/sources/url | yes | no |
| DELETE /content/knowledge/sources/{source_id} | yes | no |
| POST /content/knowledge/sources/{source_id}/reprocess | yes | no |
| POST /content/articles/generate | yes | no |
| GET /agency/brand-groups | yes | no (bundle uses /brand-groups) |
| POST /agency/compare-brands | yes | no |
| GET /agency/portfolio-actions | yes | no (bundle uses /actions/portfolio) |

### 5.2 Live internal endpoints with no documentation

Every family below is in part 07 sections 3.2 or 3.3 and has no public documentation.
Listed by family, not by individual path, because part 07 already enumerates them.

| Family | Example paths | Documented | Seen live |
|---|---|---|---|
| Session and account | /auth/session, /auth/sessions, /auth/magic-link, /auth/set-password, /auth/impersonation/verify | no | yes |
| Subscription and billing | /subscription/effective, /subscription/checkout, /subscription/upgrade, /subscription/pause, /subscription/extra-brands, /discount/queue | no | yes |
| Users and keys | /users/me/api-key, /users/me/mcp-token, /users/me/mcp-token/sessions, /users/admin-access, /users/team-directory | no | yes |
| Brand CRUD | /brands, /brands/{id}, /brands/onboard, /brands/analyze-domain, /brands/{id}/markets/{id}/set-primary | no | yes |
| Personas, audiences, topics | /brands/{id}/personas, /brands/{id}/audiences/discover, /brands/{id}/topics | no | yes |
| Prompt health and volume | /prompts/{id}/health, /prompts/{id}/overtakes, /volume/brand/{id}, /suggestions/brand/{id} | no | yes |
| Citation extras | /citations/{id}/gsc, /citations/{id}/videos, /citations/{id}/bust-cache, /citations/teaser/{id} | no | yes |
| Outreach | /outreach/{id}/opportunities and children | no | yes |
| Competitor groups and debug | /competitor-groups/{id}, /competitors/{id}/debug/visibility | no | yes |
| Ledger and correctives | /ledger/{id}, /correctives, /outcomes | no | yes |
| Sites and publishing | /sites/*, /sites/proposals/*, /sites/github/*, /sites/wordpress/* | no | yes |
| Site optimisation | /api/site-optimization/*, /audit-issues, /audit-pages, /crawl-profiles/{id} | no | yes |
| Crawler connect | /crawler-connect/* (cloudflare, vercel, netlify, wordpress, manual, prism) | no | yes |
| Prism admin | /prism/config, /prism/setup, /prism/analytics, /prism/regenerate-key, /prism/disable | no | yes |
| Diagnose extras | /diagnose/run, /diagnose/{id}/diff, /diagnose/{id}/implement, /diagnose/timeline, /diagnose/clear | no | yes |
| Agent and copilot | /agent/*, /copilot/*, /automations/* | no | yes |
| Content and briefs | /content-ideas/*, /api/briefs/*, /api/circulation-templates | no | yes |
| Reports (internal) | /api/reports/generate, /api/reports/{id}, /reports/compare, /exports/csv, /api/export/sheets/{id} | no | yes |
| Perception (internal) | /api/perception/dashboard, /api/perception/story, /api/perception/run, /api/narratives | no | yes |
| Analytics connections | /ga/*, /gsc/*, /integrations/openai-ads | no | yes |
| Referral programme | /referral/* | no | yes |
| Brand groups and clients | /brand-groups, /clients, /client/* | no | yes |
| Agency | /agency/settings, /agency/generate-grounded-pitch, /brand-kit/{id} | no | yes |
| Share and gate | /share/*, /teaser/*, /gates/*, /public/{id} | no | yes |
| Surveys | /surveys/{id}/responses, /surveys/{id}/dismiss | no | yes |
| Admin and telemetry | /admin/*, /analytics/*, /errors/*, /activity/*, /internal/platform-stats, /health | no | yes |
| MCP observability (admin) | /admin/mcp/observability/* | no | yes |
| Supabase PostgREST | /rest/v1/users, /rest/v1/brands, /rest/v1/brand_members, /rest/v1/teams, /rest/v1/team_clients | no | yes |

### 5.3 Reading of the cross-check

1. The public REST API is a separate façade, not the app's own transport. The signed-in
   web app never calls a documented public path except in the crawler, workflow and
   notification families.
2. Every documented path in section 5.1 is therefore "documented, never called by this
   account". That is expected: the account did not hold a Scale plan API key.
3. The undocumented internal surface is roughly six times larger than the documented one.
   A clone must build both: the internal resource API for the app, and the verb-in-path
   public façade for customers and for MCP.
4. The MCP server is a thin wrapper over the public façade. Every MCP tool declares a
   `mapsTo` path, and all of those paths are in `openapi.json`. Building the public façade
   gets the MCP server almost for free.

---

## 6. Gaps in the documentation

| Item | Status |
|---|---|
| API key or MCP token lifetime | NOT DOCUMENTED |
| Token refresh or rotation endpoint | NOT DOCUMENTED |
| Scopes or per-key permissions | NOT DOCUMENTED |
| Request-id header | Explicitly stated as absent |
| Idempotency-Key contract | Explicitly stated as absent |
| Rate limit headers | Explicitly stated as absent |
| Retry-After header | Explicitly stated as absent |
| 409 in the status-code table | Missing, though a 409 example is given |
| `event.data` shapes for 7 of the 8 webhook events | NOT DOCUMENTED |
| Webhook list, get, delete and test request or response examples | NOT DOCUMENTED |
| `get_search_performance` MCP tool purpose and parameters | NOT DOCUMENTED |
| PUT /get-prompts body parameters | NOT DOCUMENTED |
| DELETE /get-prompts response | NOT DOCUMENTED |
| POST /manage-prompt-tags response | NOT DOCUMENTED |
| view=heatmap example for /get-competitor-data | NOT DOCUMENTED |
| view=metrics example for /get-perception | NOT DOCUMENTED |
| PATCH and DELETE /narratives responses | NOT DOCUMENTED |
| Parameters for /crawler/live, /crawler/pages, /crawler/*-details, /crawler/access on the REST page | NOT DOCUMENTED on that page; present in the MCP tool table |
| 58 OpenAPI paths with no endpoint page (section 2.19) | NOT DOCUMENTED |
| `/learn/api/mcp` server-side render | Broken. The page returns "Couldn't load this page / Render error" to non-JavaScript clients. |
