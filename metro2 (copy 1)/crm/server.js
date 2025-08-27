// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import multer from "multer";
import { nanoid } from "nanoid";
import { spawn, spawnSync } from "child_process";
import puppeteer from "puppeteer";
import crypto from "crypto";
import os from "os";
import archiver from "archiver";

import { PassThrough } from "stream";

import { generateLetters, generatePersonalInfoLetters, generateInquiryLetters, generateDebtCollectorLetters } from "./letterEngine.js";
import { PLAYBOOKS } from "./playbook.js";
import { normalizeReport, renderHtml, savePdf } from "./creditAuditTool.js";
import {
  listConsumerState,
  addEvent,
  addFileMeta,
  consumerUploadsDir,
  addReminder,
  processAllReminders,
} from "./state.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  console.warn("Nodemailer not installed");
}

const app = express();
app.use(express.json({ limit: "10mb" }));
let mailer = null;
if(nodemailer && process.env.SMTP_HOST){
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

// Basic request logging for debugging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

// periodically surface due letter reminders
processAllReminders();
setInterval(() => {
  try { processAllReminders(); }
  catch (e) { console.error("Reminder check failed", e); }
}, 60 * 60 * 1000);

// ---------- Static UI ----------
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/dashboard", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "dashboard.html")));
app.get("/clients", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/leads", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "leads.html")));
app.get("/schedule", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "schedule.html")));
app.get("/my-company", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "my-company.html")));
app.get("/billing", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "billing.html")));
app.get("/library", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "library.html")));
app.get(["/letters", "/letters/:jobId"], (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "letters.html"))
);
app.get("/quiz", (_req,res)=> res.sendFile(path.join(PUBLIC_DIR, "quiz.html")));
app.get("/portal/:id", (req, res) => {
  const db = loadDB();
  const consumer = db.consumers.find(c => c.id === req.params.id);
  if (!consumer) return res.status(404).send("Portal not found");
  const tmpl = fs.readFileSync(path.join(PUBLIC_DIR, "client-portal-template.html"), "utf-8");
  const html = tmpl.replace(/{{name}}/g, consumer.name);
  res.send(html);
});

// ---------- Simple JSON "DB" ----------
const DB_PATH = path.join(__dirname, "db.json");
function loadDB(){ try{ return JSON.parse(fs.readFileSync(DB_PATH,"utf-8")); }catch{ return { consumers: [] }; } }
function saveDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); }

const LETTERS_DB_PATH = path.join(__dirname, "letters-db.json");
function loadLettersDB(){
  try{
    const raw = fs.readFileSync(LETTERS_DB_PATH,"utf-8");
    const db = JSON.parse(raw);
    console.log(`Loaded letters DB with ${db.jobs?.length || 0} jobs`);
    return db;
  }catch(e){
    console.warn("letters-db.json missing or invalid, using empty structure");
    return { jobs: [], templates: [], sequences: [], contracts: [] };
  }
}

function saveLettersDB(db){
  fs.writeFileSync(LETTERS_DB_PATH, JSON.stringify(db,null,2));
  console.log(`Saved letters DB with ${db.jobs.length} jobs`);
}
function recordLettersJob(consumerId, jobId, letters){
  console.log(`Recording letters job ${jobId} for consumer ${consumerId}`);
  const db = loadLettersDB();
  db.jobs.push({ consumerId, jobId, createdAt: Date.now(), letters: letters.map(L=>({ filename:L.filename, bureau:L.bureau, creditor:L.creditor })) });
  saveLettersDB(db);
}
if(!fs.existsSync(LETTERS_DB_PATH)){
  console.log(`letters-db.json not found. Initializing at ${LETTERS_DB_PATH}`);
  saveLettersDB({ jobs: [], templates: [], sequences: [], contracts: [] });
}

const LEADS_DB_PATH = path.join(__dirname, "leads-db.json");
function loadLeadsDB(){ try{ return JSON.parse(fs.readFileSync(LEADS_DB_PATH,"utf-8")); }catch{ return { leads: [] }; } }
function saveLeadsDB(db){ fs.writeFileSync(LEADS_DB_PATH, JSON.stringify(db,null,2)); }

const INVOICES_DB_PATH = path.join(__dirname, "invoices-db.json");
function loadInvoicesDB(){
  try{ return JSON.parse(fs.readFileSync(INVOICES_DB_PATH, "utf-8")); }
  catch{ return { invoices: [] }; }
}
function saveInvoicesDB(db){ fs.writeFileSync(INVOICES_DB_PATH, JSON.stringify(db,null,2)); }

