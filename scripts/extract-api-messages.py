"""Inventory source copy only; never imports the app, settings or customer data.

Includes human-readable errors, labels, fallbacks and prompt fragments so the
localization audit can account for them separately. Regexes and docstrings are not
copy. Inventory does not imply that a string is safe to translate inside logic.
"""
import ast
import json
import re
import sys
from pathlib import Path


def inventory(root: Path) -> list[dict]:
    entries = []
    for file in sorted((root / "api/app").rglob("*.py")):
        if file.is_symlink():
            continue
        tree = ast.parse(file.read_text())
        parents = {}
        docstrings = set()
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parents[child] = node
            if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                if node.body and isinstance(node.body[0], ast.Expr):
                    value = node.body[0].value
                    if isinstance(value, ast.Constant) and isinstance(value.value, str):
                        docstrings.add(value)

        for node in ast.walk(tree):
            if node in docstrings:
                continue
            parent = parents.get(node)
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if isinstance(parent, ast.JoinedStr):
                    continue
                text, kind = node.value, "literal"
            elif isinstance(node, ast.JoinedStr):
                parts, index = [], 0
                for part in node.values:
                    if isinstance(part, ast.Constant):
                        parts.append(part.value)
                    elif isinstance(part, ast.FormattedValue):
                        parts.append(f"{{arg_{index}}}")
                        index += 1
                text, kind = "".join(parts), "template"
            else:
                continue
            ancestors, current = [], parent
            while current is not None:
                ancestors.append(current)
                current = parents.get(current)
            # Regular-expression syntax must not become UI translations.
            if any(isinstance(p, ast.Call) and isinstance(p.func, ast.Attribute)
                   and isinstance(p.func.value, ast.Name) and p.func.value.id == "re"
                   and p.args and node in set(ast.walk(p.args[0]))
                   for p in ancestors):
                continue
            names = [target.id for p in ancestors if isinstance(p, ast.Assign)
                     for target in p.targets if isinstance(target, ast.Name)]
            purpose = "copy"
            if any(isinstance(p, ast.Raise) for p in ancestors):
                purpose = "validation"
            elif (file.name == "schemas_llm.py" or any(
                any(word in name.lower() for word in ("prompt", "schema", "system")) for name in names
            ) or any(isinstance(p, (ast.FunctionDef, ast.AsyncFunctionDef))
                     and "prompt" in p.name.lower() for p in ancestors)):
                purpose = "generation-instruction"
            elif any(isinstance(p, (ast.Compare, ast.Match)) for p in ancestors):
                purpose = "logic-reference"
            hebrew = any("\u0590" <= c <= "\u05ff" for c in text)
            if not hebrew and not (purpose == "validation" and re.search(r"[A-Za-z]", re.sub(r"\{arg_\d+\}", "", text))):
                continue
            if not hebrew:
                keyword = next((p for p in ancestors if isinstance(p, ast.keyword)), None)
                if keyword is not None and keyword.arg != "detail":
                    continue
                # Exception machine codes are stable API values, not displayed copy.
                if re.fullmatch(r"[A-Za-z0-9_.:/-]*[_][A-Za-z0-9_.:/-]*", text):
                    continue
            entries.append({"source": text, "reference": {
                "file": str(file.relative_to(root)), "line": node.lineno,
                "kind": kind, "purpose": purpose,
            }})
    return entries


if __name__ == "__main__":
    print(json.dumps(inventory(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]), ensure_ascii=False))
