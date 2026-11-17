import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const ASSETS_DIR = path.join(ROOT_DIR, 'hyperframes-video', 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const DB_PATH = path.join(ROOT_DIR, '.playwright-tmp', 'video-capture.sqlite');

fs.mkdirSync(ASSETS_DIR, { recursive: true });
fs.mkdirSync(FONTS_DIR, { recursive: true });
for (const ext of ['', '-wal', '-shm']) {
  const f = `${DB_PATH}${ext}`;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

// 1. Download local WOFF2 fonts (Fira Sans 400/600/800 & Fira Code 500/700) for HyperFrames Rule 9
async function downloadFonts() {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;700&family=Fira+Sans:wght@400;600;800&display=swap';
  const cssText = await fetch(cssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36'
    }
  }).then(r => r.text());

  const blocks = cssText.match(/@font-face\s*\{[^}]+\}/g) || [];
  const chosen = new Map();
  for (const blk of blocks) {
    const family = blk.match(/font-family:\s*'([^']+)'/)?.[1];
    const weight = blk.match(/font-weight:\s*(\d+)/)?.[1];
    const url = blk.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    const isLatin = /U\+0000-00FF/.test(blk);
    if (family && weight && url) {
      const key = `${family}-${weight}`;
      if (!chosen.has(key) || isLatin) {
        chosen.set(key, { family, weight, url });
      }
    }
  }

  for (const [key, item] of chosen.entries()) {
    const safeName = `${item.family.toLowerCase().replace(/\s+/g, '-')}-${item.weight}.woff2`;
    const dest = path.join(FONTS_DIR, safeName);
    const buf = Buffer.from(await fetch(item.url).then(r => r.arrayBuffer()));
    fs.writeFileSync(dest, buf);
    console.log(`[font] ${key} -> ${safeName} (${buf.length} bytes)`);
  }
}

// 2. Synthesize 28s studio-clean stereo industrial ambient synth + beat WAV (120 BPM, 44.1kHz 16-bit)
function generateAudioAssets() {
  const sampleRate = 44100;
  const durationSec = 28;
  const totalSamples = sampleRate * durationSec;
  const numChannels = 2;
  const dataSize = totalSamples * numChannels * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * 2, 28);
  buf.writeUInt16LE(numChannels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // Musical progression: D minor / F major9 / C / Gsus4 clean ambient industrial tech bed
  const chords = [
    [146.83, 220.0, 293.66, 349.23],
    [174.61, 261.63, 329.63, 440.0],
    [130.81, 196.0, 261.63, 329.63],
    [196.0, 261.63, 293.66, 392.0]
  ];
  const sceneCuts = [0, 4.5, 9.5, 14.5, 19.5, 24.5];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatPhase = (t * 2) % 1; // 120 BPM = 2 beats/sec
    const stepIdx = Math.floor(t * 2); // quarter-note index
    const chord = chords[Math.floor(t / 4) % chords.length];

    // Warm sub-bass pulse on each beat
    const bassFreq = chord[0] * 0.5;
    const kickEnv = Math.exp(-beatPhase * 9.0);
    const subPulse = Math.sin(2 * Math.PI * bassFreq * t) * (0.14 + 0.16 * kickEnv);

    // Lush detuned pad chord
    let pad = 0;
    for (let k = 0; k < chord.length; k++) {
      const f = chord[k];
      pad += Math.sin(2 * Math.PI * f * t + k * 0.4) * 0.055;
      pad += Math.sin(2 * Math.PI * (f * 1.003) * t) * 0.03;
    }

    // Crisp arpeggio plucks on 8th notes
    const eighthPhase = (t * 4) % 1;
    const arpNote = chord[(Math.floor(t * 4)) % chord.length] * 2;
    const arpEnv = Math.exp(-eighthPhase * 11.0);
    const arp = Math.sin(2 * Math.PI * arpNote * t) * arpEnv * 0.085;

    // Subtle hi-tick on offbeats
    const tickEnv = (stepIdx % 2 === 1) ? Math.exp(-beatPhase * 38.0) : 0;
    const tick = Math.sin(2 * Math.PI * 1760 * t) * tickEnv * 0.035;

    // Clean crystalline marker chime at scene cuts
    let chime = 0;
    for (const cut of sceneCuts) {
      const dt = t - cut;
      if (dt >= 0 && dt < 0.7) {
        const cEnv = Math.exp(-dt * 6.5);
        chime += (Math.sin(2 * Math.PI * 587.33 * dt) * 0.5 + Math.sin(2 * Math.PI * 880 * dt) * 0.5) * cEnv * 0.12;
      }
    }

    const fadeIn = Math.min(1, t / 0.5);
    const fadeOut = Math.min(1, (durationSec - t) / 1.2);
    const env = fadeIn * fadeOut;

    const lSample = Math.max(-0.92, Math.min(0.92, (subPulse + pad + arp * 0.9 + tick + chime) * env));
    const rSample = Math.max(-0.92, Math.min(0.92, (subPulse + pad * 0.96 + arp * 1.1 + tick + chime) * env));

    const offset = 44 + i * 4;
    buf.writeInt16LE(Math.round(lSample * 32767), offset);
    buf.writeInt16LE(Math.round(rSample * 32767), offset + 2);
  }

  fs.writeFileSync(path.join(ASSETS_DIR, 'bgm-industrial.wav'), buf);
  console.log(`[audio] bgm-industrial.wav (${buf.length} bytes)`);
}

