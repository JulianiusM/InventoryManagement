/**
 * Game accounts page - Account management, sync status, and device management
 */

import {setCurrentNavLocation} from '../core/navigation';
import {showAlert} from '../shared/alerts';

// Types
interface ConnectorData {
    id: string;
    name: string;
    description: string;
    provider: string;
    syncStyle: 'fetch' | 'push';
    isAggregator?: boolean;
    supportsDevices?: boolean;
    credentialFields?: CredentialField[];
}

interface CredentialField {
    name: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    helpText?: string;
    mapsTo?: string;
}

interface DeviceInfo {
    id: string;
    name: string;
    status: 'active' | 'revoked';
    lastSeenAt: string | null;
    lastImportAt: string | null;
}

interface SyncStatus {
    latestJob?: {
        status: 'pending' | 'in_progress' | 'completed' | 'failed';
        entriesProcessed?: number;
        errorMessage?: string;
    };
    isScheduled?: boolean;
}

// Global state
let connectorsData: ConnectorData[] = [];
let connectorMap: Record<string, ConnectorData> = {};
const pollingIntervals: Record<string, ReturnType<typeof setInterval>> = {};
let currentDevicesAccountId: string | null = null;

/**
 * Validate UUID format
 */
function isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

/**
 * Show a global alert
 */
function showGlobalAlert(message: string, type: 'danger' | 'success' | 'warning' | 'info' = 'danger'): void {
    const alertsContainer = document.getElementById('liveAlerts');
    if (alertsContainer) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            <i class="bi bi-${type === 'danger' ? 'exclamation-triangle' : 'check-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        alertsContainer.appendChild(alertDiv);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }
}

/**
 * Render credential fields dynamically based on connector
 */
function renderCredentialFields(provider: string): void {
    const credentialFieldsContainer = document.getElementById('credentialFieldsContainer');
    const pushConnectorNotice = document.getElementById('pushConnectorNotice');
    const manualAccountNotice = document.getElementById('manualAccountNotice');
    const customProviderField = document.getElementById('customProviderField');
    const customProviderInput = document.getElementById('customProviderInput') as HTMLInputElement | null;
    
    if (!credentialFieldsContainer || !pushConnectorNotice || !manualAccountNotice || !customProviderField) return;
    
    // Clear previous fields
    credentialFieldsContainer.innerHTML = '';
    pushConnectorNotice.classList.add('d-none');
    manualAccountNotice.classList.add('d-none');
    customProviderField.classList.add('d-none');
    
    if (provider === 'Other') {
        customProviderField.classList.remove('d-none');
        manualAccountNotice.classList.remove('d-none');
        if (customProviderInput) customProviderInput.required = true;
        return;
    }
    
    if (customProviderInput) customProviderInput.required = false;
    
    const connector = connectorMap[provider];
    if (!connector) {
        return;
    }
    
    // For push-style connectors, show notice instead of credential fields
    if (connector.syncStyle === 'push') {
        pushConnectorNotice.classList.remove('d-none');
        return;
    }
    
    // Render credential fields for fetch-style connectors
    const fields = connector.credentialFields || [];
    if (fields.length === 0) {
        // Default fields if none specified
        credentialFieldsContainer.innerHTML = `
            <div class="col-12">
                <label class="form-label">User ID / External ID</label>
                <input class="form-control text-bg-dark" type="text" name="externalUserId" placeholder="Your external user ID">
            </div>
            <div class="col-12 mt-2">
                <label class="form-label">API Key / Token (optional)</label>
                <input class="form-control text-bg-dark" type="password" name="tokenRef" placeholder="API key or token if required">
                <div class="form-text text-white-50">This will be stored securely and used for syncing.</div>
            </div>
        `;
        return;
    }
    
    // Map field.mapsTo to actual input name
    const fieldNameMap: Record<string, string> = {
        'externalUserId': 'externalUserId',
        'tokenRef': 'tokenRef'
    };
    
    // Generate fields from schema
    fields.forEach((field, index) => {
        const fieldHtml = document.createElement('div');
        fieldHtml.className = 'col-12' + (index > 0 ? ' mt-2' : '');
        
        const labelHtml = `<label class="form-label">${field.label}${field.required ? ' *' : ''}</label>`;
        const inputType = field.type || 'text';
        const inputName = field.mapsTo ? (fieldNameMap[field.mapsTo] || field.name) : field.name;
        const requiredAttr = field.required ? 'required' : '';
        const placeholderAttr = field.placeholder ? `placeholder="${field.placeholder}"` : '';
        const inputHtml = `<input class="form-control text-bg-dark" type="${inputType}" name="${inputName}" ${requiredAttr} ${placeholderAttr}>`;
        const helpHtml = field.helpText ? `<div class="form-text text-white-50">${field.helpText}</div>` : '';
        
        fieldHtml.innerHTML = labelHtml + inputHtml + helpHtml;
        credentialFieldsContainer.appendChild(fieldHtml);
    });
}

