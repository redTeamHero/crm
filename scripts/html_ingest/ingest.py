"""HTML ingestion helpers."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence

from bs4 import BeautifulSoup

from . import db


@dataclass
class ParsedHeading:
    level: str
    text: str
    order: int


@dataclass
class ParsedLink:
    href: str
    text: str
    rel: str | None


@dataclass
class ParsedDocument:
    source_path: str
    title: str | None
    meta_description: str | None
    language: str | None
    meta: dict
    headings: List[ParsedHeading]
    links: List[ParsedLink]


def parse_html(path: Path) -> ParsedDocument:
    """Parse a single HTML file into a structured representation."""

    text = path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(text, "html.parser")

    title = soup.title.string.strip() if soup.title and soup.title.string else None
    meta_description_tag = soup.find("meta", attrs={"name": "description"})
    meta_description = (
        meta_description_tag.get("content", "").strip() if meta_description_tag else None
    )
    language = soup.html.get("lang") if soup.html else None

    meta = {}
    for tag in soup.find_all("meta"):
        name = tag.get("name")
        if not name:
            continue
        content = tag.get("content", "")
        meta[name] = content.strip() if isinstance(content, str) else content

    headings: List[ParsedHeading] = []
    for order, heading_tag in enumerate(
        soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]), start=1
    ):
        text = heading_tag.get_text(strip=True)
        if not text:
            continue
        headings.append(ParsedHeading(level=heading_tag.name, text=text, order=order))

    links: List[ParsedLink] = []
    for link_tag in soup.find_all("a"):
        href = link_tag.get("href")
        if not href:
            continue
        links.append(
            ParsedLink(
                href=href.strip(),
                text=link_tag.get_text(strip=True),
                rel=link_tag.get("rel")[0] if link_tag.get("rel") else None,
            )
        )

    return ParsedDocument(
        source_path=str(path.resolve()),
        title=title,
        meta_description=meta_description,
        language=language,
        meta=meta,
        headings=headings,
        links=links,
    )


def iter_html_files(root: Path) -> Iterable[Path]:
    """Yield HTML files underneath ``root``."""

    if root.is_file() and root.suffix.lower() in {".html", ".htm"}:
        yield root
        return

    if root.is_dir():
        for path in sorted(root.rglob("*.html")):
            if path.is_file():
                yield path
        for path in sorted(root.rglob("*.htm")):
            if path.is_file():
                yield path


def save_documents(connection, documents: Sequence[ParsedDocument]) -> None:
    """Persist parsed documents into MySQL using parameterized queries."""

    db.ensure_schema(connection)
    document_cursor = connection.cursor()
    meta_cursor = connection.cursor()
    heading_cursor = connection.cursor()
    link_cursor = connection.cursor()

    try:
        for document in documents:
            document_cursor.execute(
                (
                    "INSERT INTO html_documents (source_path, title, meta_description, language)"
                    " VALUES (%s, %s, %s, %s)"
                    " ON DUPLICATE KEY UPDATE title = VALUES(title), meta_description = VALUES(meta_description), language = VALUES(language)"
                ),
                (document.source_path, document.title, document.meta_description, document.language),
            )
            if document_cursor.lastrowid:
                document_id = document_cursor.lastrowid
            else:
                document_cursor.execute(
                    "SELECT id FROM html_documents WHERE source_path = %s",
                    (document.source_path,),
                )
                document_id = document_cursor.fetchone()[0]

            meta_cursor.execute("DELETE FROM html_meta WHERE document_id = %s", (document_id,))
            heading_cursor.execute(
                "DELETE FROM html_headings WHERE document_id = %s", (document_id,)
            )
            link_cursor.execute("DELETE FROM html_links WHERE document_id = %s", (document_id,))

            for name, content in document.meta.items():
                meta_cursor.execute(
                    "INSERT INTO html_meta (document_id, meta_name, meta_content) VALUES (%s, %s, %s)",
                    (document_id, name, content),
                )

            for heading in document.headings:
                heading_cursor.execute(
                    (
                        "INSERT INTO html_headings "
                        "(document_id, heading_level, heading_text, heading_order)"
                        " VALUES (%s, %s, %s, %s)"
                    ),
                    (document_id, heading.level, heading.text, heading.order),
                )

            for link in document.links:
                link_cursor.execute(
                    "INSERT INTO html_links (document_id, link_href, link_text, rel) VALUES (%s, %s, %s, %s)",
                    (document_id, link.href, link.text, link.rel),
                )

        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        document_cursor.close()
        meta_cursor.close()
        heading_cursor.close()
        link_cursor.close()


def export_documents(connection, document_ids: Sequence[int] | None = None) -> str:
    """Return normalized JSON for the requested documents."""

    cursor = connection.cursor(dictionary=True)
    try:
        query = "SELECT * FROM html_documents"
        params: Sequence = []
        if document_ids:
            placeholders = ",".join(["%s"] * len(document_ids))
            query += f" WHERE id IN ({placeholders})"
            params = document_ids
        cursor.execute(query, params)
        documents = cursor.fetchall()

        if not documents:
            return json.dumps([], indent=2)

        document_map = {doc["id"]: doc for doc in documents}
        ids = list(document_map.keys())
        placeholders = ",".join(["%s"] * len(ids))

        meta_cursor = connection.cursor(dictionary=True)
        heading_cursor = connection.cursor(dictionary=True)
        link_cursor = connection.cursor(dictionary=True)
        try:
            meta_cursor.execute(
                f"SELECT document_id, meta_name, meta_content FROM html_meta WHERE document_id IN ({placeholders})",
                ids,
            )
            heading_cursor.execute(
                (
                    "SELECT document_id, heading_level, heading_text, heading_order "
                    "FROM html_headings WHERE document_id IN ("
                    + placeholders
                    + ") ORDER BY heading_order"
                ),
                ids,
            )
            link_cursor.execute(
                f"SELECT document_id, link_href, link_text, rel FROM html_links WHERE document_id IN ({placeholders})",
                ids,
            )

            meta_rows = meta_cursor.fetchall()
            heading_rows = heading_cursor.fetchall()
            link_rows = link_cursor.fetchall()
        finally:
            meta_cursor.close()
            heading_cursor.close()
            link_cursor.close()

        for row in document_map.values():
            row["meta"] = {}
            row["headings"] = []
            row["links"] = []

        for row in meta_rows:
            document_map[row["document_id"]]["meta"][row["meta_name"]] = row["meta_content"]

        for row in heading_rows:
            document_map[row["document_id"]]["headings"].append(
                {
                    "level": row["heading_level"],
                    "text": row["heading_text"],
                    "order": row["heading_order"],
                }
            )

        for row in link_rows:
            document_map[row["document_id"]]["links"].append(
                {
                    "href": row["link_href"],
                    "text": row["link_text"],
                    "rel": row["rel"],
                }
            )

        normalized = []
        for document_id in ids:
            row = document_map[document_id]
            normalized.append(
                {
                    "id": row["id"],
                    "source_path": row["source_path"],
                    "title": row["title"],
                    "meta_description": row["meta_description"],
                    "language": row["language"],
                    "meta": row["meta"],
                    "headings": row["headings"],
                    "links": row["links"],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                }
            )

        return json.dumps(normalized, indent=2)
    finally:
        cursor.close()
