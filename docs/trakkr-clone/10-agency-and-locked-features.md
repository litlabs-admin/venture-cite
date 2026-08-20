# 10 - Agency suite, white-label portal, and Reddit (documentation-derived)

## Scope and source rules

The live trakkr.ai account uses a plan that locks the Agency suite, the white-label
portal, and Reddit monitoring. This file reconstructs those areas from the official
documentation at `https://trakkr.ai/learn/docs/...`.

Labelling rule used in this file:

- `[DOCS]` marks a claim taken from a documentation page.
- `NOT DOCUMENTED` marks a gap. The docs do not state it. Do not invent it.

Screenshots: **NOT DOCUMENTED**. Every one of the 21 pages was checked for images,
alt text, and captions. Each page contains exactly one image: an inline icon
`/images/ai-logos/chatgpt.svg` with `alt=""` and `aria-hidden="true"`, used by the
"Open in ChatGPT" control. No documentation screenshots, no alt text, no captions
exist on any of the pages listed below.

Pages read in full:

| # | Path | Doc title | Read time | Updated |
|---|---|---|---|---|
| 1 | /learn/docs/features/agency | Agency Overview | 6 min read | 10 days ago |
| 2 | /learn/docs/features/agency/pitches | Pitches | 6 min read | 10 days ago |
| 3 | /learn/docs/features/agency/compare | Compare | 5 min read | 7 days ago |
| 4 | /learn/docs/features/agency/actions | Portfolio Actions | 5 min read | 7 days ago |
| 5 | /learn/docs/features/agency/portfolio-results | Portfolio Results | 8 min read | 7 days ago |
| 6 | /learn/docs/features/agency/pdf-export | Agency Reports | 6 min read | 7 days ago |
| 7 | /learn/docs/features/agency/team | Team Management | 5 min read | 7 days ago |
| 8 | /learn/docs/account/white-label/overview | White-Label Portal Overview | 6 min read | 7 days ago |
| 9 | /learn/docs/account/white-label/domain-setup | Domain Setup | 6 min read | 7 days ago |
| 10 | /learn/docs/account/white-label/branding | Branding & Customization | 6 min read | 7 days ago |
| 11 | /learn/docs/features/reddit | Reddit | 10 min read | 7 days ago |
| 12 | /learn/docs/features/results | Results | 9 min read | 7 days ago |
| 13 | /learn/docs/features/actions | Actions | 8 min read | 7 days ago |
| 14 | /learn/docs/features/reports-export | Reports & Export | 7 min read | 7 days ago |
| 15 | /learn/docs/features/reports | Reports & Export (same content) | 7 min read | 7 days ago |
| 16 | /learn/docs/account/brands | Brands | 6 min read | 7 days ago |
| 17 | /learn/docs/account/teams | Teams | 6 min read | 7 days ago |
| 18 | /learn/docs/account/billing | Plans and billing | 7 min read | 7 days ago |
| 19 | /learn/docs/account/settings | Settings | 7 min read | 7 days ago |
| 20 | /learn/docs/features/agent | Agent | 14 min read | 7 days ago |
| 21 | /learn/docs/features/automations | Automations | 13 min read | 7 days ago |

`[DOCS]` `/learn/docs/features/reports` serves the identical body as
`/learn/docs/features/reports-export`. Both render the title "Reports & Export"
and the breadcrumb `Docs > Features > Reports Export`.

Every page carries the same chrome: breadcrumb, title, standfirst, read time,
"Leave feedback", "Open in ChatGPT", a "See also" block (Welcome to Trakkr, Quick
Start, Core Concepts), previous/next links, "Updated N days ago", and
"Was this helpful?".

---

# Part 1 - Page-by-page record

## 1. /learn/docs/features/agency - Agency Overview

Standfirst `[DOCS]`: "Run Trakkr for a portfolio of client brands. Pitches,
cross-brand triage, white-label, team scoping, and the rules that hold it together."

### When to turn it on `[DOCS]`

Signals listed:

- You track three or more separate organizations, not three product lines of one.
- You log in to answer client questions, not your own.
- You want a prospect to see a Trakkr-quality audit before they pay.
- You want clients to see their own data without seeing each other's.

Rule quoted: "Two or more, turn it on. None, leave it off and skip the menu items
you'll never click."

### How to enable it `[DOCS]`

- The Agency entry shows only to an agency audience. Either the user identified as
  an agency at signup, or the team has **Agency Mode** enabled.
- The account also needs the **agency entitlement**, "normally through Scale,
  Enterprise, or an eligible active Scale trial."
- Trakkr waits for both the team check and the entitlement check before it shows
  the entry. "If access cannot be confirmed, it does not guess."
- A team owner reviews Agency Mode in **Settings -> Team**.
- Turning the team flag off "hides the Agency workspace but does not remove
  pitches, brands, Actions, Results, or reports."

### What you get `[DOCS]`

Four workspaces appear in the sidebar under an **Agency** group:

| Workspace | Documented content |
|---|---|
| Clients | Portfolio command center. Every client brand as a row, sorted by status, one-click drilldown into any single brand. A **Compare** view sits inside it. |
| Actions | Three tabs. **Work** is the single-brand Actions list flattened across the portfolio. **Results** and **Automations** show what the work earned and what keeps checking for each client. |
| Reports | Recurring agency-branded report schedules (live white-label link plus PDF, optional approval before each send) and the history of every report the Agent generated. Search, download, regenerate. |
| Pitches | Generates a polished AI visibility audit for a brand you do not yet track. Turns a prospect name into a shareable, editable, branded report. |

- **Team Management** lives in Settings, reachable from the bottom of the Agency
  menu. It handles invitations, roles, brand-scoped access, and the line between an
  agency teammate and a client portal user.
- The Agency surfaces sit alongside per-brand views. "The Agency surfaces do not
  replace them, they sit on top."

### The white-label upgrade `[DOCS]`

- The White-Label Portal gives real client logins, scoped to a brand or group,
  "dressed in your colors".
- The portal can include **Pages** and **Results** as optional client views.
  Pages gives a read-only, page-by-page account of AI search performance. Results
  shows measured before-and-after outcomes, "including honest answers of No
  movement and Couldn't measure."
- When white-label is on, Trakkr branding is hidden from client portal users
  automatically: "logo, upgrade banners, pricing CTAs, 'Powered by Trakkr'".

### Two kinds of person `[DOCS]`

| | Teammate | Client portal user |
|---|---|---|
| Logs in at | app.trakkr.ai | your portal domain |
| Sees | every brand they have access to | only the brand or group invited to |
| Can edit | yes | no |
| Consumes a team seat | yes | no |

"Choose at invite time."

### Common questions `[DOCS]`

- Single-brand workflows do not change.
- Agency mode can be turned off again. Brands, pitches, and reports stay.
- A **brand group** is optional. It organises brands by client or campaign, carries
  a **name** and **color**, appears as section headers on the comparison table, and
  gates access for client portal users. "With ten brands you probably don't need
  them; with forty you do."
- You do not need a real tracked brand to pitch a prospect.
- Billing: brand and seat limits follow the plan or contract. Client portal users do
  not count against team seats "because white-label access is governed separately."

Plan gate table on this page: **NOT DOCUMENTED** (this page states the entitlement
in prose only).

---

## 2. /learn/docs/features/agency/pitches - Pitches

Standfirst `[DOCS]`: "Generate a real AI visibility audit for a prospect brand you
don't yet track. Edit anything, share a public link, convert to a tracked brand when
they sign."

### How the data is real `[DOCS]`

- Two phases against **GPT-5-mini**.
- Pass 1 uses web search to find third-party citations (review sites, lists, news,
  comparison pages), then classifies each source.
- Pass 2 uses those citations to write scores and insights grounded in what was
  found.
- When search returns nothing usable, the generator falls back to model knowledge.
- "Full tracking collects deeper signals across eight models, while a pitch is a
  one-time estimate."
- TIP callout: "A pitch lives in your Pitches list, not your tracked-brands list. It
  does not consume a slot, appear in Compare, or receive scheduled reports."

### Create modal fields `[DOCS]`

Four fields, only the first required:

| Field | Documented behaviour | Default |
|---|---|---|
| Brand name | Required. What the generator searches against. | NOT DOCUMENTED |
| Website | Optional. Improves citation matching when the name is ambiguous. | NOT DOCUMENTED |
| Industry | Pre-suggests three competitors you can toggle on or off. | NOT DOCUMENTED |
| Competitors | Become the leaderboard rows and the citation-gap anchor. The first one is the "competitor" in "17 sources cite competitor but not you". | Three suggested from industry |
| Markets | - | Default **US** |

- Generation takes **30-60 seconds**, with cycling status messages.
- On success you land in the editor.
- If white-label branding is set on the team, a new pitch inherits agency **logo**,
  **name**, **primary color**, **footer text**, and the **"hide Powered by Trakkr"
  flag** by default. Override per pitch later.

### What you can edit `[DOCS]`

- Editable values: visibility score, model score, rank, competitor score, industry
  average.
- Editable text: headings, labels, summaries, insights.
- Structure: show or hide sections, reorder them, change competitors, select AI
  models, add insights from the available icons.
- Full undo/redo with **Cmd+Z / Cmd+Shift+Z**.

### Sharing `[DOCS]`

- A pitch is private by default.
- **Share** produces the public link at `/pitch/:slug`.
- A **password** can be added.
- Viewers see the published pitch without edit controls or hidden sections.
- The page supports mobile screens.
- The card shows a **view count**: "You see the count, not the viewer."
- Flip public back to private to revoke the link without deleting it.
- **Export PDF** in the row menu produces a PDF-friendly version.
- The row menu has **Duplicate**.

