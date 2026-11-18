import {
  escapeHtml,
  ConfirmDialogHtmlOptions,
  buildConfirmDialogHtml,
  buildFocusRestoreSelector
} from './requisitionLogic';

// Pure inline SVG Logo (Monochrome)
export const LOGO_SVG = `
<svg class="brand-logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="46" style="stroke: var(--ink-950)" stroke-width="5" />
  <circle cx="50" cy="50" r="36" style="stroke: var(--ink-500)" stroke-width="2" />
  <path d="M42 66V44L52 50V40L62 46V66H42Z" style="fill: var(--ink-900)" />
  <rect x="34" y="66" width="32" height="4" style="fill: var(--ink-900)" rx="1" />
</svg>
`;

let modalReturnFocusElement: HTMLElement | null = null;

// Helper: Show toast notification
export function showToast(message: string): void {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  const icon = document.createElement('span');
  icon.textContent = '✓';
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon, text);
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

// Ensure direct print stage exists in body
export function getDirectPrintStage(): HTMLElement {
  let stage = document.getElementById('direct-print-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'direct-print-stage';
    document.body.appendChild(stage);
  }
  return stage;
}

let pendingConfirmResolve: ((confirmed: boolean) => void) | null = null;
const pendingAdminActionKeys = new Set<string>();

export function resolvePendingConfirmDialog(confirmed: boolean): void {
  if (!pendingConfirmResolve) return;
  const resolve = pendingConfirmResolve;
  pendingConfirmResolve = null;
  resolve(confirmed);
}

// Modal management
export function openModal(
  title: string,
  htmlContent: string,
  isPrintable: boolean = true,
  options?: { hideGlobalFooter?: boolean; returnFocusTarget?: HTMLElement | null }
): void {
  const modal = document.getElementById('global-modal') as HTMLElement;
  const modalTitle = document.getElementById('modal-title') as HTMLElement;
  const modalBody = document.getElementById('modal-body') as HTMLElement;
  const printBtn = document.getElementById('modal-btn-print') as HTMLElement;
  if (modal && modalTitle && modalBody) {
    if (!modal.classList.contains('open')) {
      modalReturnFocusElement = options?.returnFocusTarget
        || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    modalTitle.textContent = title;
    modalBody.innerHTML = htmlContent;
    modal.classList.toggle('hide-global-footer', Boolean(options?.hideGlobalFooter));
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('open');
    if (printBtn) printBtn.style.display = isPrintable ? 'inline-flex' : 'none';
    const firstModalControl = Array.from(modalBody.querySelectorAll<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]'
    )).find(element => element.getClientRects().length > 0);
    (firstModalControl || modal.querySelector<HTMLElement>('#modal-btn-close') ||
      modal.querySelector<HTMLElement>('.modal-box'))?.focus();

    if (isPrintable) {
      const preview = modalBody.querySelector('#doc-preview-container') as HTMLElement | null;
      const stage = getDirectPrintStage();
      stage.innerHTML = preview ? preview.innerHTML : htmlContent;
      document.body.classList.add('printing-slip');
    }
  }
}

export function closeModal(): void {
  const modal = document.getElementById('global-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('hide-global-footer');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('printing-slip');
  const stage = document.getElementById('direct-print-stage');
  if (stage) stage.innerHTML = '';
  if (modalReturnFocusElement?.isConnected) modalReturnFocusElement.focus();
  modalReturnFocusElement = null;
  resolvePendingConfirmDialog(false);
}

/** Opens an accessible confirmation dialog inside #global-modal and resolves true/false. */
export function openConfirmDialog(
  options: ConfirmDialogHtmlOptions & { title: string; returnFocusTarget?: HTMLElement | null }
): Promise<boolean> {
  resolvePendingConfirmDialog(false);
  const html = buildConfirmDialogHtml(options);
  openModal(options.title, html, false, {
    hideGlobalFooter: true,
    returnFocusTarget: options.returnFocusTarget
  });
  return new Promise<boolean>((resolve) => {
    pendingConfirmResolve = resolve;
    document.getElementById('confirm-dialog-confirm')?.addEventListener('click', () => {
      resolvePendingConfirmDialog(true);
      closeModal();
    });
  });
}

/** Confirms a destructive admin action first, then runs it with in-flight action gating. */
export async function confirmAndRunAdminAction<T>(
  actionKey: string,
  triggerEl: HTMLElement | null | undefined,
  confirmOptions: ConfirmDialogHtmlOptions & { title: string },
  action: () => Promise<T>
): Promise<T | undefined> {
  if (pendingAdminActionKeys.has(actionKey)) return undefined;
  pendingAdminActionKeys.add(actionKey);
  try {
    const confirmed = await openConfirmDialog({
      ...confirmOptions,
      returnFocusTarget: triggerEl instanceof HTMLElement ? triggerEl : undefined
    });
    if (!confirmed) return undefined;
    pendingAdminActionKeys.delete(actionKey);
    return await runAdminAction(actionKey, triggerEl, action);
  } finally {
    pendingAdminActionKeys.delete(actionKey);
  }
}

/** Gates concurrent async Super User mutations per actionKey and marks trigger button busy. */
export async function runAdminAction<T>(
  actionKey: string,
  triggerEl: HTMLElement | null | undefined,
  action: () => Promise<T>
): Promise<T | undefined> {
  if (pendingAdminActionKeys.has(actionKey)) return undefined;
  pendingAdminActionKeys.add(actionKey);
  const buttonEl = triggerEl instanceof HTMLButtonElement
    ? triggerEl
    : triggerEl?.closest('button') || null;
  const wasDisabled = Boolean(buttonEl?.disabled);
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.setAttribute('aria-busy', 'true');
  }
  try {
    return await action();
  } finally {
    pendingAdminActionKeys.delete(actionKey);
    if (buttonEl?.isConnected) {
      buttonEl.disabled = wasDisabled;
      buttonEl.removeAttribute('aria-busy');
    }
  }
}

