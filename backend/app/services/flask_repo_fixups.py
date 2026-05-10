"""
Best-effort fixes for common Flask clones used in Studio preview.

Repos that call ``render_template("index.html")`` but ship ``index.html`` at
repository root (not under ``templates/``) raise ``TemplateNotFound`` because
Flask defaults ``template_folder`` to ``templates`` relative to the app.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


def patch_flask_root_index_template_folder(app_root: Path) -> bool:
    """Point Flask at repo root when ``index.html`` lives next to ``app.py``.

    Leaves standard layouts untouched (``templates/index.html``).

    Returns True if ``app.py`` was modified on disk.
    """
    root = Path(app_root).resolve()
    app_py = root / "app.py"
    if not app_py.is_file():
        return False
    if not (root / "index.html").is_file():
        return False
    if (root / "templates" / "index.html").is_file():
        return False

    txt = app_py.read_text(encoding="utf-8")
    if re.search(r"template_folder\s*=", txt):
        return False

    pat = re.compile(
        r"^(\w+)\s*=\s*Flask\s*\(\s*__name__\s*\)\s*(#.*)?$",
        re.MULTILINE,
    )
    mo = pat.search(txt)
    if not mo:
        return False

    flask_import = "from flask import"
    if "from pathlib import Path" not in txt and not re.search(
        r"\bimport\s+pathlib\b", txt
    ):
        if flask_import in txt:
            txt = txt.replace(
                flask_import,
                "from pathlib import Path\n" + flask_import,
                1,
            )
        else:
            txt = "from pathlib import Path\n" + txt

    base = (
        f"{mo.group(1)} = Flask(__name__, "
        "template_folder=str(Path(__file__).resolve().parent))"
    )
    comment = mo.group(2)
    if comment and comment.strip():
        line = f"{base}  {comment.strip()}"
    else:
        line = base

    matched = mo.group(0)
    if matched.endswith("\r\n"):
        line_nl = line + "\r\n"
    elif matched.endswith("\n"):
        line_nl = line + "\n"
    else:
        line_nl = line

    new_txt = pat.sub(line_nl, txt, count=1)
    if new_txt == txt:
        return False

    app_py.write_text(new_txt, encoding="utf-8")
    logger.info(
        "Flask preview fix: template_folder set to repo root (%s)",
        app_py,
    )
    return True
