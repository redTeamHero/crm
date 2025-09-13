// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import multer from "multer";
import { nanoid } from "nanoid";
import { spawn } from "child_process";
import { htmlToPdfBuffer, launchBrowser } from "./pdfUtils.js";
import crypto from "crypto";
import os from "os";
import archiver from "archiver";
import * as cheerio from "cheerio";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PassThrough } from "stream";
import { JSDOM } from "jsdom";
import parseCreditReportHTML from "./parser.js";


import { logInfo, logError, logWarn } from "./logger.js";

import { ensureBuffer } from "./utils.js";
import { readKey, writeKey, DB_FILE } from "./kvdb.js";
import { sendCertifiedMail } from "./simpleCertifiedMail.js";
import { listEvents as listCalendarEvents, createEvent as createCalendarEvent, updateEvent as updateCalendarEvent, deleteEvent as deleteCalendarEvent, freeBusy as calendarFreeBusy } from "./googleCalendar.js";

import { fetchFn } from "./fetchUtil.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TOKEN_EXPIRES_IN = "1h";

function generateToken(user){
  return jwt.sign({ id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions || [] }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}



import { generateLetters, generatePersonalInfoLetters, generateInquiryLetters, generateDebtCollectorLetters, modeCopy } from "./letterEngine.js";
import { PLAYBOOKS } from "./playbook.js";
import { normalizeReport, renderHtml, savePdf } from "./creditAuditTool.js";
import {
  listConsumerState,
  addEvent,
  addFileMeta,
  consumerUploadsDir,
  addReminder,
  processAllReminders,
  listTracker,
  setTrackerSteps,
  markTrackerStep,
  getTrackerSteps,

} from "./state.js";
function injectStyle(html, css){
  if(/<head[^>]*>/i.test(html)){
    return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
  }
  return `<style>${css}</style>` + html;
}
async function generateOcrPdf(html){
  const noise = "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAAqElEQVR4nM1XSRKAMAjrO/n/Qzw5HpQlJNTm5EyRUBpDXeuBrRjZehteYpSwEm9o4u6uoffMeUaSjx1PFdsKiIjKRajVDhMr29UWW7b2q6ioYiQiYYm2wmsXYi6psajssFJIGDM+rRQem4mwXaTSRF45pp1J/sVQFwhW0SODItoRens5xqBcZCI58rpzQzaVFPFUwqjNmX9/5lXM4LGz7xRAER/xf0WRXElyH0vwJrWaAAAAAElFTkSuQmCC";
  const ocrCss = `
    .ocr{position:relative;}
    .ocr::before{
      content:"";
      position:absolute;
      inset:0;
      pointer-events:none;
      background-image:
        repeating-linear-gradient(0deg, rgba(100,100,100,0.15) 0, rgba(100,100,100,0.15) 1px, transparent 1px, transparent 32px),
        repeating-linear-gradient(90deg, rgba(100,100,100,0.15) 0, rgba(100,100,100,0.15) 1px, transparent 1px, transparent 32px),
        repeating-linear-gradient(45deg, rgba(120,120,120,0.35) 0, rgba(120,120,120,0.35) 4px, transparent 4px, transparent 200px),
        url('data:image/png;base64,${noise}');
      background-size:32px 32px,32px 32px,200px 200px,30px 30px;
    }`;
  const injected = injectStyle(html, ocrCss);
  return await htmlToPdfBuffer(injected);

}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadSettings(){
  const data = await readKey('settings', null);
  if(data) return data;
  const def = {
    hibpApiKey: "",
    rssFeedUrl: "https://hnrss.org/frontpage",
    googleCalendarToken: "",
    googleCalendarId: "",
    stripeApiKey: "",
  };
  await writeKey('settings', def);
  return def;
}

async function saveSettings(data){ await writeKey('settings', data); }


const require = createRequire(import.meta.url);
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  console.warn("Nodemailer not installed");
}
let StripeLib = null;
try {
  StripeLib = require("stripe");
} catch (e) {
  console.warn("Stripe not installed");
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

process.on("unhandledRejection", err => {
  logError("UNHANDLED_REJECTION", "Unhandled promise rejection", err);
});
process.on("uncaughtException", err => {
  logError("UNCAUGHT_EXCEPTION", "Uncaught exception", err);
});
process.on("warning", warn => {
  logWarn("NODE_WARNING", warn.message, { stack: warn.stack });
});

async function getAuthUser(req){
  let auth = req.headers.authorization || "";
  if(!auth && req.query && req.query.token){
    auth = `Bearer ${req.query.token}`;
  }
  const db = await loadUsersDB();
  if(auth.startsWith("Bearer ")){
    try{
      const payload = jwt.verify(auth.slice(7), JWT_SECRET);
      const found = db.users.find(u=>u.id===payload.id);
      if(!found) return null;
      return { ...found, permissions: found.permissions || [] };
    }catch{
      return null;
    }
  }
  if(auth.startsWith("Basic ")){
    const [user, pass] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    const found = db.users.find(u=>u.username===user);
    if(!found) return null;
    if(!bcrypt.compareSync(pass, found.password)) return null;
    return { ...found, permissions: found.permissions || [] };
  }
  return null;
}

async function authenticate(req, res, next){
  const u = await getAuthUser(req);
  req.user = u || null;
  next();
}

async function optionalAuth(req,res,next){
  const u = await getAuthUser(req);
  if(u) req.user = u;
  next();
}

function requireRole(role){
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      return next();
    }
    res.status(403).json({ ok:false, error:'Forbidden' });
  };
}

function hasPermission(user, perm){
  if (perm === "letters") return !!user;
  return !!(user && (user.role === "admin" || (user.permissions || []).includes(perm)));
}

function requirePermission(perm){
  return (req, res, next) => {
    if (hasPermission(req.user, perm)) return next();
    res.status(403).json({ ok:false, error:'Forbidden' });
  };
}

function forbidMember(req,res,next){
  if(req.user && req.user.role === "member") return res.status(403).json({ ok:false, error:'Forbidden' });
  next();
}

function deepMerge(a = {}, b = {}) {
  const res = { ...a };
  for (const [key, val] of Object.entries(b || {})) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      res[key] = deepMerge(res[key] && typeof res[key] === "object" ? res[key] : {}, val);
    } else {
      res[key] = val;
    }
  }
  return res;
}


// Basic resource monitoring to catch memory or CPU spikes
const MAX_RSS_MB = Number(process.env.MAX_RSS_MB || 512);
const RESOURCE_CHECK_MS = Number(process.env.RESOURCE_CHECK_MS || 60_000);

let lastCpu = process.cpuUsage();
setInterval(() => {
  try {
    const { rss } = process.memoryUsage();
    if (rss > MAX_RSS_MB * 1024 * 1024) {
      logWarn("HIGH_MEMORY_USAGE", "Memory usage high", { rss });
    }
    const cpu = process.cpuUsage(lastCpu);
    lastCpu = process.cpuUsage();
    const cpuMs = (cpu.user + cpu.system) / 1000;
    if (cpuMs > 1000) {
      logWarn("HIGH_CPU_USAGE", "CPU usage high", { cpuMs });

    }
  } catch (e) {
    logWarn("RESOURCE_MONITOR_FAILED", e.message);
  }
}, RESOURCE_CHECK_MS);



// periodically surface due letter reminders
processAllReminders().catch(e => console.error("Reminder check failed", e));
setInterval(() => {
  processAllReminders().catch(e => console.error("Reminder check failed", e));
}, 60 * 60 * 1000);

// ---------- Static UI ----------
const PUBLIC_DIR = path.join(__dirname, "public");
const TEAM_TEMPLATE = (()=>{
  try{
    return fs.readFileSync(path.join(PUBLIC_DIR, "team-member-template.html"), "utf-8");
  }catch{return "";}
})();
  // Disable default index to avoid auto-serving the app without auth
  app.use(express.static(PUBLIC_DIR, { index: false }));
  // Serve login by default so users aren't dropped straight into the app
  app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "login.html")));
app.get("/dashboard", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "dashboard.html")));
app.get("/clients", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/leads", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "leads.html")));
app.get("/schedule", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "schedule.html")));
app.get("/my-company", optionalAuth, forbidMember, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "my-company.html")));
app.get("/billing", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "billing.html")));
app.get(["/letters", "/letters/:jobId"], optionalAuth, forbidMember, (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "letters.html"))
);
app.get("/library", optionalAuth, forbidMember, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "library.html")));
app.get("/tradelines", optionalAuth, forbidMember, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "tradelines.html")));
app.get("/quiz", optionalAuth, forbidMember, (_req,res)=> res.sendFile(path.join(PUBLIC_DIR, "quiz.html")));
app.get("/settings", optionalAuth, forbidMember, (_req,res)=> res.sendFile(path.join(PUBLIC_DIR, "settings.html")));
app.get("/client-portal.html", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "client-portal-template.html")));
app.get("/team/:token", (req,res)=>{
  const token = path.basename(req.params.token);
  const file = path.join(PUBLIC_DIR, `team-${token}.html`);
  if(!fs.existsSync(file)) return res.status(404).send("Not found");
  res.sendFile(file);
});
app.get("/portal/:id", async (req, res) => {
  const db = await loadDB();
  const consumer = db.consumers.find(c => c.id === req.params.id);
  if (!consumer) return res.status(404).send("Portal not found");
  const tmpl = fs.readFileSync(path.join(PUBLIC_DIR, "client-portal-template.html"), "utf-8");
  let html = tmpl.replace(/{{name}}/g, consumer.name);
  if (consumer.creditScore) {
    const scoreJson = JSON.stringify(consumer.creditScore);
    const script = `\n<script>localStorage.setItem('creditScore', ${scoreJson});</script>`;
    html = html.replace('</body>', `${script}\n</body>`);
  }
  res.send(html);
});