export function findValidationErrorContainer(field: HTMLElement): HTMLElement | null {
  return field.closest('.form-group, td') || field.parentElement;
}

export function clearFieldValidationError(field: HTMLElement | null): void {
  if (!field) return;
  field.removeAttribute('aria-invalid');
  const errId = field.getAttribute('data-validation-error-id');
  if (errId) {
    document.getElementById(errId)?.remove();
    const existingDescribedBy = (field.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(token => token && token !== errId);
    if (existingDescribedBy.length) {
      field.setAttribute('aria-describedby', existingDescribedBy.join(' '));
    } else {
      field.removeAttribute('aria-describedby');
    }
    field.removeAttribute('data-validation-error-id');
  }
  const container = findValidationErrorContainer(field);
  container?.querySelectorAll('.su-form-error[data-for-field]')?.forEach(el => {
    const key = el.getAttribute('data-for-field');
    if (key === field.id || key === field.dataset.adminUserPassword) {
      el.remove();
    }
  });
}

export function setFieldValidationError(field: HTMLElement | null, message: string): void {
  if (!field) return;
  clearFieldValidationError(field);
  const fieldKey = field.id || `pw-${field.dataset.adminUserPassword || 'field'}`;
  const errorId = `${fieldKey}-error`;
  const errorSpan = document.createElement('span');
  errorSpan.id = errorId;
  errorSpan.className = 'su-form-error';
  errorSpan.setAttribute('role', 'alert');
  errorSpan.setAttribute('data-for-field', field.id || field.dataset.adminUserPassword || fieldKey);
  errorSpan.textContent = message;

  const container = findValidationErrorContainer(field);
  const passwordControl = field.closest('.su-user-password-control');
  if (passwordControl && container && passwordControl.parentElement === container) {
    passwordControl.insertAdjacentElement('afterend', errorSpan);
  } else if (container) {
    container.appendChild(errorSpan);
  } else {
    field.insertAdjacentElement('afterend', errorSpan);
  }

  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('data-validation-error-id', errorId);
  const prevDescribedBy = (field.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(Boolean);
  if (!prevDescribedBy.includes(errorId)) {
    prevDescribedBy.push(errorId);
  }
  field.setAttribute('aria-describedby', prevDescribedBy.join(' '));
}

export function applyFieldValidationErrors(entries: Array<[HTMLElement | null, string | undefined]>): boolean {
  let firstInvalidField: HTMLElement | null = null;
  for (const [field, message] of entries) {
    if (!field) continue;
    clearFieldValidationError(field);
    if (message) {
      setFieldValidationError(field, message);
      if (!firstInvalidField) firstInvalidField = field;
    }
  }
  firstInvalidField?.focus();
  return firstInvalidField !== null;
}

export function printDocument(title: string, htmlContent: string): void {
  const preview = document.getElementById('doc-preview-container');
  const printContent = htmlContent || (preview ? preview.innerHTML : (document.getElementById('modal-body')?.innerHTML || ''));
  if (!printContent) {
    return;
  }

  const stage = getDirectPrintStage();
  const cleanupInPagePrint = () => {
    document.body.classList.remove('printing-slip');
    stage.innerHTML = '';
  };
  const fallbackInPagePrint = () => {
    stage.innerHTML = printContent;
    document.body.classList.add('printing-slip');
    window.focus();
    window.addEventListener('afterprint', cleanupInPagePrint, { once: true });
    window.addEventListener('focus', cleanupInPagePrint, { once: true });
    try {
      window.print();
    } catch (error) {
      cleanupInPagePrint();
      console.warn('In-page print fallback failed:', error);
    }
  };
  let printWindow: Window | null = null;
  try {
    printWindow = window.open('', '_blank');
  } catch (error) {
    console.warn('Unable to open standalone print window; using in-page print fallback:', error);
  }
  if (printWindow) {
    try {
      const stylesheetLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
        .map(link => `<link rel="stylesheet" href="${escapeHtml(link.href)}">`)
        .join('');
      let printStarted = false;
      const startStandalonePrint = () => {
        if (printStarted || printWindow?.closed) return;
        printStarted = true;
        try {
          printWindow?.focus();
          printWindow?.print();
        } catch (error) {
          console.warn('Standalone print failed; using in-page print fallback:', error);
          printWindow?.close();
          fallbackInPagePrint();
        }
      };
      printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
      printWindow.addEventListener('load', startStandalonePrint, { once: true });
      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>${escapeHtml(title)}</title>
            ${stylesheetLinks}
            <style>
              @page { size: A4 portrait; margin: 10mm 12mm 12mm; }
              html, body { margin: 0; padding: 0; background: white; color: black; }
              body { font: 11pt Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>${printContent}</body>
        </html>`);
      printWindow.document.close();
      cleanupInPagePrint();
      if (printWindow.document.readyState === 'complete') {
        window.setTimeout(startStandalonePrint, 0);
      }
      return;
    } catch (error) {
      console.warn('Standalone print window failed; using in-page print fallback:', error);
      printWindow.close();
    }
  }

  fallbackInPagePrint();
}

export interface RenderFocusSnapshot {
  selector: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none' | null;
}

export function captureRenderFocusTarget(root: HTMLElement): RenderFocusSnapshot | null {
  const modal = document.getElementById('global-modal');
  if (modal?.classList.contains('open')) return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body || !root.contains(active)) {
    return null;
  }
  const selector = buildFocusRestoreSelector({
    id: active.id || undefined,
    classList: active.classList,
    dataset: { ...active.dataset }
  });
  if (!selector) return null;
  let selectionStart: number | null = null;
  let selectionEnd: number | null = null;
  let selectionDirection: 'forward' | 'backward' | 'none' | null = null;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    try {
      selectionStart = active.selectionStart;
      selectionEnd = active.selectionEnd;
      selectionDirection = active.selectionDirection;
    } catch {
      // Input type (e.g., number/checkbox) does not support selection offsets
    }
  }
  return { selector, selectionStart, selectionEnd, selectionDirection };
}

export function restoreRenderFocusTarget(root: HTMLElement, snapshot: RenderFocusSnapshot | null): void {
  if (!snapshot) return;
  try {
    const nextEl = root.querySelector<HTMLElement>(snapshot.selector);
    if (!nextEl || (nextEl as HTMLButtonElement).disabled || nextEl.getClientRects().length === 0) return;
    nextEl.focus({ preventScroll: true });
    if (
      snapshot.selectionStart !== null &&
      snapshot.selectionEnd !== null &&
      (nextEl instanceof HTMLInputElement || nextEl instanceof HTMLTextAreaElement)
    ) {
      try {
        nextEl.setSelectionRange(
          snapshot.selectionStart,
          snapshot.selectionEnd,
          snapshot.selectionDirection || 'none'
        );
      } catch {
        // Ignore selection errors for non-text input types
      }
    }
  } catch {
    // Ignore invalid selector edge cases
  }
}

export interface RenderAppOptions {
  preserveInitialSyncDrafts?: boolean;
}

export interface FormDraftEntry {
  id: string;
  value: string;
}

export function captureDirtyFormDrafts(root: HTMLElement): FormDraftEntry[] {
  const drafts: FormDraftEntry[] = [];
  for (const el of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[id], textarea[id]')) {
    if (el.type === 'password' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') continue;
    if (el.value !== el.defaultValue) {
      drafts.push({ id: el.id, value: el.value });
    }
  }
  return drafts;
}

export function restoreDirtyFormDrafts(root: HTMLElement, drafts: FormDraftEntry[]): void {
  for (const draft of drafts) {
    const nextEl = document.getElementById(draft.id);
    if ((nextEl instanceof HTMLInputElement || nextEl instanceof HTMLTextAreaElement) && root.contains(nextEl)) {
      nextEl.value = draft.value;
    }
  }
}

// Pure Vanilla CSV Exporter
export function exportTableToCSV(filename: string, rows: object[]): void {
  if (!rows || !rows.length) {
    showToast('No records available to export.');
    return;
  }
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows
      .map(row => {
        return keys
          .map(k => {
            const rawVal = (row as Record<string, unknown>)[k];
            let cellStr = rawVal === null || rawVal === undefined ? '' : String(rawVal);
            cellStr = cellStr.replace(/"/g, '""');
            if (cellStr.search(/("|,|\n)/g) >= 0) cellStr = `"${cellStr}"`;
            return cellStr;
          })
          .join(separator);
      })
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