### Conversion `[DOCS]`

Take the same inputs (name, website, industry, competitors, markets) and add the
brand to the team as a normal tracked brand. The pitch stays in the Pitches list as
a historical artifact. "the two do not rewrite each other."

### Use patterns `[DOCS]`

Cold outbound. The first sales call. Mid-cycle materials.

### Legacy URL `[DOCS]`

"The old `/agency/demos` and `/agency/demos/:id` addresses still open the Pitches
workspace, so saved links keep working."

### Plan access `[DOCS]`

| Plan | Pitches |
|---|---|
| No plan | No access |
| Growth | No access |
| Scale | Full access, unlimited pitches |
| Enterprise | Full access, unlimited pitches |

### Common questions `[DOCS]`

- Pitch scores are not tracked-brand scores.
- Add the website when the brand name is ambiguous.
- "Powered by Trakkr" shows by default. Change it in the pitch editor or in
  white-label branding.
- Google indexing: "We discourage it and set the right headers", use the password
  option to prevent discovery.
- Duplicate works as a template.

---

## 3. /learn/docs/features/agency/compare - Compare

Standfirst `[DOCS]`: "Use the Compare view on Agency home to read client brands side
by side and choose where the team should focus."

- `[DOCS]` "Compare is a view on Agency home, not a separate page. The old
  `/agency/compare` address redirects there."

### The three Agency home views `[DOCS]`

Agency home has three views: **Overview**, **Compare**, and **Needs attention**.
They use the same portfolio data and search field.

| View | Documented content |
|---|---|
| Overview | Default. Compact columns: **client, status, visibility, trend, next Action**. Select a row to make that client the active brand and open its Dashboard. |
| Compare | Expands the portfolio measures and enables row selection. Select **two to four** clients; the side-by-side panel opens above the table. Select a row itself to open the **client drawer**, with links to **Dashboard, Prompts, and Citations**. |
| Needs attention | Narrows the same table to **At Risk, Watch, New, missing-report, or risk-marked** clients. |

### Status `[DOCS]`

Every row carries a computed status pulse: **At Risk, Watch, New, Improving,
Healthy, or Paused**. At Risk and Watch are reacted to first. The default sort puts
urgent rows at the top. Status is computed from the brand's recent visibility trend
and report coverage. A brand needs completed reports before it gets a meaningful
status; until then it stays **New**. A paused brand keeps its row and history.

### Columns `[DOCS]`

- Supporting the status: visibility, trend sparkline, rank, prompt count,
  citations, model winners.
- The Compare table measure set: **visibility, presence, rank, prompts, citations,
  model strength, competitor gap, and pending Actions**. Select a column heading to
  sort.

### Window `[DOCS]`

"The page uses the last seven completed reports as its comparison window. There is
no separate time-range control on Agency home."

### Search, freshness, quick links `[DOCS]`

- Search matches **client name and website** and applies to all three views.
- A **freshness label** in the header tells you when the portfolio data last loaded.
- Row menu: open Dashboard, start a pitch, send a report, open that client's
  Actions, copy a client link.
- The **portfolio pulse** above the table shows **average visibility, client count,
  Needs attention, and At risk**. The Needs attention stat also opens that view.

### Plan access `[DOCS]`

| Plan | Brand Comparison |
|---|---|
| No plan | Teaser only |
| Growth | Teaser only |
| Scale | Full access |
| Enterprise | Full access, higher brand limits |

### Common questions `[DOCS]`

Different numbers versus the brand dashboard, pause versus delete, a brand stuck on
"New", and a missing brand (check search, team access restrictions, team ownership,
portfolio inclusion).

---

## 4. /learn/docs/features/agency/actions - Portfolio Actions

Standfirst `[DOCS]`: "Manage work across every client brand, then review portfolio
Results and Automations from the same workspace."

### Three tabs `[DOCS]`

| Tab | Documented content |
|---|---|
| Work | The cross-brand Action list. |
| Results | Groups measured outcomes across clients as **Earned, No movement, Couldn't measure, Reverted, or Coincided with a drop**. |
| Automations | Which Automations are active for each client, what each is allowed to do, and what its recent checks found. |

Lifecycle is the same as single-brand: **start, complete, dismiss, snooze, pin,
reopen**.

### Group-by dropdown `[DOCS]`

Four options:

| Option | Behaviour |
|---|---|
| Time horizon (default) | Splits the queue into **Now, Up next, and Later**. |
| Brand | Turns each brand into a section. |
| Work type | Groups similar work. Words used: **Technical fix, Page improvement, Content refresh, New content, Outreach draft, Reply draft, Campaign, Setup, and Watch**. |
| Action type | Finds repeated Actions across brands. Section headers show the brand count. |

### Brand filter and row context `[DOCS]`

- The brand filter is a chip-style multi-select in the toolbar. It scopes the queue
  to one or more brands and **persists to the URL**, so the filtered view is
  shareable.
- Every row carries the brand's **favicon and name** without a separate column.

### Acting on an action `[DOCS]`

- The detail pane has the **briefing, evidence, playbook, and any drafts**.
- Bulk transitions work across brands. "Complete attaches the right per-brand
  visibility snapshot to each."
- The page auto-advances to the next action after Complete or Dismiss.
- For executable Action types (CMS fixes, content publishing) the inline controls
  work the same way. "There is no separate cross-brand approval flow."

### Plan access `[DOCS]`

| Plan | Portfolio Actions |
|---|---|
| No plan | No access |
| Growth | No access |
| Scale | Full access |
| Enterprise | Full access |

### Common questions `[DOCS]`

- The synthesized briefing stays on the brand's Actions page.
- Dismissing here is the same record as the single-brand queue.
- The emitter retires an action automatically when the signal resolves.
  Example given: a `fix_audit_issue` for a 404 disappears when the 404 is fixed; a
  `get_listed_on_source` disappears when the listing lands.
- Bulk-complete across brands is supported.

---

## 5. /learn/docs/features/agency/portfolio-results - Portfolio Results

Standfirst `[DOCS]`: "See what work earned across every client, explain what could
not be measured, and review active automations in one place."

Location `[DOCS]`: **Agency -> Actions**, tabs **Work**, **Results**,
**Automations**. Any brand filter applied on the page also scopes Results and
Automations.

### Results tab `[DOCS]`

- Grouped by outcome. Each row says what changed, names the client, links the page
  when one exists, and shows when Trakkr measured it. Selecting a row returns to the
  Action that produced the result.
- The four **headline counts are filters**: **Earned, No movement, Coincided with a
  drop, Couldn't measure**.
- Work-type filters use the same nine words: Technical fix, Page improvement,
  Content refresh, New content, Outreach draft, Reply draft, Campaign, Setup, Watch.

### Result words `[DOCS]`

| Word | Meaning |
|---|---|
| Earned | The chosen measure improved between before and after readings. It does not claim the Action caused the change. |
| No movement | The measure held steady over the window. A completed answer, not unfinished work. |
| Couldn't measure | Trakkr could not make an honest before-and-after comparison. The reason is part of the result. |
| Coincided with a drop | The measure fell in the same window. Trakkr does not say the Action caused the fall. |
| Reverted | A change that coincided with a drop was rolled back. |

Warning callout `[DOCS]`: "Results compare before and after. They do not prove
causation. Say that a change coincided with an outcome. Do not say it caused or
boosted it."

### Reasons for Couldn't measure `[DOCS]`

- Crawler tracking is not connected.
- Search Console is not connected.
- The Action is not linked to a page.
- The page had no activity in the window.
- Citation history was not available.
- There was no before reading.

"When unmeasured rows dominate, Trakkr groups them and explains the main reason
once. It does not place a green mark beside each row."

### Fix workflow, per client `[DOCS]`

1. Connect crawler tracking. Confirm crawler visits reach Trakkr before relying on
   **Reached**.
2. Connect Google Search Console. Use the property that covers the exact client
   domain and pages. Supports **Visited**.
3. Check page links on Actions. Add the correct page before the measurement window
   closes.
4. Let the baseline form.
5. Keep report cadence active.

Journey stages named `[DOCS]`: **Available, Reached, Understood, Relevant, Selected,
Visited**.

Tip callout `[DOCS]`: "Do this during onboarding... You cannot recover a trustworthy
baseline after the fact."

### Automations tab `[DOCS]`

- Grouped by client.
- Headline counts: **Active, Paused, No checks yet, and findings from the last 30
  days**.
- Each row gives: the Automation **name and goal**; **Allowed to** (effective
  permission by work type); the number of checks in the last 30 days, how many found
  something, and how many failed; **Active or Paused**; the time of the latest
  check, or **No checks yet**.
- Permission words: **Tells you**, **Suggest only**, **Prepare drafts**, **Do it,
  then tell me**, **Handle it**. "The table shows the effective level after team and
  client controls apply."
- Three problems to find: an important client with no Automation, an Automation that
  has never checked, an Automation with repeated failed checks.

### Client update workflow `[DOCS]`

Filter to one client. "The Results tab can copy a plain-text update based on the
rows on screen."

Put in front of the client: Earned results with before and after figures; No
movement when it changes the next decision; a drop when it affects risk, scope or
next step; the full count of measured and unmeasured work; the connection needed
when Couldn't measure is material; active Automations that support the service.

