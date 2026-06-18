---
title: "Retention Offers"
category: "retention"
version: "1.0"
last_updated: "2025-01-15"
description: "Available retention offers, eligibility rules, and how the retention agent selects an offer for at-risk customers."
---

# Retention Offers

When a customer wants to cancel or downgrade, or when a proactive scan flags an at-risk
account, the retention agent may propose an incentive to stay. This document defines the
available offers, who qualifies, and how the agent decides what to propose.

## Available Offers

- **Discount** — 20% off for 3 months, applied via the coupon **RETENTION20**. This is the
  primary retention offer and the only discount the agent applies autonomously.
- **Plan switch** — moving a customer to a lower-cost plan (for example, Pro to Starter)
  when price is the concern, rather than losing them entirely.
- **Pause** — pausing the subscription for up to 3 months instead of cancelling, preserving
  the account and data while billing stops.

## Eligibility Rules

Not every customer qualifies for every offer:

- Discounts are only offered to customers with an **active subscription** who have been
  **paying for at least 1 month**. Customers who have not yet completed a paid month are not
  eligible for a discount.
- Offers are limited to **one retention offer per customer per 12-month period**. The agent
  checks the customer's offer history before proposing a new one.
- Customers in a payment-failure or disputed state are not eligible until the account is
  back in good standing.

## Offer Selection Logic

The retention agent chooses an offer based on the stated reason for leaving:

- **"Too expensive"** → propose the 20% discount (RETENTION20), or a plan switch if the
  discount alone is not enough.
- **"Not using it right now"** → propose a pause rather than a discount.
- **"Missing a feature" or "switching tools"** → acknowledge honestly; a discount rarely
  changes this decision, so the agent does not lead with one.

## Proactive Retention Scan

The retention agent can also run proactively rather than waiting for a cancellation. A scan
identifies at-risk customers — for example, those who have scheduled an end-of-period
cancellation or shown declining usage — and surfaces them for outreach. For each flagged
customer the agent applies the same eligibility rules above before recommending an offer.

## Applying an Offer and Offer Limits

Once a customer accepts, the agent applies the RETENTION20 coupon for discounts, changes
the plan for switches, or pauses the subscription. The customer receives the exact terms
("20% off for the next 3 billing cycles"). Because offers are capped at one per 12 months,
if a customer has already used theirs the agent explains that no further discount is
available and focuses on resolving the underlying concern.
