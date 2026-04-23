'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database Setup ───────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'toner.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT UNIQUE,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id TEXT NOT NULL,
    model_code TEXT,
    customer_id INTEGER NOT NULL,
    UNIQUE(machine_id, customer_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS toners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE NOT NULL,
    issued_to TEXT NOT NULL,
    machine TEXT,
    item TEXT,
    returned_by TEXT,
    status TEXT NOT NULL DEFAULT 'OUT' CHECK(status IN ('OUT','IN')),
    issue_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    return_date DATETIME,
    issued_by TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS mismatch_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT NOT NULL,
    action_type TEXT NOT NULL,
    message TEXT NOT NULL,
    performed_by TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations for existing databases
['machine TEXT', 'item TEXT'].forEach(col => {
  try { db.exec(`ALTER TABLE toners ADD COLUMN ${col}`); } catch(e) {}
});
try { db.exec(`ALTER TABLE customers ADD COLUMN customer_code TEXT`); } catch(e) {}

// ─── Seed Admin ───────────────────────────────────────────────────────────────
if (!db.prepare('SELECT id FROM users WHERE username = ?').get('admin')) {
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', bcrypt.hashSync('admin123', 10));
  console.log('✅ Admin created: admin / admin123');
}

// ─── Seed Real Customer & Machine Data (from PDF) ─────────────────────────────
const custCount = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
if (custCount === 0) {
  const realData = [
    { code: 'C10-00009', name: 'Athar Business Machines FZE', machines: [
      { id: 'E184J300253', model: 'MPC5503SP' },{ id: '3101RB10577', model: 'IMC3000' },
      { id: '3101RC00506', model: 'IMC3000' },{ id: '3281M420597', model: 'IM2702' },
      { id: 'C509P601438', model: 'MPC307SPF' },{ id: 'C811RB00047', model: 'SPC360SNW' },
      { id: 'G479M431334', model: 'MPC2011SP' }
    ]},
    { code: 'C10-00033', name: 'Chungath Dot Computers', machines: [
      { id: '3080R210897', model: 'IMC2000' },{ id: '3081R711076', model: 'IMC2000' },
      { id: '3282Z520519', model: 'M2701' }
    ]},
    { code: 'C10-00046', name: 'Eduplan General Trading L.L.C.', machines: [
      { id: 'E338M320439', model: 'MP2501SP' }
    ]},
    { code: 'C10-00051', name: 'Future Talent Technology L.L.C.', machines: [
      { id: '3299M920340', model: 'IM2702' }
    ]},
    { code: 'C10-00075', name: 'Middle East Stationery & Trading Co. L.L.C.', machines: [
      { id: 'E334MA20464', model: 'MP2501SP' }
    ]},
    { code: 'C10-00146', name: 'Wellcare Infotech L.L.C.', machines: [
      { id: '32993520681', model: 'IM2702' },{ id: '3299M520743', model: 'IM2702' }
    ]},
    { code: 'C10-00170', name: 'ARCHITECTURAL ACADEMIC OFFICE', machines: [
      { id: 'W1120600110', model: 'MPW2401' }
    ]},
    { code: 'C10-00178', name: 'ABRA VM & SD INTERNATIONAL FZ LLC', machines: [
      { id: '3089R311593', model: 'IMC2000' },{ id: '3101R810178', model: 'IMC3000' },
      { id: '9154R921917', model: 'IMC3010' }
    ]},
    { code: 'C10-00221', name: 'BELHASA PROJECTS LLC', machines: [
      { id: '3100R110498', model: 'IMC3000' },{ id: '3102J800930', model: 'IMC3000' },
      { id: '3290MB20464', model: 'IM2702' },{ id: '3291M120459', model: 'IM2702' },
      { id: '3299M720053', model: 'IM2702' },{ id: '3299M921633', model: 'IM2702' },
      { id: 'C738MB05145', model: 'MPC4504EXSP' },{ id: 'G528Y730008', model: 'MPW6700SP' }
    ]},
    { code: 'C10-00225', name: 'BLUE RHINE INDUSTRIES LLC', machines: [
      { id: '3089R110343', model: 'IMC2000' },{ id: 'C508P502190', model: 'MPC307SPF' },
      { id: 'C509P200625', model: 'MPC307SPF' },{ id: 'C509P301034', model: 'MPC307SPF' },
      { id: 'C768R520840', model: 'MPC2004EXSP' },{ id: 'C768R620846', model: 'MPC2004EXSP' },
      { id: 'G716M580093', model: 'ADMPC4504ASP' },{ id: 'G716MA80259', model: 'ADMPC4504ASP' }
    ]},
    { code: 'C10-00255', name: 'CLOUD SOLUTIONS FZE', machines: [
      { id: '3280MC20479', model: 'M2701' },{ id: '3281M420125', model: 'M2701' },
      { id: '3281M420133', model: 'M2701' }
    ]},
    { code: 'C10-00317', name: 'MAGNUS INDUSTRIES LLC', machines: [
      { id: '3080RA10016', model: 'IMC2000' },{ id: '3081R713408', model: 'IMC2000' }
    ]},
    { code: 'C10-00495', name: 'SHOP FIT INTERIOR LLC', machines: [
      { id: 'E155MB20976', model: 'MPC3003SP' }
    ]},
    { code: 'C10-00534', name: 'Airlink International U.A.E.', machines: [
      { id: 'E336M420235', model: 'MP2501SP' }
    ]},
    { code: 'C10-00535', name: 'Al Gurg Consultants Faisal Abdullah Algurg LLC', machines: [
      { id: 'E335MB20155', model: 'MP2501SP' },{ id: 'W884J700016', model: 'MP9002SP' }
    ]},
    { code: 'C10-00536', name: 'Al Harameen Bookshop', machines: [
      { id: 'E153M533073', model: 'MPC3003SP' },{ id: 'E153M533312', model: 'MPC3003SP' },
      { id: 'E155M531096', model: 'MPC3003SP' },{ id: 'E155M531849', model: 'MPC3003SP' },
      { id: 'E155M533494', model: 'MPC3003SP' },{ id: 'E155M632028', model: 'MPC3003SP' },
      { id: 'E185M430173', model: 'MPC5503SP' },{ id: 'E185M430182', model: 'MPC5503SP' },
      { id: 'E185M430183', model: 'MPC5503SP' },{ id: 'E185M430194', model: 'MPC5503SP' },
      { id: 'M3290200056', model: 'MPW2400' },{ id: 'M3290200066', model: 'MPW2400' },
      { id: 'M3300700130', model: 'MPW3600' },{ id: 'M3300900046', model: 'MPW3600' },
      { id: 'M3380900051', model: 'MPW3600' },{ id: 'M3390600007', model: 'MPW3600' },
      { id: 'V9603600213', model: 'MPC5501AD' },{ id: 'V9613000934', model: 'MPC5501AD' },
      { id: 'V9613100113', model: 'MPC5501AD' },{ id: 'V9613100130', model: 'MPC5501AD' },
      { id: 'V9613500037', model: 'MPC5501AD' },{ id: 'W1210500145', model: 'MPW3601' },
      { id: 'W1210500147', model: 'MPW3601' },{ id: 'W1221000135', model: 'MPW3601' },
      { id: 'W1230100049', model: 'MPW3601' },{ id: 'W492KA05320', model: 'MPC3002AD' },
      { id: 'W492KB02182', model: 'MPC3002AD' },{ id: 'W543J300146', model: 'MPC5502ARDF' }
    ]},
  ];

  const extraCustomers = [
    'Acme Corp','BrightPath Solutions','ClearView Systems','Delta Logistics',
    'Ember Technologies','Falcon Industries','GreenLeaf Consulting','Harbor Digital',
    'Infinex Networks','Jetstream Analytics','Kestrel Media','Luminos Group',
    'Mapstone Enterprises','Nexus IT','Orbit Software','PinPoint Delivery',
    'Quantum Labs','Riverstone Partners','SkyBridge Communications','TerraLogic',
    'Ultrawave Systems','Vertex Consulting','Waveline Media','Xenon Industries',
  ];

  const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (customer_code, name) VALUES (?, ?)');
  const insertMachine = db.prepare('INSERT OR IGNORE INTO machines (machine_id, model_code, customer_id) VALUES (?, ?, ?)');

  db.transaction(() => {
    for (const c of realData) {
      insertCustomer.run(c.code, c.name);
      const cust = db.prepare('SELECT id FROM customers WHERE name = ?').get(c.name);
      for (const m of c.machines) insertMachine.run(m.id, m.model, cust.id);
    }
    for (const name of extraCustomers) insertCustomer.run(null, name);
  })();
  console.log('✅ Real customer/machine data seeded');
}

// ─── Seed Toner Items (from image) ────────────────────────────────────────────
if (!db.prepare('SELECT COUNT(*) as c FROM items').get().c) {
  const items = [
    ['RRC 841817','PRINT CARTRIDGE BLACK MPC3003/3503'],
    ['RRC 841818','PRINT CARTRIDGE YELLOW MPC3003/3503'],
    ['RRC 841819','PRINT CARTRIDGE MAGENTA MPC3003/3503'],
    ['RRC 841820','PRINT CARTRIDGE CYAN MPC3003/3503'],
    ['RRC 841853','PRINT CARTRIDGE BLACK MPC4503/5503/6003'],
    ['RRC 841854','PRINT CARTRIDGE YELLOW MPC4503/5503/6003'],
    ['RRC 841855','PRINT CARTRIDGE MAGENTA MPC4503/5503/6003'],
    ['RRC 841856','PRINT CARTRIDGE CYAN MPC4503/5503/6003'],
    ['RRC 841925','PRINT CARTRIDGE BLACK MPC2503'],
    ['RRC 841926','PRINT CARTRIDGE YELLOW MPC2503'],
    ['RRC 841927','PRINT CARTRIDGE MAGENTA MPC2503'],
    ['RRC 841928','PRINT CARTRIDGE CYAN MPC2503'],
    ['RRC 842095','PRINT CARTRIDGE BLACK MP C406'],
    ['RRC 842096','PRINT CARTRIDGE CYAN MP C406'],
    ['RRC 842097','PRINT CARTRIDGE MAGENTA MP C406'],
    ['RRC 842098','PRINT CARTRIDGE YELLOW MP C406'],
    ['RRC 842135','Ultra High Capacity toner (12,000 pages)'],
    ['RRC 842192','PRINT CARTRIDGE BLACK MPC8003'],
    ['RRC 842193','PRINT CARTRIDGE YELLOW MPC8003'],
    ['RRC 842194','PRINT CARTRIDGE MAGENTA MPC8003'],
    ['RRC 842195','PRINT CARTRIDGE CYAN MPC8003'],
    ['RRC 842255','PRINT CARTRIDGE BLACK IM C3500'],
    ['RRC 842256','PRINT CARTRIDGE YELLOW IM C3500'],
    ['RRC 842257','PRINT CARTRIDGE MAGENTA IM C3500'],
    ['RRC 842258','PRINT CARTRIDGE CYAN IM C3500'],
    ['RRC 842283','PRINT CARTRIDGE BLACK IM C6000'],
    ['RRC 842284','PRINT CARTRIDGE YELLOW IM C6000'],
    ['RRC 842285','PRINT CARTRIDGE MAGENTA IM C6000'],
    ['RRC 842286','PRINT CARTRIDGE CYAN IM C6000'],
    ['RRC 842311','PRINT CARTRIDGE BLACK IM C2500'],
    ['RRC 842312','PRINT CARTRIDGE YELLOW IM C2500H'],
    ['RRC 842313','PRINT CARTRIDGE MAGENTA IM C2500H'],
    ['RRC 842314','PRINT CARTRIDGE CYAN IM C2500H'],
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO items (item_code, description) VALUES (?, ?)');
  db.transaction(() => items.forEach(([c, d]) => ins.run(c, d)))();
  console.log(`✅ ${items.length} toner items seeded`);
}

// ─── Seed Demo Toner Records ──────────────────────────────────────────────────
if (!db.prepare('SELECT COUNT(*) as c FROM toners').get().c) {
  const custs = db.prepare('SELECT id, name FROM customers LIMIT 16').all();
  const allMachines = db.prepare('SELECT machine_id, model_code, customer_id FROM machines').all();
  const allItems = db.prepare('SELECT item_code, description FROM items').all();
  const statuses = ['OUT','IN','OUT','OUT','IN'];
  const ins = db.prepare(`INSERT INTO toners (barcode,issued_to,machine,item,returned_by,status,issue_date,return_date,issued_by)
    VALUES (?,?,?,?,?,?,?,?,'admin')`);
  db.transaction(() => {
    for (let i = 1; i <= 80; i++) {
      const c = custs[i % custs.length];
      const cm = allMachines.filter(m => m.customer_id === c.id);
      const m = cm.length ? cm[i % cm.length] : null;
      const itm = allItems[i % allItems.length];
      const st = statuses[i % statuses.length];
      const issueDate = new Date(Date.now() - Math.random() * 45 * 864e5).toISOString();
      const retDate = st === 'IN' ? new Date(Date.now() - Math.random() * 10 * 864e5).toISOString() : null;
      ins.run(
        `TN${String(i).padStart(6,'0')}`, c.name,
        m ? `${m.machine_id} (${m.model_code})` : null,
        `${itm.item_code} — ${itm.description}`,
        st === 'IN' ? c.name : null, st, issueDate, retDate
      );
    }
  })();
  console.log('✅ 80 demo toner records seeded');
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'toner-tracker-secret-2024',
  resave: false, saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));

const requireAuth = (req, res, next) => {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid username or password' });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});
app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ success: true })); });
app.get('/api/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username: req.session.username });
});

