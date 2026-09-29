---
title: 'Keyboard shortcuts'
description: 'The keys the admin answers to, where each one applies, and the help dialog that lists the ones on the page you are looking at.'
---

The admin is meant to be worked, not clicked through. The keys below are the same on
every screen that has them, and you never have to remember which page has which: press
`?` and the help dialog lists exactly what the keyboard does right now.

## The help dialog

`?` opens it, and so does the keyboard button in the top bar, immediately left of the
bell. It has one section per group of keys, and it is built from the shortcuts that are
actually bound at that moment, so it cannot go stale:

- **This page**, the keys the open page brought with it. They leave when you navigate away.
- **Editing**, on an editor: save, undo, redo.
- **Go to**, the sections you can reach, filtered by what your role may see.
- **Everywhere**, the keys that never change.

A row shown dimmed is bound but has nothing to act on yet: Redo with an empty history,
Delete with nothing selected. It is listed anyway, because it tells you the key exists
and what would make it work.

## When keys are live

- **A key with `Cmd` or `Ctrl` works while you are typing.** Saving from inside the field you are typing in is the point of it.
- **A single-letter key waits until you leave the field.** In a text box, `n` is the letter n.
- **A dialog owns the keyboard.** While one is open the page's own keys stand down, so `n` in a dialog's field is a letter and not a second dialog. `Esc` and the buttons are the way out.

`mod` below means `Cmd` on a Mac and `Ctrl` everywhere else. The help dialog prints
whichever one your keyboard has.

## Everywhere

| Key | What it does |
| --- | --- |
| `?` | Open the keyboard shortcuts |
| `[` | Toggle the sidebar |
| `]` | Toggle the panel beside the page: the tree, the templates, the types, the menus, the workflows |
| `Esc` | Close the open drawer, on a narrow screen |

## Going somewhere

`g` followed by a letter jumps to a section. Press `g`, let go, then the letter; the
sequence forgets itself after a moment if you stop.

| Key | Section |
| --- | --- |
| `g` `d` | Dashboard |
| `g` `c` | Content |
| `g` `t` | Templates |
| `g` `b` | Databags |
| `g` `m` | Menus |
| `g` `w` | Workflows |
| `g` `h` | Webhooks |
| `g` `y` | Content types |
| `g` `x` | Databag types |
| `g` `r` | Redirects |
| `g` `a` | Assets |
| `g` `l` | Activity |
| `g` `s` | Settings |
| `g` `n` | Notifications |
| `g` `p` | Your profile |

A section your role cannot see has no key either, the same way it has no sidebar entry.
A [plugin](../extending/plugins.md) that adds a section can claim a free letter
with `shortcut` on its menu item.

## On a page

| Key | Where | What it does |
| --- | --- | --- |
| `/` | Any page with a search box | Put the cursor in it and select what is there |
| `n` | Content, Templates, Menus, Workflows, Webhooks, Content types, Settings > Spaces | Start a new one |
| `b` | Content types | Start a new block type |
| `u` | Assets | Upload files |
| `r` | Notifications | Mark everything read |
| `mod+a` | Assets | Select every asset |
| `Esc` | Assets | Clear the selection |
| `Del` | Assets | Delete the selected assets |

## In an editor

| Key | What it does |
| --- | --- |
| `mod+s` | Save |
| `mod+z` | Undo, in the document editor |
| `mod+shift+z` | Redo, in the document editor |
| `mod+Enter` | Publish, in the document editor |

All four work while a field has focus.
