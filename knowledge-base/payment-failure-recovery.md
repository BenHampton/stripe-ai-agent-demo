---
title: "Payment Failure Recovery"
category: "billing"
version: "1.0"
last_updated: "2025-01-15"
description: "What happens when a recurring payment fails, the dunning retry schedule, and how the agent responds autonomously to payment_intent.payment_failed."
---

# Payment Failure Recovery

When a recurring payment fails, the subscription is not cancelled immediately. The
system retries the charge over several days and notifies the customer. This document
describes that recovery process and what the agent does autonomously when a
`payment_intent.payment_failed` webhook fires.

## What Happens When a Payment Fails

A failed charge moves the subscription into a past-due state. The customer keeps access
during the retry window. When the failure webhook fires, the agent acts without any human
message: it looks up the customer, checks where they are in the dunning sequence, and logs
a recovery recommendation. The agent does not email the customer itself — Stripe sends the
dunning emails automatically — so the agent's role is to assess the account and prepare the
recovery path, not to duplicate those notifications.

## Retry Schedule

We use Stripe Smart Retries to reattempt failed payments on a fixed schedule designed to
maximize recovery without being disruptive. By default, the charge is retried on:

- **Day 3** after the initial failure
- **Day 5** after the initial failure
- **Day 7** after the initial failure

A dunning email is sent automatically at each step. If the customer updates their payment
method before the next scheduled retry, the charge is reattempted immediately rather than
waiting for the next date.

## How to Update Your Payment Method

Customers can update their card through billing settings or by asking the agent. Once a
valid payment method is on file, the outstanding charge is retried right away. The agent
can walk a customer through updating their card and confirm once the charge succeeds.

## When Access Is Suspended

If all retry attempts fail by day 7, the subscription is suspended and paid features
become unavailable. Suspension is not the same as cancellation — the account and its data
are retained, and the customer can restore service.

## Restoring Access

To restore a suspended subscription, the customer updates their payment method and settles
the outstanding balance. Access is restored as soon as the payment succeeds. The agent can
confirm the account is back in good standing once the charge clears.
