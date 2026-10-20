# Faheem College of Science — Sanawan

Official website of Faheem College of Science, Sanawan (Punjab, near Kot Addu),
with online admissions, a management dashboard, a student portal and a teacher portal.

- Contact / WhatsApp for applications: 0346 7114714
- Second contact number: 0346 1949054
- Programs: FSc Pre-Medical, FSc Pre-Engineering, ICS, FA, FA-IT, ICom

## What is in this repository

| Part | Where | What it does |
| --- | --- | --- |
| Frontend (website) | `index.html` | The full public website: home page, Notice Board, programs, how to apply, online application form, and the Portals & Management Dashboard section. One single file, no build step. |
| Backend (server) | `backend/` | A small Node.js server (`backend/server.js`, no external packages) that saves announcements, courses, registered students and teachers in `backend/data.json` and serves the same website plus a JSON API. |

## Frontend — live on GitHub Pages

GitHub Pages shows the frontend. One-time setting (only the account owner can do this):

1. Open this repository on GitHub → **Settings** → **Pages**
2. Under "Build and deployment", choose **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)** → **Save**

The site then goes live at:

    https://zm775487-source.github.io/faheem-college-of-sciences/

On GitHub Pages the dashboard and portals work on the page itself
(announcements, course add/remove, student roll numbers and teacher IDs
take effect for that visit). For data that saves permanently for every
visitor, run the backend below on a server host — that is also how the
site will run when the college's own custom domain is connected later.

## Backend — run the server

Needs Node.js 18 or newer. No packages to install.

```bash
cd backend
node server.js
# or: npm start
```

Then open http://localhost:3000 — the server shows the same website and
answers the API:

| API | Use |
| --- | --- |
| `GET /api/health` | Check the server is running |
| `POST /api/admin/login` | Management login, body: `{"code": "..."}` |
| `GET /api/announcements?for=students` | Announcements (everyone / students / teachers) |
| `POST /api/announcements` | Add an announcement (admin) |
| `DELETE /api/announcements/:id` | Remove an announcement (admin) |
| `GET /api/courses` · `POST /api/courses` · `DELETE /api/courses/:name` | Courses on the frontend |
| `GET /api/students` · `POST /api/students` · `DELETE /api/students/:rollNumber` | Registered students (admin) |
| `POST /api/student/login` | Student portal entry, body: `{"rollNumber": "..."}` |
| `GET /api/teachers` · `POST /api/teachers` · `DELETE /api/teachers/:teacherId` | Teachers (admin) |
| `POST /api/teacher/login` | Teacher portal entry, body: `{"teacherId": "..."}` |

Admin requests send the management access code in the `x-admin-code`
header (or as `adminCode` in the JSON body). Default code: `faheem786`
— change it on the server with the `ADMIN_CODE` environment variable.

To put the backend live, deploy the `backend/` folder to any Node host
(for example Render, Railway, or the hosting bought with the custom
domain) with the start command `node server.js`. The same server then
serves the website at the domain with all data saved.
