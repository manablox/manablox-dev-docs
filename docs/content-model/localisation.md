---
title: 'Locales and translations'
description: 'How a space chooses its languages, how a document is translated, what a frontend asks for, and what happens when a translation is missing.'
---

## Locales

Locales belong to the **space**, not the instance: each space picks its own locales and
its own default, in **Settings > Spaces**, from a list of written languages. The default
must be one of the space's locales; the server refuses otherwise
(`space.defaultLocale.notInLocales`). There is no instance wide locale setting in the
config or the environment.

A locale is a code like `en`, `de`, `pt-BR`. The admin's top bar switches the locale you
are working in when a space has more than one.

## Translations

A document is stored **once per locale**. The translations of one logical document share
a `localizationId` and are linked in the admin: the editor's translation switcher shows
every locale of the space, opens the ones that exist and offers to start the ones that
do not. Starting a translation creates a new document in that locale under the same
parent, at the same position, with the source's title and slug to start from; both
can then be changed.

Because each translation is its own row:

- Each may have a different **slug**, so `about` and `ueber-uns` can be the same page. Permalinks are unique per space *and locale*.
- Each has its own **draft and published state**. Publishing the English page does not publish the German one.
- Each has its own **versions**.

## Localised and shared fields

A field is either **localised** (each translation keeps its own value) or **shared**.
Shared is the default. When a shared field is saved on one translation, the value is
copied to every sibling, so a product's price or a page's hero image is edited once.
Mark a field localised in the builder (or `localized: true` in code) when translators
need to change it: a summary, a body, a call-to-action label.

Titles and slugs are always per translation.

A **unique** field follows the same split: a localised one must be unique among the
documents of one locale, a shared one across all locales, and the translations of one
document never clash with each other. See
[Field types](./field-types.md#required-and-unique).

## Menus across locales

A menu entry names a **document**, not one translation. A frontend fetching the menu in
`de` gets the German titles and permalinks; a document with no German translation is
left out of the German menu.

## What a frontend asks for

Every delivery call takes a locale, and falls back to the space's default when none is
given:

```ts
const cms = createClient({ url, locale: 'de' });     // for every call
await cms.byPermalink('/ueber-uns');
await cms.byPermalink('/about', { locale: 'en' });   // for one call
const de = cms.withLocale('de');                      // a second client
```

Over REST it is `?locale=de`; in GraphQL every root field takes a `locale` argument.

A permalink is resolved **within the requested locale**. `about` does not exist in `de`
if the German page is `ueber-uns`, so a site that routes by locale prefix (`/de/...`) strips
the prefix, passes the locale, and asks for the remainder.

There is no automatic fallback to the default locale for a missing translation: a
document that has no German version is simply not found in `de`. A frontend that wants
fallback asks twice.