Keep internal: failed checks retried with no client impact; drafts that never
reached approval; permission details; technical rollback notes.

"Never hide a poor outcome. The distinction is relevance, not comfort."

### Access `[DOCS]`

Part of the Agency workspace, same entitlement rule as Agency Overview. Needs at
least one accessible client brand.

### Common questions `[DOCS]`

Earned does not claim causation. Couldn't measure is not an error. Headline counts
show the available distribution across selected clients while the table shows the
chosen slice. The Automations table can be sent to a client but a shorter summary is
better. Both tabs read stored results and Automation history; opening the page does
not start a new measurement or check.

---

## 6. /learn/docs/features/agency/pdf-export - Agency Reports

Standfirst `[DOCS]`: "Schedule branded client reports, review held sends, and find
every generated report across your portfolio."

Routing `[DOCS]`: "The old `/agency/pdf-export` and `/agency/reporting` addresses
redirect here. A link with `?tab=history` opens the archive directly."

### Schedules tab `[DOCS]`

**New schedule** fields:

| Field | Documented options / default |
|---|---|
| Client brand | one client brand per schedule |
| Cadence | Weekly, every two weeks, monthly, or quarterly |
| Day and hour | in the client's time zone |
| Reporting window | 7, 14, or 30 days. Changes compare with the prior matching period. |
| Recipients | one or more email recipients, and an optional note |
| Sections | Visibility, Competitors, Citations, Recommendations |
| Delivery format | A live white-label link, an attached PDF, or both |
| Approval | Whether you must approve each send first |

- The report takes its **logo, portal name, and colour** from the team's white-label
  branding. The schedule editor shows the current branding and links back to
  Settings.
- **Preview** before saving. It shows the report content and client email as they
  will appear.
- A saved schedule row shows **client, cadence, next send, recipient count, and
  state**.
- Row actions: **Send a test**, **Open its delivery history**, **Edit**, **Remove**
  (stops future sends, keeps past report history), **Pause or resume**.

### Approval before delivery `[DOCS]`

Setting name: **Require my approval before each send**. The Schedules tab places
held reports in an **approval inbox**. Review, then approve or reject before
anything reaches the client.

Tip callout `[DOCS]`: send a test before the first live delivery, and check
recipient list, subject, white-label link, attached PDF, and mobile layout.

### History tab `[DOCS]`

Columns: **client, creation date, page count and file size, and state**.

| State | What it means |
|---|---|
| Queued | Trakkr has accepted the request and is waiting to start. |
| Generating | The report is being built. |
| Ready | The file is complete and available to download. |
| Failed | The report could not be made. Select Retry. |
| Expired | The old file is no longer available. Select Retry to make a fresh copy from the saved setup. |

- Search by client or report; filter by state.
- Ready rows download. Failed and expired rows retry.
- The archive records whether a report was emailed and when.
- History refreshes while open. On a lost connection it keeps the saved list visible
  and warns it may be out of date.

### On-demand reports `[DOCS]`

Use **Ask Agent to generate**. Documented example prompts:

- "Generate a monthly report for Hoka with visibility, competitors, and citations."
- "Make a client-ready recap for Acme for the last 14 days."

The completed report appears in History.

### Routine `[DOCS]`

1. One schedule per client, window matched to the contract.
2. Approval on for the first few deliveries.
3. Preview and send a test.
4. Review held sends on reporting day.
5. Use History to confirm delivery, download, or retry.

### Plan access `[DOCS]`

"Agency Reports needs Agency access. The Agency area appears for a self-declared
agency or a team marked as an agency, once the account's Agency entitlement is
confirmed. Availability and limits follow your current plan or contract."

### Common questions `[DOCS]`

History is an archive only. Recurring reports are created here (the earlier PDF
Exports page did not create schedules). Pause stops sends without losing the
schedule. Clients do not see Agency Reports.

Related question listed on the page `[DOCS]`: "PDF export and share links for my
report only work intermittently. Is that a known issue? asked 1x".

---

## 7. /learn/docs/features/agency/team - Team Management

Standfirst `[DOCS]`: "Invite teammates, set roles, scope brand access per member,
and understand the difference between an agency teammate and a client portal user.
The agency-side roster, in one page."

### Comparison table `[DOCS]`

| Property | Teammate (agency user) | Client portal user |
|---|---|---|
| What they are | Someone on your team who works on clients | A client you've given read access to their own brand |
| How they're invited | Settings -> Team -> Invite Member | Per-brand or per-group invite from the brand or group page |
| Where they log in | The Trakkr app | Your portal domain, for example ai.youragency.com |
| What they see | Every brand they have access to, full editor controls | Their own brand or group only, read-shaped |
| Consumes a team seat? | Yes | No |
| Sees Trakkr branding? | Yes | No (hidden by white-label) |

"The client portal user mechanics live in White-Label -> Permissions."

### Roles `[DOCS]`

Three cascading roles.

| Role | Documented rule |
|---|---|
| Owner | Exactly one person. Permanent in the UI; to reassign, contact support. |
| Admin | The right default for operators. Can invite teammates, create brands, and edit anything they have access to. |
| Viewer | Watches, does not edit. Head of services, partner agency lead, board member. |

### Inviting `[DOCS]`

- Control name: **Invite team member** on **Settings: Team**.
- Paste several emails or add one at a time, pick a role, optionally scope brand
  access at invite time.
- Pending invites stay on the page with **resend** and **revoke** controls.
- The invite form checks whether an email already has a Trakkr account or belongs to
  another team, then warns before you send.
- Inviting an email that is already a client portal user **promotes them from client
  to teammate** on accept. The modal shows a hint before this happens.

### Per-brand access scoping `[DOCS]`

- Edit a member and turn on **Restrict brand access**.
- Per brand choose: **View only**, **Can edit**, or **no access**.
- "A restricted member cannot create new brands."
- "Restrictions are enforced on data access, not just hidden in the menu."

### Day-to-day `[DOCS]`

Role changes, member removal, pending invite revocation, and leaving the team for
non-owners. Client portal activity has its own log in White-Label settings.

**Billing access** is a separate flag, **off by default**, granted by the owner to
any Admin. It controls whether they can see the billing page and update payment
methods.

### Plan access `[DOCS]`

| Plan | Team Management |
|---|---|
| No plan | Single user only |
| Growth | Up to 3 seats including the owner |
| Scale | Full team management, brand-access scoping, agency mode |
| Enterprise | Same as Scale, higher seat counts |

### Common questions `[DOCS]`

One team per account. Client portal users do not count against seats. Brand
restrictions survive a promotion to Admin. Billing access needs an explicit grant.
A teammate seeing unexpected brands may have separate client portal group access.

---

## 8. /learn/docs/account/white-label/overview - White-Label Portal Overview

Standfirst `[DOCS]`: "Give clients a read-only Trakkr portal under your name,
branding, and domain."

### What's included `[DOCS]`

- Your portal name, logo, favicon, accent colour, and login copy.
- A custom subdomain with HTTPS.
- Branded client email from a verified domain.
- Client access to one or more brands, or a whole brand group.
- A menu you control, with client-facing names for each feature.
- Optional **Pages**.
- Optional **Results**.
- A shared export setting plus a per-client export permission.
- Welcome text, method text, footer links, and copyright text.
- Client activity logs and retention controls.

"The portal remains read-only. A client can explore the data and use the exports you
allow, but cannot change prompts, competitors, brand settings, Actions, or your
agency setup."

### What clients can see `[DOCS]`

- **Required base, four features**: Dashboard, Competitors, Citations, Prompts.
- **Optional**: Reports, Perception, Pages, Results.

### Brand access and group access `[DOCS]`

- Selected-brand access is fixed to the brands on the invite.
- Group access follows the group. Brands added to the group later become visible
  without a new invite.
- Portal users do not consume team seats and use a separate client permission model.

### Where to configure it `[DOCS]`

Open **Settings: White-Label**. Owners and authorised admins see **seven sections**:

1. Branding
2. Clients
3. Features
4. Onboarding
5. Footer
6. Email
7. Logs

"Domain setup sits above these sections. The **Preview** action opens the current
portal."

### Access and billing `[DOCS]`

- "An active Scale trial may open internal Agency tools, but it does not publish a
  client portal that could disappear when the trial ends."
- "Client-facing access needs the white-label entitlement on a paid Scale-equivalent
  account or contract."
- "White-label billing is counted by enabled brand, not by client login." Several
  client users can access the same enabled brand without another brand charge. The
  invite screen shows the billing effect before you confirm.
- Note callout: "Use the current Billing screen as the price source."

### Safe launch order `[DOCS]`

1. Add the portal name, logo, colour, and login copy.
2. Configure the custom domain and wait for HTTPS to become active.
3. Set up branded email and send yourself a test.
4. Choose the visible features. Decide whether Pages and Results are ready.
5. Write the welcome and method text, then check the footer.
6. Open Preview on desktop and mobile.
7. Invite an internal test address with the same access you plan to give the client.
8. Review the test account, then send the client invite.

Warning callout `[DOCS]`: "Do not test only while signed in as an agency teammate...
Use a separate client address or a private browser window."

### Common questions `[DOCS]`

Clients cannot edit; export is the only data action you can add. One client can see
several brands. **Feature visibility is set on the shared portal menu, so it applies
to all portal clients. Brand and export permissions can vary by client.** Client
users are not team seats.

---

## 9. /learn/docs/account/white-label/domain-setup - Domain Setup

Standfirst `[DOCS]`: "Point a subdomain at your client portal, verify DNS, and wait
for HTTPS to become active."