// ─── Customers ────────────────────────────────────────────────────────────────
app.get('/api/customers', requireAuth, (req, res) => {
  const { q } = req.query;
  const rows = q && q.trim()
    ? db.prepare(`SELECT id, customer_code, name FROM customers WHERE name LIKE ? OR customer_code LIKE ? ORDER BY name LIMIT 25`).all(`%${q.trim()}%`, `%${q.trim()}%`)
    : db.prepare('SELECT id, customer_code, name FROM customers ORDER BY name LIMIT 25').all();
  res.json(rows);
});

// ─── Machines by Customer ─────────────────────────────────────────────────────
app.get('/api/machines', requireAuth, (req, res) => {
  const { customer_id, q } = req.query;
  if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
  const base = `SELECT id, machine_id, model_code FROM machines WHERE customer_id = ?`;
  const rows = (q && q.trim())
    ? db.prepare(`${base} AND (machine_id LIKE ? OR model_code LIKE ?) ORDER BY machine_id`).all(customer_id, `%${q.trim()}%`, `%${q.trim()}%`)
    : db.prepare(`${base} ORDER BY machine_id`).all(customer_id);
  res.json(rows);
});

// ─── Items ────────────────────────────────────────────────────────────────────
app.get('/api/items', requireAuth, (req, res) => {
  const { q } = req.query;
  const rows = (q && q.trim())
    ? db.prepare(`SELECT item_code, description FROM items WHERE description LIKE ? OR item_code LIKE ? ORDER BY item_code LIMIT 20`).all(`%${q.trim()}%`, `%${q.trim()}%`)
    : db.prepare('SELECT item_code, description FROM items ORDER BY item_code').all();
  res.json(rows);
});

