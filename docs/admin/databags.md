---
title: 'Databags'
description: 'Flat records outside the content tree: defining a databag type, browsing its entries in a searchable, paged table, and editing them.'
---

A **databag** holds structured records that are not pages: products, team members, FAQs,
opening hours, anything a site reads as a list. Each databag is a content type of kind
`data`. Its entries are documents like any other (a title, the type's fields,
translations, tags, versions, publishing), with three differences:

- They never appear in the content tree, and never in a menu.
- They have no slug and no URL of their own.
- They always sit at the root: an entry cannot be placed under a document, and nothing can be placed under an entry.

Two sidebar sections deal with them: **Databag types** defines what a databag holds,
**Databags** is where editors fill them.

## Defining a databag type

**Databag types** lists the space's databag types in the side column. **New databag
type** (or `n`) opens the same builder as [Building content types](./content-types.md):
label, technical name, icon, the fields and their settings, the built-in fields. The
technical name is immutable once saved, like any type's.

The switches are fewer. A databag type has no *Has a slug*, *Visible in tree* or *Can
appear in menus*; it keeps *Publishable* and *Needs approval before publishing*. Leave
*Publishable* on when a site reads the entries through the delivery API; turn it off for
records only the admin and workflows use.

The kind is fixed at creation. A databag type cannot become a document type or the other
way round, and a databag type opened under Content types moves to Databag types.

A databag type is deleted like any type, once it has no entries left in any language.

## Browsing entries

**Databags** shows a card per databag type with its entry count in the current language,
and lists the same types in the side column. Pick one to open its table.

The table shows the title, up to three simple fields (text, number, yes/no, choice and
date fields, in the order the type lists them), the publishing state for a publishable
type and when the entry was last changed. It is:

- **Searchable**: the search box matches titles, text and tags, like the content search. `/` focuses it.
- **Sortable**: click *Title* or *Updated* to sort by it, again to reverse.
- **Paged**: 25 entries a page, with the range and page arrows above the table.

Any change to the search, the sort or the language starts over at the first page.
**Fields** jumps to the type's builder, for those who may edit types.

## Editing entries

**New entry** (or `n`) and a click on a row open the document editor under the databag's
own path, so the side column stays on Databags. It is the same editor as for a page,
without the placement card: save, publish, schedule, history, translations, tags and
duplicate work as described in [Editing content](./editing-content.md). An entry reached
through a link to `/content/<id>`, such as a search result, moves to its databag's path.

## Using entries elsewhere

- A `content` field can point at a databag type, so a page can reference a product.
- Workflow triggers and conditions offer databag types next to document types.
- Roles grant per-type rights on databag types like on document types.
- The delivery API and GraphQL serve published entries like other documents; `/v1/types` reports them with `kind: data`.
