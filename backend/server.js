// Faheem College of Science, Sanawan — backend server (v2)
// Plain Node.js + nodemailer (for automatic decision emails).
// Run:  npm install && node server.js
//
// Serves the website (../index.html = front portal, ../admin.html =
// management dashboard) and the JSON API:
//   - Students register (accounts saved here) and log in.
//   - Admission applications are submitted here (NOT WhatsApp) and
//     appear in front of management in the dashboard.
//   - Management confirms or declines each application:
//       Decline -> the student is emailed automatically.
//       Confirm -> a unique Student ID is created and emailed to the
//                  student with their username for the Student Portal.
//   - Announcements and courses saved here appear on the front portal.
//
// Configuration (environment variables):
//   PORT        port to listen on (default 3000)
//   ADMIN_CODE  management access code (default faheem786)
//   SMTP_HOST   e.g. smtp.gmail.com
//   SMTP_PORT   e.g. 465
//   SMTP_USER   the college email address that sends the emails
//   SMTP_PASS   that account's app password
//   MAIL_FROM   optional From header, e.g. "Faheem College of Science <x@y>"
// If SMTP is not configured the API still works; decision actions then
// report emailSent:false so management knows no email went out.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

let nodemailer = null;
try { nodemailer = require("nodemailer"); } catch (e) { /* emails disabled until npm install */ }

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || "faheem786";
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const SITE_ROOT = path.join(__dirname, "..");
const MAX_BODY = 15 * 1024 * 1024;

try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

