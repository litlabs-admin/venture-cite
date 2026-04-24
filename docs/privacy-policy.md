# Privacy Policy

_Last updated: 2026-04-21_

This Privacy Policy describes how VentureCite (the "Service", "we", "us")
collects, uses, and shares your personal information when you use our
website and product.

> ⚠️ **Operator placeholder.** Before going live, replace `[OPERATING ENTITY]`
> and `[CONTACT EMAIL]` below with the legal entity that operates VentureCite
> and the email address users should reach for privacy requests.

## 1. Who we are

VentureCite is operated by **[OPERATING ENTITY]**. For questions about this
policy or to exercise the rights described below, contact us at
**[CONTACT EMAIL]**.

## 2. What we collect

We collect the following categories of personal information:

| Category             | Examples                                                                        | Why we collect it                                  |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| Account data         | Email, name, hashed password (via Supabase)                                     | Authentication, identifying you in the app         |
| Usage data           | API requests, IP address, user agent, page views                                | Operating the Service, security, audit logging     |
| Brand & content data | Brand profiles, articles, citations, prompts you create                         | Core Service functionality                         |
| Billing data         | Stripe customer ID, subscription status (we do **not** store card numbers)      | Processing payments via Stripe                     |
| Integration tokens   | Buffer OAuth access token (encrypted at rest, AES-256-GCM)                      | Posting to your social profiles when you ask us to |
| Audit logs           | Action, IP, user agent for sensitive operations (deletes, subscription changes) | Compliance, fraud detection, dispute resolution    |

We do **not** sell your personal information.

## 3. Subprocessors

We rely on the following third-party services to operate. Each is bound
by their own privacy policy and (where required) Data Processing Addendum.

| Vendor                | Role                                                     | Data shared                                                              |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Supabase**          | Authentication + Postgres database hosting               | Account, usage, brand, content, audit data                               |
| **Stripe**            | Payment processing                                       | Email, name, payment method (handled directly by Stripe)                 |
| **Resend**            | Transactional email delivery                             | Email address, contents of report emails                                 |
| **OpenAI**            | LLM-backed features (article generation, prompt scoring) | Brand context, user prompts you send through the Service                 |
| **OpenRouter**        | LLM-backed features (alternative model provider)         | Same as OpenAI                                                           |
| **Buffer** _(opt-in)_ | Cross-posting to your social accounts                    | Access token (encrypted at rest), the post content you choose to publish |
| **Sentry**            | Error monitoring                                         | Error stack traces, request URL, user ID (no request body)               |

When you delete your account (see §5), we instruct subprocessors to delete
the data they hold for you, except where retention is legally required
(e.g. tax records held by Stripe).

## 4. How we use your information

- **Provide the Service**: store and process the content you create.
- **Send transactional email**: weekly visibility reports (you can
  unsubscribe at any time using the link at the bottom of any email
  or from your account settings).
- **Security and fraud prevention**: rate-limiting, audit logging,
  detecting abuse.
- **Improve the Service**: aggregate analytics on feature usage.

We do not use your content to train any AI model.

## 5. Your rights

Depending on your jurisdiction (notably under GDPR if you're in the EU/UK
or CCPA if you're in California), you have rights to:

- **Access** your personal data — use **Settings → Download my data (JSON)**
  to get a complete export.
- **Erasure** — use **Settings → Delete account**. The deletion is
  scheduled with a 30-day grace period during which you can email us to
  cancel. After the grace period, your account, brands, articles,
  citations, and integrations are permanently deleted; audit log rows
  remain (with your user ID detached) for compliance integrity.
- **Rectification** — edit your profile in the app, or contact us.
- **Portability** — the export above is provided in machine-readable
  JSON format.
- **Object to processing** / **withdraw consent** — for marketing email,
  use the unsubscribe link in any email or **Settings → Email preferences**.

To exercise any right not self-served by the app, email **[CONTACT EMAIL]**.
We respond within 30 days.

## 6. Data retention

| Category               | Retention                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| Account & content data | While your account is active. Deleted within 30 days of account deletion. |
| Audit logs             | Indefinitely (with user ID set to NULL after account deletion).           |
| Backups                | Up to 30 days after primary deletion.                                     |
| Stripe billing data    | As required by tax law (typically 7 years).                               |
| Server access logs     | 30 days.                                                                  |

## 7. Security

We use the following technical measures:

- TLS in transit for all client and server-to-server connections.
- Database TLS to Supabase, with optional certificate-chain verification.
- AES-256-GCM encryption of integration tokens at rest.
- HMAC-signed webhook verification (Stripe, Shopify) and unsubscribe tokens.
- Strict Content-Security-Policy, HSTS preload, secure cookie defaults.
- Rate-limited authentication endpoints to slow credential stuffing.
- Audit logs for sensitive operations.

No system is impenetrable; if we discover a breach affecting your data,
we'll notify you within 72 hours of confirmation.

## 8. International transfers

If you're outside the United States, your data is transferred to and
processed in the US by us and our subprocessors. Where required, transfers
rely on Standard Contractual Clauses or equivalent safeguards.

## 9. Children

VentureCite is not directed at children under 16, and we do not knowingly
collect their data.

## 10. Changes to this policy

We'll post material changes to this page and update the "Last updated"
date. For significant changes affecting your rights, we'll send a notice
to your account email.

## 11. Contact

Privacy questions, GDPR/CCPA requests, breach reports:
**[CONTACT EMAIL]**.
