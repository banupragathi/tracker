'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let currentFilter = 'all';
let currentPage = 1;
let currentAuditPage = 1;
let searchTimer = null;
let auditSearchTimer = null;
let cameraTarget = null;
let codeReader = null;
let barcodeDebounce = null;

// Cached data
let allItems = [];         // populated on init
let selectedCustomerId = null; // for issue form

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    document.getElementById('userLabel').textContent = data.username;
    document.getElementById('userAvatar').textContent = data.username[0].toUpperCase();
  } catch { window.location.href = '/login.html'; return; }

  updateClock();
  setInterval(updateClock, 1000);

  document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.panel));
  });

  // Pre-load all items for the dropdown
  try {
    const r = await fetch('/api/items');
    allItems = await r.json();
    populateItemDropdown('issue-item-select', allItems);
  } catch(e) {}

  loadDashboard();
});

function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
const PANEL_TITLES = {
  dashboard: 'Dashboard',
  issue: 'Issue Toner (OUT)',
  return: 'Return Toner (IN)',
  records: 'All Records',
  audit: 'Audit Logs'
};

function navigate(panel) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`.nav-item[data-panel="${panel}"]`).classList.add('active');
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${panel}`).classList.add('active');
  document.getElementById('pageTitle').textContent = PANEL_TITLES[panel];
  closeCamera();
  if (panel === 'dashboard') loadDashboard();
  if (panel === 'records') { currentPage = 1; loadRecords(); }
  if (panel === 'audit') { currentAuditPage = 1; loadAudit(); }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [statsRes, recRes] = await Promise.all([
      fetch('/api/stats'),
      fetch('/api/records?limit=15&page=1')
    ]);
    const stats = await statsRes.json();
    const rec = await recRes.json();
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-out').textContent = stats.out;
    document.getElementById('stat-in').textContent = stats.in;
    document.getElementById('stat-mis').textContent = stats.mismatches;
    renderDashTable(rec.rows);
  } catch { showToast('Failed to load dashboard', 'error'); }
}

function renderDashTable(rows) {
  const tbody = document.getElementById('dashTableBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="icon">📭</div>No records yet</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="mono-cell" style="font-weight:600">${esc(r.barcode)}</td>
      <td>${esc(r.issued_to)}</td>
      <td class="mono-cell truncate-cell" title="${esc(r.machine||'')}">${r.machine ? esc(r.machine) : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="truncate-cell" style="font-size:12px" title="${esc(r.item||'')}">${r.item ? esc(r.item) : '<span style="color:var(--muted)">—</span>'}</td>
      <td><span class="status-pill ${r.status === 'OUT' ? 'pill-out' : 'pill-in'}">${r.status}</span></td>
      <td>${fmtDate(r.issue_date)}</td>
    </tr>
  `).join('');
}

// ─── Barcode Lookup ───────────────────────────────────────────────────────────
function onIssueBarcodeInput() {
  clearTimeout(barcodeDebounce);
  const val = document.getElementById('issue-barcode').value.trim();
  if (val.length < 2) return;
  barcodeDebounce = setTimeout(() => lookupBarcode(val, 'issue'), 400);
}

function onReturnBarcodeInput() {
  clearTimeout(barcodeDebounce);
  const val = document.getElementById('return-barcode').value.trim();
  if (val.length < 2) return;
  barcodeDebounce = setTimeout(() => lookupBarcode(val, 'return'), 400);
}

async function lookupBarcode(barcode, mode) {
  try {
    const res = await fetch(`/api/barcode/${encodeURIComponent(barcode)}`);
    const data = await res.json();

    if (mode === 'issue') {
      const status = document.getElementById('issue-scan-status');
      if (data.found) {
        if (data.record.status === 'OUT') {
          setScanStatus('issue-scan-status', `⚠ Already OUT — issued to "${data.record.issued_to}" on ${fmtDate(data.record.issue_date)}`, 'error');
        } else {
          setScanStatus('issue-scan-status', `✓ Previously returned — ready to re-issue to same or new customer`, 'success');
          // Pre-fill customer
          if (data.record.issued_to) {
            document.getElementById('issue-customer').value = data.record.issued_to;
            await onIssueCustomerInputForValue(data.record.issued_to);
          }
        }
      } else {
        setScanStatus('issue-scan-status', `ℹ New barcode — fill in customer, machine and item below`, 'info');
      }
    }

    if (mode === 'return') {
      if (data.found) {
        if (data.record.status === 'IN') {
          setScanStatus('return-scan-status', `⚠ Already returned by "${data.record.returned_by}" on ${fmtDate(data.record.return_date)}`, 'error');
          hideReturnDetail();
        } else {
          setScanStatus('return-scan-status', `✓ Found — issued to "${data.record.issued_to}" on ${fmtDate(data.record.issue_date)}`, 'success');
          showReturnDetail(data.record);
        }
      } else {
        setScanStatus('return-scan-status', `✗ Barcode not found in system`, 'error');
        hideReturnDetail();
      }
    }
  } catch(e) {}
}

