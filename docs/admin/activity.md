---
title: 'Activity'
description: 'The audit log: every action in a space and on the instance, who did it, when, and what changed, in a table that is written once and never edited.'
---

Everything done through Manablox is written to an activity log: a document saved, a
menu reordered, a member added, a workflow switched on, a password reset. Each entry
says who did it, when, what it concerned, and, field by field, what the values were
before and after. Entries are appended and never changed: the table refuses updates and
deletes, and each entry carries a hash chained to the one before it, so a gap or an edit
made outside the application shows up when the chain is verified.

**Activity** in the sidebar shows the log of the space you are in. Seeing it takes
`audit:read`, which owners and admins hold by default and any custom role can be given.

## Who

Every entry names its actor by kind and by label, as they were at the time. A deleted
account or a revoked key still reads as who they were.

| Kind | When | Label |
| --- | --- | --- |
| User | A request with a browser session | The account's email |
| API key | A request with an `x-api-key` header | The owner's email; the key's id and name are in the entry's detail |
| Workflow | Anything a workflow run does, including the run finishing (actor kind `workflows`, of the workflows plugin; `workflow` on entries written before it) | The workflow's name; the run id in the detail |
| System | No request around the action: a scheduled job, the first account's promotion, a script | The job's name, or `system` |

A request's client details (IP, user agent, request id) are recorded beside the actor.

## What

Each entry is an action on one thing. The action is `<kind>.<verb>`: `content.publish`,
`member.grant`, `apiKey.issue`. A plugin's kinds carry its id: the workflows plugin writes
`workflows.workflow.publish` and `workflows.run.finish`. The thing is named by id and by label, the label being
the document's title, the menu's name, the member's email, again as it was at the time.
An entry that concerns a space carries the space; one that does not (an account, a key,
a space being created or imported) belongs to the instance.

The full list of actions is what the **Action** filter offers; it is served by the API
as `audit.catalog`.

## What changed

The change is stored as a list of fields, each with the value before and the value
after. A creation lists every field with nothing before it; a deletion every field with
nothing after; an edit only the fields that differ. A document's field values are
compared one by one, so an entry says `fields.body` changed rather than that the
document did. Values that the write itself derives (the tree path, the permalink chain,
the version counter, timestamps) are left out. A value above 16 KB serialised is kept as
a note of its size.

Some actions record more than fields: a publish notes the version it published, a
restore the version it restored, a finished workflow run its outcome and what each step
did. This sits under the changes in the opened entry, beside the hash.

## The table

Every column sorts: click **When**, **Who**, **Action**, **Kind** or **What**; click
again to reverse. The filter bar narrows by a search over who and what, by the actor's
kind, by one action, by the kind of thing, and by a time window. Clicking a row opens
the entry: the changes as a before/after table, the actor's details, anything else the
entry noted, and its position and hash in the chain. Where the thing still exists, its
label links to it.

The count stops at 10,000: a longer log reads "10000+" and pages through its first 10,000
entries. Narrow it with the filter or the time window to reach older ones.

A superadmin sees two more controls. The scope switch widens the table to **Everything**
(every space and the instance, with a Space column) or narrows it to **Instance only**
(accounts, keys, spaces). **Verify chain** asks the server to recompute every entry's
hash from the first one on and to check each link to its predecessor; the outcome is
shown above the table and written to the server's log.

## Live updates

The log is also what keeps every open admin current. Each entry, as it is written, is
sent to every signed-in admin tab as a Server-Sent Event on `GET /realtime/events`, with
the entry's action, the thing it concerns, the space and the actor, but not the field
changes. A tab that hears of a change refetches whatever it shows of that kind: a
document saved by someone else appears in the tree, a new asset in the grid, a changed
role in the members list, without a reload. A tab is told only what it may see: a
space's changes reach the members who can read the space, and an instance-wide change
reaches superadmins and, when it is about their own account or membership, the person
concerned.

A tab is not told about its own writes; every request from the admin carries an
`x-manablox-client` header naming the tab, and the event carries it back, so the tab
that made the change is the one that skips it. Two tabs of the same account are two
tabs. When the stream drops, the browser reconnects and the tab refetches everything
once, since nothing is replayed.

While a document is open in the editor, a save or a delete of that document by someone
else shows a notice above the form with the name of who did it; saving would be refused
as a version conflict, so the notice offers to reload their version instead.

A reverse proxy in front of the server must pass `/realtime/events` through without
buffering; the response asks for that with `x-accel-buffering: no`, which nginx honours.

## Through the API

`audit.list` reads a space's log with the same filter, sort and page the admin uses (its
`total` stops at 10,000 and the answer then carries `capped: true`);
`audit.forTarget` pages everything about one thing, which is what a history panel wants;
`audit.get` reads one entry. `audit.listInstance` and `audit.verify` are a superadmin's.
There is no procedure that writes, edits or removes an entry. See the
[HTTP API reference](../reference/http-api.md).

## Operating it

The log grows with use. It is trimmed only when the control setting
`retention.auditDays` is set: reads then leave out entries past the window at once, and a
daily job deletes them through the one guarded path the table allows, optionally after
exporting them to storage (`retention.auditExport`). Each deleted batch leaves an
`audit.pruned` entry, an anchor that records the hashes the remaining entries link to, so
**Verify chain** still checks out; any other gap is reported. See
[Retention](../configuration/controls.md#retention).

Deleting entries any other way (dropping the `audit_entries_immutable` trigger, deleting
a range, recreating the trigger) is a deliberate act that leaves the chain broken at that
point, which is what **Verify chain** will report from then on. Export the range first if
the record has to be kept.

An entry that could not be written (the database unreachable at that moment) does not
fail the action it describes: the action has already happened. The failure is logged at
error level with the action's name, so it is visible in the server's log rather than
silent.
