---
title: "Support Escalation Process"
category: "support"
version: "1.0"
last_updated: "2025-01-15"
description: "When the agent handles a request autonomously versus escalating, the escalation hierarchy, and expected response times."
---

# Support Escalation Process

Most requests are resolved directly by the agent. Some require a human. This document
defines where that line is, the escalation hierarchy, and the response times customers can
expect. The thresholds here intentionally match the refund guardrails so the agent's words
and its actions never disagree.

## What the Agent Can Handle

The agent resolves these autonomously, with no human review:

- Answering billing, account, plan, and technical questions from the knowledge base
- Cancelling at period end and reactivating subscriptions
- Issuing refunds **under $100**
- Applying eligible retention offers (RETENTION20 and plan switches)
- Updating payment methods and explaining failed-payment recovery

## What Requires Human Review

The agent must escalate the following:

- **Refunds $100–$500** — manager approval via the approval queue before processing
- **Refunds over $500** — senior finance review with full justification
- **Immediate cancellations** — routed to the approval queue, since they can forfeit paid access
- **Disputed or charged-back charges** — handled by the billing team (see Dispute Policy)
- **Fraud claims, legal requests, and GDPR deletion requests**

## Escalation Levels

Escalation follows a clear hierarchy:

1. **Agent** — first line; handles everything in the autonomous list above.
2. **Support team** — general issues outside the agent's scope.
3. **Billing team** — refunds $100–$500, disputes, billing disagreements.
4. **Senior finance** — refunds over $500, fraud, and Enterprise SLA penalties.

When the agent escalates, it places the request in the appropriate queue with full context:
customer ID, the request, the amount if financial, and the reason. The customer is told the
request is under review and roughly when to expect a response.

## Expected Response Times

- Manager approvals (refunds $100–$500): within 1 business day
- Senior finance review (refunds over $500): within 2 business days
- Immediate-cancellation approvals: within 1 business day
- Legal and GDPR requests: acknowledged within 1 business day
- Fraud claims: prioritized, typically reviewed the same business day
