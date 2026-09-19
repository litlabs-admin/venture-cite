// Right-hand preview panels. Every number here comes from a session event -
// nothing is invented (see the data contract's "show a number only if we
// measured it" rule). A section with no data yet renders a skeleton; a
// section whose producer failed is left out rather than guessed.
import { plural, tallyProbe } from "./probeTally";
import { Check, Globe, FileText as DocIcon, Map as MapIcon, Code as CodeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Site,
  Competitors,
  Readiness,
  Probe,
  Source,
  Topic,
} from "@shared/onboarding/session";
import {
  CRAWLER_BOTS,
  PROBE_ENGINES,
  PROBE_PROMPT_COUNT,
  engineSchema,
  faviconProxyUrl,
  type Engine,
} from "@shared/onboarding/session";
import {
  EngineIcon,
  Favicon,
  PreviewCard,
  CardHead,
  Row,
  Eyebrow,
  Mono,
  BrandLine,
} from "./shared";

const ALL_ENGINES = engineSchema.options;

/** Which engine each crawler feeds. CCBot is Common Crawl, which several engines train on. */
const BOT_ENGINE: Record<(typeof CRAWLER_BOTS)[number], { label: string; engine: Engine | null }> =
  {
    GPTBot: { label: "ChatGPT", engine: "ChatGPT" },
    ClaudeBot: { label: "Claude", engine: "Claude" },
    PerplexityBot: { label: "Perplexity", engine: "Perplexity" },
    "Google-Extended": { label: "Gemini", engine: "Gemini" },
    CCBot: { label: "Common Crawl", engine: null },
  };

export function EnginesPreview() {
  return (
    <PreviewCard>
      <CardHead left={<Eyebrow>Engines we ask</Eyebrow>} right={<Mono>6 engines</Mono>} />
      {ALL_ENGINES.map((engine, i) => (
        <Row key={engine} last={i === ALL_ENGINES.length - 1}>
          <div className="flex items-center gap-2.5">
            <EngineIcon engine={engine} />
            <span className="text-caption text-vc-primary">{engine}</span>
          </div>
          <span className="text-label text-vc-label">Ready</span>
        </Row>
      ))}
      <div className="border-t border-vc-default px-4 py-3 text-caption leading-relaxed text-vc-tertiary">
        The same questions go to every engine, so the answers compare like for like.
      </div>
    </PreviewCard>
  );
}

export function ReadinessPreview({
  site,
  readiness,
}: {
  site: Site | null;
  readiness: Readiness | null;
}) {
  const crawlerCount = readiness?.crawlers.length ?? 5;
  const allowedCount = readiness?.crawlers.filter((c) => c.allowed).length ?? 0;
  return (
    <PreviewCard>
      <CardHead
        left={<Eyebrow>Can AI read your site?</Eyebrow>}
        right={
          <Mono>{readiness ? `${allowedCount} of ${crawlerCount} allowed` : "Checking…"}</Mono>
        }
      />
      {readiness
        ? readiness.crawlers.map((c, i) => (
            <Row key={c.bot} last={i === readiness.crawlers.length - 1 && !site}>
              <div className="flex items-center gap-2.5">
                {BOT_ENGINE[c.bot].engine ? (
                  <EngineIcon engine={BOT_ENGINE[c.bot].engine!} />
                ) : (
                  <Globe className="h-4 w-4 shrink-0 text-vc-tertiary" strokeWidth={1.5} />
                )}
                <span className="text-caption text-vc-primary">{BOT_ENGINE[c.bot].label}</span>
                <Mono>{c.bot}</Mono>
              </div>
              {c.allowed ? (
                <span className="flex items-center gap-1.5 text-label text-positive">
                  <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Allowed
                </span>
              ) : (
                <span className="text-label text-destructive">Blocked</span>
              )}
            </Row>
          ))
        : [0, 1, 2, 3, 4].map((i) => (
            <Row key={i}>
              <div className="h-3 w-24 animate-pulse rounded bg-vc-muted" />
              <span className="text-label text-vc-label">Checking</span>
            </Row>
          ))}
      {readiness ? (
        <>
          <Row>
            <div className="flex items-center gap-2.5">
              <DocIcon className="h-4 w-4 shrink-0 text-vc-tertiary" strokeWidth={1.5} />
              <span className="text-caption text-vc-primary">llms.txt</span>
            </div>
            {readiness.llmsTxt ? (
              <span className="flex items-center gap-1.5 text-label text-positive">
                <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                Found
              </span>
            ) : (
              <span className="text-label text-vc-tertiary">Not found</span>
            )}
          </Row>
          <Row>
            <div className="flex items-center gap-2.5">
              <MapIcon className="h-4 w-4 shrink-0 text-vc-tertiary" strokeWidth={1.5} />
              <span className="text-caption text-vc-primary">Sitemap</span>
            </div>
            {readiness.sitemap ? (
              <span className="flex items-center gap-1.5 text-label text-positive">
                <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                Found
              </span>
            ) : (
              <span className="text-label text-vc-tertiary">Not found</span>
            )}
          </Row>
          <Row last>
            <div className="flex items-center gap-2.5">
              <CodeIcon className="h-4 w-4 shrink-0 text-vc-tertiary" strokeWidth={1.5} />
              <span className="text-caption text-vc-primary">Schema markup</span>
            </div>
            <span className="text-label text-vc-secondary">
              {readiness.schemaTypes.length > 0
                ? `${readiness.schemaTypes[0]}${readiness.schemaTypes.length > 1 ? ` + ${readiness.schemaTypes.length - 1} more` : ""}`
                : "None found"}
            </span>
          </Row>
        </>
      ) : null}
    </PreviewCard>
  );
}

