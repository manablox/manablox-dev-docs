---
title: 'Users and roles'
description: 'Accounts on the instance, invitations, two-factor authentication, the two instance roles, the built-in space roles, and how to define a role with exactly the permissions a team needs.'
---

Access has two layers:

1. An **instance role** on the account: `superadmin` or `editor` (*Administrator* or *Member* in the admin).
2. A **space role** per membership: one of the built-in five, or a role the space defines, each a set of permissions.

A superadmin is not bound by space roles. A member sees only the spaces they belong to,
with what their role there allows.

## Users

**Settings > Users** is the instance's account directory, and it is superadmin-only:
the tab is not shown to anyone else, and every procedure behind it refuses a member.
The list on the left is searchable by name or email; the account picked lays out on the
right.

**Sign-up is open for exactly one account.** The first account created on the login page
becomes the instance superadmin and owner of every existing space. From then on the
server refuses `sign-up/email` with `auth.signUp.closed`, the login page stops offering
it, and every further account is created here. `users.setupNeeded` is the public check
the login page uses to know which state the instance is in.

On a provisioned instance (see [Control API](../reference/control-api.md#provisioning-a-new-instance))
sign-up is closed from the start: the external layer creates the superadmin and hands out
a set-password link, and the login page never offers a first account.

**New user** takes a name, an email, a password and an instance role. The password is
set here, so hand it over out of band; **Generate** fills in a random one. The person can
change it after signing in. To let people choose their own password, invite them instead
(see [Invitations](#invitations)).

**Password reset by mail.** When the instance has a [mail transport](../configuration/mail.md),
the login page links to **Forgot password?**. better-auth's `request-password-reset`
mails a one-time link to the admin's `/reset-password` page; the link expires after an
hour and ends every session of the account once redeemed. The endpoint answers the same
whether or not an account uses the address, and at most `rateLimits.auth.mails` reset
mails (3 per hour by default) go to one account. Without a transport the link is hidden,
`GET /api/auth/password-reset/status` answers `{ "enabled": false }` and the request
endpoint refuses every address alike. Requests and redeemed links are audited as
`user.requestPasswordReset` and `user.resetPassword`.

| Instance role | Meaning |
| --- | --- |
| `superadmin` (*Administrator*) | Every space, every user, every setting. Not bound by space roles |
| `editor` (*Member*) | Only what their space roles allow. A member of no space sees nothing |

An account's panel holds:

- **Profile**: name, email and instance role. An email is stored lower-cased, and a taken one is refused with `user.email.taken`.
- **Spaces**: the account's memberships, the same rows as the space's own Members panel seen from the other side. Adding, changing a role and removing go through the space procedures, so the last-owner rule (`space.member.lastOwner`) holds from here too.
- **Access**: *Reset password* sets a new one and ends every session the account has; *Sign out everywhere* ends the sessions without touching the password; *Ban* signs the account out everywhere and refuses it on every request until the ban is lifted.
- **Delete** removes the account with its sessions, API keys and memberships. Content it wrote stays. Typing the email confirms it.

Two rules keep the instance reachable:

- You cannot ban or delete your own account (`user.self.protected`).
- The instance always keeps at least one superadmin: demoting, banning or deleting the last one is refused with `user.lastSuperadmin`. Promote someone else first.

A superadmin's space-restricted API key still cannot reach any of this: user
management is instance-wide, and a restricted key fails every instance-wide operation.

## Invitations

An invitation brings someone in by email, with a role in one or more spaces. Superadmins
invite from **Settings > Users** (any spaces, or none for an account without spaces);
anyone with `user:write` in a space invites from that space's **Settings > Members**, and
only into spaces where they hold `user:write`. Both lists show the open invitations with
**Resend** and **Revoke**; a space's list shows those that grant a role in it.

| Procedure | Who | What it does |
| --- | --- | --- |
| `invitations.create` | superadmin, or `user:write` in every granted space | `email`, `grants` (`{ spaceId, role }` per space), `expiresInDays` (1 to 30, default 7) |
| `invitations.list` | superadmin; with `spaceId`, `user:read` there | Newest first, with `status`: `pending`, `accepted`, `revoked` or `expired` |
| `invitations.resend` | as for revoking | A new link with a fresh expiry; the old link stops working |
| `invitations.revoke` | superadmin, or `user:write` in every granted space | The link stops working |
| `invitations.preview` | public | What a link grants, for the accept page |
| `invitations.accept` | public | Redeems a link, see below |

The link is a random 256-bit token; only its SHA-256 hash is stored, in the
`invitations` table, so a copy of the database holds no usable link. With a
[mail transport](../configuration/mail.md) the link is mailed ("... invited you to
Manablox") and never returned; without one, `create` and `resend` return it once as
`link`, and the admin shows it to copy. Invitation mails count against
`rateLimits.auth.mails` per address.

The link opens `/accept-invite` in the admin:

- For an address without an account, the person picks a name and a password. The account is created as a Member with a confirmed address, joins the granted spaces, and signs in.
- For an address that has an account, the person signs in with it and accepts; the grants are added to that account. Signed in as someone else, `accept` is refused with `invitation.emailMismatch`.

Seats are checked twice. Creating an invitation fails with `control.limit` when the
`seats` limit of the instance (for a new account) or of a granted space is already
reached, so nobody is invited who could not join; pending invitations reserve nothing.
Accepting checks the limits again and changes nothing when one is reached: no account,
no memberships, and the link stays valid. A space or custom role removed after the
invitation was sent is skipped when it is accepted; a space where the account is a
member already keeps its current role.

Accepting records `invitation.accept` in the audit log, next to the `user.create` and
`member.grant` entries of the account and its memberships, and emits the `user.created`
and `seat.changed` [control events](../reference/control-api.md#events). Creating,
resending and revoking are audited as `invitation.create`, `invitation.resend` and
`invitation.revoke`.

## Two-factor authentication

Every account can add a second sign-in step: a 6-digit code from an authenticator app
(TOTP, 30 seconds), with ten one-time backup codes for a lost phone. It is better-auth's
`twoFactor` plugin; the secret and the backup codes are stored encrypted with the
instance secret in the `two_factors` table.

- **Enrolling**: **Profile > Security > Set up** asks for the password (`POST /api/auth/two-factor/enable`), shows a QR code and the key, and turns two-factor on with the first code (`two-factor/verify-totp`). The backup codes are shown once. Audited as `user.enableTwoFactor`.
- **Signing in**: after the password, `sign-in/email` answers `{ "twoFactorRedirect": true }` instead of a session, and the admin asks for a code (`two-factor/verify-totp`) or a backup code (`two-factor/verify-backup-code`). *Trust this device* skips the step on that browser for 30 days. Five wrong codes end the pending sign-in; ten in a row lock the account's second step for 15 minutes.
- **New backup codes** (`two-factor/generate-backup-codes`, with the password) replace the old ones, are audited as `user.regenerateBackupCodes`, and mail the account a notice, so a stranger creating codes does not go unnoticed.
- **Turning it off** (`two-factor/disable`, with the password) is audited as `user.disableTwoFactor`.

A superadmin sets who must use it under **Settings > Security**
(`instance.updateSettings` with `twoFactorPolicy`, read with `instance.settings`):

| Policy | Who must use it |
| --- | --- |
| `off` (*Optional*) | Nobody; everyone decides for their own account |
| `admins` | Superadmins, and every account that is owner or admin of at least one space |
| `all` | Every account |

The policy is stored in `instance_meta` and audited as `instance.updateSettings`. An
account the policy covers that has no two-factor yet can sign in, but its session holds no
grants: every procedure except `users.me` and the preference procedures is refused with
`auth.twoFactor.enrolmentRequired`, uploads and every other surface see a principal
without permissions, and the admin shows only the enrolment page until it is done.
`users.me` reports this as `twoFactor.pending`. A covered account cannot turn two-factor
off (`TWO_FACTOR_REQUIRED`). API keys are separate credentials and are not affected.

The policy covers password sign-ins only: a sign-in through [single sign-on](./sso.md#two-factor-authentication)
is not asked for a code and never held back for enrolment, as the identity provider handles
the second factor.

The [`twoFactor` feature](../configuration/controls.md#two-factor-authentication)
gates all of this. Switched off, enrolment is refused, the policy no longer applies and
can only be set to optional, and accounts that use two-factor keep their second step.

## Email confirmation

With a mail transport, a new email address on someone's own profile (`users.updateProfile`)
does not apply at once: the address stays as it was, a link goes to the new one, and
`users.updateProfile` answers `emailChange: { status: 'sent', email }`. Opening the link
(`/verify-email`, redeemed with `users.verifyEmail`) switches the address and marks it
confirmed. Without a transport the new address applies at once. A superadmin
changing someone's email under **Settings > Users** is not asked for confirmation.

While the control `auth.requireEmailVerification` is on, accounts with an unconfirmed
address cannot sign in: the password is checked, then the sign-in is refused with
`auth.email.unverified` and a confirmation link is mailed. Links are single use, valid for
24 hours, and stored as hashes only. Requests and confirmations are audited as
`user.requestEmailChange`, `user.update` and `user.verifyEmail`.

## Roles

**Settings > Roles** defines what a role in a space may do. The space is picked at the
top; the built-in five are listed first, read only, so what `editor` means is one click
away. Below them are the roles created for this space, each a name, a technical name
(what a membership and a field's read/write roles refer to; fixed once the role exists)
and a set of permissions. Seeing the tab takes `role:read`; creating and editing takes
`role:write`, which owners and admins hold.

### Permissions

Permissions are toggles grouped by what they concern. `space:read` and
`contentType:read` are always on: without them the role could not open the space its
other grants concern, since every editor is rendered from the content types.

`space:export` covers the transfer export and the config download. It is a grant of its
own because an export carries every field of every document, whatever the field-level
read roles say. Owners and admins hold it; the other built-in roles do not. A custom
role or a restricted API key that held `space:write` before the permission existed was
given it by the migration, so nothing that could export stopped being able to.

| Group | Grants |
| --- | --- |
| Space | `space:read`, `space:write`, `space:delete`, `space:export` |
| Content types | `contentType:read`, `contentType:write`, `contentType:delete` |
| Content | `content:read`, `content:write`, `content:delete`, `content:publish`, for every type, or type by type |
| Assets | `asset:read`, `asset:write`, `asset:delete` |
| Tags | No grant of their own: reading the vocabulary takes `space:read`, tagging a document `content:write` and an asset `asset:write`, and renaming, merging or deleting a tag `content:write`. See [Tags](./tags.md) |
| Menus | `menu:read`, `menu:write` |
| Redirects | `redirect:read`, `redirect:write`. Editors, admins and owners hold both, viewers `redirect:read`. See [Redirects](./redirects.md) |
| Workflows | `workflows:read`, `workflows:write`, declared by the workflows plugin. Editors get `workflows:read`; `workflows:write` is for owners and admins. See [Workflows](./workflows.md#permissions) |
| Credentials | `credential:read`, `credential:write`: the vault workflow nodes and webhooks sign in with. Editors hold `credential:read`, admins and owners both |
| Members | `user:read`, `user:write` |
| Roles | `role:read`, `role:write` |
| Activity | `audit:read` |
| Webhooks | `webhooks:read`, `webhooks:write`, declared by the webhooks plugin. Editors get `webhooks:read`; `webhooks:write` is for owners and admins. See [Webhooks](./webhooks.md#permissions) |
| AI | `ai:read`, `ai:use`, `ai:configure`, declared by the AI plugin. Editors and authors get `ai:read` and `ai:use`; `ai:configure` is for owners and admins. See [AI](./ai.md#permissions) |
| Website | `website:read`, `website:write`, `website:publish`, `website:code`, `website:domains`, declared by the website plugin. Editors get the first three; `website:code` (custom CSS, head and body code) and `website:domains` are for owners and admins. See [Permissions, controls and RPC](../site/api.md) |
| Environments | `environment:manage`: creating, promoting and deleting staging environments. Owners and admins hold it. See [Environments](./environments.md) |

**Content** is a grid rather than a list: each action (read, write, delete, publish)
can be granted for **all content types**, or type by type for the document types the space
has. A broad grant implies every type, including types created later; a type-by-type
grant covers only those types, so a listing shows only them and the "new document" menu
offers only the ones the role may write. Blocks are not listed: a block lives inside a
document and is covered by its permissions.

Two rules keep type-by-type grants in step with the types:

- A role that may **create content types** and holds content permissions type by type is given every content action on each type its holder creates: otherwise it could define a type it may not fill. A built-in role, or one granted every type, needs nothing.
- When a content type is deleted, every grant naming it is dropped from every role.

A role someone still holds cannot be deleted (`role.inUse`); give them another role
first. A technical name is unique per space (`role.machineName.taken`) and cannot be one
of the built-in five (`role.machineName.reserved`).

### Field-level roles

A field can name `readRoles` and `writeRoles`: technical names of roles. A field with
read roles is omitted from the public GraphQL schema entirely rather than present and
always null. See [Content types in code](../configuration/content-types-in-code.md#field-options).

## Sessions

Sessions are cookies on the API's origin, with several devices signed in at once. *Sign
out* ends the current one; *Sign out everywhere* on an account ends them all.
