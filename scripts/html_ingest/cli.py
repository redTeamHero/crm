"""Command line interface for HTML ingestion."""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Sequence

from . import db
from .ingest import export_documents, iter_html_files, parse_html, save_documents

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class HTMLIngestCLI:
    """Drive ingestion and export workflows from the command line."""

    def __init__(self, connection=None) -> None:
        self.connection = connection

    def ingest(self, paths: Sequence[Path]) -> None:
        connection = self.connection or db.get_connection()
        try:
            documents = []
            for path in paths:
                logger.info("Scanning %s", path)
                for html_file in iter_html_files(path):
                    logger.info("Parsing %s", html_file)
                    documents.append(parse_html(html_file))
            if not documents:
                logger.warning("No HTML files found. Nothing to ingest.")
                return

            save_documents(connection, documents)
            logger.info("Stored %s document(s) in MySQL", len(documents))
        finally:
            if self.connection is None:
                connection.close()

    def export(self, document_ids: Sequence[int] | None = None, pretty: bool = True) -> str:
        connection = self.connection or db.get_connection()
        try:
            payload = export_documents(connection, document_ids=document_ids)
            if pretty:
                data = json.loads(payload)
                payload = json.dumps(data, indent=2)
            logger.info("Exported %s document(s)", len(json.loads(payload)))
            return payload
        finally:
            if self.connection is None:
                connection.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest HTML files and export normalized JSON")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_parser = subparsers.add_parser("ingest", help="Parse HTML files into MySQL")
    ingest_parser.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="Path(s) to HTML file(s) or directories containing HTML files",
    )

    export_parser = subparsers.add_parser("export", help="Export normalized JSON from MySQL")
    export_parser.add_argument(
        "--ids",
        nargs="*",
        type=int,
        default=None,
        help="Optional document IDs to export. If omitted, exports all documents.",
    )
    export_parser.add_argument(
        "--compact",
        action="store_true",
        help="Return minified JSON instead of pretty printed output.",
    )

    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    cli = HTMLIngestCLI()

    if args.command == "ingest":
        cli.ingest(args.paths)
    elif args.command == "export":
        payload = cli.export(document_ids=args.ids, pretty=not args.compact)
        print(payload)
    else:  # pragma: no cover - defensive programming
        raise ValueError(f"Unknown command: {args.command}")


if __name__ == "__main__":  # pragma: no cover
    main()