- `[DOCS]` "Domain setup is the banner at the top of Settings: White-Label. You must
  be a team owner or admin with white-label access."

### Choose a subdomain `[DOCS]`

Examples given: `ai.youragency.com`, `portal.youragency.com`,
`insights.youragency.com`. "Do not use the root domain that serves your main
website." The setup form combines the subdomain and root domain and checks format.

### CNAME record `[DOCS]`

| Field | What to enter |
|---|---|
| Type | CNAME |
| Name | The subdomain shown in setup |
| Target | The target shown in setup |
| TTL | Your provider's default is usually fine |

- "Copy the target from Trakkr. Do not assume a target from an older setup or this
  guide, because infrastructure can change."
- Remove any A, AAAA, or CNAME record already using the same host first.
- Warning callout: with Cloudflare DNS, set the record to **DNS only** (grey cloud).
  "A proxied orange-cloud record can stop Trakkr from verifying the CNAME."

### Wizard and states `[DOCS]`

The wizard has three stages: **Domain, DNS, and Verify**.

| State | Meaning |
|---|---|
| DNS pending | the expected CNAME is not visible yet |
| Still verifying DNS | Trakkr is checking automatically |
| SSL provisioning | the CNAME is correct and the certificate is being prepared |
| Custom domain active | the portal is live at the HTTPS address |
| Domain setup failed | the page shows the error and lets you manage the setup |

"HTTPS setup usually takes a few minutes after DNS verifies." You can close the
wizard; Trakkr can email you when the portal is ready.

### Check the result `[DOCS]`

1. Open the domain link from White-Label settings.
2. Confirm `https://` and no certificate warning.
3. Open a private browser window.
4. Check the portal name, favicon, logo, and login copy.
5. Sign in with a test client and follow links to Dashboard, Pages, Results, and
   Reports as enabled.

### Troubleshooting DNS `[DOCS]`

Check the record type is CNAME; the host matches the full domain entered in Trakkr;
the target matches Trakkr's value with no `https://` prefix; no A or AAAA record on
the same host; Cloudflare proxying off; time to propagate.

Terminal command given: `dig ai.youragency.com CNAME +short`. "Some DNS tools show a
trailing dot; that is normal."

### Troubleshooting HTTPS `[DOCS]`

1. Recheck that Cloudflare proxying is off.
2. Leave the CNAME in place while certificate setup completes.
3. Use **Manage Domain** to review the current error.
4. If the same domain was used by another Trakkr team, contact support.

"Do not point the record elsewhere while provisioning."

### Change or remove `[DOCS]`

**Manage Domain** offers change or delete. Changing starts a fresh DNS and HTTPS
setup. Deleting removes the custom domain configuration. Portal settings, client
accounts, and brand data remain.

Warning callout `[DOCS]`: tell clients before changing a live portal address, and
update saved links, onboarding emails, report links, password-manager entries, and
any SSO or allowlist rules that name the old host.

### Common questions `[DOCS]`

Use a subdomain, not the root. Two teams cannot share one custom domain. The target
is configuration-driven. Prepare clients before HTTPS is active, but wait to send
the live address.

---

## 10. /learn/docs/account/white-label/branding - Branding & Customization

Standfirst `[DOCS]`: "Set your client portal identity, login page, onboarding text,
footer, and branded email."

### Branding section, six controls `[DOCS]`

| Control | Where it appears |
|---|---|
| Portal name | Browser tabs, emails, and welcome text |
| Logo | Header, login page, emails, and PDF reports |
| Favicon | Browser tab and bookmark |
| Accent colour | Buttons, links, selected items, and focus states |
| Login headline | Main text on the client login page |
| Login tagline | Supporting text under the login headline |

- "Changes save while you work. The header shows when a save is in progress."
- "A desktop portal preview sits below the form, with preview modes for the main
  client surfaces."
- Accent colour: enter a hex value or use the picker. "Trakkr derives the lighter
  and hover states." A contrast warning appears if the colour is hard to read on
  white.
