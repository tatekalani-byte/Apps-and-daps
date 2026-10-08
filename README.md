# Apps & Daps ✦

A mood-board style closet app. Snap pics of your clothes, scroll your closet like a Pinterest board, and collage outfits together.

## What it does
- **Closet**: masonry grid of your pieces. Filter by category, search by name, color or tag, and show only favorites.
- **Add a piece (+)**: take a photo or pick from your camera roll (you can pick several at once), then name it and tag it with a category and color.
- **Cutouts**: the background is cut out automatically when you add a photo. It works best on a plain background that contrasts with the piece. **Touch up cutout** opens a cut tool with a wand (tap to remove a patch of color), a shape tool (tap points around an area), and erase/restore brushes.
- **Jackets & layering**: for Outerwear, **Cut out the inside** finds the lining/back panel showing through the open front and removes it. On the board, a cut-out jacket snaps over the top that's already there, and you can tap through the opening to grab the shirt underneath.
- **Style**: tap pieces to pin them on a board. Drag to move them, and pinch to resize and twist (or use the buttons). Hit 🎲 **Shuffle** for a random fit.
- **Sample closet**: on an empty closet, **✨ Try a sample closet** loads 20 illustrated vintage pieces and 3 layered looks. Remove them anytime from the ⋯ menu.
- **Looks**: your saved outfits, labeled with a vibe. Tap one to keep editing it.

Everything, photos included, is saved **on your device** (IndexedDB). There's no account and no server, and cutouts are computed on the phone. Clearing your browser's site data wipes the closet, so use **⋯ → Save backup file** now and then. The same menu restores a backup, for example onto a new phone.

## Run it
It's plain HTML/CSS/JS with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To use it on your phone, host it anywhere static. For example, turn on **GitHub Pages** for this repo (Settings → Pages → deploy from branch). Then open the link on your phone and choose **Add to Home Screen** so it works like an app, offline too.