/**
 * Check sync status for an account
 */
async function checkSyncStatus(accountId: string): Promise<void> {
    // Validate accountId format to prevent path traversal
    if (!accountId || !isValidUUID(accountId)) {
        console.error('Invalid account ID format');
        return;
    }
    
    try {
        const response = await fetch(`/games/accounts/${encodeURIComponent(accountId)}/status`);
        if (!response.ok) return;
        
        const status: SyncStatus = await response.json();
        updateSyncStatusUI(accountId, status);
        
        // If sync is in progress, start polling
        if (status.latestJob && status.latestJob.status === 'in_progress') {
            startPolling(accountId);
        } else {
            stopPolling(accountId);
        }
    } catch (err) {
        console.error('Failed to check sync status:', err);
    }
}

/**
 * Update the UI with sync status
 */
function updateSyncStatusUI(accountId: string, status: SyncStatus): void {
    const container = document.querySelector(`.sync-status-container[data-account-id="${accountId}"]`);
    if (!container) return;
    
    const statusDiv = container.querySelector('.sync-status');
    const syncBtn = document.querySelector(`.sync-btn[data-account-id="${accountId}"]`) as HTMLButtonElement | null;
    const syncIcon = syncBtn?.querySelector('.sync-icon');
    
    if (!statusDiv) return;
    
    if (!status.latestJob) {
        statusDiv.innerHTML = '';
    } else {
        const job = status.latestJob;
        let html = '';
        let spinIcon = false;
        
        switch (job.status) {
            case 'pending':
                html = '<i class="bi bi-hourglass-start me-1"></i>Sync pending...';
                spinIcon = true;
                break;
            case 'in_progress':
                html = '<i class="bi bi-arrow-repeat me-1 sync-spin"></i>Sync in progress...';
                if (job.entriesProcessed !== null && job.entriesProcessed !== undefined) {
                    html += ` (${job.entriesProcessed} games processed)`;
                }
                spinIcon = true;
                break;
            case 'completed':
                html = `<i class="bi bi-check-circle me-1 text-success"></i>`;
                html += `Completed: ${job.entriesProcessed || 0} games`;
                break;
            case 'failed':
                html = `<i class="bi bi-x-circle me-1 text-danger"></i>`;
                html += `Failed: ${job.errorMessage || 'Unknown error'}`;
                break;
        }
        
        statusDiv.innerHTML = html;
        
        // Add/remove spinning animation on sync button
        if (syncIcon) {
            if (spinIcon) {
                syncIcon.classList.add('sync-spin');
                if (syncBtn) syncBtn.disabled = true;
            } else {
                syncIcon.classList.remove('sync-spin');
                if (syncBtn) syncBtn.disabled = false;
            }
        }
    }
    
    // Show scheduled sync indicator
    const cardElement = container.closest('.card');
    let scheduleBadge = cardElement?.querySelector('.schedule-badge');
    if (status.isScheduled) {
        if (!scheduleBadge && cardElement) {
            const badgeContainer = cardElement.querySelector('.d-flex.flex-wrap.gap-1.align-items-center');
            if (badgeContainer) {
                const badge = document.createElement('span');
                badge.className = 'badge text-bg-success schedule-badge';
                badge.innerHTML = '<i class="bi bi-clock me-1"></i>Scheduled';
                badgeContainer.appendChild(badge);
            }
        }
    } else if (scheduleBadge) {
        scheduleBadge.remove();
    }
}

