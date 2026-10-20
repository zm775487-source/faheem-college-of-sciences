// Faheem College of Science, Sanawan — backend server
// Plain Node.js (no external packages). Run:  node server.js
// Serves the website (../index.html) and the JSON API used by the
// Management Dashboard, Student Portal and Teacher Portal.
// Data is saved in ./data.json on the server, so announcements,
// courses, students and teachers stay saved for every visitor.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || "faheem786";
const DATA_FILE = path.join(__dirname, "data.json");
const SITE_ROOT = path.join(__dirname, "..");

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return { announcements: [], courses: [], students: [], teachers: [] };
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); }
    });
  });
}
function isAdmin(req, body) {
  const code = req.headers["x-admin-code"] || (body && body.adminCode);
  return code === ADMIN_CODE;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const data = loadData();

  // ---------- API ----------
  if (p === "/api/health") return sendJson(res, 200, { ok: true, college: "Faheem College of Science, Sanawan" });

  if (p === "/api/admin/login" && req.method === "POST") {
    const body = await readBody(req);
    return body.code === ADMIN_CODE
      ? sendJson(res, 200, { ok: true })
      : sendJson(res, 401, { ok: false, error: "Incorrect access code" });
  }

  if (p === "/api/announcements" && req.method === "GET") {
    const audience = url.searchParams.get("for"); // everyone | students | teachers
    const list = audience
      ? data.announcements.filter((a) => a.audience === "everyone" || a.audience === audience)
      : data.announcements;
    return sendJson(res, 200, list);
  }
  if (p === "/api/announcements" && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    if (!body.title || !body.message) return sendJson(res, 400, { error: "Title and message are required" });
    const item = {
      id: Date.now().toString(),
      title: String(body.title),
      message: String(body.message),
      audience: ["everyone", "students", "teachers"].includes(body.audience) ? body.audience : "everyone",
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

  if (p === "/api/courses" && req.method === "GET") return sendJson(res, 200, data.courses);
  if (p === "/api/courses" && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    if (!body.name) return sendJson(res, 400, { error: "Course name is required" });
    const course = { name: String(body.name), subjects: Array.isArray(body.subjects) ? body.subjects : [] };
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

  if (p === "/api/students" && req.method === "GET") {
    if (!isAdmin(req, {})) return sendJson(res, 401, { error: "Admin only" });
    return sendJson(res, 200, data.students);
  }
  if (p === "/api/students" && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    if (!body.name || !body.rollNumber) return sendJson(res, 400, { error: "Name and roll number are required" });
    const student = {
      name: String(body.name),
      rollNumber: String(body.rollNumber),
      program: String(body.program || ""),
      classShift: String(body.classShift || ""),
    };
    data.students = data.students.filter((s) => s.rollNumber !== student.rollNumber);
    data.students.push(student);
    saveData(data);
    return sendJson(res, 201, student);
  }
  if (p.startsWith("/api/students/") && req.method === "DELETE") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    const roll = decodeURIComponent(p.split("/").pop());
    data.students = data.students.filter((s) => s.rollNumber !== roll);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }
  if (p === "/api/student/login" && req.method === "POST") {
    const body = await readBody(req);
    const student = data.students.find((s) => s.rollNumber === String(body.rollNumber || ""));
    return student
      ? sendJson(res, 200, student)
      : sendJson(res, 404, { error: "This roll number is not registered. Please contact the college office." });
  }

  if (p === "/api/teachers" && req.method === "GET") {
    if (!isAdmin(req, {})) return sendJson(res, 401, { error: "Admin only" });
    return sendJson(res, 200, data.teachers);
  }
  if (p === "/api/teachers" && req.method === "POST") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    if (!body.name || !body.teacherId) return sendJson(res, 400, { error: "Name and teacher ID are required" });
    const teacher = { name: String(body.name), teacherId: String(body.teacherId), subject: String(body.subject || "") };
    data.teachers = data.teachers.filter((t) => t.teacherId !== teacher.teacherId);
    data.teachers.push(teacher);
    saveData(data);
    return sendJson(res, 201, teacher);
  }
  if (p.startsWith("/api/teachers/") && req.method === "DELETE") {
    const body = await readBody(req);
    if (!isAdmin(req, body)) return sendJson(res, 401, { error: "Admin only" });
    const id = decodeURIComponent(p.split("/").pop());
    data.teachers = data.teachers.filter((t) => t.teacherId !== id);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }
  if (p === "/api/teacher/login" && req.method === "POST") {
    const body = await readBody(req);
    const teacher = data.teachers.find((t) => t.teacherId === String(body.teacherId || ""));
    return teacher
      ? sendJson(res, 200, teacher)
      : sendJson(res, 404, { error: "This teacher ID is not registered. Please contact the college office." });
  }

  if (p.startsWith("/api/")) return sendJson(res, 404, { error: "Not found" });

  // ---------- Website (frontend) ----------
  const filePath = p === "/" ? path.join(SITE_ROOT, "index.html") : path.join(SITE_ROOT, p);
  if (!filePath.startsWith(SITE_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log("Faheem College of Science server running on port " + PORT);
});
