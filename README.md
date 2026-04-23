# 🖨️ Toner Tracker — Production Inventory System

A full-stack toner inventory tracking system with barcode/QR scanning, real-time dashboard, audit logging, and PDF report generation.

---

## ✅ Features

| Feature | Details |
|---|---|
| 🔐 Authentication | Session-based login with bcrypt hashed passwords |
| 📤 Issue (OUT) | Barcode-first workflow, duplicate prevention |
| 📥 Return (IN) | Auto-fills customer, validates existing OUT |
| 📷 Scanner | Camera-based barcode + QR code scanning (ZXing) |
| 🔍 Autocomplete | Typeahead customer search (1000+ customers) |
| 📊 Dashboard | Live stats: Total / OUT / IN / Audit events |
| ⚠️ Audit Logs | Tracks all invalid/duplicate operations |
| 📄 PDF Reports | Professional reports via jsPDF + AutoTable |
| 🎨 UI | Clean industrial design with Tailwind CSS |

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd toner-tracker
npm install
```

### 2. Start the Server

```bash
npm start
```

Or for development (auto-restart):
```bash
npm run dev
```

### 3. Open Browser

```
http://localhost:3000
```

### 4. Login

```
Username: admin
Password: admin123
```

> ⚠️ Change the admin password immediately in production!

---

## 📁 Project Structure

```
toner-tracker/
├── server.js          # Express server, API routes, DB setup
├── package.json       # Dependencies
├── toner.db           # SQLite database (auto-created on first run)
└── public/
    ├── index.html     # Main app (dashboard, forms, tables)
    ├── login.html     # Login page
    └── app.js         # All frontend logic
```

---

## 🔄 Workflow

### Issue Toner (OUT)
1. Navigate to **Issue Toner (OUT)**
2. Scan barcode with camera OR type manually
3. System auto-fills customer if barcode exists
4. Enter customer name (searchable autocomplete)
5. Click **Issue Toner** → saved with `status = OUT`

### Return Toner (IN)
1. Navigate to **Return Toner (IN)**
2. Scan or type barcode
3. System shows who it was issued to
4. Confirm returned-by name
5. Click **Record Return** → updated with `status = IN`

---

## 🛡️ Data Integrity Rules

- No duplicate OUT for same barcode
- IN only allowed if valid OUT exists
- All invalid attempts logged to Audit Logs
- All inputs validated server-side

---

## 📊 Database Schema

```sql
users         — id, username, password (hashed)
toners        — id, barcode, issued_to, returned_by, status, issue_date, return_date, issued_by, notes
customers     — id, name (unique)
mismatch_logs — id, barcode, action_type, message, performed_by, timestamp
```

---

## 🌐 Deployment (Render.com)

1. Push to GitHub
2. Create new **Web Service** on Render
3. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add environment variable:
   - `SESSION_SECRET` = any long random string
5. Add a **Disk** (for persistent SQLite): mount at `/opt/render/project/src`

---

## 🔧 Configuration

Edit `server.js` top section:

```js
const PORT = process.env.PORT || 3000;
// Session secret via env var: SESSION_SECRET
```

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| express | Web framework |
| better-sqlite3 | Fast synchronous SQLite |
| express-session | Session management |
| bcryptjs | Password hashing |
| uuid | Unique IDs |

### Frontend (CDN — no install needed)
- Tailwind CSS
- ZXing (barcode/QR scanner)
- jsPDF + AutoTable (PDF generation)
- Google Fonts (Syne, DM Sans, DM Mono)

---

## 🔑 Adding Users

Currently users are created programmatically. To add a new user, add to `server.js` after DB setup:

```js
const hash = bcrypt.hashSync('yourpassword', 10);
db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)').run('newuser', hash);
```

---

## 📄 License

Internal use only — not for public distribution.
