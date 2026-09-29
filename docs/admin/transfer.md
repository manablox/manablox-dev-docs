---
title: 'Moving a space'
description: 'Export a whole space as one file and import it on another instance, and turn admin-built content types into config code.'
---

## Export and import

**Settings > Spaces >** a space's panel **> Transfer** exports the space as one file.
Pick the file type first - **JSON**, or an **Archive** that also carries the asset files -
then tick what goes in it. The sections are grouped as content, the model and structure
around it, the designed site, and the integrations it talks to; each row says how many the space has of that
thing. The space's own settings always travel:

- **Content types**: the types built in the admin. Code-defined types come from the target's config.
- **Documents**: every document in every locale, drafts and published alike, with their version numbers, their dates, their publish schedule and their tags. Field values travel as stored, so a `blocks` value keeps its grid and every block's layout per breakpoint. Tags travel as names and are recreated in the target space's vocabulary.
- **Document history**: every saved version of every document, so rollbacks work on the target. It needs the documents, and it makes the file much larger.
- **Asset records**: names, alt texts, dimensions, metadata, tags and the availability window.
- **Asset files**: the bytes themselves, straight from the storage bucket, which is what the archive file type adds: the JSON export as its first entry and one file per asset record after it. It needs the asset records, and picking the archive ticks them.
- **Menus**: navigation menus and their entries.
- **Roles**: custom roles and their permissions. Members are not carried over.
- **Redirects**: manual and automatic [redirects](./redirects.md) of old addresses.
- **Workflows** (workflows plugin, section `workflows.workflows`): definitions only, not past runs. A workflow whose draft has moved on past its published version carries both, and a workflow it runs that the file leaves out (a config workflow, say) is named so the target can find its own.
- **Webhooks** (webhooks plugin, section `webhooks.webhooks`): endpoints, their events, methods and the credential each authenticates with, never a secret. Past deliveries are not carried over.
- **Credentials**: the vault's entries without their secrets. The ciphertext is sealed with the source instance's own key and could not be opened on the target, so each credential arrives as an empty shell under its original id, and the nodes and endpoints that name it still resolve. Fill the secret in once on the target.
- **Site designs** (website plugin, section `website.designs`): every stored theme, block, page, layout and menu design and the site settings of a [designed site](../site/index.md), each with its draft and its live copy, not its history. Block and page designs name their type and fields, so they find the target's types again by id or technical name; a design whose type is missing is skipped with a note.
- **Domains** (website plugin, section `website.domains`): the site's host names. Off by default and only imported when ticked, because a host name can serve one space per instance; a host already taken on the target is skipped with a note.
- **AI providers** (AI plugin, section `ai.providers`): label, models, system prompt and generation defaults, and for a self-hosted model its slug, address and declared abilities. The API key stays behind for the same reason, so a provider arrives switched off.

The space's plugin settings, such as the website mode, 404 page and password hash of a designed site, always travel with the space (`pluginSettings`, format 9). Sections of a plugin the target does not load are skipped with a note.

Exporting, and writing the config source below, takes the `space:export` permission,
which owners and admins hold and custom roles can be given; the Transfer block is not
shown without it. Importing takes an instance superadmin, because it creates a space.

**Import** in the Spaces header restores it, from either form. Pick the file first: the
dialog reads it (only the manifest, for an archive) and lists the sections it holds, with
counts, so a file with everything can still be restored as only its content model, or as
everything but the history. The file itself is then uploaded as it lies, rather than sent
as the browser's copy of what it read.

### Picking less than everything

Both forms offer the same three levels of choice, on the way out and on the way in:

- **Sections**, as above: tick what travels at all.
- **Entries within a section**: content types, menus, roles and credentials can be picked one by one, by name, and so can the sections of plugins that list their entries (AI providers, workflows and webhooks). The chevron opens a row onto its entries, the way a content type's field list opens a field, and the badge at the end says how far it has been narrowed. Export forms list what the space has; import forms list what the file holds. Leaving a section ticked with nothing picked inside carries none of its entries.
- **Documents**, by content type, locale and status, from the row's own panel. One value of each filter always stays ticked, because a filter with nothing in it would mean no filter at all. A document whose parent is left out is left out with it: its address is derived from the parent's, so it would arrive with nowhere to go. Nothing else is pruned - a field or a menu entry naming a document that did not travel keeps the reference, as it would after a delete.

The import preserves every id rather than regenerating one. That is the point: field
values hold references to other documents and to assets by id (inside blocks and nested
field types too), and keeping the ids makes those references correct by construction
rather than by rewriting each one. The consequences are worth knowing:

- An instance that already holds the space (by id or technical name) refuses the import (`space.import.exists`). It restores a space, it does not duplicate one.
- The files come first. The import copies the file itself and every asset file of an archive into a staging area of the bucket (`imports/<id>/`) before it writes a single record, so a file that cannot be stored stops the import with nothing written and the staging area removed.
- The records then go in as a series of short transactions: one per section, and one per batch of documents (250) and assets (500). Each records its step on the space, so another write never waits for more than one batch, which matters most on SQLite, where writes take turns.
- Until the last step the space is **importing**: the admin shows its progress and takes no edits (`space.importing`), and the delivery APIs, the media route, webhooks, scheduled publishing and workflows treat it as absent. The last step moves the staged files into place, marks the space ready, writes the audit entry and removes the staging area.
- A failure part way through leaves the space **failed**, with the step it stopped at and the error. Everything committed before it stays. **Resume import** (superadmin, `spaces.resumeImport({ spaceId })`) continues at that step from the staged copy of the file, so nothing is uploaded again, and ends with the same space an uninterrupted import would have written. **Delete space** removes it and its staging area, after which the same file can be imported again. An import that shows no progress for ten minutes counts as interrupted and can be resumed too.
- Documents go in parent-first, so each child's path and permalink compute from a parent that already exists.
- A document whose content type is neither in the file nor in the target's config is refused before anything is written (`space.import.typeMissing`). Include the content types, or add them to the config first.
- Published documents are re-published after the import, because the published copy is a projection rather than a table anyone can restore. The dates the file carries are written back afterwards, so the publish date, the created and updated dates and the publish schedule are the source's, not the import's.
- Webhooks go in after the credentials, when the target loads the [webhooks plugin](./webhooks.md#the-webhooks-plugin). The `webhooks:beforeCreate` hook sees every endpoint before anything is written. Workflows go in after the credentials and webhooks, when the target loads the [workflows plugin](./workflows.md#the-workflows-plugin), and take the same path as a [workflow import](./workflows.md#exporting-and-importing): each is checked like a save and audited, and one that fails the check (an action this instance does not have, say) refuses the whole import. A workflow that was live gets its published version back, with its draft on top when that had moved on. Credentials and incoming webhooks the workflows use but the file or the selection leaves out are created as that import creates them, and the result lists them. A workflow that runs one neither in the file nor on the target is still imported, but switched off and unpublished with that node's target left empty, and the result names the missing workflow; the rest of the import goes ahead.
- A webhook that authenticates arrives switched off, whichever sections travelled: no secret comes with it. It still points at the credential it named, when that credential came along, so filling in the secret is all it needs.
- The asset-usage index is rebuilt for the imported documents, so the public API serves their files straight away. A document naming an asset the target does not have (the asset records were left out, say) keeps the reference, as it would after deleting the asset.
- An asset the target already has, because another space there shares it, is not created twice: the imported space is added to the spaces that asset is in. Its record stays as the target has it.
- Whoever imports the space owns it, exactly as if they had created it.
- A file that is not an export, or of another format version, is refused (`space.import.notAnExport`, `space.import.versionUnsupported`).

What deliberately stays behind: members and the accounts behind them (each instance
has its own), API keys (owned by users), the audit log (append-only, and about the
instance it was written on), notifications and approval requests, workflow runs, webhook
deliveries, the AI generation log and image variants, which regenerate on demand. Every
secret held in the vault stays behind too, as the credential and provider sections above
describe.

**A JSON export holds asset records only.** Inlining the bytes would turn a document
export into a multi-gigabyte text file, so either export the archive, or copy the bucket
alongside the JSON:

```sh
# local driver
docker compose cp <source>:/app/uploads ./uploads
docker compose cp ./uploads <target>:/app/uploads

# S3-compatible
aws s3 sync s3://source-bucket s3://target-bucket
```

The archive is streamed out of the bucket on export and spooled to disk on import, so
neither end holds the whole thing in memory, but the import does need free disk space
for it. Image variants are not in the archive; they regenerate on demand. A record whose
file is missing from the bucket is exported as a record only, and an archive entry the
manifest does not account for is never written to the bucket.

These are the routes the admin itself uses, for both file types: the export is saved as
it streams in and the picked file is uploaded as it lies, so a space large enough to be
worth moving never has to become a value in the browser. They are also plain HTTP for
scripts, taking the session cookie or an API key like the uploads; `sections` is a
comma-separated list, and everything when absent:

```sh
# the archive, or the JSON when `files` is not among the sections
curl -H "x-api-key: $KEY" \
  "https://cms.example.com/transfer/<spaceId>/export?sections=contentTypes,contents,assets,files" \
  -o site.manablox.zip

# superadmin only, as it creates a space. Either file type: which one it is
# is read from the bytes, not from the content type
curl -H "x-api-key: $KEY" -H "Content-Type: application/zip" \
  --data-binary @site.manablox.zip \
  "https://cms.example.com/transfer/import?sections=contentTypes,contents,assets,files"

curl -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  --data-binary @site.manablox.json \
  "https://cms.example.com/transfer/import"
```

An export reads the space's production environment. `environment=<name>` (or the
`x-manablox-environment` header) exports a staging environment instead, with its own home
and 404 pages as the space's, under the same feature and API key rules as other requests
to it; the file name then carries the environment. `spaces.export` takes `environment`
the same way. Importing always creates a new space from the file.