app.get("/buy", async (req, res) => {
  const { bank = "", price = "" } = req.query || {};
  const settings = await loadSettings();
  if (!StripeLib || !settings.stripeApiKey) {
    return res.status(500).json({ ok:false, error:'Stripe not configured' });
  }
  const amt = Math.round(parseFloat(price) * 100);
  if (!amt) return res.status(400).send("Invalid price");
  try {
    const stripe = new StripeLib(settings.stripeApiKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${bank} Tradeline` },
            unit_amount: amt,
          },
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get('host')}/?success=1`,
      cancel_url: `${req.protocol}://${req.get('host')}/?canceled=1`,
    });
    res.redirect(303, session.url);
  } catch (e) {
    console.error("Stripe checkout error", e);
    res.status(500).json({ ok:false, error:'Checkout failed' });
  }
});

app.get("/api/settings", async (_req, res) => {
  res.json({ ok: true, settings: await loadSettings() });
});

app.post("/api/settings", async (req, res) => {
  const {
    hibpApiKey = "",
    rssFeedUrl = "",
    googleCalendarToken = "",
    googleCalendarId = "",
    stripeApiKey = "",
  } = req.body || {};
  await saveSettings({ hibpApiKey, rssFeedUrl, googleCalendarToken, googleCalendarId, stripeApiKey });

  res.json({ ok: true });
});

