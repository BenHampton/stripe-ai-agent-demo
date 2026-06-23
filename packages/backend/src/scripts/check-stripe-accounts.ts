import { stripe } from '../services/stripe.js';

// Looks up each seed persona by email and prints their cus_... id + subscription
// status. Use this after seeding (or any time) to grab the IDs for the frontend
// customer list without digging through the Stripe dashboard or re-running the seed.
// Run with: pnpm --filter @sai/backend check:stripe
const SEED_CUSTOMERS = [
    { email: 'alice@example.com', label: 'Alice (happy Pro)' },
    { email: 'bob@example.com',   label: 'Bob (at-risk Starter)' },
    { email: 'carol@example.com', label: 'Carol (payment failure)' },
    { email: 'dave@example.com',  label: 'Dave (Enterprise refund)' },
] as const;

async function check() {
    console.log('Checking seed customers in Stripe...\n');

    for (const { email, label } of SEED_CUSTOMERS) {
        const found = await stripe.customers.list({ email, limit: 1 });
        const customer = found.data[0];

        if (!customer) {
            console.log(`  ✗ ${label}: NOT FOUND (run: pnpm seed:stripe)`);
            continue;
        }

        // Also report subscription status so you can confirm it's active (demo-ready)
        const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 1 });
        const sub = subs.data[0];
        const status = sub ? sub.status : 'no subscription';

        console.log(`  ✓ ${label}`);
        console.log(`      id:   ${customer.id}`);
        console.log(`      sub:  ${status}`);
    }
}

check().catch((err) => {
    console.error('Check failed:', err);
    process.exit(1);
});