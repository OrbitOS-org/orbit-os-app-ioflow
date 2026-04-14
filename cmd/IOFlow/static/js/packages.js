// Apps page (packages) functionality

function formatUptime(seconds) {
    if (!seconds || seconds === 0) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

function getStatusBadgeClass(status) {
    if (status === 'running') return 'status-connected';
    if (status === 'stopped') return 'status-disconnected';
    return 'status-warning';
}

async function loadPackages() {
    const card = document.querySelector('.package-card');
    if (!card) return;

    try {
        const packages = await apiCall('/package/list');
        const element = document.getElementById('package-info-detailed');
        if (!element) return;

        card.style.display = 'block';

        if (!packages || packages.length === 0) {
            element.innerHTML = '<div class="loading">No apps installed</div>';
            return;
        }

        const pkgLabel = (p) => (p.displayName || p.appName || '').trim();

        // Sort alphabetically bu display name (manifest DisplayName)
        packages.sort((a, b) => pkgLabel(a).localeCompare(pkgLabel(b)));

        let html = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="background: var(--card-header-bg, #1e293b); text-align: left;">
                            <th style="padding: 10px 12px;">App Name</th>
                            <th style="padding: 10px 12px;">Version</th>
                            <th style="padding: 10px 12px;">Status</th>
                            <th style="padding: 10px 12px;">Uptime</th>
                            <th style="padding: 10px 12px; text-align: center;">Enabled</th>
                            <th style="padding: 10px 12px; text-align: center;">Auto Restart</th>
                            <th style="padding: 10px 12px; text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>`;

        for (const pkg of packages) {
            const statusClass = getStatusBadgeClass(pkg.processStatus);
            const statusText = pkg.processStatus || (pkg.isRunning ? 'running' : 'stopped');
            const nameForDisplay = pkg.displayName || pkg.appName || 'N/A';

            html += `
                        <tr style="border-bottom: 1px solid var(--border-color, #334155);">
                            <td style="padding: 10px 12px;">
                                <div style="font-weight: 600;">${nameForDisplay}</div>
                            </td>
                            <td style="padding: 10px 12px;">${pkg.version || 'N/A'}</td>
                            <td style="padding: 10px 12px;">
                                <span class="status-badge ${statusClass}" style="padding: 2px 10px; border-radius: 4px; font-size: 0.8em;">
                                    ${statusText}
                                </span>
                            </td>
                            <td style="padding: 10px 12px;">${formatUptime(pkg.uptimeSeconds)}</td>
                            <td style="padding: 10px 12px; text-align: center;">
                                <span style="color: ${pkg.enabled ? 'var(--success, #28a745)' : 'var(--danger, #dc3545)'}; font-weight: 600;">
                                    ${pkg.enabled ? '✓ Yes' : '✗ No'}
                                </span>
                            </td>
                            <td style="padding: 10px 12px; text-align: center;">
                                <span style="color: ${pkg.autoRestart ? 'var(--success, #28a745)' : 'var(--danger, #dc3545)'}; font-weight: 600;">
                                    ${pkg.autoRestart ? '✓ Yes' : '✗ No'}
                                </span>
                            </td>
                            <td style="padding: 10px 12px; text-align: center;">
                                <button class="btn btn-sm btn-danger" onclick="removePackage('${(pkg.appName || '').replace(/'/g, "\\'")}', '${(nameForDisplay || '').replace(/'/g, "\\'")}')" style="padding: 4px 10px; font-size: 0.78rem;">
                                    <i class="fas fa-trash"></i> Uninstall
                                </button>
                            </td>
                        </tr>`;
        }

        html += `
                    </tbody>
                </table>
            </div>`;

        element.innerHTML = html;
    } catch (error) {
        if (error.status === 501 || error.status === 503) {
            card.style.display = 'none';
            return;
        }
        const element = document.getElementById('package-info-detailed');
        if (element) {
            element.innerHTML = `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
        }
    }
}

function refreshCurrentPage() {
    loadPackages();
}

function openInstallModal() {
    const modal = document.getElementById('install-package-modal');
    if (modal) {
        modal.style.display = 'block';
        document.getElementById('install-package-form').reset();
        document.getElementById('install-progress').style.display = 'none';
        document.getElementById('install-progress-bar').value = 0;
    }
}

async function removePackage(appName, displayName) {
    const confirmed = await showConfirm(`Are you sure you want to uninstall "${displayName}"?`, 'Uninstall app');
    if (!confirmed) return;

    try {
        const result = await apiCall(`/package/remove/${appName}`, 'POST');
        if (result.success) {
            showNotification('App removed successfully!', 'success');
            loadPackages();
        } else {
            showNotification('Failed to remove app', 'error');
        }
    } catch (error) {
        showNotification(`Error removing app: ${error.message}`, 'error');
    }
}

// Install package form handler
document.addEventListener('DOMContentLoaded', () => {
    loadPackages();

    // Auto-refresh every 60 seconds
    setInterval(() => loadPackages(), 60000);

    const installForm = document.getElementById('install-package-form');
    if (installForm) {
        installForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fileInput = document.getElementById('package-file');
            const file = fileInput.files[0];
            if (!file) {
                showNotification('Please select a .orb app file', 'warning');
                return;
            }
            if (!file.name.toLowerCase().endsWith('.orb')) {
                showNotification('Invalid file format. Please select a .orb file.', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('package', file);

            const progressDiv = document.getElementById('install-progress');
            const progressBar = document.getElementById('install-progress-bar');

            progressDiv.style.display = 'block';
            progressBar.value = 0;

            try {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        progressBar.value = percentComplete;
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        if (response.success) {
                            showNotification('App installed successfully!', 'success');
                            closeModal('install-package-modal');
                            loadPackages();
                        } else {
                            showNotification('Failed to install app', 'error');
                        }
                    } else {
                        showNotification(`Error installing app: ${xhr.statusText}`, 'error');
                    }
                    progressDiv.style.display = 'none';
                });

                xhr.addEventListener('error', () => {
                    // If upload was complete (100%), the server likely restarted after installing itself
                    if (progressBar.value >= 100) {
                        showNotification('App installed. Server is restarting...', 'success');
                        closeModal('install-package-modal');
                        setTimeout(() => { window.location.reload(); }, 5000);
                    } else {
                        showNotification('Error uploading app file', 'error');
                    }
                    progressDiv.style.display = 'none';
                });

                xhr.open('POST', '/api/package/install');
                xhr.send(formData);
            } catch (error) {
                showNotification(`Error: ${error.message}`, 'error');
                progressDiv.style.display = 'none';
            }
        });
    }
});