- Accepted logo file types: **NOT DOCUMENTED** ("The upload control tells you which
  files it accepts.").

### Onboarding `[DOCS]`

Answers four questions: what the portal is for; what the agency tracks; how often
new data arrives; who to contact. "Keep the welcome short. Put the longer
explanation in the method section." Use the same wording as Results, including
**Coincided with a drop** and **Couldn't measure**.

### Footer `[DOCS]`

Links and copyright text. Suggested links: main site, privacy notice, service terms,
support page. Links can be reordered and removed. Check every link from Preview.

### Feature names `[DOCS]`

Edited under **Features**, not Branding. "Renaming changes the portal menu label
only. It does not rename page headings, reports, data, or internal Agency
navigation." Keep **Pages** and **Results** unless the service has a clearer
established client term.

### Branded email `[DOCS]`

- Send from `noreply@yourdomain` after the domain is verified.
- Settable: **Sender name**, optional **reply-to address**, **Email domain**.
- "The from address itself is fixed to `noreply@` on the verified domain."
- Trakkr shows the DNS records returned for your domain. Add those exact records and
  wait for every check to pass.
- Once verified: **Preview emails** and **Send test email**. Check sender, reply
  address, logo, button colour, footer, and spam placement.
- Warning callout: "Do not copy generic SPF or DKIM examples from a guide."

### What branding does not change `[DOCS]`

Client data, feature visibility, export rights, brand access. Those live in Features
and Clients. It also does not change the agency-side app.

### Launch check `[DOCS]`

1. Open the portal Preview.
2. Check the login screen, menu, Dashboard, Pages, Results, and a report.
3. Narrow the browser to a phone width and check the logo and menu.
4. Send a test email to an address outside your own domain.
5. Check footer links in a private browser window.
6. Confirm the custom domain shows as active.

### Common questions `[DOCS]`

Feature labels save under Features. A colour warning means low contrast on white.
Per-client logos are not supported: "The portal branding belongs to the team." The
portal name does not change the agency name in Trakkr.

---

## 11. /learn/docs/features/reddit - Reddit

Standfirst `[DOCS]`: "Reddit is one of the most heavily cited sources in AI answers.
Trakkr tracks the threads shaping what AI says about your brand, scores each one for
citation potential, and helps you contribute without getting downvoted off the
platform."

### Why Reddit matters `[DOCS]`

| Why it matters | What it means for you |
|---|---|
| Authentic, first-person language | AI models read Reddit as humans talking, not brands marketing. |
| Recency at scale | Subreddits surface new threads every day. |
| Built-in social proof signals | Upvotes, comments, and OP follow-ups weight one opinion against another. |
| Category-specific subreddits | r/marketing, r/saas, r/devops, r/parenting. Pre-clustered by intent. |
| Licensed access | Google and OpenAI have paid licensing deals with Reddit. |

### Pipeline `[DOCS]`

You configure subreddits and keywords -> Trakkr scans threads -> each thread is
scored -> brand and competitor mentions are detected -> opportunities surface in
your feed.

### Monitoring `[DOCS]`

- You choose subreddits to watch and keywords to listen for. Common keyword
  triggers: brand name, category, competitors, problems the product solves.
- During onboarding, the **Suggestions** tool reads the brand profile and proposes a
  starter list.
- Scans run **on demand** from the **Scan** button in the header and on a
  **background cadence** for brands with monitoring set up.
- Each scan pulls recent threads, filters out NSFW and disallowed communities, and
  applies relevance scoring.

### Citation scoring `[DOCS]`

Score range **0 to 100**, weighted on five factors:

| Factor | What it picks up |
|---|---|
| Thread format | Phrases like "best", "vs", "alternative", "recommend" in the title. |
| Subreddit authority | How much weight models give the source community for your category. |
| Response quality | Comment volume as a proxy for genuine discussion. |
| Engagement | Upvote count as a proxy for whether the thread resonated. |
| Freshness | Recent threads score higher. Older than two weeks loses ground fast. |

An LLM relevance check runs on top. Threads unrelated to your brand or category get
a **20-point penalty**.

Band filters in the page header:

| Band | Citation score | Read it as |
|---|---|---|
| High | 70+ | Likely to be picked up by AI models. Worth showing up in. |
| Mid | 40-69 | Real conversation, lower citation odds. Watch for trends. |
| Low | <40 | Background noise. Useful for sentiment, not for action. |

### Opportunities `[DOCS]`

The **Opportunities** preset filters the feed to flagged threads, "ranked by a
composite of LLM relevance, business value, and citation potential."

Per opportunity you can:

- Open it in the **detail drawer** to read the thread summary, see which brands are
  mentioned, and check the citation factors.
- **Mark responded**.
- **Dismiss** ("it won't come back").
- **Draft reply**.

### Drafts `[DOCS]`

The generator pulls from site content and brand profile. Graded on four dimensions,
each **0-10**, with an overall composite at the top:

| Dimension | What it scores |
|---|---|
| Helpfulness | Does it actually answer the question being asked? |
| Specificity | Does it cite concrete details, or hand-wave with marketing copy? |
| Tone | Does it sound like a person in the community, or a brand account? |
| Non-spammy | Would a Reddit user flag this as promotion? |

You can regenerate, edit in place, or copy out. "Trakkr never posts on your behalf."

### Strategy `[DOCS]`

Do not: run paid campaigns as the primary play; use interns and burner accounts;
drop your link. "Most communities enforce a 9:1 rule or stricter."

Do: build a real presence with named accounts and disclosure in the bio; answer the
question first; focus on a few subreddits; disclose when relevant.

Warning callout `[DOCS]`: the draft grader cannot tell whether the account looks
like a brand account. "Build account history before you participate in high-stakes
threads."

Paid ads work for awareness in a new category, niche subreddit targeting, and
driving traffic to useful content. "What they don't do is generate citations."

### Measurement `[DOCS]`

- Each significant thread becomes an **external page record** holding citation
  evidence, linked reply work, and Timeline.
- "External records do not show the six-stage owned-page journey."
- Starting a Reply draft freezes a **42-day measurement plan** around two facts:
  whether an AI platform cites the thread, and whether the thread starts mentioning
  your brand.
- The draft itself is not a win. It moves to **Measuring** after you mark the work
  shipped, then to **Earned, No movement, or Couldn't measure**.

Tip callout `[DOCS]`: the **Manage** panel offers **daily, weekly, or monthly**
digest emails. "Weekly is the right default for most brands."

### Plan limits `[DOCS]`

"Paid feature. Without a paid plan you see a teaser; tracking starts on Growth."

| Plan | Subreddits | Keyword triggers | History | Drafts per month |
|---|---|---|---|---|
| No plan | 0 | 0 | 0 days | 0 |
| Growth | 10 | 20 | 30 days | 10 |
| Scale | Unlimited | Unlimited | 90 days | Unlimited |

Enterprise row: **NOT DOCUMENTED** on this page.

### Other documented controls `[DOCS]`

- **Mention type** filter values: **Your brand, Competitors, Both, None**.
- An **Analytics** tab exists and reflects mention counts per subreddit over time.
- Manual scans have a **30 second cooldown**. Scans run as Cloud Tasks in the
  background.

---

## 12. /learn/docs/features/results - Results

Standfirst `[DOCS]`: "How Trakkr measures shipped work, keeps the bar fixed, and
reports wins, misses, and gaps without claiming causation."

### Frozen plan `[DOCS]`

The measurement plan is frozen when you start the work. The plan names the **page,
the primary measure, any supporting measures, the window, and the bar** for an
earned result. Setup is the exception and opens no window.

### Five states `[DOCS]`

| State | What it means |
|---|---|
| Measuring | The work shipped and its frozen window is still open. |
| Earned | The primary or supporting measure cleared the fixed earned bar. |
| No movement | Enough evidence to judge, but the change did not clear the bar. |
| Couldn't measure | The window closed without enough valid evidence to judge. |
| Reverted | A reversible change Coincided with a drop and was put back through its original publishing path. |

Couldn't measure "never becomes No movement, never counts against your earn rate,
and never triggers a rollback."

### Windows by work type `[DOCS]`

| Work type | Standard window | What it normally measures first |
|---|---|---|
| Technical fix | 14 days | AI bot fetches of the target page |
| Page improvement | 28 days | Search Console clicks to the page |
| Content refresh | 42 days | New citations of the page |
| New content | 42 days | New citations of the page |
| Outreach draft | 42 days | Citations from the target source and whether that source starts mentioning you |
| Reply draft | 42 days | Whether an AI platform cites the thread and whether the thread mentions your brand |
| Campaign | 70 days | A combined view of citations and fetches |
| Setup | Not measured | It unlocks a source or delivery path |
| Watch | No earned window | It keeps checking for a change that needs attention |

### The earned bar `[DOCS]`

`max(before x 1.25, before + 3)`

Impressions use a higher absolute floor of **50**.

### Couldn't measure reasons and fixes `[DOCS]`

| Reason shown | What to do |
|---|---|
| Crawler tracking is not connected | Connect crawler tracking. |
| Search Console is not connected | Connect Search Console. |
| The work is not linked to a page | Attach the work to the page it changed. |
| The page had no activity in the window, before or after | Check the right page was attached, then wait for real activity. |
| No connected source can see this page yet | Connect crawler tracking or Search Console. |
| Citation history was not available for this window | Let the next citation snapshot land. |
| The work never recorded a completion date | Correct the completion record. |
| There was no before reading to compare against | Keep the result unjudged. |

### Rollback support matrix `[DOCS]`

| Change | WordPress | Webflow | Shopify | GitHub |
|---|---|---|---|---|
| Meta title or description | Yes | Yes | Yes | Yes, through a pull request |
| Open Graph, canonical, llms.txt, or robots.txt | Yes | Yes | No | Yes, through a pull request |
| Structured data | Yes | No | No | Yes, through a pull request |
| Alt text | Yes | Yes | No | No |
| Heading structure | No | No | No | Yes only |
| Delete an article created by the change | Yes | Yes | No | No |

A change also needs a saved original value and must be inside the **30-day rollback
window**. With **Handle it** granted, Trakkr can revert and tell you. With a lower
permission the revert waits for your decision.

### Earn rate `[DOCS]`

`Earned / (Earned + No movement)`

Couldn't measure is excluded. Coincided with a drop and Reverted are also outside
the rate. The count of Couldn't measure results is always shown beside the rate.

### Quarter recap `[DOCS]`

Lives at **/results/quarter**. Older **/proof/quarter** links redirect there. The
recap compares goals with work delivered and measured, and shows earned results, No
movement, Couldn't measure, and reverts. "Misses receive the same visual weight as
wins."

### Share a result as an image `[DOCS]`

An Earned result linked to a page can be copied as a **1200 by 630** image. It
includes the measure, before and after values, the ship marker, the measurement
window, and the brand or agency name.

---

## 13. /learn/docs/features/actions - Actions

Standfirst `[DOCS]`: "One place to decide what needs you, what to do this week, what
the Agent suggests, and what shipped work earned."

### Two axes `[DOCS]`

- Work axis: **Suggested, This week, Queued, In progress, then shipped**.
- Outcome axis: **Measuring, Earned, No movement, Couldn't measure, Reverted, or
  Coincided with a drop**.

### The four tabs `[DOCS]`

| Tab | Product subtitle | Use it for |
|---|---|---|
| Needs you | "Decisions waiting on you. Nothing here applies itself." | Approvals, questions, and changes that need a choice before anything happens |
| This week | "What to do next, and what the last round earned." | The current plan, recent momentum, and the work already under way |
| Suggested | "Everything your Agent has found, ready to start." | The full set of Suggested actions, with the evidence behind each one |
| Results | "Work stays here from its frozen window to its judged result." | Measuring work and every judged outcome |

- **This week** is the default and keeps a clean `/actions` URL.
- `?view=proof` and `?view=measuring` both open Results. New links use
  `?view=results`.

### The nine work types `[DOCS]`

| Work type | What it means | What Trakkr measures |
|---|---|---|
| Technical fix | Repair access, rendering, metadata, or another technical fault on a page | Usually AI bot fetches and machine-read recovery over 14 days |
| Page improvement | Improve an existing page so more of the people who see it choose it | Usually Search Console clicks, with impressions and AI referral clicks as support |
| Content refresh | Update an existing page for a question, citation gap, or stale claim | Usually new citations of that page over 42 days |
| New content | Publish a page that does not exist yet | Usually new citations of the published page over 42 days |
| Outreach draft | Prepare a focused pitch to a source that AI already uses | Citations from that source and whether it starts mentioning your brand |
| Reply draft | Prepare a useful reply for a discussion thread | Whether AI cites the thread and whether the thread mentions your brand |
| Campaign | Coordinate several linked changes over a longer period | A combined view of citations and crawler fetches over 70 days |
| Setup | Connect a source or enable a delivery path | Not measured as an earned outcome |
| Watch | Keep checking a page, source, or signal for a meaningful change | No earned window |

### Start flow `[DOCS]`

Review the work and evidence -> confirm the page, measure, and window -> start the
work -> ship it -> measure through the full frozen window -> judge the result.

### Agent permission ladder on Actions `[DOCS]`

| Permission | What happens |
|---|---|
| Suggest only | The Agent brings you findings. Nothing changes without you. |
| Prepare drafts | The Agent prepares the work. You approve before anything ships. |
| Do it, then tell me | The Agent makes a reversible change, tells you right away, and you can revert. |
| Handle it | The Agent makes allowed changes up to the weekly limit and reports each one. |

Preconditions for a live change: the target belongs to your site, the platform
supports the change, an original value is saved, the weekly limit has room, and the
safety switch is clear. Otherwise the work falls back to **Needs you**.

### Sources of Suggested actions `[DOCS]`

Prompt results and lost positions; citation gaps and lost citations; Optimize
findings; AI crawler access and fetch patterns; competitor movement; Search Console
page gaps; Reddit and other discussion threads; a diagnosis you chose to act on; a
manual action added by your team.

Plan gate table on this page: **NOT DOCUMENTED**. The page lists a related question:
"The Actions tab is gated behind a plan upgrade. Is that intentional, and how do I
unlock it? asked 1x".

---

## 14 and 15. /learn/docs/features/reports-export and /learn/docs/features/reports - Reports & Export

Both URLs serve identical body text `[DOCS]`.

### Report delivery `[DOCS]`

"Brand Reports keep completed reporting history and support client-ready output.
Agency Reports adds portfolio schedules and a history tab across client brands."

A recurring agency schedule can set: **client, cadence, reporting window,
recipients, included sections, white-label link, attached PDF, and approval before
send**.

Report templates support a **Results** section alongside visibility, competitor,
citation, and recommendation sections. Result wording must stay: **Earned, No
movement, Couldn't measure, Reverted, Coincided with a drop**.

### CSV and JSON `[DOCS]`

Before downloading, check brand or portfolio scope; date range; active model, tag,
status, or search filters; whether the page exports all filtered rows or only
selected rows; whether client export permission is on for a portal user.

### Google Sheets and Looker Studio `[DOCS]`

Sheets: give the service account editor access to the target sheet, verify the
connection, choose the sync cadence available to the account. Treat Trakkr-managed
tabs as replaceable output.

Looker Studio uses API access. "'Live' means live access to the newest saved data,
not a new AI check each time."

### REST endpoints `[DOCS]`

| Method | Endpoint | What it does | MCP tool |
|---|---|---|---|
| GET | /get-opportunity-pool | Lists Suggested actions waiting for a decision | list_opportunity_pool |
| POST | /commit-opportunity | Commits, dismisses, or snoozes one suggestion | commit_opportunity |
| GET | /get-results | Lists measured Results for completed work | get_results |
| GET | /get-pages | Lists Pages for the brand | list_pages |

Warning callout `[DOCS]`: "/get-opportunities is not the suggestion list. It has
always returned citation outreach targets."

Cursor pagination steps `[DOCS]`: send `limit` and no `cursor` first; read
`meta.next_cursor`; pass it as `cursor`; stop when `next_cursor` is null. "Do not
parse the cursor."

Results verdict API values `[DOCS]`: `earned`, `no_change`, `harm`,
`couldnt_measure`. Old `/get-proof` and `get_proof` remain deprecated aliases.

Pages journey words `[DOCS]`: Available, Reached, Understood, Relevant, Selected,
Visited.

### Authentication and plan access `[DOCS]`

"REST API access is Scale-equivalent or granted by an explicit API entitlement. MCP
is available on paid plans. Managed contracts can set different limits."

Credentials are created in **Settings: Developer**, per teammate.

### Choose an output `[DOCS]`

| Need | Best starting point |
|---|---|
| Recurring client update | Agency Reports schedule |
| One-off client PDF | Ask Agent to generate, then use report history |
| Quick analysis | CSV or JSON |
| Shared working model | Google Sheets |
| Reusable BI dashboard | Looker Studio |
| Warehouse or internal software | REST API |
| AI assistant access | MCP |

Client export rule `[DOCS]`: "The shared portal **Allow data export** setting and
the client's **Can export data** permission must both be on."

---

## 16. /learn/docs/account/brands - Brands

Standfirst `[DOCS]`: "Add, configure, duplicate, pause, and manage the brands your
team tracks."

- Managed from **Settings: Brands**.
- **Add brand** takes a clear public name and the correct website. After creation,
  finish brand context, markets, aliases, competitors, and prompts.
- The brand editor holds identity, website, market and location context, aliases,
  brand assets, and controls tied to tracking.
- **Duplicate** copies tracking inputs for a new location, market, or product.
- The **brand selector** in the app sidebar switches brands. Agency views and
  Locations can show several brands at once without changing this selection.
- A **paused** brand keeps saved data but stops scheduled refreshes. Only active
  brands count against the active-brand limit. Deletion is permanent.
- **Brand groups** organise brands for portfolio work and are an access boundary in
  the client portal. A group invite follows the current group, including brands
  added later. "For internal team members, use restricted brand access rather than
  assuming a group is a security boundary."

### Plan limits `[DOCS]`

| Plan | Active brands included | Prompts per brand |
|---|---|---|
| Free | 1 | 5 |
| Growth | 1 | 50 |
| Scale | 10 | 50 |

Extra brand and prompt items can raise these values.

### Access `[DOCS]`

Turn on restricted brand access per member and grant **view** or **edit** per brand.
Client portal access is separate and granted under **White-Label Clients**, by
selected brand or by group.

---

## 17. /learn/docs/account/teams - Teams

Standfirst `[DOCS]`: "Invite teammates, set roles, restrict brand access, and
delegate billing." Managed at **Settings: Team**.

### Roles `[DOCS]`

| Role | Best fit | Main access |
|---|---|---|
| Owner | The person responsible for the account | Full team and billing control |
| Admin | Day-to-day operator | Team and brand management, with billing only when granted |
| Viewer | Stakeholder who reads the data | Read-only access |

Ownership cannot be moved through Settings.

### Restrict access by brand `[DOCS]`

Per brand choose **View only**, **Can edit**, or **No access**. A restricted Admin
keeps Admin powers only inside the granted brands and cannot create a new brand.

### Billing access `[DOCS]`

An Admin needs an explicit billing grant. "Billing permission does not transfer
ownership and does not remove brand restrictions."

### Team security `[DOCS]`

The owner can require two-factor authentication for all members from **Settings:
Security**. The same tab shows active sessions and can sign out all other sessions.

### Seat limits `[DOCS]`

| Plan | Total seats, including owner |
|---|---|
| Free | No team access |
| Growth | 3 |
| Scale | Unlimited |

"Pending invitations may reserve capacity."

### Teammates and clients `[DOCS]`

"Invite staff and operators from Team. Invite customers from White-Label Clients."

---

## 18. /learn/docs/account/billing - Plans and billing

Standfirst `[DOCS]`: "Understand team plan inheritance, current limits, add-ons,
trials, invoices, and payment access."

Free accounts see the tab as **Upgrade**. Paid and paused accounts see **Billing**.

### Current self-serve plan shape `[DOCS]`

| Limit or feature | Free | Growth | Scale |
|---|---|---|---|
| Active brands included | 1 | 1 | 10 |
| Prompts per brand | 5 | 50 | 50 |
| Team seats including owner | 0 | 3 | Unlimited |
| MCP | No | Yes | Yes |
| REST API | No | No | Yes |
| Agency workspace | No | No | Yes |
| White-label client portal | No | No | Paid Scale access or contract |

Enterprise uses a managed contract that can differ from the self-serve table.

### Prices `[DOCS]`

- Growth **$100/month**, Scale **$500/month** for a new self-serve subscription.
- "Annual billing uses the price of ten months for a full year."
- Existing subscriptions can be grandfathered.
- Add-ons: extra brands, prompt packs, white-label brands, extra markets, and paid
  Page capacity where applicable.
- Current new-customer extra-brand price **$50/month**; older subscriptions may keep
  **$39/month**.
- "White-label brand access is currently **$49 per enabled brand per month** in
  self-serve billing."

### Trials `[DOCS]`

"An active Scale trial can open internal Agency tools, but it does not grant
client-facing white-label access."

### Payment access `[DOCS]`

| Action | Who can do it |
|---|---|
| View inherited plan | Team member |
| Manage payment or subscription | Owner or Admin with billing access |
| Grant billing access | Owner |
| Change a managed contract | Contract contact and Trakkr |

### Before changing a plan `[DOCS]`

1. Active brands against the new limit.
2. Prompt counts on every active brand.
3. Team seats and pending invites.
4. White-label brands and live client portals.
5. Agency workspaces, API integrations, and Automations that need the current
   entitlement.

---

## 19. /learn/docs/account/settings - Settings

Standfirst `[DOCS]`: "Find every account, brand, plan, team, agency, security, and
developer control in Trakkr Settings."

### Tab overview `[DOCS]`

| Tab | Who sees it | What it controls |
|---|---|---|
| Profile | Everyone | Name, email, weekly email, region, feedback, referral enrolment, and account deletion |
| Brands | Everyone | Brands, active state, setup, duplication, and brand details |
| Billing or Upgrade | Everyone | Current plan, usage, subscription, invoices, payment, and plan choices |
| Team | Everyone | Team creation, members, invites, roles, brand access, and billing access |
| Agency | Teams marked as agencies with Agency access | Shortcuts to the Agency workspace, white-label setup, and team controls |
| White-Label | Eligible owners and admins | Branding, clients, portal features, onboarding, footer, email, domain, and logs |
| Custom | Paid accounts | Custom setup or managed-contract details |
| Referral | Referral members | Referral link and performance |
| Security | Everyone | Password, active sessions, and the team 2FA requirement |
| Developer | Everyone | MCP setup and REST API access |

### White-Label sections `[DOCS]`

- **Branding**: portal name, logo, favicon, accent colour, login headline, login
  tagline.
- **Clients**: brand and group access, invites, activity, export access, password
  resets, and revocation.
- **Features**: what clients can see, client-facing feature names, and portal
  PDF/CSV export.
- **Onboarding**: welcome and method text.
- **Footer**: links and copyright text.
- **Email**: sender domain, name, reply address, DNS, preview, and test email.
- **Logs**: portal activity, filters, CSV export, and retention.

Custom domain setup starts from the banner at the top of this tab.

### Other documented details `[DOCS]`

- Profile: first-name change, email change with verification, feedback, weekly email
  setting, regional time zone and **MM/DD/YYYY or DD/MM/YYYY** date format
  ("Report schedules use this time zone"), referral enrolment card, danger zone
  requiring you to type your account email.
- Custom tab replaces the older Enterprise tab name; `?tab=enterprise` still opens
  it.
- Security: password of **at least eight characters**; active sessions show device,
  browser, operating system, rough location, and recent activity.
- Developer: MCP on paid plans, personal connect token per person; REST API key on
  Scale-equivalent access or explicit API access.

---

## 20. /learn/docs/features/agent - Agent

Standfirst `[DOCS]`: "An AI consultant that knows your brand's visibility data..."

Relevant to the locked areas:

- The Agent generates on-demand agency reports. "The only Agent action that consumes
  a paid resource is generating an article (one article credit) or generating an
  **agency report (PDF credit on agency plans)**." `[DOCS]`
- Suggestion chips can "Build a report or export". `[DOCS]`
- Chat never changes the workspace without a confirmed suggestion chip. `[DOCS]`
- Data the Agent holds by default: visibility scores across **all eight AI models**,
  tracked prompts and rankings, citation sources and gaps, perception scores,
  crawler activity, visitor traffic from AI sources, the action queue, connected
  CMS, audit findings, brand profile. `[DOCS]`
- The **Understanding panel** opens from the brain icon, top right. Items are single
  sentences and are binding. It shows an **understanding score**. `[DOCS]`
- Model stack: "the main tool loop uses an OpenAI reasoning model", with a
  lower-cost OpenAI fallback after a rolling spend threshold, and "a separate
  DeepSeek-compatible model handles auxiliary routing and simple triage". `[DOCS]`
- The Agent workspace shows one quiet line below the composer, such as
  "3 automations running", with a **Manage** link to the Automations register, and
  **Set one up** when none exist. `[DOCS]`

Agency-specific Agent screens: **NOT DOCUMENTED**.

---

## 21. /learn/docs/features/automations - Automations

Standfirst `[DOCS]`: "Set up work that happens without you, from simple alerts to
carefully limited Agent changes."

### Permission ladder, five rungs `[DOCS]`

| Rung | What it means |
|---|---|
| Tells you | It tells you what it saw. Nothing else happens. |
| Suggest only | It brings you findings. Nothing changes without you. |
| Prepare drafts | It prepares the work. You approve before anything ships. |
| Do it, then tell me | It makes the change, tells you right away, and you can revert. |
| Handle it | It makes changes up to your weekly limit and reports each one. |

New Agent automations start at **Suggest only**. Exact rules that only send a
message appear as **Tells you**.

### Six work areas `[DOCS]`

Technical fixes; Page improvements; Content refreshes; New content; Getting listed;
Community replies.

### The sentence editor `[DOCS]`

| Part | Question it answers | Examples |
|---|---|---|
| When | When should Trakkr check? | Every day, every Monday, when visibility moves, when a citation is lost |
| Look at | What is in scope? | Owned pages, tracked prompts, competitors, crawler activity |
| How far | What may happen after the check? | Just tell me, suggest what to do |
| Delivery | Where should the result go? | In-app, email, Slack, Teams, webhook |

**Edit rule details** opens the full exact-rule editor.

### Check outcomes `[DOCS]`

**Nothing new**, **Suggested**, **Draft prepared**, **Changed**, **Failed**.
Example quiet result: "Checked 61 pages. Nothing changed."

### Register columns `[DOCS]`

| Column | What it means |
|---|---|
| Automation | The name you gave it. The second line shows when it checks and what it watches. |
| Allowed to | The highest useful permission summary after all safety caps have been applied. |
| State | Running or Paused, plus a switch that changes that automation only. |
| Last check | When it last checked or, for an exact rule, last fired. A blank mark means no check yet. |
| Outcome | What came of it. Links to the relevant Action or editor. |

Optional columns from the column control: **Activity** (30-day strip), **Delivery**,
**Type** (Exact rule or Judgment call). Register URL: **/automations**.

### Automation record `[DOCS]`

Agent automation at **/automations/agent/:id**, four sections: **Overview**,
**Permissions**, **Checks**, **Delivery**. Check history keeps the **ten most
recent** checks on the first view. Exact rules open at **/automations/rules/:id**.

### Delivery targets `[DOCS]`

In-app (always on for Agent automations), Email, Slack, Microsoft Teams, a webhook,
a work tracker, Google Sheets, Notion. Exact-rule email digests support **instant,
15-minute, hourly, and daily**.

### Backtest `[DOCS]`

Every creation flow shows what the sentence would have matched in the last **30
days**, up to **five examples** for event-based exact rules.

### Plan limits `[DOCS]`

"Exact rules count against the automation limit: paid trials allow **1 per brand**,
Growth allows **3**, and Scale allows **unlimited** rules. Paused exact rules still
occupy a slot; deleted rules do not. Agent automations use a separate allowance. By
default, each has up to **60 checks in a calendar month**, and all Agent automations
for a brand share a monthly spend safeguard."

---

# Part 2 - Agency suite, reconstructed

The docs name **four** sidebar workspaces under the Agency group, plus Team
Management in Settings. The task names 8 `/agency` routes. Only the following route
strings are documented. Any other `/agency` route is **NOT DOCUMENTED**.

| Route | Documented state |
|---|---|
| `/agency` (Agency home, "Clients") | `[DOCS]` Portfolio command center with three views. |
| `/agency/compare` | `[DOCS]` Redirects to Agency home, where Compare is a view. |
| `/agency/actions` | `[DOCS]` Portfolio Actions, three tabs. |
| `/agency/pdf-export` | `[DOCS]` Redirects to Agency Reports. |
| `/agency/reporting` | `[DOCS]` Redirects to Agency Reports. |
| Agency Reports (canonical path) | **NOT DOCUMENTED**. Docs give only the redirect sources and `?tab=history`. |
| Pitches (canonical path) | **NOT DOCUMENTED**. Docs give the legacy `/agency/demos` and `/agency/demos/:id` redirects and the public `/pitch/:slug`. |
| `/agency/team` | **NOT DOCUMENTED** as a route. Team Management lives in **Settings: Team**, reachable from the bottom of the Agency menu. |
| Portfolio Results | `[DOCS]` Not its own route. It is the **Results** tab inside Agency -> Actions. |

## 1. Agency home / Clients

`[DOCS]` Build one portfolio table with three view switches sharing one data set and
one search field.

- Views: **Overview** (default), **Compare**, **Needs attention**.
- Portfolio pulse strip above the table: **average visibility, client count, Needs
  attention, At risk**. The Needs attention stat opens that view.
- Header carries a **freshness label** and the **search field** (matches client name
  and website).
- Status pulse values: **At Risk, Watch, New, Improving, Healthy, Paused**. Default
  sort puts urgent rows first. Status derives from recent visibility trend and
  report coverage. No completed reports means the row stays **New**.
- Overview columns: client, status, visibility, trend, next Action. Row select makes
  that client the active brand and opens its Dashboard.
- Compare columns: visibility, presence, rank, prompts, citations, model strength,
  competitor gap, pending Actions. Column headings sort.
- Compare row checkboxes select **two to four** brands. A side-by-side panel expands
  above the table with each brand as a column.
- Client drawer, opened from a row in Compare, links to **Dashboard, Prompts,
  Citations**.
- Row menu: open Dashboard, start a pitch, send a report, open that client's
  Actions, copy a client link.
- Fixed comparison window: the **last seven completed reports**. No time-range
  control.
- Brand-group section headers with a group name and colour appear on the comparison
  table.
- Plan gate: Teaser only on No plan and Growth; Full access on Scale; Full access
  with higher brand limits on Enterprise.

Row-level microcopy, empty states, and pagination: **NOT DOCUMENTED**.

## 2. Compare

`[DOCS]` Not a separate page. Implement `/agency/compare` as a redirect to Agency
home with the Compare view selected.

## 3. Portfolio Actions

`[DOCS]`

- Three tabs: **Work**, **Results**, **Automations**.
- Toolbar: group-by dropdown, chip-style brand multi-select that persists to the
  URL.
- Group-by options: **Time horizon** (default; sections **Now**, **Up next**,
  **Later**), **Brand**, **Work type**, **Action type** (section headers show the
  brand count).
- Rows carry brand favicon and name.
- Detail pane: briefing, evidence, playbook, drafts.
- Transitions: start, complete, dismiss, snooze, pin, reopen. Bulk transitions work
  across brands and attach the correct per-brand visibility snapshot on Complete.
- The list auto-advances after Complete or Dismiss.
- Executable Action types keep their inline controls. No cross-brand approval flow.
- Stale actions retire automatically when the underlying signal resolves.
- Plan gate: No access on No plan and Growth; Full access on Scale and Enterprise.

## 4. Portfolio Results (Results tab)

`[DOCS]`

- Four headline counts act as filters: **Earned, No movement, Coincided with a drop,
  Couldn't measure**.
- Work-type filters use the nine product words.
- Table grouped by outcome. Row content: what changed, the client name, the page
  link when one exists, and the measurement date. Row select returns to the source
  Action.
- Unmeasured rows are grouped with one shared explanation. No green mark per row.
- A copy control produces a plain-text client update from the rows on screen.
- The page reads stored results. Opening it starts no new measurement.

## 5. Automations tab (Agency)

`[DOCS]`

- Grouped by client.
- Headline counts: **Active, Paused, No checks yet, findings in the last 30 days**.
- Row fields: Automation name and goal; **Allowed to** permission summary by work
  type; checks in the last 30 days with found and failed counts; Active or Paused;
  latest check time or **No checks yet**.
- Permission words shown: Tells you, Suggest only, Prepare drafts, Do it then tell
  me, Handle it, after team and client caps.

## 6. Agency Reports

`[DOCS]` Two tabs: **Schedules** and **History**. `?tab=history` deep-links the
archive.

**Schedules**: New schedule form with client brand, cadence (weekly / every two
weeks / monthly / quarterly), day and hour in the client's time zone, reporting
window (7 / 14 / 30 days), recipients plus optional note, sections (Visibility,
Competitors, Citations, Recommendations), delivery (live white-label link, attached
PDF, or both), and **Require my approval before each send**. Branding is inherited
from white-label settings and shown in the editor with a link back to Settings.
**Preview** shows report content and client email. Saved rows show client, cadence,
next send, recipient count, state. Row actions: send test, delivery history, edit,
remove, pause or resume. Held reports collect in an **approval inbox**.

**History**: columns client, creation date, page count and file size, state
(Queued, Generating, Ready, Failed, Expired). Search by client or report, filter by
state, download Ready rows, retry Failed and Expired rows. It records whether a
report was emailed and when. Live refresh with a stale-data notice on lost
connection.

On-demand reports come from **Ask Agent to generate**, not from History.

## 7. Pitches

`[DOCS]`

- List of pitch cards. Each card shows a **view count**. Row menu holds **Duplicate**
  and **Export PDF**.
- Create modal: Brand name (required), Website, Industry (pre-suggests three
  competitors), Competitors, Markets (default US).
- Generation: two passes against GPT-5-mini, 30-60 seconds, cycling status messages,
  then the editor.
- Editor: inline edit of visibility score, model score, rank, competitor score,
  industry average, headings, labels, summaries, insights. Show, hide and reorder
  sections. Change competitors. Select AI models. Add insights from available icons.
  Undo/redo with Cmd+Z and Cmd+Shift+Z.
- Branding inherited per team: logo, name, primary color, footer text, hide
  "Powered by Trakkr".
- Share: private by default, public link at `/pitch/:slug`, optional password,
  mobile support, revocable by flipping back to private.
- Convert to a tracked brand using the same inputs. The pitch stays as a snapshot.
- Legacy `/agency/demos` and `/agency/demos/:id` open this workspace.
- Plan gate: No access on No plan and Growth; unlimited pitches on Scale and
  Enterprise.

## 8. Team Management

`[DOCS]` Lives at **Settings: Team**, linked from the bottom of the Agency menu.

- **Invite team member**: multiple emails, role selection, optional brand scoping at
  invite time. Duplicate-account and other-team checks warn before send. Inviting an
  existing client portal user promotes them to teammate on accept.
- Pending invites list with resend and revoke.
- Roles: Owner (one, permanent in UI), Admin (default for operators), Viewer.
- **Restrict brand access** per member, with View only / Can edit / no access per
  brand. Restricted members cannot create brands. Enforcement is at the data layer.
- Billing access flag, off by default, granted by the Owner to an Admin.
- Member removal, role change, invite revocation, and leave-team for non-owners.
- Plan gate: Single user only on No plan; up to 3 seats on Growth; full team
  management, brand-access scoping and agency mode on Scale; same as Scale with
  higher seat counts on Enterprise.

## Agency enablement logic to replicate `[DOCS]`

1. Show the Agency group only when the audience check passes: the user self-declared
   as an agency at signup, **or** the team has **Agency Mode** on.
2. Also require the **agency entitlement** (Scale, Enterprise, or an eligible active
   Scale trial).
3. Wait for both checks. Do not guess when access cannot be confirmed.
4. Turning Agency Mode off hides the workspace only. It deletes nothing.

---

# Part 3 - White-label portal, reconstructed

The live `/client` route never finishes loading. The docs are the only source. The
docs never print a `/client/*` URL. Every route path below is therefore
**NOT DOCUMENTED**; only the portal's screens, features, and rules are documented.

## Portal shell `[DOCS]`

- Served from the agency's custom subdomain over HTTPS, for example
  `ai.youragency.com`.
- Identity: portal name (browser tabs, emails, welcome text), logo (header, login
  page, emails, PDF reports), favicon, accent colour (buttons, links, selected
  items, focus states).
- Trakkr branding is hidden automatically for portal users: logo, upgrade banners,
  pricing CTAs, and "Powered by Trakkr".
- Footer carries agency links and copyright text.
- The whole portal is read-only. Clients cannot change prompts, competitors, brand
  settings, Actions, or the agency setup.
- Export is the only data action that can be granted.

## Login screen `[DOCS]`

- Separate client login, distinct from the Trakkr app login.
- Shows the portal logo, the **login headline**, and the **login tagline**.
- Agencies must test it in a private window, because a teammate session can mask it.

Password reset for clients is administered from **White-Label -> Clients**
("password resets"). `[DOCS]`

## Portal navigation `[DOCS]`

| Menu item | Required or optional |
|---|---|
| Dashboard | Required base |
| Competitors | Required base |
| Citations | Required base |
| Prompts | Required base |
| Reports | Optional |
| Perception | Optional |
| Pages | Optional |
| Results | Optional |

- Menu labels are renameable under **Features**. Renaming changes the menu label
  only, not page headings, reports, data, or internal Agency navigation.
- Feature visibility is shared across all portal clients. It cannot be set per
  client.

## Portal screen content `[DOCS]`

- **Pages**: a read-only, page-by-page account of AI search performance. Journey
  stages: Available, Reached, Understood, Relevant, Selected, Visited.
- **Results**: measured before-and-after outcomes from the work, "including honest
  answers of No movement and Couldn't measure". Result words to display: Earned, No
  movement, Couldn't measure, Reverted, Coincided with a drop. Never state that an
  Action caused a change.
- **Reports**: client access follows the client portal feature and export
  permissions.
- Dashboard, Competitors, Citations, Prompts screen contents: **NOT DOCUMENTED** on
  the white-label pages.

## Onboarding text `[DOCS]`

Welcome text plus method text. Answer four questions: what this portal is for; what
the agency tracks; how often new data arrives; who to contact with a question. Keep
the welcome short and put the longer explanation in the method section.

## Client access model `[DOCS]`

- Invite grants **selected brands** or **one brand group**.
- Selected-brand access is fixed to the brands on the invite.
- Group access follows the group. Brands added to the group later appear without a
  new invite.
- Portal users consume no team seat and use a separate client permission model.
- A client cannot see other clients unless granted a brand or group containing them.
- Per-client permission: **Can export data**. It must be on together with the shared
  portal setting **Allow data export**.
- Client invites are sent from the brand or group page, per brand or per group.
- **Clients** section also holds activity, password resets, and revocation.
- **Logs** section holds portal activity, filters, CSV export, and retention.

## Billing `[DOCS]`

- Counted **by enabled brand, not by client login**.
- Current self-serve price: **$49 per enabled brand per month**.
- Requires the white-label entitlement on a paid Scale-equivalent account or
  contract. A Scale trial does **not** publish a client portal.
- The invite screen shows the billing effect before you confirm.

## Domain setup steps `[DOCS]`

1. Be a team owner or admin with white-label access. Open the domain banner at the
   top of **Settings: White-Label**.
2. Choose a subdomain you control, such as `ai.youragency.com`,
   `portal.youragency.com`, or `insights.youragency.com`. Do not use the root
   domain.
3. Submit the domain. Trakkr shows the exact DNS record: Type **CNAME**, Name = the
   subdomain shown in setup, Target = the target shown in setup, TTL = the
   provider's default.
4. At the DNS provider, remove any A, AAAA, or CNAME record already on that host,
   then add the CNAME. Copy the target from Trakkr, never from a guide.
5. On Cloudflare, set the record to **DNS only** (grey cloud).
6. Return to the wizard and continue through its three stages: **Domain, DNS,
   Verify**.
7. Watch the state: DNS pending -> Still verifying DNS -> SSL provisioning ->
   Custom domain active. A failure shows **Domain setup failed** with the error and
   a manage action.
8. HTTPS usually completes a few minutes after DNS verifies. You may close the
   wizard; Trakkr can email you when the portal is ready.
9. Verify: open the domain link, confirm `https://` with no certificate warning, use
   a private window, check portal name, favicon, logo and login copy, then sign in
   with a test client and follow Dashboard, Pages, Results, and Reports.
10. Troubleshoot with `dig ai.youragency.com CNAME +short`.
11. Change or delete the domain from **Manage Domain**. A change restarts DNS and
    HTTPS setup. Deletion stops client access through that address but keeps portal
    settings, client accounts, and brand data.

## Branding setup steps `[DOCS]`

1. **Branding**: set portal name, logo, favicon, accent colour, login headline, and
   login tagline. Changes save while you work; the header shows save progress. A
   desktop preview sits below the form with preview modes for the main client
   surfaces. Enter the accent colour as hex or use the picker; Trakkr derives
   lighter and hover states and warns on poor contrast against white.
2. **Onboarding**: write welcome text and method text.
3. **Footer**: add, reorder, and remove links, and set copyright text. Test every
   link from Preview.
4. **Features**: choose the visible features and set client-facing feature names.
   Set portal PDF/CSV export.
5. **Email**: set sender name, optional reply-to address, and email domain. The from
   address is fixed to `noreply@` on the verified domain. Add the exact DNS records
   Trakkr returns, wait for all checks to pass, then use **Preview emails** and
   **Send test email**. Check sender, reply address, logo, button colour, footer,
   and spam placement.
6. **Launch check**: open Preview; check login screen, menu, Dashboard, Pages,
   Results, and a report; narrow to phone width and check the logo and menu; send a
   test email to an outside address; check footer links in a private window; confirm
   the custom domain shows active.

Branding never changes client data, feature visibility, export rights, or brand
access.

## Documented gaps for `/client/*`

- Exact `/client/*` URL structure: **NOT DOCUMENTED**.
- Client dashboard layout, widgets, and charts: **NOT DOCUMENTED**.
- Client session length, MFA for portal users, and SSO: **NOT DOCUMENTED**.
- Portal log retention period values: **NOT DOCUMENTED** (only that retention
  controls exist).
- Per-client feature toggles: documented as **not supported**. Feature visibility is
  shared.
