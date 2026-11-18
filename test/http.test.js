import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { app } from '../src/server.js';
import { db, seedDemoSheet } from '../src/db.js';
import { AuthService } from '../src/services/authService.js';

describe('HTTP Endpoints & UI Static Files Test Suite', () => {
  let server;
  let baseUrl;
  let adminCookie;
  let inwardCookie;
  let adminUsername;
  let adminPassword;
  let adminUserId;
  let packingCookie;
  const testUserIds = [];
  const testTokens = [];

  before(async () => {
    seedDemoSheet();
    const suffix = randomUUID();
    adminUsername = `http-admin-${suffix}`;
    adminPassword = `Test-${suffix}-Password`;
    const admin = AuthService.createUser({
      name: 'HTTP Test Administrator',
      username: adminUsername,
      password: adminPassword,
      role: 'SUPER_USER',
      station: 'Test'
    });
    const adminSession = AuthService.createSession(admin.userId);
    adminUserId = admin.userId;
    adminCookie = `mes_session=${adminSession.token}`;
    testUserIds.push(admin.userId);
    testTokens.push(adminSession.token);

    const inward = AuthService.createUser({
      name: 'HTTP Test Inward',
      username: `http-inward-${suffix}`,
      password: `Test-${suffix}-Password`,
      role: 'INWARD_CLERK',
      station: 'Test'
    });
    const inwardSession = AuthService.createSession(inward.userId);
    inwardCookie = `mes_session=${inwardSession.token}`;
    testUserIds.push(inward.userId);
    testTokens.push(inwardSession.token);

    const packingSupervisor = AuthService.createUser({
      name: 'HTTP Test Packing Supervisor',
      username: `http-pack-${suffix}`,
      password: `Test-${suffix}-Password`,
      role: 'PACKING_SUPERVISOR',
      station: 'Packing Hall'
    });
    const packingSession = AuthService.createSession(packingSupervisor.userId);
    packingCookie = `mes_session=${packingSession.token}`;
    testUserIds.push(packingSupervisor.userId);
    testTokens.push(packingSession.token);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    testTokens.forEach(token => AuthService.destroySession(token));
    testUserIds.forEach(userId => AuthService.deleteUser(userId));
  });

  function apiFetch(url, options = {}, cookie = adminCookie) {
    return fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Cookie: cookie }
    });
  }

  test('Static Files: Hub index.html loads successfully', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Gloves Packing Execution System'));
    assert.ok(html.includes('store.html'));
    assert.ok(html.includes('packing.html'));
  });

  test('Static Files: Store Keeper Portal store.html loads successfully', async () => {
    const res = await fetch(`${baseUrl}/store.html`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Store Keeper Portal'));
    assert.ok(html.includes('Glove Store'));
    assert.ok(html.includes('Packing Materials Store'));
  });

  test('Static Files: Packing Hall Portal packing.html loads successfully', async () => {
    const res = await fetch(`${baseUrl}/packing.html`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Packing Hall Portal'));
    assert.ok(html.includes('Checking / Inspection'));
    assert.ok(html.includes('Ironing & Brushing'));
    assert.ok(html.includes('Pair Matching'));
    assert.ok(html.includes('1st Packing'));
    assert.ok(html.includes('2nd Packing'));
  });

  test('API authentication: rejects anonymous requests and denies cross-station admin access', async () => {
    const anonymous = await fetch(`${baseUrl}/api/store/dropdowns`);
    assert.equal(anonymous.status, 401);

    const inwardAdmin = await apiFetch(`${baseUrl}/api/admin/overview`, {}, inwardCookie);
    assert.equal(inwardAdmin.status, 403);

    const adminUsers = await apiFetch(`${baseUrl}/api/admin/users`);
    assert.equal(adminUsers.status, 200);
    const usersJson = await adminUsers.json();
    assert.equal(usersJson.success, true);
    assert.ok(usersJson.data.every(user => !Object.hasOwn(user, 'password_hash')));
  });

  test('API authentication: login creates an HTTP-only session and initial setup cannot be repeated', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPassword })
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie') || '', /HttpOnly/);

    const bootstrap = await fetch(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Second Administrator',
        username: `second-${randomUUID().slice(0, 20)}`,
        password: 'Another-Secure-Password'
      })
    });
    assert.equal(bootstrap.status, 409);
  });

  test('API authentication: Super User password updates re-hash passwords and revoke existing sessions', async () => {
    const suffix = randomUUID();
    const username = `pw-${suffix}`;
    const oldPassword = `Old-${suffix}-Password`;
    const user = AuthService.createUser({
      name: 'Password Reset Test User',
      username,
      password: oldPassword,
      role: 'INWARD_CLERK',
      station: 'Test'
    });
    const session = AuthService.createSession(user.userId);
    testUserIds.push(user.userId);
    testTokens.push(session.token);
    const endpoint = `${baseUrl}/api/admin/users/${encodeURIComponent(user.userId)}/password`;

    const denied = await apiFetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'New-Secure-Password' })
    }, inwardCookie);
    assert.equal(denied.status, 403);

    const invalid = await apiFetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'short' })
    });
    assert.equal(invalid.status, 400);
    assert.ok(AuthService.verifyCredentials(username, oldPassword));

    const updated = await apiFetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'New-Secure-Password' })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).success, true);
    assert.equal(AuthService.verifyCredentials(username, oldPassword), null);
    assert.ok(AuthService.verifyCredentials(username, 'New-Secure-Password'));
    assert.equal(AuthService.getSessionUser(session.token), null);
  });

  test('API authentication: Super User can delete user only with valid Admin password and cannot self-delete', async () => {
    const suffix = randomUUID();
    const username = `del-${suffix}`;
    const userPassword = `Del-${suffix}-Password`;
    const targetUser = AuthService.createUser({
      name: 'Delete Target Operator',
      username,
      password: userPassword,
      role: 'INWARD_CLERK',
      station: 'Dock #1'
    });
    const targetSession = AuthService.createSession(targetUser.userId);
    testUserIds.push(targetUser.userId);
    testTokens.push(targetSession.token);

    const targetEndpoint = `${baseUrl}/api/admin/users/${encodeURIComponent(targetUser.userId)}`;

    const denied = await apiFetch(targetEndpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword })
    }, inwardCookie);
    assert.equal(denied.status, 403);

    const blankPassword = await apiFetch(targetEndpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword: '' })
    });
    assert.equal(blankPassword.status, 400);

    const wrongPassword = await apiFetch(targetEndpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword: 'Wrong-Admin-Password' })
    });
    assert.equal(wrongPassword.status, 401);
    assert.ok(AuthService.listUsers().some(u => u.userId === targetUser.userId));

    const selfDelete = await apiFetch(`${baseUrl}/api/admin/users/${encodeURIComponent(adminUserId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword })
    });
    assert.equal(selfDelete.status, 400);
    assert.ok(AuthService.listUsers().some(u => u.userId === adminUserId));

    const deleted = await apiFetch(targetEndpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword })
    });
    assert.equal(deleted.status, 200);
    const deletedJson = await deleted.json();
    assert.equal(deletedJson.success, true);
    assert.equal(deletedJson.data.deleted, true);
    assert.equal(deletedJson.data.user.userId, targetUser.userId);
    assert.equal(AuthService.getSessionUser(targetSession.token), null);
    assert.equal(AuthService.listUsers().some(u => u.userId === targetUser.userId), false);
  });

  test('API: /api/inventory/gloves returns seeded glove inventory', async () => {
    const res = await apiFetch(`${baseUrl}/api/inventory/gloves`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.length > 0);
  });

  test('API: /api/inventory/materials returns packaging accessories inventory', async () => {
    const res = await apiFetch(`${baseUrl}/api/inventory/materials`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.length >= 3);
  });

  test('API: /api/store/receivings returns seeded contractor shipment sheet', async () => {
    const res = await apiFetch(`${baseUrl}/api/store/receivings`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.length >= 18);
    const row1 = json.data.find((r) => r.rcv_number === 'RCV-2026-0001') || json.data[0];
    assert.equal(row1.customer_name, 'Globex');
    assert.equal(row1.po_number, '3326');
    assert.equal(row1.article_name, 'Model A1');
    assert.equal(row1.order_qty, 4285);
    assert.equal(row1.rcvd_pairs, 4284);
    assert.equal(row1.balance_qty, 1);
  });

  test('API: /api/store/dropdowns returns makers, customers and articles', async () => {
    const res = await apiFetch(`${baseUrl}/api/store/dropdowns`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.makers.length >= 6);
    assert.ok(json.data.customers.length >= 3);
    assert.ok(json.data.articles.length >= 10);
  });

  test('API: pending-order creation assigns server IDs and does not update existing orders', async () => {
    const requestedId = `ORD-CLIENT-${randomUUID()}`;
    const payload = {
      orderId: requestedId,
      buyer: 'HTTP Order Test',
      maker: 'HTTP Test Maker',
      po: `PO-${randomUUID()}`,
      article: 'HTTP Test Article',
      color: 'Black',
      sizes: { '7': 2, '8': 3, '9': 4, '10': 3, '11': 2 },
      totalQty: 14
    };

    const createOrder = async (orderPayload) => {
      const response = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      assert.equal(response.status, 200);
      return response.json();
    };

    const created = await createOrder(payload);
    assert.equal(created.success, true);
    assert.match(created.data.orderId, /^ORD-\d{4}-\d{3,}$/);
    assert.notEqual(created.data.orderId, requestedId);
    assert.ok(created.data.orders.some(order => order.orderId === created.data.orderId));

    const createdAgain = await createOrder({ ...payload, maker: 'Second Maker' });
    assert.notEqual(createdAgain.data.orderId, created.data.orderId);
    assert.equal(
      createdAgain.data.orders.find(order => order.orderId === created.data.orderId).maker,
      'HTTP Test Maker'
    );

    const deleteCreated = await apiFetch(`${baseUrl}/api/admin/pending-orders/${created.data.orderId}`, {
      method: 'DELETE'
    });
    assert.equal(deleteCreated.status, 200);
    const deleteCreatedAgain = await apiFetch(`${baseUrl}/api/admin/pending-orders/${createdAgain.data.orderId}`, {
      method: 'DELETE'
    });
    assert.equal(deleteCreatedAgain.status, 200);
  });

  test('API: Packing Hall can save and reload order-linked requisitions', async () => {
    const master = db.prepare(`
      SELECT c.name AS buyer, p.name AS article
      FROM customers c JOIN products p ON p.customer_id = c.id
      WHERE p.name = 'Model A9'
      LIMIT 1
    `).get();
    assert.ok(master);

    let orderId;
    let reqNumber;
    try {
      const orderResponse = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: master.buyer,
          maker: 'HTTP Packing Test',
          po: `PO-${randomUUID()}`,
          article: master.article,
          sizes: { '7': 2, '8': 3, '9': 4, '10': 3, '11': 2 },
          totalQty: 14
        })
      });
      assert.equal(orderResponse.status, 200);
      orderId = (await orderResponse.json()).data.orderId;

      const pendingOrdersResponse = await apiFetch(
        `${baseUrl}/api/admin/pending-orders`,
        {},
        packingCookie
      );
      assert.equal(pendingOrdersResponse.status, 200);
      const pendingOrders = await pendingOrdersResponse.json();
      assert.ok(pendingOrders.data.some(order => order.orderId === orderId));

      const deniedResponse = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 1 } })
      }, inwardCookie);
      assert.equal(deniedResponse.status, 403);

      const createResponse = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 2, '8': 3, '9': 4, '10': 3, '11': 2 } })
      }, packingCookie);
      assert.equal(createResponse.status, 200);
      const created = await createResponse.json();
      assert.equal(created.success, true);
      reqNumber = created.data.reqNumber;
      assert.match(reqNumber, /^REQ-\d{4}-\d{4,}$/);
      assert.equal(created.data.order_id, orderId);
      assert.deepEqual(created.data.sizes, { '7': 2, '8': 3, '9': 4, '10': 3, '11': 2 });

      const listResponse = await apiFetch(`${baseUrl}/api/requisitions`, {}, packingCookie);
      assert.equal(listResponse.status, 200);
      const listed = await listResponse.json();
      assert.ok(listed.data.some(requisition => requisition.req_number === reqNumber));

      const invalidResponse = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': -1 } })
      }, packingCookie);
      assert.equal(invalidResponse.status, 400);
    } finally {
      if (reqNumber) {
        db.prepare('DELETE FROM packing_wip WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM glove_requisitions WHERE req_number = ?').run(reqNumber);
      }
      if (orderId) db.prepare('DELETE FROM pending_orders WHERE order_id = ?').run(orderId);
    }
  });

  test('API: POST /api/store/receivings creates receiving and calculates balance', async () => {
    const res = await apiFetch(`${baseUrl}/api/store/receivings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rcvDate: '31-10-2026',
        makerContractor: 'Hall A',
        customerName: 'Northwind',
        poNumber: '27344',
        articleName: 'Model A9',
        orderQty: 1000,
        rcvdPairs: 950
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.balance_qty, 50);
  });

  test('API: Order REQ full persistence lifecycle (Inward issue -> Stages 1-3 -> M-REQ -> Stage 4 -> AQL -> Stage 5 -> Reload hydration)', async () => {
    const master = db.prepare(`
      SELECT c.name AS buyer, p.name AS article
      FROM customers c JOIN products p ON p.customer_id = c.id
      WHERE p.name = 'Model A9'
      LIMIT 1
    `).get();
    assert.ok(master);

    const qcUser = AuthService.createUser({
      name: 'HTTP Test QC Inspector',
      username: `http-qc-${randomUUID()}`,
      password: `Test-${randomUUID()}-Password`,
      role: 'QC_INSPECTOR',
      station: 'Final QC'
    });
    const qcSession = AuthService.createSession(qcUser.userId);
    const qcCookie = `mes_session=${qcSession.token}`;
    testUserIds.push(qcUser.userId);
    testTokens.push(qcSession.token);
    let orderId;
    let rcvNumber;
    let reqNumber;
    let matReqNumber;

    try {
      const orderResp = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: master.buyer,
          maker: 'Lifecycle Maker',
          po: `PO-${randomUUID()}`,
          article: master.article,
          sizes: { '7': 20, '8': 20, '9': 20, '10': 20, '11': 20 },
          totalQty: 100
        })
      });
      assert.equal(orderResp.status, 200);
      orderId = (await orderResp.json()).data.orderId;

      const grnResp = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rcvDate: '31-10-2026',
          orderId,
          makerContractor: 'Lifecycle Maker',
          customerName: master.buyer,
          poNumber: orderId,
          articleName: master.article,
          orderQty: 100,
          rcvdPairs: 100
        })
      }, inwardCookie);
      assert.equal(grnResp.status, 200);
      rcvNumber = (await grnResp.json()).data.rcv_number;

      const reqResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 20, '8': 20, '9': 20, '10': 20, '11': 20 } })
      }, packingCookie);
      assert.equal(reqResp.status, 200);
      reqNumber = (await reqResp.json()).data.reqNumber;

      // Inward clerk issues the saved requisition against order GRNs
      const issueResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/issue-req`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqNumber, requestedPairs: 100 })
      }, inwardCookie);
      assert.equal(issueResp.status, 200);
      const issued = await issueResp.json();
      assert.equal(issued.success, true);
      assert.equal(issued.data.requisition.status, 'ISSUED');
      assert.equal(issued.data.requisition.wip.step1_checking_in, 100);

      // Duplicate issuance must fail cleanly
      const dupIssueResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/issue-req`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqNumber, requestedPairs: 100 })
      }, inwardCookie);
      assert.equal(dupIssueResp.status, 400);

      // Stages 1-3 incremental progression
      const s1Resp = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step1-checking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goodPairs: 95, defectPairs: 5, defectReason: 'Stitching Skip' })
      }, packingCookie);
      assert.equal(s1Resp.status, 200);
      assert.equal((await s1Resp.json()).data.wip.step2_ironing_in, 95);

      const s2Resp = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step2-ironing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goodPairs: 92, defectPairs: 3, defectReason: 'Crease / Soil Rejects' })
      }, packingCookie);
      assert.equal(s2Resp.status, 200);
      assert.equal((await s2Resp.json()).data.wip.step3_matching_in, 92);

      const s3Resp = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step3-matching`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goodPairs: 90, defectPairs: 2, defectReason: 'Mismatch / Unpaired Gloves' })
      }, packingCookie);
      assert.equal(s3Resp.status, 200);
      assert.equal((await s3Resp.json()).data.wip.step3_matching_good, 90);

      // Stage 4 must fail until M-REQ is created and issued
      const blockedS4 = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packedPairs: 50 })
      }, packingCookie);
      assert.equal(blockedS4.status, 400);

      const mreqCreateResp = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/material-requisition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }, packingCookie);
      assert.equal(mreqCreateResp.status, 200);
      matReqNumber = (await mreqCreateResp.json()).data.mat_req_number;

      const mreqIssueResp = await apiFetch(`${baseUrl}/api/material-requisitions/${matReqNumber}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }, packingCookie);
      assert.equal(mreqIssueResp.status, 200);
      assert.equal((await mreqIssueResp.json()).data.status, 'ISSUED');

      // Incremental Stage 4 packing
      const s4Part1 = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packedPairs: 40 })
      }, packingCookie);
      assert.equal(s4Part1.status, 200);
      assert.equal((await s4Part1.json()).data.wip.step4_packing_good, 40);

      const s4Part2 = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packedPairs: 50 })
      }, packingCookie);
      assert.equal(s4Part2.status, 200);
      assert.equal((await s4Part2.json()).data.wip.step4_packing_good, 90);

      // Stage 5 gated must block before AQL pass
      const blockedS5 = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step5-cartons-gated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairsPerCarton: 30 })
      }, packingCookie);
      assert.equal(blockedS5.status, 400);

      // Wrong role for AQL audit must fail (403) while passing AQL as QC Inspector unlocks Stage 5
      const deniedAql = await apiFetch(`${baseUrl}/api/qc/${reqNumber}/aql-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foundDefects: 0 })
      }, packingCookie);
      assert.equal(deniedAql.status, 403);

      const passAql = await apiFetch(`${baseUrl}/api/qc/${reqNumber}/aql-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foundDefects: 0 })
      }, qcCookie);
      assert.equal(passAql.status, 200);
      assert.equal((await passAql.json()).data.isApproved, true);

      const s5Resp = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step5-cartons-gated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairsPerCarton: 30 })
      }, packingCookie);
      assert.equal(s5Resp.status, 200);
      const s5Data = (await s5Resp.json()).data;
      assert.equal(s5Data.wip.step5_cartons_packed, 3);
      assert.equal(s5Data.wip.step5_pairs_packed, 90);
      assert.equal(s5Data.cartons.length, 3);

      // Reload hydration endpoint includes wip, materialReq, cartons, alterations
      const listResp = await apiFetch(`${baseUrl}/api/requisitions`, {}, packingCookie);
      assert.equal(listResp.status, 200);
      const listed = (await listResp.json()).data.find(r => r.req_number === reqNumber);
      assert.ok(listed);
      assert.equal(listed.materialReq.status, 'ISSUED');
      assert.equal(listed.cartons.length, 3);
      assert.equal(listed.alterations.length, 3);
      assert.equal(listed.wip.final_qc_status, 'APPROVED_DISPATCH');
    } finally {
      if (reqNumber) {
        db.prepare('DELETE FROM cartons WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM alterations WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM material_requisitions WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM grn_req_allocations WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM packing_wip WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM glove_requisitions WHERE req_number = ?').run(reqNumber);
      }
      if (rcvNumber) db.prepare('DELETE FROM store_receivings WHERE rcv_number = ?').run(rcvNumber);
      if (orderId) {
        db.prepare('DELETE FROM pending_orders WHERE order_id = ?').run(orderId);
      }
    }
  });

  test('API: Order requisition creation caps against unclaimed GRN stock and remaining unrequested order balance', async () => {
    const master = db.prepare(`
      SELECT c.name AS buyer, p.name AS article
      FROM customers c JOIN products p ON p.customer_id = c.id
      WHERE p.name = 'Model A9'
      LIMIT 1
    `).get();
    assert.ok(master);

    let orderId;
    let rcvNumber;
    let req1Number;
    let req2Number;

    try {
      const orderResp = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: master.buyer,
          maker: 'Cap Check Maker',
          po: `PO-${randomUUID()}`,
          article: master.article,
          sizes: { '7': 20, '8': 20, '9': 20, '10': 20, '11': 20 },
          totalQty: 100
        })
      });
      assert.equal(orderResp.status, 200);
      orderId = (await orderResp.json()).data.orderId;

      const grnResp = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rcvDate: '31-10-2026',
          orderId,
          makerContractor: 'Cap Check Maker',
          customerName: master.buyer,
          poNumber: orderId,
          articleName: master.article,
          orderQty: 100,
          rcvdPairs: 60
        })
      }, inwardCookie);
      assert.equal(grnResp.status, 200);
      rcvNumber = (await grnResp.json()).data.rcv_number;

      // Requesting 80 pairs when only 60 GRN pairs exist must fail
      const overStockResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 16, '8': 16, '9': 16, '10': 16, '11': 16 } })
      }, packingCookie);
      assert.equal(overStockResp.status, 400);

      // Creating REQ-1 for 40 pairs succeeds
      const req1Resp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 15, '8': 10, '9': 5, '10': 5, '11': 5 } })
      }, packingCookie);
      assert.equal(req1Resp.status, 200);
      req1Number = (await req1Resp.json()).data.reqNumber;

      // Pending order metadata reflects 60 received, 40 pending requested, 20 unclaimed
      const ordersResp = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {}, packingCookie);
      assert.equal(ordersResp.status, 200);
      const orderSummary = (await ordersResp.json()).data.find(o => o.orderId === orderId);
      assert.equal(orderSummary.receivedPairs, 60);
      assert.equal(orderSummary.pendingReqPairs, 40);
      assert.equal(orderSummary.unclaimedDockPairs, 20);
      assert.equal(orderSummary.remainingOrderSizes['7'], 5);

      // Exceeding size 7 remaining balance (5 left of 20 planned) must fail
      const overSizeResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 6, '8': 0, '9': 0, '10': 0, '11': 0 } })
      }, packingCookie);
      assert.equal(overSizeResp.status, 400);

      // Exceeding remaining unclaimed stock (20 left) must fail
      const overUnclaimedResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 5, '8': 5, '9': 5, '10': 5, '11': 5 } })
      }, packingCookie);
      assert.equal(overUnclaimedResp.status, 400);

      // Requesting within remaining size and unclaimed stock (20 pairs) succeeds
      const req2Resp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 5, '8': 5, '9': 5, '10': 5, '11': 0 } })
      }, packingCookie);
      assert.equal(req2Resp.status, 200);
      req2Number = (await req2Resp.json()).data.reqNumber;
    } finally {
      for (const reqNo of [req1Number, req2Number]) {
        if (!reqNo) continue;
        db.prepare('DELETE FROM packing_wip WHERE req_number = ?').run(reqNo);
        db.prepare('DELETE FROM glove_requisitions WHERE req_number = ?').run(reqNo);
      }
      if (rcvNumber) db.prepare('DELETE FROM store_receivings WHERE rcv_number = ?').run(rcvNumber);
      if (orderId) db.prepare('DELETE FROM pending_orders WHERE order_id = ?').run(orderId);
    }
  });

  test('API & DB: Stage 1-4 rejects <= 0 payloads, allows legitimate consecutive Stage 4 partials, and rolls back mid-step failures', async () => {
    const master = db.prepare(`
      SELECT c.name AS buyer, p.name AS article
      FROM customers c JOIN products p ON p.customer_id = c.id
      LIMIT 1
    `).get();
    assert.ok(master);

    let orderId;
    let rcvNumber;
    let reqNumber;

    try {
      const orderResp = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: master.buyer,
          maker: 'Tx Maker',
          po: `PO-${randomUUID()}`,
          article: master.article,
          sizes: { '7': 50, '8': 50, '9': 50, '10': 50, '11': 50 },
          totalQty: 250
        })
      });
      orderId = (await orderResp.json()).data.orderId;

      const grnResp = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rcvDate: '31-10-2026',
          orderId,
          makerContractor: 'Tx Maker',
          customerName: master.buyer,
          poNumber: orderId,
          articleName: master.article,
          orderQty: 250,
          rcvdPairs: 250
        })
      }, inwardCookie);
      rcvNumber = (await grnResp.json()).data.rcv_number;

      const reqResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 50, '8': 50, '9': 50, '10': 50, '11': 50 } })
      }, packingCookie);
      reqNumber = (await reqResp.json()).data.reqNumber;

      const issueResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/issue-req`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqNumber, requestedPairs: 250 })
      }, inwardCookie);
      assert.equal(issueResp.status, 200);

      // Mid-transaction failure test: trigger aborts alteration insert after packing_wip update -> UPDATE must roll back cleanly
      db.exec(`
        CREATE TEMP TRIGGER abort_alt_insert_test BEFORE INSERT ON alterations
        WHEN NEW.req_number = '${reqNumber}'
        BEGIN
          SELECT RAISE(ABORT, 'simulated alteration failure');
        END;
      `);
      const abortedResp = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step1-checking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goodPairs: 50, defectPairs: 10, defectReason: 'Test rollback' })
      }, packingCookie);
      assert.equal(abortedResp.status, 400);
      assert.match((await abortedResp.json()).error || '', /simulated alteration failure/);
      db.exec(`DROP TRIGGER IF EXISTS abort_alt_insert_test;`);

      const wipAfterAbort = db.prepare('SELECT step1_checking_good, step1_checking_defects, step2_ironing_in FROM packing_wip WHERE req_number = ?').get(reqNumber);
      assert.equal(wipAfterAbort.step1_checking_good, 0);
      assert.equal(wipAfterAbort.step1_checking_defects, 0);
      assert.equal(wipAfterAbort.step2_ironing_in, 0);

      // Advance Stages 1-3 + M-REQ
      assert.equal((await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step1-checking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goodPairs: 250, defectPairs: 0 })
      }, packingCookie)).status, 200);
      assert.equal((await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step2-ironing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goodPairs: 250, defectPairs: 0 })
      }, packingCookie)).status, 200);
      assert.equal((await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step3-matching`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goodPairs: 250, defectPairs: 0 })
      }, packingCookie)).status, 200);

      const mreqRes = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/material-requisition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, packingCookie);
      assert.equal(mreqRes.status, 200);
      const matReqNo = (await mreqRes.json()).data.mat_req_number;
      const issueMreqRes = await apiFetch(`${baseUrl}/api/material-requisitions/${matReqNo}/issue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, packingCookie);
      assert.equal(issueMreqRes.status, 200);

      // Zero and negative Stage 4 payloads must fail 400
      assert.equal((await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packedPairs: 0 })
      }, packingCookie)).status, 400);
      assert.equal((await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packedPairs: -10 })
      }, packingCookie)).status, 400);

      // Two consecutive legitimate identical partial Stage 4 submits (100 + 100) must both succeed
      assert.equal((await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packedPairs: 100 })
      }, packingCookie)).status, 200);
      const secondPartial = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packedPairs: 100 })
      }, packingCookie);
      assert.equal(secondPartial.status, 200);
      assert.equal((await secondPartial.json()).data.wip.step4_packing_good, 200);

      // Over-packing past remaining 50 fails 400
      assert.equal((await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step4-packing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packedPairs: 60 })
      }, packingCookie)).status, 400);
    } finally {
      db.exec('DROP TRIGGER IF EXISTS abort_alt_insert_test;');
      if (reqNumber) {
        db.prepare('DELETE FROM cartons WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM alterations WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM material_requisitions WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM grn_req_allocations WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM packing_wip WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM glove_requisitions WHERE req_number = ?').run(reqNumber);
      }
      if (rcvNumber) db.prepare('DELETE FROM store_receivings WHERE rcv_number = ?').run(rcvNumber);
      if (orderId) db.prepare('DELETE FROM pending_orders WHERE order_id = ?').run(orderId);
    }
  });

  test('API: POST /api/store/receivings locks article & colour from linked order and requires receivedFrom', async () => {
    const master = db.prepare(`
      SELECT c.name AS buyer, p.name AS article
      FROM customers c JOIN products p ON p.customer_id = c.id
      LIMIT 1
    `).get();
    assert.ok(master);

    let orderId;
    let rcvNumber;

    try {
      const orderResp = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: master.buyer,
          maker: 'Hall A',
          po: `PO-LOCK-${randomUUID().slice(0, 6)}`,
          article: master.article,
          color: 'Hi-Vis Neon',
          sizes: { '7': 40, '8': 40, '9': 40, '10': 40, '11': 40 },
          totalQty: 200
        })
      });
      assert.equal(orderResp.status, 200);
      orderId = (await orderResp.json()).data.orderId;

      // Missing / empty receivedFrom must fail 400
      const missingReceiver = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rcvDate: '31-10-2026',
          orderId,
          makerContractor: 'Hall A',
          articleName: 'TAMPERED-ARTICLE',
          colorShade: 'TAMPERED-COLOR',
          receivedFrom: '   ',
          strictInwardEntry: true,
          rcvdPairs: 50
        })
      }, inwardCookie);
      assert.equal(missingReceiver.status, 400);

      // Valid receivedFrom saves receiving, ignoring tampered article & color from client
      const validGrn = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rcvDate: '31-10-2026',
          orderId,
          makerContractor: 'Hall A',
          customerName: 'TAMPERED-BUYER',
          articleName: 'TAMPERED-ARTICLE',
          colorShade: 'TAMPERED-COLOR',
          receivedFrom: 'Bilal Driver',
          strictInwardEntry: true,
          rcvdPairs: 50
        })
      }, inwardCookie);
      assert.equal(validGrn.status, 200);
      const validData = (await validGrn.json()).data;
      rcvNumber = validData.rcv_number;
      assert.equal(validData.article_name, master.article);
      assert.equal(validData.color_shade, 'Hi-Vis Neon');
      assert.equal(validData.customer_name, master.buyer);
      assert.equal(validData.received_from, 'Bilal Driver');
    } finally {
      if (rcvNumber) db.prepare('DELETE FROM store_receivings WHERE rcv_number = ?').run(rcvNumber);
      if (orderId) {
        db.prepare('DELETE FROM order_contractor_allocations WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM pending_orders WHERE order_id = ?').run(orderId);
      }
    }
  });

  test('API: Multi-contractor split order enforces allocations and tracks per-contractor balances', async () => {
    const master = db.prepare(`
      SELECT c.name AS buyer, p.name AS article
      FROM customers c JOIN products p ON p.customer_id = c.id
      LIMIT 1
    `).get();
    assert.ok(master);

    let orderId;
    const rcvNumbers = [];

    try {
      const orderResp = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: master.buyer,
          maker: 'Hall A, Hall B',
          po: `PO-SPLIT-${randomUUID().slice(0, 6)}`,
          article: master.article,
          color: 'Black',
          sizes: { '7': 40, '8': 40, '9': 40, '10': 40, '11': 40 },
          totalQty: 200,
          allocations: [
            { maker: 'Hall A', sizes: { '7': 25, '8': 25, '9': 25, '10': 25, '11': 20 } },
            { maker: 'Hall B', sizes: { '7': 15, '8': 15, '9': 15, '10': 15, '11': 20 } }
          ]
        })
      });
      assert.equal(orderResp.status, 200);
      const orderData = (await orderResp.json()).data;
      orderId = orderData.orderId;
      const created = orderData.orders.find(o => o.orderId === orderId);
      assert.equal(created.contractorAllocations.length, 2);

      // Receive full 120 pairs for Hall A -> 200
      const rcvA = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          makerContractor: 'Hall A',
          receivedFrom: 'Asif Carrier',
          strictInwardEntry: true,
          rcvdPairs: 120
        })
      }, inwardCookie);
      assert.equal(rcvA.status, 200);
      rcvNumbers.push((await rcvA.json()).data.rcv_number);

      // Over-receipt for Hall A (even 10 pairs over 120) must reject 400
      const overA = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          makerContractor: 'Hall A',
          receivedFrom: 'Asif Carrier',
          strictInwardEntry: true,
          rcvdPairs: 10
        })
      }, inwardCookie);
      assert.equal(overA.status, 400);

      // Unassigned contractor Maker C must reject 400
      const wrongMaker = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          makerContractor: 'Maker C',
          receivedFrom: 'Unknown Driver',
          strictInwardEntry: true,
          rcvdPairs: 10
        })
      }, inwardCookie);
      assert.equal(wrongMaker.status, 400);

      // Receive 80 pairs for Hall B -> 200 and verify updated allocations
      const rcvB = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          makerContractor: 'Hall B',
          receivedFrom: 'Rashid Driver',
          strictInwardEntry: true,
          rcvdPairs: 80
        })
      }, inwardCookie);
      assert.equal(rcvB.status, 200);
      rcvNumbers.push((await rcvB.json()).data.rcv_number);

      const pendingAfter = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {}, inwardCookie);
      const updated = (await pendingAfter.json()).data.find(o => o.orderId === orderId);
      assert.equal(updated.contractorAllocations[0].receivedPairs, 120);
      assert.equal(updated.contractorAllocations[0].remainingPairs, 0);
      assert.equal(updated.contractorAllocations[1].receivedPairs, 80);
      assert.equal(updated.contractorAllocations[1].remainingPairs, 0);
    } finally {
      for (const rcvNo of rcvNumbers) {
        db.prepare('DELETE FROM store_receivings WHERE rcv_number = ?').run(rcvNo);
      }
      if (orderId) {
        db.prepare('DELETE FROM order_contractor_allocations WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM pending_orders WHERE order_id = ?').run(orderId);
      }
    }
  });

  test('API: /api/admin/overview supports ?includeCatalog=0 fast incremental refresh without resending catalog SKUs', async () => {
    const fullRes = await apiFetch(`${baseUrl}/api/admin/overview`);
    assert.equal(fullRes.status, 200);
    const fullJson = await fullRes.json();
    assert.equal(fullJson.success, true);
    assert.equal(fullJson.data.dbHealth.integrity, 'ok');
    assert.ok(Array.isArray(fullJson.data.products) && fullJson.data.products.length > 0);
    assert.ok(Array.isArray(fullJson.data.customers) && fullJson.data.customers.length > 0);
    assert.ok(Array.isArray(fullJson.data.sizeStandards) && fullJson.data.sizeStandards.length > 0);

    const slimRes = await apiFetch(`${baseUrl}/api/admin/overview?includeCatalog=0`);
    assert.equal(slimRes.status, 200);
    const slimJson = await slimRes.json();
    assert.equal(slimJson.success, true);
    assert.equal(slimJson.data.dbHealth.integrity, 'ok');
    assert.equal(slimJson.data.products, undefined);
    assert.equal(slimJson.data.customers, undefined);
    assert.equal(slimJson.data.sizeStandards, undefined);
    assert.ok(Array.isArray(slimJson.data.pendingOrders));
  });

  test('API authentication: session cookie omits Secure on plain HTTP LAN requests even in production and adds Secure for HTTPS proxies', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const httpLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
      });
      assert.equal(httpLogin.status, 200);
      const httpCookie = httpLogin.headers.get('set-cookie') || '';
      assert.match(httpCookie, /HttpOnly/);
      assert.equal(/;\s*Secure\b/i.test(httpCookie), false);
      const httpTok = decodeURIComponent(httpCookie.split(';')[0].split('=')[1] || '');
      if (httpTok) AuthService.destroySession(httpTok);

      const httpsLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
      });
      assert.equal(httpsLogin.status, 200);
      const httpsCookie = httpsLogin.headers.get('set-cookie') || '';
      assert.match(httpsCookie, /;\s*Secure\b/i);
      const httpsTok = decodeURIComponent(httpsCookie.split(';')[0].split('=')[1] || '');
      if (httpsTok) AuthService.destroySession(httpsTok);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  test('API RBAC: INWARD_CLERK can inspect alterations and return repaired/partial pairs back to Stage 1', async () => {
    const master = db.prepare(`
      SELECT c.name AS buyer, p.name AS article
      FROM customers c JOIN products p ON p.customer_id = c.id
      WHERE p.name = 'Model A9'
      LIMIT 1
    `).get();
    assert.ok(master);

    let orderId;
    let rcvNumber;
    let reqNumber;

    try {
      const orderResp = await apiFetch(`${baseUrl}/api/admin/pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: master.buyer,
          maker: 'Alteration Maker',
          po: `PO-ALT-${randomUUID()}`,
          article: master.article,
          sizes: { '7': 10, '8': 10, '9': 10, '10': 10, '11': 10 },
          totalQty: 50
        })
      });
      assert.equal(orderResp.status, 200);
      orderId = (await orderResp.json()).data.orderId;

      const grnResp = await apiFetch(`${baseUrl}/api/store/receivings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          makerContractor: 'Alteration Maker',
          receivedFrom: 'Driver Alt',
          strictInwardEntry: true,
          sizes: { '7': 10, '8': 10, '9': 10, '10': 10, '11': 10 },
          rcvdPairs: 50
        })
      }, inwardCookie);
      assert.equal(grnResp.status, 200);
      rcvNumber = (await grnResp.json()).data.rcv_number;

      const reqResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: { '7': 10, '8': 10, '9': 10, '10': 10, '11': 10 } })
      }, packingCookie);
      assert.equal(reqResp.status, 200);
      reqNumber = (await reqResp.json()).data.reqNumber;

      const issueResp = await apiFetch(`${baseUrl}/api/orders/${orderId}/issue-req`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqNumber, requestedPairs: 50 })
      }, inwardCookie);
      assert.equal(issueResp.status, 200);

      // Packing supervisor logs 40 good and 10 defective pairs in Stage 1
      const s1Resp = await apiFetch(`${baseUrl}/api/wip/${reqNumber}/step1-checking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goodPairs: 40, defectPairs: 10, defectReason: 'Stitching Skip' })
      }, packingCookie);
      assert.equal(s1Resp.status, 200);

      // Inward Clerk reads /api/alterations (200) and sees the 10-pair pending ticket
      const altListResp = await apiFetch(`${baseUrl}/api/alterations?reqNo=${encodeURIComponent(reqNumber)}`, {}, inwardCookie);
      assert.equal(altListResp.status, 200);
      const altList = (await altListResp.json()).data;
      const openAlt = altList.find(a => a.req_number === reqNumber && a.status === 'SENT_FOR_ALTERATION');
      assert.ok(openAlt);
      assert.equal(openAlt.pairs_count, 10);

      // Inward Clerk returns 4 pairs first (partial repair back to Stage 1)
      const partialResp = await apiFetch(`${baseUrl}/api/alterations/${openAlt.id}/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tailorName: 'Tailor Rashid', isScrap: false, pairsCount: 4 })
      }, inwardCookie);
      assert.equal(partialResp.status, 200);
      assert.equal((await partialResp.json()).data.pairsCount, 4);

      let reqAfter = (await (await apiFetch(`${baseUrl}/api/requisitions/${encodeURIComponent(reqNumber)}`)).json()).data;
      assert.equal(reqAfter.wip.step1_checking_in, 54);
      const remainingOpen = reqAfter.alterations.find(a => a.id === openAlt.id);
      assert.equal(remainingOpen.status, 'SENT_FOR_ALTERATION');
      assert.equal(remainingOpen.pairs_count, 6);

      // Inward Clerk returns the remaining 6 pairs to Stage 1
      const finalResp = await apiFetch(`${baseUrl}/api/alterations/${openAlt.id}/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tailorName: 'Tailor Rashid', isScrap: false })
      }, inwardCookie);
      assert.equal(finalResp.status, 200);
      assert.equal((await finalResp.json()).data.pairsCount, 6);

      reqAfter = (await (await apiFetch(`${baseUrl}/api/requisitions/${encodeURIComponent(reqNumber)}`)).json()).data;
      assert.equal(reqAfter.wip.step1_checking_in, 60);
      assert.equal(reqAfter.alterations.filter(a => a.status === 'SENT_FOR_ALTERATION').length, 0);
    } finally {
      if (reqNumber) {
        db.prepare('DELETE FROM scrap_ledger WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM alterations WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM packing_wip WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM grn_req_allocations WHERE req_number = ?').run(reqNumber);
        db.prepare('DELETE FROM glove_requisitions WHERE req_number = ?').run(reqNumber);
      }
      if (rcvNumber) {
        db.prepare('DELETE FROM store_receivings WHERE rcv_number = ?').run(rcvNumber);
      }
      if (orderId) {
        db.prepare('DELETE FROM order_contractor_allocations WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM pending_orders WHERE order_id = ?').run(orderId);
      }
    }
  });
});
