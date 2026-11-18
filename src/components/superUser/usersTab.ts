import { ROLE_PERMISSIONS, escapeHtml } from '../../utils/requisitionLogic';
import type { SuperUserRenderContext } from './types';

export function renderUsersTab(ctx: SuperUserRenderContext): string {
  const systemUsers = ctx.systemUsers || [];
  return `
    <section class="panel-card su-users-panel">
      <div class="panel-card-header">
        <div class="panel-card-title">
          <span>User Management</span>
          <span class="panel-counter-badge">${systemUsers.length} Accounts</span>
        </div>
        <span class="admin-meta-caption">Create station accounts and manage their sign-in passwords</span>
      </div>
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
            <span class="form-hint">This is the account's sign-in password.</span>
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
          <button type="button" class="btn-primary" id="btn-admin-add-system-user" data-su-action="add-system-user">Create Account</button>
        </div>
      </div>
    </section>
    <section class="panel-card su-users-panel">
      <div class="panel-card-header">
        <div class="panel-card-title"><span>Existing Accounts</span></div>
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
                  <td>${escapeHtml(user.username)}</td>
                  <td><span class="su-badge su-badge-req">${escapeHtml(user.role)}</span></td>
                  <td>${escapeHtml(user.station || 'Unassigned')}</td>
                  <td>${user.active ? 'Active' : 'Disabled'}</td>
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
  `;
}
