import { useScrollReveal, scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";
import { SectionHeader } from "@/pages/home2/sections/SectionHeader/SectionHeader";
import { TestimonialCard } from "./TestimonialCard";
import { LogoStrip } from "./LogoStrip";

// Testimonials — layout verbatim from _reference/index.html lines 3132-3256
// (section-header-05 + #testimonials-section). Bordered panel (max-width
// 1120px, shared across the page) split grid-cols-12: a large featured
// quote (col-span-7) on the left, two smaller stacked quotes (col-span-5) on
// the right, and a grayscale logo strip along the bottom.
//
// TODO(launch): every quote below is a placeholder. The source shipped real,
// named customers of a different product; reattributing them to VentureCite
// would be fabricated endorsement, so the names, roles, photographs and
// LinkedIn links were removed rather than reworded. Replace with real quotes
// — with permission — before this page goes public, or drop the section.
//
// Settled-vs-transient: source froze the featured quote block, both small
// quote cards, and the logo-strip row at opacity-0/translate-y-6 (or
// translate-y-2 for the logos) — entrance-animation start points, not the
// resting look. Rendered here in the SETTLED state (fully opaque,
// untransformed) by default, wired to replay the entrance via
// useScrollReveal with the exact per-child transitionDelay values present
// in the source (0ms / 100ms / 200ms for the three panels, 300ms for the
// logo row label+wrapper, then 400/450/500/550/600ms for the five logos
// individually).
export function Testimonials() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  return (
    <>
      <SectionHeader number="05" label="Customers" subtitle="In their words" />
      <section id="testimonials-section" ref={ref} className="bg-tk-surface relative">
        <div className="px-4 lg:px-8">
          <div className="mx-auto" style={{ maxWidth: 1120 }}>
            <div
              className="bg-tk-surface border border-tk-default"
              style={{ maxWidth: 1120, margin: "0px auto" }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Featured quote — placeholder, see TODO(launch) above */}
                <div
                  className={`lg:col-span-7 p-5 sm:p-8 lg:p-10 lg:border-r border-tk-default relative flex flex-col transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                  }`}
                  style={{ transitionTimingFunction: scrollRevealEase }}
                >
                  <svg
                    className="w-8 sm:w-10 h-8 sm:h-10 text-tk-accent/20 mb-4 sm:mb-5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                  <div className="flex-1 flex flex-col">
                    <blockquote className="mb-3 sm:mb-4">
                      <p className="text-[16px] sm:text-[18px] lg:text-[20px] font-medium text-tk-primary leading-[1.45]">
                        Placeholder — your strongest customer quote goes here, about what changed
                        once they could see themselves in AI answers.
                      </p>
                    </blockquote>
                    <blockquote className="mb-auto">
                      <p className="text-[13px] sm:text-[14px] lg:text-[15px] text-tk-secondary leading-relaxed">
                        Placeholder — a second line from the same person, ideally naming a concrete
                        outcome.
                      </p>
                    </blockquote>
                  </div>
                  <div className="flex items-end justify-between gap-3 mt-5 sm:mt-6">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="w-12 h-12 rounded-full bg-tk-accent-subtle flex items-center justify-center flex-shrink-0">
                        <span className="text-[14px] font-semibold text-tk-accent">&mdash;</span>
                      </div>
                      <div>
                        <div className="text-[14px] font-medium text-tk-primary">Name pending</div>
                        <div className="text-[12px] text-tk-text-muted">Role, Company</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stacked smaller quotes — placeholders, see TODO(launch) above */}
                <div className="lg:col-span-5 flex flex-col">
                  <TestimonialCard
                    quote="Placeholder — a shorter supporting quote, ideally from a different kind of team than the featured one."
                    initials="—"
                    name="Name pending"
                    title="Role, Company"
                    borderClassName="border-t lg:border-t-0 border-tk-default"
                    isVisible={isVisible}
                    delayMs={100}
                  />
                  <TestimonialCard
                    quote="Placeholder — a third quote. The card also supports one accent-colored note line beneath the role."
                    initials="—"
                    name="Name pending"
                    title="Role, Company"
                    borderClassName="border-t border-tk-default"
                    isVisible={isVisible}
                    delayMs={200}
                  />
                </div>
              </div>

              <LogoStrip isVisible={isVisible} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
