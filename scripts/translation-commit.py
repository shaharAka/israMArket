"""Sync staged copy in isolation; never accidentally stage unrelated edits."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ["web/lib/i18n/source.json"] + [f"web/lib/i18n/messages/{locale}.json" for locale in ("he", "en", "ar", "ru")]


def main():
    changed = subprocess.check_output(["git", "diff", "--cached", "--name-only", "-z"], cwd=ROOT).decode().split("\0")
    relevant = any((name.startswith(("web/app/", "web/components/", "web/lib/", "api/app/"))
                    and name.endswith((".ts", ".tsx", ".py", ".json"))) for name in changed)
    if not relevant:
        return 0
    # Reviewed but unstaged translations must not be overwritten or silently staged.
    if subprocess.run(["git", "diff", "--quiet", "--", *OUTPUTS, "web/lib/i18n/reviewed.json"], cwd=ROOT).returncode:
        print("Translation catalogs have unstaged edits. Stage or preserve those edits before committing; the hook has changed nothing.", file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory(prefix="isramarket-staged-copy-") as temp:
        snapshot = Path(temp)
        subprocess.run(["git", "checkout-index", "--all", "--prefix", str(snapshot) + "/"], cwd=ROOT, check=True)
        result = subprocess.run([sys.executable, str(ROOT / "scripts/sync-translations.py"), "--root", str(snapshot)], cwd=ROOT)
        if result.returncode:
            print("Translation sync did not pass. The commit is blocked; staged source and working files are unchanged.", file=sys.stderr)
            return result.returncode
        for name in OUTPUTS:
            destination = ROOT / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(snapshot / name, destination)
        subprocess.run(["git", "add", "--", *OUTPUTS], cwd=ROOT, check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