function showReturnDetail(record) {
  document.getElementById('rd-customer').textContent = record.issued_to || '—';
  document.getElementById('rd-machine').textContent = record.machine || '—';
  document.getElementById('rd-item').textContent = record.item || '—';
  document.getElementById('rd-date').textContent = fmtDate(record.issue_date);
  document.getElementById('return-detail').classList.add('show');
}
function hideReturnDetail() {
  document.getElementById('return-detail').classList.remove('show');
}

// ─── Issue: Customer Autocomplete with ID tracking ────────────────────────────
let issueCustomerTimer = null;
async function onIssueCustomerInput() {
  const val = document.getElementById('issue-customer').value.trim();
  clearTimeout(issueCustomerTimer);

  // If cleared, reset machine
  if (!val) {
    selectedCustomerId = null;
    document.getElementById('issue-customer').dataset.cid = '';
    resetMachineDropdown('— Select customer first —');
    document.getElementById('issue-cust-info').classList.remove('show');
    closeAC('issue-customer-ac', 0);
    return;
  }

  issueCustomerTimer = setTimeout(async () => {
    try {
      const r = await fetch(`/api/customers?q=${encodeURIComponent(val)}`);
      const customers = await r.json();
      const list = document.getElementById('issue-customer-ac');
      if (!customers.length) {
        list.innerHTML = `<div class="ac-item ac-no-result">No customers found for "${esc(val)}"</div>`;
        list.classList.add('open');
        return;
      }
      list.innerHTML = customers.map(c => `
        <div class="ac-item" onmousedown="selectIssueCustomer(${c.id}, '${esc(c.name).replace(/'/g,"\\'")}', '${c.customer_code||''}')">
          <span class="ac-main">${esc(c.name)}</span>
          ${c.customer_code ? `<span class="ac-sub">${esc(c.customer_code)}</span>` : ''}
        </div>
      `).join('');
      list.classList.add('open');
    } catch(e) {}
  }, 250);
}

async function onIssueCustomerInputForValue(name) {
  try {
    const r = await fetch(`/api/customers?q=${encodeURIComponent(name)}`);
    const customers = await r.json();
    const match = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (match) await selectIssueCustomer(match.id, match.name, match.customer_code || '');
  } catch(e) {}
}

async function selectIssueCustomer(id, name, code) {
  document.getElementById('issue-customer').value = name;
  document.getElementById('issue-customer').dataset.cid = id;
  selectedCustomerId = id;
  closeAC('issue-customer-ac', 0);

  // Load machines for this customer
  try {
    const r = await fetch(`/api/machines?customer_id=${id}`);
    const machines = await r.json();

    const sel = document.getElementById('issue-machine');
    const infoEl = document.getElementById('issue-cust-info');

    if (!machines.length) {
      sel.innerHTML = '<option value="">— No machines registered —</option>';
      sel.disabled = true;
      infoEl.textContent = `ℹ ${name} has no registered machines. You can still issue.`;
      infoEl.classList.add('show');
    } else {
      sel.innerHTML = `<option value="">— Select machine (${machines.length}) —</option>` +
        machines.map(m => `<option value="${esc(m.machine_id)} (${esc(m.model_code)})" data-id="${m.id}">${esc(m.machine_id)} — ${esc(m.model_code)}</option>`).join('');
      sel.disabled = false;
      infoEl.textContent = `✓ ${machines.length} machine${machines.length !== 1 ? 's' : ''} registered for ${name}`;
      infoEl.classList.add('show');
      infoEl.style.color = 'var(--green)';
    }
  } catch(e) {
    resetMachineDropdown('— Error loading machines —');
  }
}

function resetMachineDropdown(placeholder) {
  const sel = document.getElementById('issue-machine');
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  sel.disabled = true;
  document.getElementById('issue-machine-info').classList.remove('show');
}

function onIssueMachineChange() {
  const sel = document.getElementById('issue-machine');
  const info = document.getElementById('issue-machine-info');
  if (sel.value) {
    info.textContent = `Selected: ${sel.value}`;
    info.classList.add('show');
  } else {
    info.classList.remove('show');
  }
}

