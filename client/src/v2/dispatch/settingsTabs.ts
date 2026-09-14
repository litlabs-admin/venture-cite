// Every settings-family page links here so the tab strip stays identical
// across General, Integrations, Team, Billing, and Notifications - one
// definition, five real routes, no dead "Soon" tab. Team and Billing are
// built by a different agent against the same list; this file only owns
// the data + the reusable strip, not what those two boards render.
//
// `route` is left un-widened (`as const`, no broader type annotation) so its
// values stay a literal union of exactly these five paths - that is what
// lets `<Link to={tab.route}>` in SettingsTabStrip type-check against the
// generated route tree instead of a plain `string`.
export const SETTINGS_TABS = [
  { label: "General", route: "/v2/settings", board: "b24" },
  { label: "Integrations", route: "/v2/settings/integrations", board: "b25" },
  { label: "Team", route: "/v2/settings/team", board: "b42" },
  { label: "Billing", route: "/v2/settings/billing", board: "b44" },
  { label: "Notifications", route: "/v2/notifications", board: "b43" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];
