# Demo Notes & Stripe CLI Cheatsheet

Operator reference for running and debugging the `stripe-ai-agent-demo`. Keep this
open in a side window while you demo or debug.

---

## Fresh-start checklist

A clean, demo-ready environment from scratch:

1. **Clear Stripe test data** (Dashboard → test mode → delete test customers/products),
   or use a throwaway test account. *(The seed is not idempotent — re-running without
   clearing first creates duplicates and the coupon step will error.)*
2. **Seed Stripe:**
   ```bash
   pnpm --filter @sai/backend seed:stripe
   ```
3. **Grab the customer IDs** and confirm everyone is active:
   ```bash
   pnpm --filter @sai/backend check:stripe
   ```
4. **Wire the IDs into the frontend** — paste each `cus_...` into the demo customer
   list in `packages/frontend/src/store/auth.tsx` (replace the `*_CUSTOMER_ID`
   placeholders).
5. **Clear stale browser state** — in DevTools console on the app tab:
   ```js
   localStorage.removeItem('sai-auth');
   localStorage.removeItem('agent_token');
   localStorage.removeItem('customer_id');
   ```
   Then reload and re-select a customer.
6. **Run the app** (separate terminals):
   ```bash
   pnpm --filter @sai/backend dev
   pnpm --filter @sai/frontend dev
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

---

## The demo personas

| Persona | State | What to demo | How to drive it |
|---|---|---|---|
| **Alice** | Active Pro subscriber, no issues | Normal Q&A: "what is my subscription?", "show my invoices" | Just chat |
| **Bob** | Active Starter, `cancel_at_period_end` | Retention: "I want to cancel" → save offer (RETENTION20 coupon) | Just chat |
| **Carol** | Customer w/ failing card, **no subscription** | Autonomous failed-payment → dunning/notification flow | `stripe trigger payment_intent.payment_failed` |
| **Dave** | Active Enterprise subscriber | Human-in-the-loop: "I want a full refund" → exceeds limit → approval queue | Chat, then check **Approvals** tab |

> Note: Carol intentionally has **no subscription** — her scenario is webhook-driven,
> not subscription-management. `check:stripe` showing `no subscription` for her is correct.

---

## Stripe CLI cheatsheet

### Webhooks (most useful — run in a side terminal)

```bash
# Forward Stripe events to your local backend AND print them live.
# Also prints the signing secret for STRIPE_WEBHOOK_SECRET.
stripe listen --forward-to localhost:3000/webhooks/stripe
```

### Inspecting seed data

```bash
# Customers: id + email + name
stripe customers list --limit 10 | jq -r '.data[] | "\(.id)  \(.email)  \(.name)"'

# Find one customer by email
stripe customers list --email alice@example.com | jq -r '.data[].id'

# A customer's subscriptions: id + status + plan
stripe subscriptions list --customer cus_XXX \
  | jq -r '.data[] | "\(.id)  \(.status)  \(.items.data[0].price.nickname)"'

# A customer's invoices: id + status + amount
stripe invoices list --customer cus_XXX \
  | jq -r '.data[] | "\(.id)  \(.status)  \(.amount_due)"'

# Full detail on one object
stripe customers retrieve cus_XXX
stripe subscriptions retrieve sub_XXX
stripe invoices retrieve in_XXX
```

### Triggering events (exercise webhook handlers)

```bash
stripe trigger payment_intent.payment_failed       # Carol's failed-payment demo
stripe trigger payment_intent.succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
stripe trigger customer.subscription.updated
stripe trigger charge.refunded
stripe trigger charge.dispute.created              # dispute flow

stripe trigger --help                              # see all triggerable events
```

### Fixing / activating subscription state

```bash
# Pay an open invoice (activates an 'incomplete' subscription)
stripe invoices pay in_XXX

# Create an active subscription manually (note the -d items syntax)
stripe subscriptions create --customer cus_XXX -d "items[0][price]=price_XXX"

# Cancel a subscription
stripe subscriptions cancel sub_XXX

# Find a price by lookup key
stripe prices list --lookup-keys pro_monthly | jq -r '.data[].id'
```

### Refunds (Dave's approval-queue scenario)

```bash
# List a customer's charges (find one to refund)
stripe charges list --customer cus_XXX | jq -r '.data[] | "\(.id)  \(.amount)  \(.status)"'

# Issue / list refunds
stripe refunds create --charge ch_XXX
stripe refunds list --charge ch_XXX
```

### Account & request debugging

```bash
# Which account + mode are you in? (test vs live — check this first when things 404)
stripe config --list

# Tail API requests Stripe RECEIVES from your backend.
# Use to answer "did my tool call even reach Stripe?"
stripe logs tail

# Recent events Stripe has EMITTED
stripe events list --limit 10 | jq -r '.data[] | "\(.type)  \(.id)"'

# Replay a specific event to your webhook
stripe events resend evt_XXX
```

---

## Debugging gotchas

- **`stripe logs tail` vs `stripe listen`** — different directions.
  `listen` = webhook events going *out* (and forwarded to you).
  `logs tail` = API requests coming *in* to Stripe from your backend.
  For "did my `get_customer` tool actually call Stripe?", use `logs tail`.

- **Test vs live mode** — most "No such customer: cus_XXX" errors are really
  "querying the wrong mode." Seed data is test-mode. Confirm with `stripe config --list`.

- **`-d "items[0][price]=..."`** — the CLI syntax for nested params. The JSON-string
  form is finicky across shells/versions; prefer this.

- **`jq` not installed?** `brew install jq`. Or drop the `| jq ...` for raw JSON.

- **Subscriptions stuck `incomplete`?** They need the first invoice paid. The seed's
  `createActiveSubscription` helper does this automatically; for a manually-created one,
  `stripe invoices pay in_XXX`.

- **Agent says "no active subscription" but one exists?** Check its *status* —
  `incomplete`/`past_due` is not `active`. `get_customer` expands subscriptions, so the
  data is there; the model is reporting the status accurately.

---

## App-side debugging

- **Backend logs** (structured, via pino) show the agent lifecycle:
  `triage complete` → `dispatching to specialist` → `agent run started` →
  `agent requested tools` / `agent ended turn` → `tool succeeded` / `tool execution threw`.
  If a tool isn't behaving, this tells you whether the model called it and what happened.

- **`tool input failed schema validation`** in the logs usually means a bad ID format
  (e.g. a customer ID that isn't a real `cus_...` — check the frontend customer list).

- **Frontend SSE stream** — browser DevTools → Network → the `/api/chat/stream` request →
  EventStream/Response tab shows the raw `token` / `tool_start` / `tool_blocked` / `done`
  events as they arrive. Useful for diagnosing streaming/render issues.

- **Reset conversation data** for a clean slate (keeps the knowledge base):
  ```sql
  TRUNCATE messages, agent_traces, pending_approvals, workflows, conversations
    RESTART IDENTITY CASCADE;
  ```
