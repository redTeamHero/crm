"""BeautifulSoup-powered parser for Metro 2 style credit report HTML exports.

This mirrors the behaviour of the browser parser used by the Node tooling so
Python scripts can operate on the same JSON structure.  The entry point
``parse_credit_report_html`` accepts either a raw HTML string or an already
constructed BeautifulSoup/Tag node and returns a dictionary with
``tradelines``, ``inquiries`` and an ``inquiry_summary`` block.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from bs4 import BeautifulSoup, Tag

DEFAULT_CREDITOR_NAME = "Unknown Creditor"
NON_CREDITOR_HEADERS = {"risk factors"}
BUREAUS = ["TransUnion", "Experian", "Equifax"]
MONEY_FIELDS = {"balance", "credit_limit", "high_credit", "past_due", "monthly_payment"}
DATE_FIELDS = {
    "date_opened",
    "last_reported",
    "date_last_payment",
    "date_last_active",
    "date_closed",
    "date_first_delinquency",
}
DATE_FORMATS = [
    "%m/%d/%Y",
    "%m/%d/%y",
    "%Y-%m-%d",
    "%b %d, %Y",
    "%b %Y",
    "%B %d, %Y",
    "%B %Y",
]

RowRule = Tuple[Union[str, re.Pattern[str]], Sequence[str], str]

ROW_RULES: List[RowRule] = [
    ("Account #", ["account_number"], "single"),
    ("Account Type", ["account_type"], "single"),
    ("Account Type - Detail", ["account_type_detail"], "single"),
    ("Bureau Code", ["bureau_code"], "single"),
    ("Account Status", ["account_status"], "single"),
    ("Payment Status", ["payment_status"], "single"),
    ("Monthly Payment", ["monthly_payment"], "single"),
    ("Balance", ["balance"], "single"),
    ("Credit Limit", ["credit_limit"], "single"),
    ("High Credit", ["high_credit"], "single"),
    ("Past Due", ["past_due"], "single"),
    ("Date Opened", ["date_opened"], "single"),
    ("Last Reported", ["last_reported"], "single"),
    (re.compile(r"(Date\s*of\s*)?Last Payment(?:\s*Date)?", re.I), ["date_last_payment"], "single"),
    ("Date Last Active", ["date_last_active"], "single"),
    ("Date Closed", ["date_closed"], "single"),
    (re.compile(r"Date(?: of)? First Delinquency", re.I), ["date_first_delinquency"], "single"),
    ("No. of Months (terms)", ["months_terms"], "single"),
    ("Account Status / Payment Status", ["account_status", "payment_status"], "combined"),
    ("Balance / Past Due", ["balance", "past_due"], "combined"),
    ("Credit Limit / High Credit", ["credit_limit", "high_credit"], "combined"),
    (
        "Dates",
        ["date_opened", "last_reported", "date_last_payment", "date_first_delinquency"],
        "combined",
    ),
    ("Comments", ["comments"], "comments"),
]


def parse_credit_report_html(doc: Union[str, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Parse a credit report HTML document.

    Parameters
    ----------
    doc:
        Either a raw HTML string, a ``BeautifulSoup`` document, or a specific
        ``Tag`` that contains the report markup.
    """

    soup = _ensure_soup(doc)

    tradelines = _parse_tradelines(soup)
    inquiries = _parse_inquiries(soup)
    inquiry_summary = _summarize_inquiries(inquiries)

    return {
        "tradelines": tradelines,
        "inquiries": inquiries,
        "inquiry_summary": inquiry_summary,
    }


def _ensure_soup(doc: Union[str, BeautifulSoup, Tag]) -> BeautifulSoup:
    if isinstance(doc, BeautifulSoup):
        return doc
    if isinstance(doc, Tag):
        return BeautifulSoup(str(doc), "html.parser")
    return BeautifulSoup(doc or "", "html.parser")


