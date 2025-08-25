#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import re
from bs4 import BeautifulSoup
from datetime import datetime
from collections import defaultdict
from urllib.request import urlopen, Request
from urllib.parse import quote_plus

MONEY_RE = re.compile(r"[-+]?\$?\s*([0-9]{1,3}(?:,[0,9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)")
DATE_FORMATS = ["%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"]

BUREAUS = ["TransUnion", "Experian", "Equifax"]

FIELD_ALIASES = {
    "Account #:": "account_number",
    "Account Type:": "account_type",
    "Account Type - Detail:": "account_type_detail",
    "Bureau Code:": "bureau_code",
    "Account Status:": "account_status",
    "Monthly Payment:": "monthly_payment",
    "Date Opened:": "date_opened",
    "Balance:": "balance",
    "No. of Months (terms):": "months_terms",
    "High Credit:": "high_credit",
    "Credit Limit:": "credit_limit",
    "Past Due:": "past_due",
    "Payment Status:": "payment_status",
    "Last Reported:": "last_reported",
    "Comments:": "comments",
    "Date Last Active:": "date_last_active",
    "Date of Last Payment:": "date_last_payment",
    "Date of First Delinquency:": "date_first_delinquency",
    "DOFD:": "date_first_delinquency",
}

def parse_money(val):
    if val is None: return None
    s = val.replace(",", "")
    m = MONEY_RE.search(s)
    if not m: return None
    try:
        return float(m.group(1))
    except ValueError:
        return None

def parse_int(val):
    if val is None: return None
    s = val.strip()
    if s.isdigit():
        return int(s)
    try:
        return int(float(s))
    except Exception:
        return None

def parse_date(val):
    if not val: return None
    s = val.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except Exception:
            pass
    return None

def clean_text(el):
    if el is None: return ""
    return " ".join(el.get_text(separator=" ", strip=True).split())

def is_tradeline_table(tbl):
    ths = [clean_text(th) for th in tbl.select("tr th")]
    return (
        any("TransUnion" in t for t in ths) and
        any("Experian" in t for t in ths) and
        any("Equifax" in t for t in ths)
    )

def nearest_creditor_header(tbl):
    """
    Walk backwards in the DOM to find the nearest .sub_header text (creditor).
    """
    # Try previous siblings first
    node = tbl
    while node and node.previous_sibling is not None:
        node = node.previous_sibling
        if getattr(node, "select_one", None):
            hdr = node.select_one("div.sub_header")
            if hdr:
                return clean_text(hdr)
    # If not found, try walking up to parent and searching above
    parent = tbl.parent
    while parent:
        # check siblings before this parent
        sib = parent.previous_sibling
        while sib:
            if getattr(sib, "select_one", None):
                hdr = sib.select_one("div.sub_header")
                if hdr:
                    return clean_text(hdr)
            sib = sib.previous_sibling
        parent = parent.parent
    return "Unknown Creditor"

def extract_rows(table):
    """
    Return list of (field_key, { bureau: value })
    """
    rows = []
    for tr in table.select("tr"):
        tds = tr.find_all("td", recursive=False)
        if not tds:
            continue
        label = clean_text(tds[0]) if tds else ""
        if label not in FIELD_ALIASES:
            continue
        by_bureau = {}
        for i, b in enumerate(BUREAUS, start=1):
            val = clean_text(tds[i]) if i < len(tds) else ""
            by_bureau[b] = "" if val == "-" else val
        rows.append((FIELD_ALIASES[label], by_bureau))
    return rows

def normalize_record(rows):
    per_bureau = {b:{} for b in BUREAUS}
    for field_key, by_bureau in rows:
        for b in BUREAUS:
            raw = by_bureau.get(b, "")
            if field_key in ("monthly_payment", "balance", "high_credit", "credit_limit", "past_due"):
                per_bureau[b][field_key] = parse_money(raw)
                per_bureau[b][field_key + "_raw"] = raw
            elif field_key in ("months_terms",):
                per_bureau[b][field_key] = parse_int(raw)
                per_bureau[b][field_key + "_raw"] = raw
            elif field_key in ("date_opened", "last_reported", "date_last_active", "date_last_payment", "date_first_delinquency"):
                per_bureau[b][field_key] = parse_date(raw)
                per_bureau[b][field_key + "_raw"] = raw
            else:
                per_bureau[b][field_key] = raw
    return per_bureau

def v(category, title, detail, evidence):
    return {"category": category, "title": title, "detail": detail, "evidence": evidence}

# Late-payment CSS classes used in payment history cells
HSTRY_LATE_CLASSES = {
    "hstry-30", "hstry-60", "hstry-90", "hstry-120", "hstry-150", "hstry-180"
}

