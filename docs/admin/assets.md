---
title: 'Assets'
description: "The space's file library: uploading, what a space accepts, the image editor, and how assets reach a frontend."
---

**Assets** is the space's library: a grid that is also a drop target, a toolbar to narrow
it by type, tag or search, and a panel for the selected file. The view toggle switches
between the grid and a table with columns. Select several with `Ctrl`/`Cmd`-click, a range with `Shift`, or by
dragging a box across the grid; `Cmd+A` selects everything shown.

Images are served resized through named presets (`thumb`, `card`, `hero` by default),
which are configured on the instance; see
[Storage and media](../configuration/storage-and-media.md).

## Uploading

Drop files onto the grid or use the upload button. Every file is checked against the effective
limits (below) and its bytes are sniffed before the declared type is believed. Each asset
records its filename, size, dimensions, a checksum, and an **alt** text and **title** you
can edit in the panel: the alt text is what a frontend should put on `<img>`.

An asset field in a document opens a picker over this library, filtered to what the
field accepts.

## What a space accepts

**Settings > Spaces >** a space's panel **> Uploads** sets which file types the library
takes and how large a file may be. The types are picked from a list: the families
(`image/`, `video/`, `audio/`, `font/`, `text/`) pinned at the top, then the hundred or
so exact types that cover what gets uploaded in practice, searchable by name, type or
extension; a well-formed type that is not in the list can be typed in and added.

The instance's own limits (`ALLOWED_MIME_TYPES` and `FILE_MAX_SIZE_MB`) and the upload
rules set through the [control API](../configuration/controls.md#upload-rules) are the
ceiling: a space can only narrow them. Ticking nothing follows the ceiling. A type outside
it or a size above it is refused at save time, naming the bound:
`space.assets.mimeType.outsideInstance` and `space.assets.maxFileSize.aboveInstance` for
the instance's env limits, `space.assets.mimeType.outsideControl` and
`space.assets.maxFileSize.aboveControl` (with the control's `max`) for a control. So the
form always shows what will apply. When a control sets a bound, the panel shows it at the
top with a lock; it cannot be changed from the admin.

The upload route holds every file to the *effective* rules (the strictest of the env, the
controls and the space's settings), and the file picker in the library offers only those
types. The settings live in the space's `settings.assets` and go through
`spaces.setAssetSettings`; `assets.limits` returns `effective`, the `ceiling` a space may
narrow (env and controls), the env limits as `instance` and the control bounds as
`controls` (`null` where a control is unset). In these, an `allowedMimeTypes` of `null`
admits every type and an empty list admits none.

## Editing an image

Select an image and choose **Edit**. The editor has three modes, because cropping and
placing the focal point are different gestures on the same picture and sharing one stage
made every click near the frame ambiguous:

- **Crop**: drag the frame or its handles. The shape buttons lock the frame to a ratio (1:1, 4:3, 3:2, 16:9, the original's) or free it. **Whole image** removes the crop.
- **Focal point**: click where the subject is. **Centre** removes it.
- **Colour**: brightness, contrast, saturation and hue, plus one of the looks (grey, sepia, invert). The stage shows the result as you drag.

Above the modes, and belonging to the picture rather than to any one of them:
**turn a quarter left or right**, and **mirror** left to right or top to bottom. The crop
and the focal point are turned and mirrored with the picture, so they keep framing what
they framed.

**What variants keep** previews a square, a wide and a tall shape, cut and coloured the
same way the server does.

Every edit is **non-destructive**. The original bytes are never changed; the edits are
kept on the asset (`crop` in the turned image's pixels, `focalPoint` as fractions of the
cropped image, plus `rotate`, `flipHorizontal`, `flipVertical`, `adjust` and `effect`)
and every resized variant is rendered through them, in this order:

1. the image is oriented from its EXIF data, then mirrored, then turned;
2. the crop is applied;
3. a preset that fixes both sides with `fit: 'cover'` then keeps the window around the focal point, as close to centred on it as the edges allow, instead of the middle;
4. the resize itself;
5. the colour adjustments and the look, last, because adjusting a thumbnail's worth of pixels is cheaper than adjusting the original's and the result is the same.

Only what actually changes something is stored: a neutral slider and an unturned image
leave nothing on the asset.

Saving drops every variant rendered so far, and variant URLs carry the asset's version,
so a browser or CDN holding the previous rendering as immutable fetches the new one.
The delivery API exposes `focalPoint` and `crop` on every asset for a frontend that
renders the original itself, e.g. as CSS `object-position`.

## Availability windows

An asset has no draft or published state of its own: what makes it reachable on the public
API is a published document that references it. The detail panel's **Availability**
section adds a window on top of that, with the two dates a document has:

| Field | What it does |
| --- | --- |
| **Publish at** | The public API starts serving the file at this time |
| **Unpublish at** | It stops serving the file at this time, whichever document links to it |

Either can be set on its own, and a window must close after it opens.

Nothing runs in the background for this. The dates are read on every request that serves
the bytes, so an asset outside its window answers `404` on the public instance even where
a published document still points at it. The management instance ignores the window, so an
editor can always see what they scheduled.

Because a file that is due to come down must not sit in a CDN past its date, a scheduled
asset is served with a `Cache-Control` lifetime that ends at its next boundary rather than
the usual year. Documents that reference the asset are not rewritten; only the binary
stops resolving.

## Sharing between spaces

An asset can be in several spaces at once. The detail panel's **Spaces** section is a
multi-pick over the spaces you are a member of: tick another space and the same file
appears in its library too, untick one and it leaves that library. It is one record
wherever it is opened, so the name, the alt text, the image edits and the availability
window are the same in every space, and so is its storage key.

- Changing the set takes `asset:write` in the space the panel is open in and in every space the asset joins or leaves. A space you may not upload to is shown but locked.
- An asset is always in at least one space (`asset.spaces.required`), so the last ticked space cannot be unticked.
- A space you are not a member of is not listed, and is kept as it is when you save; the panel says how many there are.
- Taking the asset out of the space you are working in closes the panel, since it no longer belongs to this library.

An upload only de-duplicates within its own space: the same bytes in a space you cannot
see are uploaded again rather than borrowed. Over the API the set is `assets.setSpaces`,
and every asset the management API returns carries its `spaceIds`.

## Deleting

Deleting an asset that is only in this space removes its record, its rendered variants
and the file, and asks first. An asset another space also holds is only **removed from
this space**: the button says so, and the other spaces keep it. Either way a document
that referenced it here keeps the id; the delivery API resolves it to nothing.

Deleting a space works the same way: the assets only it held go with it, a shared one
only loses that space.

## Tags

The panel beside the file's name and alt text holds its **tags**. They narrow the library
through the toolbar's **Tags** button, and the search box matches them too, so a file
called `DSC_0431.jpg` is found by the label someone gave it. An asset shared with another
space keeps a separate set per space. See [Tags](./tags.md).

## What a frontend gets

An asset over the delivery API is its metadata, its `tags`, plus a `url` for the original
and `variants`, a map of preset name to a signed URL. The SDK's `assetUrl(asset, { preset })`
and `assetSrcSet()` read those. On the public API only assets that a **published**
document references resolve. See [The SDK](../delivery/sdk.md#assets).
