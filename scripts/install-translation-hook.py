"""Install the repository's translation hook without replacing unrelated hooks."""
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
existing = subprocess.run(["git", "config", "--get", "core.hooksPath"], cwd=root, capture_output=True, text=True)
if existing.returncode == 0 and existing.stdout.strip() != ".githooks":
    print("An existing hooksPath is configured. Preserve it and call scripts/translation-commit.py from its pre-commit hook.", file=sys.stderr)
    sys.exit(1)
(root / ".githooks/pre-commit").chmod(0o755)
subprocess.run(["git", "config", "core.hooksPath", ".githooks"], cwd=root, check=True)
print("Automatic translation sync is installed for commits in this repository.")
