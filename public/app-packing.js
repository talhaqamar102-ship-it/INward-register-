let currentReqNo = '';
let currentBatchData = null;
let currentModalStep = '';
let currentStepAvail = 0;

// --- TOAST NOTIFICATIONS ---
function showToast(message, isError = false) {
  let toast = document.getElementById('toastAlert');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastAlert';
    toast.className = 'toast-alert';
    toast.innerHTML = '<span id="toastIcon"></span> <span id="toastMessage"></span>';
    document.body.appendChild(toast);
  }
  const icon = document.getElementById('toastIcon');
  const msg = document.getElementById('toastMessage');

  toast.className = `toast-alert show ${isError ? 'toast-error' : 'toast-success'}`;
  if (icon) icon.innerHTML = isError ? '⚠️' : '✅';
  if (msg) msg.textContent = message;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}

// --- INITIAL LOAD & DROPDOWN ---
async function initPackingHall() {
  await loadRequisitionsDropdown();
}

async function loadRequisitionsDropdown(selectReqNo = null) {
  try {
    const res = await fetch('/api/requisitions');
    const json = await res.json();
    const select = document.getElementById('batchSelect');
    select.innerHTML = '<option value="">-- Choose Requisition --</option>';

    if (json.success && json.data.length > 0) {
      json.data.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.req_number;
        opt.textContent = `${r.req_number} • ${r.customer_name} • ${r.product_name} (${r.status})`;
        select.appendChild(opt);
      });

      if (selectReqNo) {
        select.value = selectReqNo;
        currentReqNo = selectReqNo;
        await loadActiveBatchDetails();
      } else if (!currentReqNo && json.data.length > 0) {
        select.value = json.data[0].req_number;
        currentReqNo = json.data[0].req_number;
        await loadActiveBatchDetails();
      }
    }
  } catch (err) {
    showToast('Failed to load requisitions: ' + err.message, true);
  }
}

function onBatchSelectChanged() {
  currentReqNo = document.getElementById('batchSelect').value;
  if (currentReqNo) {
    loadActiveBatchDetails();
  } else {
    const hero = document.getElementById('heroBatchCard') || document.getElementById('lotHeroCard');
    if (hero) hero.classList.add('hidden');
    const stepper = document.getElementById('flowStepper');
    if (stepper) stepper.classList.add('hidden');
    const deck = document.getElementById('pipelineDeck') || document.querySelector('.workstations-grid');
    if (deck) deck.classList.add('hidden');
  }
}

// --- BATCH DETAILS & 5-STAGE WIP PIPELINE ---
async function loadActiveBatchDetails() {
  if (!currentReqNo) return;

  try {
    const res = await fetch(`/api/requisitions/${currentReqNo}`);
    const json = await res.json();
    if (!json.success || !json.data) throw new Error(json.error || 'Batch not found');

    const data = json.data;
    currentBatchData = data;

    // Render Hero Batch Header
    const hero = document.getElementById('heroBatchCard') || document.getElementById('lotHeroCard');
    if (hero) hero.classList.remove('hidden');

    const heroReqId = document.getElementById('heroReqId');
    if (heroReqId) heroReqId.textContent = data.req_number;

    const heroCustomerName = document.getElementById('heroCustomerName');
    if (heroCustomerName) heroCustomerName.textContent = `${data.customer_name} (${data.country || 'Global'})`;

    const heroProduct = document.getElementById('heroProduct');
    if (heroProduct) heroProduct.textContent = data.product_name;

    const heroCountry = document.getElementById('heroCountry');
    if (heroCountry) heroCountry.textContent = `Standard Packing: ${data.pairs_per_carton || 50} pairs / master carton`;

    const heroPairs = document.getElementById('heroPairs');
    if (heroPairs) heroPairs.textContent = `${data.requested_pairs} Pairs`;

    const isIssued = data.status !== 'PENDING';
    const heroIssuedStatus = document.getElementById('heroIssuedStatus');
    if (heroIssuedStatus) {
      heroIssuedStatus.innerHTML = isIssued
        ? `<span style="color: var(--emerald-600); font-weight: 700;">✓ Store Issued (${data.issued_pairs} pairs)</span>`
        : `<span style="color: var(--amber-600); font-weight: 700;">⏳ Waiting Store Issuance</span>`;
    }

    const heroQCPolicy = document.getElementById('heroQCPolicy');
    if (heroQCPolicy) {
      const qcBadge = data.inspection_preference === 'THOROUGH'
        ? `<span class="badge badge-info">🔬 100% Thorough Carton Audit</span>`
        : `<span class="badge badge-pending">🎲 Random AQL Sampling</span>`;
      heroQCPolicy.innerHTML = qcBadge;
    }

    // Hardened Order Toolbar fields (Picture 2)
    const dispBuyer = document.getElementById('dispBuyer');
    if (dispBuyer) dispBuyer.textContent = data.customer_name || 'Northwind';

    const dispPO = document.getElementById('dispPO');
    if (dispPO) dispPO.textContent = data.notes || '27347';

    const dispArticle = document.getElementById('dispArticle');
    if (dispArticle) dispArticle.textContent = data.product_name || 'Model A9 Stealth Black';

    const dispPlannedQty = document.getElementById('dispPlannedQty');
    if (dispPlannedQty) dispPlannedQty.textContent = `${Number(data.requested_pairs || 3090).toLocaleString()} Pairs`;

    const dispWipBatch = document.getElementById('dispWipBatch');
    if (dispWipBatch) dispWipBatch.textContent = `${Number(data.issued_pairs || data.requested_pairs).toLocaleString()} Pairs`;

    const stepper = document.getElementById('flowStepper');
    const deck = document.getElementById('pipelineDeck') || document.querySelector('.workstations-grid');

    if (!isIssued) {
      if (stepper) stepper.classList.add('hidden');
      if (deck) deck.classList.add('hidden');
      showToast(`Batch ${data.req_number} is PENDING issuance by Store Keeper. Switch to Store Keeper tab/screen to issue pairs.`, true);
      return;
    }

    if (stepper) stepper.classList.remove('hidden');
    if (deck) deck.classList.remove('hidden');

    renderStepper(data);
    renderWIPStages(data);
    renderAlterations(data.alterations || []);
    renderCartons(data.cartons || []);
    renderFinalQC(data);

  } catch (err) {
    showToast('Error loading lot: ' + err.message, true);
  }
}

