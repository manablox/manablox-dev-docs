---
title: 'Menus'
description: "A site's navigations (main, footer, legal) built from documents and links, nested to any depth, and fetched by name."
---

**Menus** is where a site's navigations are built: `main`, `footer`, `legal`, as many as
the site renders. A menu is not the content tree: the tree says where a document lives,
a menu says where it is linked from, and a document may be linked from any number of
them.

## Building one

The list on the left holds the space's menus; **New menu** creates one from a name and a
technical name. The editor then holds the entries:

- **Add document** picks a document of the space: any type whose "Can appear in menus" switch is on. The entry follows the document across languages: it names the document, not one translation, so the site fetching the menu in `de` gets the German page, and a document with no translation in a language is left out there.
- **Add link** adds an entry with a label and an address, for anything that is not a document: an external site, a mailto, a path the frontend handles itself.
- A link entry also says where it opens: **The same tab**, or **A new tab** for an address that leaves the site. The row shows a `new tab` badge when it is the latter. The value travels to the site as the HTML `target` attribute, so a template can put it straight on the anchor; a document entry always opens in the same tab.
- Entries are ordered and nested by dragging the handle at the left of a row: the line between two rows is the drop target for ordering, and dropping onto a row nests the entry under it. The arrows that appear on a row do the same by keyboard, and are the way on a touch screen. A row opens to its label and address; a label typed on a document entry overrides the document's title in that menu.

The whole menu is saved at once. A document's own editor shows which menus it is in,
under **Placement**, with a link to each; deleting a document's last translation removes
it from every menu.

The other way round, a document can be put into several menus at once from its own
editor: **In menus** has a button that opens a picker listing every menu of the space,
each with a tick box and, once ticked, the entry it nests under and its position among
its siblings. Saving puts the document at that spot in every ticked menu and takes it out
of the others in one write. An entry that moves keeps its id, so it is a move rather than
a delete and a re-add; an entry that leaves a menu leaves its sub-entries behind, one
level up. Editing the picker takes `menu:write`.

Seeing menus takes `menu:read`; editing takes `menu:write`.

## Fetching one

The site fetches a menu by its technical name, and gets the entries nested, each with a
label, the link's `url` or the document inlined as `content`, resolved for the requested
locale and **published documents only**: an entry whose document is not published is
left out.

```ts
const menu = await cms.menu('main');
for (const item of menu?.items ?? []) {
  item.label;      // the override, or the document's title
  item.href;       // the link's url, or the document's root-relative permalink
  item.target;     // '_self', or '_blank' for an entry set to open in a new tab
  item.children;   // nested entries
}
```

Over REST it is `GET /v1/menus/main`; in GraphQL `menu(name: "main")`. See
[Delivering content](../delivery/index.md).