// ─── Items Dropdown ───────────────────────────────────────────────────────────
function populateItemDropdown(selectId, items) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">— Select from list —</option>' +
    items.map(i => `<option value="${esc(i.item_code)} — ${esc(i.description)}">${esc(i.item_code)} — ${esc(i.description)}</option>`).join('');
}

function onIssueItemSelect() {
  const val = document.getElementById('issue-item-select').value;
  if (val) {
    document.getElementById('issue-item-manual').value = '';
    document.getElementById('issue-item-manual').placeholder = 'Dropdown selected (clear to type manually)';
  } else {
    document.getElementById('issue-item-manual').placeholder = 'Custom item / code…';
  }
}

function getIssueItem() {
  const fromSelect = document.getElementById('issue-item-select').value;
  const fromManual = document.getElementById('issue-item-manual').value.trim();
  return fromManual || fromSelect || null;
}

// ─── Generic Customer Autocomplete (for return "returned by") ─────────────────
let acCache = {};
async function onCustomerInput(inputId, listId) {
  const val = document.getElementById(inputId).value.trim();
  if (!val) { closeAC(listId, 0); return; }
  const key = val.toLowerCase();
  let results = acCache[key];
  if (!results) {
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(val)}`);
      results = await res.json();
      acCache[key] = results;
    } catch { return; }
  }
  const list = document.getElementById(listId);
  if (!results.length) { list.classList.remove('open'); return; }
  list.innerHTML = results.map(c =>
    `<div class="ac-item" onmousedown="selectCustomer('${inputId}','${listId}','${c.name.replace(/'/g, "\\'")}')">
      <span class="ac-main">${esc(c.name)}</span>
      ${c.customer_code ? `<span class="ac-sub">${esc(c.customer_code)}</span>` : ''}
    </div>`
  ).join('');
  list.classList.add('open');
}

function selectCustomer(inputId, listId, val) {
  document.getElementById(inputId).value = val;
  closeAC(listId, 0);
}

function closeAC(listId, delay) {
  setTimeout(() => {
    const el = document.getElementById(listId);
    if (el) el.classList.remove('open');
  }, delay);
}

// ─── Submit Issue ─────────────────────────────────────────────────────────────
async function submitIssue() {
  const barcode = document.getElementById('issue-barcode').value.trim();
  const issued_to = document.getElementById('issue-customer').value.trim();
  const machine = document.getElementById('issue-machine').value.trim() || null;
  const item = getIssueItem();
  const notes = document.getElementById('issue-notes').value.trim();

  document.getElementById('issue-alert').style.display = 'none';
  if (!barcode) { showAlert('issue-alert', 'Barcode is required.', 'error'); return; }
  if (!issued_to) { showAlert('issue-alert', 'Customer is required.', 'error'); return; }

  try {
    const res = await fetch('/api/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode, issued_to, machine, item, notes })
    });
    const data = await res.json();
    if (res.ok) {
      showAlert('issue-alert', `✓ ${data.message}`, 'success');
      showToast(data.message, 'success');
      clearIssueForm();
    } else {
      showAlert('issue-alert', data.error, 'error');
    }
  } catch { showAlert('issue-alert', 'Network error. Please try again.', 'error'); }
}

function clearIssueForm() {
  ['issue-barcode','issue-customer','issue-notes','issue-item-manual'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('issue-item-select').selectedIndex = 0;
  document.getElementById('issue-scan-status').className = 'scan-status';
  document.getElementById('issue-cust-info').classList.remove('show');
  document.getElementById('issue-customer').dataset.cid = '';
  selectedCustomerId = null;
  resetMachineDropdown('— Select customer first —');
  acCache = {};
}

// ─── Submit Return ────────────────────────────────────────────────────────────
async function submitReturn() {
  const barcode = document.getElementById('return-barcode').value.trim();
  const returned_by = document.getElementById('return-customer').value.trim();
  const notes = document.getElementById('return-notes').value.trim();

  document.getElementById('return-alert').style.display = 'none';
  if (!barcode) { showAlert('return-alert', 'Barcode is required.', 'error'); return; }
  if (!returned_by) { showAlert('return-alert', 'Returned-by name is required.', 'error'); return; }

  try {
    const res = await fetch('/api/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode, returned_by, notes })
    });
    const data = await res.json();
    if (res.ok) {
      showAlert('return-alert', `✓ ${data.message}`, 'success');
      showToast(data.message, 'success');
      ['return-barcode','return-customer','return-notes'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('return-scan-status').className = 'scan-status';
      hideReturnDetail();
      acCache = {};
    } else {
      showAlert('return-alert', data.error, 'error');
    }
  } catch { showAlert('return-alert', 'Network error. Please try again.', 'error'); }
}

// ─── Records ──────────────────────────────────────────────────────────────────
async function loadRecords() {
  const search = document.getElementById('recordSearch').value.trim();
  try {
    const res = await fetch(`/api/records?filter=${currentFilter}&search=${encodeURIComponent(search)}&page=${currentPage}&limit=50`);
    const data = await res.json();
    renderRecords(data.rows, data.total);
  } catch { showToast('Failed to load records', 'error'); }
}

function renderRecords(rows, total) {
  const tbody = document.getElementById('recordsBody');
  const totalPages = Math.ceil(total / 50) || 1;
  document.getElementById('pgInfo').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('pgTotal').textContent = `${total} total records`;
  document.getElementById('pgPrev').disabled = currentPage <= 1;
  document.getElementById('pgNext').disabled = currentPage >= totalPages;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="icon">📭</div>No records found</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td style="color:var(--muted)">${(currentPage-1)*50 + i + 1}</td>
      <td class="mono-cell" style="font-weight:600">${esc(r.barcode)}</td>
      <td>${esc(r.issued_to)}</td>
      <td class="mono-cell truncate-cell" style="max-width:140px" title="${esc(r.machine||'')}">${r.machine ? esc(r.machine) : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="truncate-cell" style="font-size:12px;max-width:160px" title="${esc(r.item||'')}">${r.item ? esc(r.item) : '<span style="color:var(--muted)">—</span>'}</td>
      <td><span class="status-pill ${r.status === 'OUT' ? 'pill-out' : 'pill-in'}">${r.status}</span></td>
      <td>${fmtDate(r.issue_date)}</td>
      <td>${r.return_date ? fmtDate(r.return_date) : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${r.returned_by ? esc(r.returned_by) : '<span style="color:var(--muted)">—</span>'}</td>
    </tr>
  `).join('');
}

