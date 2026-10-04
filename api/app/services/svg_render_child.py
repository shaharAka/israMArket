"""Renders one sanitised SVG to PNG for services/svg_logo.py, in its own process.

    python -I -B svg_render_child.py BOX FONTS CPU_SECONDS MEMORY_BYTES  < svg  > png

The parent starts it with an empty environment, in an empty working directory, and kills
it at the wall-clock timeout. Here it caps its own CPU time, address space and file writes
before the renderer is loaded. It imports nothing from the app.

Exit codes: 0 the PNG is on stdout, 2 the renderer refused or failed, 3 no renderer.
"""

import sys


def _limit(cpu_seconds: int, memory_bytes: int) -> None:
    try:
        import resource
    except ImportError:  # not POSIX: the parent's timeout still holds
        return
    for name, soft, hard in (
        ("RLIMIT_CPU", cpu_seconds, cpu_seconds + 1),
        ("RLIMIT_AS", memory_bytes, memory_bytes),
        ("RLIMIT_FSIZE", 0, 0),
        ("RLIMIT_CORE", 0, 0),
    ):
        limit = getattr(resource, name, None)
        if limit is None:
            continue
        try:
            resource.setrlimit(limit, (soft, hard))
        except (ValueError, OSError):  # macOS refuses RLIMIT_AS; Linux, where we deploy, keeps it
            pass


def main() -> int:
    box, fonts, cpu_seconds, memory_bytes = int(sys.argv[1]), sys.argv[2] == "1", int(sys.argv[3]), int(sys.argv[4])
    _limit(cpu_seconds, memory_bytes)
    try:
        import resvg_py
    except ImportError:
        return 3
    try:
        svg = sys.stdin.buffer.read().decode("utf-8")
        # Fits the drawing in a BOX x BOX square, so the pixel count is capped whatever the
        # SVG declares. dpi 96 makes mm, pt and in mean what a browser means by them.
        png = resvg_py.svg_to_bytes(svg_string=svg, width=box, height=box, dpi=96.0, skip_system_fonts=not fonts)
    except Exception:
        return 2
    sys.stdout.buffer.write(bytes(png))
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
