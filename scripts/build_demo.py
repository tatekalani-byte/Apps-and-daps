"""Bundle the app into one self-contained HTML page (the chat test-drive build).

Usage: python3 scripts/build_demo.py OUTPUT.html
The page auto-loads the sample closet (window.APP_DEMO) and hides backups."""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
head = html.split("<head>")[1].split("</head>")[0]
body = html.split("<body>")[1].split("</body>")[0]
fonts = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', head).group(0)
body = re.sub(r'\s*<script src="[^"]+"></script>', "", body)
scripts = "".join(f"\n<script>\n{(root / f).read_text()}\n</script>" for f in ["cutout.js", "samples.js", "app.js"])

Path(sys.argv[1]).write_text(f"""<title>Apps &amp; Daps</title>
<meta name="description" content="Snap your clothes, scroll your closet, style your outfits.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fonts}
<style>
{(root / "styles.css").read_text()}
</style>
{body}
<script>window.APP_DEMO = true;</script>{scripts}
""")
