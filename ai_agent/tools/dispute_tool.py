"""Dispute letter generator tuned for Metro-2 language."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

TONE_POLICY = """
Letter Tone Policy (strictly enforced):
- Do NOT cite case law (no court case names or citations)
- Do NOT cite statutes (no FCRA §, FDCPA §, 15 U.S.C. §, or any other statutory references)
- Do NOT include any threatening language (no mention of lawsuits, statutory damages, attorney's fees, or punitive damages)
- Do NOT use phrases like "you are violating my rights" or "I am aware of my rights"
- Do NOT make the letter sound emotional or aggressive
- Write in a calm, professional, fact-based tone
- Focus on requesting a factual reinvestigation or correction of specific inaccurate information
"""


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

Re: Request for Reinvestigation of Inaccurate Account Information

To Whom It May Concern:

I am writing to request a reinvestigation of the following items, which I believe are inaccurate or unverifiable based on my records:

{violation_text}

I am asking that you conduct a thorough reinvestigation of each item listed above. If any of this information cannot be independently verified through documentation from the original furnisher, I am requesting that it be corrected or removed from my credit file.

Please provide the method of verification used, including the name and contact information of any furnisher relied upon. If you need any additional documentation from me, please notify me in writing.

Sincerely,
{consumer_name}
"""
