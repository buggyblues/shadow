"""Shadow/OpenClaw Buddy Hermes plugin."""

try:
    from .adapter import register
except Exception:  # pragma: no cover - pytest may import this directory as a loose module.
    from adapter import register  # type: ignore

__all__ = ["register"]