function setFilter(f, el) {
  currentFilter = f;
  currentPage = 1;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadRecords();
}

function changePage(dir) { currentPage += dir; loadRecords(); }
function debounceSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { currentPage = 1; loadRecords(); }, 350); }

// ─── Audit ────────────────────────────────────────────────────────────────────
async function loadAudit() {
  const search = document.getElementById('auditSearch').value.trim();
  try {
    const res = await fetch(`/api/mismatches?search=${encodeURIComponent(search)}&page=${currentAuditPage}&limit=50`);
    const data = await res.json();
    renderAudit(data.rows, data.total);
  } catch { showToast('Failed to load audit logs', 'error'); }
}

function renderAudit(rows, total) {
  const tbody = document.getElementById('auditBody');
  const totalPages = Math.ceil(total / 50) || 1;
  document.getElementById('auditPgInfo').textContent = `Page ${currentAuditPage} of ${totalPages}`;
  document.getElementById('auditPgTotal').textContent = `${total} total events`;
  document.getElementById('auditPgPrev').disabled = currentAuditPage <= 1;
  document.getElementById('auditPgNext').disabled = currentAuditPage >= totalPages;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="icon">✅</div>No audit events — clean record!</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td style="color:var(--muted)">${(currentAuditPage-1)*50 + i + 1}</td>
      <td class="mono-cell" style="font-weight:600">${esc(r.barcode)}</td>
      <td><span class="status-pill pill-err">${esc(r.action_type)}</span></td>
      <td style="max-width:320px;white-space:normal;font-size:12px">${esc(r.message)}</td>
      <td>${esc(r.performed_by || '—')}</td>
      <td>${fmtDate(r.timestamp)}</td>
    </tr>
  `).join('');
}

function changeAuditPage(dir) { currentAuditPage += dir; loadAudit(); }
function debounceAuditSearch() { clearTimeout(auditSearchTimer); auditSearchTimer = setTimeout(() => { currentAuditPage = 1; loadAudit(); }, 350); }

// ─── Camera ───────────────────────────────────────────────────────────────────
function openCamera(mode) {
  cameraTarget = mode;
  document.getElementById('cameraModal').classList.add('open');
  startCamera();
}

function closeCamera() {
  document.getElementById('cameraModal').classList.remove('open');
  if (codeReader) { try { codeReader.reset(); } catch {} codeReader = null; }
}

function startCamera() {
  if (typeof ZXing === 'undefined') { showToast('Scanner library not loaded. Use manual entry.', 'error'); closeCamera(); return; }
  codeReader = new ZXing.BrowserMultiFormatReader();
  codeReader.decodeFromVideoDevice(null, 'cameraFeed', (result, err) => {
    if (result) {
      const barcode = result.getText();
      closeCamera();
      if (cameraTarget === 'issue') {
        document.getElementById('issue-barcode').value = barcode;
        setScanStatus('issue-scan-status', `✓ Scanned: ${barcode}`, 'success');
        lookupBarcode(barcode, 'issue');
      } else {
        document.getElementById('return-barcode').value = barcode;
        setScanStatus('return-scan-status', `✓ Scanned: ${barcode}`, 'success');
        lookupBarcode(barcode, 'return');
      }
      showToast(`Scanned: ${barcode}`, 'success');
    }
  });
}

function setScanStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.className = `scan-status ${type}`;
  el.textContent = msg;
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
async function exportPDF() {
  const search = document.getElementById('recordSearch').value.trim();
  const filter = currentFilter === 'all' ? '' : currentFilter;
  try {
    const res = await fetch(`/api/report?filter=${filter}&search=${encodeURIComponent(search)}`);
    const data = await res.json();
    generatePDF(data.rows, data.generatedAt, data.generatedBy);
  } catch { showToast('Failed to generate PDF', 'error'); }
}

async function exportAuditPDF() {
  const search = document.getElementById('auditSearch').value.trim();
  try {
    const res = await fetch(`/api/mismatches?search=${encodeURIComponent(search)}&limit=10000`);
    const data = await res.json();
    generateAuditPDF(data.rows);
  } catch { showToast('Failed to generate PDF', 'error'); }
}

function generatePDF(rows, generatedAt, generatedBy) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(13, 13, 13);
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Toner Tracking Report — Customer / Machine / Item', 14, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString('en-IN')}   |   By: ${generatedBy}   |   Records: ${rows.length}`, 14, 21);

  const body = rows.map((r, i) => [
    i + 1,
    r.barcode,
    r.issued_to,
    r.machine || '—',
    r.item || '—',
    r.status,
    fmtDate(r.issue_date),
    r.return_date ? fmtDate(r.return_date) : '—',
    r.returned_by || '—',
  ]);

  doc.autoTable({
    startY: 28,
    head: [['#', 'Barcode', 'Customer', 'Machine', 'Item', 'Status', 'Issue Date', 'Return Date', 'Returned By']],
    body,
    styles: { fontSize: 7.5, cellPadding: 3, font: 'helvetica', overflow: 'ellipsize' },
    headStyles: { fillColor: [232, 80, 10], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 241, 235] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 24, fontStyle: 'bold' },
      2: { cellWidth: 38 },
      3: { cellWidth: 32 },
      4: { cellWidth: 50 },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 26 },
      7: { cellWidth: 26 },
      8: { cellWidth: 32 },
    },
    didDrawCell(data) {
      if (data.section === 'body' && data.column.index === 5) {
        const status = data.cell.raw;
        if (status === 'OUT') doc.setTextColor(232, 80, 10);
        else doc.setTextColor(26, 155, 90);
      }
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount} — TonerTrack v2.0`, 14, doc.internal.pageSize.height - 6);
  }

  doc.save(`toner-report-${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('PDF downloaded!', 'success');
}

function generateAuditPDF(rows) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFillColor(13, 13, 13);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('Toner Tracker — Audit Log Report', 14, 14);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}   |   Total: ${rows.length} events`, 14, 19);
  doc.autoTable({
    startY: 26,
    head: [['#', 'Barcode', 'Action', 'Message', 'Performed By', 'Timestamp']],
    body: rows.map((r,i) => [i+1, r.barcode, r.action_type, r.message, r.performed_by||'—', fmtDate(r.timestamp)]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [180,83,9], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255,248,240] },
    columnStyles: { 0:{cellWidth:10,halign:'center'}, 1:{cellWidth:30}, 2:{cellWidth:16,halign:'center'}, 3:{cellWidth:100} }
  });
  doc.save(`audit-log-${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('Audit PDF downloaded!', 'success');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return dt; }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.className = `alert-msg ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { if (el.textContent === msg) el.style.display = 'none'; }, 7000);
}

function showToast(msg, type = 'info') {
  const toaster = document.getElementById('toaster');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  toaster.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}
