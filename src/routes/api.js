import { Router } from 'express';
import { PackingService } from '../services/packingService.js';
import { AQLService } from '../services/aqlService.js';
import { AuthService } from '../services/authService.js';

export const apiRouter = Router();

// Wrap async handlers with HTTP status code support (403 for RBAC, 400 for validation)
const handle = (fn) => async (req, res) => {
  try {
    const result = await fn(req, res);
    res.json({ success: true, data: result });
  } catch (err) {
    const code = err.statusCode || 400;
    res.status(code).json({ success: false, error: err.message });
  }
};

const SESSION_COOKIE = 'mes_session';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function readSessionToken(req) {
  const cookie = req.headers.cookie || '';
  const entry = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) return '';
  try {
    return decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1));
  } catch {
    return '';
  }
}

function isHttpsRequest(req) {
  if (req?.secure) return true;
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwardedProto === 'https';
}

function setSessionCookie(req, res, token) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.append('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`);
}

function clearSessionCookie(req, res) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

function authError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getAllowedRoles(req) {
  const { method, path } = req;
  if (path === '/admin/pending-orders' && method === 'GET') return ['SUPER_USER', 'INWARD_CLERK', 'PACKING_SUPERVISOR'];
  if (path.startsWith('/admin/')) return ['SUPER_USER'];
  if (path === '/store/dropdowns' && method === 'GET') {
    return ['SUPER_USER', 'INWARD_CLERK', 'ALTERATION_LEAD'];
  }
  if (path.startsWith('/store/receivings')) {
    if (path.endsWith('/void')) return ['SUPER_USER'];
    return ['SUPER_USER', 'INWARD_CLERK'];
  }
  if (/^\/orders\/[^/]+\/requisitions$/.test(path) && method === 'POST') return ['SUPER_USER', 'PACKING_SUPERVISOR'];
  if (/^\/orders\/[^/]+\/issue-req$/.test(path)) return ['SUPER_USER', 'INWARD_CLERK'];
  if (path === '/requisitions' || /^\/requisitions\/[^/]+$/.test(path)) {
    if (method === 'GET') return ['SUPER_USER', 'INWARD_CLERK', 'PACKING_SUPERVISOR'];
    if (method === 'POST' && path === '/requisitions') return ['SUPER_USER', 'PACKING_SUPERVISOR'];
    if (method === 'POST') return ['SUPER_USER', 'INWARD_CLERK'];
  }
  if (/^\/requisitions\/[^/]+\/void$/.test(path)) return ['SUPER_USER'];
  if (/^\/wip\/[^/]+\/final-inspection$/.test(path) || /^\/qc\/[^/]+\/aql-audit$/.test(path)) {
    return ['SUPER_USER', 'QC_INSPECTOR'];
  }
  if (/^\/wip\/[^/]+\/(step[1-5]-[^/]+|material-requisition)$/.test(path)) {
    return ['SUPER_USER', 'PACKING_SUPERVISOR'];
  }
  if (/^\/material-requisitions\/[^/]+\/issue$/.test(path)) {
    return ['SUPER_USER', 'PACKING_SUPERVISOR'];
  }
  if (path === '/material-requisitions' && method === 'GET') {
    return ['SUPER_USER', 'PACKING_SUPERVISOR'];
  }
  if (path === '/alterations' || /^\/alterations\/(?:assign|[^/]+\/(?:return|repair))$/.test(path)) {
    return ['SUPER_USER', 'ALTERATION_LEAD', 'INWARD_CLERK'];
  }
  if (path === '/materials/return' || /^\/bom\/[^/]+$/.test(path)) {
    return ['SUPER_USER', 'PACKING_SUPERVISOR'];
  }
  if (path === '/qc/aql-calc' || /^\/export\/manifest\/[^/]+$/.test(path)) {
    return ['SUPER_USER', 'PACKING_SUPERVISOR', 'QC_INSPECTOR'];
  }
  if (path === '/inventory/gloves' || path === '/inventory/materials' || path === '/customers' || path === '/products' || path === '/size-standards') {
    return ['SUPER_USER', 'INWARD_CLERK', 'PACKING_SUPERVISOR', 'QC_INSPECTOR', 'ALTERATION_LEAD'];
  }
  return [];
}

const getActorMeta = req => ({
  actor: req.authUser.name,
  role: req.authUser.role
});

apiRouter.get('/auth/status', handle(req => ({
  initialized: AuthService.hasUsers(),
  user: AuthService.getSessionUser(readSessionToken(req))
})));

apiRouter.post('/auth/bootstrap', handle((req, res) => {
  const user = AuthService.createInitialSuperUser(req.body || {});
  const session = AuthService.createSession(user.userId);
  setSessionCookie(req, res, session.token);
  return { user };
}));