function renderInvoiceHtml(inv, company = {}, consumer = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: sans-serif; margin:40px; }
    h1 { text-align:center; }
    table { width:100%; border-collapse:collapse; margin-top:20px; }
    th, td { padding:8px; border-bottom:1px solid #ddd; text-align:left; }
  </style>
  </head><body>
  <h1>${company.name || 'Invoice'}</h1>
  <p><strong>Bill To:</strong> ${consumer.name || ''}</p>
  <table>
    <thead><tr><th>Description</th><th>Amount</th><th>Due</th></tr></thead>
    <tbody><tr><td>${inv.desc}</td><td>$${Number(inv.amount).toFixed(2)}</td><td>${inv.due || ''}</td></tr></tbody>
  </table>
  </body></html>`;
}


const LIB_PATH = path.join(__dirname, "creditor_library.json");
function loadLibrary(){
  try{ return JSON.parse(fs.readFileSync(LIB_PATH, "utf-8")); }
  catch{ return {}; }
}

// ---------- Upload handling ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Python Analyzer Bridge ----------
async function runPythonAnalyzer(htmlContent){
  const scriptPath = path.join(__dirname, "metro2_audit_multi.py");
  await fs.promises.access(scriptPath, fs.constants.R_OK)
    .catch(()=>{ throw new Error(`Analyzer not found or unreadable: ${scriptPath}`); });
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(),"metro2-"));
  const htmlPath = path.join(tmpDir,"report.html");
  const outPath  = path.join(tmpDir,"report.json");
  await fs.promises.writeFile(htmlPath, htmlContent, "utf-8");

  const py = spawn("python3", [scriptPath,"-i",htmlPath,"-o",outPath], { stdio:["ignore","pipe","pipe"] });
  let stdout="", stderr="";
  py.stdout.on("data",d=>stdout+=d.toString());
  py.stderr.on("data",d=>stderr+=d.toString());

  return new Promise((resolve,reject)=>{
    py.on("error", async(err) => {
      try { await fs.promises.rm(tmpDir,{recursive:true,force:true}); }catch{}
      reject(err);
    });
    py.on("close", async(code)=>{
      try{
        if(code!==0) throw new Error(`Analyzer exit ${code}\n${stderr}\n${stdout}`);
        await fs.promises.access(outPath, fs.constants.R_OK);
        const raw = await fs.promises.readFile(outPath, "utf-8");
        const json = JSON.parse(raw);
        resolve(json);
      }catch(e){ reject(e); }
      finally{ try{ await fs.promises.rm(tmpDir,{recursive:true,force:true}); }catch{} }
    });
  });
}

// =================== Consumers ===================
app.get("/api/consumers", (_req,res)=> res.json(loadDB()));
app.get("/api/library", (_req,res)=> res.json({ ok:true, library: loadLibrary() }));

app.post("/api/consumers", (req,res)=>{
  const db = loadDB();
  const id = nanoid(10);
  const consumer = {
    id,
    name: req.body.name || "Unnamed",
    email: req.body.email || "",
    phone: req.body.phone || "",
    addr1: req.body.addr1 || "",
    addr2: req.body.addr2 || "",
    city:  req.body.city  || "",
    state: req.body.state || "",
    zip:   req.body.zip   || "",
    ssn_last4: req.body.ssn_last4 || "",
    dob: req.body.dob || "",
    sale: Number(req.body.sale) || 0,
    paid: Number(req.body.paid) || 0,
    status: req.body.status || "active",

    reports: []
  };
  db.consumers.push(consumer);
  saveDB(db);
  // log event
  addEvent(id, "consumer_created", { name: consumer.name });
  res.json({ ok:true, consumer });
});

app.put("/api/consumers/:id", (req,res)=>{
  const db = loadDB();
  const c = db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  Object.assign(c, {
    name:req.body.name??c.name, email:req.body.email??c.email, phone:req.body.phone??c.phone,
    addr1:req.body.addr1??c.addr1, addr2:req.body.addr2??c.addr2, city:req.body.city??c.city,
    state:req.body.state??c.state, zip:req.body.zip??c.zip, ssn_last4:req.body.ssn_last4??c.ssn_last4,
    dob:req.body.dob??c.dob,
    sale: req.body.sale !== undefined ? Number(req.body.sale) : c.sale,
    paid: req.body.paid !== undefined ? Number(req.body.paid) : c.paid,
    status: req.body.status ?? c.status ?? "active"

  });
  saveDB(db);
  addEvent(c.id, "consumer_updated", { fields: Object.keys(req.body||{}) });
  res.json({ ok:true, consumer:c });
});

app.delete("/api/consumers/:id", (req,res)=>{
  const db=loadDB();
  const i=db.consumers.findIndex(c=>c.id===req.params.id);
  if(i===-1) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const removed = db.consumers[i];
  db.consumers.splice(i,1);
  saveDB(db);
  addEvent(removed.id, "consumer_deleted", {});
  res.json({ ok:true });
});

// =================== Leads ===================
app.get("/api/leads", (_req,res)=> res.json({ ok:true, ...loadLeadsDB() }));


app.post("/api/leads", (req,res)=>{
  const db = loadLeadsDB();
  const id = nanoid(10);
  const lead = {
    id,
    name: req.body.name || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    source: req.body.source || "",
    notes: req.body.notes || "",
    status: "new"

  };
  db.leads.push(lead);
  saveLeadsDB(db);
  res.json({ ok:true, lead });
});

app.put("/api/leads/:id", (req,res)=>{
  const db = loadLeadsDB();
  const lead = db.leads.find(l=>l.id===req.params.id);
  if(!lead) return res.status(404).json({ error:"Not found" });
  Object.assign(lead, {
    name: req.body.name ?? lead.name,
    email: req.body.email ?? lead.email,
    phone: req.body.phone ?? lead.phone,
    source: req.body.source ?? lead.source,
    notes: req.body.notes ?? lead.notes,
    status: req.body.status ?? lead.status
  });
  saveLeadsDB(db);
  res.json({ ok:true, lead });
});

app.delete("/api/leads/:id", (req,res)=>{
  const db = loadLeadsDB();
  const idx = db.leads.findIndex(l=>l.id===req.params.id);
  if(idx === -1) return res.status(404).json({ error:"Not found" });
  db.leads.splice(idx,1);
  saveLeadsDB(db);
  res.json({ ok:true });
});

// =================== Invoices ===================
app.get("/api/invoices/:consumerId", (req,res)=>{
  const db = loadInvoicesDB();
  const list = db.invoices.filter(inv => inv.consumerId === req.params.consumerId);
  res.json({ ok:true, invoices: list });
});

app.post("/api/invoices", async (req,res)=>{
  const db = loadInvoicesDB();
  const inv = {
    id: nanoid(10),
    consumerId: req.body.consumerId,
    desc: req.body.desc || "",
    amount: Number(req.body.amount) || 0,
    due: req.body.due || null,
    paid: !!req.body.paid,
    pdf: null,
  };

  let result;
  try {
    const company = req.body.company || {};
    const mainDb = loadDB();
    const consumer = mainDb.consumers.find(c => c.id === inv.consumerId) || {};
    const html = renderInvoiceHtml(inv, company, consumer);
    result = await savePdf(html);
    let ext = path.extname(result.path);
    if (result.warning || ext !== ".pdf") {
      console.error("Invoice PDF generation failed", result.warning);
      ext = ".html";
    }
    const mime = ext === ".pdf" ? "application/pdf" : "text/html";
    const uploadsDir = consumerUploadsDir(inv.consumerId);
    const fid = nanoid(10);
    const storedName = `${fid}${ext}`;
    const dest = path.join(uploadsDir, storedName);
    await fs.promises.copyFile(result.path, dest);
    const stat = await fs.promises.stat(dest);
    addFileMeta(inv.consumerId, {
      id: fid,
      originalName: `invoice_${inv.id}${ext}`,
      storedName,
      type: "invoice",
      size: stat.size,
      mimetype: mime,
      uploadedAt: new Date().toISOString(),
    });
    inv.pdf = storedName;
  } catch (err) {
    console.error("Failed to generate invoice PDF", err);
  }

  const payLink = req.body.payLink || `https://pay.example.com/${inv.id}`;
  addEvent(inv.consumerId, "message", {
    from: "system",
    text: `Payment due for ${inv.desc} ($${inv.amount.toFixed(2)}). Pay here: ${payLink}`,
  });


  db.invoices.push(inv);
  saveInvoicesDB(db);
  res.json({ ok:true, invoice: inv, warning: result?.warning });
});

