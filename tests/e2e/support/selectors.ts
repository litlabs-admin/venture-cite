// tests/e2e/support/selectors.ts
// Single source of truth for e2e selectors. Prefer data-testid, which the
// app emits in dev builds only (vite.config.ts strips them in production).
// If a selector here stops matching, fix it HERE, not in individual specs.

export const SEL = Object.freeze({
  // Auth pages — verified present in client/src/pages/login.tsx and register.tsx
  emailInput: '[data-testid="input-email"]',
  passwordInput: '[data-testid="input-password"]',
  loginButton: '[data-testid="button-login"]',
  firstNameInput: '[data-testid="input-first-name"]',
  lastNameInput: '[data-testid="input-last-name"]',
  confirmPasswordInput: '[data-testid="input-confirm-password"]',
  registerButton: '[data-testid="button-register"]',
  forgotPasswordLink: '[data-testid="link-forgot-password"]',
  registerLink: '[data-testid="link-register"]',
  loginLink: '[data-testid="link-login"]',
  backHomeLink: '[data-testid="link-back-home"]',

  // App shell — role-based, resilient to markup changes
  sidebar: 'nav, [data-testid="sidebar"]',
  appMain: "main",

  // Marker unique to the AUTHENTICATED app shell. client/src/App.tsx's
  // HomePage() renders the logged-out marketing landing page
  // (client/src/pages/landing/index.tsx) at "/" for anonymous visitors, and
  // that page also renders a bare <main> (and a bare <nav> in its Nav
  // section) — so a generic "main" (or "nav") selector cannot distinguish
  // auth state at "/". AppShell (client/src/components/AppShell.tsx:180)
  // renders `<main id="main-content">` and is only ever mounted for
  // authenticated routes (AuthenticatedRoute / AuthenticatedBareRoute's
  // sibling AppShell wrapper / FirstRunGate in App.tsx); grep confirms
  // "main-content" appears nowhere else under client/src. Use this to assert
  // the authenticated shell actually rendered, not just that *a* <main> did.
  authenticatedMain: "main#main-content",

  // Identifies the /welcome page (client/src/pages/welcome.tsx). That page
  // renders via AuthenticatedBareRoute without AppShell, so it has no
  // <main> element — use this instead of SEL.appMain there.
  welcomeWebsiteInput: '[data-testid="input-website"]',

  // The workflow-spine tab strip itself (client/src/components/
  // SpineShell.tsx's <TabsList>, from @radix-ui/react-tabs). SpineShell
  // renders this TabsList as the first child of its <Tabs> root, before any
  // TabsContent — so `page.locator(SEL.authenticatedMain).locator(SEL.
  // spineTabList).first()` always resolves to SpineShell's own tab bar, even
  // though some embedded pages (e.g. geo-signals.tsx under /diagnose?
  // tab=signals, geo-tools.tsx under /act?tab=geo-assets) render a SECOND,
  // nested <Tabs> of their own further down the tree. Scoping to `.first()`
  // is required: an unscoped `[role="tablist"]`/`[role="tab"]` query matches
  // both tab strips and (per Playwright strict-mode) throws on more than one
  // match — confirmed empirically when this selector was being built.
  spineTabList: '[role="tablist"]',

  // The currently-active tab trigger — scope this under SEL.spineTabList
  // (see its comment for why unscoped is unsafe), e.g.:
  //   page.locator(SEL.authenticatedMain).locator(SEL.spineTabList).first()
  //     .locator(SEL.spineActiveTabTrigger)
  // Radix's TabsTrigger (node_modules/@radix-ui/react-tabs/dist/index.mjs)
  // sets `id={baseId}-trigger-{value}`, `role="tab"`, and
  // `data-state="active"|"inactive"` on each trigger button, where baseId is
  // a random per-mount id but the "-trigger-<value>" suffix is stable.
  // Within one tablist exactly one trigger carries data-state="active";
  // assert its `id` ends with "-trigger-<expected tab value>" to prove a
  // specific tab — not just some tab — is actually selected.
  spineActiveTabTrigger: '[role="tab"][data-state="active"]',

  // The global brand picker (client/src/components/BrandSelector.tsx) that
  // AppShell mounts in its context bar for every route spineTitleFor()/
  // STANDALONE_TITLES claims (client/src/lib/spineStages.ts). Renders
  // `null` when the account has zero brands (BrandSelector.tsx:42), so
  // tests must treat "not visible" as "no brands", not as a failure.
  brandSelectTrigger: '[data-testid="select-brand"]',

  // Any Radix Dialog's content root (used by ViewEditDialog and others).
  // Radix sets role="dialog" on DialogContent regardless of which dialog it
  // is, so scope further with :has-text(...) when more than one could be
  // relevant.
  dialog: '[role="dialog"]',

  // ThemeToggle (client/src/components/ThemeToggle.tsx), the three-way
  // System/Light/Dark segmented control rendered on the Settings page's
  // Appearance card. The wrapping radiogroup carries `data-testid=
  // "theme-toggle"` (ThemeToggle.tsx:65); each option button carries
  // `data-testid="theme-toggle-<system|light|dark>"` (ThemeToggle.tsx:83).
  themeToggle: '[data-testid="theme-toggle"]',
  themeToggleSystem: '[data-testid="theme-toggle-system"]',
  themeToggleLight: '[data-testid="theme-toggle-light"]',
  themeToggleDark: '[data-testid="theme-toggle-dark"]',
}) satisfies Record<string, string>;