apiRouter.post('/auth/login', handle((req, res) => {
  const user = AuthService.verifyCredentials(req.body?.username, req.body?.password);
  if (!user) throw authError('Username or password is incorrect.', 401);
  const session = AuthService.createSession(user.userId);
  setSessionCookie(req, res, session.token);
  return { user };
}));

apiRouter.post('/auth/logout', handle((req, res) => {
  AuthService.destroySession(readSessionToken(req));
  clearSessionCookie(req, res);
  return { loggedOut: true };
}));

apiRouter.use((req, res, next) => {
  const user = AuthService.getSessionUser(readSessionToken(req));
  if (!user) {
    res.status(401).json({ success: false, error: 'Please sign in to continue.' });
    return;
  }
  req.authUser = user;
  const allowedRoles = getAllowedRoles(req);
  if (!allowedRoles.includes(user.role)) {
    res.status(403).json({ success: false, error: 'Your account does not have access to this station action.' });
    return;
  }
  next();
});

// --- INVENTORY & MASTERS ---
apiRouter.get('/inventory/gloves', handle(() => PackingService.getGloveInventory()));
apiRouter.get('/inventory/materials', handle(() => PackingService.getMaterialInventory()));
apiRouter.get('/customers', handle(() => PackingService.getCustomers()));
apiRouter.get('/products', handle((req) => PackingService.getProducts(req.query.customerId)));
apiRouter.get('/size-standards', handle(() => PackingService.getSizeStandards()));

// --- GLOVE REQUISITIONS ---
apiRouter.get('/requisitions', handle(() => PackingService.getRequisitions()));
apiRouter.get('/requisitions/:reqNo', handle((req) => PackingService.getRequisition(req.params.reqNo)));
apiRouter.post('/orders/:orderId/requisitions', handle((req) => {
  const { actor, role } = getActorMeta(req);
  return PackingService.createOrderRequisition(req.params.orderId, req.body?.sizes, actor, role);
}));
apiRouter.post('/requisitions', handle((req) => {
  const { customerId, productId, requestedPairs, notes } = req.body;
  if (!customerId || !productId || !requestedPairs) {
    throw new Error('customerId, productId, and requestedPairs are required');
  }
  return PackingService.createGloveRequisition(customerId, productId, Number(requestedPairs), notes);
}));

// --- STORE KEEPER ISSUANCE ---
apiRouter.post('/requisitions/:reqNo/issue', handle((req) => {
  return PackingService.issueGloveRequisition(req.params.reqNo);
}));

// --- TRANSACTIONAL ORDER-TO-REQ DOCK ISSUANCE (10.1 & 10.4) ---
apiRouter.post('/orders/:orderId/issue-req', handle((req) => {
  const { actor, role } = getActorMeta(req, 'INWARD_CLERK');
  const { reqNumber, requestedPairs } = req.body;
  return PackingService.issueOrderRequisitionTransactional({
    orderId: req.params.orderId,
    reqNumber,
    requestedPairs: Number(requestedPairs || 0),
    actor,
    role
  });
}));

// --- WIP 5 STAGES ---
apiRouter.post('/wip/:reqNo/step1-checking', handle((req) => {
  const { goodPairs, defectPairs, defectReason } = req.body;
  return PackingService.executeStep1Checking(
    req.params.reqNo,
    Number(goodPairs || 0),
    Number(defectPairs || 0),
    defectReason
  );
}));

apiRouter.post('/wip/:reqNo/step2-ironing', handle((req) => {
  const { goodPairs, defectPairs, defectReason } = req.body;
  return PackingService.executeStep2Ironing(
    req.params.reqNo,
    Number(goodPairs || 0),
    Number(defectPairs || 0),
    defectReason
  );
}));

apiRouter.post('/wip/:reqNo/step3-matching', handle((req) => {
  const { goodPairs, defectPairs, defectReason } = req.body;
  return PackingService.executeStep3Matching(
    req.params.reqNo,
    Number(goodPairs || 0),
    Number(defectPairs || 0),
    defectReason
  );
}));

// --- PACKING MATERIALS REQUISITION ---
apiRouter.post('/wip/:reqNo/material-requisition', handle((req) => {
  return PackingService.createMaterialRequisition(req.params.reqNo);
}));

apiRouter.get('/material-requisitions', handle(() => PackingService.getMaterialRequisitions()));

apiRouter.post('/material-requisitions/:matReqNo/issue', handle((req) => {
  return PackingService.issueMaterialRequisition(req.params.matReqNo);
}));

