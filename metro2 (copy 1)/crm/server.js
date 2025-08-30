// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import multer from "multer";
import { nanoid } from "nanoid";
import { spawn, spawnSync } from "child_process";
import { htmlToPdfBuffer } from "./pdfUtils.js";
import crypto from "crypto";
import os from "os";
import archiver from "archiver";
import puppeteer from "puppeteer";
import nodeFetch from "node-fetch";
import * as cheerio from "cheerio";


import { logInfo, logError, logWarn } from "./logger.js";

import { ensureBuffer, readJson, writeJson } from "./utils.js";
import { sendCertifiedMail } from "./simpleCertifiedMail.js";
import { listEvents as listCalendarEvents, createEvent as createCalendarEvent, updateEvent as updateCalendarEvent, deleteEvent as deleteCalendarEvent, freeBusy as calendarFreeBusy } from "./googleCalendar.js";

const fetchFn = globalThis.fetch || nodeFetch;



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

const SETTINGS_PATH = path.join(__dirname, "settings.json");
function loadSettings(){
  return readJson(SETTINGS_PATH, {
    hibpApiKey: "",
    rssFeedUrl: "https://hnrss.org/frontpage",
    googleCalendarToken: "",
    googleCalendarId: "",
  });
}

function saveSettings(data){ writeJson(SETTINGS_PATH, data); }

async function detectChromium(){
  if(process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ];
  for(const p of candidates){
    try{
      await fs.promises.access(p, fs.constants.X_OK);
      const check = spawnSync(p, ['--version'], { stdio:'ignore' });
      if(check.status === 0) return p;
    }catch{}
  }
  return null;
}

async function launchBrowser(){
  const execPath = await detectChromium();
  const opts = {
    headless:true,
    args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process']
  };
  if(execPath) opts.executablePath = execPath;
  return puppeteer.launch(opts);
}

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

process.on("unhandledRejection", err => {
  logError("UNHANDLED_REJECTION", "Unhandled promise rejection", err);
});
process.on("uncaughtException", err => {
  logError("UNCAUGHT_EXCEPTION", "Uncaught exception", err);
});
process.on("warning", warn => {
  logWarn("NODE_WARNING", warn.message, { stack: warn.stack });
});

function getAuthUser(req){
  const auth = req.headers.authorization || "";
  if(!auth.startsWith("Basic ")) return null;
  const [user, pass] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  const db = loadUsersDB();
  return db.users.find(u=>u.username===user && u.password===pass) || null;
}

function authenticate(req,res,next){
  const u = getAuthUser(req);
  if(!u) return res.status(401).json({ ok:false, error:"Unauthorized" });
  req.user = u;
  next();
}

function optionalAuth(req,res,next){
  const u = getAuthUser(req);
  if(u) req.user = u;
  next();
}

function requireRole(role){
  return (req,res,next)=>{
    if(!req.user || req.user.role !== role) return res.status(403).json({ ok:false, error:"Forbidden" });
    next();
  };
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
app.get(["/letters", "/letters/:jobId"], (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "letters.html"))
);
app.get("/library", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "library.html")));
app.get("/tradelines", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "tradelines.html")));
app.get("/quiz", (_req,res)=> res.sendFile(path.join(PUBLIC_DIR, "quiz.html")));
app.get("/settings", (_req,res)=> res.sendFile(path.join(PUBLIC_DIR, "settings.html")));
app.get("/portal/:id", (req, res) => {
  const db = loadDB();
  const consumer = db.consumers.find(c => c.id === req.params.id);
  if (!consumer) return res.status(404).send("Portal not found");
  const tmpl = fs.readFileSync(path.join(PUBLIC_DIR, "client-portal-template.html"), "utf-8");
  const html = tmpl.replace(/{{name}}/g, consumer.name);
  res.send(html);
});

app.get("/api/settings", (_req, res) => {
  res.json({ ok: true, settings: loadSettings() });
});

