export const SELECTED_BRAND_STORAGE_KEY = "vc_selected_brand_id";
export const VISIBILITY_ENGINE_STORAGE_KEY = "vc_visibility_engine";
export const CITATIONS_TAB_STORAGE_KEY = "vc_citations_tab";
export const KEYWORDS_FILTER_STORAGE_KEY = "vc_keywords_filter";
export const PENDING_VERIFY_EMAIL_STORAGE_KEY = "venturecite:pending-verify-email";
export const INTERNAL_PAGE_VIEW_STORAGE_KEY = "internal-page-view";

// Add every user-scoped key here so logout cleanup and its test use this list.
export const USER_SCOPED_STORAGE_KEYS = [
  SELECTED_BRAND_STORAGE_KEY,
  VISIBILITY_ENGINE_STORAGE_KEY,
  CITATIONS_TAB_STORAGE_KEY,
  KEYWORDS_FILTER_STORAGE_KEY,
  PENDING_VERIFY_EMAIL_STORAGE_KEY,
  INTERNAL_PAGE_VIEW_STORAGE_KEY,
] as const;