// --- VISUAL FLOW STEPPER UPDATE ---
function renderStepper(data) {
  const wip = data.wip || {};
  const step = wip.current_step || 'STEP_1';

  const resetStep = (id) => {
    const el = document.getElementById(id);
    if (el) {
      if (el.classList.contains('stepper-node')) {
        el.className = 'stepper-node';
      } else {
        el.className = 'flow-step-item';
      }
    }
  };
  const setStep = (id, status) => {
    const el = document.getElementById(id);
    if (el) {
      if (el.classList.contains('stepper-node')) {
        el.className = `stepper-node ${status}`;
      } else {
        el.className = `flow-step-item ${status}`;
      }
    }
  };

  ['stepIndicator1', 'stepIndicator2', 'stepIndicator3', 'stepIndicatorMat', 'stepIndicator4', 'stepIndicator5', 'stepIndicatorQC']
    .forEach(resetStep);

  // Stage 1
  if (wip.step1_checking_good > 0) setStep('stepIndicator1', 'completed');
  if (step === 'STEP_1') setStep('stepIndicator1', 'active');

  // Stage 2
  if (wip.step2_ironing_good > 0) setStep('stepIndicator2', 'completed');
  if (step === 'STEP_2') setStep('stepIndicator2', 'active');

  // Stage 3
  if (wip.step3_matching_good > 0) setStep('stepIndicator3', 'completed');
  if (step === 'STEP_3') setStep('stepIndicator3', 'active');

  // Material Handoff
  if (data.materialReq && data.materialReq.status === 'ISSUED') {
    setStep('stepIndicatorMat', 'completed');
  } else if (step === 'WAITING_MATERIALS' || (data.materialReq && data.materialReq.status === 'PENDING')) {
    setStep('stepIndicatorMat', 'active');
  }

  // Stage 4
  if (wip.step4_packing_good > 0) setStep('stepIndicator4', 'completed');
  if (step === 'STEP_4') setStep('stepIndicator4', 'active');

  // Stage 5
  if (wip.step5_cartons_packed > 0) setStep('stepIndicator5', 'completed');
  if (step === 'STEP_5') setStep('stepIndicator5', 'active');

  // Final QC
  if (wip.final_qc_status === 'APPROVED_DISPATCH') setStep('stepIndicatorQC', 'completed');
  if (step === 'FINAL_QC' || wip.final_qc_status === 'PENDING') setStep('stepIndicatorQC', 'active');
}

