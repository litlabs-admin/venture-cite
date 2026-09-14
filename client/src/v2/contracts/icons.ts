/**
 * Icon contract. Foundation-owned.
 *
 * These are the shared icons of the approved canvas sprite, by the same ids.
 * `client/src/v2/theme/V2Icon.tsx` renders them. A screen that needs an icon
 * outside this set draws it locally inside its own screen directory; it does not
 * add to this list.
 */
export const V2_ICON_NAMES = [
  "arrow", "bell", "cal", "cdown", "chart", "check", "chev", "clock", "cog", "diag",
  "dl", "doc", "eye", "facts", "geo", "globe", "learn", "link", "mail", "map",
  "moon", "q", "scale", "shield", "slack", "srch", "star", "today", "vis", "warn", "work",
] as const;

export type V2IconName = (typeof V2_ICON_NAMES)[number];