// ─── Barcode Lookup ───────────────────────────────────────────────────────────
app.get('/api/barcode/:barcode', requireAuth, (req, res) => {
  const record = db.prepare('SELECT * FROM toners WHERE barcode = ?').get(req.params.barcode.trim());
  if (!record) return res.json({ found: false });
  res.json({ found: true, record });
});

// ─── Issue (OUT) ──────────────────────────────────────────────────────────────
app.post('/api/issue', requireAuth, (req, res) => {
  const { barcode, issued_to, machine, item, notes } = req.body;
  if (!barcode || !issued_to) return res.status(400).json({ error: 'Barcode and customer are required' });
  const bc = barcode.trim(), customer = issued_to.trim();
  const existing = db.prepare('SELECT * FROM toners WHERE barcode = ?').get(bc);

  if (existing && existing.status === 'OUT') {
    db.prepare(`INSERT INTO mismatch_logs (barcode, action_type, message, performed_by) VALUES (?, 'OUT', ?, ?)`)
      .run(bc, `Duplicate OUT — already issued to ${existing.issued_to}`, req.session.username);
    return res.status(409).json({ error: `Barcode already OUT — issued to "${existing.issued_to}"` });
  }

  const mach = machine ? machine.trim() : null;
  const itm = item ? item.trim() : null;

  if (existing) {
    db.prepare(`UPDATE toners SET issued_to=?,machine=?,item=?,status='OUT',issue_date=CURRENT_TIMESTAMP,return_date=NULL,returned_by=NULL,issued_by=?,notes=? WHERE barcode=?`)
      .run(customer, mach, itm, req.session.username, notes||null, bc);
  } else {
    db.prepare(`INSERT INTO toners (barcode,issued_to,machine,item,status,issued_by,notes) VALUES (?,?,?,?,'OUT',?,?)`)
      .run(bc, customer, mach, itm, req.session.username, notes||null);
  }
  db.prepare('INSERT OR IGNORE INTO customers (name) VALUES (?)').run(customer);
  res.json({ success: true, message: `Toner ${bc} issued to ${customer}` });
});

