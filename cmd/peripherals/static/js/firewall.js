// Firewall page functionality

// ===== Zones =====

async function loadZones() {
    try {
        const resp = await apiCall('/firewall/zones');
        const zones = resp.zones || [];
        const container = document.getElementById('zones-container');
        if (!container) return;

        if (zones.length === 0) {
            container.innerHTML = '<div class="loading" style="color: var(--text-muted);">No zones configured</div>';
            return;
        }

        let html = '<div class="interfaces-grid">';
        for (const zone of zones) {
            const inputBadge = getPolicyBadge(zone.inputPolicy || zone.input_policy);
            const outputBadge = getPolicyBadge(zone.outputPolicy || zone.output_policy);
            const interfaces = (zone.interfaces || []).join(', ') || 'None';
            const masquerade = zone.masquerade ? '<span class="status-badge status-connected">Yes</span>' : '<span class="status-badge status-disconnected">No</span>';

            html += `
                <div class="interface-card">
                    <div class="interface-header">
                        <h3><i class="fas fa-layer-group" style="margin-right:6px;opacity:0.7;"></i> ${zone.name}</h3>
                        <button class="btn btn-sm btn-danger" onclick="removeZone('${zone.name}')" title="Remove Zone">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="interface-details">
                        <div class="info-item"><span class="info-label">Interfaces</span><span class="info-value font-mono">${interfaces}</span></div>
                        <div class="info-item"><span class="info-label">Input Policy</span><span class="info-value">${inputBadge}</span></div>
                        <div class="info-item"><span class="info-label">Output Policy</span><span class="info-value">${outputBadge}</span></div>
                        <div class="info-item"><span class="info-label">Masquerade</span><span class="info-value">${masquerade}</span></div>
                    </div>
                </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        console.error('Error loading zones:', e);
        const container = document.getElementById('zones-container');
        if (container) container.innerHTML = `<div class="loading" style="color: var(--danger);">Error: ${e.message}</div>`;
    }
}

function getPolicyBadge(policy) {
    const p = (policy || '').toUpperCase().replace('POLICY_', '');
    switch (p) {
        case 'ACCEPT': return '<span class="status-badge status-connected">Accept</span>';
        case 'DROP': return '<span class="status-badge status-disconnected">Drop</span>';
        case 'REJECT': return '<span class="status-badge" style="background:var(--warning-glow);color:var(--warning);border:1px solid rgba(245,158,11,0.2);">Reject</span>';
        default: return `<span class="status-badge status-unknown">${p || 'Accept'}</span>`;
    }
}

function getPolicyName(policy) {
    const val = Number(policy);
    switch (val) {
        case 0: return 'Accept';
        case 1: return 'Drop';
        case 2: return 'Reject';
        default: return policy || 'Accept';
    }
}

function getProtocolName(proto) {
    const val = Number(proto);
    switch (val) {
        case 0: return 'Any';
        case 1: return 'TCP';
        case 2: return 'UDP';
        case 3: return 'ICMP';
        default: return proto || 'Any';
    }
}

async function openAddZoneModal() {
    document.getElementById('add-zone-form').reset();
    document.getElementById('add-zone-modal').style.display = 'block';
    await loadInterfaceCheckboxes();
}

async function submitAddZone(e) {
    e.preventDefault();
    const name = document.getElementById('zone-name').value.trim();
    const checkboxes = document.querySelectorAll('#zone-interfaces-list input[type="checkbox"]:checked');
    const interfaces = Array.from(checkboxes).map(cb => cb.value);
    const inputPolicy = document.getElementById('zone-input-policy').value;
    const outputPolicy = document.getElementById('zone-output-policy').value;
    const masquerade = document.getElementById('zone-masquerade').checked;

    try {
        const resp = await fetch('/api/firewall/zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, interfaces, inputPolicy, outputPolicy, masquerade })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'Zone added' : 'Failed to add zone', result.success ? 'success' : 'error');
        closeModal('add-zone-modal');
        await loadZones();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function removeZone(name) {
    const confirmed = await showConfirm(`Remove zone "${name}"?`, 'Remove Zone');
    if (!confirmed) return;
    try {
        const resp = await fetch(`/api/firewall/zones/${name}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'Zone removed' : 'Failed to remove', result.success ? 'success' : 'error');
        await loadZones();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

// ===== Rules =====

async function loadRules() {
    try {
        const resp = await apiCall('/firewall/rules');
        const rules = resp.rules || [];
        const container = document.getElementById('rules-container');
        if (!container) return;

        if (rules.length === 0) {
            container.innerHTML = '<div class="loading" style="color: var(--text-muted);">No rules configured</div>';
            return;
        }

        let html = `<div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);text-align:left;">
                        <th style="padding:8px 12px;color:var(--text-muted);font-weight:600;">Source Zone</th>
                        <th style="padding:8px 12px;color:var(--text-muted);font-weight:600;">Dest Zone</th>
                        <th style="padding:8px 12px;color:var(--text-muted);font-weight:600;">Protocol</th>
                        <th style="padding:8px 12px;color:var(--text-muted);font-weight:600;">Source IP</th>
                        <th style="padding:8px 12px;color:var(--text-muted);font-weight:600;">Dest Port</th>
                        <th style="padding:8px 12px;color:var(--text-muted);font-weight:600;">Action</th>
                        <th style="padding:8px 12px;color:var(--text-muted);font-weight:600;">Comment</th>
                        <th style="padding:8px 12px;"></th>
                    </tr>
                </thead>
                <tbody>`;

        for (const rule of rules) {
            const srcZone = rule.srcZone || rule.src_zone || '*';
            const dstZone = rule.dstZone || rule.dst_zone || '*';
            const protocol = getProtocolName(rule.protocol);
            const srcIp = rule.srcIp || rule.src_ip || '*';
            const destPort = (rule.destPort || rule.dest_port || 0) === 0 ? '*' : (rule.destPort || rule.dest_port);
            const action = getPolicyName(rule.action);
            const comment = rule.comment || '';
            const id = rule.id || '';

            const actionColor = action === 'Accept' ? 'var(--success)' : action === 'Drop' ? 'var(--danger)' : 'var(--warning)';

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                    <td style="padding:10px 12px;color:var(--text-primary);">${srcZone}</td>
                    <td style="padding:10px 12px;color:var(--text-primary);">${dstZone}</td>
                    <td style="padding:10px 12px;color:var(--text-secondary);">${protocol}</td>
                    <td style="padding:10px 12px;color:var(--text-secondary);font-family:monospace;">${srcIp}</td>
                    <td style="padding:10px 12px;color:var(--text-secondary);">${destPort}</td>
                    <td style="padding:10px 12px;"><span style="color:${actionColor};font-weight:600;">${action}</span></td>
                    <td style="padding:10px 12px;color:var(--text-muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;">${comment}</td>
                    <td style="padding:10px 12px;text-align:right;">
                        <button class="btn btn-sm btn-danger" onclick="removeRule('${id}')" title="Remove"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        }

        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (e) {
        console.error('Error loading rules:', e);
        const container = document.getElementById('rules-container');
        if (container) container.innerHTML = `<div class="loading" style="color: var(--danger);">Error: ${e.message}</div>`;
    }
}

async function openAddRuleModal() {
    document.getElementById('add-rule-form').reset();
    document.getElementById('add-rule-modal').style.display = 'block';
    await populateZoneDropdowns();
}

async function submitAddRule(e) {
    e.preventDefault();
    const srcZone = document.getElementById('rule-src-zone').value.trim();
    const dstZone = document.getElementById('rule-dst-zone').value.trim();
    const protocol = document.getElementById('rule-protocol').value;
    const srcIp = document.getElementById('rule-src-ip').value.trim();
    const destPort = parseInt(document.getElementById('rule-dest-port').value) || 0;
    const action = document.getElementById('rule-action').value;
    const comment = document.getElementById('rule-comment').value.trim();

    try {
        const resp = await fetch('/api/firewall/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ srcZone, dstZone, protocol, srcIp, destPort, action, comment })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'Rule added' : 'Failed to add rule', result.success ? 'success' : 'error');
        closeModal('add-rule-modal');
        await loadRules();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function removeRule(id) {
    const confirmed = await showConfirm('Remove this rule?', 'Remove Rule');
    if (!confirmed) return;
    try {
        const resp = await fetch(`/api/firewall/rules/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'Rule removed' : 'Failed to remove', result.success ? 'success' : 'error');
        await loadRules();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function flushAllRules() {
    const confirmed = await showConfirm('Remove ALL firewall rules? This cannot be undone.', 'Flush All Rules');
    if (!confirmed) return;
    try {
        const resp = await fetch('/api/firewall/rules/flush', { method: 'POST' });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'All rules flushed' : 'Failed to flush', result.success ? 'success' : 'error');
        await loadRules();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function applyFirewallConfig() {
    const confirmed = await showConfirm(
        'Apply the saved zones and rules to the running firewall now? This updates the live datapath in one step.',
        'Apply firewall'
    );
    if (!confirmed) return;
    try {
        const resp = await fetch('/api/firewall/apply', { method: 'POST' });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(
            result.success ? 'Firewall configuration applied' : 'Apply failed',
            result.success ? 'success' : 'error'
        );
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

// ===== Dynamic Dropdowns =====

// Fetch all network interfaces and show as checkboxes
async function loadInterfaceCheckboxes() {
    const container = document.getElementById('zone-interfaces-list');
    if (!container) return;
    container.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Loading...</span>';

    const allInterfaces = [];

    try {
        const ethResp = await apiCall('/ethernet/interfaces').catch(() => null);
        if (ethResp && ethResp.interfaces) {
            for (const iface of ethResp.interfaces) {
                const name = iface.interface_name || iface.interfaceName;
                if (name) allInterfaces.push(name);
            }
        }
    } catch (e) {}

    try {
        const wifiResp = await apiCall('/wifi/interfaces').catch(() => null);
        if (wifiResp) {
            const ifaces = Array.isArray(wifiResp) ? wifiResp : (wifiResp.interfaces || []);
            for (const iface of ifaces) {
                const name = iface.interface_name || iface.interfaceName;
                if (name) allInterfaces.push(name);
            }
        }
    } catch (e) {}

    try {
        const cellResp = await apiCall('/cellular/interfaces').catch(() => null);
        if (cellResp && cellResp.interfaces) {
            for (const iface of cellResp.interfaces) {
                const name = iface.interface_name || iface.interfaceName;
                if (name) allInterfaces.push(name);
            }
        }
    } catch (e) {}

    if (allInterfaces.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">No interfaces found</span>';
        return;
    }

    let html = '';
    for (const name of allInterfaces) {
        html += `
            <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;font-size:0.88rem;color:var(--text-primary);transition:all 0.2s;">
                <input type="checkbox" value="${name}" style="accent-color:var(--primary);">
                <span style="font-family:'SF Mono','Fira Code',monospace;">${name}</span>
            </label>`;
    }
    container.innerHTML = html;
}

// Populate zone dropdowns in the Add Rule modal
async function populateZoneDropdowns() {
    try {
        const resp = await apiCall('/firewall/zones');
        const zones = resp.zones || [];

        const srcSelect = document.getElementById('rule-src-zone');
        const dstSelect = document.getElementById('rule-dst-zone');

        // Reset options, keep "Any" as first
        srcSelect.innerHTML = '<option value="">Any</option>';
        dstSelect.innerHTML = '<option value="">Any</option>';

        for (const zone of zones) {
            const name = zone.name;
            srcSelect.innerHTML += '<option value="' + name + '">' + name + '</option>';
            dstSelect.innerHTML += '<option value="' + name + '">' + name + '</option>';
        }
    } catch (e) {
        console.error('Error loading zones for dropdowns:', e);
    }
}

// ===== Helpers =====

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// showNotification is now provided globally by core.js

function refreshCurrentPage() {
    loadZones();
    loadRules();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    loadZones();
    loadRules();
});
