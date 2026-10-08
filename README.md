# Apps & Daps ✦

A mood-board style closet app. Snap pics of your clothes, scroll your closet like a Pinterest board, and collage outfits together.

## What it does
- **Closet**: masonry grid of your pieces. Filter by category, search by name, color or tag, and show only favorites.
- **Add a piece (+)**: take a photo or pick from your camera roll (you can pick several at once), then name it and tag it with a category and color.
- **Style**: tap pieces to pin them on a board. Drag to move them, and pinch to resize and twist (or use the buttons). Hit 🎲 **Shuffle** for a random fit.
- **Looks**: your saved outfits, labeled with a vibe. Tap one to keep editing it.

Everything, photos included, is saved **on your device** (IndexedDB). There's no account and no server. Clearing your browser's site data wipes the closet.

## Run it
It's plain HTML/CSS/JS with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To use it on your phone, host it anywhere static. For example, turn on **GitHub Pages** for this repo (Settings → Pages → deploy from branch). Then open the link on your phone and choose **Add to Home Screen** so it works like an app, offline too.
