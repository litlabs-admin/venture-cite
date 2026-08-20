# Group A — User Experience Audit

## Executive Summary

VentureCite's UI/UX is solid with notable gaps:

1. Hardcoded hex colors in charts bypass design tokens
2. Missing error state UI on data pages
3. No pagination on large lists  
4. Tab state resets sub-views
5. Icon-only buttons lack aria-labels
6. Destructive delete lacks impact summary
7. Form validation timing inconsistent
8. Empty states uneven

## Dimension 1 — UI (Visual Interface)

### [HIGH] Hardcoded hex colors in SVG charts
**File**: client/src/pages/ai-intelligence.tsx:1561-1690
**Evidence**: stopColor="#3b82f6", stroke="#10b981", stroke="#ef4444" hardcoded
**Impact**: Colors don't respond to dark-mode toggle
**Fix**: Extract to Tailwind CSS vars, use useTheme() hook

### [HIGH] Missing error state UI when data fetches fail
**File**: client/src/pages/dashboard.tsx:28-46
**Evidence**: hasError defined but never rendered
**Impact**: Infinite loading spinner on API failure
**Fix**: Render error card with retry button when hasError

### [MEDIUM] No loading skeletons on data-heavy pages
**File**: client/src/pages/citations.tsx:163-166
**Evidence**: Content suddenly appears after 2-3s, causes CLS
**Impact**: Jarring visual flash, perceived slowness
**Fix**: Add skeleton grid matching final layout

### [MEDIUM] Sidebar NavItem weak focus indicator
**File**: client/src/components/Sidebar.tsx:88-107
**Evidence**: focus-visible:ring-2 subtle in dark mode
**Impact**: Keyboard nav nearly invisible
**Fix**: Add focus-visible:bg-sidebar-accent, increase ring-4

### [MEDIUM] Icon-only buttons lack aria-label
**File**: client/src/pages/brands.tsx:376-389
**Evidence**: Edit button icon only, DeleteBrandDialog trigger no aria-label
**Impact**: Screen reader announces "button" with no label
**Fix**: Add aria-label="Edit brand", aria-label="Delete brand"

### [MEDIUM] Placeholder-only fields lack associated labels
**File**: client/src/pages/articles.tsx:312-316
**Evidence**: Textarea with placeholder but no Label element
**Impact**: AT can't reliably associate textarea
**Fix**: Wrap in consistent Label pattern

### [MEDIUM] Layout shift on async content
**File**: client/src/pages/brands.tsx:343-358
**Evidence**: Grid gaps disappear when skeleton replaced, causes CLS
**Impact**: CLS metric affected
**Fix**: Use CSS Grid auto-fill with consistent minmax()

---

## Dimension 2 — UX (Flows)

### [HIGH] Destructive delete action lacks impact summary
**File**: client/src/components/DeleteBrandDialog.tsx:50-54
**Evidence**: Dialog says will delete but doesn't show counts
**Impact**: User deletes important data without understanding
**Fix**: Show breakdown: "Deleting will remove: 47 articles, 12 runs, 5 prompts"

### [HIGH] No next-step CTA after successful mutations
**File**: client/src/pages/brands.tsx:140-143
**Evidence**: Toast "Brand created" but no guidance to next step
**Impact**: Flow breaks, user doesn't know to visit /ai-visibility
**Fix**: Toast: "Next: Set up AI visibility checklists" with action

### [HIGH] Tab state resets sub-view state
**File**: client/src/pages/citations.tsx:376-1122
**Evidence**: activeTab persisted but expandedRunId not
**Impact**: User expands run, navigates away, returns: row collapses
**Fix**: Extend persisted state to include expandedRunId

### [MEDIUM] Form validation only on submit
**File**: client/src/pages/brands.tsx:58-76
**Evidence**: useForm with zodResolver but no mode:onBlur
**Impact**: No inline validation feedback
**Fix**: Pass mode:'onBlur' to useForm()

