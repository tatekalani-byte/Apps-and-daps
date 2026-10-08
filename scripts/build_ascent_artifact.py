"""Make the Claude-artifact version of Ascent from ascent/index.html.

Usage: python3 scripts/build_ascent_artifact.py OUTPUT.html
Removes everything between <!-- standalone-only --> markers (home screen metadata,
install screen, service worker) and the document wrapper, which Claude adds itself."""
import re
import sys
from pathlib import Path

src = (Path(__file__).resolve().parent.parent / "ascent" / "index.html").read_text()
head, body = src.split("<body>\n", 1)
body = body.rsplit("</body>", 1)[0]
body = re.sub(r"<!-- standalone-only -->.*?<!-- /standalone-only -->\n?", "", body, flags=re.S)
title = re.search(r"<title>.*?</title>", head).group(0)
Path(sys.argv[1]).write_text(title + "\n" + body.strip() + "\n")
