import { useState } from "react";
import { CalendlyInline } from "@/components/CalendlyInline";
import { CALENDLY_BOOKING_URL } from "@/lib/calendly";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useSearch } from "@tanstack/react-router";
import { apiRequest } from "@/lib/queryClient";
import { isAllowedStripeRedirect } from "@/lib/urlSafety";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { TestModeBanner } from "@/components/TrialGate";
import { Check, ArrowLeft, Sparkles, Crown, Zap, Users, Gift, Loader2 } from "lucide-react";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";
import {
  SELLABLE_TIERS,
  TRIAL_DAYS,
  PLAN_PRICE_CENTS,
  PAYING_TIERS,
  resolveTier,
} from "@shared/schema";

/** One rendered pricing card. `priceId` is absent for anything not sold
 *  through Stripe Checkout - today that is Enterprise, and the placeholder
 *  cards shown before the live products load. */
interface PlanCard {
  name: string;
  description: string;
  price: string;
  interval: string;
  features: string[];
  popular: boolean;
  tier: string;
  priceId?: string;
  /** What this plan is SUPPOSED to cost, in cents. A Stripe price that does
   *  not match is a stale catalogue, not a price change - see planCards. */
  amountCents: number;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: {
    id: string;
    unit_amount: number;
    currency: string;
    recurring: { interval: string } | null;
  }[];
}

/**
 * The words for each sellable plan, keyed by tier.
 *
 * Stripe owns the PRICE - a page that hardcodes an amount will eventually lie
 * about what the card is charged - but it does not own the marketing copy, and
 * a product whose `features` metadata is missing or stale must not render a
 * plan card with an empty feature list under a real price. So this is both the
 * placeholder shown before /api/stripe/products resolves and the fallback when
 * a product carries no usable copy.
 *
 * Keep in step with server/setupProducts.ts, which writes the same features
 * into Stripe when the catalogue is synced.
 */
// Module scope, not a const inside the component: planCards is built at the
// top of the render and would otherwise hit this in its temporal dead zone
// ("Cannot access 'formatPrice' before initialization"). It closes over
// nothing, so there is no reason for it to live inside.
function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

const PLAN_COPY: Record<string, PlanCard> = {
  pro: {
    name: "Pro",
    description: "Track how AI engines see your brand",
    price: "$99",
    amountCents: PLAN_PRICE_CENTS.pro,
    interval: "month",
    features: [
      "AI visibility tracking across every major engine",
      "Weekly citation checks",
      "Competitor benchmarking",
      "Site health and crawler access audits",
      "3 brand profiles",
    ],
    popular: true,
    tier: "pro",
  },
  agency: {
    name: "Agency",
    description: "Everything in Pro, plus content built to get you cited",
    price: "$500",
    amountCents: PLAN_PRICE_CENTS.agency,
    interval: "month",
    features: [
      "Everything in Pro",
      "40 AI-generated articles/month",
      "Reddit and community posts",
      "10 brand profiles",
      "Priority support",
    ],
    popular: false,
    tier: "agency",
  },
};