The finer choice travels as one `selection` parameter instead, holding the same JSON the
RPC takes: `sections`, `ids` per section, and a `contents` filter. It replaces `sections`
when both are given.

```sh
curl -H "x-api-key: $KEY" -G "https://cms.example.com/transfer/<spaceId>/export" \
  --data-urlencode 'selection={"sections":["contentTypes","contents"],
    "contents":{"locales":["en"],"statuses":["published"]}}' \
  -o site.manablox.json
```

The RPC procedures take it as an argument too: `spaces.export({ spaceId, selection })`
and `spaces.import({ payload, selection })`, with `spaces.inventory({ spaceId })` listing
what a space has to offer one and `spaces.resumeImport({ spaceId })` continuing a failed
import. They carry the export as a value rather than as a file,
which suits a script that has the payload in hand already; for a whole space the routes
above are the cheaper pair.

The whole-database `pg_dump` in [Operations](../deployment/operations.md#backups) is
still the right tool for backing an instance up. The export is for moving *one space*
between two instances that each have their own users, keys and other spaces.

## The space as config

The same Transfer block writes the space's admin-built model as `manablox.config.ts`
source. Tick what goes in it, the way an export is ticked - and open a row to pick single
entries by name:

- **Content types**: `defineContentType`, with every field, its settings and its admin layout.
- **Credentials**: `defineCredential`, the vault slot only. The secret is sealed with this instance's key and cannot travel; fill `values` from the environment on the target.
- **Webhooks** (webhooks plugin): `defineWebhook` from `@manablox/plugin-webhooks/define`, either direction, naming the credential it authenticates with, under `resources.plugins['webhooks.webhook']`.
- **Workflows** (workflows plugin): `defineWorkflow` from `@manablox/plugin-workflows/define`, under `resources.plugins['workflows.workflow']`. A trigger on an incoming webhook comes out as `webhookTrigger('<slug>')`. The saved graph is read back as the steps that build it, so what comes out is the list a person would have written rather than the nodes and edges a canvas holds.
- **Templates**: `defineTemplate`, with the block list of every locale the template was written in.

```ts
import { defineContentType, ref } from '@manablox/core';
import { defineWorkflow } from '@manablox/plugin-workflows/define';

export const blogPost = defineContentType({
  name: 'blog-post',
  label: 'Blog post',
  kind: 'content',
  hasSlug: true,
  isPublishable: true,
  isVisibleInTree: true,
  canBeVisibleInMenu: true,
  fields: [
    {
      name: 'body',
      label: 'Body',
      type: 'richtext',
      admin: { zone: 'main', width: 100, position: 0 },
    },
  ],
});

export const contentTypes = [blogPost];

export const notifyEditors = defineWorkflow({
  slug: 'notify-editors',
  trigger: { kind: 'event', events: ['content.published'], typeIds: [ref.contentType('blog-post')] },
  steps: [
    { key: 'check', condition: { rules: [{ field: 'content.locale', operator: 'equals', value: 'en' }] }, then: 'mail' },
    { key: 'mail', action: 'email', config: { to: 'editors@example.com' } },
  ],
});

export const resources = {
  plugins: {
    'workflows.workflow': [notifyEditors],
  },
};
```

Drop it into the config file, or import from it, to move what was built in the admin into
code where it can be reviewed and versioned. Two rules run through all of it:

- **Ids are left out.** `define*` derives them from the name or the slug, and pinning the admin's would tie the config to one database. Where a declaration has to point at something - a workflow at a content type, a webhook at a credential, a template at a block type - it points by name through `ref.*`, which the reconciler resolves per space.
- **What already came from a config is skipped.** A row the reconciler wrote is marked as code-owned and is not written again, so you cannot end up with two diverging definitions of the same thing.

A row the admin made without a slug (a workflow, an endpoint) is given one derived from
its name, because a declaration is matched by its slug. Anything the generator could not
express - an edge between two workflow steps that the step form has no shape for, a
trigger whose endpoint was deleted - is listed as a `TODO` in the file's header rather
than dropped silently.

Two things to know before you deploy a content type from it:

- A config type with no `spaceId` is **global**, available in every space, while the runtime type it came from is scoped to one. Keeping both leaves two types of the same name visible in that space, with different ids.
- Deleting the runtime type is refused while any document uses it (`contentType.inUse`), and existing documents reference *its* id, not the config type's.

So this is the tool for building in the admin and then committing the result: bootstrap
an instance's model, or lift a workflow into code before it matters. It is not an in-place
migration for a type that is already carrying documents; for that, move the whole space
with the export above.