app.get("/api/calendar/events", async (_req, res) => {
  try {
    const events = await listCalendarEvents();
    res.json({ ok: true, events });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/calendar/events", async (req, res) => {
  try {
    const ev = await createCalendarEvent(req.body);
    res.json({ ok: true, event: ev });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/calendar/events/:id", async (req, res) => {
  try {
    const ev = await updateCalendarEvent(req.params.id, req.body);
    res.json({ ok: true, event: ev });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/calendar/events/:id", async (req, res) => {
  try {
    await deleteCalendarEvent(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/tradelines", async (_req, res) => {
  try {
    const tradelines = await scrapeTradelines();
    res.json({ ok: true, tradelines });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/calendar/freebusy", async (req, res) => {
  try {
    const { timeMin, timeMax } = req.body || {};
    const fb = await calendarFreeBusy(timeMin, timeMax);
    res.json({ ok: true, fb });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Simple JSON "DB" ----------

async function recordLettersJob(userId, consumerId, jobId, letters){
  console.log(`Recording letters job ${jobId} for consumer ${consumerId}`);
  const db = await loadLettersDB();
  db.jobs.push({
    userId,
    consumerId,
    jobId,
    createdAt: Date.now(),
    letters: letters.map(L=>({ filename:L.filename, bureau:L.bureau, creditor:L.creditor }))
  });
  await saveLettersDB(db);
}

async function getUserJobMeta(jobId, userId){
  const ldb = await loadLettersDB();
  return ldb.jobs.find(j=>j.jobId === jobId && j.userId === userId) || null;
}

async function loadJobForUser(jobId, userId){
  const meta = await getUserJobMeta(jobId, userId);
  if(!meta) return null;
  let job = getJobMem(jobId);
  if(!job){
    const disk = await loadJobFromDisk(jobId);
    if(disk){
      putJobMem(jobId, disk.letters.map(d => ({
        filename: path.basename(d.htmlPath),
        bureau: d.bureau,
        creditor: d.creditor,
        html: fs.existsSync(d.htmlPath) ? fs.readFileSync(d.htmlPath,"utf-8") : "<html><body>Missing file.</body></html>",
        useOcr: d.useOcr
      })));
      job = getJobMem(jobId);
    }
  }
  if(!job) return null;
  return { meta, job };
}
const DEFAULT_DB = { consumers: [{ id: "RoVO6y0EKM", name: "Test Consumer", reports: [] }] };
async function loadDB(){
  const db = await readKey('consumers', null);
  if(db) return db;
  await writeKey('consumers', DEFAULT_DB);
  return DEFAULT_DB;
}
async function saveDB(db){ await writeKey('consumers', db); }
const LETTERS_DEFAULT = { jobs: [], templates: [], sequences: [], contracts: [], mainTemplates: defaultTemplates().map(t=>t.id) };
async function loadLettersDB(){
  const db = await readKey('letters', null);
  if(db){
    if(!Array.isArray(db.mainTemplates) || db.mainTemplates.length === 0){
      db.mainTemplates = defaultTemplates().map(t=>t.id);
      await saveLettersDB(db);
    }
    console.log(`Loaded letters DB with ${db.jobs?.length || 0} jobs`);
    return db;
  }
  console.warn("Letters DB missing, initializing with defaults");
  await writeKey('letters', LETTERS_DEFAULT);
  return LETTERS_DEFAULT;
}

async function saveLettersDB(db){
  await writeKey('letters', db);
  console.log(`Saved letters DB with ${db.jobs.length} jobs`);
}

async function loadLeadsDB(){
  const db = await readKey('leads', null);
  if(db) return db;
  const def = { leads: [] };
  await writeKey('leads', def);
  return def;
}
async function saveLeadsDB(db){ await writeKey('leads', db); }

async function loadInvoicesDB(){
  const db = await readKey('invoices', null);
  if(db) return db;
  const def = { invoices: [] };
  await writeKey('invoices', def);
  return def;
}
async function saveInvoicesDB(db){ await writeKey('invoices', db); }

async function loadContactsDB(){
  const db = await readKey('contacts', null);
  if(db) return db;
  const def = { contacts: [] };
  await writeKey('contacts', def);
  return def;
}
async function saveContactsDB(db){ await writeKey('contacts', db); }

async function loadUsersDB(){
  let db = await readKey('users', null);
  if(!db) db = { users: [] };
  if(!db.users.some(u => u.username === 'ducky')){
    db.users.push({
      id: nanoid(10),
      username: 'ducky',
      name: 'ducky',
      password: bcrypt.hashSync('duck', 10),
      role: 'admin',
      permissions: []
    });
    await writeKey('users', db);
  }
  return db;
}
async function saveUsersDB(db){ await writeKey('users', db); }

async function loadTasksDB(){
  const db = await readKey('tasks', null);
  if(db) return db;
  const def = { tasks: [] };
  await writeKey('tasks', def);
  return def;
}
async function saveTasksDB(db){ await writeKey('tasks', db); }

async function processTasks(){
  const db = await loadTasksDB();
  let changed = false;
  const now = Date.now();
  for(const t of db.tasks){
    if(!t.completed){
      const status = t.due && new Date(t.due).getTime() < now ? "overdue" : "pending";
      if(t.status !== status){ t.status = status; changed = true; }
    }
  }
  if(changed) await saveTasksDB(db);
}

// Process tasks immediately on startup so their status is accurate
processTasks();
setInterval(processTasks, 60_000);


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

export function runBasicRuleAudit(report = {}) {
  for (const tl of report.tradelines || []) {
    tl.violations = tl.violations || [];
    const add = (id, title) => {
      if (!tl.violations.some(v => v.id === id)) {
        tl.violations.push({ id, title });
      }
    };

    const perBureau = tl.per_bureau || {};
    const tu = perBureau.TransUnion || {};
    const past = (tu.past_due || "").replace(/[^0-9]/g, "");
    if (/current/i.test(tu.account_status || "") && past && past !== "0") {
      add("PAST_DUE_CURRENT", "Account marked current but shows past due amount");
    }

    for (const data of Object.values(perBureau)) {
      if (/charge[- ]?off|collection/i.test(data.account_status || "") && !data.date_first_delinquency) {
        add("MISSING_DOFD", "Charge-off or collection missing date of first delinquency");
        break;
      }
    }

    const balances = Object.values(perBureau)
      .map(b => b.balance)
      .filter(v => v !== undefined && v !== null)
      .map(v => Number(String(v).replace(/[^0-9.-]/g, "")))
      .filter(n => !isNaN(n));
    if (balances.length > 1 && new Set(balances).size > 1) {
      add("BALANCE_MISMATCH", "Balances differ across bureaus");
    }
  }
}

// Attempt to pull credit scores from raw HTML uploads so the client portal
// can display them without requiring additional manual input. The format of
// consumer credit reports varies, but typically the bureau name appears near a
// three-digit score. This helper scans the HTML text for each bureau and
// returns any score it finds.
function extractCreditScores(html){
  const scores = {};
  const patterns = {
    transunion: /transunion[^0-9]{0,100}(\d{3})/i,
    experian: /experian[^0-9]{0,100}(\d{3})/i,
    equifax: /equifax[^0-9]{0,100}(\d{3})/i,
  };
  for(const [key, re] of Object.entries(patterns)){
    const m = html.match(re);
    if(m) scores[key] = Number(m[1]);
  }
  return scores;
}

// =================== Consumers ===================
app.get("/api/consumers", authenticate, requirePermission("consumers"), async (_req, res) => {
  res.json({ ok: true, consumers: (await loadDB()).consumers });
});
app.post("/api/consumers", authenticate, requirePermission("consumers"), async (req,res)=>{

  const db = await loadDB();

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
  await saveDB(db);
  // log event
  await addEvent(id, "consumer_created", { name: consumer.name });
  res.json({ ok:true, consumer });
});

app.put("/api/consumers/:id", authenticate, requirePermission("consumers"), async (req,res)=>{

  const db = await loadDB();

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
  await saveDB(db);
  await addEvent(c.id, "consumer_updated", { fields: Object.keys(req.body||{}) });
  res.json({ ok:true, consumer:c });
});

app.delete("/api/consumers/:id", authenticate, requirePermission("consumers"), async (req,res)=>{

  const db=await loadDB();

  const i=db.consumers.findIndex(c=>c.id===req.params.id);
  if(i===-1) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const removed = db.consumers[i];
  db.consumers.splice(i,1);
  await saveDB(db);
  await addEvent(removed.id, "consumer_deleted", {});
  res.json({ ok:true });
});

// =================== Leads ===================
app.get("/api/leads", async (_req,res)=> res.json({ ok:true, ...(await loadLeadsDB()) }));


app.post("/api/leads", async (req,res)=>{
  const db = await loadLeadsDB();
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
  await saveLeadsDB(db);
  res.json({ ok:true, lead });
});

app.put("/api/leads/:id", async (req,res)=>{
  const db = await loadLeadsDB();
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
  await saveLeadsDB(db);
  res.json({ ok:true, lead });
});

app.delete("/api/leads/:id", async (req,res)=>{
  const db = await loadLeadsDB();
  const idx = db.leads.findIndex(l=>l.id===req.params.id);
  if(idx === -1) return res.status(404).json({ error:"Not found" });
  db.leads.splice(idx,1);
  await saveLeadsDB(db);
  res.json({ ok:true });
});

// =================== Invoices ===================
app.get("/api/invoices/:consumerId", async (req,res)=>{
  const db = await loadInvoicesDB();
  const list = db.invoices.filter(inv => inv.consumerId === req.params.consumerId);
  res.json({ ok:true, invoices: list });
});

app.post("/api/invoices", async (req,res)=>{
  const db = await loadInvoicesDB();
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
    const mainDb = await loadDB();
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
    await addFileMeta(inv.consumerId, {
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
  await addEvent(inv.consumerId, "message", {
    from: "system",
    text: `Payment due for ${inv.desc} ($${inv.amount.toFixed(2)}). Pay here: ${payLink}`,
  });


  db.invoices.push(inv);
  await saveInvoicesDB(db);
  res.json({ ok:true, invoice: inv, warning: result?.warning });
});

app.put("/api/invoices/:id", async (req,res)=>{
  const db = await loadInvoicesDB();
  const inv = db.invoices.find(i=>i.id===req.params.id);
  if(!inv) return res.status(404).json({ ok:false, error:"Not found" });
  if(req.body.desc !== undefined) inv.desc = req.body.desc;
  if(req.body.amount !== undefined) inv.amount = Number(req.body.amount) || 0;
  if(req.body.due !== undefined) inv.due = req.body.due;
  if(req.body.paid !== undefined) inv.paid = !!req.body.paid;
  await saveInvoicesDB(db);
  res.json({ ok:true, invoice: inv });
});

// =================== Users ===================
app.post("/api/register", async (req,res)=>{
  const db = await loadUsersDB();
  if(db.users.find(u=>u.username===req.body.username)) return res.status(400).json({ ok:false, error:"User exists" });
  const user = {
    id: nanoid(10),
    username: req.body.username || "",
    name: req.body.name || "",
    password: bcrypt.hashSync(req.body.password || "", 10),
    role: "member",
    permissions: []
  };
  db.users.push(user);
  await saveUsersDB(db);
  res.json({ ok:true, token: generateToken(user) });
});

app.post("/api/login", async (req,res)=>{
  logInfo("LOGIN_ATTEMPT", "Admin login attempt", { username: req.body.username });
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.username===req.body.username);
  if(!user){
    logWarn("LOGIN_FAIL", "Admin login failed: user not found", { username: req.body.username });
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  if(!bcrypt.compareSync(req.body.password || "", user.password)){
    logWarn("LOGIN_FAIL", "Admin login failed: wrong password", { username: req.body.username });
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  logInfo("LOGIN_SUCCESS", "Admin login successful", { userId: user.id });
  res.json({ ok:true, token: generateToken(user) });
});

app.post("/api/client/login", async (req,res)=>{
  const db = await loadDB();
  let client = null;
  if(req.body.token){
    logInfo("CLIENT_LOGIN_ATTEMPT", "Client login with token", { tokenPrefix: req.body.token.slice(0,4) });
    client = db.consumers.find(c=>c.portalToken===req.body.token);
  } else if(req.body.email){
    logInfo("CLIENT_LOGIN_ATTEMPT", "Client login with email", { email: req.body.email });
    client = db.consumers.find(c=>c.email===req.body.email);
    if(!client || !client.password || !bcrypt.compareSync(req.body.password || "", client.password)){
      logWarn("CLIENT_LOGIN_FAIL", "Client login failed: invalid password", { email: req.body.email });
      return res.status(401).json({ ok:false, error:"Invalid credentials" });
    }
  } else {
    return res.status(400).json({ ok:false, error:"Missing credentials" });
  }
  if(!client){
    logWarn("CLIENT_LOGIN_FAIL", "Client login failed: not found", { email: req.body.email, tokenPrefix: req.body.token && req.body.token.slice(0,4) });
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  const u = { id: client.id, username: client.email || client.name || "client", role: "client", permissions: [] };
  logInfo("CLIENT_LOGIN_SUCCESS", "Client login successful", { clientId: client.id });
  res.json({ ok:true, token: generateToken(u) });
});

app.post("/api/request-password-reset", async (req,res)=>{
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.username===req.body.username);
  if(!user) return res.status(404).json({ ok:false, error:"Not found" });
  const token = nanoid(12);
  user.resetToken = token;
  await saveUsersDB(db);
  res.json({ ok:true, token });
});

app.post("/api/reset-password", async (req,res)=>{
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.username===req.body.username && u.resetToken===req.body.token);
  if(!user) return res.status(400).json({ ok:false, error:"Invalid token" });
  user.password = bcrypt.hashSync(req.body.password || "", 10);
  delete user.resetToken;
  await saveUsersDB(db);
  res.json({ ok:true });
});

app.post("/api/users", optionalAuth, async (req,res)=>{
  const db = await loadUsersDB();
  if(db.users.length>0 && (!req.user || req.user.role !== "admin")) return res.status(403).json({ ok:false, error:"Forbidden" });
  const role = req.body.role || (db.users.length === 0 ? "admin" : "member");
  const user = {
    id: nanoid(10),
    username: req.body.username || "",
    name: req.body.name || "",
    password: bcrypt.hashSync(req.body.password || "", 10),
    role,
    permissions: Array.isArray(req.body.permissions) ? req.body.permissions : []
  };
  db.users.push(user);
  await saveUsersDB(db);
  res.json({ ok:true, user: { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions } });

});

app.get("/api/users", authenticate, requireRole("admin"), async (_req,res)=>{
  const db = await loadUsersDB();
  res.json({ ok:true, users: db.users.map(u=>({ id:u.id, username:u.username, name:u.name, role:u.role, permissions: u.permissions || [] })) });
});

app.put("/api/users/:id", authenticate, requireRole("admin"), async (req,res)=>{
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.id === req.params.id);
  if(!user) return res.status(404).json({ ok:false, error:"Not found" });
  if(typeof req.body.name === "string") user.name = req.body.name;
  if(typeof req.body.username === "string") user.username = req.body.username;
  if(req.body.password) user.password = bcrypt.hashSync(req.body.password,10);
  if(Array.isArray(req.body.permissions)) user.permissions = req.body.permissions;
  await saveUsersDB(db);
  res.json({ ok:true, user: { id:user.id, username:user.username, name:user.name, role:user.role, permissions:user.permissions || [] } });
});

app.get("/api/me", authenticate, (req,res)=>{
  res.json({ ok:true, user: { id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role, permissions: req.user.permissions || [] } });
});

app.post("/api/team-members", authenticate, requireRole("admin"), async (req,res)=>{
  const db = await loadUsersDB();
  const token = nanoid(12);
  const passwordPlain = req.body.password || nanoid(8);
  const password = bcrypt.hashSync(passwordPlain, 10);
  const member = {
    id: nanoid(10),
    username: req.body.username || "",
    name: req.body.name || "",
    token,
    password,
    role: "team",
    mustReset: true,
    permissions: []
  };
  db.users.push(member);
  await saveUsersDB(db);
  if(TEAM_TEMPLATE){
    const html = TEAM_TEMPLATE.replace(/\{\{token\}\}/g, token).replace(/\{\{name\}\}/g, member.name || member.username || "Team Member");
    try{ fs.writeFileSync(path.join(PUBLIC_DIR, `team-${token}.html`), html); }catch{}
  }
  res.json({ ok:true, member: { id: member.id, username: member.username, token, password: passwordPlain } });
});

app.post("/api/team/:token/login", async (req,res)=>{
  logInfo("TEAM_LOGIN_ATTEMPT", "Team member login attempt", { tokenPrefix: req.params.token.slice(0,4) });
  const db = await loadUsersDB();
  const member = db.users.find(u=>u.token===req.params.token);
  if(!member){
    logWarn("TEAM_LOGIN_FAIL", "Team member login failed: token not found", { tokenPrefix: req.params.token.slice(0,4) });
    return res.status(404).json({ ok:false, error:"Not found" });
  }
  if(!bcrypt.compareSync(req.body.password || "", member.password)){
    logWarn("TEAM_LOGIN_FAIL", "Team member login failed: wrong password", { memberId: member.id });
    return res.status(401).json({ ok:false, error:"Invalid password" });
  }
  logInfo("TEAM_LOGIN_SUCCESS", "Team member login successful", { memberId: member.id });
  res.json({ ok:true, token: generateToken(member), mustReset: member.mustReset });
});

app.post("/api/team/:token/reset", async (req,res)=>{
  const db = await loadUsersDB();
  const member = db.users.find(u=>u.token===req.params.token);
  if(!member) return res.status(404).json({ ok:false, error:"Not found" });
  member.password = bcrypt.hashSync(req.body.password || "", 10);
  member.mustReset = false;
  await saveUsersDB(db);
  res.json({ ok:true });
});

// =================== Contacts ===================
app.get("/api/contacts", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const contacts = db.contacts.filter(c=>c.userId===req.user.id);
  res.json({ ok:true, contacts });
});

app.post("/api/contacts", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const contact = { id: nanoid(10), userId: req.user.id, name: req.body.name || "", email: req.body.email || "", phone: req.body.phone || "", notes: req.body.notes || "" };
  db.contacts.push(contact);
  await saveContactsDB(db);
  res.json({ ok:true, contact });
});

app.put("/api/contacts/:id", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const contact = db.contacts.find(c=>c.id===req.params.id && c.userId===req.user.id);
  if(!contact) return res.status(404).json({ ok:false, error:"Not found" });
  Object.assign(contact, { name:req.body.name ?? contact.name, email:req.body.email ?? contact.email, phone:req.body.phone ?? contact.phone, notes:req.body.notes ?? contact.notes });
  await saveContactsDB(db);
  res.json({ ok:true, contact });
});

app.delete("/api/contacts/:id", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const idx = db.contacts.findIndex(c=>c.id===req.params.id && c.userId===req.user.id);
  if(idx===-1) return res.status(404).json({ ok:false, error:"Not found" });
  db.contacts.splice(idx,1);
  await saveContactsDB(db);
  res.json({ ok:true });
});

// =================== Tasks ===================
app.get("/api/tasks", authenticate, requirePermission("tasks"), async (req,res)=>{

  const db = await loadTasksDB();
  const tasks = db.tasks.filter(t=>t.userId===req.user.id);
  res.json({ ok:true, tasks });
});

app.post("/api/tasks", authenticate, requirePermission("tasks"), async (req,res)=>{

  const db = await loadTasksDB();
  const task = { id: nanoid(10), userId: req.user.id, desc: req.body.desc || "", due: req.body.due || null, completed: false, status: "pending" };
  db.tasks.push(task);
  await saveTasksDB(db);
  res.json({ ok:true, task });
});

app.put("/api/tasks/:id", authenticate, requirePermission("tasks"), async (req,res)=>{

  const db = await loadTasksDB();
  const task = db.tasks.find(t=>t.id===req.params.id && t.userId===req.user.id);
  if(!task) return res.status(404).json({ ok:false, error:"Not found" });
  Object.assign(task, { desc:req.body.desc ?? task.desc, due:req.body.due ?? task.due, completed:req.body.completed ?? task.completed });
  if(task.completed) task.status = "done";
  await saveTasksDB(db);
  res.json({ ok:true, task });
});

// =================== Reporting ===================
app.get("/api/reports/summary", authenticate, requirePermission("reports"), async (req,res)=>{

  const contacts = (await loadContactsDB()).contacts.filter(c=>c.userId===req.user.id).length;
  const tasks = (await loadTasksDB()).tasks.filter(t=>t.userId===req.user.id);
  const completedTasks = tasks.filter(t=>t.completed).length;
  res.json({ ok:true, summary:{ contacts, tasks:{ total: tasks.length, completed: completedTasks } } });

});

// =================== Messages ===================
app.get("/api/messages", async (_req, res) => {
  const db = await loadDB();
  const all = [];
  for (const c of db.consumers || []) {
    const cstate = await listConsumerState(c.id);
    const msgs = (cstate.events || [])
      .filter(e => e.type === "message")
      .map(m => ({ ...m, consumer: { id: c.id, name: c.name || "" } }));
    all.push(...msgs);
  }
  all.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ ok: true, messages: all });
});

app.get("/api/messages/:consumerId", async (req,res)=>{
  const cstate = await listConsumerState(req.params.consumerId);
  const msgs = (cstate.events || []).filter(e=>e.type === "message");
  res.json({ ok:true, messages: msgs });
});

app.post("/api/messages/:consumerId", optionalAuth, async (req,res)=>{
  const text = req.body.text || "";
  let from = req.body.from || "host";
  const payload = { from, text };
  if (req.user) {
    from = req.user.username;
    payload.from = from;
    payload.userId = req.user.id;
  }
  await addEvent(req.params.consumerId, "message", payload);
  res.json({ ok:true });
});

app.post("/api/consumers/:consumerId/events", async (req,res)=>{
  const { type, payload } = req.body || {};
  if(!type){
    return res.status(400).json({ ok:false, error:'type required' });
  }
  await addEvent(req.params.consumerId, type, payload || {});
  res.json({ ok:true });
});

// =================== Templates / Sequences / Contracts ===================
function defaultTemplates(){
  return [
    { id: "identity", ...modeCopy("identity", "delete", true) },
    { id: "breach",   ...modeCopy("breach", "delete", true) },
    { id: "assault",  ...modeCopy("assault", "delete", true) },
    { id: "standard", ...modeCopy(null, "delete", true) }
  ];
}
app.get("/api/templates/defaults", async (_req,res)=>{
  const db = await loadLettersDB();
  const ids = db.mainTemplates && db.mainTemplates.length ? db.mainTemplates : defaultTemplates().map(t=>t.id);
  const all = [...defaultTemplates(), ...(db.templates || [])];
  const map = Object.fromEntries(all.map(t=>[t.id, t]));
  const templates = ids.map(id => map[id]).filter(Boolean);
  res.json({ ok:true, templates });
});

app.post("/api/templates/defaults", async (req,res)=>{
  const { slotId, templateId } = req.body || {};
  const db = await loadLettersDB();
  db.mainTemplates = db.mainTemplates && db.mainTemplates.length ? db.mainTemplates : defaultTemplates().map(t=>t.id);
  const idx = db.mainTemplates.findIndex(id => id === slotId);
  if(idx !== -1){
    db.mainTemplates[idx] = templateId;
  }
  await saveLettersDB(db);
  const all = [...defaultTemplates(), ...(db.templates || [])];
  const map = Object.fromEntries(all.map(t=>[t.id, t]));
  const templates = db.mainTemplates.map(id => map[id]).filter(Boolean);
  res.json({ ok:true, templates });
});
app.get("/api/templates", async (_req,res)=>{
  const db = await loadLettersDB();
  if(!db.templates || db.templates.length === 0){
    db.templates = defaultTemplates();
    await saveLettersDB(db);
  }
  res.json({
    ok: true,
    templates: db.templates,
    sequences: db.sequences || [],
    contracts: db.contracts || []
  });
});

app.post("/api/templates", async (req,res)=>{
  const db = await loadLettersDB();
  db.templates = db.templates || [];
  const { id = nanoid(8), heading = "", intro = "", ask = "", afterIssues = "", evidence = "" } = req.body || {};
  const existing = db.templates.find(t => t.id === id);
  const tpl = { id, heading, intro, ask, afterIssues, evidence };
  if(existing){ Object.assign(existing, tpl); }
  else { db.templates.push(tpl); }
  await saveLettersDB(db);
  res.json({ ok:true, template: tpl });
});

app.post("/api/sequences", async (req,res)=>{
  const db = await loadLettersDB();
  db.sequences = db.sequences || [];
  const { id = nanoid(8), name = "", templates = [] } = req.body || {};
  const existing = db.sequences.find(s => s.id === id);
  const seq = { id, name, templates };
  if(existing){ Object.assign(existing, seq); }
  else { db.sequences.push(seq); }
  await saveLettersDB(db);
  res.json({ ok:true, sequence: seq });
});

app.post("/api/contracts", async (req,res)=>{
  const db = await loadLettersDB();
  const ct = { id: nanoid(8), name: req.body.name || "", body: req.body.body || "" };
  db.contracts = db.contracts || [];
  db.contracts.push(ct);
  await saveLettersDB(db);
  res.json({ ok:true, contract: ct });
});


// Upload HTML -> analyze -> save under consumer
app.post("/api/consumers/:id/upload", upload.single("file"), async (req,res)=>{
  const db=await loadDB();
  const consumer = db.consumers.find(c=>c.id===req.params.id);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
  if(!req.file) return res.status(400).json({ ok:false, error:"No file uploaded" });

  try{
    const htmlText = req.file.buffer.toString("utf-8");
    const errors = [];
    let analyzed = {};

    try {
      const dom = new JSDOM(htmlText);
      const jsParsed = parseCreditReportHTML(dom.window.document);
      analyzed.tradelines = jsParsed.tradelines || [];
      if (jsParsed.personalInfo) {
        analyzed.personalInfo = jsParsed.personalInfo;
      }
    } catch (e) {
      logError("JS_PARSER_FAILED", "JS parser failed", e);
      errors.push({ step: "js_parse", message: e.message });
    }

    try {
      const py = await runPythonAnalyzer(htmlText);
      py?.tradelines?.forEach((tl, idx) => {
        const base = analyzed.tradelines[idx] || (analyzed.tradelines[idx] = {});
        base.meta = deepMerge(base.meta, tl.meta);
        base.per_bureau = deepMerge(base.per_bureau, tl.per_bureau);
        base.violations = tl.violations || base.violations || [];
        base.violations_grouped = tl.violations_grouped || base.violations_grouped || {};
      });
      if (!analyzed.personalInfo && py?.personalInfo) {
        analyzed.personalInfo = py.personalInfo;
      }
    } catch (e) {
      logError("PYTHON_ANALYZER_ERROR", "Python analyzer failed", e);
      errors.push({ step: "python_analyzer", message: e.message });
    }

    try {
      runBasicRuleAudit(analyzed);
    } catch(e){
      logError("RULE_AUDIT_ERROR", "Basic rule audit failed", e);
      errors.push({ step: "rule_audit", message: e.message });
    }

    let scores = {};
    try{
      scores = extractCreditScores(htmlText);
      if (Object.keys(scores).length) {
        consumer.creditScore = { ...consumer.creditScore, ...scores };
      }
    }catch(e){
      logError("SCORE_EXTRACT_FAILED", "Failed to extract credit scores", e);
      errors.push({ step: "score_extract", message: e.message });
    }

    // compare bureau-reported personal info against consumer record
    const normalize = s => (s || "").toString().trim().toLowerCase();
    const mismatches = {};
    if (analyzed?.personalInfo && typeof analyzed.personalInfo === "object") {
      for (const [bureau, info] of Object.entries(analyzed.personalInfo)) {
        if (!info) continue;
        const diff = {};
        if (info.name && consumer.name && normalize(info.name) !== normalize(consumer.name)) {
          diff.name = info.name;
        }
        if (info.dob && consumer.dob && info.dob !== consumer.dob) {
          diff.dob = info.dob;
        }
        const addr = info.address || {};
        const addrFields = ["addr1", "addr2", "city", "state", "zip"];
        const addrMismatch = addrFields.some(f => addr[f] && consumer[f] && normalize(addr[f]) !== normalize(consumer[f]));
        if (addrMismatch) {
          diff.address = addr;
        }
        if (Object.keys(diff).length) {
          mismatches[bureau] = diff;
        }
      }
    }
    analyzed.personalInfoMismatches = mismatches;
    const rid = nanoid(8);
    // store original uploaded file so clients can access it from document center
    const uploadDir = consumerUploadsDir(consumer.id);
    const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i)||[""])[0] || "";
    const storedName = `${rid}${ext}`;
    await fs.promises.writeFile(path.join(uploadDir, storedName), req.file.buffer);
    await addFileMeta(consumer.id, {
      id: rid,
      originalName: req.file.originalname,
      storedName,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      personalInfoMismatches: mismatches,
    });
    consumer.reports.unshift({
      id: rid,
      uploadedAt: new Date().toISOString(),
      filename: req.file.originalname,
      size: req.file.size,
      summary: { tradelines: analyzed?.tradelines?.length || 0, personalInfoMismatches: mismatches },
      data: analyzed
    });
    await saveDB(db);
    await addEvent(consumer.id, "report_uploaded", {
      reportId: rid,
      filename: req.file.originalname,
      size: req.file.size
    });
    res.json({ ok:true, reportId: rid, creditScore: consumer.creditScore, errors });
  }catch(e){
    logError("UPLOAD_PROCESSING_FAILED", "Analyzer error", e);
    res.status(500).json({ ok:false, error: "Failed to process uploaded report" });
  }
});

app.get("/api/consumers/:id/reports", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  res.json({ ok:true, reports: c.reports.map(r=>({ id:r.id, uploadedAt:r.uploadedAt, filename:r.filename, summary:r.summary })) });
});

app.get("/api/consumers/:id/report/:rid", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const r=c.reports.find(x=>x.id===req.params.rid);
  if(!r) return res.status(404).json({ ok:false, error:"Report not found" });
  res.json({ ok:true, report:r.data, consumer:{
    id:c.id,name:c.name,email:c.email,phone:c.phone,addr1:c.addr1,addr2:c.addr2,city:c.city,state:c.state,zip:c.zip,ssn_last4:c.ssn_last4,dob:c.dob
  }});
});

