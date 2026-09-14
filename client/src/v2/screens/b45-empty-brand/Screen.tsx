import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Panel } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import type { V2IconName } from "@/v2/contracts/icons";

export type Board45Data = {
  brandId: string;
  mode: "guided" | "expert";
  brand: { name: string };
};

type SetupStep = {
  icon: V2IconName;
  title: string;
  text: string;
  minutes: number;
};

const SETUP_STEPS: readonly SetupStep[] = [
  {
    icon: "globe",
    title: "Add website",
    text: "Tell us the brand's website so we can find and verify its information.",
    minutes: 2,
  },
  {
    icon: "facts",
    title: "Confirm facts",
    text: "Review and confirm the brand facts we find - name, description, products, and links.",
    minutes: 5,
  },
  {
    icon: "q",
    title: "Approve buyer questions",
    text: "We suggest buyer questions for the industry. Edit them or add your own, then approve the set.",
    minutes: 3,
  },
];

const TOTAL_MINUTES = SETUP_STEPS.reduce((sum, step) => sum + step.minutes, 0);

function StepRow({ step, index }: { step: SetupStep; index: number }) {
  return (
    <Panel padding="standard" className="flex items-start gap-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]">
        <V2Icon name={step.icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={v2Type.bodyStrong}>
            {index + 1}. {step.title}
          </h3>
          <span className={v2Type.meta}>~ {step.minutes} minutes</span>
        </div>
        <p className={`${v2Type.body} mt-1`}>{step.text}</p>
      </div>
    </Panel>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--v2-line)] pt-5 first:border-t-0 first:pt-0">
      <h3 className={v2Type.bodyStrong}>{title}</h3>
      <div className={`${v2Type.body} mt-2`}>{children}</div>
    </section>
  );
}

export function Board45Screen({ data }: V2ScreenProps<Board45Data>) {
  const linkSearch = { brandId: data.brandId, mode: data.mode };
  return (
    <div className="flex min-h-full min-w-0 flex-col lg:flex-row" data-testid="board45-empty-brand">
      <main className="min-w-0 flex-1 px-7 py-6 xl:px-8">
        <PageHeader
          title="Start with one verified brand"
          sub={
            <>
              Add {data.brand.name}&apos;s website, confirm a few key facts, and set the buyer
              questions your team wants to track. In about {TOTAL_MINUTES} minutes,{" "}
              {data.brand.name} will have real insights here instead of this setup guide.
            </>
          }
          className="mb-6"
        />
        <div className="space-y-3" data-testid="board45-setup-steps">
          {SETUP_STEPS.map((step, index) => (
            <StepRow key={step.title} step={step} index={index} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild className="h-10 rounded-lg px-4 text-[13.5px]">
            <Link to="/v2/brand-facts/workspace" search={linkSearch}>
              Add brand facts
            </Link>
          </Button>
        </div>
      </main>
      <aside
        aria-label="Setup details"
        className="w-full shrink-0 space-y-5 border-t border-[var(--v2-line)] px-7 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6"
      >
        <RailSection title="What we need">
          <ul className="space-y-1.5">
            <li>The brand&apos;s website URL</li>
            <li>Basic facts - name, description, products or services, links, location</li>
            <li>Buyer questions to track</li>
          </ul>
        </RailSection>
        <RailSection title="What we don't need">
          <ul className="space-y-1.5">
            <li>No login to the site</li>
            <li>No source code or internal data</li>
            <li>No customer lists or sensitive information</li>
          </ul>
        </RailSection>
        <RailSection title="Your data and privacy">
          We only use publicly available information and the facts approved here. Nothing is shared
          without permission.
        </RailSection>
        <RailSection title="Plan usage">
          <>
            This brand is added to the existing team plan.{" "}
            <Link
              to="/v2/settings/billing"
              search={linkSearch}
              className="text-[color:var(--v2-brand)] no-underline hover:underline"
            >
              View plan and billing
            </Link>
          </>
        </RailSection>
      </aside>
    </div>
  );
}
