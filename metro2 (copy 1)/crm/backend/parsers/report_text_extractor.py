#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import pdfplumber


def extract_text(pdf_path: Path) -> dict:
    if not pdf_path.exists():
        raise FileNotFoundError(str(pdf_path))
    pages = []
    full_text = []
    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            pages.append({"number": idx, "text": text})
            if text:
                full_text.append(f"--- Page {idx} ---\n{text}")
    return {"text": "\n\n".join(full_text), "pages": pages}


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: report_text_extractor.py <report.pdf> <output.json>", file=sys.stderr)
        return 1
    pdf_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    payload = extract_text(pdf_path)
    output_path.write_text(json.dumps(payload), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
