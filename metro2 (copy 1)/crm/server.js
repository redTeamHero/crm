// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { nanoid } from "nanoid";
import { spawn, spawnSync } from "child_process";
import puppeteer from "puppeteer";
import crypto from "crypto";
import os from "os";
import archiver from "archiver";
import { generateLetters } from "./letterEngine.js";
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

import { spawn, spawnSync } from "child_process";
import puppeteer from "puppeteer";
import crypto from "crypto";
import os from "os";
import archiver from "archiver";
import { generateLetters } from "./letterEngine.js";
import { normalizeReport, renderHtml, savePdf } from "./creditAuditTool.js";
import {
  listConsumerState,
  addEvent,
  addFileMeta,
  consumerUploadsDir,
} from "./state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "10mb" }));

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
app.get("/letters", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "letters.html")));
app.get("/letters/:jobId", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "letters.html")));

// ---------- Simple JSON "DB" ----------
const DB_PATH = path.join(__dirname, "db.json");
function loadDB(){ try{ return JSON.parse(fs.readFileSync(DB_PATH,"utf-8")); }catch{ return { consumers: [] }; } }
function saveDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); }

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
    dob:req.body.dob??c.dob
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

// Upload HTML -> analyze -> save under consumer
app.post("/api/consumers/:id/upload", upload.single("file"), async (req,res)=>{
  const db=loadDB();
  const consumer = db.consumers.find(c=>c.id===req.params.id);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
  if(!req.file) return res.status(400).json({ ok:false, error:"No file uploaded" });

  try{
    const analyzed = await runPythonAnalyzer(req.file.buffer.toString("utf-8"));
    const rid = nanoid(8);
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

  const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];
  if(!selections.length) return res.status(400).json({ ok:false, error:"No selections provided" });

  try{
    const normalized = normalizeReport(r.data, selections);
    const html = renderHtml(normalized, c.name);
    const result = await savePdf(html);
    addEvent(c.id, "audit_generated", { reportId: r.id, file: result.path });
    res.json({ ok:true, url: result.url, warning: result.warning });
  }catch(e){
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// =================== Letters & PDFs ===================
const LETTERS_DIR = path.resolve("./letters");
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
}

// Load job from disk (returns { letters: [{... , htmlPath}]})
function loadJobFromDisk(jobId){
  const idx = loadJobsIndex();
  const meta = idx.jobs?.[jobId];
  if(!meta) return null;
  const letters = (meta.letters || []).map(item => ({
    ...item,
    htmlPath: path.join(LETTERS_DIR, item.filename),
  }));
  return { letters, createdAt: meta.createdAt || Date.now() };
}

// Generate letters (from selections) -> memory + disk
app.post("/api/generate", async (req,res)=>{
  try{
    const { consumerId, reportId, selections, requestType } = req.body;
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
    const jobId = crypto.randomBytes(8).toString("hex");

    fs.mkdirSync(LETTERS_DIR, { recursive: true });
    for(const L of letters){ fs.writeFileSync(path.join(LETTERS_DIR, L.filename), L.html, "utf-8"); }

    putJobMem(jobId, letters);
    persistJobToDisk(jobId, letters);

    // log state
    addEvent(consumer.id, "letters_generated", {
      jobId, requestType, count: letters.length,
      tradelines: Array.from(new Set((selections||[]).map(s=>s.tradelineIndex))).length
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

// List letters for a job
app.get("/api/letters/:jobId", (req,res)=>{
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

  const meta = job.letters.map((L,i)=>({ index:i, filename:L.filename, bureau:L.bureau, creditor:L.creditor }));
  res.json({ ok:true, letters: meta });
});

// Serve letter HTML (preview embed)
app.get("/api/letters/:jobId/:idx.html", (req,res)=>{
  const { jobId, idx } = req.params;
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

    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${filenameBase}.pdf"`);
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
  archive.pipe(res);

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
  }catch(e){
    console.error("Zip generation failed:", e);
    try{ res.status(500).end("Failed to create zip."); }catch{}
  }finally{
    try{ await browser?.close(); }catch{}
  }
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
  archive.pipe(res);

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
  }catch(e){
    console.error("Zip generation failed:", e);
    try{ res.status(500).end("Failed to create zip."); }catch{}
  }finally{
    try{ await browser?.close(); }catch{}
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
  const storedName = `${id}${ext}`;
  const fullPath = path.join(dir, storedName);
  await fs.promises.writeFile(fullPath, req.file.buffer);

  const rec = {
    id, originalName: req.file.originalname, storedName,
    size: req.file.size, mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString()
  };
  addFileMeta(consumer.id, rec);
  addEvent(consumer.id, "file_uploaded", { id, name: req.file.originalname, size: req.file.size });

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
});