def _parse_tradelines(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    tables = soup.select("table.rpt_content_table.rpt_content_header.rpt_table4column")
    if not tables:
        raise ValueError("No tradeline tables found")

    results: List[Dict[str, Any]] = []
    for table in tables:
        tl = _parse_tradeline_table(table)
        if tl is not None:
            results.append(tl)
    return results


def _parse_tradeline_table(table: Tag) -> Optional[Dict[str, Any]]:
    container = _resolve_container(table)
    creditor_name = _extract_creditor_name(container, table)

    if creditor_name.lower() in NON_CREDITOR_HEADERS:
        return None

    rows = _table_rows(table)
    if not rows:
        return None

    header = rows[0]
    bureau_order = [
        _normalize_bureau(_text(th))
        for th in header.find_all(["th", "td"], recursive=False)[1:]
    ]
    bureau_order = [b for b in bureau_order if b]
    bureaus = bureau_order or list(BUREAUS)

    per_bureau: Dict[str, Dict[str, Any]] = {b: {} for b in BUREAUS}

    for row in rows[1:]:
        label_td = row.find("td", class_="label")
        if not label_td:
            continue
        label_raw = _text(label_td)
        label = _clean_label(label_raw)
        rule = _match_rule(label)
        if rule is None:
            continue

        info_cells = _gather_info_cells(row)
        if len(info_cells) < len(bureaus):
            info_cells.extend([None] * (len(bureaus) - len(info_cells)))

        for idx, bureau in enumerate(bureaus):
            cell = info_cells[idx] if idx < len(info_cells) else None
            if not bureau or cell is None:
                continue
            pb = per_bureau[bureau]

            if rule[2] == "comments":
                remarks = _extract_comments(cell)
                pb.setdefault("comments", remarks or [])
                if remarks:
                    _ensure_raw(pb)
                    pb["raw"]["comments"] = list(remarks)
                continue

            if rule[2] == "combined":
                parts = _cell_parts(cell, len(rule[1]))
                for field, part in zip(rule[1], parts):
                    _set_field(pb, field, part)
            else:
                raw_val = _cell_text(cell)
                _set_field(pb, rule[1][0], raw_val)

    history_table = _find_payment_history(container, table)
    history = {b: [] for b in BUREAUS}
    history_summary: Dict[str, Dict[str, int]] = {}
    if history_table is not None:
        parsed_history = _parse_history_table(history_table)
        history = parsed_history["byBureau"]
        history_summary = parsed_history["summary"]

    has_data = any(_bureau_has_data(pb) for pb in per_bureau.values())
    if not has_data:
        return None

    meta: Dict[str, Any] = {
        "creditor": creditor_name or DEFAULT_CREDITOR_NAME,
    }
    acct_numbers = {
        bureau: pb.get("account_number")
        for bureau, pb in per_bureau.items()
        if pb.get("account_number")
    }
    if acct_numbers:
        meta["account_numbers"] = acct_numbers

    tradeline = {
        "meta": meta,
        "per_bureau": per_bureau,
        "violations": [],
        "history": history,
        "history_summary": history_summary,
    }
    return tradeline


def _resolve_container(table: Tag) -> Tag:
    container = table.find_parent("td", class_="ng-binding")
    if container:
        return container

    ng_include = table.find_parent("ng-include")
    if ng_include and isinstance(ng_include.parent, Tag):
        return ng_include.parent

    parent_td = table.find_parent("td")
    if parent_td:
        return parent_td

    return table.parent if isinstance(table.parent, Tag) else table


def _extract_creditor_name(container: Tag, table: Tag) -> str:
    header = None
    if container:
        header = container.find(["div", "h3", "h4"], class_=re.compile("sub_header", re.I))
    if header:
        name = _text(header)
        return name or DEFAULT_CREDITOR_NAME

    search_node: Optional[Tag] = table
    while search_node is not None:
        sibling = search_node.previous_sibling
        while sibling is not None:
            if isinstance(sibling, Tag):
                header = sibling.find(["div", "h3", "h4"], class_=re.compile("sub_header", re.I))
                if header:
                    name = _text(header)
                    if name:
                        return name
            sibling = sibling.previous_sibling
        search_node = search_node.parent if isinstance(search_node.parent, Tag) else None

    fallback = table.find_previous(["div", "h3", "h4"], class_=re.compile("sub_header", re.I))
    if fallback:
        name = _text(fallback)
        if name:
            return name

    return DEFAULT_CREDITOR_NAME


def _table_rows(table: Tag) -> List[Tag]:
    body_rows = table.select("tbody > tr")
    if body_rows:
        return body_rows
    return table.find_all("tr", recursive=False)


def _gather_info_cells(row: Tag) -> List[Optional[Tag]]:
    cells: List[Optional[Tag]] = []
    for td in row.find_all("td", recursive=False):
        classes = {c.lower() for c in td.get("class", [])}
        if "label" in classes:
            continue
        if "info" in classes:
            cells.append(td)
            continue
        info_child = td.select_one(".info")
        if info_child:
            cells.append(info_child)
        else:
            cells.append(td)
    return cells


def _match_rule(label: str) -> Optional[RowRule]:
    for rule in ROW_RULES:
        if isinstance(rule[0], str) and rule[0] == label:
            return rule
    for rule in ROW_RULES:
        if isinstance(rule[0], re.Pattern) and rule[0].search(label):
            return rule
    normalized = re.sub(r"\s+", " ", label.strip().lower())
    for rule in ROW_RULES:
        if isinstance(rule[0], str) and re.sub(r"\s+", " ", rule[0].strip().lower()) == normalized:
            return rule
    return None


def _extract_comments(cell: Tag) -> List[str]:
    lines = [_text(div) for div in cell.find_all("div")]
    lines = [line for line in lines if line]
    if lines:
        return _uniq(lines)
    raw = _cell_text(cell)
    if not raw:
        return []
    parts = re.split(r"\s{2,}|•|\u00A0{2,}", raw)
    return _uniq([p.strip() for p in parts if p.strip()])


def _set_field(pb: Dict[str, Any], field: str, raw_value: str) -> None:
    raw_value = raw_value or ""
    normalized = _normalize_field_value(field, raw_value)
    if normalized is None:
        normalized = ""
    pb[field] = normalized
    _ensure_raw(pb)
    pb["raw"][field] = raw_value
    pb[f"{field}_raw"] = raw_value


def _ensure_raw(pb: Dict[str, Any]) -> None:
    if "raw" not in pb:
        pb["raw"] = {}


def _normalize_field_value(field: str, raw: str) -> Any:
    value = (raw or "").strip()
    if not value:
        return ""
    if field in MONEY_FIELDS:
        amount = _parse_money(value)
        if amount is not None:
            return f"${amount:,.2f}"
        return value
    if field in DATE_FIELDS:
        return _coerce_date_mdy(value)
    if field == "months_terms":
        digits = re.sub(r"[^0-9-]", "", value)
        if digits:
            return digits
        return value
    return value


def _parse_money(value: str) -> Optional[float]:
    cleaned = re.sub(r"[^0-9.+-]", "", value or "")
    if not cleaned or cleaned in {"-", ".", "-.", "+"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _coerce_date_mdy(value: str) -> str:
    parsed = _parse_any_date(value)
    return parsed.strftime("%m/%d/%Y") if parsed else ""


def _cell_text(node: Optional[Tag]) -> str:
    if node is None:
        return ""
    if isinstance(node, Tag):
        parts = [chunk.strip() for chunk in node.stripped_strings]
        return re.sub(r"\s+", " ", " ".join(parts)).strip()
    return str(node).strip()


def _cell_parts(node: Optional[Tag], expected_parts: int) -> List[str]:
    if node is None:
        return ["" for _ in range(expected_parts)]

    fragments: List[str] = []
    if isinstance(node, Tag):
        for child in node.children:
            if isinstance(child, Tag):
                txt = _cell_text(child)
                if txt:
                    fragments.append(txt)
            else:
                txt = str(child).strip()
                if txt:
                    fragments.append(txt)
    if len(fragments) >= expected_parts:
        return fragments[:expected_parts]

    combined = _cell_text(node)
    return _smart_split(combined, expected_parts)


def _smart_split(value: str, expected_parts: int) -> List[str]:
    if not value:
        return ["" for _ in range(expected_parts)]
    by_pipe = [part.strip() for part in value.split("|") if part.strip()]
    if len(by_pipe) >= expected_parts:
        return [re.sub(r"^[A-Za-z ]+:\s*", "", part) for part in by_pipe[:expected_parts]]
    by_slash = [part.strip() for part in value.split("/") if part.strip()]
    if len(by_slash) >= expected_parts:
        return by_slash[:expected_parts]
    by_space = [part.strip() for part in re.split(r"\s{2,}", value) if part.strip()]
    if len(by_space) >= expected_parts:
        return by_space[:expected_parts]
    by_single = [part.strip() for part in re.split(r"\s+", value) if part.strip()]
    if len(by_single) >= expected_parts:
        return by_single[:expected_parts]
    result = ["" for _ in range(expected_parts)]
    result[0] = value.strip()
    return result


def _parse_history_table(table: Tag) -> Dict[str, Any]:
    rows = _table_rows(table)
    if len(rows) < 2:
        return {"byBureau": {b: [] for b in BUREAUS}, "summary": {}}

    month_cells = rows[0].find_all("td", class_="info")
    months = [
        _text(cell.select_one("span.lg-view") or cell)
        for cell in month_cells
    ]
    year_cells = rows[1].find_all("td", class_="info")
    years = [_text(cell) for cell in year_cells]
    labels: List[str] = []
    for idx in range(max(len(months), len(years))):
        month = months[idx] if idx < len(months) else ""
        year = years[idx] if idx < len(years) else ""
        label = (f"{month} ’{year}" if year else month).strip()
        labels.append(label or f"col_{idx}")

    by_bureau: Dict[str, List[Dict[str, Optional[str]]]] = {b: [] for b in BUREAUS}
    summary: Dict[str, Dict[str, int]] = {}

    for tr in rows[2:]:
        label_td = tr.find("td", class_="label")
        if not label_td:
            continue
        bureau = _normalize_bureau(_text(label_td))
        if not bureau:
            continue
        info_cells = tr.find_all("td", class_="info")
        statuses: List[Dict[str, Optional[str]]] = []
        for idx, cell in enumerate(info_cells):
            classes = cell.get("class", [])
            status_class = next((c for c in classes if c.startswith("hstry-")), None)
            txt = _text(cell) or None
            statuses.append({
                "col": labels[idx] if idx < len(labels) else f"col_{idx}",
                "status_class": status_class,
                "status_text": txt,
            })
        by_bureau[bureau] = statuses
        summary[bureau] = {
            "ok": sum(1 for s in statuses if s["status_class"] == "hstry-ok" or (s["status_text"] or "").upper() == "OK"),
            "unknown": sum(1 for s in statuses if s["status_class"] == "hstry-unknown"),
            "late": sum(
                1
                for s in statuses
                if s["status_class"] and re.search(r"hstry-(late|derog|neg)", s["status_class"])
            ),
            "total": len(statuses),
        }

    return {"byBureau": by_bureau, "summary": summary}


def _find_payment_history(container: Tag, table: Tag) -> Optional[Tag]:
    if container:
        direct = container.select_one("table.addr_hsrty")
        if direct:
            return direct
    # search siblings but stop when the next tradeline table is encountered
    stop_classes = {"rpt_content_table", "rpt_content_header", "rpt_table4column"}
    node: Optional[Tag] = container or table
    while node is not None:
        sibling = node.next_sibling
        while sibling is not None:
            if isinstance(sibling, Tag):
                classes = set(sibling.get("class", []))
                if sibling.name == "table" and stop_classes.issubset(classes):
                    return None
                if sibling.name == "table" and "addr_hsrty" in classes:
                    return sibling
                candidate = sibling.select_one("table.addr_hsrty")
                if candidate:
                    return candidate
            sibling = sibling.next_sibling
        node = node.parent if isinstance(node.parent, Tag) else None
    return None


def _parse_inquiries(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    rows = soup.select("tr[ng-repeat*='inqPartition']")
    if not rows:
        rows = [
            tr
            for tr in soup.find_all("tr")
            if not tr.has_attr("ng-repeat") and _looks_like_inquiry_row(tr)
        ]

    inquiries: List[Dict[str, Any]] = []
    for tr in rows:
        cells = tr.find_all("td", class_="info")
        if len(cells) < 4:
            cells = [td for td in tr.find_all("td") if "label" not in (td.get("class") or [])]
        if len(cells) < 4:
            continue
        creditor_raw = _text(cells[0])
        industry_raw = _text(cells[1])
        date_raw = _text(cells[2])
        bureau_raw = _text(cells[3])
        bureau = _normalize_bureau(bureau_raw) or bureau_raw or ""
        normalized_date = _coerce_date_mdy(date_raw) or (date_raw or "")
        inquiries.append(
            {
                "creditor": creditor_raw or "",
                "industry": industry_raw or "",
                "date": normalized_date,
                "bureau": bureau,
                "raw": {
                    "creditor": creditor_raw,
                    "industry": industry_raw,
                    "date": date_raw,
                    "bureau": bureau_raw,
                },
            }
        )

    inquiries.sort(key=_inquiry_sort_key, reverse=True)
    return inquiries


def _looks_like_inquiry_row(tr: Tag) -> bool:
    cells = tr.find_all("td", class_="info")
    if len(cells) != 4:
        return False
    bureau_txt = _text(cells[3])
    date_txt = _text(cells[2])
    if not _normalize_bureau(bureau_txt):
        return False
    if _parse_any_date(date_txt):
        return True
    return False


def _inquiry_sort_key(inquiry: Dict[str, Any]) -> datetime:
    raw_date = inquiry.get("date") or inquiry.get("raw", {}).get("date")
    parsed = _parse_any_date(raw_date)
    return parsed if parsed else datetime.min


def _summarize_inquiries(inquiries: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    summary = {
        "byBureau": {"TransUnion": 0, "Experian": 0, "Equifax": 0},
        "total": 0,
        "last12mo": 0,
        "last24mo": 0,
    }
    now = datetime.now()
    for inquiry in inquiries:
        summary["total"] += 1
        bureau = inquiry.get("bureau")
        if bureau in summary["byBureau"]:
            summary["byBureau"][bureau] += 1
        raw_date = inquiry.get("date") or inquiry.get("raw", {}).get("date")
        parsed = _parse_any_date(raw_date)
        if parsed is None:
            continue
        delta = now - parsed
        if delta.days <= 365:
            summary["last12mo"] += 1
        if delta.days <= 365 * 2:
            summary["last24mo"] += 1
    return summary


def _text(node: Optional[Tag]) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", " ".join(node.stripped_strings)).strip()


def _normalize_bureau(value: str) -> str:
    txt = (value or "").strip().lower()
    if not txt:
        return ""
    if re.search(r"\b(transunion|tu|tuc)\b", txt):
        return "TransUnion"
    if re.search(r"\b(experian|exp)\b", txt):
        return "Experian"
    if re.search(r"\b(equifax|eqf|eqx)\b", txt):
        return "Equifax"
    return ""


def _parse_any_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", value):
        try:
            return datetime.strptime(value, "%m/%d/%Y")
        except ValueError:
            return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except ValueError:
        return None


def _clean_label(label: str) -> str:
    cleaned = re.sub(r"[:：;,-]*\s*$", "", label or "")
    return cleaned.strip()


def _uniq(values: Iterable[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for value in values:
        if value not in seen:
            ordered.append(value)
            seen.add(value)
    return ordered


def _bureau_has_data(pb: Dict[str, Any]) -> bool:
    for key, value in pb.items():
        if key == "raw":
            if any(v not in (None, "") for v in value.values()):
                return True
            continue
        if value not in (None, ""):
            return True
    return False


__all__ = ["parse_credit_report_html"]