// ---------------- data ----------------
function loadData() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (e) { d = {}; }
  if (!Array.isArray(d.announcements)) d.announcements = [];
  if (!Array.isArray(d.courses)) d.courses = [];
  if (!Array.isArray(d.registrations)) d.registrations = [];
  if (!Array.isArray(d.applications)) d.applications = [];
  if (!Array.isArray(d.students)) d.students = [];
  // migrate v1 shapes
  d.announcements = d.announcements.map((a) => ({
    id: a.id || crypto.randomUUID(),
    title: a.title || "",
    message: a.message || a.text || "",
    audience: a.audience === "students" ? "students" : "everyone",
    date: a.date || "",
  }));
  delete d.teachers;
  return d;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ---------------- helpers ----------------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Code",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    let tooBig = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_BODY) tooBig = true;
    });
    req.on("end", () => {
      if (tooBig) return resolve({ __tooBig: true });
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); }
    });
  });
}
function isAdmin(req, body) {
  const code = req.headers["x-admin-code"] || (body && body.adminCode);
  return code === ADMIN_CODE;
}
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}
function newRegistration(name, gmail, mobile, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    name: String(name),
    gmail: String(gmail).toLowerCase(),
    mobile: String(mobile),
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
}
function checkPassword(reg, password) {
  const h = Buffer.from(hashPassword(password, reg.salt), "hex");
  const stored = Buffer.from(reg.passwordHash, "hex");
  return h.length === stored.length && crypto.timingSafeEqual(h, stored);
}
function saveUpload(appId, kind, dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/(jpeg|png|gif);base64,(.+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return null;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const name = appId + "-" + kind + "-" + crypto.randomBytes(4).toString("hex") + "." + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}
function publicApplication(a) {
  const { photoData, card9Data, card10Data, ...rest } = a;
  return rest;
}

// ---------------- email ----------------
const mailConfigured = Boolean(nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
let transporter = null;
if (mailConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: (process.env.SMTP_PORT || "465") === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
const MAIL_FROM = process.env.MAIL_FROM || (process.env.SMTP_USER ? "Faheem College of Science, Sanawan <" + process.env.SMTP_USER + ">" : "");
async function sendEmail(to, subject, text) {
  if (!transporter) return { sent: false, reason: "Email is not configured on the server yet." };
  try {
    await transporter.sendMail({ from: MAIL_FROM, to, subject, text });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String(e && e.message ? e.message : e) };
  }
}
function declineEmail(app) {
  const name = (app.personal && app.personal.name) || "Student";
  const program = (app.choices && app.choices.program) || "Intermediate";
  return {
    subject: "Admission decision — Faheem College of Science, Sanawan",
    text:
      "Assalam-o-Alaikum " + name + ",\n\n" +
      "Thank you for applying for admission to " + program + " at Faheem College of Science, Sanawan.\n\n" +
      "We are sorry to tell you that your admission request has been declined by the college management at this time.\n\n" +
      "If you have any question, please contact the college office:\n" +
      "WhatsApp / Call: 0346 7114714\nOffice: 0346 1949054\n\n" +
      "Faheem College of Science, Sanawan (near Kot Addu), Punjab",
  };
}
function confirmEmail(app, student) {
  return {
    subject: "Admission Confirmed — your Student Portal ID | Faheem College of Science",
    text:
      "Assalam-o-Alaikum " + student.name + ",\n\n" +
      "Congratulations! Your admission to " + student.program + " at Faheem College of Science, Sanawan has been CONFIRMED.\n\n" +
      "Your Student Portal access:\n" +
      "  Username: " + student.username + "\n" +
      "  Unique Student ID: " + student.studentId + "\n\n" +
      "Open the college website, go to the Student Portal section, and enter this username and ID to see your details and announcements. Please keep your ID safe and do not share it with anyone.\n\n" +
      "For any question, contact the college office:\n" +
      "WhatsApp / Call: 0346 7114714\nOffice: 0346 1949054\n\n" +
      "Faheem College of Science, Sanawan (near Kot Addu), Punjab",
  };
}

// ---------------- server ----------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Code",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    });
    return res.end();
  }

  const data = loadData();

  // ---------- public / student API ----------
  if (p === "/api/health") return sendJson(res, 200, { ok: true, college: "Faheem College of Science, Sanawan", emailConfigured: mailConfigured });

  if (p === "/api/register" && req.method === "POST") {
    const body = await readBody(req);
    if (body.__tooBig) return sendJson(res, 413, { error: "Request too large" });
    const name = String(body.name || "").trim();
    const gmail = String(body.gmail || "").trim().toLowerCase();
    const mobile = String(body.mobile || "").trim();
    const password = String(body.password || "");
    if (!name || !gmail || !mobile || password.length < 6)
      return sendJson(res, 400, { error: "Please fill in your name, Gmail, mobile number and a password of at least 6 characters." });
    if (data.registrations.some((r) => r.gmail === gmail))
      return sendJson(res, 409, { error: "An account with this Gmail already exists — please use Log in." });
    const reg = newRegistration(name, gmail, mobile, password);
    data.registrations.push(reg);
    saveData(data);
    return sendJson(res, 201, { name: reg.name, gmail: reg.gmail, mobile: reg.mobile });
  }

  if (p === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const gmail = String(body.gmail || "").trim().toLowerCase();
    const reg = data.registrations.find((r) => r.gmail === gmail);
    if (!reg) return sendJson(res, 404, { error: "No account found for this Gmail. Please register first." });
    if (!checkPassword(reg, String(body.password || ""))) return sendJson(res, 401, { error: "Incorrect password. Please try again." });
    return sendJson(res, 200, { name: reg.name, gmail: reg.gmail, mobile: reg.mobile });
  }

  if (p === "/api/courses" && req.method === "GET") return sendJson(res, 200, data.courses);

  if (p === "/api/announcements" && req.method === "GET") {
    const audience = url.searchParams.get("for"); // everyone | students
    let list = data.announcements.filter((a) => a.audience === "everyone" || a.audience === "students");
    if (audience === "everyone") list = list.filter((a) => a.audience === "everyone");
    return sendJson(res, 200, list);
  }

  if (p === "/api/applications" && req.method === "POST") {
    const body = await readBody(req);
    if (body.__tooBig) return sendJson(res, 413, { error: "Application too large — please use smaller photo/result-card copies (under 1MB each)." });
    const accountGmail = String(body.accountGmail || "").trim().toLowerCase();
    const reg = data.registrations.find((r) => r.gmail === accountGmail);
    if (!reg) return sendJson(res, 400, { error: "Please register or log in with your student account first, then submit your application." });
    const personal = body.personal || {};
    if (!personal.name || !personal.fatherName || !body.matric || !body.choices || !body.choices.program)
      return sendJson(res, 400, { error: "The application is incomplete. Please fill in every required field." });
    if (!body.card9Data) return sendJson(res, 400, { error: "A copy of your 9th class result card is required." });
    const app = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: "pending",
      accountGmail,
      personal,
      guardian: body.guardian || {},
      emergency: body.emergency || {},
      matric: body.matric || {},
      choices: body.choices || {},
      tenthStatus: body.tenthStatus === "not-issued" ? "not-issued" : "issued",
      tenthRoll: String(body.tenthRoll || ""),
    };
    app.photoFile = saveUpload(app.id, "photo", body.photoData);
    app.card9File = saveUpload(app.id, "card9", body.card9Data);
    app.card10File = app.tenthStatus === "issued" ? saveUpload(app.id, "card10", body.card10Data) : null;
    if (!app.card9File) return sendJson(res, 400, { error: "The 9th class result card copy could not be read — please upload a jpg, gif or png copy under 1MB." });
    data.applications.unshift(app);
    saveData(data);
    return sendJson(res, 201, { ok: true, id: app.id, message: "Your application has been sent to the college office. You will receive an email when management confirms or declines it." });
  }

  if (p === "/api/student/login" && req.method === "POST") {
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const accessId = String(body.accessId || "").trim();
    const student = data.students.find(
      (s) => s.username.toLowerCase() === username && s.studentId.toLowerCase() === accessId.toLowerCase()
    );
    return student
      ? sendJson(res, 200, { name: student.name, studentId: student.studentId, program: student.program, classShift: student.classShift })
      : sendJson(res, 404, { error: "This username and ID were not found. Please check the confirmation email from the college, or contact the college office." });
  }

  // ---------- management API ----------
  if (p === "/api/admin/login" && req.method === "POST") {
    const body = await readBody(req);
    return body.code === ADMIN_CODE
      ? sendJson(res, 200, { ok: true, emailConfigured: mailConfigured })
      : sendJson(res, 401, { ok: false, error: "Incorrect access code" });
  }

  if (p === "/api/registrations" && req.method === "GET") {
    if (!isAdmin(req, {})) return sendJson(res, 401, { error: "Admin only" });
    return sendJson(res, 200, data.registrations.map((r) => ({ name: r.name, gmail: r.gmail, mobile: r.mobile, createdAt: r.createdAt })));
  }

  if (p === "/api/applications" && req.method === "GET") {
    if (!isAdmin(req, {})) return sendJson(res, 401, { error: "Admin only" });
    return sendJson(res, 200, data.applications.map(publicApplication));
  }
  const appMatch = p.match(/^\/api\/applications\/([0-9a-f-]{36})$/);
  if (appMatch && req.method === "GET") {
    if (!isAdmin(req, {})) return sendJson(res, 401, { error: "Admin only" });
    const app = data.applications.find((a) => a.id === appMatch[1]);
    return app ? sendJson(res, 200, publicApplication(app)) : sendJson(res, 404, { error: "Application not found" });
  }
  const confirmMatch = p.match(/^\/api\/applications\/([0-9a-f-]{36})\/confirm$/);
  if (confirmMatch && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    const app = data.applications.find((a) => a.id === confirmMatch[1]);
    if (!app) return sendJson(res, 404, { error: "Application not found" });
    if (app.status === "confirmed" && app.studentId) {
      const existing = data.students.find((s) => s.studentId === app.studentId);
      return sendJson(res, 200, { ok: true, already: true, student: existing || null });
    }
    const year = new Date().getFullYear();
    let seq = data.students.length + 1;
    let studentId;
    do {
      studentId = "FCS-" + year + "-" + String(seq).padStart(4, "0");
      seq += 1;
    } while (data.students.some((s) => s.studentId === studentId));
    const prefs = (app.choices && app.choices.prefs) || [];
    const student = {
      studentId,
      name: (app.personal && app.personal.name) || "",
      username: app.accountGmail || (app.personal && app.personal.email) || "",
      program: String(body.program || (prefs[0] && prefs[0].program) || app.choices.program || ""),
      classShift: String(body.classShift || (prefs[0] && prefs[0].shift) || ""),
      applicationId: app.id,
      createdAt: new Date().toISOString(),
    };
    data.students.push(student);
    app.status = "confirmed";
    app.studentId = studentId;
    app.decidedAt = new Date().toISOString();
    saveData(data);
    const mail = confirmEmail(app, student);
    const emailTo = (app.personal && app.personal.email) || student.username;
    const result = await sendEmail(emailTo, mail.subject, mail.text);
    return sendJson(res, 200, { ok: true, student, emailSent: result.sent, emailError: result.reason || null, emailTo });
  }
  const declineMatch = p.match(/^\/api\/applications\/([0-9a-f-]{36})\/decline$/);
  if (declineMatch && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    const app = data.applications.find((a) => a.id === declineMatch[1]);
    if (!app) return sendJson(res, 404, { error: "Application not found" });
    app.status = "declined";
    app.decidedAt = new Date().toISOString();
    saveData(data);
    const mail = declineEmail(app);
    const emailTo = (app.personal && app.personal.email) || app.accountGmail;
    const result = await sendEmail(emailTo, mail.subject, mail.text);
    return sendJson(res, 200, { ok: true, emailSent: result.sent, emailError: result.reason || null, emailTo });
  }

  if (p === "/api/students" && req.method === "GET") {
    if (!isAdmin(req, {})) return sendJson(res, 401, { error: "Admin only" });
    return sendJson(res, 200, data.students);
  }
  if (p.startsWith("/api/students/") && req.method === "DELETE") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    const id = decodeURIComponent(p.split("/").pop());
    data.students = data.students.filter((s) => s.studentId !== id);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  if (p === "/api/announcements" && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    if (!body.title || !body.message) return sendJson(res, 400, { error: "Title and message are required" });
    const item = {
      id: crypto.randomUUID(),
      title: String(body.title),
      message: String(body.message),
      audience: body.audience === "students" ? "students" : "everyone",
      date: new Date().toISOString().slice(0, 10),
    };
    data.announcements.unshift(item);
    saveData(data);
    return sendJson(res, 201, item);
  }
  if (p.startsWith("/api/announcements/") && req.method === "DELETE") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    const id = decodeURIComponent(p.split("/").pop());
    data.announcements = data.announcements.filter((a) => a.id !== id);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  if (p === "/api/courses" && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    if (!body.name) return sendJson(res, 400, { error: "Course name is required" });
    const course = {
      name: String(body.name),
      code: String(body.code || body.name),
      desc: String(body.desc || ""),
      subjects: Array.isArray(body.subjects) ? body.subjects.map(String) : [],
    };
    data.courses = data.courses.filter((c) => c.name !== course.name);
    data.courses.push(course);
    saveData(data);
    return sendJson(res, 201, course);
  }
  if (p.startsWith("/api/courses/") && req.method === "DELETE") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    const name = decodeURIComponent(p.split("/").pop());
    data.courses = data.courses.filter((c) => c.name !== name);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  if (p.startsWith("/api/")) return sendJson(res, 404, { error: "Not found" });

  // ---------- uploaded documents (unguessable file names) ----------
  if (p.startsWith("/uploads/")) {
    const name = path.basename(p);
    const fp = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(fp)) { res.writeHead(404); return res.end("Not found"); }
    const types = { ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif" };
    res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "application/octet-stream" });
    return fs.createReadStream(fp).pipe(res);
  }

  // ---------- website ----------
  const rel = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  const filePath = path.join(SITE_ROOT, rel);
  if (!filePath.startsWith(SITE_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log("Faheem College of Science server running on port " + PORT + (mailConfigured ? " (email on)" : " (email NOT configured)"));
});
