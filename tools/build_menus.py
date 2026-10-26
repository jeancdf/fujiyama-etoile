"""Régénère data/menus.js à partir de data/menus.json.

À lancer après chaque modification de la carte :
    python tools/build_menus.py
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
menus = json.loads((root / "data" / "menus.json").read_text(encoding="utf-8"))
(root / "data" / "menus.js").write_text(
    "/* Généré depuis data/menus.json — ne pas éditer à la main. */\n"
    "window.MENUS = " + json.dumps(menus, ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print(f"{sum(len(c['items']) for c in menus)} articles dans {len(menus)} catégories -> data/menus.js")