/** `prompts` are the questions the server probes: the first PROBE_PROMPT_COUNT across topics. */
export function ProbePreview({ probeTested, prompts }: { probeTested: number; prompts: string[] }) {
  const rows = prompts.slice(0, PROBE_PROMPT_COUNT);
  return (
    <PreviewCard>
      <CardHead
        left={<Eyebrow>First read, running now</Eyebrow>}
        right={<Mono>{`${probeTested} of ${PROBE_PROMPT_COUNT}`}</Mono>}
      />
      {(rows.length ? rows : [null, null, null]).map((prompt, i) => {
        const done = probeTested > i;
        return (
          <Row key={i} last={i === PROBE_PROMPT_COUNT - 1}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex gap-1">
                {PROBE_ENGINES.map((e) => (
                  <EngineIcon key={e} engine={e} size={14} />
                ))}
              </div>
              {prompt ? (
                <span className="min-w-0 flex-1 truncate text-caption text-vc-primary">
                  {prompt}
                </span>
              ) : (
                <div className="h-3 flex-1 animate-pulse rounded bg-vc-muted" />
              )}
            </div>
            <span className="shrink-0 text-label text-vc-tertiary">
              {done ? "Answered" : "Asking…"}
            </span>
          </Row>
        );
      })}
      <div className="border-t border-vc-default px-4 py-3 text-caption leading-relaxed text-vc-tertiary">
        Three buyer questions on Gemini and ChatGPT. The results are ready by the time you confirm
        your brand.
      </div>
    </PreviewCard>
  );
}

export function WorkspacePreview({ agencyName, site }: { agencyName: string; site: Site | null }) {
  const initial = agencyName ? agencyName[0]?.toUpperCase() : "A";
  return (
    <PreviewCard>
      <CardHead
        left={
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold",
                agencyName ? "bg-vc-accent text-white" : "bg-vc-muted text-vc-tertiary",
              )}
            >
              {initial}
            </div>
            <span
              className={cn(
                "text-caption font-semibold",
                agencyName ? "text-vc-primary" : "text-vc-tertiary",
              )}
            >
              {agencyName || "Your agency"}
            </span>
          </div>
        }
        right={<Mono>Workspace</Mono>}
      />
      <div className="px-4 pb-1 pt-3">
        <Eyebrow>Clients</Eyebrow>
      </div>
      <Row height={48}>
        {site ? (
          <BrandLine favicon={site.faviconUrl} domain={site.domain} showName={false} />
        ) : (
          <div className="h-3 w-32 animate-pulse rounded bg-vc-muted" />
        )}
        <span className="text-label text-vc-accent">First client</span>
      </Row>
      <Row height={48} last>
        <span className="text-caption text-vc-tertiary">Add more clients after setup</span>
      </Row>
    </PreviewCard>
  );
}