/**
 * Start polling for sync status
 */
function startPolling(accountId: string): void {
    if (pollingIntervals[accountId]) return; // Already polling
    
    pollingIntervals[accountId] = setInterval(() => {
        checkSyncStatus(accountId);
    }, 3000); // Poll every 3 seconds
}

/**
 * Stop polling for sync status
 */
function stopPolling(accountId: string): void {
    if (pollingIntervals[accountId]) {
        clearInterval(pollingIntervals[accountId]);
        delete pollingIntervals[accountId];
    }
}

/**
 * Load devices for an account
 */
async function loadDevices(accountId: string): Promise<void> {
    const container = document.getElementById('devicesList');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    try {
        const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/devices`);
        const data = await response.json();
        
        if (response.ok) {
            renderDevicesList(data.devices, accountId);
        } else {
            container.innerHTML = `<div class="alert alert-danger">${data.message || 'Failed to load devices'}</div>`;
        }
    } catch (err) {
        console.error('Failed to load devices:', err);
        container.innerHTML = '<div class="alert alert-danger">Failed to load devices. Please try again.</div>';
    }
}

/**
 * Render devices list
 */
function renderDevicesList(devices: DeviceInfo[], accountId: string): void {
    const container = document.getElementById('devicesList');
    if (!container) return;
    
    if (!devices || devices.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <i class="bi bi-device-hdd display-4 text-white-50 d-block mb-3"></i>
                <p class="text-white-50">No devices registered yet.</p>
                <p class="small text-white-50">Register a device above to get a token.</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-dark table-hover mb-0">
                <thead>
                    <tr>
                        <th>Device Name</th>
                        <th>Status</th>
                        <th>Last Seen</th>
                        <th>Last Import</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    devices.forEach(device => {
        const statusBadge = device.status === 'active' 
            ? '<span class="badge text-bg-success">Active</span>'
            : '<span class="badge text-bg-danger">Revoked</span>';
        const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleDateString() : '<span class="text-white-50">Never</span>';
        const lastImport = device.lastImportAt ? new Date(device.lastImportAt).toLocaleDateString() : '<span class="text-white-50">Never</span>';
        
        html += `
            <tr>
                <td>${escapeHtml(device.name)}</td>
                <td>${statusBadge}</td>
                <td>${lastSeen}</td>
                <td>${lastImport}</td>
                <td>
                    ${device.status === 'active' ? `
                        <button class="btn btn-sm btn-outline-warning revoke-device-btn" data-device-id="${device.id}">
                            <i class="bi bi-x-circle me-1"></i>Revoke
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
    
    // Add event listeners for revoke buttons
    container.querySelectorAll('.revoke-device-btn').forEach(btn => {
        btn.addEventListener('click', async function(this: HTMLElement) {
            const deviceId = this.dataset.deviceId;
            if (!deviceId || !confirm('Revoke this device? You will need to register a new device.')) return;
            
            try {
                const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/devices/${encodeURIComponent(deviceId)}/revoke`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    loadDevices(accountId);
                } else {
                    const data = await response.json();
                    showGlobalAlert(data.message || 'Failed to revoke device', 'danger');
                }
            } catch (err) {
                console.error('Failed to revoke device:', err);
                showGlobalAlert('Failed to revoke device. Please try again.', 'danger');
            }
        });
    });
}

/**
 * Escape HTML for safe insertion
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show token result modal
 */