app.post("/api/settings", (req, res) => {
  const {
    hibpApiKey = "",
    rssFeedUrl = "",
    googleCalendarToken = "",
    googleCalendarId = "",
  } = req.body || {};
  saveSettings({ hibpApiKey, rssFeedUrl, googleCalendarToken, googleCalendarId });

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

const DB_PATH = path.join(__dirname, "db.json");
function loadDB(){ return readJson(DB_PATH, { consumers: [] }); }
function saveDB(db){ writeJson(DB_PATH, db); }

const LETTERS_DB_PATH = path.join(__dirname, "letters-db.json");
const LETTERS_DEFAULT = { jobs: [], templates: [], sequences: [], contracts: [] };
function loadLettersDB(){
  const db = readJson(LETTERS_DB_PATH, null);
  if(db){
    console.log(`Loaded letters DB with ${db.jobs?.length || 0} jobs`);
    return db;
  }
  console.warn("letters-db.json missing or invalid, using empty structure");
  return { jobs: [], templates: [], sequences: [], contracts: [] };
}

function saveLettersDB(db){

  writeJson(LETTERS_DB_PATH, db);
  console.log(`Saved letters DB with ${db.jobs.length} jobs`);
};
function recordLettersJob(consumerId, jobId, letters){
  console.log(`Recording letters job ${jobId} for consumer ${consumerId}`);
  const db = loadLettersDB();
  db.jobs.push({ consumerId, jobId, createdAt: Date.now(), letters: letters.map(L=>({ filename:L.filename, bureau:L.bureau, creditor:L.creditor })) });
  saveLettersDB(db);
}
if(!fs.existsSync(LETTERS_DB_PATH)){
  console.log(`letters-db.json not found. Initializing at ${LETTERS_DB_PATH}`);
  saveLettersDB(LETTERS_DEFAULT);
}

const LEADS_DB_PATH = path.join(__dirname, "leads-db.json");
function loadLeadsDB(){ return readJson(LEADS_DB_PATH, { leads: [] }); }
function saveLeadsDB(db){ writeJson(LEADS_DB_PATH, db); }

const INVOICES_DB_PATH = path.join(__dirname, "invoices-db.json");
function loadInvoicesDB(){ return readJson(INVOICES_DB_PATH, { invoices: [] }); }
function saveInvoicesDB(db){ writeJson(INVOICES_DB_PATH, db); }

const CONTACTS_DB_PATH = path.join(__dirname, "contacts-db.json");
function loadContactsDB(){ return readJson(CONTACTS_DB_PATH, { contacts: [] }); }
function saveContactsDB(db){ writeJson(CONTACTS_DB_PATH, db); }

const USERS_DB_PATH = path.join(__dirname, "users-db.json");
function loadUsersDB(){ return readJson(USERS_DB_PATH, { users: [] }); }
function saveUsersDB(db){ writeJson(USERS_DB_PATH, db); }

const TASKS_DB_PATH = path.join(__dirname, "tasks-db.json");
function loadTasksDB(){ return readJson(TASKS_DB_PATH, { tasks: [] }); }
function saveTasksDB(db){ writeJson(TASKS_DB_PATH, db); }

function processTasks(){
  const db = loadTasksDB();
  let changed = false;
  const now = Date.now();
  for(const t of db.tasks){
    if(!t.completed){
      const status = t.due && new Date(t.due).getTime() < now ? "overdue" : "pending";
      if(t.status !== status){ t.status = status; changed = true; }
    }
  }
  if(changed) saveTasksDB(db);
}
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

// =================== Consumers ===================
app.get("/api/consumers", (_req,res)=> res.json(loadDB()));
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

// =================== Users ===================
app.post("/api/users", optionalAuth, (req,res)=>{
  const db = loadUsersDB();
  if(db.users.length>0 && (!req.user || req.user.role !== "admin")) return res.status(403).json({ ok:false, error:"Forbidden" });
  const user = { id: nanoid(10), username: req.body.username || "", password: req.body.password || "", role: req.body.role || "user" };
  db.users.push(user);
  saveUsersDB(db);
  res.json({ ok:true, user: { id: user.id, username: user.username, role: user.role } });
});

app.get("/api/users", authenticate, requireRole("admin"), (_req,res)=>{
  const db = loadUsersDB();
  res.json({ ok:true, users: db.users.map(u=>({ id:u.id, username:u.username, role:u.role })) });
});

// =================== Contacts ===================
app.get("/api/contacts", authenticate, (_req,res)=>{
  const db = loadContactsDB();
  res.json({ ok:true, contacts: db.contacts });
});

app.post("/api/contacts", authenticate, (req,res)=>{
  const db = loadContactsDB();
  const contact = { id: nanoid(10), name: req.body.name || "", email: req.body.email || "", phone: req.body.phone || "", notes: req.body.notes || "" };
  db.contacts.push(contact);
  saveContactsDB(db);
  res.json({ ok:true, contact });
});

app.put("/api/contacts/:id", authenticate, (req,res)=>{
  const db = loadContactsDB();
  const contact = db.contacts.find(c=>c.id===req.params.id);
  if(!contact) return res.status(404).json({ ok:false, error:"Not found" });
  Object.assign(contact, { name:req.body.name ?? contact.name, email:req.body.email ?? contact.email, phone:req.body.phone ?? contact.phone, notes:req.body.notes ?? contact.notes });
  saveContactsDB(db);
  res.json({ ok:true, contact });
});

app.delete("/api/contacts/:id", authenticate, requireRole("admin"), (req,res)=>{
  const db = loadContactsDB();
  const idx = db.contacts.findIndex(c=>c.id===req.params.id);
  if(idx===-1) return res.status(404).json({ ok:false, error:"Not found" });
  db.contacts.splice(idx,1);
  saveContactsDB(db);
  res.json({ ok:true });
});

// =================== Tasks ===================
app.get("/api/tasks", authenticate, (req,res)=>{
  const db = loadTasksDB();
  const tasks = db.tasks.filter(t=>t.userId===req.user.id);
  res.json({ ok:true, tasks });
});

app.post("/api/tasks", authenticate, (req,res)=>{
  const db = loadTasksDB();
  const task = { id: nanoid(10), userId: req.user.id, desc: req.body.desc || "", due: req.body.due || null, completed: false, status: "pending" };
  db.tasks.push(task);
  saveTasksDB(db);
  res.json({ ok:true, task });
});

app.put("/api/tasks/:id", authenticate, (req,res)=>{
  const db = loadTasksDB();
  const task = db.tasks.find(t=>t.id===req.params.id && t.userId===req.user.id);
  if(!task) return res.status(404).json({ ok:false, error:"Not found" });
  Object.assign(task, { desc:req.body.desc ?? task.desc, due:req.body.due ?? task.due, completed:req.body.completed ?? task.completed });
  if(task.completed) task.status = "done";
  saveTasksDB(db);
  res.json({ ok:true, task });
});

// =================== Reporting ===================
app.get("/api/reports/summary", authenticate, (_req,res)=>{
  const contacts = loadContactsDB().contacts.length;
  const tasks = loadTasksDB().tasks;
  const completedTasks = tasks.filter(t=>t.completed).length;
  res.json({ ok:true, summary:{ contacts, tasks:{ total: tasks.length, completed: completedTasks } } });
});

// =================== Messages ===================
app.get("/api/messages", (_req, res) => {
  const db = loadDB();
  const all = [];
  for (const c of db.consumers || []) {
    const cstate = listConsumerState(c.id);
    const msgs = (cstate.events || [])
      .filter(e => e.type === "message")
      .map(m => ({ ...m, consumer: { id: c.id, name: c.name || "" } }));
    all.push(...msgs);
  }
  all.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ ok: true, messages: all });
});

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

