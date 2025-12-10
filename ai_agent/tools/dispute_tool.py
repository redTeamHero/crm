"""Dispute letter generator tuned for Metro-2 language."""

from __future__ import annotations

from typing import Any, Iterable, Mapping


def generate_dispute_letter(
    violations: Iterable[Mapping[str, Any]],
    consumer: Mapping[str, Any],
    bureau: str,
) -> str:
    consumer_name = consumer.get("name", "Your Name")
    address = consumer.get("address", "Your Address")
    bureau_block = bureau or "Credit Bureau"
    violation_lines = []
    for violation in violations:
        code = violation.get("code") or violation.get("name") or "Violation"
        detail = violation.get("detail") or violation.get("description") or ""
        violation_lines.append(f"- {code}: {detail}")

    violation_text = "\n".join(violation_lines) or "- Pending audit details"

    return f"""
{consumer_name}
{address}

{bureau_block}

Regarding Metro-2 and FCRA compliance items:
{violation_text}

This letter serves as formal notice requesting verification and correction of the items above. Please investigate and respond within the timelines defined by the FCRA. If additional documentation is required, notify me in writing.

Sincerely,
{consumer_name}
"""
