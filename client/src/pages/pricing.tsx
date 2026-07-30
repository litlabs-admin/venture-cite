import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useSearch } from "@tanstack/react-router";
import { apiRequest } from "@/lib/queryClient";
import { isAllowedStripeRedirect } from "@/lib/urlSafety";
import { useToast } from "@/hooks/use-toast";
import { Check, ArrowLeft, Sparkles, Crown, Zap, Users, Gift, Loader2 } from "lucide-react";

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

export default function Pricing() {
  const { toast } = useToast();
  const [betaCode, setBetaCode] = useState("");
  // Stripe redirects back with a plain `?success=true` / `?canceled=true`
  // query string. TanStack's default search parser JSON-parses primitive
  // values, so these arrive as the boolean `true`, not the string "true" —
  // check for both so this survives either encoding.
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const success = search.success === true || search.success === "true";
  const canceled = search.canceled === true || search.canceled === "true";

  const { data: productsData, isLoading } = useQuery<{ success: boolean; data: StripeProduct[] }>({
    queryKey: ["/api/stripe/products"],
  });

  const products = productsData?.data || [];

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return response.json();
    },
    onSuccess: (data) => {
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
    onError: () => {
      toast({ title: "Failed to start checkout", variant: "destructive" });
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

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const defaultPlans = [
    {
      name: "Free",
      description: "Get started with basic GEO features",
      price: "$0",
      interval: "forever",
      features: [
        "1 brand profile",
        "5 AI-generated articles/month",
        "Auto-humanization included",
        "Basic GEO rankings",
        "Community support",
      ],
      cta: "Get Started",
      popular: false,
      tier: "free",
    },
    {
      name: "Pro",
      description: "For growing businesses and agencies",
      price: "$79",
      interval: "month",
      features: [
        "5 brand profiles",
        "40 AI-generated articles/month",
        "Auto-humanization & AI detection",
        "Full GEO rankings & analytics",
        "AI Intelligence dashboard",
        "Publication Intelligence",
        "Priority support",
      ],
      cta: "Start Free Trial",
      popular: true,
      tier: "pro",
    },
    {
      name: "Enterprise",
      description: "For large teams and enterprises",
      price: "$249",
      interval: "month",
      features: [
        "Everything in Pro",
        "Unlimited brand profiles",
        "200 AI-generated articles/month",
        "GEO AI Agent automation",
        "AI Traffic Analytics",
        "Custom integrations",
        "Dedicated account manager",
        "SSO & advanced security",
      ],
      cta: "Contact Sales",
      popular: false,
      tier: "enterprise",
    },
  ];

  return (
    // Mounted by src/routes/pricing.tsx, a server-rendered top-level route
    // (not under `_app`, which is ssr:false). Title/meta come from that
    // route's `head()` — this component renders none of its own, per the
    // project's "metadata belongs to the route" rule.
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
            data-testid="link-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
          </Link>
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
          <Badge className="mb-4 bg-muted text-muted-foreground hover:bg-muted">
            <Sparkles className="w-3 h-3 mr-1" /> Launch Pricing
          </Badge>
          <h1 className="text-4xl font-bold mb-4" data-testid="text-page-title">
            Choose Your GEO Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Optimize your brand's visibility in AI search engines with our comprehensive GEO
            platform
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12 max-w-5xl mx-auto">
          {(products.length > 0
            ? products.map((product, idx) => ({
                name: product.name,
                description: product.description || "",
                price: product.prices[0]
                  ? formatPrice(product.prices[0].unit_amount, product.prices[0].currency)
                  : "$0",
                interval: product.prices[0]?.recurring?.interval || "month",
                features: (product.metadata?.features || "").split(",").filter(Boolean),
                priceId: product.prices[0]?.id,
                popular: product.metadata?.popular === "true",
                tier: product.metadata?.tier || "pro",
              }))
            : defaultPlans
          ).map((plan, idx) => (
            <Card
              key={plan.name}
              className={`relative ${plan.popular ? "border-2 border-primary shadow-lg scale-105" : ""}`}
              data-testid={`pricing-card-${plan.name.toLowerCase()}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary">
                    <Crown className="w-3 h-3 mr-1" /> Most Popular
                  </Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/{plan.interval}</span>
                </div>
                <ul className="space-y-3 text-left">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-positive shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  // No bg override. The `default` variant rests as an accent
                  // TINT with accent-coloured label and only goes solid on
                  // hover; forcing `bg-primary` here repainted the background
                  // solid while leaving the label accent-blue, i.e. blue text
                  // on a blue fill — invisible. The popular plan is already
                  // distinguished by its ring, scale and "Most Popular" badge.
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  // Behaviour is driven by TIER first, then by price
                  // availability. It used to check `plan.priceId` first, which
                  // was harmless only while Stripe returned no products: the
                  // moment real products load (i.e. the moment billing goes
                  // live) every tier that has a price went straight to
                  // checkout — including Free, which would open a $0/month
                  // subscription instead of signing the visitor up, and
                  // Enterprise, whose button says "Contact Sales" but would
                  // have immediately charged $249/month.
                  onClick={() => {
                    if (plan.tier === "free") {
                      // Free is an account, not a purchase. Never route it
                      // through Checkout even though it has a $0 price object.
                      window.location.href = "/register";
                      return;
                    }
                    if ("priceId" in plan && plan.priceId) {
                      checkoutMutation.mutate(plan.priceId);
                      return;
                    }
                    toast({
                      title: "This plan isn't available for self-serve checkout yet.",
                      description: "Please contact us and we'll get you set up.",
                    });
                  }}
                  disabled={checkoutMutation.isPending}
                  data-testid={`button-subscribe-${plan.name.toLowerCase()}`}
                >
                  {checkoutMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {/* The label must describe what the button actually does.
                      Enterprise previously read "Contact Sales" while wired
                      to Checkout — a $249/month charge behind a button that
                      promises a conversation. It has a real, active price in
                      Stripe, so self-serve is honest; if you'd rather this be
                      sales-led, the fix is to give it its own branch above
                      (contact link) rather than to change this label back. */}
                  {plan.tier === "free"
                    ? "Get Started"
                    : "priceId" in plan && plan.priceId
                      ? "Subscribe"
                      : "Contact Sales"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
              <Gift className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>Have a Beta Invite Code?</CardTitle>
            <CardDescription>Enter your code to unlock beta access for free</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
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
          </CardContent>
        </Card>

        <div className="mt-16 text-center">
          <h3 className="text-xl font-semibold mb-4">Trusted by Leading Brands</h3>
          <p className="text-muted-foreground mb-8">
            Join hundreds of companies optimizing their AI search visibility
          </p>
          <div className="flex justify-center gap-8 flex-wrap opacity-50">
            <Users className="w-12 h-12" />
            <Zap className="w-12 h-12" />
            <Sparkles className="w-12 h-12" />
          </div>
        </div>
      </div>
    </div>
  );
}
