---
title: "Account Management"
category: "support"
version: "1.0"
last_updated: "2025-01-15"
description: "How to add and remove users, manage roles, update billing contacts, transfer ownership, and delete an account."
---

# Account Management

This document covers everyday account administration: managing the team, updating billing
details, transferring ownership, and deleting an account. These are knowledge questions the
agent answers directly — they do not require Stripe operations.

## Managing Users

Users are added and removed in account settings. Each plan has a user limit: Starter allows
up to 5 users, Pro up to 25 users, and Enterprise is unlimited. A customer at their limit must
upgrade or remove a user before adding a new one — this is the same limit referenced in the
Plan Comparison.

To add a user, the owner or an admin sends an email invitation from settings. To remove a
user, they revoke access in the same place, which frees the seat immediately.

## Roles and Permissions

We support three roles:

- **Owner** — full control, including billing and account deletion. There is exactly one
  owner per account.
- **Admin** — can manage users and settings but cannot delete the account or change ownership.
- **Member** — standard product access with no administrative control.

Customers should assign the least-privileged role that still lets someone do their job.

## Updating Billing Information

The billing contact and payment method are managed in billing settings. Updating the billing
email changes where invoices and payment notifications are sent. The payment method is also
updated here, which is the path customers use to recover from a failed payment.

## Transferring Account Ownership

Ownership can be transferred from the current owner to an existing admin. The owner initiates
the transfer in settings and the new owner accepts. After the transfer, the previous owner
becomes an admin unless removed. Only the owner can transfer ownership.

## Deleting an Account

The owner can delete the account from settings. Deletion cancels any active subscription and
starts the 90-day data-retention countdown described in the Cancellation Policy, after which
data is permanently removed. A customer who needs immediate deletion for privacy reasons is
making a GDPR deletion request, which the support team handles rather than the agent.