app.post("/api/consumers/:consumerId/events", (req,res)=>{
  const { type, payload } = req.body || {};
  if(!type){
    return res.status(400).json({ ok:false, error:'type required' });
  }
  addEvent(req.params.consumerId, type, payload || {});
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
app.get("/api/templates/defaults", (_req,res)=>{
  res.json({ ok:true, templates: defaultTemplates() });
});
app.get("/api/templates", (_req,res)=>{
  const db = loadLettersDB();
  if(!db.templates || db.templates.length === 0){
    db.templates = defaultTemplates();
    saveLettersDB(db);
  }
  res.json({
    ok: true,
    templates: db.templates,
    sequences: db.sequences || [],
    contracts: db.contracts || []
  });
});

app.post("/api/templates", (req,res)=>{
  const db = loadLettersDB();
  db.templates = db.templates || [];
  const { id = nanoid(8), heading = "", intro = "", ask = "", afterIssues = "", evidence = "" } = req.body || {};
  const existing = db.templates.find(t => t.id === id);
  const tpl = { id, heading, intro, ask, afterIssues, evidence };
  if(existing){ Object.assign(existing, tpl); }
  else { db.templates.push(tpl); }
  saveLettersDB(db);
  res.json({ ok:true, template: tpl });
});

app.post("/api/sequences", (req,res)=>{
  const db = loadLettersDB();
  db.sequences = db.sequences || [];
  const { id = nanoid(8), name = "", templates = [] } = req.body || {};
  const existing = db.sequences.find(s => s.id === id);
  const seq = { id, name, templates };
  if(existing){ Object.assign(existing, seq); }
  else { db.sequences.push(seq); }
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
  const apiKey = loadSettings().hibpApiKey || process.env.HIBP_API_KEY;
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
      const db = loadDB();
      const c = db.consumers.find(x => x.id === consumerId);
      if (c) {
        c.breaches = (result.breaches || []).map(b => b.Name || b.name || "");
        saveDB(db);
      }
    } catch (err) {
      console.error("Failed to store breach info", err);
    }
  }
  if (result.ok) return res.json(result);
  res.status(result.status || 500).json({ ok: false, error: result.error });
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

app.post("/api/consumers/:id/databreach/audit", async (req, res) => {
  const db = loadDB();
  const c = db.consumers.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "Consumer not found" });
  try {
    const html = renderBreachAuditHtml(c);
    const result = await savePdf(html);
    let ext = path.extname(result.path);
    if (result.warning || ext !== ".pdf") {
      ext = ".html";
    }
    const mime = ext === ".pdf" ? "application/pdf" : "text/html";
    try {
      const uploadsDir = consumerUploadsDir(c.id);
      const id = nanoid(10);
      const storedName = `${id}${ext}`;
      const safe = (c.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      const originalName = `${safe}_${date}_breach_audit${ext}`;
      const dest = path.join(uploadsDir, storedName);
      await fs.promises.copyFile(result.path, dest);
      const stat = await fs.promises.stat(dest);
      addFileMeta(c.id, {
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
    addEvent(c.id, "breach_audit_generated", { file: result.url });
    res.json({ ok: true, url: result.url, warning: result.warning });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }

});

app.post("/api/consumers/:id/databreach/audit", async (req, res) => {
  const db = loadDB();
  const c = db.consumers.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "Consumer not found" });
  try {
    const html = renderBreachAuditHtml(c);
    const result = await savePdf(html);
    let ext = path.extname(result.path);
    if (result.warning || ext !== ".pdf") {
      ext = ".html";
    }
    const mime = ext === ".pdf" ? "application/pdf" : "text/html";
    try {
      const uploadsDir = consumerUploadsDir(c.id);
      const id = nanoid(10);
      const storedName = `${id}${ext}`;
      const safe = (c.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      const originalName = `${safe}_${date}_breach_audit${ext}`;
      const dest = path.join(uploadsDir, storedName);
      await fs.promises.copyFile(result.path, dest);
      const stat = await fs.promises.stat(dest);
      addFileMeta(c.id, {
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
    addEvent(c.id, "breach_audit_generated", { file: result.url });
    res.json({ ok: true, url: result.url, warning: result.warning });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }

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

// Create job: memory + disk
function persistJobToDisk(jobId, letters){
  console.log(`Persisting job ${jobId} with ${letters.length} letters to disk`);
  const idx = loadJobsIndex();
  idx.jobs[jobId] = {
    createdAt: Date.now(),
    letters: letters.map(L => ({
      filename: L.filename,
      bureau: L.bureau,
      creditor: L.creditor,
      useOcr: !!L.useOcr
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
      ssn_last4: consumer.ssn_last4, dob: consumer.dob,
      breaches: consumer.breaches || []
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

    for (const L of letters) {
      const sel = (selections || []).find(s => s.tradelineIndex === L.tradelineIndex);
      if (sel?.useOcr) L.useOcr = true;
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
        html: fs.existsSync(d.htmlPath) ? fs.readFileSync(d.htmlPath,"utf-8") : "<html><body>Missing file.</body></html>",
        useOcr: d.useOcr
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

// Render letter PDF on-the-fly
app.get("/api/letters/:jobId/:idx.pdf", async (req,res)=>{
  const { jobId, idx } = req.params;
  console.log(`Generating PDF for job ${jobId} letter ${idx}`);
  let html;
  let filenameBase = "letter";
  let useOcr = false;

  let job = getJobMem(jobId);
  if(job){
    const L = job.letters[Number(idx)];
    if(!L) return res.status(404).send("Letter not found.");
    html = L.html;
    filenameBase = (L.filename||"letter").replace(/\.html?$/i,"");
    useOcr = !!L.useOcr;
  }else{
    const disk = loadJobFromDisk(jobId);
    if(!disk) return res.status(404).send("Job not found or expired.");
    const Lm = disk.letters[Number(idx)];
    if(!Lm || !fs.existsSync(Lm.htmlPath)) return res.status(404).send("Letter not found.");
    html = fs.readFileSync(Lm.htmlPath,"utf-8");
    filenameBase = path.basename(Lm.htmlPath).replace(/\.html?$/i,"");
    useOcr = !!Lm.useOcr;
  }

  if(!html || !html.trim()){
    logError("LETTER_HTML_MISSING", "No HTML content for PDF generation", null, { jobId, idx });
    return res.status(500).send("No HTML content to render");
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
      return res.status(500).send("Failed to render OCR PDF.");
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
    res.status(500).send("Failed to render PDF.");
  }finally{ try{ await browserInstance?.close(); }catch{} }

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
        html: fs.existsSync(d.htmlPath) ? fs.readFileSync(d.htmlPath,"utf-8") : "<html><body>Missing file.</body></html>",
        useOcr: d.useOcr
      })));
      job = getJobMem(jobId);
    }
  }
  if(!job) return res.status(404).json({ ok:false, error:"Job not found or expired" });

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

app.post("/api/letters/:jobId/mail", async (req,res)=>{
  const { jobId } = req.params;
  const consumerId = String(req.body?.consumerId || "").trim();
  const file = String(req.body?.file || "").trim();
  if(!consumerId) return res.status(400).json({ ok:false, error:"consumerId required" });
  if(!file) return res.status(400).json({ ok:false, error:"file required" });
  const db = loadDB();
  const consumer = db.consumers.find(c=>c.id===consumerId);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });

  const cstate = listConsumerState(consumerId);
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
    addEvent(consumerId, 'letters_mailed', { jobId, file: ev.payload.file, provider: 'simplecertifiedmail', result });
    res.json({ ok:true });
    logInfo('SCM_MAIL_SUCCESS', 'Sent letter via SimpleCertifiedMail', { jobId, consumerId, file });
  }catch(e){
    logError('SCM_MAIL_FAILED', 'Failed to mail via SimpleCertifiedMail', e, { jobId, consumerId, file });
    res.status(500).json({ ok:false, errorCode:'SCM_MAIL_FAILED', message:String(e) });
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
    if(disk){ job = { letters: disk.letters.map(d=>({ filename: path.basename(d.htmlPath), htmlPath: d.htmlPath, useOcr: d.useOcr })) }; }
  }
  if(!job) return res.status(404).json({ ok:false, error:"Job not found or expired" });

  // find consumer for logging
  let consumer = null;
  try{
    const ldb = loadLettersDB();
    const meta = ldb.jobs.find(j=>j.jobId === jobId);
    if(meta?.consumerId){
      const db = loadDB();
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
      const html = L.html || (L.htmlPath ? fs.readFileSync(L.htmlPath, "utf-8") : fs.readFileSync(path.join(LETTERS_DIR, L.filename), "utf-8"));

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
      try{ addEvent(consumer.id, 'letters_emailed', { jobId, to, count: attachments.length }); }catch{}
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

app.post("/api/letters/:jobId/portal", async (req,res)=>{
  const { jobId } = req.params;
  let job = getJobMem(jobId);
  if(!job){
    const disk = loadJobFromDisk(jobId);
    if(disk){ job = { letters: disk.letters.map(d=>({ filename: path.basename(d.htmlPath), htmlPath: d.htmlPath, useOcr: d.useOcr })) }; }
  }
  if(!job) return res.status(404).json({ ok:false, error:"Job not found or expired" });

  // locate consumer for storage
  let consumer = null;
  try{
    const ldb = loadLettersDB();
    const meta = ldb.jobs.find(j=>j.jobId === jobId);
    if(meta?.consumerId){
      const db = loadDB();
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
      const html = L.html || (L.htmlPath ? fs.readFileSync(L.htmlPath, 'utf-8') : fs.readFileSync(path.join(LETTERS_DIR, L.filename), 'utf-8'));

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
      addFileMeta(consumer.id, {
        id,
        originalName,
        storedName,
        type: 'letter_pdf',
        size: stat.size,
        mimetype: 'application/pdf',
        uploadedAt: new Date().toISOString(),
      });
      addEvent(consumer.id, 'letters_portal_sent', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}` });
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



// End of server.js
