---
title: 'Tags'
description: 'Free-form labels on documents and assets, used to filter the admin and to narrow what the delivery API returns.'
---

A **tag** is a label an editor puts on a document or an asset. Tags belong to the space,
not to a content type, so one tag can gather a magazine article, a landing page and a
photo. They are free-form: typing a name that does not exist yet creates it.

## Tagging something

A document's editor has a **Tags** box in its right-hand column. Typing a name offers the
space's existing tags; Enter or a comma adds one, Backspace on an empty box takes the last
one off. Tags are saved with the document, so they land with the next save.

Tags belong to the document, not to one translation: tagging the English article tags the
German one too, and both editors show the same list. That keeps a tag language-neutral,
which is what a filter over the whole space needs.

An asset carries its own tags, in the panel beside the file's name and alt text. An asset
that is shared with another space keeps a separate set of tags per space, since the
vocabulary belongs to the space.

Tagging takes the same permission as the thing being tagged: `content:write` for a
document, `asset:write` for an asset.

## Finding things by tag

Both **Content** and **Assets** have a **Tags** button next to their search box. Picking
one or more tags narrows the list to whatever carries any of them, and the search box and
the tag filter combine.

The free-text search matches tags too: searching `okapi` in **Content** finds a document
whose title and text never mention okapis but which carries the tag "Okapi", and the same
holds for the asset library. That is on purpose, so an editor who remembers only the label
still finds the file.

## Keeping the vocabulary tidy

**Settings**, **Tags** lists every tag of the space with how many documents and assets
carry it, and three actions:

- **Rename** changes the label everywhere at once. Whatever carries the tag keeps it.
- **Merge** moves everything tagged with one onto another and deletes the first. Use it
  when two spellings of the same thing have grown apart ("Foto" and "Photo"). Something
  carrying both ends up with the surviving tag once.
- **Delete** removes the tag from everything that carries it. Nothing else changes.

Managing the vocabulary takes `content:write`; reading it only takes access to the space,
so an asset editor sees the same suggestions.

Renames, merges and deletions are recorded in [Activity](./activity.md).

## Reaching them from a frontend

Published documents carry their tags in the delivery API, and a list can be narrowed to
them:

```ts
const posts = await cms.list({ type: 'article', tags: ['travel'] });
posts.items[0]?.tags; // [{ name: 'Travel', slug: 'travel' }]
```

`tags` takes slugs, and a document carrying any of them matches. Over REST it is
`GET /v1/content?tags=travel,food`; in GraphQL `contentsPage(tags: "travel,food")`, with
`tags { name slug }` on a document or an asset. See
[Delivering content](../delivery/index.md).

Assets deliver their tags too, on `/v1/assets/{id}` and on any asset inlined into a
document through `expand`.
