import request from "supertest";
import app from "../server.js";

describe("API endpoints", () => {
  test("GET /api/consumers returns list", async () => {
    const res = await request(app).get("/api/consumers");
    expect(res.status).toBe(200);
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
});

