---
title: 'Mail'
description: 'How the instance sends mail: an SMTP server, Mailpit while developing, a Gmail or Microsoft 365 mailbox, or Resend, SendGrid, Postmark or Mailgun.'
---

The instance sends mail for three things: the **Send an email** step of a
[workflow](../admin/workflows.md), [notifications](../admin/notifications.md) people
chose to get by email, and account mails such as password resets and invitations (see
below). All go through one **transport**, picked in the `mail` section of the config file
or with `MAIL_DRIVER` in the environment.

Without a transport nothing breaks: the email step fails with
`mail.notConfigured`, which the run log shows, notifications reach people
in the admin and by push only, the login page offers no **Forgot password?** link, so
a superadmin resets passwords under **Settings > Users** (see
[Users and roles](../admin/users-and-roles.md#users)), an invitation shows its link to
copy instead of mailing it, and a new email address on a profile applies at once.

## Account mails

| Mail | Sent when | Link |
| --- | --- | --- |
| Reset your Manablox password | Someone asks for a reset with **Forgot password?** | `/reset-password`, one hour |
| Set your Manablox password | The control API or a superadmin creates a set-password link and mails it | `/reset-password`, 72 hours by default |
| Confirm your email address | Someone changes the email on their profile, or signs in unconfirmed while `auth.requireEmailVerification` is on | `/verify-email`, 24 hours |
| ... invited you to Manablox | A superadmin or a space admin invites someone | `/accept-invite`, 7 days by default |
| New two-factor backup codes | Someone creates new backup codes for their account | `/profile?tab=security` |

Every link points at `server.adminUrl` (`ADMIN_URL`), so set it to the address people
open the admin at. Each link works once. The mails are plain text in English; the
templates live in the `@manablox/auth` package
([`packages/auth/src/mails.ts`](https://github.com/manablox/manablox-cms/blob/main/packages/auth/src/mails.ts)), one table per language, with English as
the fallback. At most `rateLimits.auth.mails` of them (3 per hour by default) go to one
account, or for invitations to one address; past that the request is refused with
`auth.mails.tooMany`.

The **Send from a mail account** and **Send with Gmail** workflow actions are separate:
they send through an account an editor stored as a credential, not through this
transport.

## Drivers

| Driver | What it is | Good for |
| --- | --- | --- |
| `smtp` | Any SMTP server, by URL or by host and login | Your own mail server, or a provider's SMTP relay |
| `mailpit` | [Mailpit](https://mailpit.axllent.org), a mail catcher with a web inbox | Development: every mail lands in the inbox and nowhere else |
| `gmail` | A Google mailbox over the Gmail API | Google Workspace or a Gmail account |
| `microsoft` | A Microsoft 365 mailbox over Microsoft Graph `sendMail` | Microsoft 365 tenants, where SMTP login is switched off |
| `resend` | The Resend API | Transactional mail |
| `sendgrid` | The SendGrid v3 mail API, global or EU | Transactional mail |
| `postmark` | The Postmark email API | Transactional mail |
| `mailgun` | The Mailgun messages API, US or EU region | Transactional mail |

The API drivers make one HTTPS request per mail with `fetch`; no vendor SDK is installed.

## From the environment

`mailConfigFromEnv()` reads the variables below. Every config that `manablox create`
writes uses it:

```ts
import { defineConfig, mailConfigFromEnv } from '@manablox/core';

export default defineConfig({
  // ...
  mail: mailConfigFromEnv(),
});
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAIL_DRIVER` | `smtp` when `SMTP_URL` is set, `none` otherwise | One of the drivers above, or `none` |
| `MAIL_FROM` | see below | The `From` header of every mail: `Manablox <cms@example.com>` |

A driver's variables without a default are required: a half configured provider stops the
boot with `Missing required environment variable: ...` rather than failing on the first
mail. An unknown `MAIL_DRIVER` stops it too.

### smtp

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMTP_URL` | | `smtp://user:pass@host:587` or `smtps://user:pass@host:465`. Replaces the parts below |
| `SMTP_HOST` | | Required without `SMTP_URL` |
| `SMTP_PORT` | `465` with `SMTP_SECURE`, `587` without | |
| `SMTP_SECURE` | `false` | `true` for TLS from the first byte (port 465); `false` upgrades with STARTTLS |
| `SMTP_USER`, `SMTP_PASSWORD` | | The login, when the server wants one |

The parts are easier than a URL when the password contains characters a URL has to escape.

### mailpit

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAILPIT_HOST` | `localhost` | `mailpit` inside a compose stack, where it is a service |
| `MAILPIT_PORT` | `1025` | Mailpit's SMTP port |

The inbox is at `http://localhost:8025`. A local project from `manablox create` runs
Mailpit with `pnpm services:up` unless another mail driver was picked. Mailpit accepts every mail and delivers none, so never leave it in place
where real people are meant to receive mail.

### gmail

| Variable | Default | Purpose |
| --- | --- | --- |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | | An OAuth client of a Google Cloud project with the Gmail API enabled |
| `GMAIL_REFRESH_TOKEN` | | A refresh token for the scope `https://www.googleapis.com/auth/gmail.send` |
| `GMAIL_USER` | `me` | The mailbox to send as; `me` is the account the token belongs to |

Get the refresh token once, for example with the
[OAuth 2.0 Playground](https://developers.google.com/oauthplayground) set to use your own
client. The instance trades it for a short lived access token and keeps that until
shortly before it expires. Gmail sends from the authorised account; a different
`MAIL_FROM` has to be one of its "Send mail as" addresses.

### microsoft

| Variable | Default | Purpose |
| --- | --- | --- |
| `MICROSOFT_TENANT_ID` | | The directory (tenant) id |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | | An app registration and one of its client secrets |
| `MICROSOFT_SENDER` | | The mailbox that sends: its address or object id |
| `MICROSOFT_SAVE_TO_SENT_ITEMS` | `false` | Keep a copy in the mailbox's Sent Items |

In the Microsoft Entra admin center, register an app, add the **Microsoft Graph**
application permission `Mail.Send` and grant admin consent, then create a client secret.
The instance signs in with client credentials, so no person has to stay logged in. The
permission lets the app send as any mailbox in the tenant; an Exchange application access
policy narrows it to the sender mailbox. A `MAIL_FROM` other than the sender needs Send As
rights on that address.

### resend, sendgrid, postmark, mailgun

| Variable | Default | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | | A Resend API key with sending access |
| `SENDGRID_API_KEY` | | A SendGrid API key with Mail Send access |
| `SENDGRID_REGION` | `global` | `eu` for an account on EU data residency |
| `POSTMARK_SERVER_TOKEN` | | The server's API token |
| `POSTMARK_MESSAGE_STREAM` | `outbound` | The message stream to send through |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` | | A sending API key and the sending domain |
| `MAILGUN_REGION` | `us` | `eu` for a domain in Mailgun's EU region |

Each of them sends only from addresses on a domain, or a sender, verified with the
provider, so set `MAIL_FROM` to one.

## The sender

`MAIL_FROM` (or `mail.from`) is the `From` header of every mail. Without it, `gmail` and
`microsoft` send as their mailbox, and every other driver as
`Manablox <no-reply@localhost>`, which a real provider will refuse.

## In the config file

`mail.transport` takes a driver with its options, the same names the table above lists
in camel case:

```ts
mail: {
  from: 'Manablox <cms@example.com>',
  transport: {
    driver: 'microsoft',
    tenantId: requireEnv('MICROSOFT_TENANT_ID'),
    clientId: requireEnv('MICROSOFT_CLIENT_ID'),
    clientSecret: requireEnv('MICROSOFT_CLIENT_SECRET'),
    sender: 'cms@example.com',
  },
},
```

A driver's required options are checked at boot and reported as
`config.mail.optionMissing` with the path, an unknown driver as
`config.mail.driverUnknown`.

## A provider of your own

For a provider without a driver, pass an object with a `name` and a `send` function as the
transport. `send` gets the message and resolves with the provider's id for it, or `null`:

```ts
import type { MailTransport } from '@manablox/core';

const brevo: MailTransport = {
  name: 'brevo',
  async send(mail) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { email: 'cms@example.com' },
        to: mail.to.map((email) => ({ email })),
        subject: mail.subject,
        textContent: mail.text,
        htmlContent: mail.html,
      }),
    });
    if (!response.ok) throw new Error(`Brevo answered HTTP ${response.status}`);
    const { messageId } = (await response.json()) as { messageId?: string };
    return { id: messageId ?? null };
  },
};

export default defineConfig({
  // ...
  mail: { transport: brevo },
});
```

`mail.from` is `undefined` when the config names no sender; decide what that means for
your provider. An error thrown from `send` fails the workflow step with its message, and
is logged for a notification.

## Scaffolding

`manablox create --mail <driver>` picks the driver for a new project. It writes
`MAIL_DRIVER` and that driver's variables into `.env` (credentials blank), passes them into
the `api` container of a Docker stack, and for `mailpit` adds the Mailpit service to
`compose.yml`. Without the option it asks, and `--yes` takes `mailpit` for the local
preset and `none` for a Docker stack. See
[Installing as a dependency](../getting-started/as-a-dependency.md).
