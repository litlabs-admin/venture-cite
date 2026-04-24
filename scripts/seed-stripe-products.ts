import { getUncachableStripeClient } from "../server/stripeClient";

async function seedProducts() {
  console.log("Creating Stripe products and prices...");

  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.search({ query: "active:'true'" });
  if (existingProducts.data.length > 0) {
    console.log("Products already exist:", existingProducts.data.map((p) => p.name).join(", "));
    console.log("Skipping creation. Delete existing products in Stripe Dashboard to recreate.");
    return;
  }

  const proProduct = await stripe.products.create({
    name: "GEO Pro",
    description: "Professional GEO optimization for growing businesses",
    metadata: {
      tier: "pro",
      popular: "true",
      features:
        "Unlimited brand profiles,50 AI-generated articles/month,Full GEO rankings & analytics,AI Intelligence dashboard,Publication Intelligence,Priority support",
    },
  });

  await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 4900,
    currency: "usd",
    recurring: { interval: "month" },
  });

  console.log("Created Pro product:", proProduct.id);

  const enterpriseProduct = await stripe.products.create({
    name: "GEO Enterprise",
    description: "Enterprise-grade GEO optimization for large teams",
    metadata: {
      tier: "enterprise",
      popular: "false",
      features:
        "Everything in Pro,Unlimited articles,GEO AI Agent automation,AI Traffic Analytics,Custom integrations,Dedicated account manager,SSO & advanced security",
    },
  });

  await stripe.prices.create({
    product: enterpriseProduct.id,
    unit_amount: 19900,
    currency: "usd",
    recurring: { interval: "month" },
  });

  console.log("Created Enterprise product:", enterpriseProduct.id);
  console.log("Done! Products will sync to database automatically.");
}

seedProducts().catch(console.error);
