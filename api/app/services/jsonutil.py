import json
from typing import Any


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads(raw: str | None, default: Any = None) -> Any:
    if not raw:
        return default
    return json.loads(raw)