// --- 5-STAGE WORKSTATIONS ---
function renderWIPStages(data) {
  const wip = data.wip || {};
  const currentStep = wip.current_step || 'STEP_1';

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // Step 1
  setText('s1_in', `${wip.step1_checking_in || 0} pairs`);
  setText('stg1In', `${wip.step1_checking_in || 0}`);
  setText('s1_good', `${wip.step1_checking_good || 0} passed`);
  setText('stg1Passed', `${wip.step1_checking_good || 0}`);
  setText('s1_def', `${wip.step1_checking_defects || 0} defects`);
  setText('stg1Defects', `${wip.step1_checking_defects || 0}`);
  const s1Avail = (wip.step1_checking_in || 0) - (wip.step1_checking_good || 0) - (wip.step1_checking_defects || 0);
  const badgeS1 = document.getElementById('badgeStep1Status');
  if (badgeS1) {
    badgeS1.textContent = s1Avail > 0 ? `${s1Avail} Pending` : 'Done';
    badgeS1.className = s1Avail > 0 ? 'badge badge-pending' : 'badge badge-success';
  }

  // Step 2
  setText('s2_in', `${wip.step2_ironing_in || 0} pairs`);
  setText('stg2In', `${wip.step2_ironing_in || 0}`);
  setText('s2_good', `${wip.step2_ironing_good || 0} passed`);
  setText('stg2Passed', `${wip.step2_ironing_good || 0}`);
  setText('s2_def', `${wip.step2_ironing_defects || 0} defects`);
  setText('stg2Defects', `${wip.step2_ironing_defects || 0}`);
  const s2Avail = (wip.step2_ironing_in || 0) - (wip.step2_ironing_good || 0) - (wip.step2_ironing_defects || 0);
  const badgeS2 = document.getElementById('badgeStep2Status');
  if (badgeS2) {
    badgeS2.textContent = s2Avail > 0 ? `${s2Avail} Pending` : (wip.step2_ironing_good > 0 ? 'Done' : 'Waiting');
    badgeS2.className = s2Avail > 0 ? 'badge badge-pending' : (wip.step2_ironing_good > 0 ? 'badge badge-success' : 'badge badge-info');
  }

  // Step 3
  setText('s3_in', `${wip.step3_matching_in || 0} pairs`);
  setText('stg3In', `${wip.step3_matching_in || 0}`);
  setText('s3_good', `${wip.step3_matching_good || 0} matched`);
  setText('stg3Passed', `${wip.step3_matching_good || 0} Pairs`);
  setText('s3_def', `${wip.step3_matching_defects || 0} defects`);
  setText('stg3Defects', `${wip.step3_matching_defects || 0}`);
  const s3Avail = (wip.step3_matching_in || 0) - (wip.step3_matching_good || 0) - (wip.step3_matching_defects || 0);
  const badgeS3 = document.getElementById('badgeStep3Status');
  if (badgeS3) {
    badgeS3.textContent = s3Avail > 0 ? `${s3Avail} Pending` : (wip.step3_matching_good > 0 ? 'Done' : 'Waiting');
    badgeS3.className = s3Avail > 0 ? 'badge badge-pending' : (wip.step3_matching_good > 0 ? 'badge badge-success' : 'badge badge-info');
  }

  // Material Requisition Handoff
  const matReq = data.materialReq;
  const btnTriggerMreq = document.getElementById('btnTriggerMreq');
  const btnPrintMreq = document.getElementById('btnPrintMreq');
  const badgeMatReq = document.getElementById('badgeMatReqStatus');
  if (matReq) {
    setText('mreqNoDisplay', matReq.mat_req_number);
    setText('dispMReqNo', matReq.mat_req_number);
    setText('mreqStatusVal', matReq.status === 'ISSUED' ? '✓ Dispatched by Store' : 'Pending Storekeeper');
    setText('mreqQtySummary', `${matReq.polybags_requested} poly, ${matReq.silica_gel_requested} silica, ${matReq.stickers_requested} stk`);
    setText('dispMReqQty', `${matReq.polybags_requested} Sets`);
    if (badgeMatReq) {
      badgeMatReq.textContent = matReq.status === 'ISSUED' ? 'Issued' : 'Pending Store';
      badgeMatReq.className = matReq.status === 'ISSUED' ? 'badge badge-success' : 'badge badge-pending';
    }
    if (btnTriggerMreq) {
      btnTriggerMreq.disabled = true;
      btnTriggerMreq.textContent = '✓ Material REQ Sent';
    }
    if (btnPrintMreq) btnPrintMreq.classList.remove('hidden');
  } else {
    setText('mreqNoDisplay', 'Not Created');
    setText('dispMReqNo', 'MREQ-2026-0018');
    setText('dispMReqQty', `${wip.step3_matching_good || 910} Sets`);
    setText('mreqStatusVal', wip.step3_matching_good > 0 ? `Ready for ${wip.step3_matching_good} good pairs` : 'Requires Step 3');
    setText('mreqQtySummary', wip.step3_matching_good > 0 ? `Est: ${wip.step3_matching_good} poly, ${wip.step3_matching_good} silica` : '-');
    if (badgeMatReq) {
      badgeMatReq.textContent = wip.step3_matching_good > 0 ? 'Ready to Order' : 'Required';
      badgeMatReq.className = 'badge badge-pending';
    }
    if (btnTriggerMreq) {
      btnTriggerMreq.disabled = (wip.step3_matching_good <= 0);
      btnTriggerMreq.textContent = 'Request Accessories ➔';
    }
    if (btnPrintMreq) btnPrintMreq.classList.add('hidden');
  }

  // Step 4
  const s4MatReady = Boolean(wip.step4_materials_issued);
  setText('s4_materials_badge', s4MatReady ? '✓ In Hand' : 'Awaiting Store');
  setText('s4_packed', `${wip.step4_packing_good || 0} pairs`);
  setText('stg4In', `${wip.step3_matching_good || 910} pairs`);
  setText('stg4Passed', `${wip.step4_packing_good || 0} Pairs`);
  setText('stg4Pending', `${Math.max(0, (wip.step3_matching_good || 0) - (wip.step4_packing_good || 0))}`);
  const btnStep4 = document.getElementById('btnStep4');
  if (btnStep4) btnStep4.disabled = !s4MatReady;

  const badgeS4 = document.getElementById('badgeStep4Status');
  if (badgeS4) {
    if (wip.step4_packing_good > 0) {
      badgeS4.textContent = `${wip.step4_packing_good} Packed`;
      badgeS4.className = 'badge badge-success';
    } else if (s4MatReady) {
      badgeS4.textContent = 'Ready to Pack';
      badgeS4.className = 'badge badge-pending';
    } else {
      badgeS4.textContent = 'Waiting MREQ';
      badgeS4.className = 'badge badge-info';
    }
  }

  // Step 5
  setText('s5_cartons', `${wip.step5_cartons_packed || 0} ctn`);
  setText('s5_pairs', `${wip.step5_pairs_packed || 0} pairs`);
  setText('stg5Cartons', `${wip.step5_cartons_packed || 0} Cartons (${wip.step5_pairs_packed || 0} Pairs)`);

  const badgeS5 = document.getElementById('badgeStep5Status');
  if (badgeS5) {
    if (wip.step5_cartons_packed > 0) {
      badgeS5.textContent = `${wip.step5_cartons_packed} Ctn Boxed`;
      badgeS5.className = 'badge badge-success';
    } else if (wip.step4_packing_good > 0) {
      badgeS5.textContent = 'Ready to Box';
      badgeS5.className = 'badge badge-pending';
    } else {
      badgeS5.textContent = 'Waiting Step 4';
      badgeS5.className = 'badge badge-info';
    }
  }
}

