---
title: "Cancellation Policy"
category: "policies"
version: "1.1"
last_updated: "2025-01-15"
description: "How cancellations work, the difference between immediate and end-of-period cancellation, data retention, and reactivation."
---

# Cancellation Policy

Customers can cancel at any time through support chat or billing settings. This
document defines the two cancellation modes, what happens to customer data, and how
reactivation works. The agent can cancel directly via Stripe — customers are never
told to "contact a separate team" to cancel.

## Cancel at Period End

This is the default cancellation mode. The subscription remains active until the end
of the current billing period, and the customer keeps full access until then. No
further charges are made. This mode is handled autonomously by the agent and does not
require human approval, because the customer keeps the access they have already paid for.

When a customer says "cancel my subscription" without specifying timing, the agent
applies end-of-period cancellation. The agent confirms the exact date access ends so
the customer knows what to expect.

## Cancel Immediately

Immediate cancellation ends the subscription right away and removes access at once. It
is typically requested alongside a refund ("cancel now and refund the unused time").

Because immediate cancellation can involve forfeited access and an associated prorated
refund, it is treated as a higher-risk action. Immediate cancellations are routed to the
**approval queue** for human review rather than being executed autonomously. The agent
explains to the customer that the request has been submitted for approval and will be
processed shortly.

## Prorated Refunds on Cancellation

When an immediate cancellation includes a refund request for unused time, the agent
calculates the prorated amount using the method in the Refund Policy (monthly charge
divided by days in the period, multiplied by unused days). The prorated amount is then
subject to the standard refund approval thresholds: under $100 auto-approved, $100–$500
manager approval, over $500 senior finance review.

For example, an Enterprise customer ($299/month) cancelling immediately with 18 days
remaining in a 30-day period would be owed ($299 / 30) × 18 = $179.40 — which falls in
the manager-approval band and is queued, not auto-approved.

## Data Retention After Cancellation

After a subscription ends, the account moves to a cancelled state but data is not deleted
immediately. We retain account data for **90 days**, during which the customer can
reactivate and resume exactly where they left off. After 90 days, data is permanently
deleted and cannot be recovered. Customers who need faster deletion are making a GDPR
deletion request, which is handled by the support team, not the agent.

## Reactivating Your Account

Within the 90-day retention window, customers can reactivate through support chat or
billing settings. Reactivation restores previous data and settings and starts a new
billing cycle from the reactivation date. The agent can guide a customer through
reactivation directly.