// ─── Return (IN) ──────────────────────────────────────────────────────────────
app.post('/api/return', requireAuth, (req, res) => {
  const { barcode, returned_by, notes } = req.body;
  if (!barcode || !returned_by) return res.status(400).json({ error: 'Barcode and returned-by are required' });
  const bc = barcode.trim();
  const record = db.prepare('SELECT * FROM toners WHERE barcode = ?').get(bc);

  if (!record) {
    db.prepare(`INSERT INTO mismatch_logs (barcode, action_type, message, performed_by) VALUES (?, 'IN', ?, ?)`)
      .run(bc, 'Barcode not found in system', req.session.username);
    return res.status(404).json({ error: `Barcode "${bc}" not found.` });
  }
  if (record.status === 'IN') {
    db.prepare(`INSERT INTO mismatch_logs (barcode, action_type, message, performed_by) VALUES (?, 'IN', ?, ?)`)
      .run(bc, `Duplicate return — already returned on ${new Date(record.return_date).toLocaleDateString()}`, req.session.username);
    return res.status(409).json({ error: `Already returned by "${record.returned_by}"` });
  }

  db.prepare(`UPDATE toners SET status='IN',return_date=CURRENT_TIMESTAMP,returned_by=?,notes=? WHERE barcode=?`)
    .run(returned_by.trim(), notes||record.notes, bc);
  const updated = db.prepare('SELECT * FROM toners WHERE barcode = ?').get(bc);
  res.json({ success: true, message: `Toner ${bc} returned`, record: updated });
});

