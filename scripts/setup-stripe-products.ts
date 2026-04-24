import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function createProducts() {
  console.log("Creating Stripe products...\n");

  // Create Free tier
  console.log("1. Creating Free tier...");
  const freeProduct = await stripe.products.create({
    name: "Free",
    description: "Get started with basic GEO features",
    metadata: { tier: "free" },
  });
  const freePrice = await stripe.prices.create({
    product: freeProduct.id,
    unit_amount: 0,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { tier: "free" },
  });
  console.log(`   Product: ${freeProduct.id}`);
  console.log(`   Price: ${freePrice.id}\n`);

  // Create Pro tier
  console.log("2. Creating Pro tier ($79/mo)...");
  const proProduct = await stripe.products.create({
    name: "Pro",
    description: "For growing businesses and agencies",
    metadata: { tier: "pro" },
  });
  const proPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 7900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { tier: "pro" },
  });
  console.log(`   Product: ${proProduct.id}`);
  console.log(`   Price: ${proPrice.id}\n`);

  // Create Enterprise tier
  console.log("3. Creating Enterprise tier ($249/mo)...");
  const enterpriseProduct = await stripe.products.create({
    name: "Enterprise",
    description: "For large teams and enterprises",
    metadata: { tier: "enterprise" },
  });
  const enterprisePrice = await stripe.prices.create({
    product: enterpriseProduct.id,
    unit_amount: 24900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { tier: "enterprise" },
  });
  console.log(`   Product: ${enterpriseProduct.id}`);
  console.log(`   Price: ${enterprisePrice.id}\n`);

  console.log("All products created successfully!");
  console.log("\nProducts will sync to your app via stripe-replit-sync.");
}

createProducts().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
