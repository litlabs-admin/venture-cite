# VentureCite Security & Bug Review — In Plain English

*A review of the whole codebase, written for anyone — no technical background needed. It explains what we found, why each thing matters, and how bad it would be if left alone. Think of the app as a building: customers rent private offices (their "brands"), and we're checking whether the locks, doors, mail room, and staff actually work the way they're supposed to.*

*The detailed technical version (with exact file names and line numbers for the engineers) lives in a separate file. This one is the story.*

---

## How to read this

Problems are grouped by how much damage they could do:

- 🔴 **Urgent** — someone could see another customer's private data, get in when they shouldn't, or we could lose money/data. Fix before launch.
- 🟠 **Should fix** — real bugs that hurt specific customers or cost money, but the damage is contained.
- 🟡 **Quietly wrong** — things that fail without anyone noticing, so a customer gets a wrong answer or a feature silently stops working.
- 🟢 **Working well** — things we deliberately tried to break and couldn't. Good news, listed so you know it was actually checked.

---

## 🔴 Urgent problems

### 1. One customer can read another customer's private research results
Every time a customer runs a "citation check" (asking ChatGPT, Perplexity, etc. whether their brand gets mentioned), we save the full answers. There's a page that shows those saved answers.

The problem: to open that page you only have to prove you own *your own* brand — but the specific report you ask for is identified by a separate ID number, and we never check that *that report* belongs to you. So a customer who knows (or guesses, or stumbles onto) another customer's report ID can read the other customer's full results, including the raw text of what the AI engines said about their brand.

**Why it matters:** it's the digital equivalent of showing your own key at the door, but then being handed *any* filing cabinet in the building, not just yours. The one thing making it hard today is that the report ID is a long random string that's tough to guess — but the lock itself is broken. **This is the single most important thing to fix.**

### 2. One customer can spend our money running another customer's job
Same underlying mistake as #1, on a different button. There's an action that "continues" a customer's in-progress citation check — which costs us real money every time (it calls the paid AI services). A customer can point that action at *another* customer's job. That runs up our AI bill on someone else's work and scrambles the other customer's data.

**Why it matters:** it's both a privacy problem and a way to make us pay for work that isn't theirs. Same fix as #1: check that the job actually belongs to the person asking.

### 3. A "deleted" account still has full access for 30 days
When a customer asks to delete their account, we don't erase them immediately — we mark them as "deleting" and give a 30-day grace period before we actually wipe them. During that window they're supposed to be locked out.

The problem: the lockout was written, but because of the order our security checks run in, it never actually triggers. A "deleted" customer who keeps their browser session can keep using everything — billing, publishing, running up AI costs — for the whole 30 days.

**Why it matters:** we tell the customer (and ourselves) the account is deactivated, but it isn't. Worth noting: I got this one wrong in my first look — I said the lockout worked. It doesn't. A second reviewer caught it and I confirmed it. That's exactly why we double-check findings instead of trusting the first read.

