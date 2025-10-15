# Certified Mail & SMS Monetization Playbook

## Goal & Why (Business Impact)
- Convert existing dispute-letter automation into a high-margin communications engine by productizing certified mail + SMS under one credit-repair workflow.
- Create predictable MRR via tiered subscriptions, ensuring margins (20–50%) above carrier/API costs while funding premium support and compliance overhead.
- Unlock B2B resale and bundling (attorneys, trucking fleets, small business credit teams) to accelerate 7–8 figure scale without diluting brand trust.

## Architecture (Diagram + Decisions)
```
[User Portal (Next.js, EN/ES)]
        |
[Billing & Plans (Stripe)]
        |
[Usage Engine]
   |           \
[Certified Mail Service]   [SMS Service]
 (SimpleCertifiedMail API)  (Plivo/Telnyx)
   |           /
[Reporting & Analytics]
        |
[CRM + Automations]
```
- **Usage Engine**: Central quota/token service in Postgres tracks letter counts and SMS credits per tenant; enforces plan limits and overage pricing.
- **Certified Mail Service**: Abstract provider layer defaulting to SimpleCertifiedMail (fallback Docsmit). Add-ons (return receipt, signature proof, color printing) toggle provider API flags.
- **SMS Service**: Token-based dispatcher supporting Plivo/Telnyx via provider adapters; handles number rentals, MMS upgrades, and compliance checks (opt-in, STOP).
- **Billing & Plans**: Stripe Billing handles subscriptions (tiers), add-ons, volume discounts, and prepaid credit packs. Webhooks sync to usage engine.
- **Reporting & Analytics**: Centralizes cost of goods sold (COGS), margin, and KPIs (Lead→Consult%, token burn rate). Powers reseller dashboards and churn alerts.

## Scaffold / Files (Tree)
```
monetization/
  README.md
  usage_engine/
    app.py            # Flask API for tracking usage & exposing plan info
    models.py         # SQLAlchemy models for plans, usage, add-ons
    provider_client.py# Mail/SMS provider adapters
    tasks.py          # Background reconciliation jobs
  plans/
    certified_mail.yml
    sms_tokens.yml
  analytics/
    margin_dashboard.sql
  tests/
    test_usage_flow.py
```

## Code (Complete, Runnable)
```python
# monetization/usage_engine/app.py
from flask import Flask, request, jsonify
from datetime import datetime
from models import db, UsageEvent, Plan, Tenant
from provider_client import CertifiedMailClient, SMSClient

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///usage.db"
db.init_app(app)

CERTIFIED_MARGIN = 0.35  # 35% markup baseline
SMS_MARGIN = 0.25

@app.post("/usage/certified-mail")
def track_certified_mail():
    payload = request.get_json()
    tenant = Tenant.get_or_404(payload["tenant_id"])
    plan = Plan.get_active_plan(tenant.id, "certified_mail")
    cost = CertifiedMailClient().send_letter(payload)
    price = round(cost * (1 + CERTIFIED_MARGIN), 2)
    usage = UsageEvent.record(
        tenant_id=tenant.id,
        category="certified_mail",
        units=1,
        cost=cost,
        revenue=price,
        metadata={"addons": payload.get("addons", [])}
    )
    overage = plan.consume(1)
    db.session.commit()
    return jsonify({"event_id": usage.id, "price_charged": price, "overage": overage}), 201

@app.post("/usage/sms")
def track_sms():
    payload = request.get_json()
    tenant = Tenant.get_or_404(payload["tenant_id"])
    plan = Plan.get_active_plan(tenant.id, "sms")
    tokens_needed = SMSClient.tokens_required(payload)
    cost = SMSClient().send(payload)
    price = round(cost * (1 + SMS_MARGIN), 4)
    usage = UsageEvent.record(
        tenant_id=tenant.id,
        category="sms",
        units=tokens_needed,
        cost=cost,
        revenue=price,
        metadata={"route": payload.get("route", "plivo"), "mms": payload.get("mms", False)}
    )
    overage = plan.consume(tokens_needed)
    db.session.commit()
    return jsonify({"event_id": usage.id, "tokens_used": tokens_needed, "price_charged": price, "overage": overage}), 201

@app.get("/plans")
def list_plans():
    plans = [plan.to_dict() for plan in Plan.query.all()]
    return jsonify(plans)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)
```