// --- STEP 4 & STEP 5 ---
apiRouter.post('/wip/:reqNo/step4-packing', handle((req) => {
  const { packedPairs } = req.body;
  return PackingService.executeStep4FirstPacking(req.params.reqNo, Number(packedPairs));
}));

apiRouter.post('/wip/:reqNo/step5-cartons', handle((req) => {
  const { pairsPerCarton, enforcePreStage5AqlGate } = req.body;
  return PackingService.executeStep5SecondPacking(
    req.params.reqNo,
    pairsPerCarton ? Number(pairsPerCarton) : null,
    { enforcePreStage5AqlGate: Boolean(enforcePreStage5AqlGate) }
  );
}));

apiRouter.post('/wip/:reqNo/step5-cartons-gated', handle((req) => {
  const { role } = getActorMeta(req, 'PACKING_SUPERVISOR');
  PackingService.enforceRolePermission(role, 'STAGE_5_CARTON_SEAL');
  const { pairsPerCarton } = req.body;
  return PackingService.executeStep5SecondPacking(
    req.params.reqNo,
    pairsPerCarton ? Number(pairsPerCarton) : null,
    { enforcePreStage5AqlGate: true }
  );
}));

// --- FINAL QC INSPECTION ---
apiRouter.post('/wip/:reqNo/final-inspection', handle((req) => {
  const { cartonsChecked, defectivePairs, defectNotes } = req.body;
  return PackingService.executeFinalInspection(
    req.params.reqNo,
    Number(cartonsChecked),
    Number(defectivePairs || 0),
    defectNotes
  );
}));

// --- ALTERATION & REPAIR LOOP (ALWAYS RETURNS TO STEP 1) ---
apiRouter.get('/alterations', handle((req) => PackingService.getAlterations(req.query.reqNo)));
apiRouter.post('/alterations/:id/return', handle((req) => {
  return PackingService.returnAlteration(Number(req.params.id));
}));

// --- STORE MANAGER INWARD SHIPMENTS / RECEIVINGS ---
apiRouter.get('/store/receivings', handle((req) => {
  return PackingService.getReceivings({
    date: req.query.date,
    customer: req.query.customer,
    maker: req.query.maker,
    search: req.query.search
  });
}));

apiRouter.post('/store/receivings', handle((req) => {
  return PackingService.createReceiving(req.body);
}));

apiRouter.post('/store/receivings/:rcvNo/void', handle((req) => {
  const { actor, role } = getActorMeta(req, 'SUPER_USER');
  return PackingService.voidReceivingGrn(req.params.rcvNo, req.body?.reason, actor, role);
}));

apiRouter.post('/requisitions/:reqNo/void', handle((req) => {
  const { actor, role } = getActorMeta(req, 'SUPER_USER');
  return PackingService.voidGloveRequisition(req.params.reqNo, req.body?.reason, actor, role);
}));

apiRouter.get('/store/dropdowns', handle(() => {
  return PackingService.getReceivingDropdowns();
}));

// --- PACKAGING BOM LOOKUP ---
apiRouter.get('/bom/:productId', handle((req) => {
  return PackingService.getPackagingBOM(req.params.productId, req.query.pairsCount);
}));

// --- MATERIAL RETURN VOUCHER (MRV) ---
apiRouter.post('/materials/return', handle((req) => {
  const { matReqNumber, materialCode, returnedQty, returnReason } = req.body;
  return PackingService.createMaterialReturnVoucher(matReqNumber, materialCode, returnedQty, returnReason);
}));

// --- ALTERATION REWORK ATTRIBUTION (TAILOR & MAX 2-REWORK SCRAP) ---
apiRouter.post('/alterations/assign', handle((req) => {
  const { reqNumber, tailorName, alterationId, pairsCount } = req.body || {};
  return PackingService.assignAlterationTailor(
    reqNumber,
    tailorName,
    alterationId,
    pairsCount != null ? Number(pairsCount) : null
  );
}));

apiRouter.post('/alterations/:id/repair', handle((req) => {
  const { tailorName, isScrap, deductionRate, pairsCount } = req.body || {};
  return PackingService.completeAlterationRepair(
    Number(req.params.id),
    tailorName,
    Boolean(isScrap),
    deductionRate,
    pairsCount != null ? Number(pairsCount) : null
  );
}));

// --- AQL 1.5 AUDIT & EXPORT MANIFEST ---
apiRouter.post('/qc/:reqNo/aql-audit', handle((req) => {
  const { foundDefects, inspectorId, inspectorName } = req.body;
  return PackingService.executeAQLAudit(req.params.reqNo, foundDefects, inspectorId, inspectorName);
}));

