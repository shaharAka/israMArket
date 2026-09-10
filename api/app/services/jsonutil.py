import json
from typing import Any


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads(raw: str | None, default: Any = None) -> Any:
    """Parse stored JSON, falling back to `default` on anything unusable.

    Every caller already treats the result as best-effort, so raising here turned one
    corrupt column into a 500 for the whole request. `default` is returned for empty,
    malformed, or wrong-shaped data.
    """
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return default
    return default if parsed is None else parsed
