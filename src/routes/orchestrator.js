import express from 'express';
import { OrchestratorService, verifyAuditChain } from '../services/orchestratorService.js';

const COOKIE_NAME = 'mes_orch_session';

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[COOKIE_NAME] || req.headers['x-orch-session'] || '';
}

function requireOrchAuth(req, res, next) {
  const token = getSessionToken(req);
  if (!OrchestratorService.validateSession(token)) {
    return res.status(404).send('Not Found');
  }
  req.orchToken = token;
  next();
}

const ORCH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>System</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f1115; color: #e6e8ec; margin: 0; padding: 24px; }
    .card { background: #171a21; border: 1px solid #262b36; border-radius: 8px; padding: 20px; max-width: 1100px; margin: 0 auto 16px; }
    h1, h2 { margin-top: 0; font-weight: 500; }
    input, button { padding: 8px 12px; border-radius: 6px; border: 1px solid #303746; background: #0f1115; color: #e6e8ec; font-size: 14px; }
    button { background: #2563eb; border-color: #2563eb; cursor: pointer; font-weight: 500; }
    button.danger { background: #dc2626; border-color: #dc2626; }
    button.secondary { background: #262b36; border-color: #3a4254; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #262b36; }
    .badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #262b36; }
    .ok { color: #4ade80; } .err { color: #f87171; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div id="login-box" class="card" style="max-width:420px;margin-top:60px;">
    <h2>Access</h2>
    <form id="login-form">
      <div class="row"><input id="accessKey" type="password" placeholder="Access Key" required style="width:100%" /></div>
      <div class="row"><input id="password" type="password" placeholder="Password" required style="width:100%" /></div>
      <div class="row"><input id="totpCode" type="text" placeholder="6-digit TOTP (or leave blank for backup)" style="width:100%" /></div>
      <div class="row"><input id="backupCode" type="text" placeholder="Backup Code (optional)" style="width:100%" /></div>
      <div class="row"><button type="submit" style="width:100%">Authenticate</button></div>
      <div id="login-msg" class="err"></div>
    </form>
  </div>

  <div id="dash-box" class="hidden">
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <h1>Orchestrator Console</h1>
        <div class="row">
          <button class="secondary" id="btn-verify">Verify HMAC Chain</button>
          <button class="secondary" id="btn-export">Signed Export</button>
          <button class="danger" id="btn-logout">Logout</button>
        </div>
      </div>
      <div id="chain-status"></div>
    </div>

    <div class="card">
      <h2>Orders &amp; Tombstones</h2>
      <table>
        <thead><tr><th>Order</th><th>Buyer</th><th>PO</th><th>Qty</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="orders-body"></tbody>
      </table>
    </div>

    <div class="card">
      <h2>Alerts</h2>
      <table>
        <thead><tr><th>Time</th><th>Severity</th><th>Category</th><th>Message</th></tr></thead>
        <tbody id="alerts-body"></tbody>
      </table>
    </div>

    <div class="card">
      <h2>Sealed Audit Chain (Latest 50)</h2>
      <table>
        <thead><tr><th>Seq</th><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Hash</th></tr></thead>
        <tbody id="audit-body"></tbody>
      </table>
    </div>
  </div>

  <script>
    const base = window.location.pathname.replace(/\\/$/, '');
    async function api(path, opts = {}) {
      const res = await fetch(base + path, {
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    async function loadOverview() {
      const data = await api('/overview');
      document.getElementById('login-box').classList.add('hidden');
      document.getElementById('dash-box').classList.remove('hidden');
      const cs = data.chainStatus;
      document.getElementById('chain-status').innerHTML = cs.ok
        ? '<span class="ok">HMAC Chain Valid (' + cs.count + ' entries)</span>'
        : '<span class="err">TAMPER ALERT at seq ' + cs.brokenAtSeq + ': ' + cs.reason + '</span>';

      document.getElementById('orders-body').innerHTML = data.recentOrders.map(o =>
        '<tr><td>' + o.order_id + '</td><td>' + o.buyer_name + '</td><td>' + o.po_number + '</td><td>' + o.total_qty + '</td>' +
        '<td>' + (o.deleted_at ? '<span class="err">SOFT-DELETED</span>' : '<span class="ok">ACTIVE</span>') + '</td>' +
        '<td>' + (o.deleted_at
          ? '<button class="secondary" onclick="restoreOrder(\\'' + o.order_id + '\\')">Restore</button>'
          : '<button class="danger" onclick="softDeleteOrder(\\'' + o.order_id + '\\')">Soft Delete</button>') +
        '</td></tr>'
      ).join('');

      document.getElementById('alerts-body').innerHTML = data.alerts.map(a =>
        '<tr><td>' + a.ts + '</td><td>' + a.severity + '</td><td>' + a.category + '</td><td>' + a.message + '</td></tr>'
      ).join('');

      document.getElementById('audit-body').innerHTML = data.auditTail.map(r =>
        '<tr><td>' + r.seq + '</td><td>' + r.ts + '</td><td>' + r.actor + '</td><td>' + r.action + '</td><td>' + r.target_id + '</td><td><code>' + r.hmac_hash.slice(0, 12) + '...</code></td></tr>'
      ).join('');
    }

    window.softDeleteOrder = async (orderId) => {
      const password = prompt('Re-enter Orchestrator password to soft-delete ' + orderId + ':');
      if (!password) return;
      const reason = prompt('Reason:') || 'Orchestrator cleanup';
      await api('/orders/' + encodeURIComponent(orderId) + '/soft-delete', {
        method: 'POST',
        body: JSON.stringify({ password, reason })
      });
      loadOverview();
    };

    window.restoreOrder = async (orderId) => {
      const password = prompt('Re-enter Orchestrator password to restore ' + orderId + ':');
      if (!password) return;
      await api('/orders/' + encodeURIComponent(orderId) + '/restore', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      loadOverview();
    };

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('login-msg').textContent = '';
      try {
        await api('/login', {
          method: 'POST',
          body: JSON.stringify({
            accessKey: document.getElementById('accessKey').value,
            password: document.getElementById('password').value,
            totpCode: document.getElementById('totpCode').value,
            backupCode: document.getElementById('backupCode').value
          })
        });
        await loadOverview();
      } catch (err) {
        document.getElementById('login-msg').textContent = 'Authentication failed';
      }
    });

    document.getElementById('btn-verify').addEventListener('click', async () => {
      const res = await api('/verify');
      alert(res.ok ? 'Chain OK (' + res.count + ' entries)' : 'BROKEN at seq ' + res.brokenAtSeq);
    });

    document.getElementById('btn-export').addEventListener('click', () => {
      window.open(base + '/export', '_blank');
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
      await api('/logout', { method: 'POST' });
      location.reload();
    });

    loadOverview().catch(() => {});
  </script>
</body>
</html>`;

export function createOrchestratorRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    if (!OrchestratorService.isConfigured()) {
      return res.status(404).send('Not Found');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(ORCH_HTML);
  });

  router.post('/login', async (req, res) => {
    try {
      const accessKey = req.body?.accessKey || req.headers['x-orch-key'] || '';
      const password = req.body?.password || '';
      const totpCode = req.body?.totpCode || '';
      const backupCode = req.body?.backupCode || '';
      const result = await OrchestratorService.login({
        accessKey,
        password,
        totpCode,
        backupCode,
        ip: req.ip || ''
      });
      if (!result.ok) {
        return res.status(401).json({ error: 'Authentication failed' });
      }
      res.cookie(COOKIE_NAME, result.token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000
      });
      return res.json({ ok: true, expiresAt: result.expiresAt });
    } catch {
      return res.status(404).send('Not Found');
    }
  });

  router.post('/logout', requireOrchAuth, (req, res) => {
    OrchestratorService.logout(req.orchToken);
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  router.get('/overview', requireOrchAuth, (req, res) => {
    res.json(OrchestratorService.getSilentOverview());
  });

  router.get('/verify', requireOrchAuth, (req, res) => {
    res.json(verifyAuditChain());
  });

  router.post('/orders/:orderId/soft-delete', requireOrchAuth, (req, res) => {
    try {
      const { password, reason } = req.body || {};
      res.json(OrchestratorService.softDeleteOrder(req.params.orderId, reason, password));
    } catch (err) {
      res.status(err.statusCode || 400).json({ error: err.message });
    }
  });

  router.post('/orders/:orderId/restore', requireOrchAuth, (req, res) => {
    try {
      const { password } = req.body || {};
      res.json(OrchestratorService.restoreOrder(req.params.orderId, password));
    } catch (err) {
      res.status(err.statusCode || 400).json({ error: err.message });
    }
  });

  router.post('/super-users/:userId/toggle', requireOrchAuth, (req, res) => {
    try {
      const { active, password } = req.body || {};
      res.json(OrchestratorService.toggleSuperUser(req.params.userId, Boolean(active), password));
    } catch (err) {
      res.status(err.statusCode || 400).json({ error: err.message });
    }
  });

  router.get('/export', requireOrchAuth, (req, res) => {
    const payload = OrchestratorService.exportSignedHistory();
    res.setHeader('Content-Disposition', 'attachment; filename="orchestrator-signed-history.json"');
    res.json(payload);
  });

  return router;
}
