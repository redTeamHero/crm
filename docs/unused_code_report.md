# Unused Code Audit

## Summary

- Candidate: 0
- Dynamic Rule: 23
- Third Party: 0

## Registered dynamically (usually safe to keep)

- `metro2 (copy 1)/crm/metro2_audit_multi.py:518` – unused function 'r_cross_bureau_field_mismatch' (confidence 60%) — Cross-compares balances, statuses, and identifiers across bureaus so ops can surface conflicting Metro-2 fields to clients.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:550` – unused function 'r_cross_bureau_utilization_disparity' (confidence 60%) — Highlights large swings in revolving utilization from bureau to bureau that hurt scores and may signal data sync issues.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:565` – unused function 'r_duplicate_account' (confidence 60%) — Flags when the same bureau reports an account number twice so we can dispute the duplicate tradeline.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:589` – unused function 'r_current_but_pastdue' (confidence 60%) — Checks for tradelines coded 'current' while still showing a past-due balance—classic Metro-2 inconsistency.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:599` – unused function 'r_zero_balance_but_pastdue' (confidence 60%) — Ensures $0 balance accounts are not still reporting a past-due amount, which should be impossible.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:609` – unused function 'r_late_status_no_pastdue' (confidence 60%) — Catches 'late/delinquent' payment statuses that fail to carry a supporting past-due amount.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:619` – unused function 'r_open_zero_cl_with_hc_comment' (confidence 60%) — Looks for open revolving accounts with a $0 limit even though the comments admit the high credit is acting as the limit.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:631` – unused function 'r_date_order_sanity' (confidence 60%) — Validates that Last Reported or Last Payment dates do not precede the Date Opened.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:647` – unused function 'r_revolving_with_terms' (confidence 60%) — Prevents revolving accounts from carrying installment-style term lengths, which violates Metro-2 definitions.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:657` – unused function 'r_revolving_missing_cl_hc' (confidence 60%) — Asserts that open revolving tradelines list either a credit limit or a usable high credit proxy.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:670` – unused function 'r_installment_with_cl' (confidence 60%) — Catches installment loans that erroneously publish a revolving credit limit.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:680` – unused function 'r_co_collection_pastdue' (confidence 60%) — Calls out collections or charge-offs that still show a past-due balance, which Metro-2 forbids.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:694` – unused function 'r_au_comment_ecoa_conflict' (confidence 60%) — Aligns ECOA codes with 'authorized user' comments to avoid responsibility mislabeling.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:704` – unused function 'r_derog_rating_but_current' (confidence 60%) — Spots derogatory numeric ratings that conflict with 'current' payment status and zero past-due.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:715` – unused function 'r_dispute_comment_needs_xb' (confidence 60%) — Requires accounts with dispute language to carry the XB dispute compliance code.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:725` – unused function 'r_closed_but_monthly_payment' (confidence 60%) — Checks that closed accounts are not still reporting a monthly payment obligation.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:735` – unused function 'r_stale_active_reporting' (confidence 60%) — Flags open/current tradelines whose last update is older than six months.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:747` – unused function 'r_last_payment_obsolete_7y' (confidence 60%) — Surfaces negative items older than seven years from Date of Last Payment for obsolescence disputes.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:760` – unused function 'r_3' (confidence 60%) — Metro-2 code 3 guardrail: prevents accounts with a Date Closed from still reporting as open/current.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:771` – unused function 'r_8' (confidence 60%) — Metro-2 code 8 guardrail: charge-offs must provide a Date of Last Payment.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:781` – unused function 'r_9' (confidence 60%) — Metro-2 code 9 guardrail: collections must list the original creditor.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:791` – unused function 'r_10' (confidence 60%) — Metro-2 code 10 guardrail: blocks duplicate account numbers within the same bureau feed.
- `metro2 (copy 1)/crm/metro2_audit_multi.py:812` – unused function 'r_sl_no_lates_during_deferment' (confidence 60%) — Student-loan sanity check ensuring deferment/forbearance accounts do not show late history.
