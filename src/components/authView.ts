import { escapeHtml } from '../utils/requisitionLogic';
import { LOGO_SVG } from '../utils/domModalsAndPrint';
import type { SystemUserRecord } from './superUserView';

export function screenForRole(role: SystemUserRecord['role']): string {
  const roleScreens: Record<SystemUserRecord['role'], string> = {
    SUPER_USER: 'screen-admin',
    INWARD_CLERK: 'screen-grn',
    PACKING_SUPERVISOR: 'screen-packing',
    QC_INSPECTOR: 'screen-qc',
    ALTERATION_LEAD: 'screen-repair'
  };
  return roleScreens[role];
}

export function stationName(role: SystemUserRecord['role']): string {
  const names: Record<SystemUserRecord['role'], string> = {
    SUPER_USER: 'Super User',
    INWARD_CLERK: 'Inward Register',
    PACKING_SUPERVISOR: 'Packing Hall',
    QC_INSPECTOR: 'Final QC',
    ALTERATION_LEAD: 'Alteration Bay'
  };
  return names[role];
}

export function renderAuthScreen(state: any): string {
  if (state.authMode === 'checking') {
    return '<main class="auth-screen"><section class="auth-card"><h1>Hammad Industries MES</h1><p>Checking sign-in status…</p></section></main>';
  }

  if (state.authMode === 'error') {
    return `
      <main class="auth-screen">
        <section class="auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title">Hammad Industries MES</h1>
          <p class="auth-error" role="alert">${escapeHtml(state.authError)}</p>
          <button type="button" class="btn-primary" id="btn-auth-retry">Try Again</button>
        </section>
      </main>
    `;
  }

  const isSetup = state.authMode === 'setup';
  return `
    <main class="auth-screen">
      <section class="auth-card" aria-labelledby="auth-title">
        <div class="auth-brand">${LOGO_SVG}<span>HAMMAD INDUSTRIES</span></div>
        <h1 id="auth-title">${isSetup ? 'Create the first Super User' : 'Sign in to your station'}</h1>
        <p>${isSetup
          ? 'Set up the initial administrator account. This one-time step unlocks user and station management.'
          : 'Use the username and password provided by your Super User.'}</p>
        ${state.authError ? `<p class="auth-error" role="alert">${escapeHtml(state.authError)}</p>` : ''}
        <form id="auth-form" novalidate>
          ${isSetup ? `
            <label class="auth-field">Operator name
              <input id="auth-name" name="name" autocomplete="name" required />
            </label>
          ` : ''}
          <label class="auth-field">Username
            <input id="auth-username" name="username" autocomplete="username" required />
          </label>
          <label class="auth-field">Password
            <input id="auth-password" name="password" type="password" autocomplete="${isSetup ? 'new-password' : 'current-password'}" required />
          </label>
          ${isSetup ? `
            <label class="auth-field">Confirm password
              <input id="auth-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" required />
            </label>
          ` : ''}
          <button type="submit" class="btn-primary">${isSetup ? 'Create Super User' : 'Sign In'}</button>
        </form>
        ${isSetup ? '<p class="auth-hint">Use at least 8 characters. Passwords are stored as salted hashes.</p>' : ''}
      </section>
    </main>
  `;
}

// Each signed-in account sees only its assigned station; Super Users can return to their control center.
export function renderModuleSwitcher(state: any): string {
  if (!state.currentUser) return '';
  const hasData = state.grnList.length > 0 || state.defectList.length > 0 || state.cartons.length > 0 || state.packingWip.plannedQty > 0;
  const isSuperUser = state.currentUser.role === 'SUPER_USER';
  const isInwardClerk = state.currentUser.role === 'INWARD_CLERK';
  const viewingOtherScreen = isSuperUser && state.activeScreen !== 'screen-admin';
  const screenRoles: Record<string, SystemUserRecord['role']> = {
    'screen-grn': 'INWARD_CLERK',
    'screen-packing': 'PACKING_SUPERVISOR',
    'screen-repair': 'ALTERATION_LEAD',
    'screen-qc': 'QC_INSPECTOR',
    'screen-admin': 'SUPER_USER'
  };
  const pendingAltCount = (state.defectList || []).filter(
    (d: any) => d.rawStatus === 'SENT_FOR_ALTERATION' || d.status === 'In Rework'
  ).length;
  const displayedStationRole = (viewingOtherScreen || (isInwardClerk && state.activeScreen === 'screen-repair'))
    ? (screenRoles[state.activeScreen] || state.currentUser.role)
    : state.currentUser.role;

  return `
    <header class="module-switcher-bar">
      <a href="#main-content" class="skip-to-content">Skip to main content</a>
      <div class="header-brand" title="Hammad Industries">
        ${LOGO_SVG}
        <span class="brand-title">HAMMAD INDUSTRIES</span>
      </div>
      <div class="module-switcher-left">
        <span class="station-label">${escapeHtml(stationName(displayedStationRole))}</span>
        ${viewingOtherScreen ? '<button class="btn-outline" id="btn-return-admin">Return to Super User</button>' : ''}
        ${isInwardClerk ? `
          <div style="display: inline-flex; gap: 6px; margin-left: 8px; flex-wrap: wrap;">
            <button type="button" class="${state.activeScreen === 'screen-grn' ? 'btn-primary' : 'btn-outline'}" id="btn-inward-nav-grn" style="padding: 4px 10px; font-size: 11.5px;">Inward Register</button>
            <button type="button" class="${state.activeScreen === 'screen-repair' ? 'btn-primary' : 'btn-outline'}" id="btn-inward-nav-repair" style="padding: 4px 10px; font-size: 11.5px;">Alteration Bay${pendingAltCount > 0 ? ` (${pendingAltCount})` : ''}</button>
          </div>
        ` : ''}
      </div>
      <div class="module-switcher-right">
        ${isSuperUser || state.currentUser.role === 'INWARD_CLERK' ? `
          <button class="btn-outline" style="padding: 5px 10px; font-size: 11.5px;" id="btn-open-doc-center">
            Printable Slips
          </button>
        ` : ''}
        ${isSuperUser && hasData ? `
          <button class="btn-outline" style="padding: 5px 10px; font-size: 11.5px;" id="btn-clear-all-data">
            Clear Data
          </button>
        ` : ''}
        <span class="signed-in-user">${escapeHtml(state.currentUser.name)}</span>
        <button class="btn-outline" id="btn-session-lock">${isSuperUser ? 'Lock Session' : 'Sign Out'}</button>
      </div>
    </header>
  `;
}

export function renderModalContainer(): string {
  return `
    <div id="global-modal" class="modal-overlay" aria-hidden="true">
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
        <div class="modal-header">
          <div class="modal-title" id="modal-title">System Slip</div>
          <button type="button" class="modal-close-btn" id="modal-close-x" aria-label="Close dialog">&times;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-footer">
          <button class="btn-primary" id="modal-btn-print" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px;">
            Print
          </button>
          <button type="button" class="btn-outline" id="modal-btn-close">Close</button>
        </div>
      </div>
    </div>
  `;
}
