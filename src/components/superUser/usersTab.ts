import { ROLE_PERMISSIONS, escapeHtml } from '../../utils/requisitionLogic';
import type { SuperUserRenderContext } from './types';

export function renderUsersTab(ctx: SuperUserRenderContext): string {
  const systemUsers = ctx.systemUsers || [];
  return `
    <div style="display: grid; gap: 16px;">
      <header style="display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 500; color: var(--ink-950); letter-spacing: -0.01em;">User management</h2>
            <span class="panel-counter-badge">${systemUsers.length} ${systemUsers.length === 1 ? 'account' : 'accounts'}</span>
          </div>
          <p style="margin: 4px 0 0; font-size: 12.5px; color: var(--ink-600);">Create station accounts, assign roles, and manage sign-in passwords.</p>
        </div>
      </header>

      <section class="panel-card su-users-panel">
        <div class="su-users-content">
          <div class="su-user-form-grid">
            <div class="form-group">
              <label for="admin-user-name">Operator Name</label>
              <input type="text" id="admin-user-name" class="form-input" placeholder="e.g. H. Malik" />
            </div>
            <div class="form-group">
              <label for="admin-user-username">Username</label>
              <input type="text" id="admin-user-username" class="form-input" autocomplete="off" placeholder="e.g. h.malik" />
            </div>
            <div class="form-group">
              <label for="admin-user-password">Password</label>
              <input type="password" id="admin-user-password" class="form-input" autocomplete="new-password" placeholder="At least 8 characters" />
              <span class="form-hint">Minimum 8 characters.</span>
            </div>
            <div class="form-group">
              <label for="admin-user-role">Assigned Role</label>
              <select id="admin-user-role" class="form-select">
                <option value="SUPER_USER">SUPER_USER (All Permissions)</option>
                <option value="INWARD_CLERK">INWARD_CLERK (GRN + Dock Issue)</option>
                <option value="PACKING_SUPERVISOR">PACKING_SUPERVISOR (REQ + WIP)</option>
                <option value="QC_INSPECTOR">QC_INSPECTOR (Final QC Gate)</option>
                <option value="ALTERATION_LEAD">ALTERATION_LEAD (A-REQ + Scrap)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="admin-user-station">Station</label>
              <select id="admin-user-station" class="form-select">
                <option value="Super User">Super User</option>
                <option value="Dock #1">Inward Register (Dock #1)</option>
                <option value="Packing Hall #1" selected>Packing Hall</option>
                <option value="Final QC">Final QC</option>
                <option value="Alteration Bay">Alteration Bay</option>
              </select>
            </div>
            <button type="button" class="btn-primary" id="btn-admin-add-system-user" data-su-action="add-system-user" style="background: var(--su-req-primary); border-color: var(--su-req-dark);">Create account</button>
          </div>
        </div>
      </section>

      <section class="panel-card su-users-panel">
        <div class="panel-card-header">
          <div class="panel-card-title"><span>Existing accounts</span></div>
          <span class="admin-meta-caption">Changing a password signs that account out on all devices.</span>
        </div>
        <div class="su-users-content">
          <div class="table-responsive">
            <table class="data-table su-user-table">
              <thead>
                <tr><th>Operator</th><th>Username</th><th>Role</th><th>Station</th><th>Status</th><th>Authorized Actions</th><th>Set Sign-in Password &amp; Actions</th></tr>
              </thead>
              <tbody>
                ${systemUsers.map(user => {
                  const perms = ROLE_PERMISSIONS[user.role] || [];
                  const summaryPreview = perms.length > 0
                    ? `${perms.length} action${perms.length === 1 ? '' : 's'} (${escapeHtml(perms.slice(0, 2).join(', '))}${perms.length > 2 ? ', +' + (perms.length - 2) + ' more' : ''})`
                    : 'No permissions';
                  const isCurrentUser = Boolean(ctx.currentUserId && user.userId === ctx.currentUserId);
                  return `
                  <tr>
                    <td class="font-bold">${escapeHtml(user.name)}</td>
                    <td style="font-family: 'IBM Plex Mono', monospace; font-size: 12px;">${escapeHtml(user.username)}</td>
                    <td><span class="su-badge su-badge-req">${escapeHtml(user.role)}</span></td>
                    <td>${escapeHtml(user.station || 'Unassigned')}</td>
                    <td style="white-space: nowrap;">
                      <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: ${user.active ? 'var(--su-complete-dark)' : 'var(--su-text-muted)'}; font-weight: 500;">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: ${user.active ? 'var(--su-complete-primary)' : 'var(--ink-400)'};"></span>
                        ${user.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td class="su-user-permissions">
                      <details class="su-perm-disclosure">
                        <summary>${summaryPreview}</summary>
                        <div class="su-perm-list">
                          ${perms.map(perm => `<span class="su-badge">${escapeHtml(perm)}</span>`).join('') || '<span>None</span>'}
                        </div>
                      </details>
                    </td>
                    <td>
                      <div class="su-user-password-control">
                        <input type="password" class="form-input" data-admin-user-password="${escapeHtml(user.userId)}"
                          autocomplete="new-password" aria-label="New sign-in password for ${escapeHtml(user.username)}"
                          placeholder="At least 8 characters" />
                        <button type="button" class="btn-outline" data-admin-reset-password="${escapeHtml(user.userId)}">Update</button>
                        <button
                          type="button"
                          class="btn-danger"
                          data-admin-delete-user="${escapeHtml(user.userId)}"
                          aria-label="Delete user ${escapeHtml(user.username)}"
                          ${isCurrentUser ? 'disabled title="Cannot delete your own active Super User account"' : ''}
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                `;
                }).join('') || '<tr><td colspan="7">No station accounts have been created yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;
}