app.put("/api/invoices/:id", (req,res)=>{
  const db = loadInvoicesDB();
  const inv = db.invoices.find(i=>i.id===req.params.id);
  if(!inv) return res.status(404).json({ ok:false, error:"Not found" });
  if(req.body.desc !== undefined) inv.desc = req.body.desc;
  if(req.body.amount !== undefined) inv.amount = Number(req.body.amount) || 0;
  if(req.body.due !== undefined) inv.due = req.body.due;
  if(req.body.paid !== undefined) inv.paid = !!req.body.paid;
  saveInvoicesDB(db);
  res.json({ ok:true, invoice: inv });
});

// =================== Messages ===================
app.get("/api/messages/:consumerId", (req,res)=>{
  const cstate = listConsumerState(req.params.consumerId);
  const msgs = (cstate.events || []).filter(e=>e.type === "message");
  res.json({ ok:true, messages: msgs });
});

app.post("/api/messages/:consumerId", (req,res)=>{
  const text = req.body.text || "";
  const from = req.body.from || "host";
  addEvent(req.params.consumerId, "message", { from, text });
  res.json({ ok:true });
});

// =================== Templates / Sequences / Contracts ===================
app.get("/api/templates", (_req,res)=>{
  const db = loadLettersDB();
  res.json({
    ok: true,
    templates: db.templates || [],
    sequences: db.sequences || [],
    contracts: db.contracts || []
  });
});

app.post("/api/templates", (req,res)=>{
  const db = loadLettersDB();
  const tpl = { id: nanoid(8), name: req.body.name || "", body: req.body.body || "" };
  db.templates = db.templates || [];
  db.templates.push(tpl);
  saveLettersDB(db);
  res.json({ ok:true, template: tpl });
});