app.delete("/api/consumers/:id/report/:rid", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const i=c.reports.findIndex(x=>x.id===req.params.rid);
  if(i===-1) return res.status(404).json({ ok:false, error:"Report not found" });
  const removed = c.reports[i];
  c.reports.splice(i,1);
  await saveDB(db);
  await addEvent(c.id, "report_deleted", { reportId: removed?.id, filename: removed?.filename });
  res.json({ ok:true });
});

app.post("/api/consumers/:id/report/:rid/audit", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const r=c.reports.find(x=>x.id===req.params.rid);
  if(!r) return res.status(404).json({ ok:false, error:"Report not found" });

  const selections = Array.isArray(req.body?.selections) && req.body.selections.length
    ? req.body.selections
    : null;

  try{
    const normalized = normalizeReport(r.data, selections);

    let html;
    try {
      html = renderHtml(normalized, c.name);
    } catch (err) {
      logError("HTML_RENDER_ERROR", "Failed to render audit HTML", err, { consumerId: c.id, reportId: r.id });
      return res.status(500).json({ ok:false, error: "Failed to render audit HTML" });
    }

    let result;
    try {
      result = await savePdf(html);
    } catch (err) {
      logError("PDF_GENERATION_ERROR", "Failed to generate audit PDF", err, { consumerId: c.id, reportId: r.id });
      return res.status(500).json({ ok:false, error: "Failed to generate audit document" });
    }

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
      await addFileMeta(c.id, {
        id,
        originalName,
        storedName,
        type: "audit",
        size: stat.size,
        mimetype: mime,
        uploadedAt: new Date().toISOString(),
      });
    } catch(err) {
      logError("AUDIT_STORE_FAILED", "Failed to store audit file", err, { consumerId: c.id, reportId: r.id });
    }

    await addEvent(c.id, "audit_generated", { reportId: r.id, file: result.url });
    res.json({ ok:true, url: result.url, warning: result.warning });
  }catch(e){
    logError("AUDIT_PIPELINE_ERROR", "Audit generation failed", e, { consumerId: c.id, reportId: r.id });
    res.status(500).json({ ok:false, error: "Audit generation failed" });
  }
});