### 4. Our server can be tricked into fetching things it shouldn't (two versions)
We have a feature that fetches images (like a company's logo) from the web on the customer's behalf. There's a standard safety check that's supposed to refuse to fetch anything on our own internal network (the sensitive stuff cloud servers keep at special "internal only" addresses — passwords, keys, etc.).

The problem: the safety check only inspects the *first* address. If that first address politely says "actually, go look over here instead" (a redirect), we follow it to the new address **without re-checking**. An attacker sets up a web page that redirects our server to an internal address, and now our server is fetching internal secrets and handing them back.

Worse, one version of this doesn't even require an account — it's on a public feature. A second version is reachable through a link-shortener trick using an allowed website.

**Why it matters:** this is one of the classic ways attackers steal cloud credentials. The good news is the *correct* version of this safety check already exists elsewhere in the code — some parts of the app use it properly. The fix is to make the vulnerable parts use the good version too.

### 5. A poisoned link can steal a customer's login
Throughout the app we show clickable links — sources, citations, competitor websites — and many of those web addresses come from AI output or scraped pages, not from us. A safety helper exists that blocks dangerous links, but it's only used in **one** of about nineteen places.

The problem: a web address can secretly be a "run this code" instruction instead of a normal link. If a bad address sneaks into our data and a customer clicks the innocent-looking "Visit source" link, attacker code runs inside the customer's session. And because of how we store the login, that code can grab the customer's login and take over their account.

**Why it matters:** one click on a poisoned link = account takeover. The fix is small: run every external link through the safety helper we already wrote.

### 6. A payment can succeed but never upgrade the customer
When a customer pays, the payment company (Stripe) sends us a "they paid" message. We record that we received the message, then do the upgrade.

The problem: we mark the message as "seen" *before* we finish the upgrade. If anything hiccups in the middle (a momentary network or database blip), the upgrade fails — but because we already marked the message "seen," when Stripe automatically retries, we say "already handled, skip it." The customer paid and never got upgraded, and it can never self-correct.

**Why it matters:** a paying customer silently doesn't get what they paid for, and there's no automatic recovery. It's a money-and-trust problem.

---

## 🟠 Should-fix problems

### Duplicate work and runaway costs
- **Double-clicking "scan" runs two full scans.** Starting a mention scan doesn't properly lock — two quick clicks (or two tabs) both kick off a complete scan, doubling the cost of the external services and AI we pay for.
- **A crashed scan jams scanning forever.** If a scan gets interrupted mid-way (server restart), it's left marked "in progress" and never cleaned up. Every future scan for that brand sees the stuck one and refuses to start. Mention scanning silently dies for that customer with no error shown.
- **A "4-hour cooldown" that doesn't exist.** The code and comments describe a 4-hour wait between manual scans. The actual wait is set to zero. There's no throttle.
- **Duplicate citation results.** Two internal processes can occasionally record the same result twice because there's no rule preventing duplicates, inflating the customer's numbers.
- **Outside services with no time limit.** Calls to Reddit and Hacker News have no cutoff, so a slow response can hang and burn our whole processing budget.

### Spending limits that don't really limit
- **The AI budget cap can be beaten by doing things at once.** We check "are you under your limit?" and only *afterward* record what was spent. Fire several requests simultaneously and they all see "under the limit" and all go through. The cap is more of a suggestion than a wall — for both the chatbot and citation checks.
- **The chatbot cap can be dodged by cutting the connection early.** We only count what the chatbot cost at the very end. A user who disconnects right before the end still got the answer but gets counted as costing nothing.

### Emails behaving badly
- **A whole weekly email never sends.** Two different weekly emails share the same "did we already send this week?" stamp. The first one stamps it, so the second one always thinks it already went out and stays silent. One email feature is effectively dead for active customers.
- **Email preview tools can accidentally unsubscribe people.** Our "unsubscribe" link takes effect the instant it's *opened*. Many email systems (Gmail, corporate scanners) automatically open links to check them — which silently unsubscribes customers who never clicked anything.
- **A customer's name is dropped into emails unescaped.** If someone sets their first name to a snippet of code, that code ends up inside emails we send from our own trusted address. Every other field is handled safely — this one was missed.

### One customer nudging another's data
- **A shared "report card" cache can be poisoned.** Website analysis results are stored in one shared bucket, and one customer can overwrite an entry that another customer's score depends on. The data involved is public, so the damage is limited, but it shouldn't be cross-wired.
- **A few list pages lean on a single lock that has a known bypass.** Some pages that list a customer's items rely entirely on one gate that can be tricked with an unusual request. Today they happen to be saved by an unrelated quirk (the database rejects the malformed request), but that's luck, not design. If the underlying code ever changes, these become real leaks. They should have their own proper check.

### Background jobs that can double-run or get stuck
- **Some scheduled jobs have no "only one at a time" lock.** Most do, but a few (the weekly report, auto citation checks, account cleanups) don't. If the server restarts at the wrong moment they can run twice — double emails, double AI spend.
- **Stuck automated tasks jam a customer's workflow forever.** If one of these tasks is interrupted, nothing ever resets it or retries it, so the customer's onboarding/weekly flow can hang indefinitely.
- **A "poll for result" action does the work before checking permission**, and results with no owner are readable by anyone signed in — the same broken-lock pattern as #1, on a smaller feature.

---

## 🟡 Quietly-wrong problems (fail without anyone noticing)

- **Scraped web text can secretly instruct our AI.** When we read third-party pages to gather facts about a brand, some paths feed that text straight into our AI without the "treat this as untrusted" cleanup that other paths use. A booby-trapped page could slip false "facts" or hidden instructions into a customer's data.
- **A background cleanup can corrupt fact-gathering.** Two internal processes think they're taking turns using the same lock, but they're actually using two *different* locks that don't block each other. On any longer fact-gathering run, a cleanup process can barge in while the main one is still writing, scrambling the counts and marking things "done" early.
- **Some records never get cleaned up and pile up forever.** A results table meant to auto-expire after 24 hours never actually sets the expiry, so it grows without limit, each row holding a full copy of an AI result.
- **Small silent data losses.** A few places quietly swallow errors — a row that fails to save just vanishes from the totals with no warning, and a batch of sentiment analysis silently falls back to "neutral" if the AI's reply is malformed.

---

## 🟢 Things we tried hard to break and couldn't (working well)

These were checked adversarially and held up — worth knowing they're genuinely solid:

- **Payment tampering is blocked.** A customer can't give themselves a paid plan, change the price, apply a fake discount, or check out as someone else. The price is always verified against the real catalog, and the customer is always taken from their verified session, never from what their browser claims.
- **Most customer-data access is properly walled off.** With the two citation-report exceptions above, every place that loads a customer's data correctly checks ownership first. A full read of the giant data-access layer found no other leaks.
- **No database break-in through typed input ("SQL injection").** Every database query safely separates the customer's input from the command. We checked the entire data layer — this common and serious attack is not possible here.
- **Stored secrets are properly encrypted**, and the encryption is done correctly (fresh randomness each time, tamper-detection, right key length).
- **Displayed text can't smuggle in code** (the main content-rendering path scrubs everything), login tokens are handled centrally and never leaked into links or logs, and logging out properly wipes the previous customer's traces so the next person on a shared computer can't see them.
- **Incoming payment and email notifications are properly verified** — forged ones are rejected.
- **The "prove you're the cleanup robot" secret** for scheduled jobs fails safely (if it's missing, nothing runs) rather than leaving the door open.

---

## The scores customers see are sometimes wrong

We reviewed the math behind the visibility scores and grades shown on the dashboard. The scores don't crash and they don't show gibberish — but a few of them are quietly misleading:

- **The dashboard shows a "you improved!" arrow that is permanently fake.** The trend arrow compares this week's number against last week's — but it's built by comparing *two different recipes* for the score (a detailed combined score vs. a simpler one). Because the two recipes give different numbers even when nothing has changed, the arrow can show something like "+15 points improved" forever, on every single load, for a customer whose performance is completely flat. It's the equivalent of a bathroom scale that always says you lost 3 pounds no matter what.
- **A perfect brand can be stuck at 70 out of 100.** One third of the visibility score comes from a "how trusted are your sources" measurement. For a new or not-yet-analyzed brand, that measurement is blank — but instead of leaving it out, the math counts the blank as *zero points earned out of the full 30 possible*. So a brand doing everything perfectly, but without that data yet, is silently capped at 70 and can never show higher. It makes new customers look worse than they are.
- **A brand with no ranking data outscores one with real (mediocre) ranking data.** Because of how a missing input is treated, "we don't know your rank yet" is scored as *best possible*, while "your rank is #5" is scored honestly lower. So the customer with less information looks better than the one with real, middling results. Backwards.
- **"Freshness" can be gamed with a future date.** The score that rewards recently-updated content treats a date in the future as "excellent." Anyone (or any glitchy import) putting tomorrow's date on content gets top marks.
- **A market-share percentage is computed from two mismatched counts**, so it can come out lower than reality.

None of these break anything — but they mean some customers are shown a number that's optimistic-and-fake (the trend arrow) or pessimistic-and-unfair (the capped score). Worth correcting before customers make decisions based on them.

## The database setup has one serious operational risk

We reviewed the scripts that build and update the database. The good news first: **money is stored correctly** (as whole cents, no rounding drift), payment records can't be double-counted, and deleting a brand cleanly removes all its related data without ever touching another customer's. But:

- **🔴 We can't set up a fresh copy of our own system.** The setup scripts, run start to finish on an empty database, fail partway through and stop. They only work on the one database we already have in production, because that database was built up gradually over time. **Why this matters:** if we ever needed a backup site, a new region, a test environment, or had to recover from a disaster, we couldn't stand up a clean working copy from our own scripts. This is the kind of thing nobody notices until the day they urgently need it. It's fixable, but it should be fixed before it's an emergency.
- **A past update quietly broke all new sign-ups for a while.** One update had a small mismatch between two ID formats. The broken code *looked* fine and installed without complaint — it only failed when a real person actually tried to register, and then every registration failed. It's since been fixed by a follow-up, but it's a cautionary example: some breakage hides until it's live.
- **Our "has this person confirmed their email?" record never actually updates.** When a customer clicks their confirmation link, the system that's supposed to flip their status to "confirmed" doesn't get triggered. So that internal flag stays stuck at "not confirmed" forever. Any feature relying on it is reading stale information.
- **A cleanup rule that deletes data has a wide blast radius.** When an email address is reused, a rule automatically deletes the old account row — and that deletion cascades to roughly 28 related tables of that person's data. Under normal conditions it only ever removes genuinely-abandoned leftovers. But during the "broken sign-up" window above, it could in theory have deleted a real, active customer's data. It's a sharp tool that's currently safe only because everything around it is behaving.
- **The database's built-in lock is switched on but empty.** We turned on a table-level security lock across the whole database but wrote no rules for it. In practice this blocks exactly one side-door — the customer's browser talking *directly* to the database — which we don't actually use, so it's a reasonable extra layer. But it protects **none** of our real data flow; that still depends entirely on our app code checking permissions correctly (which, aside from the two citation-report holes, it does). One caveat worth flagging: if anyone ever reconfigures *which database account* the app logs in with, every page in the product could silently go blank, with no obvious cause.

---

## What we checked, and what we haven't

**Checked thoroughly (all of it):** the login/logout/password/signup flows, account deletion, billing and payments, the customer-data permission system across every page, the entire data-access layer, the AI/citation engine, the external scanners (Reddit, Hacker News, Wikipedia, competitor discovery), the chatbot, email sending, background jobs, the whole front-end website, the score-calculation math, and all 85 database setup scripts. This was a full sweep, not a sample.

**Honest limits:** findings from the specialist reviewers were double-checked against the actual code for the important ones, but a review can only prove problems it finds — it can't prove none remain. And I got one finding wrong on my first pass (the "deleted account" lockout, item #3) before a second reviewer caught it — so treat this as a strong, verified starting list, not a guarantee of a clean bill of health.

---

## Bottom line

The foundations are **better than average**. Payments can't be cheated, secrets are encrypted properly, money is counted correctly, the common "break in through a form" database attack isn't possible, and almost every wall between customers is solid.

The genuinely urgent list is short and concentrated:
1. Two broken locks on the citation-report feature (a customer can read/drive another customer's data) — both fixed by one small ownership check.
2. A "deleted" account that isn't actually locked out.
3. Two ways to trick our server into fetching internal secrets.
4. A poisoned-link risk that could steal a login.
5. A payment that can succeed without upgrading the customer.
6. And an operational gap: we can't currently rebuild our own database from scratch.

None of these require rebuilding anything. They're targeted fixes — and several of them share a single root cause, so the effort is smaller than the list length suggests.