// ─── Stats / Records / Mismatches / Report ───────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
  res.json({
    total: db.prepare('SELECT COUNT(*) as c FROM toners').get().c,
    out: db.prepare("SELECT COUNT(*) as c FROM toners WHERE status='OUT'").get().c,
    in: db.prepare("SELECT COUNT(*) as c FROM toners WHERE status='IN'").get().c,
    mismatches: db.prepare('SELECT COUNT(*) as c FROM mismatch_logs').get().c,
  });
});

app.get('/api/records', requireAuth, (req, res) => {
  const { filter, search, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page)-1)*parseInt(limit);
  let where = '1=1'; const params = [];
  if (filter === 'out') where += " AND status='OUT'";
  else if (filter === 'in') where += " AND status='IN'";
  if (search?.trim()) {
    where += ' AND (barcode LIKE ? OR issued_to LIKE ? OR machine LIKE ? OR item LIKE ? OR returned_by LIKE ?)';
    const s = `%${search.trim()}%`;
    params.push(s,s,s,s,s);
  }
  const total = db.prepare(`SELECT COUNT(*) as c FROM toners WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM toners WHERE ${where} ORDER BY issue_date DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  res.json({ total, rows });
});

app.get('/api/mismatches', requireAuth, (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page)-1)*parseInt(limit);
  let where = '1=1'; const params = [];
  if (search?.trim()) { where += ' AND (barcode LIKE ? OR message LIKE ?)'; const s = `%${search.trim()}%`; params.push(s,s); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM mismatch_logs WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM mismatch_logs WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  res.json({ total, rows });
});

app.get('/api/report', requireAuth, (req, res) => {
  const { filter, search } = req.query;
  let where = '1=1'; const params = [];
  if (filter === 'out') where += " AND status='OUT'";
  else if (filter === 'in') where += " AND status='IN'";
  if (search?.trim()) {
    where += ' AND (barcode LIKE ? OR issued_to LIKE ? OR machine LIKE ? OR item LIKE ?)';
    const s = `%${search.trim()}%`; params.push(s,s,s,s);
  }
  const rows = db.prepare(`SELECT * FROM toners WHERE ${where} ORDER BY issue_date DESC`).all(...params);
  res.json({ rows, generatedAt: new Date().toISOString(), generatedBy: req.session.username });
});

// ─── Page Routes ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => res.redirect('/login.html'));
app.get('*', (req, res) => {
  if (req.path.match(/\.(html|js|css|ico|png)$/)) return res.sendFile(path.join(__dirname, 'public', path.basename(req.path)));
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`\n🚀 Toner Tracker running at http://localhost:${PORT}`);
  console.log(`   Login: admin / admin123\n`);
});
