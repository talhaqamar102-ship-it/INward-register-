import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULT_XLSX = path.join(
  'C:\\Users\\Hammad Ind\\.gemini\\antigravity\\brain\\f72f3018-e25f-41b3-b8ad-37f348815caa\\.user_uploaded',
  'media_1794898073264_d7b18ff6.xlsx'
);

const CATALOG_DIR = path.join(ROOT_DIR, 'src', 'catalog');
const ID_MAP_PATH = path.join(CATALOG_DIR, 'catalog-id-map.json');
const RENAMES_PATH = path.join(CATALOG_DIR, 'catalog-renames.json');
const SEED_OUT_PATH = path.join(CATALOG_DIR, 'catalog-seed.json');
const DIFF_OUT_PATH = path.join(CATALOG_DIR, 'import-diff.json');

/** Read ZIP entries from an .xlsx buffer using Node's built-in zlib. */
export function readZipEntries(buf) {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid .xlsx: ZIP end-of-central-directory not found');

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  for (let n = 0; n < totalEntries; n++) {
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) {
      throw new Error('Invalid .xlsx central directory header');
    }
    const method = buf.readUInt16LE(cdOffset + 10);
    const compSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen);
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local file header for ${name}`);
    }
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const rawData = buf.subarray(dataStart, dataStart + compSize);
    const content = method === 0 ? rawData : zlib.inflateRawSync(rawData);
    entries.set(name, content.toString('utf8'));
  }
  return entries;
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const items = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml)) !== null) {
    const inner = m[1];
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tRe.exec(inner)) !== null) {
      text += decodeXmlEntities(tm[1]);
    }
    items.push(text);
  }
  return items;
}

function parseSheetRows(sheetXml, sharedStrings) {
  const dimMatch = /<dimension\b[^>]*\bref="([^"]+)"/.exec(sheetXml);
  const dimRef = dimMatch ? dimMatch[1] : '';
  const declMatch = /:([A-Z]+)(\d+)$/.exec(dimRef);
  const declaredRows = declMatch ? Number(declMatch[2]) : -1;

  const rowRe = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const rows = [];
  let rm;
  while ((rm = rowRe.exec(sheetXml)) !== null) {
    const rowNum = Number(rm[1]);
    const cells = {};
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rm[2])) !== null) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const refM = /\br="([A-Z]+)\d+"/.exec(attrs);
      if (!refM) continue;
      const col = refM[1];
      const typeM = /\bt="([^"]+)"/.exec(attrs);
      const cellType = typeM ? typeM[1] : '';
      const valM = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
      const isM = /<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(body);
      let val = '';
      if (cellType === 's' && valM) {
        val = sharedStrings[Number(valM[1])] ?? '';
      } else if (isM) {
        val = decodeXmlEntities(isM[1]);
      } else if (valM) {
        val = decodeXmlEntities(valM[1]);
      }
      cells[col] = val;
    }
    rows.push({ rowNum, cells });
  }
  return { dimRef, declaredRows, rows };
}

export function normalizeKey(str) {
  return String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function extractCatalogFromWorkbook(xlsxPath) {
  const buf = fs.readFileSync(xlsxPath);
  const entries = readZipEntries(buf);
  const sharedStrings = parseSharedStrings(entries.get('xl/sharedStrings.xml'));
  const sheetXml = entries.get('xl/worksheets/sheet2.xml');
  if (!sheetXml) throw new Error('Database_Master (xl/worksheets/sheet2.xml) not found');

  const { dimRef, declaredRows, rows } = parseSheetRows(sheetXml, sharedStrings);
  const sizeCols = ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
  let processed = 0;
  let excludedPlaceholders = 0;
  const parsedRows = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    processed++;
    const c = r.cells;
    const rawCustomer = String(c.A ?? '');
    const rawArticleNo = String(c.B ?? '');
    const rawItemName = String(c.C ?? '');
    const rawColor = String(c.D ?? '');
    const rawSizeFormat = String(c.E ?? '');
    const rawSizesAvail = String(c.F ?? '');
    const sizes = sizeCols.map(col => String(c[col] ?? '').trim()).filter(Boolean);

    // Decision #1 (2026-11-17): Exclude Row 7 placeholder ('TECH-1 KX v3 ------', Art='-----------------', Color='< None >')
    if (
      r.rowNum === 7 &&
      rawCustomer.trim() === 'ALPINE STAR' &&
      rawArticleNo.trim() === '-----------------' &&
      rawItemName.trim() === 'TECH-1 KX v3 ------'
    ) {
      excludedPlaceholders++;
      continue;
    }

    parsedRows.push({
      rowNum: r.rowNum,
      sourceKey: `${rawCustomer.trim()}\x1f${rawItemName.trim()}`,
      rawCustomer,
      customerName: rawCustomer.trim(),
      rawArticleNo,
      articleCode: rawArticleNo.trim(),
      rawItemName,
      itemName: rawItemName.trim(),
      rawColor,
      colorSpec: rawColor.trim() === '< None >' ? '' : rawColor.trim(),
      rawSizeFormat,
      sizeFormat: rawSizeFormat.trim(),
      rawSizesAvail,
      sizes
    });
  }

  if (rows.length !== declaredRows || processed + 1 !== rows.length) {
    throw new Error(
      `Row count mismatch: declared=${declaredRows} xmlRows=${rows.length} processed=${processed} (+1 header)`
    );
  }

  // Raw + normalized uniqueness checks on (Customer, Item_Name)
  const rawSet = new Set();
  const normSet = new Set();
  let rawDups = 0;
  let normDups = 0;
  for (const row of parsedRows) {
    const rk = `${row.rawCustomer}\x1f${row.rawItemName}`;
    const nk = `${normalizeKey(row.rawCustomer)}\x1f${normalizeKey(row.rawItemName)}`;
    if (rawSet.has(rk)) rawDups++;
    rawSet.add(rk);
    if (normSet.has(nk)) normDups++;
    normSet.add(nk);
  }
  if (rawDups > 0 || normDups > 0) {
    throw new Error(`Duplicate (Customer, Item_Name) detected: rawDups=${rawDups} normDups=${normDups}`);
  }

  // Build size standards (preserve exact Size_1..Size_10 & raw Size_Format as written in workbook)
  const scaleMap = new Map();
  for (const row of parsedRows) {
    const existing = scaleMap.get(row.sizeFormat);
    const sig = row.sizes.join('|');
    if (existing) {
      if (existing.sig !== sig) {
        throw new Error(`Size tuple conflict inside format "${row.sizeFormat}": ${existing.sig} vs ${sig}`);
      }
    } else {
      scaleMap.set(row.sizeFormat, { code: row.sizeFormat, rawLabel: row.rawSizeFormat, sizes: row.sizes, sig });
    }
  }

  const buyerNames = [...new Set(parsedRows.map(r => r.customerName))].sort();
  return {
    meta: {
      dimRef,
      declaredRows,
      xmlRows: rows.length,
      dataRowsScanned: processed,
      excludedPlaceholders,
      exportedProducts: parsedRows.length,
      distinctBuyers: buyerNames.length,
      distinctSizeFormats: scaleMap.size,
      rawDups,
      normDups
    },
    sizeStandards: [
      { code: 'LEGACY_7_11', rawLabel: 'LEGACY_7_11', sizes: ['7', '8', '9', '10', '11'], isLegacy: 1 },
      ...[...scaleMap.values()].map(s => ({ code: s.code, rawLabel: s.rawLabel, sizes: s.sizes, isLegacy: 0 }))
    ],
    buyers: buyerNames,
    rows: parsedRows
  };
}

export function buildPersistedCatalog({
  xlsxPath = DEFAULT_XLSX,
  idMapPath = ID_MAP_PATH,
  renamesPath = RENAMES_PATH,
  seedOutPath = SEED_OUT_PATH,
  diffOutPath = DIFF_OUT_PATH,
  init = false,
  acceptDiff = false
} = {}) {
  const extracted = extractCatalogFromWorkbook(xlsxPath);
  const renames = fs.existsSync(renamesPath)
    ? JSON.parse(fs.readFileSync(renamesPath, 'utf8'))
    : { buyers: {}, products: {} };

  if (!fs.existsSync(idMapPath)) {
    if (!init) {
      throw new Error(`Missing persisted ID map at ${idMapPath}; pass --init for first generation.`);
    }
    const buyerMap = {};
    extracted.buyers.forEach((b, idx) => {
      buyerMap[b] = `BUY-${String(idx + 1).padStart(4, '0')}`;
    });
    const productMap = {};
    extracted.rows.forEach((r, idx) => {
      productMap[r.sourceKey] = `CAT-${String(idx + 1).padStart(4, '0')}`;
    });
    fs.mkdirSync(path.dirname(idMapPath), { recursive: true });
    fs.writeFileSync(idMapPath, JSON.stringify({ buyers: buyerMap, products: productMap }, null, 2) + '\n', 'utf8');
    if (!fs.existsSync(renamesPath)) {
      fs.writeFileSync(renamesPath, JSON.stringify({ buyers: {}, products: {} }, null, 2) + '\n', 'utf8');
    }
  }

  const storedMap = JSON.parse(fs.readFileSync(idMapPath, 'utf8'));
  const resolvedProductKey = key => renames.products?.[key] || key;
  const resolvedBuyerKey = key => renames.buyers?.[key] || key;

  const srcBuyers = new Set(extracted.buyers.map(resolvedBuyerKey));
  const addedBuyers = [...srcBuyers].filter(k => !(k in storedMap.buyers));
  const removedBuyers = Object.keys(storedMap.buyers).filter(k => !srcBuyers.has(k));

  const srcProducts = new Set(extracted.rows.map(r => resolvedProductKey(r.sourceKey)));
  const addedProducts = [...srcProducts].filter(k => !(k in storedMap.products));
  const removedProducts = Object.keys(storedMap.products).filter(k => !srcProducts.has(k));

  if (addedBuyers.length || removedBuyers.length || addedProducts.length || removedProducts.length) {
    const diffPayload = { addedBuyers, removedBuyers, addedProducts, removedProducts };
    if (!acceptDiff) {
      fs.writeFileSync(diffOutPath, JSON.stringify(diffPayload, null, 2) + '\n', 'utf8');
      const err = new Error(
        `KEY DIFF buyers(+${addedBuyers.length} -${removedBuyers.length}) products(+${addedProducts.length} -${removedProducts.length}); see ${diffOutPath}`
      );
      err.exitCode = 2;
      err.diff = diffPayload;
      throw err;
    }
    let nextBuyerN = Object.keys(storedMap.buyers).length + 1;
    for (const b of addedBuyers) {
      storedMap.buyers[b] = `BUY-${String(nextBuyerN++).padStart(4, '0')}`;
    }
    let nextProdN = Object.keys(storedMap.products).length + 1;
    for (const p of addedProducts) {
      storedMap.products[p] = `CAT-${String(nextProdN++).padStart(4, '0')}`;
    }
    fs.writeFileSync(idMapPath, JSON.stringify(storedMap, null, 2) + '\n', 'utf8');
  }

  const customers = extracted.buyers.map(name => ({
    id: storedMap.buyers[resolvedBuyerKey(name)],
    name
  }));

  const products = extracted.rows.map(r => ({
    id: storedMap.products[resolvedProductKey(r.sourceKey)],
    customerId: storedMap.buyers[resolvedBuyerKey(r.customerName)],
    customerName: r.customerName,
    name: r.itemName,
    rawName: r.rawItemName,
    articleCode: r.articleCode,
    rawColor: r.rawColor,
    colorSpec: r.colorSpec,
    sizeFormat: r.sizeFormat,
    rawSizeFormat: r.rawSizeFormat
  }));

  const seed = {
    meta: {
      ...extracted.meta,
      decision1ExcludedR7: true,
      decision2ColorSemantics: 'SINGLE_COMBINED_SPEC',
      decision3SkuGranularity: 'PER_WORKBOOK_ITEM_NAME_715'
    },
    sizeStandards: extracted.sizeStandards,
    customers,
    products
  };

  fs.mkdirSync(path.dirname(seedOutPath), { recursive: true });
  fs.writeFileSync(seedOutPath, JSON.stringify(seed, null, 2) + '\n', 'utf8');
  return seed;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  const args = process.argv.slice(2);
  const init = args.includes('--init');
  const acceptDiff = args.includes('--accept-diff');
  const xlsxArg = args.find(a => !a.startsWith('--'));
  try {
    const seed = buildPersistedCatalog({ xlsxPath: xlsxArg || DEFAULT_XLSX, init, acceptDiff });
    console.log(
      `Catalog seed built OK: buyers=${seed.customers.length}, products=${seed.products.length}, sizeStandards=${seed.sizeStandards.length}, reconciliation=${seed.meta.dataRowsScanned}-${seed.meta.excludedPlaceholders}-${seed.meta.rawDups}=${seed.products.length}`
    );
  } catch (err) {
    console.error(err.message);
    process.exit(err.exitCode || 1);
  }
}
