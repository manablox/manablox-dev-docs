---
title: 'Editing content'
description: 'The content tree, folders, templates, the document editor, blocks, translations, versions, publishing, and the visual editor.'
---

## The tree

**Content** shows the space's documents as a tree, in the language chosen in the top
bar. Search above narrows it. **New** starts a document of any type you may write; a
document created while another is selected becomes its child.

- **Drag** a row to move it: between siblings to reorder, onto a row to nest under it. Moving a document moves its subtree and recomputes every permalink beneath it.
- **Delete** a row from the tree; a row with documents under it asks whether they go with it or move up into its place.
- **Star** a document to make it the space's home page; the API serves it for the empty permalink.
- Documents of a type with *Visible in tree* off do not appear here; they are reached from the fields that reference them.
- The tree loads as you use it: the top level first, a row's children the first time you expand it, and fifty rows of a level at a time as you scroll further down it. Opening a document expands the rows above it, so it is visible where it sits.
- Which rows are open is remembered per space and language, so the tree comes back the way it was left; it reopens them level by level as each level loads. Drag the panel's right edge to make it wider or narrower - that is remembered too, and the arrow keys move it a step at a time once the edge has focus.

### Folders

**New folder**, in the `+` menu at the top of the tree or on a row, adds a folder under
the root or under that row. A folder only groups documents: it has no address, so
nothing inside it moves to a longer URL, and it is never published and never appears in
a menu. Naming it is all there is to it; the folder is written in every language of the
space at once, so the tree looks the same in each.

A folder is edited like any other document (its title is all it has) and is deleted the
same way; deleting one asks whether what is inside it goes too or moves up a level.

### Templates

**Templates** in the sidebar lists the block lists this space reuses. A template is
edited in the ordinary editor and published like a page; documents pointing at it
through a *Content template* field render whatever the published template says. Until a
template is published, those documents deliver an empty block list.

Templates are not in the content tree on purpose: they are pieces used by pages, not
pages of their own.

