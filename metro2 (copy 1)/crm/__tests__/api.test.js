import request from "supertest";
import app from "../server.js";
import { configureTenantLimits, resetTenantUsage, resetTenantOverrides, DEFAULT_TENANT_ID } from "../tenantLimits.js";

describe("API endpoints", () => {
  beforeEach(() => {
    resetTenantUsage();
    configureTenantLimits({});
  });

  afterAll(() => {
    resetTenantUsage();
    resetTenantOverrides();
  });

  test("GET /api/consumers returns list", async () => {
    const res = await request(app).get("/api/consumers");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.consumers)).toBe(true);
  });

  test("GET /api/letters returns jobs array", async () => {
    const res = await request(app).get("/api/letters");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
  });

  test("GET /buy fails without Stripe", async () => {
    const res = await request(app).get("/buy");
    expect(res.status).toBe(500);
  });

  test("upload report and retrieve parsed data", async () => {
    const consumerId = "RoVO6y0EKM";
    const html = `<!DOCTYPE html><html><body>
      <div class="sub_header">Test Creditor</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr><td class="label">Account #</td><td class="info">123</td><td class="info">456</td><td class="info">789</td></tr>
      </table>
    </body></html>`;

    const uploadRes = await request(app)
      .post(`/api/consumers/${consumerId}/upload`)
      .attach("file", Buffer.from(html), "report.html");

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.ok).toBe(true);
    const { reportId } = uploadRes.body;

    const reportRes = await request(app).get(`/api/consumers/${consumerId}/report/${reportId}`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.report.tradelines[0].meta.creditor).toBe("Test Creditor");
  });

  test("tenant request quota blocks excess calls", async () => {
    configureTenantLimits({
      [DEFAULT_TENANT_ID]: {
        "requests:minute": { limit: 1, windowMs: 60_000 },
      },
    });

    const login = await request(app)
      .post("/api/login")
      .send({ username: "ducky", password: "duck" });
    expect(login.status).toBe(200);
    const token = login.body.token;
    expect(typeof token).toBe("string");

    resetTenantUsage();

    const headers = { Authorization: `Bearer ${token}` };
    const first = await request(app).get("/api/consumers").set(headers);
    expect(first.status).toBe(200);

    const second = await request(app).get("/api/consumers").set(headers);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("TENANT_QUOTA");
  });
});

