// Core functionality and utilities
//
// When IOFlow is opened via AppHub at /ioflow, the API is proxied at /ioflow/api (not /api at site root).
// Absolute paths like /api/... would hit the portal and return HTML — breaking fetch and SSE (EventSource).
function ioFlowApiBase() {
    const p = window.location.pathname || '';
    if (p === '/ioflow' || p.startsWith('/ioflow/')) {
        return '/ioflow/api';
    }
    return '/api';
}
// var so other scripts (gpio, etc.) see the same base when loaded after core.js.
var API_BASE = ioFlowApiBase();

// Utility functions
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(errorText || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.message = errorText || error.message;
            throw error;
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        // If not JSON, return text
        return await response.text();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString('en-US');
}

function getStatusBadge(connected) {
    if (connected === true || connected === 'true' || connected === 1) {
        return '<span class="status-badge status-connected">Connected</span>';
    } else if (connected === false || connected === 'false' || connected === 0) {
        return '<span class="status-badge status-disconnected">Disconnected</span>';
    }
    return '<span class="status-badge status-unknown">Unknown</span>';
}

// Navigation
function navigateTo(path) {
    window.location.href = path;
}

// Modal functions
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// ============================================
// Toast Notification (global)
// ============================================
function showNotification(message, type) {
    let c = document.getElementById('notification-container');
    if (!c) {
        c = document.createElement('div');
        c.id = 'notification-container';
        c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;max-width:400px;';
        document.body.appendChild(c);
    }
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const colors = { success: 'var(--success, #10b981)', error: 'var(--danger, #ef4444)', warning: 'var(--warning, #f59e0b)', info: 'var(--info, #3b82f6)' };
    const bg = 'var(--bg-card, #13151d)';
    const border = colors[type] || colors.info;
    const icon = icons[type] || icons.info;

    const n = document.createElement('div');
    n.style.cssText = `background:${bg};color:var(--text-primary, #e8ecf4);padding:12px 18px;border-radius:10px;font-size:0.88rem;box-shadow:0 8px 24px rgba(0,0,0,.4);border-left:4px solid ${border};display:flex;align-items:center;gap:10px;animation:slideIn .3s ease;backdrop-filter:blur(10px);`;
    n.innerHTML = `<i class="fas ${icon}" style="color:${border};font-size:1rem;flex-shrink:0;"></i><span style="flex:1;">${message}</span><span style="cursor:pointer;opacity:0.5;margin-left:8px;" onclick="this.parentElement.remove()">&times;</span>`;
    c.appendChild(n);
    setTimeout(() => { n.style.animation = 'fadeOut .3s ease'; setTimeout(() => n.remove(), 300); }, 4000);
}

// Alias for network.js compatibility
function showNetworkNotification(message, type) {
    showNotification(message, type);
}

// ============================================
// Confirm Dialog (global, replaces browser confirm)
// ============================================
function showConfirm(message, title) {
    return new Promise((resolve) => {
        // Remove existing confirm modal if any
        const existing = document.getElementById('confirm-dialog-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'confirm-dialog-modal';
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;margin:15% auto;">
                <div class="modal-header">
                    <h3><i class="fas fa-question-circle"></i> ${title || 'Confirm'}</h3>
                </div>
                <div class="modal-body" style="padding:var(--spacing-lg);">
                    <p style="color:var(--text-secondary);font-size:0.95rem;margin:0 0 var(--spacing-lg) 0;">${message}</p>
                    <div style="display:flex;gap:var(--spacing-sm);justify-content:flex-end;">
                        <button class="btn btn-secondary" id="confirm-dialog-cancel"><i class="fas fa-times"></i> Cancel</button>
                        <button class="btn btn-danger" id="confirm-dialog-ok"><i class="fas fa-check"></i> Confirm</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const cleanup = (result) => {
            modal.remove();
            resolve(result);
        };

        document.getElementById('confirm-dialog-ok').onclick = () => cleanup(true);
        document.getElementById('confirm-dialog-cancel').onclick = () => cleanup(false);
        modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Set current year in footer
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

});