// Check consumer email against Have I Been Pwned
// Use POST so email isn't logged in query string
async function hibpLookup(email) {
  const apiKey = (await loadSettings()).hibpApiKey || process.env.HIBP_API_KEY;
  if (!apiKey) return { ok: false, status: 500, error: "HIBP API key not configured" };
  try {
    const hibpRes = await fetchFn(
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

async function scrapeTradelines() {
  const resp = await fetchFn('https://tradelinesupply.com/pricing/');
  const html = await resp.text();
  const $ = cheerio.load(html);
  const items = [];
  $('tr').each((_, row) => {
    const productTd = $(row).find('td.product_data');
    const priceTd = $(row).find('td.product_price');
    if (!productTd.length || !priceTd.length) return;
    const bankName = (productTd.data('bankname') || '').toString().trim();
    const creditLimitRaw = (productTd.data('creditlimit') || '').toString().replace(/[$,]/g, '');
    const creditLimit = parseInt(creditLimitRaw, 10) || 0;
    const dateOpened = (productTd.data('dateopened') || '').toString().trim();
    const purchaseBy = (productTd.data('purchasebydate') || '').toString().trim();
    const reportingPeriod = (productTd.data('reportingperiod') || '').toString().trim();
    const priceText = priceTd.text().trim();
    const match = /\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/.exec(priceText);
    if (!match) return;
    const basePrice = parseFloat(match[1].replace(/,/g, ''));
    let finalPrice;
    if (basePrice < 500) finalPrice = basePrice + 100;
    else if (basePrice <= 1000) finalPrice = basePrice + 200;
    else finalPrice = basePrice + 300;
    items.push({
      buy_link: `/buy?bank=${encodeURIComponent(bankName)}&price=${finalPrice}`,
      bank: bankName,
      price: Math.round(finalPrice * 100) / 100,
      limit: creditLimit,
      age: dateOpened,
      statement_date: purchaseBy,
      reporting: reportingPeriod
    });
  });
  return items;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function renderBreachAuditHtml(consumer) {
  const list = (consumer.breaches || []).map(b => `<li>${escapeHtml(b)}</li>`).join("") || "<li>No breaches found.</li>";
  const dateStr = new Date().toLocaleString();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:Arial, sans-serif;margin:20px;}h1{text-align:center;}ul{margin-top:10px;}</style></head><body><h1>${escapeHtml(consumer.name || "Consumer")}</h1><h2>Data Breach Audit</h2><p>Email: ${escapeHtml(consumer.email || "")}</p><ul>${list}</ul><footer><hr/><div style="font-size:0.8em;color:#555;margin-top:20px;">Generated ${escapeHtml(dateStr)}</div></footer></body></html>`;
}

async function handleDataBreach(email, consumerId, res) {
  const result = await hibpLookup(email);
  if (result.ok && consumerId) {
    try {
      const db = await loadDB();
      const c = db.consumers.find(x => x.id === consumerId);
      if (c) {
        c.breaches = (result.breaches || []).map(b => b.Name || b.name || "");
        await saveDB(db);
      }
    } catch (err) {
      console.error("Failed to store breach info", err);
    }
  }
  if (result.ok) return res.json(result);
  res.status(result.status || 500).json({ ok: false, error: result.error });
}

async function generateBreachAudit(consumer) {
  const html = renderBreachAuditHtml(consumer);
  const result = await savePdf(html);
  let ext = path.extname(result.path);
  if (result.warning || ext !== ".pdf") {
    ext = ".html";
  }
  const mime = ext === ".pdf" ? "application/pdf" : "text/html";
  try {
    const uploadsDir = consumerUploadsDir(consumer.id);
    const id = nanoid(10);
    const storedName = `${id}${ext}`;
    const safe = (consumer.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    const originalName = `${safe}_${date}_breach_audit${ext}`;
    const dest = path.join(uploadsDir, storedName);
    await fs.promises.copyFile(result.path, dest);
    const stat = await fs.promises.stat(dest);
    await addFileMeta(consumer.id, {
      id,
      originalName,
      storedName,
      type: "breach-audit",
      size: stat.size,
      mimetype: mime,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to store breach audit file", err);
  }
  await addEvent(consumer.id, "breach_audit_generated", { file: result.url });
  return { ok: true, url: result.url, warning: result.warning };
}

async function handleConsumerBreachAudit(req, res) {
  const db = await loadDB();
  const consumer = db.consumers.find(x => x.id === req.params.id);
  if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
  try {
    const result = await generateBreachAudit(consumer);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

app.post("/api/databreach", async (req, res) => {
  const email = String(req.body.email || "").trim();
  const consumerId = String(req.body.consumerId || "").trim();
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  await handleDataBreach(email, consumerId, res);
});

app.get("/api/databreach", async (req, res) => {
  const email = String(req.query.email || "").trim();
  const consumerId = String(req.query.consumerId || "").trim();
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  await handleDataBreach(email, consumerId, res);
});


app.post("/api/consumers/:id/databreach/audit", handleConsumerBreachAudit);




// =================== Letters & PDFs ===================
const LETTERS_DIR = path.join(__dirname, "letters");
fs.mkdirSync(LETTERS_DIR,{ recursive:true });

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
setInterval(async ()=>{
  const now = Date.now();
  for(const [id,j] of jobs){
    if(now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
  const idx = await loadJobsIndex();
  let changed = false;
  for(const [id,meta] of Object.entries(idx.jobs || {})){
    if(now - (meta.createdAt || 0) > JOB_TTL_MS){
      const dir = path.join(LETTERS_DIR, meta.dir || id);
      try{ fs.rmSync(dir, { recursive:true, force:true }); }catch{}
      delete idx.jobs[id];
      changed = true;
    }
  }
  if(changed) await saveJobsIndex(idx);
}, 5*60*1000);

// disk index helpers stored in SQLite
async function loadJobsIndex(){
  const idx = await readKey('letter_jobs_idx', null);
  return idx || { jobs:{} };
}
async function saveJobsIndex(idx){
  await writeKey('letter_jobs_idx', idx);
}

// Create job: memory + disk
async function persistJobToDisk(jobId, letters){
  console.log(`Persisting job ${jobId} with ${letters.length} letters to disk`);
  const idx = await loadJobsIndex();
  idx.jobs[jobId] = {
    createdAt: Date.now(),
    dir: jobId,
    letters: letters.map(L => ({
      filename: L.filename,
      bureau: L.bureau,
      creditor: L.creditor,
      useOcr: !!L.useOcr
    }))
  };
  await saveJobsIndex(idx);
  console.log(`Job ${jobId} saved to index`);
}

// Load job from disk (returns { letters: [{... , htmlPath}]})
async function loadJobFromDisk(jobId){
  console.log(`Loading job ${jobId} from disk`);
  const idx = await loadJobsIndex();
  const meta = idx.jobs?.[jobId];
  if(!meta){
    console.warn(`Job ${jobId} not found on disk`);
    return null;
  }
  const jobDir = meta.dir || jobId;
  const letters = (meta.letters || []).map(item => ({
    ...item,
    htmlPath: path.join(LETTERS_DIR, jobDir, item.filename),
  }));
  console.log(`Loaded job ${jobId} with ${letters.length} letters from disk`);
  return { letters, createdAt: meta.createdAt || Date.now(), dir: jobDir };
}

async function deleteJob(jobId){
  jobs.delete(jobId);
  const idx = await loadJobsIndex();
  const meta = idx.jobs?.[jobId];
  if(meta){
    const dir = path.join(LETTERS_DIR, meta.dir || jobId);
    try{ fs.rmSync(dir, { recursive:true, force:true }); }catch{}
    delete idx.jobs[jobId];
    await saveJobsIndex(idx);
  }
}

// Generate letters (from selections) -> memory + disk
app.post("/api/generate", authenticate, requirePermission("letters"), async (req,res)=>{

  try{
    const {
      consumerId,
      reportId,
      selections,
      requestType = 'correct',
      personalInfo,
      inquiries,
      collectors,
      useOcr,
    } = req.body;

    const db = await loadDB();
    const consumer = db.consumers.find(c=>c.id===consumerId);
    if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
    const reportWrap = consumer.reports.find(r=>r.id===reportId);
    if(!reportWrap) return res.status(404).json({ ok:false, error:"Report not found" });

    const consumerForLetter = {
      name: consumer.name, email: consumer.email, phone: consumer.phone,
      addr1: consumer.addr1, addr2: consumer.addr2, city: consumer.city, state: consumer.state, zip: consumer.zip,
      ssn_last4: consumer.ssn_last4, dob: consumer.dob,
      breaches: consumer.breaches || []
    };
    for (const sel of selections || []) {
      if (!Array.isArray(sel.bureaus) || sel.bureaus.length === 0) {
        logWarn("MISSING_BUREAUS", "Rejecting selection without bureaus", sel);
        return res.status(400).json({ ok:false, error:"Selection missing bureaus" });
      }
    }

    const lettersDb = await loadLettersDB();
    const letters = generateLetters({ report: reportWrap.data, selections, consumer: consumerForLetter, requestType, templates: lettersDb.templates || [] });
    if (Array.isArray(personalInfo) && personalInfo.length) {
      letters.push(
        ...generatePersonalInfoLetters({
          consumer: consumerForLetter,
          mismatchedFields: personalInfo,
        })
      );
    }
    if (Array.isArray(inquiries) && inquiries.length) {
      letters.push(...generateInquiryLetters({ consumer: consumerForLetter, inquiries }));
    }
    if (Array.isArray(collectors) && collectors.length) {
      letters.push(...generateDebtCollectorLetters({ consumer: consumerForLetter, collectors }));
    }

    for (const L of letters) {
      L.useOcr = !!useOcr;
    }
    for (const L of letters) {
      const sel = (selections || []).find(s => s.tradelineIndex === L.tradelineIndex);
      if (sel && sel.useOcr !== undefined) L.useOcr = !!sel.useOcr;
    }

    console.log(`Generated ${letters.length} letters for consumer ${consumer.id}`);
    const jobId = crypto.randomBytes(8).toString("hex");

    const jobDir = path.join(LETTERS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    for(const L of letters){
      fs.writeFileSync(path.join(jobDir, L.filename), L.html, "utf-8");
      console.log(`Saved letter ${L.filename}`);
    }

    putJobMem(jobId, letters);
    await persistJobToDisk(jobId, letters);
    recordLettersJob(req.user.id, consumer.id, jobId, letters);
    console.log(`Letters job ${jobId} recorded with ${letters.length} letters`);

    // log state
    await addEvent(consumer.id, "letters_generated", {
      jobId, requestType, count: letters.length,
      tradelines: Array.from(new Set((selections||[]).map(s=>s.tradelineIndex))).length,
      inquiries: Array.isArray(inquiries) ? inquiries.length : 0,
      collectors: Array.isArray(collectors) ? collectors.length : 0

    });

for (const sel of selections || []) {
  const play = sel.playbook && PLAYBOOKS[sel.playbook];
  if (!play) continue;

  const letters = play.letters.slice(1); // skip the first letter
  for (const [idx, title] of letters.entries()) {
    const due = new Date();
    due.setDate(due.getDate() + (idx + 1) * 30);

    await addReminder(consumer.id, {
      id: `rem_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      due: due.toISOString(),
      payload: {
        tradelineIndex: sel.tradelineIndex,
        playbook: sel.playbook,
        step: title,
        stepNumber: idx + 2,
      },
    });
  }
}

    res.json({ ok:true, redirect: `/letters?job=${jobId}` });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// List stored letter jobs