### [MEDIUM] Large lists lack pagination
**File**: client/src/pages/citations.tsx:1049
**Evidence**: runHistory.slice(0, 20) hardcoded
**Impact**: User with 100 runs can't access older data
**Fix**: Add Pagination component or infinite scroll

### [MEDIUM] Articles list has no search or sort
**File**: client/src/pages/articles.tsx:338-475
**Evidence**: All articles unsorted, no search field
**Impact**: Finding articles takes time
**Fix**: Add search Input and sort Select above list

---

## Dimension 3 — Accessibility

### [HIGH] Color contrast fails in dark mode for badges
**File**: client/src/pages/ai-intelligence.tsx:60-65
**Evidence**: bg-emerald-500/10 text-emerald-700, contrast ~2.8:1 (below 4.5:1 AA)
**Impact**: WCAG AA violated, low-vision users can't read
**Fix**: Increase opacity, use darker text: text-emerald-800 dark:text-emerald-200

### [HIGH] Missing focus trap in modals
**File**: client/src/components/ui/dialog.tsx
**Evidence**: DeleteBrandDialog input doesn't auto-focus
**Impact**: Keyboard users tab to background
**Fix**: Add autoFocus to inputs, ensure Radix Dialog focus management

### [MEDIUM] Semantic landmarks incomplete
**File**: client/src/components/AppLayout.tsx:35
**Evidence**: main tag used but no id="main-content" or skip link
**Impact**: AT users can't skip sidebar
**Fix**: Add skip link, add id="main-content" to main div

### [MEDIUM] Form labels disconnected from inputs
**File**: client/src/pages/articles.tsx:311-316
**Evidence**: Label text without input id
**Impact**: AT announces "textbox" with no label
**Fix**: Use Label htmlFor="id" with Input id="id"

### [MEDIUM] Icon-only buttons lack aria-labels
**File**: client/src/pages/citations.tsx:628-637
**Evidence**: Button with Pencil icon, no aria-label
**Impact**: AT announces "button" only
**Fix**: Add aria-label="Edit prompt"

---

## Dimension 4 — Cognitive Load

### [HIGH] Sidebar 5 sections with 26 links, no priority
**File**: client/src/components/Sidebar.tsx:24-62
**Evidence**: Main(3), Tools(4), Analytics(6), Growth(5), Optimize(8), no visual weight
**Impact**: New users paralyzed, onboarding path unclear
**Fix**: Collapse to 3: Essential, Core, Advanced

### [HIGH] "Brand" terminology inconsistent
**Evidence**: Sidebar "Brands", home "Brand", dialog "Add Brand Manually"
**Impact**: Ambiguity on data model
**Fix**: Adopt single term: "Brand Profile" throughout

### [MEDIUM] Navigation doesn't highlight current section on sub-pages
**File**: client/src/components/Sidebar.tsx:123
**Evidence**: Nav highlights matching path exactly, parent not highlighted
**Impact**: User doesn't know which section they're in
**Fix**: Breadcrumb nav or check if path starts with parent

### [MEDIUM] Information density overwhelming
**File**: client/src/pages/ai-intelligence.tsx
**Evidence**: 1700+ lines, 4+ tabs, no sub-navigation
**Impact**: Cognitive overload
**Fix**: Add "Jump to section" menu or anchor links

### [MEDIUM] Destructive vs safe actions not differentiated
**Evidence**: Delete uses text-destructive, Archive uses ghost
**Impact**: Users can't scan for dangerous actions
**Fix**: All destructive use bg-destructive text-white

---

## Positive Observations

- Good empty state templates with icons and CTAs
- Smart use of accordions for complex data
- Tab persistence via usePersistedState
- Robust Zod form validation
- Toast feedback on all mutations
- Responsive sidebar (collapses mobile)
- Consistent Radix UI patterns
- Dark mode support (except hardcoded colors)
- Loading messages via useLoadingMessages
- Brand selector reused across pages