// 3. Boot isolated MES server on port 4175 & capture real 1920x1080 application plates
async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Server timeout');
}

async function captureProductScreens() {
  const port = 4175;
  const serverProc = spawn('npx tsx e2e/start-test-server.mjs', [], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: String(port), MES_DB_PATH: DB_PATH, DISABLE_HMR: 'true' },
    stdio: 'inherit',
    shell: true
  });

  const baseUrl = `http://127.0.0.1:${port}/`;
  try {
    await waitForServer(`${baseUrl}health`, 45000);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, route =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
    await page.goto(`${baseUrl}?demo=1`);
    await page.waitForSelector('h1#auth-title');
    const titleTxt = (await page.locator('h1#auth-title').textContent()) || '';
    if (titleTxt.includes('Create the first Super User')) {
      await page.fill('#auth-name', 'Hammad Admin');
      await page.fill('#auth-username', 'super.admin');
      await page.fill('#auth-password', 'Meridian#2026!');
      await page.fill('#auth-password-confirm', 'Meridian#2026!');
      await page.click('#auth-form button[type="submit"]');
    } else if (titleTxt.includes('Sign in')) {
      await page.fill('#auth-username', 'super.admin');
      await page.fill('#auth-password', 'Meridian#2026!');
      await page.click('#auth-form button[type="submit"]');
    }
    await page.waitForSelector('[data-testid="superuser-command-center"]');
    await page.waitForSelector('#root[data-sync-ready="true"]');
    await page.addStyleTag({ content: '.toast-container, .toast { display: none !important; }' });

    // Load Demo 600 In-Progress scenario so dashboard, tracking, inward, and packing screens look rich
    await page.click('#btn-load-demo-600-inprogress');
    await page.waitForSelector('#btn-remove-demo-600');
    await page.waitForTimeout(350);

    // Dismiss toasts so screenshots are ultra clean
    await page.evaluate(() => {
      document.querySelectorAll('.toast').forEach(el => el.remove());
    });

    // Shot A: Executive Dashboard
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen-dashboard.png') });
    console.log('[capture] screen-dashboard.png');

    // Shot B: Live Tracking (expand ORD-2026-600)
    await page.click('.admin-tab-btn[data-admin-tab="tracking"]');
    await page.waitForSelector('#tracking-order-card-ORD-2026-600');
    const toggleBtn = page.locator('button[data-su-action="toggle-order-expand"][data-order-id="ORD-2026-600"]');
    if ((await toggleBtn.getAttribute('aria-expanded')) !== 'true') {
      await toggleBtn.click();
    }
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
    await page.locator('#tracking-order-card-ORD-2026-600').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen-live-tracking.png') });
    console.log('[capture] screen-live-tracking.png');

    // Shot C: Section 1 Master Order Creation with Contractor Split Open
    await page.click('.admin-tab-btn[data-admin-tab="orders"]');
    await page.waitForSelector('#btn-admin-toggle-split');
    await page.click('#btn-admin-toggle-split');
    await page.waitForSelector('[data-testid="admin-contractor-split-panel"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen-order-split.png') });
    console.log('[capture] screen-order-split.png');

    // Shot D: Section 2 Flagship Buyer Master Registry (cropped crisp element shot)
    await page.click('#btn-admin-toggle-split');
    const buyersDetails = page.locator('details.su-collapsible-registry[data-registry-id="buyers"]');
    await buyersDetails.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await buyersDetails.screenshot({ path: path.join(ASSETS_DIR, 'screen-buyer-workbench.png') });
    console.log('[capture] screen-buyer-workbench.png');

    // Shot E: Module 1 Inward Goods Receiving (via Super User Tracking -> quick-receive-grn)
    await page.click('.admin-tab-btn[data-admin-tab="tracking"]');
    await page.waitForSelector('button[data-su-action="quick-receive-grn"][data-order-id="ORD-2026-600"]');
    await page.click('button[data-su-action="quick-receive-grn"][data-order-id="ORD-2026-600"]');
    await page.waitForSelector('#grn-article');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen-inward-grn.png') });
    console.log('[capture] screen-inward-grn.png');

    // Return to Super User and open Module 2 Packing Hall 5-Stage WIP Pipeline
    await page.click('#btn-return-admin');
    await page.waitForSelector('.admin-tab-btn[data-admin-tab="tracking"]');
    await page.click('.admin-tab-btn[data-admin-tab="tracking"]');
    await page.waitForSelector('#tracking-order-card-ORD-2026-600');
    const packBtn = page.locator('#tracking-order-card-ORD-2026-600 button[data-su-action="open-req-screen"][data-target-screen="screen-packing"]').first();
    await packBtn.click();
    await page.waitForSelector('#wip-batch-select');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen-packing-pipeline.png') });
    console.log('[capture] screen-packing-pipeline.png');

    await browser.close();
  } finally {
    try {
      if (process.platform === 'win32' && serverProc.pid) {
        spawn('taskkill', ['/pid', String(serverProc.pid), '/T', '/F'], { shell: true });
      } else {
        serverProc.kill();
      }
    } catch {}
    await new Promise(r => setTimeout(r, 400));
    for (const ext of ['', '-wal', '-shm']) {
      const f = `${DB_PATH}${ext}`;
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
    }
  }
}

await downloadFonts();
generateAudioAssets();
await captureProductScreens();
console.log('[done] All video assets prepared.');