app.get("/api/letters", authenticate, requirePermission("letters"), async (req,res)=>{

  const ldb = await loadLettersDB();
  const cdb = await loadDB();
  const jobs = ldb.jobs.filter(j=>j.userId===req.user.id).map(j => ({
    jobId: j.jobId,
    consumerId: j.consumerId,
    consumerName: cdb.consumers.find(c=>c.id===j.consumerId)?.name || "",
    createdAt: j.createdAt,
    count: (j.letters || []).length
  }));
  console.log(`Listing ${jobs.length} letter jobs`);
  res.json({ ok:true, jobs });
});

app.delete("/api/letters/:jobId", authenticate, requirePermission("letters"), async (req,res)=>{
  const { jobId } = req.params;
  try{
    deleteJob(jobId);
    const ldb = await loadLettersDB();
    ldb.jobs = ldb.jobs.filter(j => !(j.jobId === jobId && j.userId === req.user.id));
    await saveLettersDB(ldb);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// List letters for a job
app.get("/api/letters/:jobId", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job } = result;
  const meta = job.letters.map((L,i)=>({ index:i, filename:L.filename, bureau:L.bureau, creditor:L.creditor }));
  console.log(`Job ${jobId} has ${meta.length} letters`);
  res.json({ ok:true, letters: meta });
});

// Serve letter HTML (preview embed)
app.get("/api/letters/:jobId/:idx.html", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId, idx } = req.params;
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).send("Job not found or expired.");
  const { job } = result;
  const L = job.letters[Number(idx)];
  if(!L) return res.status(404).send("Letter not found.");
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.send(L.html);
});

