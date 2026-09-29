---
title: 'Notifications and approvals'
description: 'The bell, the inbox and the profile: what the admin tells you, where it reaches you, and how a document goes through review before it is published.'
---

Manablox tells people about the things that need them: a document waiting for their
approval, the answer to a request they made, a role they were given. Each notification
is delivered where the person asked for it, in the admin, by email, as a push to a
browser, and every kind can be switched on or off per channel on the profile page.

## The bell and the inbox

The bell in the top bar carries the unread count. Opening it shows the latest few
notifications; each one opens what it is about (the document, the space) and is marked
read as it does. **See every notification** leads to the inbox at `/notifications`,
which lists everything by day, filters to unread, and has **Mark all read** and
**Remove read**.

A notification arrives live: the open admin tab hears it over the same feed that
carries other people's saves (see [Activity](./activity.md)), shows it as a toast and
refreshes the bell. Nothing is missed while a tab is closed; the inbox holds it until it
is read or removed.

## Kinds and channels

| Kind | Who is told | Default channels |
| --- | --- | --- |
| A document awaits your approval | Everyone who can publish the document's type in that space, superadmins included, except whoever asked | admin, email, push |
| Your document was approved | Whoever asked | admin, email, push |
| Your document was sent back | Whoever asked | admin, email, push |
| A request for approval was withdrawn | Everyone who could have approved it | admin |
| You were added to a space, or your role changed | The member | admin, email |

The catalogue lives in `@manablox/core` (`NOTIFICATION_KINDS`); a kind added there
appears in the preferences form and can be sent with `NotificationService.notify`, so a
plugin or a later feature adds a kind and nothing else.

Three channels:

- **In the admin**: a row in the inbox and the toast.
- **By email**: a mail to the address on the profile. Needs the instance's mail transport (`MAIL_DRIVER`, see [Mail](../configuration/mail.md)); the preference is kept even when mail is not set up, and shown as disabled.
- **Push**: a Web Push to every browser the person switched notifications on in. Needs the instance's `PUSH_VAPID_*` keys and, per browser, the switch on the profile page.

Email and push go out in the background and never hold up the action that caused
them; a mail server being down is logged, not reported to whoever saved.

## The profile

Clicking your name at the bottom of the sidebar opens your profile at `/profile`. It has
two tabs:

- **Account**: your name and email, and a password change that asks for the current password. Unlike an administrator's reset, your other devices stay signed in.
- **Notifications**: the preferences table (one row per kind, one switch per channel), and the browsers that receive push, with the switch for this one. Only what differs from the defaults is stored, so a default changed later reaches everyone who did not change it themselves.

An administrator edits other people's accounts under `Settings > Users`; the profile
is only ever about the person signed in.

## Approval before publishing

A content type can ask for review: **Needs approval before publishing** in the type
builder's Behaviour panel (`requiresApproval` in code; see
[Building content types](./content-types.md)). It is only offered on a publishable
type, because there is nothing to approve otherwise.

The switch changes nothing about who may publish. That stays with the roles:
`content:publish`, held by editors, admins and owners by default, never by an author.
What the switch adds is the request, the queue and the notifications around it:

1. An author (anyone who can write the type but not publish it) creates a document of the type. A request for approval opens by itself, and everyone who can publish the type is told. The author can also ask explicitly from the **Approval** panel in the editor's sidebar, with a note, and can withdraw an open request.
2. A reviewer (anyone with `content:publish` on the type) sees the request on the dashboard under **Waiting for your approval**, in the bell, and in the editor's Approval panel. From there they **Approve and publish**, which publishes the document at once, or **Send back** with a note on what should change.
3. The author is told either way. A document sent back stays a draft, keeps the note in its Approval panel, and can be asked about again once it is fixed; every request is kept as history.

A reviewer who simply presses **Publish** on a document with an open request closes
the request as approved: the queue never offers what is already live. Deleting the
document deletes its requests. A document has at most one open request at a time.

Every step is in the [activity log](./activity.md) as `content.requestApproval`,
`content.approve`, `content.reject` and `content.withdrawApproval`, with the note in the
entry's detail.

## The API

The management API carries all of it, and so does the [REST form](../reference/http-api.md):

| Procedure | What |
| --- | --- |
| `notifications.list`, `notifications.unreadCount` | The caller's inbox; `unreadOnly`, `kinds` and `spaceId` narrow it |
| `notifications.markRead`, `markUnread`, `markAllRead`, `delete`, `deleteRead` | Changing it |
| `notifications.catalog`, `notifications.preferences`, `notifications.setPreferences` | The kinds and channels, and the caller's choice per kind |
| `users.updateProfile`, `users.changePassword` | The caller's own account |
| `content.approval` | Where a document stands: the open request, the last decision, the history |
| `content.pendingApprovals` | The open requests in a space the caller may decide on, a page at a time (ten by default) |
| `content.requestApproval`, `content.withdrawApproval` | Asking, needs `content:write` on the type |
| `content.approve`, `content.reject` | Deciding, needs `content:publish` on the type |

Nothing under `notifications` takes a user id: every procedure acts as the signed-in
account, so an id from another inbox is simply not found.