export function FirstReadPreview({
  brandName,
  site,
  competitors,
  probe,
  sources,
}: {
  brandName: string;
  site: Site | null;
  competitors: Competitors | null;
  probe: Probe | null;
  sources: Source[] | null;
}) {
  const tally = probe ? tallyProbe(probe) : null;
  const brands = [
    { name: brandName, faviconUrl: site?.faviconUrl ?? "", you: true, named: tally?.brandNamed },
    ...(competitors?.shown.map((c) => ({
      name: c.name,
      faviconUrl: c.faviconUrl,
      you: false,
      named: tally ? (tally.byCompetitor.get(c.name) ?? 0) : undefined,
    })) ?? []),
  ].sort((a, b) => (b.named ?? 0) - (a.named ?? 0) || Number(b.you) - Number(a.you));
  return (
    <PreviewCard>
      <CardHead
        left={<Eyebrow>Who AI named</Eyebrow>}
        right={
          <Mono>
            {probe ? `${plural(probe.promptsTested, "question")} · 2 engines` : "Running…"}
          </Mono>
        }
      />
      <div className="grid grid-cols-[1fr_72px] border-b border-vc-default px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-vc-label">
        <span>Brand</span>
        <span className="text-right">Named in</span>
      </div>
      {brands.map((b) => (
        <div
          key={b.name}
          className={cn(
            "grid h-9 grid-cols-[1fr_72px] items-center border-b border-vc-muted px-4",
            b.you && "bg-vc-accent-subtle",
          )}
        >
          <div className="flex items-center gap-2">
            {b.faviconUrl ? <Favicon src={b.faviconUrl} size={16} radius={4} /> : null}
            <span className={cn("text-caption text-vc-primary", b.you && "font-semibold")}>
              {b.name}
            </span>
          </div>
          <span
            className={cn(
              "text-right font-mono text-label tabular-nums",
              b.you ? "text-vc-accent" : b.named ? "text-vc-primary" : "text-vc-label",
            )}
          >
            {tally ? `${b.named} / ${tally.answers}` : "…"}
          </span>
        </div>
      ))}
      <div className="border-t border-vc-default px-4 pb-1.5 pt-3.5">
        <Eyebrow>Where the answers came from</Eyebrow>
      </div>
      {sources
        ? sources.map((s, i) => (
            <Row key={s.domain} height={34} last={i === sources.length - 1}>
              <div className="flex items-center gap-2.5">
                <Favicon src={faviconProxyUrl(s.domain)} size={16} radius={4} />
                <span className="text-caption text-vc-primary">{s.domain}</span>
              </div>
              <span className="text-label text-vc-tertiary">{s.kind}</span>
            </Row>
          ))
        : [0, 1, 2].map((i) => (
            <Row key={i} height={34}>
              <div className="h-3 w-28 animate-pulse rounded bg-vc-muted" />
            </Row>
          ))}
    </PreviewCard>
  );
}

export function SavePreview({ site, topics }: { site: Site | null; topics: Topic[] | null }) {
  const total = topics?.reduce((sum, t) => sum + t.prompts.length, 0) ?? 0;
  const stat = (v: string | number, l: string) => (
    <div className="flex flex-1 flex-col gap-0.5 px-4 py-3.5">
      <span className="text-metric font-semibold tabular-nums tracking-tight text-vc-primary">
        {v}
      </span>
      <span className="text-label text-vc-tertiary">{l}</span>
    </div>
  );
  return (
    <PreviewCard>
      <CardHead
        left={
          site ? (
            <BrandLine favicon={site.faviconUrl} domain={site.domain} showName={false} />
          ) : (
            <span />
          )
        }
        right={<Mono>Weekly</Mono>}
      />
      <div className="flex divide-x divide-vc-default border-b border-vc-default">
        {stat(total || "…", "questions")}
        {stat(6, "engines")}
        {stat(total ? total * 6 : "…", "answers checked")}
      </div>
      <div className="flex justify-between p-4">
        {ALL_ENGINES.map((e) => (
          <div key={e} className="flex w-14 flex-col items-center gap-1.5">
            <EngineIcon engine={e} size={20} />
            <span className="text-label text-vc-tertiary">{e}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-vc-default px-4 py-3 text-caption leading-relaxed text-vc-tertiary">
        Your score, rankings and trends start from this run. We don&#39;t show a number until
        we&#39;ve measured it.
      </div>
    </PreviewCard>
  );
}