// Render letter PDF on-the-fly
app.get("/api/letters/:jobId/:idx.pdf", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId, idx } = req.params;
  console.log(`Generating PDF for job ${jobId} letter ${idx}`);
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).send("Job not found or expired.");
  const { job } = result;
  const L = job.letters[Number(idx)];
  if(!L) return res.status(404).send("Letter not found.");
  let html = L.html;
  let filenameBase = (L.filename||"letter").replace(/\.html?$/i,"");
  let useOcr = !!L.useOcr;

  if(!html || !html.trim()){
    logError("LETTER_HTML_MISSING", "No HTML content for PDF generation", null, { jobId, idx });
    return res.status(500).json({ ok:false, error:'No HTML content to render' });
  }

  if(useOcr){
    try{
      const pdfBuffer = await generateOcrPdf(html);

      res.setHeader("Content-Type","application/pdf");
      res.setHeader("Content-Disposition",`attachment; filename="${filenameBase}.pdf"`);
      console.log(`Generated OCR PDF for ${filenameBase} (${pdfBuffer.length} bytes)`);
      return res.send(pdfBuffer);
    }catch(e){
      console.error("OCR PDF error:", e);
      return res.status(500).json({ ok:false, error:'Failed to render OCR PDF.' });
    }
  }

  let browserInstance;

  try{
    browserInstance = await launchBrowser();
    const page = await browserInstance.newPage();
    const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    await page.goto(dataUrl, { waitUntil:"load", timeout:60000 });
    await page.emulateMediaType("screen");
    try{ await page.waitForFunction(()=>document.readyState==="complete",{timeout:60000}); }catch{}
    try{ await page.evaluate(()=> (document.fonts && document.fonts.ready) || Promise.resolve()); }catch{}
    await page.evaluate(()=> new Promise(r=>setTimeout(r,80)));
    const pdf = await page.pdf({ format:"Letter", printBackground:true, margin:{top:"1in",right:"1in",bottom:"1in",left:"1in"} });
    await page.close();
    const pdfBuffer = ensureBuffer(pdf);
    if(!pdfBuffer || pdfBuffer.length === 0){
      throw new Error("Generated PDF is empty");
    }


    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${filenameBase}.pdf"`);
    console.log(`Generated PDF for ${filenameBase} (${pdfBuffer.length} bytes)`);
    res.send(pdfBuffer);
  }catch(e){
    console.error("PDF error:", e);
    res.status(500).json({ ok:false, error:'Failed to render PDF.' });
  }finally{ try{ await browserInstance?.close(); }catch{} }

});

