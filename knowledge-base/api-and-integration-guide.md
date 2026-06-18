---
title: "API and Integration Guide"
category: "support"
version: "1.0"
last_updated: "2025-01-15"
description: "API access by plan, authentication, rate limits, webhooks, and common integration questions."
---

# API and Integration Guide

This guide covers how to use our API: which plans include access, how to authenticate,
rate limits, and webhook setup. The knowledge agent retrieves this when customers ask
technical questions, including the Scenario 1 follow-up "Does Pro include API access?"

## API Access by Plan

API access is not available on every plan — it begins at Pro:

- **Starter** — no API access
- **Pro** — API access included, 10,000 requests/month
- **Enterprise** — unlimited API access

These limits match the Plan Comparison. A customer who needs the API must be on Pro or
Enterprise; the agent should recommend upgrading from Starter rather than implying Starter
has a smaller quota.

## Authentication

The API uses bearer-token authentication. Customers generate an API key in account settings
and include it in the Authorization header on every request:

```
Authorization: Bearer YOUR_API_KEY
```

Keys are secret. If a key is exposed, the customer revokes it in settings and generates a
new one. Keys inherit the account's plan limits.

## Rate Limits

The monthly request quota is set by plan: 10,000/month on Pro and unlimited on Enterprise.
Beyond the monthly quota, requests are rate limited per minute to protect stability. When a
limit is exceeded, the API returns `429 Too Many Requests`. Customers should spread bulk
operations out and check the rate-limit headers returned on each response to track remaining
quota.

## Webhooks

Customers can register webhook endpoints to receive events such as subscription changes and
payment results in real time. Endpoints are configured in settings. Every webhook is signed,
and customers should validate the signature against their signing secret before trusting the
payload.

## Common Integration Questions

- **"Does Pro include API access?"** — Yes. Pro includes 10,000 requests/month. Starter does not include API access.
- **"How do I get more requests?"** — Upgrade from Pro to Enterprise for unlimited access.
- **"Why am I getting 429 errors?"** — You've hit the per-minute rate limit or your monthly quota. Check the rate-limit headers.
- **"How do I verify webhooks?"** — Validate the signature on each webhook against your signing secret before processing.

## Getting Help

For integration problems the agent cannot resolve, it escalates to the support team. The
customer should include the API key identifier (never the full secret), the endpoint, and
the error response.
