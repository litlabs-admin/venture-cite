import { SectionHeader } from "@/pages/home2/sections/SectionHeader/SectionHeader";
import { useScrollReveal } from "@/pages/home2/hooks/useScrollReveal";
import { PlaybookCard } from "./PlaybookCard";
import { AiLogoGrid } from "./AiLogoGrid";
import { ActionChecklist } from "./ActionChecklist";
import { ChatTranscriptDemo } from "./ChatTranscriptDemo";
import { StatBar } from "./StatBar";

// Verbatim from _reference/index.html:2441-2759 ("Why Trakkr" / Philosophy).
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function Philosophy() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  return (
    <>
      <SectionHeader number="03" label="Why VentureCite" subtitle="Approach" />
      <section id="philosophy-section" ref={ref} className="bg-tk-surface relative">
        <div className="px-4 lg:px-8">
          <div className="mx-auto" style={{ maxWidth: 1120 }}>
            <div
              className="bg-tk-surface border border-tk-default"
              style={{ maxWidth: 1120, margin: "0 auto" }}
            >
              {/* Intro block */}
              <div
                className={`p-4 sm:p-6 lg:p-8 border-b border-tk-default transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
                style={{ transitionTimingFunction: EASE }}
              >
                <p className="text-[13px] sm:text-[14px] text-tk-secondary mb-1">
                  Other tools give you a dashboard.
                </p>
                <h2 className="text-[18px] sm:text-[24px] lg:text-[28px] font-semibold text-tk-primary tracking-[-0.02em]">
                  VentureCite gives you a playbook<span className="text-tk-accent">.</span>
                </h2>
              </div>

              {/* 3-column playbook card grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-tk-default">
                <PlaybookCard
                  number="01"
                  href="/register"
                  title="Every major engine, not a sample"
                  body="ChatGPT, Claude, Perplexity, Gemini, Copilot, Google AI Overview. Each one surfaces different brands for the same query. Tracking two or three is guessing."
                  ctaLabel="See all features"
                  delayMs={100}
                  isVisible={isVisible}
                >
                  <AiLogoGrid />
                </PlaybookCard>

                <PlaybookCard
                  number="02"
                  href="/register"
                  title="Actions, not dashboards"
                  body="Every week, VentureCite synthesizes your citation and GEO signals into prioritized actions you can execute today. Not reports you file. A playbook you run."
                  ctaLabel="See how actions work"
                  delayMs={180}
                  isVisible={isVisible}
                >
                  <ActionChecklist />
                </PlaybookCard>

                <PlaybookCard
                  number="03"
                  href="/register"
                  title="An assistant that fixes it"
                  body="VentureCite's assistant diagnoses what's costing you citations, drafts the fix, and walks you through it end to end. Nothing ships without your approval."
                  ctaLabel="See how it works"
                  delayMs={260}
                  isVisible={isVisible}
                >
                  <ChatTranscriptDemo />
                </PlaybookCard>
              </div>

              <StatBar isVisible={isVisible} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