apiRouter.get('/qc/aql-calc', handle((req) => {
  const lotSize = Number(req.query.lotSize || 840);
  const defects = Number(req.query.defects || 0);
  const aql = Number(req.query.aql || 1.5);
  return AQLService.evaluateLot(lotSize, defects, aql);
}));

apiRouter.get('/export/manifest/:reqNo', handle((req) => {
  return PackingService.getMasterCartonManifest(req.params.reqNo);
}));

// --- SUPER USER ADMIN ENDPOINTS ---
apiRouter.get('/admin/overview', handle((req) => {
  return PackingService.getAdminOverview({
    includeCatalog: req.query?.includeCatalog !== '0',
    fullIntegrityCheck: req.query?.fullIntegrity === '1'
  });
}));

apiRouter.get('/admin/users', handle(() => AuthService.listUsers()));

apiRouter.post('/admin/users', handle(req => {
  try {
    return AuthService.createUser(req.body || {});
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      throw authError('That username is already in use.', 409);
    }
    throw error;
  }
}));

apiRouter.patch('/admin/users/:userId/password', handle(req => {
  AuthService.updatePassword(req.params.userId, req.body?.password);
  return { updated: true };
}));

apiRouter.delete('/admin/users/:userId', handle(req => {
  const deletedUser = AuthService.deleteUserByAdmin({
    targetUserId: req.params.userId,
    adminUserId: req.authUser.userId,
    adminPassword: req.body?.adminPassword
  });
  return {
    deleted: true,
    user: deletedUser,
    users: AuthService.listUsers()
  };
}));

apiRouter.get('/admin/audit-trail', handle((req) => {
  return PackingService.getAuditTrail(req.query.limit);
}));

apiRouter.post('/admin/inventory/gloves', handle((req) => {
  return PackingService.updateGloveInventoryAdmin(req.body);
}));

apiRouter.post('/admin/inventory/materials', handle((req) => {
  return PackingService.updateMaterialInventoryAdmin(req.body);
}));

apiRouter.post('/admin/master/customer', handle((req) => {
  return PackingService.upsertCustomerAdmin(req.body);
}));

apiRouter.post('/admin/master/product', handle((req) => {
  return PackingService.upsertProductAdmin(req.body);
}));

apiRouter.post('/admin/wip/:reqNo/override', handle((req) => {
  return PackingService.overrideWipAdmin(req.params.reqNo, req.body);
}));

apiRouter.delete('/admin/record/:table/:id', handle((req) => {
  return PackingService.deleteRecordAdmin(req.params.table, req.params.id);
}));

apiRouter.get('/admin/pending-orders', handle(() => {
  return PackingService.getPendingOrders();
}));

apiRouter.post('/admin/pending-orders', handle((req) => {
  const { actor, role } = getActorMeta(req);
  return PackingService.createPendingOrderAdmin(req.body, actor, role);
}));

apiRouter.post('/admin/pending-orders/:orderId/short-close', handle((req) => {
  const { actor, role } = getActorMeta(req, 'SUPER_USER');
  return PackingService.shortClosePendingOrder(req.params.orderId, req.body?.reason, actor, role);
}));

apiRouter.delete('/admin/pending-orders/:orderId', handle((req) => {
  const { actor, role } = getActorMeta(req);
  return PackingService.deletePendingOrderAdmin(req.params.orderId, actor, role);
}));

apiRouter.get('/admin/halls', handle(() => {
  return PackingService.getHallsWithStitchers();
}));

apiRouter.post('/admin/halls', handle((req) => {
  const { actor, role } = getActorMeta(req, 'SUPER_USER');
  return PackingService.createHallAdmin(req.body?.name, actor, role);
}));

apiRouter.delete('/admin/halls/:id', handle((req) => {
  const { actor, role } = getActorMeta(req, 'SUPER_USER');
  return PackingService.deleteHallAdmin(req.params.id, actor, role);
}));

apiRouter.post('/admin/halls/:id/stitchers', handle((req) => {
  const { actor, role } = getActorMeta(req, 'SUPER_USER');
  return PackingService.createStitcherAdmin(req.params.id, req.body?.name, actor, role);
}));

apiRouter.delete('/admin/stitchers/:id', handle((req) => {
  const { actor, role } = getActorMeta(req, 'SUPER_USER');
  return PackingService.deleteStitcherAdmin(req.params.id, actor, role);
}));

apiRouter.post('/admin/db/backup', handle(() => {
  return PackingService.triggerDatabaseBackupAdmin();
}));

apiRouter.post('/admin/db/reset-seed', handle(() => {
  return PackingService.resetAndSeedDatabaseAdmin();
}));
