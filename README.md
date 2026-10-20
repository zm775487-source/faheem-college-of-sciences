# Faheem College of Science — Sanawan

Official website of Faheem College of Science, Sanawan (Punjab, near Kot Addu),
with online admissions, a student portal, and a separate management dashboard.

- Contact / WhatsApp for questions: 0346 7114714
- Second contact number: 0346 1949054
- Programs: FSc Pre-Medical, FSc Pre-Engineering, ICS, FA, FA-IT, ICom

## How admissions work now

1. A student registers an account on the website (name, Gmail, mobile, password).
2. The student fills in the admission form and submits it — the application
   goes to the college **server** (not WhatsApp), with the passport photo and
   result-card copies uploaded in the form.
3. Management opens the **Management Dashboard** (separate page, `admin.html`,
   management access code required) and sees every registration and every
   application.
4. For each application, management clicks **Confirm** or **Decline**:
   - **Decline** → the student is automatically emailed that the request
     has been declined.
   - **Confirm** → the system creates a unique Student ID and automatically
     emails the student: admission confirmed, with their username (their
     Gmail) and the unique ID.
5. The student opens the **Student Portal** on the front website with that
   username + ID.
6. Announcements and courses that management saves on the dashboard appear
   on the front portal for everyone.

## What is in this repository

| Part | Where | What it does |
| --- | --- | --- |
| Front portal (students) | `index.html` | Home page, Notice Board, programs, how to apply, student account (register / log in), the online application form, and the Student Portal. One single file, no build step. |
| Management dashboard | `admin.html` | Separate page for college management only (access code). Registrations, applications with Confirm/Decline, confirmed students, announcements, courses. Not linked from the front portal. |
| Backend (server) | `backend/` | Node.js server (`backend/server.js`) + `data.json`. Saves accounts, applications, students, announcements and courses; sends the automatic decision emails. Serves both pages plus the JSON API. |

## Live pieces

- **Front portal** — GitHub Pages from the `gh-pages` branch:
  https://zm775487-source.github.io/faheem-college-of-sciences/
  The dashboard lives at the same address + `/admin.html`.
  The front portal talks to the backend at `https://faheem-college-api.onrender.com`
  (set in one `API_HOST` line near the top of the script in both pages).
  Until the backend is live, the front portal shows its built-in content and
  the application form falls back to the WhatsApp flow, so no application is lost.
- **Backend** — must run on a Node host (GitHub cannot run a server). See below.

## Backend — run the server

Needs Node.js 18 or newer.

```bash
cd backend
npm install   # installs nodemailer (used for the automatic emails)
npm start     # node server.js
```

Configuration is by environment variables:

| Variable | Meaning |
| --- | --- |
| `PORT` | Port to listen on (default 3000) |
| `ADMIN_CODE` | Management access code (default `faheem786`) |
| `SMTP_HOST` | Mail server, e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `465` |
| `SMTP_USER` | The college email address that sends decision emails |
| `SMTP_PASS` | That account's **app password** (for Gmail: Google Account → Security → App passwords) |
| `MAIL_FROM` | Optional From header, e.g. `Faheem College of Science <college@gmail.com>` |

If SMTP is not configured, everything still works, but confirm/decline
responses report `emailSent: false` and the dashboard warns management that
no email went out.

Data is saved in `backend/data.json`; uploaded photos and result cards are
saved in `backend/uploads/`. Back both up regularly. (On free hosts with an
ephemeral disk, use a host with a persistent disk or move the data to a
database, otherwise saved data can be lost when the service restarts.)

## API summary

| API | Use |
| --- | --- |
| `GET /api/health` | Server status + whether email is configured |
| `POST /api/register` | Student account signup `{name, gmail, mobile, password}` |
| `POST /api/auth/login` | Student account login `{gmail, password}` |
| `POST /api/applications` | Submit an application (account Gmail + full form + photo/result-card copies as data URLs) |
| `POST /api/student/login` | Student Portal entry `{username, accessId}` — only for confirmed students |
| `POST /api/admin/login` | Management login `{code}` |
| `GET /api/registrations` | All student registrations (admin) |
| `GET /api/applications` | All applications (admin) |
| `POST /api/applications/:id/confirm` | Confirm admission → creates Student ID + emails the student (admin) |
| `POST /api/applications/:id/decline` | Decline → emails the student (admin) |
| `GET /api/students` · `DELETE /api/students/:studentId` | Confirmed students (admin) |
| `GET /api/announcements` · `POST` · `DELETE /api/announcements/:id` | Announcements — public read (everyone/students), admin write |
| `GET /api/courses` · `POST` · `DELETE /api/courses/:name` | Courses — public read, admin write |

Admin requests send the management access code in the `x-admin-code` header.
