# Tour Engine — Manual Test Plan

Run before every production deploy that touches `client/src/tours/` or
`server/routes/tours.ts`.

## Global welcome tour
- [ ] New user signup → tour fires on /dashboard
- [ ] Click through all 6 steps → tour ends, no console errors
- [ ] Refresh — tour does not re-fire
- [ ] Toggle "Don't auto-show tours" in /settings → new account does not fire global tour

## Each of 6 page tours (Dashboard, Brands, AI Visibility, Citations, GEO Tools, AI Intelligence)
- [ ] "?" icon visible in page header
- [ ] Click → tour fires
- [ ] All steps render (no missing-target events in browser network tab)
- [ ] Empty-state copy reads correctly when no data
- [ ] Populated-state copy reads correctly when data present (counts substituted)

## Each of 10 nudges
- [ ] Trigger condition fires nudge once per (user, brand)
- [ ] Switching brand and re-triggering fires again for new brand
- [ ] After completion, nudge does not re-fire on same brand

## Mobile (iPhone Safari, Pixel Chrome)
- [ ] Coach marks render legibly on screens <768px
- [ ] Tap targets ≥44px
- [ ] No layout breakage

## Suppression
- [ ] "Skip and don't show again" works on every tour
- [ ] After suppress, "?" replay still works

## Admin metrics
- [ ] /admin/tour-analytics renders with admin email
- [ ] Numbers match seeded test data
- [ ] Non-admin email gets 404