export default function Pricing() {
  const { toast } = useToast();
  // The trial is granted at SIGNUP, not by Stripe - there is no
  // trial_period_days on the subscription. So a logged-OUT visitor cannot
  // "start a trial" through Checkout: POST /api/stripe/checkout is
  // authenticated and answered them 401, which surfaced as a dead
  // "Failed to start checkout" toast on the primary CTA of a marketing page.
  // Signed out, the CTA is a signup. Signed in, it is a purchase.
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const signedIn = !!user;
  // Whether the trial is still on offer, which is what the CTA has to say.
  // It used to key off signed-in alone, so every logged-in visitor read
  // "Subscribe" - hiding the 14-day trial from the exact people being asked to
  // pay, on a page whose headline is "Start free for 14 days". The real split
  // is not signed-in vs not, it is whether they already have a subscription:
  // an existing customer switching plans keeps their billing period and gets
  // no second trial, so offering them one would be a lie.
  const onATrialablePlan = !signedIn || !PAYING_TIERS.includes(resolveTier(user!));
  const [betaCode, setBetaCode] = useState("");
  const [inquiryOpen, setInquiryOpen] = useState(false);
  // "Book a call" now opens the scheduler by default. The written enquiry form
  // is kept, not replaced: it is a working lead path with a server handler
  // behind it, and some buyers would rather describe a scope than pick a slot.
  const [enterpriseMode, setEnterpriseMode] = useState<"call" | "message">("call");
  const [inquiry, setInquiry] = useState({ name: "", email: "", company: "", message: "" });
  // Stripe redirects back with a plain `?success=true` / `?canceled=true`
  // query string. TanStack's default search parser JSON-parses primitive
  // values, so these arrive as the boolean `true`, not the string "true" -
  // check for both so this survives either encoding.
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const success = search.success === true || search.success === "true";
  const canceled = search.canceled === true || search.canceled === "true";

  const { data: productsData, isLoading } = useQuery<{ success: boolean; data: StripeProduct[] }>({
    queryKey: ["/api/stripe/products"],
  });

  const products = productsData?.data || [];

  // The APP defines which plans exist; Stripe supplies the price for the ones
  // it knows about. Both directions of drift are handled:
  //
  //   plan in Stripe but not here    ignored (the account still carries the
  //                                  previous pricing's Free/Pro/Enterprise
  //                                  products, each duplicated)
  //   plan here but not in Stripe    still rendered, with our own price and no
  //                                  Subscribe button - Agency does not exist
  //                                  in Stripe yet, and dropping it left the
  //                                  page advertising a single plan
  //
  // Deriving the list from Stripe alone did the second of those silently,
  // which is how the page ended up showing one $79 card and nothing else.
  // Duplicates resolve to the LAST match, i.e. the most recently created, so a
  // freshly synced catalogue wins over what it replaced.
  const planCards: PlanCard[] = SELLABLE_TIERS.map((tier) => {
    const copy = PLAN_COPY[tier];
    const matches = products.filter((p) => p.metadata?.tier === tier);
    // Duplicates resolve to the most recently created, so a freshly synced
    // catalogue wins over whatever it replaced.
    const product = matches[matches.length - 1];
    const price = product?.prices?.[0];

    // A Stripe price is only used when it MATCHES what this plan is supposed
    // to cost. The account still carries the previous pricing - a live "Pro"
    // product at $79 with tier metadata that matches ours perfectly - and
    // trusting it made the page advertise the old price under the new plan.
    //
    // The two bad options were to print our $99 over Stripe's live $79 (the
    // page lies about what the card is charged) or to print $79 (the page
    // shows pricing nobody agreed to). Neither is acceptable, so on a
    // mismatch we show the real price and DISABLE checkout: the button falls
    // back to "Contact Sales" because there is no correct thing to sell yet.
    // Sync the catalogue and both halves line up on their own.
    const priceMatches =
      !!price && price.unit_amount === copy.amountCents && price.currency?.toLowerCase() === "usd";

    if (!product || !price || !priceMatches) {
      if (price && !priceMatches) {
        // Loud, because this means the pricing page and Stripe disagree about
        // money and nobody can buy this plan until it is resolved.
        console.warn(
          `[pricing] Stripe price for "${tier}" is ${price.unit_amount} ${price.currency}, expected ${copy.amountCents} usd. Checkout disabled for this plan until the catalogue is synced.`,
        );
      }
      return copy;
    }

    const fromStripe = (product.metadata?.features || "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    return {
      ...copy,
      interval: price.recurring?.interval || copy.interval,
      // Stripe owns the price; this file owns the words. A product with no
      // usable `features` metadata otherwise drew an empty feature list.
      features: fromStripe.length > 0 ? fromStripe : copy.features,
      priceId: price.id,
    };
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return response.json();
    },
    onSuccess: (data) => {
      // An existing subscriber gets their plan SWAPPED server-side rather than
      // a second subscription sold to them, so there is no Checkout URL to
      // redirect to - the change is already live and billed.
      if (data?.updated) {
        void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        toast({
          title: "Plan updated",
          description: "Your new plan is active. We've billed the difference for this period.",
        });
        return;
      }
      if (data?.url && isAllowedStripeRedirect(data.url)) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Could not start checkout",
          description: "Received an unexpected redirect URL from the server.",
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) => {
      // Surface the server's own message when it has one - "You're already on
      // this plan" is far more use than a generic failure.
      toast({
        title: e?.message?.includes("already on this plan")
          ? "You're already on this plan"
          : "Failed to start checkout",
        variant: "destructive",
      });
    },
  });

  const enterpriseInquiry = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/enterprise-inquiry", inquiry);
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        setInquiryOpen(false);
        setInquiry({ name: "", email: "", company: "", message: "" });
        toast({
          title: "Thanks - we'll be in touch",
          description: "We usually reply within one business day.",
        });
      } else {
        toast({ title: data?.error || "Could not send that", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Could not send that. Please try again.", variant: "destructive" });
    },
  });

  const betaCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/beta/validate", { code });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: `Beta access activated! You now have ${data.accessTier} access.` });
      } else {
        toast({ title: data.error || "Invalid code", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Invalid or expired invite code", variant: "destructive" });
    },
  });

  // Enterprise is sales-led and has no Stripe product, so it is never in the
  // /api/stripe/products response and has to be appended here. It carries no
  // priceId, which is what routes its button to the contact flow rather than
  // to Checkout.
  const enterpriseCard: PlanCard = {
    name: "Enterprise",
    description: "Done-for-you, priced to your scope",
    price: "Talk to us",
    amountCents: 0,
    interval: "",
    features: [
      "Everything in Agency",
      "Unlimited brand profiles",
      "Managed content and outreach",
      "Custom integrations",
      "Dedicated account manager",
    ],
    popular: false,
    tier: "enterprise",
  };

  return (
    // Mounted by src/routes/pricing.tsx, a server-rendered top-level route
    // (not under `_app`, which is ssr:false). Title/meta come from that
    // route's `head()` - this component renders none of its own, per the
    // project's "metadata belongs to the route" rule.
    <PanelPage>
      <div className="px-8 py-6 max-w-5xl mx-auto">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center text-caption text-vc-tertiary hover:text-vc-primary mb-4"
            data-testid="link-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
          </Link>
        </div>

        {/* Pricing sits outside AppShell, so it does not inherit the shell's
            copy of this. It is also the page where the card is actually
            entered, which makes it the one that most needs to say the
            payment is simulated. */}
        <div className="mb-8">
          <TestModeBanner />
        </div>

        {success && (
          <div className="mb-8 p-4 bg-positive-subtle border border-positive rounded-lg text-center">
            <Check className="w-6 h-6 inline mr-2 text-positive" />
            <span className="text-positive font-medium">
              Payment successful! Your subscription is now active.
            </span>
          </div>
        )}

        {canceled && (
          <div className="mb-8 p-4 bg-warning-subtle border border-warning rounded-lg text-center">
            <span className="text-warning font-medium">
              Checkout was canceled. No charges were made.
            </span>
          </div>
        )}

        <div className="text-center mb-12">
          <Badge className="mb-4 bg-vc-muted text-vc-tertiary hover:bg-vc-muted">
            <Sparkles className="w-3 h-3 mr-1" /> {TRIAL_DAYS}-day free trial
          </Badge>
          <h1
            className="text-page font-semibold text-vc-primary mb-4"
            data-testid="text-page-title"
          >
            Find out what AI says about you
          </h1>
          <p className="text-ui text-vc-tertiary max-w-2xl mx-auto">
            Track where ChatGPT, Claude, Perplexity and Gemini cite your brand, see who they
            recommend instead, and fix the gaps.
          </p>
          {/* The trial is granted at SIGNUP, not through Checkout - there is no
              trial_period_days on the Stripe subscription. So this page has to
              say so out loud: a visitor who reads only the plan cards sees
              nothing but two prices and no hint they can try it first. */}
          <p className="mt-4 text-ui font-medium text-vc-primary">
            Start free for {TRIAL_DAYS} days. Cancel any time before it ends.
          </p>
        </div>

        {/* Plain cards, not the dashboard's <Panel> grammar. Panel sets
            `overflow-hidden` and draws COLUMN SEPARATORS rather than card
            outlines, which clipped the "Most Popular" badge off the top of the
            Pro card and left the other two plans with no visible border at
            all. A pricing card is a self-contained object, so it gets a real
            box.

            `items-stretch` + `h-full` + `mt-auto` on the button keep the three
            cards the same height with their CTAs on one line, regardless of
            how many features or how long a description each plan has. Without
            it the buttons staircased down the row. */}
        <div className="mb-12 grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
          {[...planCards, enterpriseCard].map((plan) => {
            // Is this the card for the plan the user is already paying for?
            // The page previously read the user's tier only once, to pick
            // trial-vs-switch wording for EVERY card at once, so the plan you
            // are already on still said "Switch to this plan" and stayed
            // clickable - sending you to Checkout for the plan you already
            // have. `plan.tier` and resolveTier() already share the literal
            // strings "pro"/"agency", so this is a direct match, and the
            // signedIn guard keeps anonymous visitors from ever matching.
            const isCurrentPlan = signedIn && plan.tier === resolveTier(user!);
            return (
              <div
                key={plan.name}
                data-testid={`pricing-card-${plan.name.toLowerCase()}`}
                className={`relative flex h-full flex-col rounded-lg border bg-vc-surface p-6 ${
                  plan.popular ? "border-vc-accent ring-1 ring-vc-accent" : "border-vc-default"
                }`}
              >
                {/* "Current plan" wins over "Most Popular": which plan you are
                  on is a fact about your account, and it is the more useful
                  thing to know on the card you are looking at. */}
                {isCurrentPlan ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <Badge className="bg-vc-accent text-primary-foreground">Current plan</Badge>
                  </div>
                ) : plan.popular ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <Badge className="bg-vc-accent text-primary-foreground">Most Popular</Badge>
                  </div>
                ) : null}

                <div className="mb-4 text-center">
                  <h2 className="text-ui font-semibold text-vc-primary">{plan.name}</h2>
                  {/* Two lines reserved. Descriptions differ in length (Agency
                    wraps, Pro does not), and without a floor the price below
                    sat 18px lower on that one card - measured. */}
                  <p className="mt-1 min-h-[36px] text-caption text-vc-tertiary">
                    {plan.description}
                  </p>
                </div>

                <div className="mb-6 flex items-baseline justify-center gap-1">
                  <span className="text-metric font-semibold text-vc-primary">{plan.price}</span>
                  {plan.interval && (
                    <span className="text-caption text-vc-tertiary">/{plan.interval}</span>
                  )}
                </div>

                <ul className="mb-6 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vc-accent" aria-hidden />
                      <span className="text-caption text-vc-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* mt-auto pins every CTA to the bottom of its card. */}
                <div className="mt-auto">
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    // Tier first, then price availability. Enterprise is
                    // sales-led and must never reach Checkout; a sellable plan
                    // reaches it only with a price that matched the expected
                    // amount (see planCards).
                    onClick={() => {
                      if (plan.tier === "enterprise") {
                        setInquiryOpen(true);
                        return;
                      }
                      // No account yet: the trial starts at registration, so
                      // that is where this goes. Checkout would only 401.
                      if (!signedIn) {
                        window.location.href = "/register";
                        return;
                      }
                      if (plan.priceId) {
                        checkoutMutation.mutate(plan.priceId);
                        return;
                      }
                      toast({
                        title: "This plan isn't available for checkout yet.",
                        description: "Please contact us and we'll get you set up.",
                      });
                    }}
                    disabled={isCurrentPlan || checkoutMutation.isPending}
                    data-testid={`button-subscribe-${plan.name.toLowerCase()}`}
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {/* The label must describe what the button actually does:
                      "Subscribe" only when there is a verified price behind it,
                      never as decoration over a dead branch. */}
                    {isCurrentPlan
                      ? "Current plan"
                      : plan.tier === "enterprise"
                        ? "Book a call"
                        : !plan.priceId
                          ? "Contact Sales"
                          : onATrialablePlan
                            ? "Start free trial"
                            : "Switch to this plan"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Enterprise enquiry. The counterpart to Checkout for the one plan
            that is sold by conversation rather than by card - see
            server/routes/enterpriseInquiry.ts. A dialog rather than a separate
            page so the visitor never loses the pricing context they were
            reading, and rather than a mailto so the lead reaches us even if
            they have no mail client configured. */}
        <Dialog
          open={inquiryOpen}
          onOpenChange={(open) => {
            setInquiryOpen(open);
            // Always reopen on the scheduler, not on whatever the last visit
            // switched to.
            if (open) setEnterpriseMode("call");
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {enterpriseMode === "call" ? "Book a call" : "Talk to us about Enterprise"}
              </DialogTitle>
              <DialogDescription>
                {enterpriseMode === "call"
                  ? "Pick a time that suits you and we'll walk through what Enterprise would look like for your team."
                  : "Tell us what you need and we'll come back with a scope and a price. Managed content, outreach and custom integrations are all on the table."}
              </DialogDescription>
            </DialogHeader>

            {enterpriseMode === "call" ? (
              <div className="space-y-3">
                <CalendlyInline url={CALENDLY_BOOKING_URL} />
                <button
                  type="button"
                  className="text-caption text-vc-secondary underline hover:text-vc-primary"
                  onClick={() => setEnterpriseMode("message")}
                  data-testid="button-enterprise-message-instead"
                >
                  Prefer to write instead? Send us a message.
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  placeholder="Your name"
                  value={inquiry.name}
                  maxLength={120}
                  onChange={(e) => setInquiry({ ...inquiry, name: e.target.value })}
                  data-testid="input-inquiry-name"
                />
                <Input
                  type="email"
                  placeholder="Work email"
                  value={inquiry.email}
                  maxLength={200}
                  onChange={(e) => setInquiry({ ...inquiry, email: e.target.value })}
                  data-testid="input-inquiry-email"
                />
                <Input
                  placeholder="Company (optional)"
                  value={inquiry.company}
                  maxLength={200}
                  onChange={(e) => setInquiry({ ...inquiry, company: e.target.value })}
                  data-testid="input-inquiry-company"
                />
                <Textarea
                  placeholder="What are you trying to achieve? (optional)"
                  rows={4}
                  value={inquiry.message}
                  maxLength={2000}
                  onChange={(e) => setInquiry({ ...inquiry, message: e.target.value })}
                  data-testid="input-inquiry-message"
                />
              </div>
            )}

            {enterpriseMode === "message" && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setEnterpriseMode("call")}>
                  Back
                </Button>
                <Button
                  // Mirrors the server's own rule so the visitor is told before
                  // the round-trip, not after it.
                  disabled={
                    !inquiry.name.trim() || !inquiry.email.trim() || enterpriseInquiry.isPending
                  }
                  onClick={() => enterpriseInquiry.mutate()}
                  data-testid="button-send-inquiry"
                >
                  {enterpriseInquiry.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Send enquiry
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        <PanelRow cols={1} className="max-w-md mx-auto">
          <Panel width="wide" border="last">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-vc-muted flex items-center justify-center mb-2">
                <Gift className="w-6 h-6 text-vc-tertiary" />
              </div>
              <h2 className="text-page font-semibold text-vc-primary">Have a Beta Invite Code?</h2>
              <p className="text-caption text-vc-tertiary">
                Enter your code to unlock beta access for free
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <Input
                placeholder="Enter invite code"
                value={betaCode}
                onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                className="flex-1"
                data-testid="input-beta-code"
              />
              <Button
                onClick={() => betaCodeMutation.mutate(betaCode)}
                disabled={!betaCode || betaCodeMutation.isPending}
                data-testid="button-redeem-code"
              >
                {betaCodeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Redeem"
                )}
              </Button>
            </div>
          </Panel>
        </PanelRow>

        <div className="mt-16 text-center">
          <h3 className="text-ui font-semibold text-vc-primary mb-4">Trusted by Leading Brands</h3>
          <p className="text-caption text-vc-tertiary mb-8">
            Join hundreds of companies optimizing their AI search visibility
          </p>
          <div className="flex justify-center gap-8 flex-wrap opacity-50">
            <Users className="w-12 h-12" />
            <Zap className="w-12 h-12" />
            <Sparkles className="w-12 h-12" />
          </div>
        </div>
      </div>
    </PanelPage>
  );
}
