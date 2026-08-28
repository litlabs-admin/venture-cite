# B5 partition: decomposing the storage layer

`server/databaseStorage.ts` is 5,251 lines implementing a single `IStorage`
interface of 307 methods. 60 files import it. `prompts.ts` uses 90 of those
methods; most files use a handful.

The file size is the symptom. The 307-method interface is the defect. A split
that only makes the file smaller, while every consumer still depends on the whole
surface, is cosmetic work carrying real risk.

## Measured before planning

|                        |                                                           |
| ---------------------- | --------------------------------------------------------- |
| `databaseStorage.ts`   | 5,251 lines                                               |
| `IStorage` methods     | 307                                                       |
| Implementations        | 315 (309 in the class, 6 in `storage/workflowStorage.ts`) |
| Instance fields        | none, the class is stateless                              |
| Internal `this.` calls | 26, of which 6 cross a domain boundary                    |
| Consumer files         | 60                                                        |

## The shape

Thirteen schema domains exist after B4. Two of them, `perception` and
`siteHealth`, have no storage methods at all, so this layer splits eleven ways.

Each domain becomes a plain object, matching `storage/workflowStorage.ts`, which
already uses that shape:

    export const brandStorage = {
      async getBrandById(id: string) { ... },
    } satisfies Partial<IStorage> & ThisType<IStorage>;

`storage` is composed from them:

    export const storage: IStorage = {
      ...identityStorage, ...brandStorage, ...contentStorage, ...
    };

## Why composition rather than delegation

Six of the 26 internal calls cross a domain boundary:

    deleteBrand              -> clearTourStateForBrand    brands      -> platform
    getCitationQualities     -> getBrandPromptsByBrandId  citations   -> prompts
    getCitationQualityStats  -> getBrandPromptsByBrandId  citations   -> prompts
    getCompetitorLeaderboard -> getBrandById, getBrands   competitors -> brands
    recordCurrentMetrics     -> getGeoRankingsBy...       platform    -> citations
    getUserUsage             -> resetMonthlyUsage         identity    -> identity

If modules imported each other to resolve these, `brands -> platform ->
citations -> prompts` plus `competitors -> brands` is a dependency tangle waiting
to become a cycle.

They do not need to. Object spread preserves `this` binding to the composed
object at call time, so `this.getBrandById()` inside `competitorStorage` resolves
through `storage` without `competitors` importing `brands`. `ThisType<IStorage>`
gives TypeScript the same view.

Verified before adopting: the pattern typechecks under `--strict`, runs
correctly, and a missing module in the spread produces
`TS2741: Property 'clearTourStateForBrand' is missing`. The compiler enforces
completeness of the composition.

## What actually fixes the god interface

Splitting the file changes nothing about coupling on its own. Three further steps
do, and only the first belongs in B5:

1. Each domain object is exported directly, so a caller can
   `import { brandStorage }` and depend on 22 methods instead of 307. Nothing is
   forced to migrate; the narrow door simply exists.
2. A check that fails when a new `storage.` usage appears where a domain import
   would serve. Without it, habit keeps everyone on the facade and the god
   interface survives its own decomposition.
3. Consumers migrate opportunistically, when someone is already editing a file.
   Migrating all 60 now would be a 60-file change with no mechanical proof of
   equivalence, in a codebase whose suite contains 16 test files that test
   nothing. That is how a silent regression gets in.

## Allocation

| Domain      | Methods |
| ----------- | ------: |
| content     |      50 |
| signals     |      47 |
| prompts     |      39 |
| citations   |      39 |
| platform    |      31 |
| brands      |      24 |
| competitors |      16 |
| factAgent   |      28 |
| jobs        |      18 |
| identity    |      11 |
| chatbot     |      10 |

Counts include the 28 methods the keyword pass could not classify, resolved by
inspection: the eleven `ScrapeRun` and `ScrapePage` methods and
`incrementMonthlyCostCents` go to `factAgent`; `markAutopilotAttempt` and
`transitionAutopilotFromFailedToPending` to `brands`; `getTourState` and
`patchTourState` to `platform`; `setVisibilityStep`, `unsetVisibilityStep`,
`getRecentRankingsForRun`, `getGeoToolsSummary` and `getCitedRelevanceStats` to
`citations`; `promoteSuggestionToTracked` to `prompts`;
`getTopKeywordOpportunities` to `content`; and the four `workflowStorage` methods
to `jobs`.

## Gates

`npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json`
proves three things `tsc` cannot:

1. `IStorage` still declares exactly the same 307 methods.
2. No method is implemented in two files. Object spread resolves a clash
   silently, last writer wins, and the loser's behaviour disappears.
3. No method body changed. A move must not alter behaviour, and a diff of a
   5,000-line file is unreadable, so bodies are compared per method with
   whitespace collapsed.

The gate was break-tested in all three directions before being trusted: a dropped
interface method, an edited body, and a duplicated method were each caught by
name.

Typecheck, lint, format and the full suite run alongside it.
