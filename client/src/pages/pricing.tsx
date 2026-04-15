import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Helmet } from "react-helmet";
import { Link, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  ArrowLeft,
  Sparkles,
  Crown,
  Zap,
  Users,
  Gift,
  Loader2
} from "lucide-react";

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
  const searchString = window.location.search;
  const success = searchString.includes("success=true");
  const canceled = searchString.includes("canceled=true");

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
      if (data.url) {
        window.location.href = data.url;
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
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
        "Community support"
      ],
      cta: "Get Started",
      popular: false,
      tier: "free"
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
        "Priority support"
      ],
      cta: "Start Free Trial",
      popular: true,
      tier: "pro"
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
        "SSO & advanced security"
      ],
      cta: "Contact Sales",
      popular: false,
      tier: "enterprise"
    }
  ];

  return (
    <>
      <Helmet>
        <title>Pricing - GEO Platform</title>
        <meta name="description" content="Choose the right plan for your GEO optimization needs. Free, Pro, and Enterprise options available." />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
            </Link>
          </div>

          {success && (
            <div className="mb-8 p-4 bg-green-100 border border-green-300 rounded-lg text-center">
              <Check className="w-6 h-6 inline mr-2 text-green-600" />
              <span className="text-green-800 font-medium">Payment successful! Your subscription is now active.</span>
            </div>
          )}

          {canceled && (
            <div className="mb-8 p-4 bg-yellow-100 border border-yellow-300 rounded-lg text-center">
              <span className="text-yellow-800 font-medium">Checkout was canceled. No charges were made.</span>
            </div>
          )}

          <div className="text-center mb-12">
            <Badge className="mb-4 bg-purple-100 text-purple-700 hover:bg-purple-100">
              <Sparkles className="w-3 h-3 mr-1" /> Launch Pricing
            </Badge>
            <h1 className="text-4xl font-bold mb-4" data-testid="text-page-title">
              Choose Your GEO Plan
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Optimize your brand's visibility in AI search engines with our comprehensive GEO platform
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12 max-w-5xl mx-auto">
            {(products.length > 0 ? products.map((product, idx) => ({
              name: product.name,
              description: product.description || "",
              price: product.prices[0] ? formatPrice(product.prices[0].unit_amount, product.prices[0].currency) : "$0",
              interval: product.prices[0]?.recurring?.interval || "month",
              features: (product.metadata?.features || "").split(",").filter(Boolean),
              priceId: product.prices[0]?.id,
              popular: product.metadata?.popular === "true",
              tier: product.metadata?.tier || "pro"
            })) : defaultPlans).map((plan, idx) => (
              <Card 
                key={plan.name} 
                className={`relative ${plan.popular ? 'border-2 border-purple-500 shadow-lg scale-105' : ''}`}
                data-testid={`pricing-card-${plan.name.toLowerCase()}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-500">
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
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button 
                    className={`w-full ${plan.popular ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => {
                      if ((plan as any).priceId) {
                        checkoutMutation.mutate((plan as any).priceId);
                      } else if (plan.tier === "free") {
                        window.location.href = "/";
                      } else {
                        toast({ title: "Products not configured yet. Please set up Stripe products." });
                      }
                    }}
                    disabled={checkoutMutation.isPending}
                    data-testid={`button-subscribe-${plan.name.toLowerCase()}`}
                  >
                    {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {plan.tier === "free" ? "Get Started" : plan.tier === "enterprise" ? "Contact Sales" : "Start Free Trial"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-2">
                <Gift className="w-6 h-6 text-white" />
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
                  {betaCodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redeem"}
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
    </>
  );
}
