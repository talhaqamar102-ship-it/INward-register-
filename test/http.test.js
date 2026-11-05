import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';
import { seedDemoSheet } from '../src/db.js';

describe('HTTP Endpoints & UI Static Files Test Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
    seedDemoSheet();
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
  });

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

  test('API: /api/inventory/gloves returns seeded glove inventory', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/gloves`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.length > 0);
  });

  test('API: /api/inventory/materials returns packaging accessories inventory', async () => {
    const res = await fetch(`${baseUrl}/api/inventory/materials`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.length >= 3);
  });

  test('API: /api/store/receivings returns seeded contractor shipment sheet', async () => {
    const res = await fetch(`${baseUrl}/api/store/receivings`);
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
    const res = await fetch(`${baseUrl}/api/store/dropdowns`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.makers.length >= 6);
    assert.ok(json.data.customers.length >= 3);
    assert.ok(json.data.articles.length >= 10);
  });

  test('API: POST /api/store/receivings creates receiving and calculates balance', async () => {
    const res = await fetch(`${baseUrl}/api/store/receivings`, {
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
});
