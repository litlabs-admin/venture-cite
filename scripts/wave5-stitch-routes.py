"""One-off script to stitch server/routes.ts after Wave 5.1 extractions.

- Deletes 10 line ranges that were extracted to per-domain files
- Inserts 10 new imports after the existing route-file imports
- Inserts 10 setupXRoutes(app) calls at the point where domain routes began

Run from repo root: python scripts/wave5-stitch-routes.py
"""

from pathlib import Path

ROUTES = Path("server/routes.ts")
lines = ROUTES.read_text(encoding="utf-8").splitlines(keepends=True)

# 1-indexed inclusive ranges to delete
delete_ranges = [
    (654, 1731),    # humanizeContent helper + content routes (+dividers)
    (1733, 2165),   # articles + distributions + geo-rankings
    (2167, 2798),   # brand-prompts + visibility-progress + citation-schedule
    (2800, 3087),   # competitors + publications + robots.txt + scans
    (3089, 4303),   # crawler perms + geo-analytics + reports + sentiment + opportunities
    (4305, 4972),   # listicles + wikipedia + bofu + faqs
    (4974, 5983),   # mentions + hallucinations + quality + facts + portfolio + sources + traffic + tests + metrics + alerts
    (5985, 6812),   # agent-tasks + outreach + automation + targets + emails
    (6814, 7278),   # geo-signals
    (7280, 7496),   # community
]

skip = set()
for start, end in delete_ranges:
    for i in range(start - 1, end):
        skip.add(i)

new_imports = [
    'import { setupContentRoutes } from "./routes/content";\n',
    'import { setupArticlesRoutes } from "./routes/articles";\n',
    'import { setupPromptsRoutes } from "./routes/prompts";\n',
    'import { setupPublicationsRoutes } from "./routes/publications";\n',
    'import { setupAnalyticsRoutes } from "./routes/analytics";\n',
    'import { setupContentTypesRoutes } from "./routes/contentTypes";\n',
    'import { setupIntelligenceRoutes } from "./routes/intelligence";\n',
    'import { setupAgentRoutes } from "./routes/agent";\n',
    'import { setupGeoSignalsRoutes } from "./routes/geoSignals";\n',
    'import { setupCommunityRoutes } from "./routes/community";\n',
]

new_setup_calls = [
    "\n",
    "  // Wave 5.1 domain splits: the rest of the routes live in per-domain\n",
    "  // files under ./routes. Each mounts its own handlers; middleware above\n",
    "  // (auth, ownership body/query guard, :brandId param guard) applies.\n",
    "  setupContentRoutes(app);\n",
    "  setupArticlesRoutes(app);\n",
    "  setupPromptsRoutes(app);\n",
    "  setupPublicationsRoutes(app);\n",
    "  setupAnalyticsRoutes(app);\n",
    "  setupContentTypesRoutes(app);\n",
    "  setupIntelligenceRoutes(app);\n",
    "  setupAgentRoutes(app);\n",
    "  setupGeoSignalsRoutes(app);\n",
    "  setupCommunityRoutes(app);\n",
    "\n",
]

# 1-indexed anchors
IMPORT_INSERT_BEFORE_LINE = 78   # inserts between current L77 and L78
SETUP_INSERT_BEFORE_LINE = 654   # inserts where the humanizeContent helper used to start

out = []
for idx, line in enumerate(lines):
    line_num = idx + 1  # 1-indexed

    if line_num == IMPORT_INSERT_BEFORE_LINE:
        out.extend(new_imports)

    if line_num == SETUP_INSERT_BEFORE_LINE:
        out.extend(new_setup_calls)

    if idx not in skip:
        out.append(line)

ROUTES.write_text("".join(out), encoding="utf-8")
print(f"routes.ts now has {len(out)} lines (was {len(lines)}, deleted {len(lines) - len(out) + len(new_imports) + len(new_setup_calls)} raw lines)")
