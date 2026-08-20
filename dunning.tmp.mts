// Drives the dunning / SCA journeys against real (test-mode) Stripe.
// The webhooks land on the local server via `stripe listen`.
// Usage: npx tsx <this> <step> [arg]
import "dotenv/config";
import { supabaseAdmin } from "./server/supabase";
import { db } from "./server/db";
import { getStripeClient } from "./server/stripeClient";
import { sql } from "drizzle-orm";

const EMAIL = process.env.JOURNEY_EMAIL || "dunning@example.com";
const stripe = getStripeClient();

async function priceFor(tier: string) {
  const prods = await stripe.products.list({ limit: 100, active: true });
  const p = prods.data.find((x) => x.metadata?.tier === tier);
  if (!p) throw new Error(`no product for tier ${tier}`);
  const prices = await stripe.prices.list({ product: p.id, active: true, limit: 5 });
  return prices.data[0];
}

async function findUser() {
  const r = (await db.execute(sql`SELECT * FROM users WHERE email = ${EMAIL}`)) as {
    rows: Record<string, unknown>[];
  };
  return r.rows[0] ?? null;
}

async function reset() {
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  for (const u of list.users) {
    if (u.email !== EMAIL) continue;
    const row = (await db.execute(
      sql`SELECT stripe_customer_id FROM users WHERE id=${u.id}`,
    )) as { rows: { stripe_customer_id?: string }[] };
    const cust = row.rows[0]?.stripe_customer_id;
    if (cust) {
      const subs = await stripe.subscriptions.list({ customer: cust, status: "all", limit: 20 });
      for (const s of subs.data) {
        if (s.status !== "canceled") await stripe.subscriptions.cancel(s.id).catch(() => {});
      }
      await stripe.customers.del(cust).catch(() => {});
    }
    await db.execute(sql`DELETE FROM brands WHERE user_id=${u.id}`);
    await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id=${u.id}`);
  }
  console.log("reset: clean");
}

async function signup() {
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: EMAIL,
    password: process.env.JOURNEY_PASSWORD || "Journey!12345",
    email_confirm: true,
    user_metadata: { firstName: "Dunning", lastName: "Test" },
  });
  if (error && !/already/i.test(error.message)) throw new Error(error.message);
  const u = await findUser();
  console.log(JSON.stringify({ step: "signup", tier: u?.access_tier }));
}

/**
 * Subscribe with a card chosen to fail a specific way.
 *   fail = pm_card_chargeCustomerFail      -> attaches, then every charge declines (dunning)
 *   sca  = pm_card_authenticationRequired  -> 3DS challenge, invoice sits unpaid
 * The trial is skipped so the very first invoice is charged for real.
 */
async function subscribe(kind: "fail" | "sca") {
  const pmId = kind === "sca" ? "pm_card_authenticationRequired" : "pm_card_chargeCustomerFail";
  const u = await findUser();
  if (!u) throw new Error("run signup first");
  const price = await priceFor("pro");
  const customer = await stripe.customers.create({
    email: EMAIL,
    metadata: { userId: String(u.id) },
  });
  // Attaching a shared test PM alias mints a NEW payment method; the alias
  // itself is never attached, so the returned id is the only usable one.
  const attached = await stripe.paymentMethods.attach(pmId, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: attached.id },
  });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    payment_behavior: "allow_incomplete",
    metadata: { userId: String(u.id) },
  });
  await db.execute(sql`
    UPDATE users SET stripe_customer_id=${customer.id}, stripe_subscription_id=${sub.id},
      access_tier='pro' WHERE id=${u.id}`);
  console.log(JSON.stringify({ step: `subscribe:${kind}`, status: sub.status, sub: sub.id }));
}

/** Subscribe on a good card WITH a trial, then end the trial so it charges now. */
async function trialThenFail() {
  const u = await findUser();
  if (!u) throw new Error("run signup first");
  const price = await priceFor("pro");
  const customer = await stripe.customers.create({
    email: EMAIL,
    metadata: { userId: String(u.id) },
  });
  const attached = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: attached.id },
  });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_period_days: 14,
    metadata: { userId: String(u.id) },
  });
  await db.execute(sql`
    UPDATE users SET stripe_customer_id=${customer.id}, stripe_subscription_id=${sub.id},
      access_tier='pro', trial_ends_at=${new Date(sub.trial_end! * 1000)} WHERE id=${u.id}`);
  console.log(JSON.stringify({ step: "trial", status: sub.status }));
  // Ending the trial now is what a real renewal does: finalize an invoice and
  // charge the card on file. The card declines, so this is the dunning entry.
  const ended = await stripe.subscriptions.update(sub.id, { trial_end: "now" });
  console.log(JSON.stringify({ step: "trial-ended", status: ended.status }));
}

/** Subscribe on a working card, with the trial intact. */
async function good() {
  const u = await findUser();
  if (!u) throw new Error("run signup first");
  const price = await priceFor("pro");
  const customer = await stripe.customers.create({
    email: EMAIL,
    metadata: { userId: String(u.id) },
  });
  const attached = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: attached.id },
  });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_period_days: 14,
    metadata: { userId: String(u.id) },
  });
  await db.execute(sql`
    UPDATE users SET stripe_customer_id=${customer.id}, stripe_subscription_id=${sub.id},
      access_tier='pro', trial_ends_at=${new Date(sub.trial_end! * 1000)} WHERE id=${u.id}`);
  console.log(JSON.stringify({ step: "good", status: sub.status }));
}

/** Force the trial to convert now, so the renewal charge happens immediately. */
async function endTrial() {
  const u = await findUser();
  const cust = u?.stripe_customer_id as string | undefined;
  if (!cust) throw new Error("no stripe customer - subscribe first");
  const subs = await stripe.subscriptions.list({ customer: cust, status: "all", limit: 10 });
  const sub = subs.data.find((s) => s.status === "trialing");
  if (!sub) throw new Error("no trialing subscription");
  const ended = await stripe.subscriptions.update(sub.id, { trial_end: "now" });
  console.log(JSON.stringify({ step: "end-trial", status: ended.status }));
}

async function state() {
  const u = await findUser();
  const cust = u?.stripe_customer_id as string | undefined;
  if (!cust) {
    console.log(JSON.stringify({ tier: u?.access_tier ?? null, subscription: null }));
    return;
  }
  const subs = await stripe.subscriptions.list({ customer: cust, status: "all", limit: 5 });
  const invs = await stripe.invoices.list({ customer: cust, limit: 10 });
  console.log(
    JSON.stringify(
      {
        tier: u!.access_tier,
        subscriptions: subs.data.map((s) => ({ status: s.status, id: s.id })),
        invoices: invs.data.map((i) => ({
          status: i.status,
          due: i.amount_due,
          attempts: i.attempt_count,
          nextAttempt: i.next_payment_attempt,
        })),
      },
      null,
      1,
    ),
  );
}

const steps: Record<string, () => Promise<void>> = {
  reset,
  signup,
  fail: () => subscribe("fail"),
  sca: () => subscribe("sca"),
  trialThenFail,
  good,
  endTrial,
  state,
};
const step = process.argv[2];
if (!steps[step]) {
  console.error("unknown step:", step, "-", Object.keys(steps).join("|"));
  process.exit(1);
}
await steps[step]();