```python
# monetization/usage_engine/models.py
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta

db = SQLAlchemy()

class Tenant(db.Model):
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False)

    @classmethod
    def get_or_404(cls, tenant_id):
        tenant = cls.query.get(tenant_id)
        if not tenant:
            raise ValueError("Tenant not found")
        return tenant

class Plan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.String, db.ForeignKey("tenant.id"))
    category = db.Column(db.String, nullable=False)  # certified_mail or sms
    included_units = db.Column(db.Integer, default=0)
    overage_rate = db.Column(db.Float, nullable=False)
    period_start = db.Column(db.DateTime, default=datetime.utcnow)
    period_end = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(days=30))
    consumed_units = db.Column(db.Integer, default=0)

    def consume(self, units):
        self.consumed_units += units
        if self.consumed_units > self.included_units:
            overage_units = self.consumed_units - self.included_units
            return round(overage_units * self.overage_rate, 2)
        return 0.0

    @classmethod
    def get_active_plan(cls, tenant_id, category):
        return cls.query.filter_by(tenant_id=tenant_id, category=category).first()

    def to_dict(self):
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "category": self.category,
            "included_units": self.included_units,
            "consumed_units": self.consumed_units,
            "overage_rate": self.overage_rate,
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
        }

class UsageEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.String, db.ForeignKey("tenant.id"))
    category = db.Column(db.String)
    units = db.Column(db.Integer)
    cost = db.Column(db.Float)
    revenue = db.Column(db.Float)
    metadata = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @classmethod
    def record(cls, **kwargs):
        usage = cls(**kwargs)
        db.session.add(usage)
        return usage
```

```python
# monetization/usage_engine/provider_client.py
import random

class CertifiedMailClient:
    def send_letter(self, payload):
        base_cost = 4.25  # provider cost fetched from SimpleCertifiedMail pricing table
        addons = payload.get("addons", [])
        addon_cost = 0
        if "return_receipt" in addons:
            addon_cost += 1.75
        if "signature_proof" in addons:
            addon_cost += 2.10
        if payload.get("color" ):
            addon_cost += 0.60
        return base_cost + addon_cost

class SMSClient:
    def tokens_required(self, payload):
        segments = max(1, len(payload["message"]) // 160 + 1)
        if payload.get("mms"):
            return segments * 3
        return segments

    def send(self, payload):
        per_segment_cost = 0.0035  # negotiated Plivo/Telnyx rate
        return per_segment_cost * self.tokens_required(payload)
```

## How to Run (Commands)
1. `cd monetization`
2. `python3 -m venv .venv && source .venv/bin/activate`
3. `pip install flask flask-sqlalchemy`
4. `python usage_engine/app.py`
5. (Smoke test) `curl -X POST http://127.0.0.1:5000/usage/certified-mail -H 'Content-Type: application/json' -d '{"tenant_id":"tenant-1","addons":["return_receipt"]}'`

## Metrics / AB Ideas
- Track **Gross Margin per Channel**: (Revenue - COGS) / Revenue by certified mail vs SMS segments.
- Instrument funnel for **Lead→Token Purchase%** and **Token Purchase→Overage Upgrade%** using Segment + Mixpanel.
- A/B Tests:
  1. CTA copy: “Send Certified Letters Today” vs. “Lock In Proof of Delivery (Hoy mismo)” on bilingual landing.
  2. Pricing anchor: show monthly plan default vs prepaid credits first.
  3. Bundle upsell placement: offer “Dispute Mail + SMS follow-up” on checkout vs dashboard modal.

## Next Revenue Wins
- Launch reseller portal with white-label dashboards and automated SimpleCertifiedMail onboarding wizard.
- Bundle SMS verification flows with dispute-letter delivery, offering discounted combined tokens for annual plans.
- Negotiate volume discounts after 5k letters/month and pass 50% savings to users while capturing the rest as margin.
- Implement auto-recharge with threshold alerts (email/SMS) to reduce downtime and increase token top-ups.
- Add premium add-ons: expedited mail SLA, compliance audit review, bilingual concierge onboarding.
