"""Report adapter interfaces for HTML and PDF inputs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol


class ReportAdapter(Protocol):
    def parse(self, source: Any) -> dict:
        """Parse the input source into a canonical report payload."""


@dataclass(frozen=True)
class IdentityIQHtmlAdapter:
    parser: Callable[[Any], dict]

    def parse(self, source: Any) -> dict:
        return self.parser(source)


@dataclass(frozen=True)
class IdentityIQPdfAdapter:
    parser: Callable[[Path], dict]

    def parse(self, source: Any) -> dict:
        return self.parser(_coerce_path(source))


@dataclass(frozen=True)
class ReportAdapterFactory:
    html_parser: Callable[[Any], dict]
    pdf_parser: Callable[[Path], dict]

    def adapter_for(self, source: Any) -> ReportAdapter:
        if is_pdf_source(source):
            return IdentityIQPdfAdapter(self.pdf_parser)
        return IdentityIQHtmlAdapter(self.html_parser)


def is_pdf_source(source: Any) -> bool:
    if isinstance(source, Path):
        return source.suffix.lower() == ".pdf"

    if isinstance(source, str):
        stripped = source.strip()
        if stripped.startswith("%PDF"):
            return True
        if "<" in stripped and ">" in stripped:
            return False
        candidate = Path(stripped)
        if candidate.exists():
            return candidate.suffix.lower() == ".pdf"
        return stripped.lower().endswith(".pdf")

    return False


def _coerce_path(source: Any) -> Path:
    if isinstance(source, Path):
        return source
    if isinstance(source, str):
        return Path(source)
    raise TypeError("PDF adapter requires a filesystem path")
