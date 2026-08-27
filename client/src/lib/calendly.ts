/** The one booking link. Kept in a single place so the pricing dialog's
 *  embedded scheduler and the sidebar's "Need help with PR?" card can never
 *  drift apart - a stale URL in one of two copies is invisible until someone
 *  reports a dead booking page. */
export const CALENDLY_BOOKING_URL = "https://calendly.com/venturepr/new-meeting";
