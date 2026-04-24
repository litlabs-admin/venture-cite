import { getStripeClient } from "./stripeClient";

export async function setupStripeProducts() {
  console.log("Setting up Stripe products...");

  const stripe = getStripeClient();

  const existingProducts = await stripe.products.list({ limit: 100, active: true });
  const validProducts = existingProducts.data.filter((p) => p.metadata?.tier);
  const productNames = validProducts.map((p) => p.name);

  console.log("Existing valid products:", productNames);

  if (!productNames.includes("Free")) {
    console.log("Creating Free tier...");
    const freeProduct = await stripe.products.create({
      name: "Free",
      description: "Get started with basic GEO features",
      metadata: {
        tier: "free",
        features:
          "1 brand profile,5 AI-generated articles/month,Auto-humanization included,Basic GEO rankings,Community support",
      },
    });
    await stripe.prices.create({
      product: freeProduct.id,
      unit_amount: 0,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log("Free tier created:", freeProduct.id);
  }

  if (!productNames.includes("Pro")) {
    console.log("Creating Pro tier ($79/mo)...");
    const proProduct = await stripe.products.create({
      name: "Pro",
      description: "For growing businesses and agencies",
      metadata: {
        tier: "pro",
        popular: "true",
        features:
          "5 brand profiles,40 AI-generated articles/month,Auto-humanization & AI detection,Full GEO rankings & analytics,AI Intelligence dashboard,Publication Intelligence,Priority support",
      },
    });
    await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 7900,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log("Pro tier created:", proProduct.id);
  }

  if (!productNames.includes("Enterprise")) {
    console.log("Creating Enterprise tier ($249/mo)...");
    const enterpriseProduct = await stripe.products.create({
      name: "Enterprise",
      description: "For large teams and enterprises",
      metadata: {
        tier: "enterprise",
        features:
          "Everything in Pro,Unlimited brand profiles,200 AI-generated articles/month,GEO AI Agent automation,AI Traffic Analytics,Custom integrations,Dedicated account manager,SSO & advanced security",
      },
    });
    await stripe.prices.create({
      product: enterpriseProduct.id,
      unit_amount: 24900,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log("Enterprise tier created:", enterpriseProduct.id);
  }

  console.log("Product setup complete.");
}
