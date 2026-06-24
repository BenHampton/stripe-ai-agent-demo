import { stripe } from '../services/stripe.js';

const SEED_CUSTOMERS = [
    { email: 'alice@example.com', label: 'Alice' },
    { email: 'bob@example.com',   label: 'Bob' },
    { email: 'carol@example.com', label: 'Carol' },
    { email: 'dave@example.com',  label: 'Dave' },
] as const;

const PRICE_LOOKUP_KEYS = ['starter_monthly', 'pro_monthly', 'enterprise_monthly'];

async function clear() {
    console.log('🧹 Clearing Stripe test data...\n');

    // 1. Delete customers (cascades subscriptions, invoices, payment methods)
    console.log('Deleting customers...');
    for (const { email, label } of SEED_CUSTOMERS) {
        const found = await stripe.customers.list({ email, limit: 1 });
        const customer = found.data[0];

        if (!customer) {
            console.log(`  – ${label}: not found, skipping`);
            continue;
        }

        await stripe.customers.del(customer.id);
        console.log(`  ✓ ${label} (${customer.id}) deleted`);
    }

    // 2. Archive prices and delete their products
    console.log('\nArchiving prices and deleting products...');
    const prices = await stripe.prices.list({ lookup_keys: PRICE_LOOKUP_KEYS, limit: 10 });

    for (const price of prices.data) {
        await stripe.prices.update(price.id, { active: false });
        console.log(`  ✓ Price ${price.id} (${price.nickname ?? price.lookup_key}) archived`);

        const productId = typeof price.product === 'string' ? price.product : price.product?.id;
        if (productId) {
            try {
                await stripe.products.del(productId);
                console.log(`  ✓ Product ${productId} deleted`);
            } catch (err: any) {
                console.log(`  – Product ${productId}: ${err.message}`);
            }
        }
    }

    if (prices.data.length === 0) {
        console.log('  – No seed prices found, skipping');
    }

    // 3. Delete retention coupon
    console.log('\nDeleting coupon...');
    try {
        await stripe.coupons.del('RETENTION20');
        console.log('  ✓ RETENTION20 deleted');
    } catch (err: any) {
        console.log(`  – RETENTION20: ${err.message}`);
    }

    console.log('\n✅ Clear complete. Run pnpm seed:stripe to re-seed.');
}

clear().catch((err) => {
    console.error('Clear failed:', err);
    process.exit(1);
});
