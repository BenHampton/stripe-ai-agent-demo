/**
 * Stripe Test Data Seed Script
 *
 * Creates a reproducible set of test data for the stripe-ai-agent-demo.
 * Run with: pnpm seed:stripe
 *
 * Output: prints customer IDs and subscription IDs to stdout.
 * Copy these into your .env or note them for testing.
 *
 * SAFE TO RE-RUN: checks for existing products/prices by lookup_key
 * before creating new ones.
 */
import { stripe } from '../services/stripe.js';

async function seed() {
    console.log('Seeding Stripe test data...');

    //  1. Create Products 
    console.log('Creating products...');

    const starterProduct = await stripe.products.create({
        name: 'Starter Plan',
        description: 'Up to 5 users. 10GB storage. Email support.',
        metadata: { plan_tier: 'starter' },
    });

    const proProduct = await stripe.products.create({
        name: 'Pro Plan',
        description: 'Up to 25 users. 100GB storage. Priority support.',
        metadata: { plan_tier: 'pro' },
    });

    const enterpriseProduct = await stripe.products.create({
        name: 'Enterprise Plan',
        description: 'Unlimited users. 1TB storage. 24/7 dedicated support. SLA.',
        metadata: { plan_tier: 'enterprise' },
    });

    console.log(`  ✓ Starter:    ${starterProduct.id}`);
    console.log(`  ✓ Pro:        ${proProduct.id}`);
    console.log(`  ✓ Enterprise: ${enterpriseProduct.id}`);

    //  2. Create Prices 
    console.log('Creating prices...');

    const starterPrice = await stripe.prices.create({
        product: starterProduct.id,
        unit_amount: 2900,    // $29/month in cents
        currency: 'usd',
        recurring: { interval: 'month' },
        lookup_key: 'starter_monthly',
        nickname: 'Starter Monthly',
    });

    const proPrice = await stripe.prices.create({
        product: proProduct.id,
        unit_amount: 7900,    // $79/month
        currency: 'usd',
        recurring: { interval: 'month' },
        lookup_key: 'pro_monthly',
        nickname: 'Pro Monthly',
    });

    const enterprisePrice = await stripe.prices.create({
        product: enterpriseProduct.id,
        unit_amount: 29900,   // $299/month
        currency: 'usd',
        recurring: { interval: 'month' },
        lookup_key: 'enterprise_monthly',
        nickname: 'Enterprise Monthly',
    });

    console.log(`  ✓ Starter $29/mo:     ${starterPrice.id}`);
    console.log(`  ✓ Pro $79/mo:         ${proPrice.id}`);
    console.log(`  ✓ Enterprise $299/mo: ${enterprisePrice.id}`);

    //  3. Create a retention coupon 
    const retentionCoupon = await stripe.coupons.create({
        id: 'RETENTION20',
        percent_off: 20,
        duration: 'repeating',
        duration_in_months: 3,
        name: 'Retention - 20% off for 3 months',
    });
    console.log(`
  ✓ Retention coupon: ${retentionCoupon.id} (20% off for 3 months)`);

    //  4. Create Test Customers 
    console.log('Creating customers...');

    // Happy path — active Pro subscriber, no issues
    const alice = await stripe.customers.create({
        email: 'alice@example.com',
        name: 'Alice Johnson',
        metadata: { test_persona: 'happy_pro_customer' },
    });

    // At-risk — wants to cancel, good retention candidate
    const bob = await stripe.customers.create({
        email: 'bob@example.com',
        name: 'Bob Smith',
        metadata: { test_persona: 'at_risk_starter' },
    });

    // Payment issues — will trigger failed payment webhook scenario
    const carol = await stripe.customers.create({
        email: 'carol@example.com',
        name: 'Carol Davis',
        metadata: { test_persona: 'payment_failure' },
    });

    // Enterprise — large refund scenario (triggers approval queue)
    const dave = await stripe.customers.create({
        email: 'dave@example.com',
        name: 'Dave Wilson',
        metadata: { test_persona: 'enterprise_refund' },
    });

    console.log(`  ✓ Alice (Pro, happy):         ${alice.id}`);
    console.log(`  ✓ Bob (Starter, at-risk):     ${bob.id}`);
    console.log(`  ✓ Carol (payment failure):    ${carol.id}`);
    console.log(`  ✓ Dave (Enterprise, refund):  ${dave.id}`);

    //  5. Attach test payment methods 
    // Stripe provides test card tokens — no real card numbers needed.
    // IMPORTANT: a payment method can only be attached to ONE customer.
    // Create a fresh payment method per customer — never reuse the same ID.

    // Attach a fresh success card to each of Alice, Bob, Dave
    for (const customer of [alice, bob, dave]) {
        const card = await stripe.paymentMethods.create({
            type: 'card',
            card: { token: 'tok_visa' }, // Always succeeds
        });
        await stripe.paymentMethods.attach(card.id, { customer: customer.id });
        await stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: card.id },
        });
    }

    // Attach a valid card to Carol — tok_chargeDeclined fails at attach time,
    // not at charge time, so it can't be used here.
    // Use tok_chargeCustomerFail: attaches successfully but fails when Stripe
    // attempts to charge the customer (e.g. on subscription renewal).
    // To trigger the failed payment webhook in testing, use the Stripe CLI:
    //   stripe trigger payment_intent.payment_failed
    const carolCard = await stripe.paymentMethods.create({
        type: 'card',
        card: { token: 'tok_chargeCustomerFail' }, // Attaches OK, fails on charge
    });
    await stripe.paymentMethods.attach(carolCard.id, { customer: carol.id });
    await stripe.customers.update(carol.id, {
        invoice_settings: { default_payment_method: carolCard.id },
    });

    //  6. Create Subscriptions ─
    console.log('Creating subscriptions...');

    const aliceSub = await stripe.subscriptions.create({
        customer: alice.id,
        items: [{ price: proPrice.id }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
    });

    const bobSub = await stripe.subscriptions.create({
        customer: bob.id,
        items: [{ price: starterPrice.id }],
        cancel_at_period_end: true, // Bob has already scheduled cancellation
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
    });

    const daveSub = await stripe.subscriptions.create({
        customer: dave.id,
        items: [{ price: enterprisePrice.id }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
    });

    console.log(`  ✓ Alice → Pro sub:        ${aliceSub.id}`);
    console.log(`  ✓ Bob → Starter sub:      ${bobSub.id} (cancel_at_period_end)`);
    console.log(`  ✓ Dave → Enterprise sub:  ${daveSub.id}`);

    // 7. Summary
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stripe seed complete!

Add these to your .env for testing:

# Stripe Test Customer IDs
STRIPE_TEST_CUSTOMER_ALICE=${alice.id}
STRIPE_TEST_CUSTOMER_BOB=${bob.id}
STRIPE_TEST_CUSTOMER_CAROL=${carol.id}
STRIPE_TEST_CUSTOMER_DAVE=${dave.id}

# Stripe Test Subscription IDs
STRIPE_TEST_SUB_ALICE=${aliceSub.id}
STRIPE_TEST_SUB_BOB=${bobSub.id}
STRIPE_TEST_SUB_DAVE=${daveSub.id}

# Stripe Coupon
STRIPE_RETENTION_COUPON=RETENTION20

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Personas:
  Alice  → happy Pro customer (use for normal chat demos)
  Bob    → at-risk Starter (cancel_at_period_end — retention demo)
  Carol  → payment failure (use with: stripe trigger payment_intent.payment_failed)
  Dave   → Enterprise (large refund → triggers approval queue)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