def extract_payment_history(tbl):
    """Return per-bureau payment history class sequences."""
    history = {b: [] for b in BUREAUS}
    bureau_map = {"tu": "TransUnion", "exp": "Experian", "eqf": "Equifax"}
    for abbr, bureau in bureau_map.items():
        selector = f'td[ng-class*="history.{abbr}.css"]'
        for td in tbl.select(selector):
            classes = td.get("class", [])
            code = next((c for c in classes if c.startswith("hstry-")), None)
            if code:
                history[bureau].append(code)
    return history

def check_violations(per_bureau):
    violations = []

    def v(category, title, detail, evidence):
        violations.append({
            "category": category,
            "title": title,
            "detail": detail,
            "evidence": evidence
        })

    def conflicting(field, ignore_zero=False):
        vals = {}
        for b in BUREAUS:
            val = per_bureau[b].get(field)
            if val in (None, "",):
                continue
            if ignore_zero and (isinstance(val, (int, float)) and val == 0):
                continue
            vals[b] = val
        return (len(set(vals.values())) > 1, vals)

    # ---------- Cross-bureau inconsistencies ----------
    X_BUREAU_FIELDS = [
        ("balance", "Duplicate/Conflicting Reporting", "Balances differ across bureaus", False),
        ("past_due", "Duplicate/Conflicting Reporting", "Past-due amounts differ across bureaus", True),
        ("credit_limit", "Duplicate/Conflicting Reporting", "Credit limits differ across bureaus", True),
        ("high_credit", "Duplicate/Conflicting Reporting", "High credit differs across bureaus", True),
        ("monthly_payment", "Duplicate/Conflicting Reporting", "Monthly payment differs across bureaus", True),
        ("payment_status", "Duplicate/Conflicting Reporting", "Payment status differs across bureaus", False),
        ("account_status", "Duplicate/Conflicting Reporting", "Account status differs across bureaus", False),
        ("date_opened", "Dates", "Date Opened differs across bureaus", False),
        ("last_reported", "Dates", "Last Reported date differs across bureaus", False),
        ("date_last_payment", "Dates", "Date of Last Payment differs across bureaus", False),
        ("date_first_delinquency", "Dates", "Date of First Delinquency differs across bureaus", False),
    ]
    for field, cat, title, ignore_zero in X_BUREAU_FIELDS:
        diff, vals = conflicting(field, ignore_zero=ignore_zero)
        if diff:
            v(cat, title, f"Inconsistent {field.replace('_',' ')} across bureaus.", {f"{field}_by_bureau": vals})

    # ---------- Within-bureau contradictions ----------
    for b in BUREAUS:
        data = per_bureau[b]
        bal = data.get("balance")
        past_due = data.get("past_due")
        pstat = (data.get("payment_status") or "").strip().lower()
        status = (data.get("account_status") or "").strip().lower()
        cl = data.get("credit_limit")
        hc = data.get("high_credit")
        date_opened = data.get("date_opened")
        last_reported = data.get("last_reported")
        date_last_payment = data.get("date_last_payment")
        dofd = data.get("date_first_delinquency")
        months_terms = data.get("months_terms")
        comments = (data.get("comments") or "")
        history_seq = data.get("payment_history") or []

        if not dofd:
            v("Dates",
              f"Missing Date of First Delinquency ({b})",
              "Date of First Delinquency not reported.",
              {"bureau": b})

        # Past-due > 0 but "Current"
        if past_due and past_due > 0 and pstat.startswith("current"):
            v("Balances & Amounts",
              f"Past-due reported with 'Current' status ({b})",
              "Past-due > 0 conflicts with 'Current' status.",
              {"bureau": b, "past_due": past_due, "payment_status": data.get("payment_status")})

        # $0 balance but past-due > 0
        if (bal is not None and bal == 0) and (past_due and past_due > 0):
            v("Balances & Amounts",
              f"Past-due on a $0 balance account ({b})",
              "Past-due should be $0 if the balance is $0.",
              {"bureau": b, "balance": bal, "past_due": past_due})

        # Late/Delinquent status but no past-due amount
        if (("late" in pstat) or ("delinquent" in pstat)) and (not past_due or past_due == 0):
            v("Balances & Amounts",
              f"Late status but no past-due amount ({b})",
              "Late/Delinquent status typically coincides with a past-due amount.",
              {"bureau": b, "payment_status": data.get("payment_status"), "past_due": past_due})

        # Open + zero CL but comments say H/C is the limit (common consumer report note)
        if status == "open" and cl == 0 and hc and hc > 0 and "credit limit" in comments.lower():
            v("Account Status & Codes",
              f"Open account with zero credit limit though comments say H/C is limit ({b})",
              "If H/C serves as credit limit, reported limit shouldn't be $0.",
              {"bureau": b, "account_status": data.get("account_status"), "high_credit": hc, "credit_limit": cl, "comments": comments})

        # Date sanity: last_reported should not be before date_opened (when both present)
        if date_opened and last_reported and last_reported < date_opened:
            v("Dates",
              f"Last Reported precedes Date Opened ({b})",
              "Reporting date cannot be earlier than when account was opened.",
              {"bureau": b, "date_opened": date_opened, "last_reported": last_reported})

        # Date sanity: date_last_payment should not be before date_opened (heuristic)
        if date_opened and date_last_payment and date_last_payment < date_opened:
            v("Dates",
              f"Date of Last Payment precedes Date Opened ({b})",
              "Last payment date earlier than open date is suspicious.",
              {"bureau": b, "date_opened": date_opened, "date_last_payment": date_last_payment})

        # Revolving account with months_terms not zero but status Open (optional heuristic)
        # If your reports always show 0 for revolving, flag non-zero as odd.
        acct_type = (data.get("account_type") or "").strip().lower()
        if "revolving" in acct_type and months_terms and months_terms > 0:
            v("Account Status & Codes",
              f"Revolving account with non-zero 'No. of Months (terms)' ({b})",
              "Revolving accounts usually don't have installment terms.",
              {"bureau": b, "account_type": data.get("account_type"), "months_terms": months_terms})

        # High credit but no credit limit and comments don't clarify (optional heuristic)
        if status == "open" and (cl is None or cl == 0) and (hc and hc > 0) and "credit limit" not in comments.lower():
            v("Balances & Amounts",
              f"Open revolving with high credit set but no credit limit ({b})",
              "Open revolving accounts typically carry a CL or a note that H/C is being used.",
              {"bureau": b, "high_credit": hc, "credit_limit": cl, "comments": comments})

        if ("charge" in pstat or "charge" in status) and (bal is not None and bal > 0):
            v("Balances & Amounts",
              f"Charge-off with non-zero balance ({b})",
              "Charge-off accounts should have a zero balance.",
              {"bureau": b, "balance": bal, "payment_status": data.get("payment_status"), "account_status": data.get("account_status")})

        if history_seq:
            if any(c in HSTRY_LATE_CLASSES for c in history_seq):
                v("Payment History",
                  f"Late payment markers present ({b})",
                  "Payment history shows late payments.",
                  {"bureau": b, "history": history_seq})
            for prev, curr in zip(history_seq, history_seq[1:]):
                if curr in HSTRY_LATE_CLASSES and prev not in HSTRY_LATE_CLASSES:
                    v("Payment History",
                      f"Abrupt late payment after positive ({b})",
                      "Late payment follows a positive month.",
                      {"bureau": b, "sequence": [prev, curr]})
                    break

    return violations