**Describe a template** on the Templates page lays one out from a sentence or two, when
the instance loads the [AI plugin](./ai.md#the-ai-plugin) and the space has an AI provider: blocks from the space's own block types, sample copy in
each, and a new block type for any section none of them fits, created with it. The
template opens as a draft. See [Designing with AI](./ai.md#designing-with-ai).

## The editor

The editor is the type's fields laid out as the builder arranged them: the main column
and a sidebar, in the order and widths given. The header shows the type, the title and a
status badge (*draft*, *live*, or *changed* when the document was saved after it was
last published) and the actions.

On a **new** document the slug fills itself in from the title, using the same `slugify`
the server falls back to when a document is saved with an empty slug, so the field
shows what would have been stored anyway. It stops following as soon as you type a slug
of your own, and it never follows on an existing document: that slug is part of a live
permalink, and retitling a page must not silently move it.

| Button | Enabled when |
| --- | --- |
| Save (`Cmd+S`) | There are unsaved changes. Undoing an edit by hand disables it again |
| Publish | The document has never been published, or has been changed since it was |
| Unpublish | The document is published |
| Undo / Redo | There is something to undo or redo in this editing session |
| Visual | The space has a frontend URL. See below |

Leaving the page with unsaved changes asks first. A save that the server refuses because
someone else saved in between (`content.version.conflict`) shows both version numbers;
reload to pick up theirs.

A save the server refuses over the values themselves marks every field it complained
about, with the message under it, and brings the first one into view and into focus. The
marking follows the error's path upwards, so a block holding a bad field is outlined too,
in the list and on the grid; a closed block still shows that something inside it is
wrong.

### Blocks

A `blocks` field is the page builder, and it has two shapes.

**As a list**, which is what it is until a grid is chosen: **Add block** offers the
allowed block types, each block opens to its own fields, and blocks are reordered by
dragging or with the *move up* and *move down* buttons. A block's fields may themselves
contain blocks.

**On a grid**, once **Layout** has one, the board becomes the editor and the list steps
aside - the board already says everything the list says, and says it in the shape the
page has.

- **Draw on empty ground to add a block.** Click one cell for a block that size, or press and drag across several for a wider or taller one. The rectangle stops short of any cell a block already covers, so what you draw is always somewhere a block can go. Where the field allows more than one block type, a short dialog asks which; where it allows one, that one goes straight in.
- **The block's fields open in a dialog** the moment it is added, and again whenever its card is clicked - with **Delete** beside **Done**, and a line saying where the block sits.
- **Drag a card to move it, or any of its edges to resize it.** The cursor says which: over the middle it is a hand, over an edge or a corner it is the resize arrow for that direction. An edge moves that side alone - the right edge widens, the top edge shortens from above - and a corner moves two. Nothing has to be selected or opened first. The steppers under the board do the same by number, and hand a block back to the grid.
- The board is per breakpoint: the switch above it moves between desktop, tablet and mobile, and a block dragged at one breakpoint takes its own placement there while the others carry on following desktop.
- **Show as a list** brings the list back when it is wanted - for reordering the blocks the grid places itself, or for reading a long page in order.

### Repeaters

A `repeater` field is a list of items that all have the same sub-fields, the ones set on
the field in the content type. Items can be added, removed, reordered and collapsed, and
each opens to its own sub-fields. A bad value inside an item marks that sub-field.

### Translations, placement, history

- The **translation switcher** in the header shows every locale of the space when there is more than one: the translations that exist open, the others are started from here. See [Locales and translations](../content-model/localisation.md).
- **Placement** in the sidebar holds the document's position among its siblings and, for a type that can appear in menus, the menus it is in, each linked.
- **Tags** in the sidebar labels the document. A name that does not exist yet is created on save, and the tags are shared by every translation. Search and the tag filter on the Content page both read them; see [Tags](./tags.md).
- **History** lists every saved version, with who and when, and **Restore** on each. Restore saves the snapshot as a new version, so it can itself be undone.

## Publishing

Publishing copies the draft to the published copy the public API serves; unpublishing
removes it and every published descendant, and sets each of them back to draft. The rules are in
[Drafts, publishing and versions](../content-model/publishing.md). Publishing needs
`content:publish`, which an *author* does not hold.

For a type that *needs approval before publishing*, the sidebar has an **Approval**
panel: an author asks for approval there (a request also opens by itself when the
author creates the document), and whoever can publish the type is told and approves or
sends it back with a note. See [Notifications and approvals](./notifications.md#approval-before-publishing).

## The visual editor

**Visual** opens the space's frontend in a frame beside the fields and pushes the draft
into it on every keystroke, unsaved. Clicking a field in the preview selects it in the
form; blocks can be reordered from inside the preview. It needs the space's *Frontend
URL* and a frontend that implements a `/preview` route. See
[Preview and the visual editor](../delivery/preview.md).

## Duplicating

**Duplicate** makes a copy of the document beside the original: the same type, the same
parent, the same field values, with `(copy)` on the title and a free slug. The copy is a
**draft** however the original stood, because a copy nobody has read yet has no business
being live, and every block in it gets a fresh id, since two documents sharing one would
have the visual editor addressing both at once.

The copy is made from the last **saved** version, so the editor asks first when there
are unsaved changes. It is offered in the editor's header, and on hover in the content
tree. Templates are documents like any other, so a template is duplicated the same way,
from the template editor.

A document the config owns is copied as an ordinary one: a second row claiming its
declaration would be rewritten by the next sync. See
[Resources in code](../configuration/resources-in-code.md).

## Deleting

**Delete document** removes the document, its published copy and its versions, and asks
first. Deleting a document's last translation removes it from every menu.

A row in the tree has its own delete button, which asks the same way. When the row has
documents under it, the question comes with a choice: keep them, in which case they move
up into the place the deleted row held, or delete them along with it. Kept documents take
their own subtrees with them, and every permalink beneath them is recomputed, published
copies included.
