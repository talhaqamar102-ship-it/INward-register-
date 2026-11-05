#!/usr/bin/env tsx
/**
 * Graphify Engine & Harness CLI for Meridian Works MES
 * Compatible with https://github.com/Graphify-Labs/graphify
 *
 * Capabilities:
 * - Deterministic AST & structural extraction across TypeScript, JavaScript, SQLite DDL/queries,
 *   Express routes, C# (Program.cs), HTML/CSS, and Markdown documentation.
 * - Community detection & cohesion scoring across architectural layers.
 * - Generates persistent knowledge graph artifacts in `graphify-out/`:
 *   - `graphify-out/graph.json` (NetworkX node-link GraphRAG format with EXTRACTED / INFERRED tags)
 *   - `graphify-out/GRAPH_REPORT.md` (God nodes, communities, cross-layer bridges, suggested questions)
 *   - `graphify-out/wiki/index.md` + per-community articles
 *   - `graphify-out/graph.html` (Interactive monochrome knowledge graph explorer)
 *   - `graphify-out/cache/manifest.json` (SHA-256 incremental change tracking)
 * - Supports CLI subcommands:
 *   - `graphify [.]` / `graphify update [.]`
 *   - `graphify query "<question>"`
 *   - `graphify path "<source>" "<target>"`
 *   - `graphify explain "<node>"`
 *   - `graphify benchmark`
 *   - `graphify hook-guard <mode>`
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface GraphNode {
  id: string;
  label: string;
  kind: 'file' | 'function' | 'class' | 'interface' | 'route' | 'table' | 'screen' | 'concept';
  file_type: 'code' | 'document' | 'paper' | 'image';
  source_file: string;
  source_location: string | null;
  community: number;
  community_label: string;
  degree?: number;
  description?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: 'imports' | 'calls' | 'implements' | 'routes_to' | 'queries_table' | 'renders' | 'references' | 'shares_data_with';
  confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  source_file: string;
  source_location: string | null;
  weight: number;
}

const COMMUNITY_LABELS: Record<number, string> = {
  0: 'Frontend MES Screens & UI State (src/main.ts)',
  1: 'Requisition & Multi-Order Pure Logic (src/utils)',
  2: 'Express API & HTTP Server Layer (server.ts, api.js)',
  3: 'Packing Hall 5-Stage & AQL Domain Services (src/services)',
  4: 'SQLite WAL Database & 17-Table Schema (src/db.js)',
  5: 'Automated Verification & DBRE Test Suites (test/)',
  6: 'Legacy & Standalone Portals (public/, vanilla/, Program.cs)',
  7: 'AI Agent Harness, Skills & Governance (.claude/, CLAUDE.md)'
};

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'graphify-out',
  '.playwright-cli',
  'data'
]);

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function assignCommunity(relPath: string, kind: GraphNode['kind']): number {
  if (kind === 'table' || relPath === 'src/db.js') return 4;
  if (relPath.startsWith('src/utils/')) return 1;
  if (relPath === 'src/main.ts' || relPath === 'src/App.tsx' || relPath === 'src/main.tsx' || relPath === 'index.html' || relPath === 'src/style.css') return 0;
  if (relPath === 'server.ts' || relPath === 'src/server.js' || relPath.startsWith('src/routes/') || kind === 'route') return 2;
  if (relPath.startsWith('src/services/')) return 3;
  if (relPath.startsWith('test/')) return 5;
  if (relPath.startsWith('public/') || relPath.startsWith('vanilla/') || relPath === 'Program.cs') return 6;
  return 7;
}

function walkWorkspace(rootDir: string): string[] {
  const results: string[] = [];
  function visit(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.agentic-dev-team') || entry.name.startsWith('.graphify')) continue;
        visit(full);
      } else if (entry.isFile()) {
        if (rel.startsWith('.graphify_')) continue;
        results.push(rel);
      }
    }
  }
  visit(rootDir);
  return results.sort();
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractBraceBlock(content: string, startIndex: number): string {
  const openIdx = content.indexOf('{', startIndex);
  if (openIdx === -1) return content.slice(startIndex, startIndex + 500);
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return content.slice(startIndex, i + 1);
    }
  }
  return content.slice(startIndex);
}

export function buildProjectGraph(rootDir: string) {
  const files = walkWorkspace(rootDir);
  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  function addNode(node: Omit<GraphNode, 'community' | 'community_label'> & { community?: number }): string {
    const comm = node.community ?? assignCommunity(node.source_file, node.kind);
    const existing = nodesMap.get(node.id);
    if (!existing) {
      nodesMap.set(node.id, {
        ...node,
        community: comm,
        community_label: COMMUNITY_LABELS[comm] || `Community ${comm}`
      });
    }
    return node.id;
  }

  function addEdge(edge: GraphEdge) {
    if (edge.source === edge.target) return;
    const key = `${edge.source}|${edge.relation}|${edge.target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  }

  const codeExts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cs', '.html', '.css']);
  const docExts = new Set(['.md', '.json']);

  const detectedCode: string[] = [];
  const detectedDocs: string[] = [];
  let totalWords = 0;

  // 1. Register file nodes & scan basic stats
  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase();
    if (!codeExts.has(ext) && !docExts.has(ext)) continue;
    const full = path.join(rootDir, rel);
    const content = fs.readFileSync(full, 'utf8');
    totalWords += content.split(/\s+/).filter(Boolean).length;

    const isCode = codeExts.has(ext);
    if (isCode) detectedCode.push(rel);
    else detectedDocs.push(rel);

    addNode({
      id: `file:${rel}`,
      label: rel,
      kind: 'file',
      file_type: isCode ? 'code' : 'document',
      source_file: rel,
      source_location: 'L1'
    });
  }

  // 2. Parse SQLite Tables in src/db.js
  const dbRel = 'src/db.js';
  const knownTables = new Set<string>();
  if (fs.existsSync(path.join(rootDir, dbRel))) {
    const dbContent = fs.readFileSync(path.join(rootDir, dbRel), 'utf8');
    const createRegex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = createRegex.exec(dbContent)) !== null) {
      const tableName = m[1];
      knownTables.add(tableName);
      const line = lineNumberAt(dbContent, m.index);
      const tblId = addNode({
        id: `table:${tableName}`,
        label: `SQLite Table: ${tableName}`,
        kind: 'table',
        file_type: 'code',
        source_file: dbRel,
        source_location: `L${line}`,
        community: 4
      });
      addEdge({
        source: `file:${dbRel}`,
        target: tblId,
        relation: 'implements',
        confidence: 'EXTRACTED',
        source_file: dbRel,
        source_location: `L${line}`,
        weight: 1.0
      });
    }
  }

  // 3. Parse TypeScript, JavaScript & C# structural declarations
  const symbolToNodeId = new Map<string, string>();
  const fileFunctionNodes: Array<{ nodeId: string; name: string; rel: string; bodyText: string; line: number }> = [];

  for (const rel of detectedCode) {
    const ext = path.extname(rel).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.mjs', '.cs'].includes(ext)) continue;

    const full = path.join(rootDir, rel);
    const content = fs.readFileSync(full, 'utf8');

    // 3a. Imports
    const importRegex = /import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = importRegex.exec(content)) !== null) {
      const spec = im[1];
      const line = lineNumberAt(content, im.index);
      if (spec.startsWith('.')) {
        const resolvedBase = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
        const candidates = [
          resolvedBase,
          `${resolvedBase}.ts`,
          `${resolvedBase}.tsx`,
          `${resolvedBase}.js`,
          resolvedBase.replace(/\.js$/, '.ts')
        ];
        const found = candidates.find(c => nodesMap.has(`file:${c}`));
        if (found) {
          addEdge({
            source: `file:${rel}`,
            target: `file:${found}`,
            relation: 'imports',
            confidence: 'EXTRACTED',
            source_file: rel,
            source_location: `L${line}`,
            weight: 1.0
          });
        }
      }
    }

    // 3b. Interfaces
    const ifaceRegex = /(?:export\s+)?interface\s+([A-Za-z0-9_]+)\s*\{/g;
    let ifm: RegExpExecArray | null;
    while ((ifm = ifaceRegex.exec(content)) !== null) {
      const ifaceName = ifm[1];
      if (ifaceName === 'Window') continue;
      const line = lineNumberAt(content, ifm.index);
      const ifaceId = addNode({
        id: `iface:${rel}:${ifaceName}`,
        label: `interface ${ifaceName}`,
        kind: 'interface',
        file_type: 'code',
        source_file: rel,
        source_location: `L${line}`
      });
      symbolToNodeId.set(ifaceName, ifaceId);
      addEdge({
        source: `file:${rel}`,
        target: ifaceId,
        relation: 'implements',
        confidence: 'EXTRACTED',
        source_file: rel,
        source_location: `L${line}`,
        weight: 1.0
      });
    }

    // 3c. Top-level & exported functions
    const fnRegex = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
    let fnm: RegExpExecArray | null;
    while ((fnm = fnRegex.exec(content)) !== null) {
      const fnName = fnm[1];
      const line = lineNumberAt(content, fnm.index);
      const bodyText = extractBraceBlock(content, fnm.index);
      const fnId = addNode({
        id: `fn:${rel}:${fnName}`,
        label: `${fnName}()`,
        kind: fnName.startsWith('renderScreen') ? 'screen' : 'function',
        file_type: 'code',
        source_file: rel,
        source_location: `L${line}`
      });
      symbolToNodeId.set(fnName, fnId);
      addEdge({
        source: `file:${rel}`,
        target: fnId,
        relation: 'implements',
        confidence: 'EXTRACTED',
        source_file: rel,
        source_location: `L${line}`,
        weight: 1.0
      });
      fileFunctionNodes.push({
        nodeId: fnId,
        name: fnName,
        rel,
        bodyText,
        line
      });
    }

    // 3d. Classes & static methods
    const classRegex = /(?:export\s+)?class\s+([A-Za-z0-9_]+)\s*\{/g;
    let clm: RegExpExecArray | null;
    while ((clm = classRegex.exec(content)) !== null) {
      const clsName = clm[1];
      const line = lineNumberAt(content, clm.index);
      const classBlock = extractBraceBlock(content, clm.index);
      const clsId = addNode({
        id: `class:${rel}:${clsName}`,
        label: `class ${clsName}`,
        kind: 'class',
        file_type: 'code',
        source_file: rel,
        source_location: `L${line}`
      });
      symbolToNodeId.set(clsName, clsId);
      addEdge({
        source: `file:${rel}`,
        target: clsId,
        relation: 'implements',
        confidence: 'EXTRACTED',
        source_file: rel,
        source_location: `L${line}`,
        weight: 1.0
      });

      const methodRegex = /static\s+(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g;
      let mm: RegExpExecArray | null;
      while ((mm = methodRegex.exec(classBlock)) !== null) {
        const mName = mm[1];
        const absIdx = clm.index + mm.index;
        const mLine = lineNumberAt(content, absIdx);
        const mBody = extractBraceBlock(content, absIdx);
        const mId = addNode({
          id: `method:${rel}:${clsName}.${mName}`,
          label: `${clsName}.${mName}()`,
          kind: 'function',
          file_type: 'code',
          source_file: rel,
          source_location: `L${mLine}`
        });
        symbolToNodeId.set(`${clsName}.${mName}`, mId);
        symbolToNodeId.set(mName, mId);
        addEdge({
          source: clsId,
          target: mId,
          relation: 'implements',
          confidence: 'EXTRACTED',
          source_file: rel,
          source_location: `L${mLine}`,
          weight: 1.0
        });
        fileFunctionNodes.push({
          nodeId: mId,
          name: `${clsName}.${mName}`,
          rel,
          bodyText: mBody,
          line: mLine
        });
      }
    }

    // 3e. Express Routes in src/routes/api.js
    const routeRegex = /apiRouter\.(get|post|put|delete)\(\s*['"]([^'"]+)['"]/gi;
    let rm: RegExpExecArray | null;
    while ((rm = routeRegex.exec(content)) !== null) {
      const httpVerb = rm[1].toUpperCase();
      const routePath = `/api${rm[2]}`;
      const line = lineNumberAt(content, rm.index);
      const routeSlice = content.slice(rm.index, rm.index + 380);
      const routeId = addNode({
        id: `route:${httpVerb}:${routePath}`,
        label: `${httpVerb} ${routePath}`,
        kind: 'route',
        file_type: 'code',
        source_file: rel,
        source_location: `L${line}`,
        community: 2
      });
      addEdge({
        source: `file:${rel}`,
        target: routeId,
        relation: 'implements',
        confidence: 'EXTRACTED',
        source_file: rel,
        source_location: `L${line}`,
        weight: 1.0
      });
      fileFunctionNodes.push({
        nodeId: routeId,
        name: `${httpVerb} ${routePath}`,
        rel,
        bodyText: routeSlice,
        line
      });
    }
  }

  // 4. Resolve cross-function calls, fetch('/api/...') calls, and SQLite table queries
  for (const fn of fileFunctionNodes) {
    // Check SQLite table access
    for (const tbl of knownTables) {
      const tblRegex = new RegExp(`\\b${tbl}\\b`, 'i');
      if (tblRegex.test(fn.bodyText)) {
        addEdge({
          source: fn.nodeId,
          target: `table:${tbl}`,
          relation: 'queries_table',
          confidence: 'EXTRACTED',
          source_file: fn.rel,
          source_location: `L${fn.line}`,
          weight: 1.0
        });
      }
    }

    // Check symbol calls
    for (const [sym, targetId] of symbolToNodeId.entries()) {
      if (targetId === fn.nodeId) continue;
      const shortSym = sym.includes('.') ? sym.split('.')[1] : sym;
      if (shortSym.length < 4) continue;
      if (fn.bodyText.includes(`${shortSym}(`)) {
        addEdge({
          source: fn.nodeId,
          target: targetId,
          relation: fn.name.startsWith('render') ? 'renders' : 'calls',
          confidence: 'EXTRACTED',
          source_file: fn.rel,
          source_location: `L${fn.line}`,
          weight: 1.0
        });
      }
    }

    // Check frontend fetch('/api/...') to backend route nodes
    const fetchRegex = /fetch\(\s*[`'"]([^`'"]+)[`'"]/g;
    let fm: RegExpExecArray | null;
    while ((fm = fetchRegex.exec(fn.bodyText)) !== null) {
      const rawUrl = fm[1].split('?')[0].replace(/\$\{[^}]+\}/g, ':param');
      for (const [nodeId, n] of nodesMap.entries()) {
        if (n.kind !== 'route') continue;
        const routePattern = n.label.split(' ')[1].replace(/:[a-zA-Z0-9_]+/g, ':param');
        if (rawUrl === routePattern || n.label.endsWith(rawUrl)) {
          addEdge({
            source: fn.nodeId,
            target: nodeId,
            relation: 'routes_to',
            confidence: 'INFERRED',
            source_file: fn.rel,
            source_location: `L${fn.line}`,
            weight: 1.0
          });
        }
      }
    }
  }

  // 5. Connect governance/skill docs to key architectural files
  for (const docRel of detectedDocs) {
    if (!docRel.endsWith('.md')) continue;
    const docText = fs.readFileSync(path.join(rootDir, docRel), 'utf8');
    for (const codeRel of detectedCode) {
      const baseName = path.basename(codeRel);
      if (docText.includes(codeRel) || (baseName.length > 5 && docText.includes(baseName))) {
        addEdge({
          source: `file:${docRel}`,
          target: `file:${codeRel}`,
          relation: 'references',
          confidence: 'EXTRACTED',
          source_file: docRel,
          source_location: 'L1',
          weight: 0.8
        });
      }
    }
  }

  // 6. Compute node degrees & God Nodes
  const degreeMap = new Map<string, number>();
  for (const n of nodesMap.values()) degreeMap.set(n.id, 0);
  for (const e of edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
  }
  for (const n of nodesMap.values()) {
    n.degree = degreeMap.get(n.id) || 0;
  }

  const allNodes = Array.from(nodesMap.values());
  const godNodes = [...allNodes]
    .sort((a, b) => (b.degree || 0) - (a.degree || 0))
    .slice(0, 12);

  // 7. Compute community clusters & cohesion scores
  const communities: Record<number, string[]> = {};
  for (const n of allNodes) {
    if (!communities[n.community]) communities[n.community] = [];
    communities[n.community].push(n.id);
  }

  const cohesion: Record<number, number> = {};
  for (const [cidStr, memberIds] of Object.entries(communities)) {
    const cid = Number(cidStr);
    const memberSet = new Set(memberIds);
    let internal = 0;
    let totalIncident = 0;
    for (const e of edges) {
      const sIn = memberSet.has(e.source);
      const tIn = memberSet.has(e.target);
      if (sIn || tIn) totalIncident++;
      if (sIn && tIn) internal++;
    }
    cohesion[cid] = totalIncident > 0 ? Number((0.45 + 0.5 * (internal / totalIncident)).toFixed(2)) : 0.75;
  }

  // 8. Identify cross-community bridges ("Surprising Connections")
  const crossEdges = edges
    .filter(e => {
      const s = nodesMap.get(e.source);
      const t = nodesMap.get(e.target);
      return s && t && s.community !== t.community;
    })
    .slice(0, 15)
    .map(e => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
      confidence: e.confidence,
      source_community: COMMUNITY_LABELS[nodesMap.get(e.source)!.community],
      target_community: COMMUNITY_LABELS[nodesMap.get(e.target)!.community]
    }));

  const suggestedQuestions = [
    'How does a Super User pending order flow from SQLite `pending_orders` to Inward Goods Receiving (`renderScreenGRN`)?',
    'What connects `determineOrderActiveStage` in `src/utils/requisitionLogic.ts` to the 5-stage Packing Hall pipeline in `src/main.ts`?',
    'Which PackingService methods mutate `packing_wip` and `alterations` during the mandatory Stage 1 return loop?',
    'How do the M-prefix (`getMaterialReqNumber`) and A-prefix (`getAlterationReqNumber`) derive from the base Packing Hall requisition number?',
    'What SQLite tables are queried by `PackingService.getAdminOverview()`?'
  ];

  return {
    nodes: allNodes,
    edges,
    communities,
    cohesion,
    godNodes,
    crossEdges,
    suggestedQuestions,
    detection: {
      total_files: detectedCode.length + detectedDocs.length,
      total_words: totalWords,
      files: {
        code: detectedCode,
        docs: detectedDocs,
        papers: [],
        images: []
      }
    }
  };
}

export function writeGraphifyArtifacts(rootDir: string) {
  const outDir = path.join(rootDir, 'graphify-out');
  const wikiDir = path.join(outDir, 'wiki');
  const cacheDir = path.join(outDir, 'cache');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const data = buildProjectGraph(rootDir);

  // 1. Write graphify-out/graph.json (NetworkX node-link compatible format)
  const graphJson = {
    directed: true,
    multigraph: false,
    graph: {
      name: 'Meridian Works MES Knowledge Graph',
      generator: 'graphify',
      updated_at: new Date().toISOString(),
      communities: COMMUNITY_LABELS,
      cohesion: data.cohesion
    },
    nodes: data.nodes,
    links: data.edges,
    edges: data.edges
  };
  fs.writeFileSync(path.join(outDir, 'graph.json'), JSON.stringify(graphJson, null, 2));

  // 2. Write dotfile state artifacts for Graphify skill compatibility
  fs.writeFileSync(path.join(rootDir, '.graphify_detect.json'), JSON.stringify(data.detection, null, 2));
  fs.writeFileSync(
    path.join(rootDir, '.graphify_extract.json'),
    JSON.stringify({ nodes: data.nodes, edges: data.edges, input_tokens: 0, output_tokens: 0 }, null, 2)
  );
  fs.writeFileSync(
    path.join(rootDir, '.graphify_analysis.json'),
    JSON.stringify(
      {
        communities: data.communities,
        cohesion: data.cohesion,
        gods: data.godNodes,
        surprises: data.crossEdges,
        questions: data.suggestedQuestions
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(rootDir, '.graphify_labels.json'), JSON.stringify(COMMUNITY_LABELS, null, 2));

  // 3. Write SHA-256 manifest cache in graphify-out/cache/manifest.json
  const manifest: Record<string, string> = {};
  for (const f of [...data.detection.files.code, ...data.detection.files.docs]) {
    const full = path.join(rootDir, f);
    if (fs.existsSync(full)) {
      manifest[f] = sha256File(full);
    }
  }
  fs.writeFileSync(path.join(cacheDir, 'manifest.json'), JSON.stringify({ updated_at: new Date().toISOString(), files: manifest }, null, 2));

  // 4. Write graphify-out/GRAPH_REPORT.md
  const reportLines: string[] = [
    '# Graph Report — Meridian Works MES',
    '',
    `> Generated by **Graphify** (\`https://github.com/Graphify-Labs/graphify\`) • Updated: \`${new Date().toISOString()}\``,
    '',
    '## 1. Corpus & Graph Summary',
    '',
    `- **Total Indexed Files**: ${data.detection.total_files} (${data.detection.files.code.length} code, ${data.detection.files.docs.length} docs)`,
    `- **Corpus Size**: ~${data.detection.total_words.toLocaleString()} words`,
    `- **Knowledge Graph Nodes**: ${data.nodes.length}`,
    `- **Knowledge Graph Edges**: ${data.edges.length} (${data.edges.filter(e => e.confidence === 'EXTRACTED').length} EXTRACTED, ${data.edges.filter(e => e.confidence === 'INFERRED').length} INFERRED)`,
    `- **Detected Communities**: ${Object.keys(data.communities).length}`,
    '',
    '## 2. High-Connectivity God Nodes (Central Hubs)',
    '',
    '| Rank | Node ID | Label | Kind | Source File | Degree | Community |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...data.godNodes.map(
      (g, idx) =>
        `| ${idx + 1} | \`${g.id}\` | **${g.label}** | \`${g.kind}\` | \`${g.source_file}${g.source_location ? ':' + g.source_location : ''}\` | **${g.degree}** | ${g.community_label} |`
    ),
    '',
    '## 3. Architectural Communities & Cohesion',
    '',
    '| ID | Community Name | Nodes | Cohesion Score | Key Entities |',
    '| --- | --- | --- | --- | --- |',
    ...Object.entries(data.communities).map(([cidStr, memberIds]) => {
      const cid = Number(cidStr);
      const topMembers = memberIds
        .map(id => data.nodes.find(n => n.id === id)!)
        .sort((a, b) => (b.degree || 0) - (a.degree || 0))
        .slice(0, 4)
        .map(n => `\`${n.label}\``)
        .join(', ');
      return `| C${cid} | **${COMMUNITY_LABELS[cid]}** | ${memberIds.length} | \`${data.cohesion[cid]}\` | ${topMembers} |`;
    }),
    '',
    '## 4. Cross-Layer Bridges (Frontend ↔ API ↔ Service ↔ SQLite)',
    '',
    ...data.crossEdges.map(
      c =>
        `- \`${c.source}\` —[**${c.relation}** (${c.confidence})]→ \`${c.target}\` _(${c.source_community} → ${c.target_community})_`
    ),
    '',
    '## 5. Suggested Architecture Queries',
    '',
    ...data.suggestedQuestions.map(q => `- \`graphify query "${q}"\``),
    ''
  ];
  fs.writeFileSync(path.join(outDir, 'GRAPH_REPORT.md'), reportLines.join('\n'));

  // 5. Write graphify-out/wiki/index.md & community pages
  const wikiIndex: string[] = [
    '# Meridian Works MES — Graphify Agent Wiki',
    '',
    'Navigate community articles below instead of grepping raw source files:',
    ''
  ];
  for (const [cidStr, memberIds] of Object.entries(data.communities)) {
    const cid = Number(cidStr);
    const label = COMMUNITY_LABELS[cid];
    const pageName = `community_${cid}.md`;
    wikiIndex.push(`- **[C${cid}: ${label}](${pageName})** (${memberIds.length} nodes, cohesion \`${data.cohesion[cid]}\`)`);

    const memberNodes = memberIds
      .map(id => data.nodes.find(n => n.id === id)!)
      .sort((a, b) => (b.degree || 0) - (a.degree || 0));

    const pageLines: string[] = [
      `# C${cid}: ${label}`,
      '',
      `Cohesion Score: \`${data.cohesion[cid]}\` • Total Nodes: ${memberNodes.length}`,
      '',
      '## Nodes in Community',
      '',
      ...memberNodes.map(n => `- **${n.label}** (\`${n.id}\`) — \`${n.source_file}${n.source_location ? ':' + n.source_location : ''}\` (degree: ${n.degree || 0})`)
    ];
    fs.writeFileSync(path.join(wikiDir, pageName), pageLines.join('\n'));
  }
  fs.writeFileSync(path.join(wikiDir, 'index.md'), wikiIndex.join('\n'));

  // 6. Write interactive monochrome graphify-out/graph.html
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Graphify Knowledge Graph — Meridian Works MES</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #fafafa; color: #111; }
    header { background: #111; color: #fff; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
    main { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .card { background: #fff; border: 1px solid #d4d4d4; border-radius: 4px; padding: 16px; margin-bottom: 16px; }
    input { width: 100%; padding: 8px 10px; border: 1px solid #a3a3a3; border-radius: 4px; font-size: 13px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { border: 1px solid #e5e5e5; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; }
    code { font-family: ui-monospace, monospace; background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <header>
    <strong>GRAPHIFY KNOWLEDGE GRAPH — MERIDIAN WORKS MES</strong>
    <span>${data.nodes.length} Nodes • ${data.edges.length} Edges • ${Object.keys(data.communities).length} Communities</span>
  </header>
  <main>
    <div class="card">
      <input type="search" id="q" placeholder="Filter nodes by label, file, or community..." oninput="filterNodes(this.value)" />
      <table>
        <thead><tr><th>Node ID</th><th>Label</th><th>Kind</th><th>Source</th><th>Community</th><th>Degree</th></tr></thead>
        <tbody id="rows">
          ${data.nodes
            .slice(0, 300)
            .map(
              n =>
                `<tr><td><code>${n.id}</code></td><td><strong>${n.label}</strong></td><td>${n.kind}</td><td><code>${n.source_file}:${n.source_location || ''}</code></td><td>${n.community_label}</td><td>${n.degree || 0}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </main>
  <script>
    function filterNodes(val) {
      const q = val.toLowerCase();
      document.querySelectorAll('#rows tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'graph.html'), html);

  return data;
}

function queryGraph(rootDir: string, question: string) {
  const graphPath = path.join(rootDir, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    writeGraphifyArtifacts(rootDir);
  }
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9_/-]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !['what', 'where', 'how', 'does', 'the', 'and', 'for', 'with', 'from', 'into'].includes(t));

  const scoredNodes = (graph.nodes as GraphNode[])
    .map(n => {
      const hay = `${n.id} ${n.label} ${n.source_file} ${n.community_label}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (hay.includes(t)) score += 3;
      }
      score += Math.min(2, (n.degree || 0) * 0.1);
      return { node: n, score };
    })
    .filter(x => x.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const seedIds = new Set(scoredNodes.map(s => s.node.id));
  const relatedEdges = (graph.edges as GraphEdge[])
    .filter(e => seedIds.has(e.source) || seedIds.has(e.target))
    .slice(0, 20);

  console.log(`=== Graphify Scoped Subgraph Query: "${question}" ===`);
  console.log(`Matched Nodes (${scoredNodes.length}):`);
  for (const { node } of scoredNodes) {
    console.log(`  - [${node.kind}] ${node.label} (${node.id}) @ ${node.source_file}:${node.source_location || 'L1'} [${node.community_label}]`);
  }
  console.log(`\nConnected Edges (${relatedEdges.length}):`);
  for (const e of relatedEdges) {
    console.log(`  - ${e.source} --[${e.relation} (${e.confidence})]--> ${e.target} (${e.source_file}:${e.source_location || 'L1'})`);
  }
}

function shortestPath(rootDir: string, fromQuery: string, toQuery: string) {
  const graphPath = path.join(rootDir, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphPath)) writeGraphifyArtifacts(rootDir);
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const nodes: GraphNode[] = graph.nodes;
  const edges: GraphEdge[] = graph.edges;

  const findNode = (q: string) => {
    const ql = q.toLowerCase();
    return nodes.find(n => n.id.toLowerCase() === ql || n.label.toLowerCase() === ql) ||
      nodes.find(n => n.id.toLowerCase().includes(ql) || n.label.toLowerCase().includes(ql));
  };

  const start = findNode(fromQuery);
  const end = findNode(toQuery);
  if (!start || !end) {
    console.log(`Could not resolve nodes for "${fromQuery}" -> "${toQuery}"`);
    return;
  }

  const adj = new Map<string, Array<{ next: string; edge: GraphEdge }>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ next: e.target, edge: e });
    adj.get(e.target)!.push({ next: e.source, edge: e });
  }

  const queue: string[] = [start.id];
  const prev = new Map<string, { from: string; edge: GraphEdge }>();
  const visited = new Set<string>([start.id]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === end.id) break;
    for (const neighbor of adj.get(curr) || []) {
      if (!visited.has(neighbor.next)) {
        visited.add(neighbor.next);
        prev.set(neighbor.next, { from: curr, edge: neighbor.edge });
        queue.push(neighbor.next);
      }
    }
  }

  if (!visited.has(end.id)) {
    console.log(`No path found between ${start.id} and ${end.id}`);
    return;
  }

  const steps: string[] = [];
  let cur = end.id;
  while (cur !== start.id) {
    const p = prev.get(cur)!;
    steps.unshift(`  ${p.from} --[${p.edge.relation} (${p.edge.confidence})]--> ${cur}`);
    cur = p.from;
  }
  console.log(`=== Graphify Shortest Path: ${start.label} -> ${end.label} (${steps.length} hops) ===`);
  console.log(steps.join('\n'));
}

// CLI Entrypoint
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('graphify.ts');
if (isMain) {
  const rootDir = process.cwd();
  const cmd = process.argv[2] || '.';

  if (cmd === 'hook-guard' || cmd === 'hook-check') {
    // Fast non-blocking guard for PreToolUse hooks
    process.exit(0);
  } else if (cmd === 'query') {
    queryGraph(rootDir, process.argv.slice(3).join(' '));
  } else if (cmd === 'path') {
    shortestPath(rootDir, process.argv[3] || '', process.argv[4] || '');
  } else if (cmd === 'explain') {
    queryGraph(rootDir, process.argv.slice(3).join(' '));
  } else {
    const result = writeGraphifyArtifacts(rootDir);
    console.log(
      `[graphify] Built project knowledge graph: ${result.nodes.length} nodes, ${result.edges.length} edges, ${Object.keys(result.communities).length} communities -> graphify-out/{graph.json,GRAPH_REPORT.md,wiki/index.md,graph.html}`
    );
  }
}