// --- ALTERATION REPAIR BAY ---
function renderAlterations(alterations) {
  const container = document.getElementById('repairTicketsContainer');
  const tbody = document.getElementById('alterationsTableBody');
  const altLoopBody = document.getElementById('alterationLoopBody');

  if (altLoopBody && alterations) {
    if (alterations.length === 0) {
      altLoopBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 12px;">Zero open alterations. 100% first-pass quality!</td></tr>`;
    } else {
      altLoopBody.innerHTML = alterations.map(a => `
        <tr>
          <td><strong>#DEF-${a.id}</strong></td>
          <td>${(a.source_stage || 'Stage 1').replace(/_/g, ' ')}</td>
          <td>${a.defect_reason || 'Stitching Skip'}</td>
          <td style="text-align: right; font-weight: 700;">${a.pairs_count}</td>
          <td style="color: #b45309; font-weight: 600;">Returned to Step 1 Checking</td>
          <td style="text-align: center;"><span class="erp-tag ${a.status === 'RETURNED_TO_CHECKING' ? 'erp-tag-complete' : 'erp-tag-partial'}">${a.status === 'RETURNED_TO_CHECKING' ? 'Clear' : 'In Rework'}</span></td>
        </tr>
      `).join('');
    }
  }

  // Support table in index.html
  if (tbody) {
    if (!alterations || alterations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 14px;">Zero open alterations. First-pass quality 100%!</td></tr>`;
    } else {
      tbody.innerHTML = alterations.map(a => {
        const isSent = a.status === 'SENT_FOR_ALTERATION';
        const actionBtn = isSent
          ? `<button class="btn btn-warning btn-sm" onclick="returnAlteration(${a.id}, ${a.pairs_count})">Repaired &rarr; Return to Step 1</button>`
          : `<span class="badge badge-success">✓ Re-entered Step 1</span>`;

        return `
          <tr>
            <td><strong style="color: var(--amber-600); font-family: var(--font-mono);">#ALT-${a.id}</strong></td>
            <td><strong>${a.source_stage}</strong></td>
            <td>${a.defect_reason}</td>
            <td><strong style="font-family: var(--font-mono);">${a.pairs_count} pairs</strong></td>
            <td><span class="badge ${isSent ? 'badge-pending' : 'badge-success'}">${a.status}</span></td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Support standalone cards in packing.html
  if (container) {
    if (!alterations || alterations.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 1.5rem;">🎉 Zero alterations logged. 100% first-pass quality!</div>`;
      return;
    }

    container.innerHTML = alterations.map(a => {
      const isSent = a.status === 'SENT_FOR_ALTERATION';
      const actionBtn = isSent
        ? `<button class="repair-return-btn" onclick="returnAlteration(${a.id}, ${a.pairs_count})">
             <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
             Repaired &bull; Return to Step 1 Checking
           </button>`
        : `<span style="color: var(--emerald-600); font-size: 0.85rem; font-weight: 700;">✓ Re-entered at Step 1 (${new Date(a.returned_at).toLocaleTimeString()})</span>`;

      return `
        <div class="repair-ticket">
          <div class="repair-ticket-info">
            <span class="repair-ticket-id">#ALT-${a.id}</span>
            <span class="repair-ticket-origin">From: ${a.source_stage}</span>
            <span class="repair-ticket-reason">${a.defect_reason}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <span class="repair-ticket-count">${a.pairs_count} pairs</span>
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');
  }
}

// --- CARTONS TABLE & FINAL QC ---
function renderCartons(cartons) {
  const tbody = document.getElementById('cartonsTableBody');
  const manifestBody = document.getElementById('cartonManifestBody');

  if (manifestBody && cartons && cartons.length > 0) {
    manifestBody.innerHTML = cartons.map(c => `
      <tr>
        <td><strong>CTN-${String(c.carton_number).padStart(2, '0')}</strong></td>
        <td style="text-align: right;">${c.pairs_count}</td>
        <td style="text-align: right;">${c.gross_weight_kg || 4.8} kg</td>
        <td style="text-align: center;"><span class="erp-tag erp-tag-complete">Approved (AQL 1.5)</span></td>
        <td style="text-align: center; color: #047857; font-weight: 700;">Yes</td>
      </tr>
    `).join('');
  }

  if (tbody) {
    if (!cartons || cartons.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 14px;">No cartons boxed yet. Box packed pairs in Step 5.</td></tr>`;
      return;
    }

    tbody.innerHTML = cartons.map(c => `
      <tr>
        <td><strong style="color: var(--primary-500); font-family: var(--font-mono);">${c.carton_barcode}</strong></td>
        <td><strong>Carton #${c.carton_number}</strong> of ${c.total_cartons}</td>
        <td><strong>${c.pairs_count}</strong> pairs</td>
        <td><span class="badge ${c.status.includes('PASS') ? 'badge-success' : 'badge-info'}">${c.status}</span></td>
      </tr>
    `).join('');
  }
}

function renderFinalQC(data) {
  const wip = data.wip || {};
  const statusEl = document.getElementById('qcVerdictPill');
  const qcStatus = wip.final_qc_status || 'PENDING';

  if (statusEl) {
    if (qcStatus === 'APPROVED_DISPATCH') {
      statusEl.className = 'badge badge-success';
      statusEl.textContent = '✅ Approved for Dispatch';
    } else if (qcStatus === 'REPAIR_REQUIRED') {
      statusEl.className = 'badge badge-danger';
      statusEl.textContent = '⚠️ Sent to Repair (Step 1)';
    } else {
      statusEl.className = 'badge badge-info';
      statusEl.textContent = 'Pending Inspection';
    }
  }

  if (qcStatus === 'APPROVED_DISPATCH') {
    statusEl.className = 'pill-badge pill-success';
    statusEl.textContent = '✅ Approved for Dispatch';
  } else if (qcStatus === 'REPAIR_REQUIRED') {
    statusEl.className = 'pill-badge pill-pending';
    statusEl.textContent = '⚠️ Sent to Repair (Step 1)';
  } else {
    statusEl.className = 'pill-badge pill-random';
    statusEl.textContent = 'Pending Inspection';
  }

  document.getElementById('qcTotalCartonsCount').textContent = wip.step5_cartons_packed || 0;
  document.getElementById('qcCustomerPolicyText').textContent = data.inspection_preference === 'THOROUGH'
    ? '100% Thorough Carton Inspection Required'
    : 'Random Statistical AQL Sampling';

  const cartonsInput = document.getElementById('qcCartonsInput');
  if (wip.step5_cartons_packed > 0) {
    if (data.inspection_preference === 'THOROUGH') {
      cartonsInput.value = wip.step5_cartons_packed;
    } else {
      cartonsInput.value = Math.max(1, Math.ceil(wip.step5_cartons_packed * 0.2));
    }
  }
}

// --- MODAL: NEW GLOVE REQUISITION ---
async function openNewReqModal() {
  document.getElementById('modalNewReq').classList.remove('hidden');
  try {
    const [custRes, prodRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/products')
    ]);
    const custJson = await custRes.json();
    const prodJson = await prodRes.json();

    const custSelect = document.getElementById('newReqCustomer');
    custSelect.innerHTML = '<option value="">-- Select Customer --</option>';
    custJson.data.forEach(c => {
      custSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.inspection_preference})</option>`;
    });

    window.cachedProducts = prodJson.data;
  } catch (err) {
    showToast('Failed to load customers: ' + err.message, true);
  }
}

function closeNewReqModal() {
  document.getElementById('modalNewReq').classList.add('hidden');
}

function onCustomerSelectedForNewReq() {
  const custId = document.getElementById('newReqCustomer').value;
  const prodSelect = document.getElementById('newReqProduct');
  prodSelect.innerHTML = '<option value="">-- Select Model --</option>';

  if (window.cachedProducts) {
    const filtered = window.cachedProducts.filter(p => p.customer_id === custId);
    filtered.forEach(p => {
      prodSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
  }
}

async function submitNewGloveRequisition() {
  const customerId = document.getElementById('newReqCustomer').value;
  const productId = document.getElementById('newReqProduct').value;
  const requestedPairs = document.getElementById('newReqPairs').value;
  const notes = document.getElementById('newReqNotes').value;

  if (!customerId || !productId || !requestedPairs) {
    alert('Please specify customer, glove model, and requested pairs count.');
    return;
  }

  try {
    const res = await fetch('/api/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, productId, requestedPairs, notes })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`Created Requisition ${json.data.req_number}! Store Keeper notified.`);
    closeNewReqModal();
    await loadRequisitionsDropdown(json.data.req_number);
  } catch (err) {
    showToast(err.message, true);
  }
}

// --- MODAL: WORKSTATION EXECUTION (Step 1, 2, 3) ---
function openStepModal(step) {
  if (!currentBatchData || !currentBatchData.wip) return;
  const wip = currentBatchData.wip;
  currentModalStep = step;

  let avail = 0;
  let title = '';

  if (step === 'step1') {
    title = '🔍 Step 1: Checking & Inspection Workstation';
    avail = wip.step1_checking_in - wip.step1_checking_good - wip.step1_checking_defects;
  } else if (step === 'step2') {
    title = '🔥 Step 2: Ironing & Brushing Workstation';
    avail = wip.step2_ironing_in - wip.step2_ironing_good - wip.step2_ironing_defects;
  } else if (step === 'step3') {
    title = '🧤 Step 3: Pair Matching Workstation';
    avail = wip.step3_matching_in - wip.step3_matching_good - wip.step3_matching_defects;
  }

  if (avail <= 0) {
    showToast(`No pending pairs available in this stage right now.`, true);
    return;
  }

  currentStepAvail = avail;
  document.getElementById('stepModalTitle').textContent = title;
  document.getElementById('stepModalAvail').textContent = `${avail} pairs`;
  document.getElementById('stepGoodPairs').value = avail;
  document.getElementById('stepDefectPairs').value = 0;
  document.getElementById('stepDefectReason').value = '';
  document.getElementById('modalStep').classList.remove('hidden');
}

function closeStepModal() {
  document.getElementById('modalStep').classList.add('hidden');
}

function setAllGood() {
  document.getElementById('stepGoodPairs').value = currentStepAvail;
  document.getElementById('stepDefectPairs').value = 0;
}

function onDefectCountChanged() {
  const defects = Number(document.getElementById('stepDefectPairs').value || 0);
  const remaining = Math.max(0, currentStepAvail - defects);
  document.getElementById('stepGoodPairs').value = remaining;
}

async function submitStepAction() {
  const goodPairs = Number(document.getElementById('stepGoodPairs').value || 0);
  const defectPairs = Number(document.getElementById('stepDefectPairs').value || 0);
  const defectReason = document.getElementById('stepDefectReason').value;

  if (goodPairs + defectPairs <= 0) {
    alert('Please enter at least 1 pair.');
    return;
  }

  let endpoint = '';
  if (currentModalStep === 'step1') endpoint = `/api/wip/${currentReqNo}/step1-checking`;
  if (currentModalStep === 'step2') endpoint = `/api/wip/${currentReqNo}/step2-ironing`;
  if (currentModalStep === 'step3') endpoint = `/api/wip/${currentReqNo}/step3-matching`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goodPairs, defectPairs, defectReason })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`Advanced: ${goodPairs} good pairs passed. ${defectPairs > 0 ? defectPairs + ' pairs sent to Repair Bay.' : ''}`);
    closeStepModal();
    await loadActiveBatchDetails();
  } catch (err) {
    showToast(err.message, true);
  }
}

// --- MATERIAL REQUISITION ---
async function generateMaterialReq() {
  try {
    const res = await fetch(`/api/wip/${currentReqNo}/material-requisition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`Material Requisition ${json.data.mat_req_number} generated!`);
    await loadActiveBatchDetails();
    
    // Automatically open print requisition slip preview
    openPrintRequisitionModal();
  } catch (err) {
    showToast(err.message, true);
  }
}

function printMaterialRequisition() {
  openPrintRequisitionModal();
}

function openPrintRequisitionModal() {
  if (!currentBatchData || !currentBatchData.materialReq) {
    showToast('No Material Requisition found for this batch.', true);
    return;
  }

  const matReq = currentBatchData.materialReq;
  document.getElementById('slipMreqNo').textContent = matReq.mat_req_number;
  document.getElementById('slipParentReq').textContent = currentBatchData.req_number;
  document.getElementById('slipDate').textContent = new Date(matReq.created_at || Date.now()).toLocaleDateString() + ' ' + new Date(matReq.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('slipCustomer').textContent = `${currentBatchData.customer_name} (${currentBatchData.country || 'Global'})`;
  document.getElementById('slipProduct').textContent = currentBatchData.product_name;
  document.getElementById('slipPairsCount').textContent = `${Number(matReq.pairs_count).toLocaleString()} Pairs`;
  document.getElementById('slipStatus').textContent = matReq.status === 'ISSUED' ? 'DISPATCHED BY STORE' : 'PENDING STORE ISSUANCE';
  document.getElementById('slipStatus').style.color = matReq.status === 'ISSUED' ? '#059669' : '#d97706';

  const tbody = document.getElementById('slipItemsTableBody');
  tbody.innerHTML = `
    <tr>
      <td style="text-align: center; color: #64748b;">1</td>
      <td><code style="font-weight: 700; color: #0284c7;">POLYBAG</code></td>
      <td><strong>Individual Protective Polybags</strong><div style="font-size: 0.75rem; color: #64748b;">Standard protective pouch per pair</div></td>
      <td style="text-align: right; font-weight: 700; font-family: var(--font-mono); font-size: 1rem;">${Number(matReq.polybags_requested).toLocaleString()}</td>
      <td>pcs</td>
      <td style="text-align: center; color: #64748b;">[ &nbsp; ] Issued</td>
    </tr>
    <tr>
      <td style="text-align: center; color: #64748b;">2</td>
      <td><code style="font-weight: 700; color: #0284c7;">SILICA_GEL</code></td>
      <td><strong>Moisture Absorbing Silica Gel Packets</strong><div style="font-size: 0.75rem; color: #64748b;">Moisture absorbent pouch per pair</div></td>
      <td style="text-align: right; font-weight: 700; font-family: var(--font-mono); font-size: 1rem;">${Number(matReq.silica_gel_requested).toLocaleString()}</td>
      <td>pouches</td>
      <td style="text-align: center; color: #64748b;">[ &nbsp; ] Issued</td>
    </tr>
    <tr>
      <td style="text-align: center; color: #64748b;">3</td>
      <td><code style="font-weight: 700; color: #0284c7;">STICKER_BARCODE</code></td>
      <td><strong>Cardboard Barcode Labels & Hangtags</strong><div style="font-size: 0.75rem; color: #64748b;">Customer branded carton & pair hangtags</div></td>
      <td style="text-align: right; font-weight: 700; font-family: var(--font-mono); font-size: 1rem;">${Number(matReq.stickers_requested).toLocaleString()}</td>
      <td>stickers</td>
      <td style="text-align: center; color: #64748b;">[ &nbsp; ] Issued</td>
    </tr>
  `;

  document.getElementById('modalPrintMreq').classList.remove('hidden');
}

function closePrintRequisitionModal() {
  document.getElementById('modalPrintMreq').classList.add('hidden');
}

function executePrintSlip() {
  window.focus();
  window.print();
}

// --- STEP 4 (1ST PACKING) ---
function openStep4Modal() {
  const wip = currentBatchData.wip;
  const avail = wip.step3_matching_good - wip.step4_packing_good;
  if (avail <= 0) {
    showToast('All matched pairs are already packaged.', true);
    return;
  }
  document.getElementById('step4PackedPairs').value = avail;
  document.getElementById('modalStep4').classList.remove('hidden');
}

function closeStep4Modal() {
  document.getElementById('modalStep4').classList.add('hidden');
}

async function submitStep4Action() {
  const packedPairs = Number(document.getElementById('step4PackedPairs').value);
  try {
    const res = await fetch(`/api/wip/${currentReqNo}/step4-packing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packedPairs })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`1st Packing completed for ${packedPairs} pairs.`);
    closeStep4Modal();
    await loadActiveBatchDetails();
  } catch (err) {
    showToast(err.message, true);
  }
}

// --- STEP 5 (2ND PACKING - CARTONS) ---
function openStep5Modal() {
  const wip = currentBatchData.wip;
  if (wip.step4_packing_good <= 0) {
    showToast('Please complete Step 4 1st Packing first.', true);
    return;
  }
  document.getElementById('modalStep5').classList.remove('hidden');
}

function closeStep5Modal() {
  document.getElementById('modalStep5').classList.add('hidden');
}

async function submitStep5Action() {
  const pairsPerCarton = Number(document.getElementById('step5PairsPerCarton').value || 50);
  try {
    const res = await fetch(`/api/wip/${currentReqNo}/step5-cartons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairsPerCarton })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`Master cartons generated and barcoded! Ready for Final QC.`);
    closeStep5Modal();
    await loadActiveBatchDetails();
  } catch (err) {
    showToast(err.message, true);
  }
}