def extract_all_tradelines(soup):
    """
    Find all tradeline tables (4-column) and pair each with its nearest creditor header.
    """
    results = []
    for tbl in soup.select("table"):
        if not is_tradeline_table(tbl):
            continue
        creditor = nearest_creditor_header(tbl)
        rows = extract_rows(tbl)
        per_bureau = normalize_record(rows)
        histories = extract_payment_history(tbl)
        for b in BUREAUS:
            if histories.get(b):
                per_bureau[b]["payment_history"] = histories[b]
        meta = {
            "creditor": creditor,
            "account_numbers": {b: per_bureau[b].get("account_number") for b in BUREAUS if per_bureau[b].get("account_number")}
        }
        violations = check_violations(per_bureau)
        grouped = defaultdict(list)
        for itm in violations:
            grouped[itm["category"]].append(itm)
        results.append({
            "meta": meta,
            "per_bureau": per_bureau,
            "violations": violations,
            "violations_grouped": grouped
        })
    return results


LIB_PATH = os.path.join(os.path.dirname(__file__), "creditor_library.json")

def load_library():
    try:
        with open(LIB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_library(lib):
    try:
        with open(LIB_PATH, "w", encoding="utf-8") as f:
            json.dump(lib, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

def classify_creditor(name):
    query = quote_plus(f"{name} debt collector")
    url = f"https://www.google.com/search?q={query}"
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=5) as resp:
            html = resp.read().decode("utf-8", errors="ignore").lower()
            if "collection agency" in html or "debt collector" in html:
                return "debt_collector"
    except Exception:
        pass
    return "original_creditor"

def parse_inquiries(soup):
    inquiries = []
    for tbl in soup.select("table.re-even-odd.rpt_content_table.rpt_content_header.rpt_table4column"):
        header = clean_text(tbl.find_previous("div", class_="sub_header"))
        if "inquiries" not in header.lower():
            continue
        rows = tbl.select("tr")
        if not rows:
            continue
        # assume header defines column order
        cols = [clean_text(th).lower() for th in rows[0].find_all("th")]
        for tr in rows[1:]:
            tds = tr.find_all("td")
            if len(tds) < len(cols):
                continue
            data = {cols[i]: clean_text(tds[i]) for i in range(len(cols))}
            creditor = data.get("creditor") or data.get("company") or ""
            date = parse_date(data.get("date") or data.get("inquiry date") or data.get("inquiry_date"))
            bureau = data.get("bureau") or data.get("credit bureau") or data.get("credit_bureau")
            inquiries.append({"creditor": creditor, "date": date, "bureau": bureau})
    return inquiries

def mark_inquiry_disputes(inquiries, tradelines):
    for inq in inquiries:
        inq_month = (inq.get("date") or "")[:7]
        keep = False
        for tl in tradelines:
            name = (tl.get("meta", {}).get("creditor") or "").lower()
            if inq.get("creditor", "").lower() in name or name in (inq.get("creditor", "").lower()):
                for pb in tl.get("per_bureau", {}).values():
                    opened = (pb.get("date_opened") or "")[:7]
                    if opened and opened == inq_month:
                        keep = True
                        break
            if keep:
                break
        inq["dispute"] = not keep

def parse_creditor_contacts(soup):
    contacts = []
    container = soup.find("div", id="CreditorContacts")
    if not container:
        return contacts
    text = container.get_text("\n")
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        m = re.search(r"(.+?)\s+(\(\d{3}\)\s*\d{3}-\d{4})", line)
        if m:
            name, phone = m.groups()
        else:
            name, phone = line, None
        contacts.append({"name": name.strip(), "phone": phone})
    return contacts

def process_creditor_contacts(contacts):
    lib = load_library()
    for c in contacts:
        entry = lib.get(c["name"])
        if entry:
            c["type"] = entry.get("type")
            c["phone"] = c.get("phone") or entry.get("phone")
            continue
        ctype = classify_creditor(c["name"])
        c["type"] = ctype
        lib[c["name"]] = {"type": ctype, "phone": c.get("phone")}
    save_library(lib)
    return contacts

def main():
    ap = argparse.ArgumentParser(description="Audit multiple tradelines in an HTML report for Metro 2-style violations.")
    ap.add_argument("-i", "--input", required=True, help="Path to input HTML file (can contain multiple tradelines)")
    ap.add_argument("-o", "--output", default="report.json", help="Path to output JSON file")
    args = ap.parse_args()

    with open(args.input, "r", encoding="utf-8", errors="ignore") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")
    tradelines = extract_all_tradelines(soup)
    inquiries = parse_inquiries(soup)
    mark_inquiry_disputes(inquiries, tradelines)
    contacts = process_creditor_contacts(parse_creditor_contacts(soup))

    if not tradelines:
        print("✖ No tradeline 4-column tables were found. Check that the HTML layout matches the expected structure.")
        return

    # Print a quick human-readable summary
    print(f"\nFound {len(tradelines)} tradeline(s).")
    for idx, tl in enumerate(tradelines, 1):
        cred = tl["meta"]["creditor"]
        acct = tl["meta"].get("account_numbers") or {}
        print(f"\n=== Tradeline {idx}: {cred} ===")
        if acct:
            print(f"Account #s: {acct}")
        if not tl["violations"]:
            print("No obvious violations detected by these rules.")
        else:
            for vitem in tl["violations"]:
                print(f"- [{vitem['category']}] {vitem['title']}")
                ev = vitem.get("evidence", {})
                if ev:
                    print(f"  Evidence: {json.dumps(ev, ensure_ascii=False)}")

    # Save JSON
    # Note: defaultdicts are not JSON serializable; convert grouped to dict of lists
    normalized = []
    for tl in tradelines:
        grouped = {k: v for k, v in tl["violations_grouped"].items()}
        normalized.append({
            "meta": tl["meta"],
            "per_bureau": tl["per_bureau"],
            "violations": tl["violations"],
            "violations_grouped": grouped
        })

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump({
            "tradelines": normalized,
            "inquiries": inquiries,
            "creditor_contacts": contacts
        }, f, indent=2, ensure_ascii=False)

    print(f"\n✓ JSON report saved to: {args.output}")

if __name__ == "__main__":
    main()
