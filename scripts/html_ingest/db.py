"""Database helpers for storing parsed HTML content in MySQL."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

try:  # pragma: no cover - optional dependency during import
    import mysql.connector  # type: ignore
except ImportError:  # pragma: no cover
    mysql = None
else:  # pragma: no cover
    mysql = mysql.connector


@dataclass
class DBConfig:
    """Configuration required to connect to MySQL."""

    host: str
    port: int
    user: str
    password: str
    database: str


def load_config() -> DBConfig:
    """Load configuration from environment variables."""

    return DBConfig(
        host=os.getenv("HTML_DB_HOST", "127.0.0.1"),
        port=int(os.getenv("HTML_DB_PORT", "3306")),
        user=os.getenv("HTML_DB_USER", "root"),
        password=os.getenv("HTML_DB_PASSWORD", ""),
        database=os.getenv("HTML_DB_NAME", "html_ingest"),
    )


def get_connection(config: Optional[DBConfig] = None):
    """Return a live MySQL connection using mysql-connector-python."""

    if config is None:
        config = load_config()

    if mysql is None:  # pragma: no cover - environment guard
        raise RuntimeError(
            "mysql-connector-python is required. Install with 'pip install mysql-connector-python'."
        )

    return mysql.connect(
        host=config.host,
        port=config.port,
        user=config.user,
        password=config.password,
        database=config.database,
        autocommit=False,
    )


SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS html_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_path VARCHAR(512) NOT NULL,
        title TEXT,
        meta_description TEXT,
        language VARCHAR(32),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_source_path (source_path)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    """
    CREATE TABLE IF NOT EXISTS html_meta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT NOT NULL,
        meta_name VARCHAR(128) NOT NULL,
        meta_content TEXT,
        FOREIGN KEY fk_meta_document (document_id) REFERENCES html_documents(id) ON DELETE CASCADE,
        INDEX idx_meta_document (document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    """
    CREATE TABLE IF NOT EXISTS html_headings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT NOT NULL,
        heading_level VARCHAR(4) NOT NULL,
        heading_text TEXT NOT NULL,
        heading_order INT NOT NULL,
        FOREIGN KEY fk_heading_document (document_id) REFERENCES html_documents(id) ON DELETE CASCADE,
        INDEX idx_heading_document (document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    """
    CREATE TABLE IF NOT EXISTS html_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT NOT NULL,
        link_href TEXT,
        link_text TEXT,
        rel VARCHAR(64),
        FOREIGN KEY fk_link_document (document_id) REFERENCES html_documents(id) ON DELETE CASCADE,
        INDEX idx_link_document (document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
)


def ensure_schema(connection) -> None:
    """Ensure that all schema objects exist."""

    cursor = connection.cursor()
    try:
        for statement in SCHEMA_STATEMENTS:
            cursor.execute(statement)
        connection.commit()
    finally:
        cursor.close()