// --- FINAL QC INSPECTION ---
async function submitFinalQC(isPass) {
  const cartonsChecked = Number(document.getElementById('qcCartonsInput').value);
  const defectivePairs = isPass ? 0 : Number(document.getElementById('qcDefectsInput').value || 1);
  const defectNotes = document.getElementById('qcNotesInput').value;

  if (cartonsChecked <= 0) {
    alert('Please enter cartons inspected count.');
    return;
  }

  if (!isPass && defectivePairs <= 0) {
    alert('Please enter number of defective pairs detected.');
    return;
  }

  try {
    const res = await fetch(`/api/wip/${currentReqNo}/final-inspection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartonsChecked, defectivePairs, defectNotes })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    if (isPass) {
      showToast(`🎉 Lot APPROVED FOR DISPATCH! All cartons cleared.`);
    } else {
      showToast(`🛠️ ${defectivePairs} defective pairs routed to Repair Bay (Returned to Step 1 Checking).`);
    }
    await loadActiveBatchDetails();
  } catch (err) {
    showToast(err.message, true);
  }
}

// --- ALTERATIONS RETURN LOOP: ALWAYS RETURNS TO STEP 1 ---
async function returnAlteration(altId, pairs) {
  try {
    const res = await fetch(`/api/alterations/${altId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    showToast(`Alteration #${altId} repaired! ${pairs} pairs successfully returned to Step 1 Checking.`);
    await loadActiveBatchDetails();
  } catch (err) {
    showToast(err.message, true);
  }
}

window.addEventListener('DOMContentLoaded', initPackingHall);
