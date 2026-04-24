import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, ShoppingCart, TrendingUp, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Brand, PurchaseEvent } from "@shared/schema";

interface RevenueAnalytics {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  platformBreakdown: Record<string, { orders: number; revenue: number }>;
  recentPurchases: PurchaseEvent[];
}

export default function RevenueAnalytics() {
  const [selectedBrand, setSelectedBrand] = useState<string>("all");

  const { data: brandsResponse } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const { data: revenueData, isLoading } = useQuery<{ success: boolean; data: RevenueAnalytics }>({
    queryKey: ["/api/revenue/analytics", selectedBrand !== "all" ? selectedBrand : undefined],
    queryFn: async () => {
      const url =
        selectedBrand !== "all"
          ? `/api/revenue/analytics?brandId=${selectedBrand}`
          : "/api/revenue/analytics";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const brands = brandsResponse?.data || [];
  const analytics = revenueData?.data;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  return (
    <div className="space-y-8">
      <Helmet>
        <title>Revenue Analytics - VentureCite</title>
      </Helmet>
      <PageHeader
        title="Revenue Analytics"
        description="Track AI-driven purchases from ChatGPT, Claude & more"
        actions={
          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger className="w-[200px]" data-testid="select-brand-filter">
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card data-testid="card-total-revenue">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-revenue">
                  {formatCurrency(analytics?.totalRevenue || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">From AI chat purchases</p>
              </CardContent>
            </Card>

            <Card data-testid="card-total-orders">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-orders">
                  {formatNumber(analytics?.totalOrders || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Conversions tracked</p>
              </CardContent>
            </Card>

            <Card data-testid="card-avg-order-value">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-order-value">
                  {formatCurrency(analytics?.avgOrderValue || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Per purchase</p>
              </CardContent>
            </Card>

            <Card data-testid="card-ai-platforms">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Platforms</CardTitle>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-platform-count">
                  {Object.keys(analytics?.platformBreakdown || {}).length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Driving sales</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="platform-breakdown" className="space-y-6">
            <TabsList>
              <TabsTrigger value="platform-breakdown" data-testid="tab-platform-breakdown">
                Platform Breakdown
              </TabsTrigger>
              <TabsTrigger value="recent-purchases" data-testid="tab-recent-purchases">
                Recent Purchases
              </TabsTrigger>
            </TabsList>

            <TabsContent value="platform-breakdown" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by AI Platform</CardTitle>
                  <CardDescription>See which AI platforms drive the most revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.entries(analytics?.platformBreakdown || {}).length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No purchases tracked yet</p>
                      <p className="text-sm mt-2">
                        Connect your e-commerce platform to start tracking AI-driven sales
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(analytics?.platformBreakdown || {})
                        .sort(([, a], [, b]) => b.revenue - a.revenue)
                        .map(([platform, data]) => (
                          <div
                            key={platform}
                            className="flex items-center justify-between p-4 border rounded-lg"
                            data-testid={`platform-${platform.toLowerCase()}`}
                          >
                            <div>
                              <h3 className="font-semibold">{platform}</h3>
                              <p className="text-sm text-muted-foreground">
                                {data.orders} {data.orders === 1 ? "order" : "orders"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold">{formatCurrency(data.revenue)}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatCurrency(data.revenue / data.orders)} avg
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recent-purchases" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Purchases</CardTitle>
                  <CardDescription>Latest AI-driven purchases from your content</CardDescription>
                </CardHeader>
                <CardContent>
                  {(analytics?.recentPurchases || []).length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No recent purchases</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analytics?.recentPurchases.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          data-testid={`purchase-${purchase.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{purchase.productName || "Product"}</h3>
                              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                                {purchase.aiPlatform}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {purchase.ecommercePlatform} • {purchase.quantity}x •{" "}
                              {new Date(purchase.purchasedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{formatCurrency(Number(purchase.revenue))}</p>
                            <p className="text-xs text-muted-foreground">{purchase.currency}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Setup Instructions</CardTitle>
              <CardDescription>
                Connect your e-commerce platform to track AI-driven purchases
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Webhook Endpoints:</h3>
                <div className="space-y-2 text-sm font-mono bg-muted p-4 rounded-lg">
                  <p>
                    <strong>Shopify:</strong> POST /webhooks/shopify/orders
                  </p>
                  <p>
                    <strong>Stripe:</strong> POST /webhooks/stripe/checkout
                  </p>
                  <p>
                    <strong>Generic:</strong> POST /webhooks/ecommerce/purchase
                  </p>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Attribution Setup:</h3>
                <p className="text-sm text-muted-foreground">
                  Include article_id and brand_id in order metadata or URL parameters to track which
                  content drives sales.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