app.post("/api/sequences", (req,res)=>{
  const db = loadLettersDB();
  const seq = { id: nanoid(8), name: req.body.name || "", templates: req.body.templates || [] };
  db.sequences = db.sequences || [];
  db.sequences.push(seq);
  saveLettersDB(db);
  res.json({ ok:true, sequence: seq });
});

app.post("/api/contracts", (req,res)=>{
  const db = loadLettersDB();
  const ct = { id: nanoid(8), name: req.body.name || "", body: req.body.body || "" };
  db.contracts = db.contracts || [];
  db.contracts.push(ct);
  saveLettersDB(db);
  res.json({ ok:true, contract: ct });
});


// Upload HTML -> analyze -> save under consumer
app.post("/api/consumers/:id/upload", upload.single("file"), async (req,res)=>{
  const db=loadDB();
  const consumer = db.consumers.find(c=>c.id===req.params.id);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
  if(!req.file) return res.status(400).json({ ok:false, error:"No file uploaded" });

  try{
    const analyzed = await runPythonAnalyzer(req.file.buffer.toString("utf-8"));
    const rid = nanoid(8);
    // store original uploaded file so clients can access it from document center
    const uploadDir = consumerUploadsDir(consumer.id);
    const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i)||[""])[0] || "";
    const storedName = `${rid}${ext}`;
    await fs.promises.writeFile(path.join(uploadDir, storedName), req.file.buffer);
    addFileMeta(consumer.id, {
      id: rid,
      originalName: req.file.originalname,
      storedName,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    });
    consumer.reports.unshift({
      id: rid,
      uploadedAt: new Date().toISOString(),
      filename: req.file.originalname,
      size: req.file.size,
      summary: { tradelines: analyzed?.tradelines?.length || 0 },
      data: analyzed
    });
    saveDB(db);
    addEvent(consumer.id, "report_uploaded", {
      reportId: rid,
      filename: req.file.originalname,
      size: req.file.size
    });
    res.json({ ok:true, reportId: rid });
  }catch(e){
    console.error("Analyzer error:", e);
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.get("/api/consumers/:id/reports", (req,res)=>{
  const db=loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  res.json({ ok:true, reports: c.reports.map(r=>({ id:r.id, uploadedAt:r.uploadedAt, filename:r.filename, summary:r.summary })) });
});

app.get("/api/consumers/:id/report/:rid", (req,res)=>{
  const db=loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const r=c.reports.find(x=>x.id===req.params.rid);
  if(!r) return res.status(404).json({ ok:false, error:"Report not found" });
  res.json({ ok:true, report:r.data, consumer:{
    id:c.id,name:c.name,email:c.email,phone:c.phone,addr1:c.addr1,addr2:c.addr2,city:c.city,state:c.state,zip:c.zip,ssn_last4:c.ssn_last4,dob:c.dob
  }});
});

app.delete("/api/consumers/:id/report/:rid", (req,res)=>{
  const db=loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const i=c.reports.findIndex(x=>x.id===req.params.rid);
  if(i===-1) return res.status(404).json({ ok:false, error:"Report not found" });
  const removed = c.reports[i];
  c.reports.splice(i,1);
  saveDB(db);
  addEvent(c.id, "report_deleted", { reportId: removed?.id, filename: removed?.filename });
  res.json({ ok:true });
});

app.post("/api/consumers/:id/report/:rid/audit", async (req,res)=>{
  const db=loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const r=c.reports.find(x=>x.id===req.params.rid);
  if(!r) return res.status(404).json({ ok:false, error:"Report not found" });

  const selections = Array.isArray(req.body?.selections) && req.body.selections.length
    ? req.body.selections
    : null;

  try{
    const normalized = normalizeReport(r.data, selections);
    const html = renderHtml(normalized, c.name);
    const result = await savePdf(html);
    let ext = path.extname(result.path);
    if (result.warning || ext !== ".pdf") {
      console.error("Audit PDF generation failed", result.warning);
      ext = ".html";
    }
    const mime = ext === ".pdf" ? "application/pdf" : "text/html";

    // copy report into consumer uploads and register metadata
    try {
      const uploadsDir = consumerUploadsDir(c.id);
      const id = nanoid(10);
      const storedName = `${id}${ext}`;
      const safe = (c.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const date = new Date().toISOString().slice(0,10);
      const originalName = `${safe}_${date}_audit${ext}`;
      const dest = path.join(uploadsDir, storedName);
      await fs.promises.copyFile(result.path, dest);
      const stat = await fs.promises.stat(dest);
      addFileMeta(c.id, {
        id,
        originalName,
        storedName,
        type: "audit",
        size: stat.size,
        mimetype: mime,
        uploadedAt: new Date().toISOString(),
      });
    } catch(err) {
      console.error("Failed to store audit file", err);
    }

    addEvent(c.id, "audit_generated", { reportId: r.id, file: result.url });
    res.json({ ok:true, url: result.url, warning: result.warning });
  }catch(e){
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Check consumer email against Have I Been Pwned
// Use POST so email isn't logged in query string
async function hibpLookup(email) {
  const apiKey = process.env.HIBP_API_KEY;
  if (!apiKey) return { ok: false, status: 500, error: "HIBP API key not configured" };
  try {
    const hibpRes = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          "hibp-api-key": apiKey,
          "user-agent": "crm-app",
        },
      }
    );
    if (hibpRes.status === 404) {
      return { ok: true, breaches: [] };
    }
    if (!hibpRes.ok) {
      const text = await hibpRes.text().catch(() => "");
      return {
        ok: false,
        status: hibpRes.status,
        error: text || `HIBP request failed (status ${hibpRes.status})`,
      };
    }
    const data = await hibpRes.json();
    return { ok: true, breaches: data };
  } catch (e) {
    console.error("HIBP check failed", e);
    return { ok: false, status: 500, error: "HIBP request failed" };
  }
}

async function handleDataBreach(email, res) {
  const result = await hibpLookup(email);
  if (result.ok) return res.json(result);
  res.status(result.status || 500).json({ ok: false, error: result.error });
}

app.post("/api/databreach", async (req, res) => {
  const email = String(req.body.email || "").trim();
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  await handleDataBreach(email, res);
});

app.get("/api/databreach", async (req, res) => {
  const email = String(req.query.email || "").trim();
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  await handleDataBreach(email, res);
});


// =================== Letters & PDFs ===================
const LETTERS_DIR = path.join(__dirname, "letters");
fs.mkdirSync(LETTERS_DIR,{ recursive:true });
const JOBS_INDEX_PATH = path.join(LETTERS_DIR, "_jobs.json");

// in-memory jobs
const JOB_TTL_MS = 30*60*1000;
const jobs = new Map(); // jobId -> { letters, createdAt }
function putJobMem(jobId, letters){ jobs.set(jobId,{ letters, createdAt: Date.now() }); }
function getJobMem(jobId){
  const j = jobs.get(jobId);
  if(!j) return null;
  if(Date.now()-j.createdAt > JOB_TTL_MS){ jobs.delete(jobId); return null; }
  return j;
}
setInterval(()=>{ const now=Date.now(); for(const [id,j] of jobs){ if(now-j.createdAt>JOB_TTL_MS) jobs.delete(id); } }, 5*60*1000);

// disk index helpers
function loadJobsIndex(){
  try{
    fs.mkdirSync(LETTERS_DIR,{ recursive:true });
    const raw = fs.readFileSync(JOBS_INDEX_PATH,"utf-8");
    return JSON.parse(raw);
  }catch{ return { jobs:{} }; }
}
function saveJobsIndex(idx){
  fs.mkdirSync(LETTERS_DIR,{ recursive:true });
  fs.writeFileSync(JOBS_INDEX_PATH, JSON.stringify(idx,null,2));
}

// chromium detection for puppeteer
async function detectChromium(){
  if(process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable"
  ];
  for (const p of candidates) {
    try {
      await fs.promises.access(p, fs.constants.X_OK);
      const check = spawnSync(p, ["--version"], { stdio: "ignore" });
      if (check.status === 0) return p;
    } catch {}
  }
  return null;
}

async function launchBrowser(){
  const execPath = await detectChromium();
  const opts = { headless:true, args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-zygote","--single-process"] };
  if(execPath) opts.executablePath = execPath;
  return puppeteer.launch(opts);
}

// Create job: memory + disk
function persistJobToDisk(jobId, letters){
  console.log(`Persisting job ${jobId} with ${letters.length} letters to disk`);
  const idx = loadJobsIndex();
  idx.jobs[jobId] = {
    createdAt: Date.now(),
    letters: letters.map(L => ({
      filename: L.filename,
      bureau: L.bureau,
      creditor: L.creditor
    }))
  };
  saveJobsIndex(idx);
  console.log(`Job ${jobId} saved to index at ${JOBS_INDEX_PATH}`);
}

// Load job from disk (returns { letters: [{... , htmlPath}]})
function loadJobFromDisk(jobId){
  console.log(`Loading job ${jobId} from disk`);
  const idx = loadJobsIndex();
  const meta = idx.jobs?.[jobId];
  if(!meta){
    console.warn(`Job ${jobId} not found on disk`);
    return null;
  }
  const letters = (meta.letters || []).map(item => ({
    ...item,
    htmlPath: path.join(LETTERS_DIR, item.filename),
  }));
  console.log(`Loaded job ${jobId} with ${letters.length} letters from disk`);
  return { letters, createdAt: meta.createdAt || Date.now() };
}

// Generate letters (from selections) -> memory + disk
app.post("/api/generate", async (req,res)=>{
  try{
    const { consumerId, reportId, selections, requestType, personalInfo, inquiries, collectors } = req.body;

    const db = loadDB();
    const consumer = db.consumers.find(c=>c.id===consumerId);
    if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
    const reportWrap = consumer.reports.find(r=>r.id===reportId);
    if(!reportWrap) return res.status(404).json({ ok:false, error:"Report not found" });

    const consumerForLetter = {
      name: consumer.name, email: consumer.email, phone: consumer.phone,
      addr1: consumer.addr1, addr2: consumer.addr2, city: consumer.city, state: consumer.state, zip: consumer.zip,
      ssn_last4: consumer.ssn_last4, dob: consumer.dob
    };

    const letters = generateLetters({ report: reportWrap.data, selections, consumer: consumerForLetter, requestType });
    if (personalInfo) {
      letters.push(...generatePersonalInfoLetters({ consumer: consumerForLetter }));
    }
    if (Array.isArray(inquiries) && inquiries.length) {
      letters.push(...generateInquiryLetters({ consumer: consumerForLetter, inquiries }));
    }
    if (Array.isArray(collectors) && collectors.length) {
      letters.push(...generateDebtCollectorLetters({ consumer: consumerForLetter, collectors }));
    }

    console.log(`Generated ${letters.length} letters for consumer ${consumer.id}`);
    const jobId = crypto.randomBytes(8).toString("hex");

    fs.mkdirSync(LETTERS_DIR, { recursive: true });
    for(const L of letters){
      fs.writeFileSync(path.join(LETTERS_DIR, L.filename), L.html, "utf-8");
      console.log(`Saved letter ${L.filename}`);
    }

    putJobMem(jobId, letters);
    persistJobToDisk(jobId, letters);
    recordLettersJob(consumer.id, jobId, letters);
    console.log(`Letters job ${jobId} recorded with ${letters.length} letters`);

    // log state
    addEvent(consumer.id, "letters_generated", {
      jobId, requestType, count: letters.length,
      tradelines: Array.from(new Set((selections||[]).map(s=>s.tradelineIndex))).length,
      inquiries: Array.isArray(inquiries) ? inquiries.length : 0,
      collectors: Array.isArray(collectors) ? collectors.length : 0

    });

    // schedule reminders for subsequent playbook steps
    for (const sel of selections || []) {
      const play = sel.playbook && PLAYBOOKS[sel.playbook];
      if (!play) continue;
      play.letters.slice(1).forEach((title, idx) => {
        const due = new Date();
        due.setDate(due.getDate() + (idx + 1) * 30);
        addReminder(consumer.id, {
          id: `rem_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          due: due.toISOString(),
          payload: {
            tradelineIndex: sel.tradelineIndex,
            playbook: sel.playbook,
            step: title,
            stepNumber: idx + 2,
          },
        });
      });
    }

    res.json({ ok:true, redirect: `/letters?job=${jobId}` });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// List stored letter jobs
app.get("/api/letters", (_req,res)=>{
  const ldb = loadLettersDB();
  const cdb = loadDB();
  const jobs = ldb.jobs.map(j => ({
    jobId: j.jobId,
    consumerId: j.consumerId,
    consumerName: cdb.consumers.find(c=>c.id===j.consumerId)?.name || "",
    createdAt: j.createdAt,
    count: (j.letters || []).length
  }));
  console.log(`Listing ${jobs.length} letter jobs`);
  res.json({ ok:true, jobs });
});

// List letters for a job
app.get("/api/letters/:jobId", (req,res)=>{
  const { jobId } = req.params;
  console.log(`Fetching job ${jobId}`);
  let job = getJobMem(jobId);
  if(!job){
    const disk = loadJobFromDisk(jobId);
    if(disk){
      putJobMem(jobId, disk.letters.map(d => ({
        filename: path.basename(d.htmlPath),
        bureau: d.bureau,
        creditor: d.creditor,
        html: fs.existsSync(d.htmlPath) ? fs.readFileSync(d.htmlPath,"utf-8") : "<html><body>Missing file.</body></html>"
      })));
      job = getJobMem(jobId);
    }
  }
  if(!job) return res.status(404).json({ ok:false, error:"Job not found or expired" });

  const meta = job.letters.map((L,i)=>({ index:i, filename:L.filename, bureau:L.bureau, creditor:L.creditor }));
  console.log(`Job ${jobId} has ${meta.length} letters`);
  res.json({ ok:true, letters: meta });
});

// Serve letter HTML (preview embed)
app.get("/api/letters/:jobId/:idx.html", (req,res)=>{
  const { jobId, idx } = req.params;
  console.log(`Serving HTML for job ${jobId} letter ${idx}`);
  let job = getJobMem(jobId);
  if(!job){
    const disk = loadJobFromDisk(jobId);
    if(!disk) return res.status(404).send("Job not found or expired.");
    const Lm = disk.letters[Number(idx)];
    if(!Lm || !fs.existsSync(Lm.htmlPath)) return res.status(404).send("Letter not found.");
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.send(fs.readFileSync(Lm.htmlPath,"utf-8"));
  }
  const L = job.letters[Number(idx)];
  if(!L) return res.status(404).send("Letter not found.");
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.send(L.html);
});

app.put("/api/letters/:jobId/:idx", async (req,res)=>{
  const { jobId, idx } = req.params;
  const html = req.body?.html;
  if(typeof html !== "string") return res.status(400).json({ ok:false, error:"Missing html" });
  console.log(`Updating letter ${idx} for job ${jobId}`);
  let job = getJobMem(jobId);
  if(job){
    const L = job.letters[Number(idx)];
    if(!L) return res.status(404).json({ ok:false, error:"Letter not found" });
    L.html = html;
    try{ fs.writeFileSync(path.join(LETTERS_DIR, L.filename), html); }
    catch(e){ return res.status(500).json({ ok:false, error:String(e) }); }
    console.log(`Letter ${L.filename} updated on disk`);
    return res.json({ ok:true });
  }
  const disk = loadJobFromDisk(jobId);
  if(!disk) return res.status(404).json({ ok:false, error:"Job not found" });
  const Lm = disk.letters[Number(idx)];
  if(!Lm) return res.status(404).json({ ok:false, error:"Letter not found" });
  try{ fs.writeFileSync(Lm.htmlPath, html); }
  catch(e){ return res.status(500).json({ ok:false, error:String(e) }); }
  console.log(`Letter ${Lm.htmlPath} updated on disk`);
  res.json({ ok:true });
});

// Render letter PDF on-the-fly
app.get("/api/letters/:jobId/:idx.pdf", async (req,res)=>{
  const { jobId, idx } = req.params;
  console.log(`Generating PDF for job ${jobId} letter ${idx}`);
  let html;
  let filenameBase = "letter";

  let job = getJobMem(jobId);
  if(job){
    const L = job.letters[Number(idx)];
    if(!L) return res.status(404).send("Letter not found.");
    html = L.html;
    filenameBase = (L.filename||"letter").replace(/\.html?$/i,"");
  }else{
    const disk = loadJobFromDisk(jobId);
    if(!disk) return res.status(404).send("Job not found or expired.");
    const Lm = disk.letters[Number(idx)];
    if(!Lm || !fs.existsSync(Lm.htmlPath)) return res.status(404).send("Letter not found.");
    html = fs.readFileSync(Lm.htmlPath,"utf-8");
    filenameBase = path.basename(Lm.htmlPath).replace(/\.html?$/i,"");
  }

  let browser;
  try{
    browser = await launchBrowser();
    const page = await browser.newPage();
    const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    await page.goto(dataUrl, { waitUntil:"load", timeout:60000 });
    await page.emulateMediaType("screen");
    try{ await page.waitForFunction(()=>document.readyState==="complete",{timeout:60000}); }catch{}
    try{ await page.evaluate(()=> (document.fonts && document.fonts.ready) || Promise.resolve()); }catch{}
    await page.evaluate(()=> new Promise(r=>setTimeout(r,80)));
    const pdf = await page.pdf({ format:"Letter", printBackground:true, margin:{top:"1in",right:"1in",bottom:"1in",left:"1in"} });
    await page.close();
    if(!pdf || pdf.length === 0){
      throw new Error("Generated PDF is empty");
    }

    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${filenameBase}.pdf"`);
    console.log(`Generated PDF for ${filenameBase} (${pdf.length} bytes)`);
    res.send(pdf);
  }catch(e){
    console.error("PDF error:", e);
    res.status(500).send("Failed to render PDF.");
  }finally{ try{ await browser?.close(); }catch{} }
});

app.get("/api/letters/:jobId/all.zip", async (req,res)=>{
  const { jobId } = req.params;
  let job = getJobMem(jobId);
  if(!job){
    const disk = loadJobFromDisk(jobId);
    if(disk){
      putJobMem(jobId, disk.letters.map(d => ({
        filename: path.basename(d.htmlPath),
        bureau: d.bureau,
        creditor: d.creditor,
        html: fs.existsSync(d.htmlPath) ? fs.readFileSync(d.htmlPath,"utf-8") : "<html><body>Missing file.</body></html>"
      })));
      job = getJobMem(jobId);
    }
  }
  if(!job) return res.status(404).json({ ok:false, error:"Job not found or expired" });

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition",`attachment; filename="letters_${jobId}.zip"`);
  const archive = archiver('zip',{ zlib:{ level:9 } });
  archive.on('error', err => { console.error(err); try{ res.status(500).end("Zip error"); }catch{} });

  // determine consumer for logging and file storage
  let fileStream, storedName, originalName, consumer, id;
  try{
    const ldb = loadLettersDB();
    const meta = ldb.jobs.find(j=>j.jobId === jobId);
    if(meta?.consumerId){
      const db = loadDB();
      consumer = db.consumers.find(c=>c.id === meta.consumerId);
    }
  }catch{}

  if(consumer){
    const pass = new PassThrough();
    archive.pipe(pass);
    pass.pipe(res);

    const dir = consumerUploadsDir(consumer.id);
    id = nanoid(10);
    storedName = `${id}.zip`;
    const safe = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const date = new Date().toISOString().slice(0,10);
    originalName = `${safe}_${date}_letters.zip`;
    const fullPath = path.join(dir, storedName);
    fileStream = fs.createWriteStream(fullPath);
    pass.pipe(fileStream);
  } else {
    archive.pipe(res);
  }

  let browser;
  try{
    browser = await launchBrowser();
    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const page = await browser.newPage();
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(L.html);
      await page.goto(dataUrl,{ waitUntil:"load", timeout:60000 });
      await page.emulateMediaType("screen");
      try{ await page.waitForFunction(()=>document.readyState==="complete",{timeout:60000}); }catch{}
      try{ await page.evaluate(()=> (document.fonts && document.fonts.ready) || Promise.resolve()); }catch{}
      await page.evaluate(()=> new Promise(r=>setTimeout(r,80)));
      const pdf = await page.pdf({ format:"Letter", printBackground:true, margin:{top:"1in",right:"1in",bottom:"1in",left:"1in"} });
      await page.close();
      const name = (L.filename||`letter${i}`).replace(/\.html?$/i,"") + '.pdf';
      archive.append(pdf,{ name });
    }
    await archive.finalize();

    if(fileStream && consumer){
      await new Promise(resolve => fileStream.on('close', resolve));
      try{
        const stat = await fs.promises.stat(path.join(consumerUploadsDir(consumer.id), storedName));
        addFileMeta(consumer.id, {
          id,
          originalName,
          storedName,
          type: 'letters_zip',
          size: stat.size,
          mimetype: 'application/zip',
          uploadedAt: new Date().toISOString(),
        });
        addEvent(consumer.id, 'letters_downloaded', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}` });
      }catch(err){ console.error('Failed to record zip', err); }
    }
  }catch(e){
    console.error("Zip generation failed:", e);
    try{ res.status(500).end("Failed to create zip."); }catch{}
  }finally{
    try{ await browser?.close(); }catch{}
  }
});

app.post("/api/letters/:jobId/email", async (req,res)=>{
  const { jobId } = req.params;
  const to = String(req.body?.to || "").trim();
  if(!to) return res.status(400).json({ ok:false, error:"Missing recipient" });
  if(!mailer) return res.status(500).json({ ok:false, error:"Email not configured" });
  let job = getJobMem(jobId);
  if(!job){
    const disk = loadJobFromDisk(jobId);
    if(disk){ job = { letters: disk.letters.map(d=>({ filename: path.basename(d.htmlPath), htmlPath: d.htmlPath })) }; }
  }
  if(!job) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  try{
    const attachments = job.letters.map(L=>({ filename: L.filename, path: L.htmlPath || path.join(LETTERS_DIR, L.filename) }));
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Letters ${jobId}`,
      text: `Attached letters for job ${jobId}`,
      attachments
    });
    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error:String(e) });
  }
});

app.get("/api/jobs/:jobId/letters", (req, res) => {
  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}`;
  app._router.handle(req, res);
});
app.get("/api/jobs/:jobId/letters/:idx.html", (req, res) => {
  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}/${req.params.idx}.html`;
  app._router.handle(req, res);
});
app.get("/api/jobs/:jobId/letters/:idx.pdf", (req, res) => {
  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}/${req.params.idx}.pdf`;
  app._router.handle(req, res);
});

// =================== Consumer STATE (events + files) ===================
app.get("/api/consumers/:id/state", (req,res)=>{
  const cstate = listConsumerState(req.params.id);
  res.json({ ok:true, state: cstate });
});

// Upload an attachment (photo/proof/etc.)
const fileUpload = multer({ storage: multer.memoryStorage() });
app.post("/api/consumers/:id/state/upload", fileUpload.single("file"), async (req,res)=>{
  const db = loadDB();
  const consumer = db.consumers.find(c=>c.id===req.params.id);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
  if(!req.file) return res.status(400).json({ ok:false, error:"No file uploaded" });

  const dir = consumerUploadsDir(consumer.id);
  const id = nanoid(10);
  const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i)||[""])[0] || "";
  const type = (req.body.type || '').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'doc';
  const safeName = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const date = new Date().toISOString().slice(0,10);
  const storedName = `${id}${ext}`;
  const originalName = `${safeName}_${date}_${type}${ext}`;
  const fullPath = path.join(dir, storedName);
  await fs.promises.writeFile(fullPath, req.file.buffer);

  const rec = {
    id,
    originalName,
    storedName,
    type,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString()
  };
  addFileMeta(consumer.id, rec);
  addEvent(consumer.id, "file_uploaded", { id, name: originalName, size: req.file.size });

  res.json({ ok:true, file: { ...rec, url: `/api/consumers/${consumer.id}/state/files/${storedName}` } });
});

// Serve a consumer file
app.get("/api/consumers/:id/state/files/:stored", (req,res)=>{
  const dir = consumerUploadsDir(req.params.id);
  const full = path.join(dir, path.basename(req.params.stored));
  if (!fs.existsSync(full)) return res.status(404).send("File not found");
  res.sendFile(full);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> {
  console.log(`CRM ready    http://localhost:${PORT}`);
  console.log(`DB           ${DB_PATH}`);
  console.log(`Letters dir  ${LETTERS_DIR}`);
  console.log(`Letters DB   ${LETTERS_DB_PATH}`);
});