app.get("/api/letters/:jobId/all.zip", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job, meta } = result;

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition",`attachment; filename="letters_${jobId}.zip"`);
  const archive = archiver('zip',{ zlib:{ level:9 } });
  archive.on('error', err => {
    logError('ARCHIVE_STREAM_ERROR', 'Archive stream error', err, { jobId });
    try{ res.status(500).json({ ok:false, errorCode:'ARCHIVE_STREAM_ERROR', message:'Zip error' }); }catch{}
  });

  // determine consumer for logging and file storage
  let fileStream, storedName, originalName, consumer, id;
  try{
    if(meta.consumerId){
      const db = await loadDB();
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

  const needsBrowser = job.letters.some(l => !l.useOcr);
  let browserInstance;
  try{
    if (needsBrowser) browserInstance = await launchBrowser();

    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const name = (L.filename||`letter${i}`).replace(/\.html?$/i,"") + '.pdf';

      if (L.useOcr) {
        const pdfBuffer = await generateOcrPdf(L.html);

        try{ archive.append(pdfBuffer,{ name }); }catch(err){
          logError('ZIP_APPEND_FAILED', 'Failed to append PDF to archive', err, { jobId, letter: name });
          throw err;
        }
        continue;
      }

      const page = await browserInstance.newPage();
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(L.html);
      await page.goto(dataUrl,{ waitUntil:"load", timeout:60000 });
      await page.emulateMediaType("screen");
      try{ await page.waitForFunction(()=>document.readyState==="complete",{timeout:60000}); }catch{}
      try{ await page.evaluate(()=> (document.fonts && document.fonts.ready) || Promise.resolve()); }catch{}
      await page.evaluate(()=> new Promise(r=>setTimeout(r,80)));
      const pdf = await page.pdf({ format:"Letter", printBackground:true, margin:{top:"1in",right:"1in",bottom:"1in",left:"1in"} });
      await page.close();
      const pdfBuffer = ensureBuffer(pdf);
      try{ archive.append(pdfBuffer,{ name }); }catch(err){
        logError('ZIP_APPEND_FAILED', 'Failed to append PDF to archive', err, { jobId, letter: name });
        throw err;
      }
    }
    await archive.finalize();

    if(fileStream && consumer){
      await new Promise(resolve => fileStream.on('close', resolve));
      try{
        const stat = await fs.promises.stat(path.join(consumerUploadsDir(consumer.id), storedName));
        await addFileMeta(consumer.id, {
          id,
          originalName,
          storedName,
          type: 'letters_zip',
          size: stat.size,
          mimetype: 'application/zip',
          uploadedAt: new Date().toISOString(),
        });
        await addEvent(consumer.id, 'letters_downloaded', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}` });
      }catch(err){ logError('ZIP_RECORD_FAILED', 'Failed to record zip', err, { jobId, consumerId: consumer.id }); }
    }
    logInfo('ZIP_BUILD_SUCCESS', 'Letters zip created', { jobId });
  }catch(e){
    logError('ZIP_BUILD_FAILED', 'Zip generation failed', e, { jobId });
    try{ res.status(500).json({ ok:false, errorCode:'ZIP_BUILD_FAILED', message:'Failed to create zip.' }); }catch{}
  }finally{
    try{ await browserInstance?.close(); }catch{}

  }
});

app.post("/api/letters/:jobId/mail", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found" });
  const consumerId = String(req.body?.consumerId || "").trim();
  const file = String(req.body?.file || "").trim();
  if(!consumerId) return res.status(400).json({ ok:false, error:"consumerId required" });
  if(!file) return res.status(400).json({ ok:false, error:"file required" });
  const db = await loadDB();
  const consumer = db.consumers.find(c=>c.id===consumerId);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });

  const cstate = await listConsumerState(consumerId);
  const ev = cstate.events.find(e=>e.type==='letters_portal_sent' && e.payload?.jobId===jobId && e.payload?.file?.endsWith(`/state/files/${file}`));
  if(!ev) return res.status(404).json({ ok:false, error:"Letter not found" });
  const filePath = path.join(consumerUploadsDir(consumerId), file);
  try{
    const result = await sendCertifiedMail({
      filePath,
      toName: consumer.name,
      toAddress: consumer.addr1,
      toCity: consumer.city,
      toState: consumer.state,
      toZip: consumer.zip
    });
    await addEvent(consumerId, 'letters_mailed', { jobId, file: ev.payload.file, provider: 'simplecertifiedmail', result });
    res.json({ ok:true });
    logInfo('SCM_MAIL_SUCCESS', 'Sent letter via SimpleCertifiedMail', { jobId, consumerId, file });
  }catch(e){
    logError('SCM_MAIL_FAILED', 'Failed to mail via SimpleCertifiedMail', e, { jobId, consumerId, file });
    res.status(500).json({ ok:false, errorCode:'SCM_MAIL_FAILED', message:String(e) });
  }
});

app.post("/api/letters/:jobId/email", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const to = String(req.body?.to || "").trim();
  if(!to) return res.status(400).json({ ok:false, error:"Missing recipient" });
  if(!mailer) return res.status(500).json({ ok:false, error:"Email not configured" });
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job, meta } = result;

  // find consumer for logging
  let consumer = null;
  try{
    if(meta.consumerId){
      const db = await loadDB();
      consumer = db.consumers.find(c=>c.id === meta.consumerId) || null;
    }
  }catch{}

  const needsBrowser = job.letters.some(l => !l.useOcr);
  let browserInstance;
  try{
    if (needsBrowser) browserInstance = await launchBrowser();

    const attachments = [];
    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const html = L.html || (L.htmlPath ? fs.readFileSync(L.htmlPath, "utf-8") : fs.readFileSync(path.join(LETTERS_DIR, jobId, L.filename), "utf-8"));

      let pdfBuffer;
      if (L.useOcr) {
        pdfBuffer = await generateOcrPdf(html);

      } else {
        const page = await browserInstance.newPage();
        const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        await page.goto(dataUrl,{ waitUntil:"load", timeout:60000 });
        await page.emulateMediaType("screen");
        try{ await page.waitForFunction(()=>document.readyState==="complete",{timeout:60000}); }catch{}
        try{ await page.evaluate(()=> (document.fonts && document.fonts.ready) || Promise.resolve()); }catch{}
        await page.evaluate(()=> new Promise(r=>setTimeout(r,80)));
        const pdf = await page.pdf({ format:"Letter", printBackground:true, margin:{top:"1in",right:"1in",bottom:"1in",left:"1in"} });
        await page.close();
        pdfBuffer = ensureBuffer(pdf);
      }

      const name = (L.filename || `letter${i}`).replace(/\.html?$/i,"") + '.pdf';
      attachments.push({ filename: name, content: pdfBuffer, contentType: 'application/pdf' });
    }

    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Letters ${jobId}`,
      text: `Attached letters for job ${jobId}`,
      attachments
    });

    if(consumer){
      try{ await addEvent(consumer.id, 'letters_emailed', { jobId, to, count: attachments.length }); }catch{}
    }

    res.json({ ok:true });
    logInfo('EMAIL_SEND_SUCCESS', 'Letters emailed', { jobId, to, count: attachments.length });
  }catch(e){
    logError('EMAIL_SEND_FAILED', 'Failed to email letters', e, { jobId, to });
    res.status(500).json({ ok:false, errorCode:'EMAIL_SEND_FAILED', message:String(e) });

  }finally{
    try{ await browserInstance?.close(); }catch{}

  }
});

app.post("/api/letters/:jobId/portal", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job, meta } = result;

  // locate consumer for storage
  let consumer = null;
  try{
    if(meta.consumerId){
      const db = await loadDB();
      consumer = db.consumers.find(c=>c.id === meta.consumerId) || null;
    }
  }catch{}
  if(!consumer) return res.status(400).json({ ok:false, error:"Consumer not found" });

  const needsBrowser = job.letters.some(l => !l.useOcr);
  let browserInstance;
  try{
    logInfo('PORTAL_UPLOAD_START', 'Building portal letters', { jobId, consumerId: consumer.id });

    if (needsBrowser) browserInstance = await launchBrowser();

    const dir = consumerUploadsDir(consumer.id);
    const safe = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const date = new Date().toISOString().slice(0,10);

    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const html = L.html || (L.htmlPath ? fs.readFileSync(L.htmlPath, 'utf-8') : fs.readFileSync(path.join(LETTERS_DIR, jobId, L.filename), 'utf-8'));

      let pdfBuffer;
      if (L.useOcr) {
        pdfBuffer = await generateOcrPdf(html);
      } else {
        const page = await browserInstance.newPage();
        const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        await page.goto(dataUrl,{ waitUntil:'load', timeout:60000 });
        await page.emulateMediaType('screen');
        try{ await page.waitForFunction(()=>document.readyState==='complete',{timeout:60000}); }catch{}
        try{ await page.evaluate(()=> (document.fonts && document.fonts.ready) || Promise.resolve()); }catch{}
        await page.evaluate(()=> new Promise(r=>setTimeout(r,80)));
        const pdf = await page.pdf({ format:'Letter', printBackground:true, margin:{top:'1in',right:'1in',bottom:'1in',left:'1in'} });
        await page.close();
        pdfBuffer = ensureBuffer(pdf);
      }

      const id = nanoid(10);
      const storedName = `${id}.pdf`;
      const base = (L.filename||`letter${i}`).replace(/\.html?$/i,"");
      const originalName = `${safe}_${date}_${base}.pdf`;
      const fullPath = path.join(dir, storedName);
      await fs.promises.writeFile(fullPath, pdfBuffer);
      const stat = await fs.promises.stat(fullPath);
      await addFileMeta(consumer.id, {
        id,
        originalName,
        storedName,
        type: 'letter_pdf',
        size: stat.size,
        mimetype: 'application/pdf',
        uploadedAt: new Date().toISOString(),
      });
      await addEvent(consumer.id, 'letters_portal_sent', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}` });
    }

    logInfo('PORTAL_UPLOAD_SUCCESS', 'Portal letters stored', { jobId, consumerId: consumer.id, count: job.letters.length });
    res.json({ ok:true, count: job.letters.length });
  }catch(e){
    logError('PORTAL_UPLOAD_FAILED', 'Letters portal upload failed', e, { jobId });
    res.status(500).json({ ok:false, errorCode:'PORTAL_UPLOAD_FAILED', message:String(e) });
  }finally{
    try{ await browserInstance?.close(); }catch{}
  }
});

app.get("/api/jobs/:jobId/letters", authenticate, requirePermission("letters"), (req, res) => {
  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}`;
  app._router.handle(req, res);
});
app.get("/api/jobs/:jobId/letters/:idx.html", authenticate, requirePermission("letters"), (req, res) => {
  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}/${req.params.idx}.html`;
  app._router.handle(req, res);
});
app.get("/api/jobs/:jobId/letters/:idx.pdf", authenticate, requirePermission("letters"), (req, res) => {

  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}/${req.params.idx}.pdf`;
  app._router.handle(req, res);
});

// =================== Consumer STATE (events + files) ===================
app.get("/api/consumers/:id/tracker", async (req,res)=>{
  const t = await listTracker(req.params.id);
  res.json(t);
});

app.get("/api/tracker/steps", async (_req, res) => {
  res.json({ ok: true, steps: await getTrackerSteps() });
});

app.put("/api/tracker/steps", async (req, res) => {
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  await setTrackerSteps(steps);
  res.json({ ok: true });
});

app.post("/api/consumers/:id/tracker", async (req, res) => {
  const completed = req.body?.completed || {};
  for (const [step, done] of Object.entries(completed)) {
    await markTrackerStep(req.params.id, step, !!done);
  }
  await addEvent(req.params.id, "tracker_updated", { completed });
  res.json({ ok: true });

});

app.get("/api/consumers/:id/state", async (req,res)=>{
  const cstate = await listConsumerState(req.params.id);
  res.json({ ok:true, state: cstate });
});

// Upload an attachment (photo/proof/etc.)
const fileUpload = multer({ storage: multer.memoryStorage() });
app.post("/api/consumers/:id/state/upload", fileUpload.single("file"), async (req,res)=>{
  const db = await loadDB();
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
  await addFileMeta(consumer.id, rec);
  await addEvent(consumer.id, "file_uploaded", { id, name: originalName, size: req.file.size });

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
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`CRM ready    http://localhost:${PORT}`);
    console.log(`DB file      ${DB_FILE}`);
    console.log(`Letters dir  ${LETTERS_DIR}`);
  });
}

export default app;



// End of server.js