function showTokenModal(deviceId: string, token: string, accountId: string): void {
    // Remove existing modal if any
    const existingModal = document.getElementById('tokenResultModal');
    if (existingModal) existingModal.remove();
    
    const tokenModal = document.createElement('div');
    tokenModal.innerHTML = `
        <div class="modal fade" id="tokenResultModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content text-bg-dark">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title"><i class="bi bi-key me-2"></i>Device Token</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            <i class="bi bi-exclamation-triangle me-2"></i>
                            <strong>Save this token now!</strong> It will not be shown again.
                        </div>
                        <label class="form-label">Device ID</label>
                        <input type="text" class="form-control text-bg-dark mb-3" value="${escapeHtml(deviceId)}" readonly>
                        <label class="form-label">Token</label>
                        <div class="input-group">
                            <input type="text" class="form-control text-bg-dark" id="deviceToken" value="${escapeHtml(token)}" readonly>
                            <button class="btn btn-outline-secondary copy-token-btn" type="button">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </div>
                        <p class="small text-white-50 mt-2">Use this token with your sync agent.</p>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Done</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(tokenModal);
    
    // Add copy button listener
    const copyBtn = tokenModal.querySelector('.copy-token-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const tokenInput = document.getElementById('deviceToken') as HTMLInputElement | null;
            if (tokenInput) {
                await navigator.clipboard.writeText(tokenInput.value);
                copyBtn.innerHTML = '<i class="bi bi-check"></i>';
            }
        });
    }
    
    // Add cleanup on modal close
    const modalEl = document.getElementById('tokenResultModal');
    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', () => {
            loadDevices(accountId);
        });
    }
    
    // @ts-ignore - bootstrap is loaded globally
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

/**
 * Initialize Add Account form with dynamic credential fields
 */
function initAddAccountForm(): void {
    const providerSelect = document.getElementById('providerSelect') as HTMLSelectElement | null;
    const addAccountForm = document.getElementById('addAccountForm') as HTMLFormElement | null;
    const customProviderInput = document.getElementById('customProviderInput') as HTMLInputElement | null;
    
    if (providerSelect) {
        // Initial render for default selection
        renderCredentialFields(providerSelect.value);
        
        providerSelect.addEventListener('change', function() {
            renderCredentialFields(this.value);
        });
        
        // On form submit, if "Other" is selected, use custom provider name
        if (addAccountForm) {
            addAccountForm.addEventListener('submit', function(e) {
                if (providerSelect.value === 'Other' && customProviderInput) {
                    // Replace the select value with custom provider input
                    providerSelect.name = '';
                    const hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.name = 'provider';
                    hiddenInput.value = customProviderInput.value.trim() || 'Other';
                    addAccountForm.appendChild(hiddenInput);
                }
            });
        }
    }
}

/**
 * Initialize sync status checking
 */
function initSyncStatus(): void {
    // Check sync status on page load for all accounts
    const statusContainers = document.querySelectorAll('.sync-status-container');
    statusContainers.forEach(container => {
        const accountId = (container as HTMLElement).dataset.accountId;
        if (accountId) {
            checkSyncStatus(accountId);
        }
    });
    
    // Add event listeners for check status buttons
    document.querySelectorAll('.check-status-btn').forEach(btn => {
        btn.addEventListener('click', function(this: HTMLElement) {
            const accountId = this.dataset.accountId;
            if (accountId && isValidUUID(accountId)) {
                checkSyncStatus(accountId);
            }
        });
    });
}

/**
 * Initialize Edit Account modal
 */
function initEditAccountModal(): void {
    document.querySelectorAll('.edit-account-btn').forEach(btn => {
        btn.addEventListener('click', function(this: HTMLElement) {
            const accountId = this.dataset.accountId;
            const accountName = this.dataset.accountName;
            const externalUserId = this.dataset.externalUserId || '';
            
            const accountIdInput = document.getElementById('editAccountId') as HTMLInputElement | null;
            const accountNameInput = document.getElementById('editAccountName') as HTMLInputElement | null;
            const externalUserIdInput = document.getElementById('editExternalUserId') as HTMLInputElement | null;
            
            if (accountIdInput) accountIdInput.value = accountId || '';
            if (accountNameInput) accountNameInput.value = accountName || '';
            if (externalUserIdInput) externalUserIdInput.value = externalUserId;
            
            // @ts-ignore - bootstrap is loaded globally
            const modal = new bootstrap.Modal(document.getElementById('editAccountModal'));
            modal.show();
        });
    });
    
    // Handle edit account form submission
    const editAccountForm = document.getElementById('editAccountForm') as HTMLFormElement | null;
    if (editAccountForm) {
        editAccountForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const accountIdInput = document.getElementById('editAccountId') as HTMLInputElement | null;
            const accountNameInput = document.getElementById('editAccountName') as HTMLInputElement | null;
            const externalUserIdInput = document.getElementById('editExternalUserId') as HTMLInputElement | null;
            
            const accountId = accountIdInput?.value;
            const accountName = accountNameInput?.value.trim();
            const externalUserId = externalUserIdInput?.value.trim();
            
            if (!accountId || !accountName) return;
            
            try {
                const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({accountName, externalUserId: externalUserId || null})
                });
                
                if (response.ok) {
                    location.reload();
                } else {
                    const data = await response.json();
                    showGlobalAlert(data.message || 'Failed to update account', 'danger');
                }
            } catch (err) {
                console.error('Failed to update account:', err);
                showGlobalAlert('Failed to update account. Please try again.', 'danger');
            }
        });
    }
}

/**
 * Initialize Manage Devices modal
 */
function initManageDevicesModal(): void {
    document.querySelectorAll('.manage-devices-btn').forEach(btn => {
        btn.addEventListener('click', function(this: HTMLElement) {
            currentDevicesAccountId = this.dataset.accountId || null;
            const accountName = this.dataset.accountName;
            
            const accountIdInput = document.getElementById('devicesAccountId') as HTMLInputElement | null;
            const titleEl = document.getElementById('devicesModalTitle');
            
            if (accountIdInput && currentDevicesAccountId) accountIdInput.value = currentDevicesAccountId;
            if (titleEl) titleEl.textContent = `Devices for ${accountName}`;
            
            if (currentDevicesAccountId) {
                loadDevices(currentDevicesAccountId);
            }
            
            // @ts-ignore - bootstrap is loaded globally
            const modal = new bootstrap.Modal(document.getElementById('manageDevicesModal'));
            modal.show();
        });
    });
    
    // Handle device registration form
    const registerDeviceForm = document.getElementById('registerDeviceForm') as HTMLFormElement | null;
    if (registerDeviceForm) {
        registerDeviceForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const accountIdInput = document.getElementById('devicesAccountId') as HTMLInputElement | null;
            const deviceNameInput = document.getElementById('deviceNameInput') as HTMLInputElement | null;
            const accountId = accountIdInput?.value;
            const deviceName = deviceNameInput?.value.trim();
            
            if (!accountId || !deviceName) return;
            
            try {
                const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/devices`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({deviceName})
                });
                
                const data = await response.json();
                
                if (response.ok && data.token) {
                    // Show the token to the user
                    showTokenModal(data.deviceId, data.token, accountId);
                    
                    // Clear input
                    if (deviceNameInput) deviceNameInput.value = '';
                } else {
                    showGlobalAlert(data.message || 'Failed to register device', 'danger');
                }
            } catch (err) {
                console.error('Failed to register device:', err);
                showGlobalAlert('Failed to register device. Please try again.', 'danger');
            }
        });
    }
}

/**
 * Initialize accounts page
 */
export function init(): void {
    setCurrentNavLocation();
    
    // Load connector data from data attribute
    const dataEl = document.getElementById('connectorData');
    if (dataEl && dataEl.textContent) {
        try {
            connectorsData = JSON.parse(dataEl.textContent);
            connectorsData.forEach(c => {
                connectorMap[c.provider] = c;
            });
        } catch (e) {
            console.error('Failed to parse connector data:', e);
        }
    }
    
    initAddAccountForm();
    initSyncStatus();
    initEditAccountModal();
    initManageDevicesModal();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;

// Export for use in loadDevices
(window as any).loadDevices = loadDevices;
