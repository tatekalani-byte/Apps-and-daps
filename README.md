# Apps & Daps ✦

A mood-board style closet app. Snap pics of your clothes, scroll your closet like a Pinterest board, and collage outfits together.

## What it does
- **Closet**: just the clothes, in a clean grid. Filter by category, search by name, color or tag, and show only favorites.
- **Add a piece (+)**: take a photo or pick from your camera roll (you can pick several at once), then name it and tag it with a category and color.
- **Cutouts**: the background is cut out automatically when you add a photo. It works best on a plain background that contrasts with the piece. **Touch up cutout** opens a cut tool with a wand (tap to remove a patch of color), a shape tool (tap points around an area), and erase/restore brushes.
- **Measurements**: when you add a piece, enter one measurement (length for clothes, heel to toe for shoes, width for bags and extras), in inches or cm. Outfits use it to size pieces in true proportion, and a typical size fills in if you skip it.
- **Jackets & layering**: a jacket keeps its full look (lining and back showing) in the closet. For layering, tap **Mark the inside for layering** and draw around the lining that shows through the open front (or use Auto-detect). That version is used only when the jacket is worn over a top, so the top shows through and its sleeves stay hidden.
- **Style**: tap a piece to put it on and it snaps into place. Tops hang from the shoulders, bottoms start at the waist, shoes stand on the floor, jackets go over everything, and bags, hats and jewelry are set alongside. A new top swaps out the old one, and a dress replaces the top and bottoms. Tap a piece again to take it off. Drag to nudge a piece a few inches, use **Tuck in** for tops, and **Snap back** to reset. 🎲 **Shuffle** picks a random fit.
- **Sample closet**: on an empty closet, **✨ Try a sample closet** loads 20 illustrated vintage pieces and 3 layered looks. Remove them anytime from the ⋯ menu.
- **Looks**: your saved outfits, labeled with a vibe. Tap one to keep editing it.

Everything, photos included, is saved **on your device** (IndexedDB). There's no account and no server, and cutouts are computed on the phone. Clearing your browser's site data wipes the closet, so use **⋯ → Save backup file** now and then. The same menu restores a backup, for example onto a new phone.

## Test-drive build
`python3 scripts/build_demo.py out.html` bundles everything into one page that opens with the sample closet loaded.

## Run it
It's plain HTML/CSS/JS with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To use it on your phone, host it anywhere static. For example, turn on **GitHub Pages** for this repo (Settings → Pages → deploy from branch). Then open the link on your phone and choose **Add to Home Screen** so it works like an app, offline too.
