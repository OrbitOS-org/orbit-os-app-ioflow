// Network page functionality
// All three interface types (WiFi, Ethernet, Cellular) return proto responses directly:
//   { "interfaces": [...], "error": {...} }
// Fields use snake_case: interface_name, mac_address, state, ipv4_address, etc.

// ===== Ethernet State Constants (aligned with NetworkManager / nmcli) =====
const EthernetState = {
    ETH_UNKNOWN: 0,
    ETH_UNMANAGED: 10,
    ETH_UNAVAILABLE: 20,
    ETH_DISCONNECTED: 30,
    ETH_PREPARE: 40,
    ETH_CONFIG: 50,
    ETH_NEED_AUTH: 60,
    ETH_IP_CONFIG: 70,
    ETH_IP_CHECK: 80,
    ETH_SECONDARIES: 90,
    ETH_CONNECTED: 100,
    ETH_DEACTIVATING: 110,
    ETH_FAILED: 120,
};

function getEthernetStateName(state) {
    const stateNames = {
        0: 'Unknown',
        10: 'Unmanaged',
        20: 'Unavailable',
        30: 'Disconnected',
        40: 'Preparing',
        50: 'Configuring',
        60: 'Need Auth',
        70: 'IP Config',
        80: 'IP Check',
        90: 'Secondaries',
        100: 'Connected',
        110: 'Deactivating',
        120: 'Failed',
    };
    return stateNames[state] || `Unknown (${state})`;
}

function getStateColor(state) {
    if (state === EthernetState.ETH_CONNECTED) return 'var(--success, #28a745)';
    if (state === EthernetState.ETH_FAILED) return 'var(--danger, #dc3545)';
    if (state === EthernetState.ETH_DISCONNECTED) return 'var(--text-secondary, #6c757d)';
    if (state === EthernetState.ETH_UNAVAILABLE) return 'var(--text-secondary, #6c757d)';
    return 'var(--warning, #ffc107)';
}

/**
 * Toggle "on" only when the link is up or progressing (NM 40–100).
 * ETH_DISCONNECTED (30) must be OFF — after DisableEthernet the state is often 30; the old rule (state >= 30) kept the toggle checked.
 */
function ethernetInterfaceToggleIsOn(state) {
    const s = Number(state);
    if (Number.isNaN(s)) return false;
    if (s === EthernetState.ETH_CONNECTED) return true;
    if (s >= EthernetState.ETH_PREPARE && s <= EthernetState.ETH_SECONDARIES) return true;
    return false;
}

// ===== Generic function to load interfaces from proto response =====
async function loadInterfacesFromProto(endpoint, cardSelector, elementId, renderFn) {
    const card = document.querySelector(cardSelector);
    if (!card) return;

    try {
        const response = await fetch(`/api${endpoint}`);

        if (!response.ok) {
            if (response.status === 501 || response.status === 503) {
                card.style.display = 'none';
                return;
            }
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
        }

        const result = await response.json();

        // Check for proto error field
        if (result.error && typeof result.error === 'object' && Object.keys(result.error).length > 0) {
            const errorObj = result.error;
            if (errorObj.code !== undefined && errorObj.code !== 0) {
                throw new Error(errorObj.message || `Error code ${errorObj.code}`);
            }
        }

        const interfaces = result.interfaces || [];

        if (!Array.isArray(interfaces) || interfaces.length === 0) {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'block';
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = renderFn(interfaces);
        }

    } catch (error) {
        console.error(`Error loading ${endpoint}:`, error);
        if (error.message && (
            error.message.includes('not implemented') ||
            error.message.includes('unavailable') ||
            error.message.includes('Unimplemented')
        )) {
            card.style.display = 'none';
            return;
        }
        card.style.display = 'block';
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div class="loading" style="color: var(--danger);">Error: ${error.message || 'Unknown error'}</div>`;
        }
    }
}

// =============================================
// ===== ETHERNET =====
// =============================================

function renderEthernetInterfaces(interfaces) {
    let html = '<div class="interfaces-grid">';
    for (const iface of interfaces) {
        const state = iface.state || 0;
        const interfaceName = iface.interface_name || 'Unknown';
        const macAddress = iface.mac_address || 'N/A';
        const mtu = iface.mtu || 'N/A';
        const isDhcp = iface.dhcp_enable === true;
        const ipv4Address = iface.ipv4_address || 'N/A';
        const ipv4Gateway = iface.ipv4_gateway || 'N/A';
        const ipv4Dns = (iface.ipv4_dns && iface.ipv4_dns.length > 0) ? iface.ipv4_dns.join(', ') : 'N/A';

        const isEnabled = ethernetInterfaceToggleIsOn(state);
        const safeId = interfaceName.replace(/[^a-zA-Z0-9]/g, '_');

        html += `
            <div class="interface-card">
                <div class="interface-header">
                    <h3>${interfaceName}</h3>
                    <div class="interface-header-actions">
                        <span class="state-badge" style="background-color: ${getStateColor(state)}; color: white;">
                            ${getEthernetStateName(state)}
                        </span>
                        <label class="toggle-switch" style="margin: 0;" title="${isEnabled ? 'Disable' : 'Enable'} interface">
                            <input type="checkbox" id="eth-toggle-${safeId}" ${isEnabled ? 'checked' : ''} onchange="toggleEthernetInterface('${interfaceName}', this)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="interface-details">
                    <div class="info-item">
                        <span class="info-label">MAC Address:</span>
                        <span class="info-value">${macAddress}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">MTU:</span>
                        <span class="info-value">${mtu}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">DHCP:</span>
                        <span class="info-value" style="color: ${isDhcp ? 'var(--success, #28a745)' : 'var(--warning, #ffc107)'}; font-weight: 600;">
                            ${isDhcp ? 'Enabled' : 'Disabled (Static)'}
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">IPv4 Address:</span>
                        <span class="info-value">${ipv4Address}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">IPv4 Gateway:</span>
                        <span class="info-value">${ipv4Gateway}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">DNS Servers:</span>
                        <span class="info-value">${ipv4Dns}</span>
                    </div>
                </div>
                <div class="interface-actions">
                    <button class="btn btn-sm btn-primary" onclick="openEthernetConfig('${interfaceName}')">
                        <i class="fas fa-cog"></i> Configure
                    </button>
                </div>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

async function loadEthernetInfo() {
    await loadInterfacesFromProto('/ethernet/interfaces', '.ethernet-card', 'ethernet-info-detailed', renderEthernetInterfaces);
}

function ethernetToggleLog(phase, detail) {
    void phase;
    void detail;
}

async function toggleEthernetInterface(interfaceName, el) {
    const action = el.checked ? 'enable' : 'disable';
    const url = `/api/ethernet/${action}/${interfaceName}`;

    ethernetToggleLog('click', {
        interfaceName,
        action,
        checkboxCheckedAfterClick: el.checked,
        url,
        method: 'POST',
    });

    try {
        const resp = await fetch(url, { method: 'POST' });
        const rawBody = await resp.text();

        ethernetToggleLog('response', {
            httpStatus: resp.status,
            ok: resp.ok,
            bodyLength: rawBody.length,
            body: rawBody,
        });

        if (!resp.ok) {
            throw new Error(rawBody || `HTTP ${resp.status}`);
        }

        let result;
        try {
            result = rawBody ? JSON.parse(rawBody) : {};
        } catch (parseErr) {
            ethernetToggleLog('parse error', { message: parseErr.message, rawBody });
            throw new Error('Invalid JSON response from server');
        }

        ethernetToggleLog('parsed', result);

        if (result.success) {
            ethernetToggleLog('OK — server accepted the request; list refreshes in ~1.5s (NM state via ListEthernetInterfaces).', {
                interfaceName,
                action,
            });
            showNetworkNotification(`${interfaceName} ${el.checked ? 'enabled' : 'disabled'}`, 'success');
            setTimeout(() => loadEthernetInfo(), 1500);
        } else {
            const detail = (result.error && result.error.message) ? result.error.message : 'Operation failed';
            ethernetToggleLog('logical failure', { success: result.success, error: result.error });
            throw new Error(detail);
        }
    } catch (error) {
        ethernetToggleLog('catch', { message: error.message, stack: error.stack });
        el.checked = !el.checked;
        showNetworkNotification(`Error: ${error.message}`, 'error');
    }
}

// Open Ethernet config modal with current interface values
async function openEthernetConfig(interfaceName) {
    document.getElementById('eth-config-iface-name').textContent = interfaceName;
    document.getElementById('ethernet-config-form').dataset.interface = interfaceName;

    // Hide any previous messages
    const msgEl = document.getElementById('eth-config-message');
    if (msgEl) msgEl.style.display = 'none';

    // Load current properties from GetEthernetLinkProperties to pre-fill the form
    try {
        const response = await fetch(`/api/ethernet/interface/${interfaceName}`);
        if (response.ok) {
            const data = await response.json();
            // The proto response wraps in "properties"
            const props = data.properties || data;
            const isDhcp = props.dhcp_enable === true;
            const ip = props.ipv4_address || '';
            const gw = props.ipv4_gateway || '';
            const dns = props.ipv4_dns || [];

            // Use the dhcp_enable field from the proto response
            document.getElementById('eth-dhcp').checked = isDhcp;
            document.getElementById('eth-ipv4-address').value = ip;
            document.getElementById('eth-ipv4-gateway').value = gw;
            document.getElementById('eth-ipv4-dns').value = Array.isArray(dns) ? dns.join(', ') : '';
            toggleEthStaticConfig();
        }
    } catch (err) {
        // If we can't load properties, just open with defaults (DHCP enabled)
        document.getElementById('eth-dhcp').checked = true;
        document.getElementById('eth-ipv4-address').value = '';
        document.getElementById('eth-ipv4-gateway').value = '';
        document.getElementById('eth-ipv4-dns').value = '';
        toggleEthStaticConfig();
    }

    // Show modal
    document.getElementById('ethernet-config-modal').style.display = 'block';
}

function toggleEthStaticConfig() {
    const dhcpChecked = document.getElementById('eth-dhcp').checked;
    const staticConfig = document.getElementById('eth-static-config');
    if (staticConfig) {
        staticConfig.style.display = dhcpChecked ? 'none' : 'block';
    }
}

function showEthConfigMessage(text, type) {
    const msgEl = document.getElementById('eth-config-message');
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    msgEl.style.backgroundColor = type === 'success' ? 'var(--success)' : 'var(--danger)';
    msgEl.style.color = 'white';
}

async function saveEthernetConfig(e) {
    e.preventDefault();
    const form = document.getElementById('ethernet-config-form');
    const interfaceName = form.dataset.interface;
    if (!interfaceName) return;

    const saveBtn = document.getElementById('eth-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    const dhcpEnable = document.getElementById('eth-dhcp').checked;
    const ipv4Address = document.getElementById('eth-ipv4-address').value.trim();
    const ipv4Gateway = document.getElementById('eth-ipv4-gateway').value.trim();
    const ipv4DnsStr = document.getElementById('eth-ipv4-dns').value.trim();
    const ipv4Dns = ipv4DnsStr ? ipv4DnsStr.split(',').map(s => s.trim()).filter(s => s) : [];

    try {
        const response = await fetch(`/api/ethernet/config/${interfaceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dhcpEnable: dhcpEnable,
                ipv4Address: ipv4Address,
                ipv4Gateway: ipv4Gateway,
                ipv4Dns: ipv4Dns,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || `HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.success || result.value) {
            showEthConfigMessage(`Configuration saved for ${interfaceName}`, 'success');
            // Reload interfaces after 1 second
            setTimeout(() => {
                closeModal('ethernet-config-modal');
                loadEthernetInfo();
            }, 1000);
        } else {
            showEthConfigMessage('Failed to save configuration', 'error');
        }
    } catch (error) {
        console.error('Error saving Ethernet config:', error);
        showEthConfigMessage(`Error: ${error.message}`, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        }
    }
}

// =============================================
// ===== WIFI =====
// =============================================

// WiFi states aligned with NetworkManager (nmcli) values
const WiFiState = {
    WIFI_UNKNOWN:      0,
    WIFI_UNMANAGED:    10,
    WIFI_UNAVAILABLE:  20,
    WIFI_DISCONNECTED: 30,
    WIFI_PREPARE:      40,
    WIFI_CONFIG:       50,
    WIFI_NEED_AUTH:    60,
    WIFI_IP_CONFIG:    70,
    WIFI_IP_CHECK:     80,
    WIFI_SECONDARIES:  90,
    WIFI_ACTIVATED:    100,
    WIFI_DEACTIVATING: 110,
    WIFI_FAILED:       120,
};

const WiFiMode = {
    UNKNOWN:   0,
    AP:        1,
    CLIENT:    2,
    AP_CLIENT: 3,
    DISABLED:  4,
};

// Current selected WiFi interface
let currentWiFiInterface = null;

/** Prevents double Apply (double-click before the button disables). */
let wifiApplyInProgress = false;

function getWiFiStateName(state) {
    const stateNames = {
        [WiFiState.WIFI_UNKNOWN]: 'Unknown',
        [WiFiState.WIFI_UNMANAGED]: 'Unmanaged',
        [WiFiState.WIFI_UNAVAILABLE]: 'Unavailable',
        [WiFiState.WIFI_DISCONNECTED]: 'Disconnected',
        [WiFiState.WIFI_PREPARE]: 'Preparing',
        [WiFiState.WIFI_CONFIG]: 'Configuring',
        [WiFiState.WIFI_NEED_AUTH]: 'Auth Required',
        [WiFiState.WIFI_IP_CONFIG]: 'IP Configuring',
        [WiFiState.WIFI_IP_CHECK]: 'IP Checking',
        [WiFiState.WIFI_SECONDARIES]: 'Secondaries',
        [WiFiState.WIFI_ACTIVATED]: 'Connected',
        [WiFiState.WIFI_DEACTIVATING]: 'Deactivating',
        [WiFiState.WIFI_FAILED]: 'Failed',
    };
    return stateNames[state] || `Unknown (${state})`;
}

function getWiFiStateColor(state) {
    if (state === WiFiState.WIFI_ACTIVATED) return 'var(--success, #28a745)';
    if (state === WiFiState.WIFI_FAILED) return 'var(--danger, #dc3545)';
    if (state === WiFiState.WIFI_DISCONNECTED) return 'var(--text-secondary, #6c757d)';
    return 'var(--warning, #ffc107)';
}

function getWiFiModeName(mode) {
    const modeNames = {
        0: 'Unknown', 1: 'Access Point', 2: 'Client',
        3: 'AP + Client', 4: 'Disabled',
    };
    const m = Number(mode);
    const key = Number.isNaN(m) ? 0 : m;
    return modeNames[key] || `Unknown (${mode})`;
}

/**
 * True if the interface is already in a mode compatible with the UI target, so SetWiFiMode can be skipped.
 * Modal maps AP_CLIENT → CLIENT in the dropdown; GET /mode can still return 3 while the form sends 2 — repeating
 * POST { mode: 2 } would try to "change" mode unnecessarily and some stacks return an error even though the profile is fine.
 */
function wifiCurrentModeMatchesApplyTarget(currentMode, targetMode) {
    if (Number.isNaN(currentMode)) return false;
    if (currentMode === targetMode) return true;
    if (targetMode === WiFiMode.CLIENT && (currentMode === WiFiMode.CLIENT || currentMode === WiFiMode.AP_CLIENT)) {
        return true;
    }
    if (targetMode === WiFiMode.AP && (currentMode === WiFiMode.AP || currentMode === WiFiMode.AP_CLIENT)) {
        return true;
    }
    return false;
}

/** Maps API mode to a value that exists in #wifi-mode-select (1 / 2 / 4). UNKNOWN or bad values → Client so the dropdown never shows blank. */
function normalizeWifiModeForSelect(raw) {
    const m = Number(raw);
    if (!Number.isFinite(m)) {
        return WiFiMode.CLIENT;
    }
    if (m === WiFiMode.AP_CLIENT) {
        return WiFiMode.CLIENT;
    }
    if (m === WiFiMode.AP || m === WiFiMode.CLIENT || m === WiFiMode.DISABLED) {
        return m;
    }
    return WiFiMode.CLIENT;
}

async function resyncWiFiModalOperationMode(iface) {
    if (!iface) return;
    try {
        const resp = await fetch(`/api/wifi/mode/${encodeURIComponent(iface)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const mode = normalizeWifiModeForSelect(data.mode);
        const sel = document.getElementById('wifi-mode-select');
        if (!sel) return;
        sel.value = String(mode);
        updateWiFiSections(mode);
    } catch (e) {
        console.warn('resyncWiFiModalOperationMode:', e);
    }
}

/** JSON may encode enum mode as number, numeric string, or proto name (e.g. WIFI_MODE_CLIENT). */
function wifiNumericMode(iface) {
    const raw = iface && iface.mode;
    if (raw === undefined || raw === null) return 0;
    if (typeof raw === 'string' && raw.startsWith('WIFI_MODE_')) {
        const m = {
            WIFI_MODE_UNKNOWN: 0,
            WIFI_MODE_AP: 1,
            WIFI_MODE_CLIENT: 2,
            WIFI_MODE_AP_CLIENT: 3,
            WIFI_MODE_DISABLED: 4,
        };
        if (m[raw] !== undefined) return m[raw];
    }
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
}

function wifiNumericState(iface) {
    const n = Number(iface && iface.state);
    return Number.isNaN(n) ? 0 : n;
}

/** Normalise embedded client data from ListWiFiInterfaces (proto snake/camel + edge cases). */
function getEmbeddedClientProps(iface) {
    if (!iface) return null;
    return iface.client_properties || iface.clientProperties
        || iface.client || iface.Client || null;
}

/**
 * Map GET /api/wifi/client/properties (ClientProperties) to the shape used in the WiFi card.
 * Accepts snake_case (current API) or legacy PascalCase from older builds.
 */
function clientPropsFromAPIResponse(props) {
    if (props == null || typeof props !== 'object') {
        return {};
    }
    const p = props.properties != null && typeof props.properties === 'object' ? props.properties : props;
    return {
        ssid: p.ssid || p.Ssid || p.SSID || '',
        ipv4_address: p.ipv4_address || p.Ipv4Address || '',
        ipv4_gateway: p.ipv4_gateway || p.Ipv4Gateway || '',
        ipv4_dns: normalizeIpv4DnsArray(p.ipv4_dns != null ? p.ipv4_dns : p.Ipv4Dns),
        signal_strength: p.signal_strength !== undefined && p.signal_strength !== null
            ? p.signal_strength
            : (p.SignalStrength !== undefined && p.SignalStrength !== null ? p.SignalStrength : undefined),
        bssid: p.bssid || p.Bssid || '',
        security: p.security || p.Security || '',
        dhcp_enable: p.dhcp_enable !== undefined ? p.dhcp_enable : p.DhcpEnable,
        channel: p.channel !== undefined ? p.channel : p.Channel,
        band: p.band || p.Band || '',
    };
}

function wifiHasUsableSsid(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj.ssid || obj.SSID || obj.Ssid;
    return Boolean(s && String(s).trim() !== '');
}

function firstDefined(...vals) {
    for (const v of vals) {
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

/** Normalise DNS from API (repeated string, array, or comma-separated string). */
function normalizeIpv4DnsArray(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
}

/** Prefer first source with a non-empty DNS list (same idea as mergeWifiClientPropsForCard). */
function mergeIpv4DnsArrays(...sources) {
    for (const s of sources) {
        const a = normalizeIpv4DnsArray(s);
        if (a.length > 0) return a;
    }
    return [];
}

/** Pick SSID: prefer dedicated GetClientProperties, then link snapshot, then list embed (never replace good with empty). */
function mergeWifiClientPropsForCard(embeddedRaw, grpcRaw, linkClientRaw) {
    const embedded = clientPropsFromAPIResponse(embeddedRaw || {});
    const grpc = clientPropsFromAPIResponse(grpcRaw || {});
    const link = clientPropsFromAPIResponse(linkClientRaw || {});

    const ssid = [grpc, link, embedded].map((o) => {
        const s = o.ssid && String(o.ssid).trim();
        return s || '';
    }).find(Boolean) || '';

    return {
        ssid,
        ipv4_address: firstDefined(grpc.ipv4_address, link.ipv4_address, embedded.ipv4_address) || '',
        ipv4_gateway: firstDefined(grpc.ipv4_gateway, link.ipv4_gateway, embedded.ipv4_gateway) || '',
        ipv4_dns: mergeIpv4DnsArrays(grpc.ipv4_dns, link.ipv4_dns, embedded.ipv4_dns),
        signal_strength: firstDefined(grpc.signal_strength, link.signal_strength, embedded.signal_strength),
        bssid: firstDefined(grpc.bssid, link.bssid, embedded.bssid) || '',
        security: firstDefined(grpc.security, link.security, embedded.security) || '',
        dhcp_enable: firstDefined(grpc.dhcp_enable, link.dhcp_enable, embedded.dhcp_enable),
        channel: firstDefined(grpc.channel, link.channel, embedded.channel),
        band: firstDefined(grpc.band, link.band, embedded.band) || '',
    };
}

function extractLinkClientPayload(link) {
    if (!link || typeof link !== 'object') return null;
    return link.client || link.Client
        || link.client_properties || link.clientProperties
        || null;
}

/**
 * For CLIENT / AP_CLIENT, merge list embed + GetClientProperties + GetWiFiLinkProperties.
 * RPCs often return empty SSID while ListWiFiInterfaces still has client_properties; never wipe that with {}.
 */
async function enrichWiFiInterfacesWithClientProps(interfaces) {
    if (!Array.isArray(interfaces)) return interfaces;
    await Promise.all(interfaces.map(async (iface) => {
        const mode = wifiNumericMode(iface);
        if (mode !== WiFiMode.CLIENT && mode !== WiFiMode.AP_CLIENT) return;

        const name = iface.interface_name || iface.interfaceName || iface.InterfaceName;
        if (!name) {
            iface.client_properties = clientPropsFromAPIResponse(getEmbeddedClientProps(iface) || {});
            return;
        }

        const embedded = getEmbeddedClientProps(iface);

        try {
            const [r1, r2] = await Promise.all([
                fetch(`/api/wifi/client/properties/${encodeURIComponent(name)}`),
                fetch(`/api/wifi/interface/${encodeURIComponent(name)}`),
            ]);

            let grpcRaw = null;
            if (r1.ok) {
                try {
                    grpcRaw = await r1.json();
                } catch (_) { /* ignore */ }
            } else {
                try {
                    await r1.text();
                } catch (_) { /* ignore */ }
            }

            let linkClientRaw = null;
            if (r2.ok) {
                try {
                    const link = await r2.json();
                    linkClientRaw = extractLinkClientPayload(link);
                } catch (_) { /* ignore */ }
            }

            iface.client_properties = mergeWifiClientPropsForCard(embedded, grpcRaw, linkClientRaw);
        } catch {
            iface.client_properties = clientPropsFromAPIResponse(embedded || {});
        }
    }));
    return interfaces;
}

/** Merge GET /api/wifi/ap/properties into iface for AP / AP_CLIENT when list response omits ap_properties. */
function normalizeApPropertiesFromAPI(p, existing) {
    const ex = existing && typeof existing === 'object' ? existing : {};
    if (!p || typeof p !== 'object') return ex;
    return {
        ...ex,
        ssid: p.ssid || p.Ssid || p.SSID || ex.ssid || ex.Ssid || ex.SSID || '',
        security: p.security ?? p.Security ?? ex.security,
        ipv4_address: p.ipv4_address ?? p.Ipv4Address ?? ex.ipv4_address ?? ex.Ipv4Address,
        channel: p.channel ?? p.Channel ?? ex.channel ?? ex.Channel,
        band: p.band ?? p.Band ?? ex.band ?? ex.Band,
        hidden: p.hidden ?? p.Hidden ?? ex.hidden ?? ex.Hidden,
        active: p.active ?? p.Active ?? ex.active ?? ex.Active,
        connected_clients: p.connected_clients ?? p.connectedClients ?? p.ConnectedClients ?? ex.connected_clients ?? ex.connectedClients ?? ex.ConnectedClients,
    };
}

async function enrichWiFiInterfacesWithApProps(interfaces) {
    if (!Array.isArray(interfaces)) return interfaces;
    await Promise.all(interfaces.map(async (iface) => {
        const mode = wifiNumericMode(iface);
        if (mode !== WiFiMode.AP && mode !== WiFiMode.AP_CLIENT) return;

        const name = iface.interface_name || iface.interfaceName || iface.InterfaceName;
        if (!name) return;

        const embedded = iface.ap_properties || iface.apProperties;
        const hasSsid = embedded && String(embedded.ssid || embedded.SSID || embedded.Ssid || '').trim();
        if (hasSsid) {
            iface.ap_properties = normalizeApPropertiesFromAPI(embedded, {});
            iface.apProperties = iface.ap_properties;
            return;
        }

        try {
            const resp = await fetch(`/api/wifi/ap/properties/${encodeURIComponent(name)}`);
            if (!resp.ok) return;
            const p = await resp.json();
            const merged = normalizeApPropertiesFromAPI(p, embedded || {});
            iface.ap_properties = merged;
            iface.apProperties = merged;
        } catch {
            /* ignore */
        }
    }));
    return interfaces;
}

function renderWiFiInterfaces(interfaces) {
    let html = '<div class="interfaces-grid">';
    for (const iface of interfaces) {
        const state = wifiNumericState(iface);
        const interfaceName = iface.interface_name || iface.interfaceName || iface.InterfaceName || 'Unknown';
        const macAddress = iface.mac_address || iface.macAddress || 'N/A';
        const mode = wifiNumericMode(iface);
        const isEnabled = mode !== WiFiMode.DISABLED && mode !== WiFiMode.UNKNOWN;
        const safeId = interfaceName.replace(/[^a-zA-Z0-9]/g, '_');

        // Store previous mode for re-enabling
        let prevMode = mode;
        if (mode === WiFiMode.DISABLED || mode === WiFiMode.UNKNOWN) {
            prevMode = WiFiMode.CLIENT; // Default to client when re-enabling
        }

        // Summarize info based on mode
        let modeDetail = '';
        const ap = iface.ap_properties || iface.apProperties || {};
        // Client / AP+client: client_properties from enrich (GetClientProperties, fallback GetWiFiLinkProperties.client).
        const cp = (mode === WiFiMode.CLIENT || mode === WiFiMode.AP_CLIENT)
            ? (iface.client_properties || {})
            : (getEmbeddedClientProps(iface) || {});

        if (mode === WiFiMode.AP || mode === WiFiMode.AP_CLIENT) {
            const apSsid = ap.ssid || ap.SSID || ap.Ssid || '';
            modeDetail += `<div class="info-item"><span class="info-label">SSID:</span><span class="info-value">${apSsid || 'N/A'}</span></div>`;
            const apSec = ap.security || ap.Security || '';
            modeDetail += `<div class="info-item"><span class="info-label">Security:</span><span class="info-value">${apSec || 'N/A'}</span></div>`;
            const apBand = ap.band || ap.Band || '';
            modeDetail += `<div class="info-item"><span class="info-label">Band:</span><span class="info-value">${apBand || 'N/A'}</span></div>`;
            const apIp = ap.ipv4_address || ap.ipv4Address || ap.Ipv4Address || '';
            const apIpLabel = mode === WiFiMode.AP_CLIENT ? 'AP IPv4 Address:' : 'IPv4 Address:';
            modeDetail += `<div class="info-item"><span class="info-label">${apIpLabel}</span><span class="info-value">${apIp || 'N/A'}</span></div>`;
            const cc = ap.connected_clients ?? ap.connectedClients ?? ap.ConnectedClients;
            if (cc !== undefined && cc !== null) {
                modeDetail += `<div class="info-item"><span class="info-label">AP clients:</span><span class="info-value">${cc}</span></div>`;
            }
        }
        if (mode === WiFiMode.CLIENT || mode === WiFiMode.AP_CLIENT) {
            const connectedSsid = cp.ssid || cp.SSID || cp.Ssid || '';
            modeDetail += `<div class="info-item"><span class="info-label">Connected to:</span><span class="info-value">${connectedSsid || 'N/A'}</span></div>`;
            const clSec = cp.security || cp.Security || '';
            const clBand = cp.band || cp.Band || '';
            const clientSecLabel = mode === WiFiMode.AP_CLIENT ? 'Client security:' : 'Security:';
            const clientBandLabel = mode === WiFiMode.AP_CLIENT ? 'Client band:' : 'Band:';
            modeDetail += `<div class="info-item"><span class="info-label">${clientSecLabel}</span><span class="info-value">${clSec || 'N/A'}</span></div>`;
            modeDetail += `<div class="info-item"><span class="info-label">${clientBandLabel}</span><span class="info-value">${clBand || 'N/A'}</span></div>`;
            const dhcpRaw = cp.dhcp_enable;
            if (dhcpRaw !== undefined && dhcpRaw !== null) {
                const isDhcp = dhcpRaw === true || dhcpRaw === 'true';
                modeDetail += `<div class="info-item"><span class="info-label">DHCP:</span><span class="info-value" style="color: ${isDhcp ? 'var(--success, #28a745)' : 'var(--warning, #ffc107)'}; font-weight: 600;">${isDhcp ? 'Enabled' : 'Disabled (Static)'}</span></div>`;
            }
            const ipv4 = cp.ipv4_address || cp.Ipv4Address || '';
            modeDetail += `<div class="info-item"><span class="info-label">IPv4 Address:</span><span class="info-value">${ipv4 || 'N/A'}</span></div>`;
            const ipv4Gw = cp.ipv4_gateway || cp.Ipv4Gateway || '';
            modeDetail += `<div class="info-item"><span class="info-label">IPv4 Gateway:</span><span class="info-value">${ipv4Gw || 'N/A'}</span></div>`;
            const dnsList = Array.isArray(cp.ipv4_dns) ? cp.ipv4_dns : normalizeIpv4DnsArray(cp.Ipv4Dns);
            const ipv4Dns = dnsList.length > 0 ? dnsList.join(', ') : 'N/A';
            modeDetail += `<div class="info-item"><span class="info-label">DNS Servers:</span><span class="info-value">${ipv4Dns}</span></div>`;
        }

        html += `
            <div class="interface-card">
                <div class="interface-header">
                    <h3>${interfaceName}</h3>
                    <div class="interface-header-actions">
                        <span class="state-badge" style="background-color: ${getWiFiStateColor(state)}; color: white;">
                            ${getWiFiStateName(state)}
                        </span>
                        <label class="toggle-switch" style="margin: 0;" title="${isEnabled ? 'Disable' : 'Enable'} WiFi">
                            <input type="checkbox" id="wifi-toggle-${safeId}" ${isEnabled ? 'checked' : ''} onchange="toggleWiFiInterface('${interfaceName}', this, ${prevMode})" data-prev-mode="${prevMode}">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="interface-details">
                    <div class="info-item">
                        <span class="info-label">Mode:</span>
                        <span class="info-value" style="font-weight: 600;">${getWiFiModeName(mode)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">MAC Address:</span>
                        <span class="info-value">${macAddress}</span>
                    </div>
                    ${modeDetail}
                </div>
                <div class="interface-actions">
                    <button class="btn btn-sm btn-primary" onclick="openWiFiManagement('${interfaceName}')">
                        <i class="fas fa-cog"></i> Configure
                    </button>
                </div>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

async function loadWiFiInfo() {
    const card = document.querySelector('.wifi-card');
    const elementId = 'wifi-info-detailed';
    if (!card) return;

    try {
        const response = await fetch('/api/wifi/interfaces');
        if (!response.ok) {
            if (response.status === 501 || response.status === 503) {
                card.style.display = 'none';
                return;
            }
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.error && typeof result.error === 'object' && Object.keys(result.error).length > 0) {
            const errorObj = result.error;
            if (errorObj.code !== undefined && errorObj.code !== 0) {
                throw new Error(errorObj.message || `Error code ${errorObj.code}`);
            }
        }

        let interfaces = result.interfaces || [];
        if (!Array.isArray(interfaces) || interfaces.length === 0) {
            card.style.display = 'none';
            return;
        }

        await enrichWiFiInterfacesWithClientProps(interfaces);
        await enrichWiFiInterfacesWithApProps(interfaces);

        card.style.display = 'block';
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = renderWiFiInterfaces(interfaces);
        }
    } catch (error) {
        console.error('Error loading /wifi/interfaces:', error);
        if (error.message && (
            error.message.includes('not implemented') ||
            error.message.includes('unavailable') ||
            error.message.includes('Unimplemented')
        )) {
            card.style.display = 'none';
            return;
        }
        card.style.display = 'block';
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div class="loading" style="color: var(--danger);">Error: ${error.message || 'Unknown error'}</div>`;
        }
    }
}

/** Atualiza a grelha Wi‑Fi e, se o modal desta interface estiver aberto, os campos AP/cliente. */
async function refreshWiFiInterfaceViews(interfaceName) {
    if (!interfaceName) return;
    try {
        await loadWiFiInfo();
        const modal = document.getElementById('wifi-config-modal');
        const open = modal && modal.style.display === 'block' && currentWiFiInterface === interfaceName;
        if (open) {
            await loadAPProperties(interfaceName);
            await loadClientProperties(interfaceName);
            await resyncWiFiModalOperationMode(interfaceName);
        }
    } catch (e) {
        console.warn('refreshWiFiInterfaceViews:', e);
    }
}

async function toggleWiFiInterface(interfaceName, el, prevMode) {
    const newMode = el.checked ? (prevMode || WiFiMode.CLIENT) : WiFiMode.DISABLED;
    let apPayload = null;

    try {
        if (el.checked && (newMode === WiFiMode.AP || newMode === WiFiMode.AP_CLIENT)) {
            apPayload = await ensureApConfigPayload(interfaceName, null);
            if (!apPayload || !String(apPayload.ssid).trim()) {
                el.checked = false;
                showNetworkNotification('For AP mode, use Configure to save the AP profile first.', 'error');
                return;
            }
            await postWiFiApConfig(interfaceName, apPayload);
            await waitForApModeAfterSetApConfig(interfaceName, { maxWaitMs: 18000, stepMs: 300 });
        }

        const maxToggleModeAttempts = (el.checked && (newMode === WiFiMode.AP || newMode === WiFiMode.AP_CLIENT)) ? 12 : 1;
        let result = null;
        let lastErrText = '';
        for (let attempt = 1; attempt <= maxToggleModeAttempts; attempt++) {
            if (attempt > 1) {
                await delayMs(Math.min(3000, 450 * (attempt - 1)));
            }
            const resp = await fetch(`/api/wifi/mode/${interfaceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: newMode }),
            });
            const errText = await resp.text();
            lastErrText = errText;
            if (!resp.ok) {
                throw new Error(errText || `HTTP ${resp.status}`);
            }
            try {
                result = errText.trim() ? JSON.parse(errText) : {};
            } catch {
                throw new Error('Invalid response from mode');
            }
            if (result.success !== false) {
                break;
            }
            const detail = result.error && result.error.message ? String(result.error.message) : 'Operation failed';
            const retryAp = (newMode === WiFiMode.AP || newMode === WiFiMode.AP_CLIENT) && /setapconfig/i.test(detail) && attempt < maxToggleModeAttempts;
            if (retryAp) {
                wifiApplyLog('toggle SetWiFiMode(AP) retry', { attempt, message: detail });
                continue;
            }
            throw new Error(detail);
        }

        if (el.checked && apPayload && apPayload.ssid && (newMode === WiFiMode.AP || newMode === WiFiMode.AP_CLIENT)) {
            wifiApplyLog('→ POST ap/start (after toggle)', { url: `/api/wifi/ap/start/${interfaceName}` });
            const apStartResp = await fetch(`/api/wifi/ap/start/${interfaceName}`, { method: 'POST' });
            const apStartText = await apStartResp.text();
            wifiApplyLog('← ap/start (toggle)', { httpStatus: apStartResp.status, body: apStartText || '(empty)' });
        }

        showNetworkNotification(`WiFi ${interfaceName} ${el.checked ? 'enabled (' + getWiFiModeName(newMode) + ')' : 'disabled'}`, 'success');
        void refreshWiFiInterfaceViews(interfaceName);
        setTimeout(() => void refreshWiFiInterfaceViews(interfaceName), 1500);
    } catch (error) {
        el.checked = !el.checked;
        showNetworkNotification(`Error: ${error.message}`, 'error');
        void refreshWiFiInterfaceViews(interfaceName);
    }
}

// ===== WiFi Management Panel =====

async function openWiFiManagement(interfaceName) {
    currentWiFiInterface = interfaceName;
    document.getElementById('wifi-mgmt-iface-name').textContent = interfaceName;

    // Show modal
    document.getElementById('wifi-config-modal').style.display = 'block';

    let mode = WiFiMode.CLIENT;
    try {
        const resp = await fetch(`/api/wifi/mode/${encodeURIComponent(interfaceName)}`);
        if (resp.ok) {
            const data = await resp.json();
            mode = normalizeWifiModeForSelect(data.mode);
        }
    } catch (e) {
        console.error('Error loading WiFi mode:', e);
    }

    const sel = document.getElementById('wifi-mode-select');
    if (sel) {
        sel.value = String(mode);
        updateWiFiSections(mode);
    }

    await loadAPProperties(interfaceName);
    await loadClientProperties(interfaceName);

    await resyncWiFiModalOperationMode(interfaceName);
}

function onWiFiModeChange() {
    const mode = parseInt(document.getElementById('wifi-mode-select').value);
    updateWiFiSections(mode);
}

function updateWiFiSections(mode) {
    const apSection = document.getElementById('wifi-ap-section');
    const clientSection = document.getElementById('wifi-client-section');

    const showAP = mode === WiFiMode.AP;
    const showClient = mode === WiFiMode.CLIENT;

    apSection.style.display = showAP ? 'block' : 'none';
    clientSection.style.display = showClient ? 'block' : 'none';
}

function redactWifiClientForLog(data) {
    if (!data) return data;
    return {
        ssid: data.ssid,
        security: data.security,
        dhcpEnable: data.dhcpEnable,
        ipv4Address: data.ipv4Address || '(empty)',
        ipv4Gateway: data.ipv4Gateway || '(empty)',
        ipv4Dns: data.ipv4Dns,
        password: data.password ? `(set, ${data.password.length} chars)` : '(empty)',
    };
}

function redactWifiApForLog(data) {
    if (!data) return data;
    return {
        ...data,
        password: data.password ? `(set, ${data.password.length} chars)` : '(empty)',
    };
}

function wifiApplyLog(phase, detail) {
    void phase;
    void detail;
}

function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SetAPConfig may return OK before SetWiFiMode(AP) is accepted. SSID in GetAPProperties often stays empty until the AP is up,
 * so we poll GetWiFiMode until AP / AP+Client or timeout.
 */
async function waitForApModeAfterSetApConfig(iface, options) {
    const maxWaitMs = (options && options.maxWaitMs) || 18000;
    const stepMs = (options && options.stepMs) || 300;
    const deadline = Date.now() + maxWaitMs;
    const modeUrl = `/api/wifi/mode/${iface}`;
    let n = 0;
    while (Date.now() < deadline) {
        n += 1;
        try {
            const r = await fetch(modeUrl);
            const text = await r.text();
            if (r.ok && text.trim()) {
                let d = null;
                try {
                    d = JSON.parse(text);
                } catch {
                    d = null;
                }
                const m = d != null ? Number(d.mode) : NaN;
                if (m === WiFiMode.AP || m === WiFiMode.AP_CLIENT) {
                    wifiApplyLog('GetWiFiMode shows AP after SetAPConfig', { mode: m, polls: n });
                    return;
                }
                if (n === 1 || n % 8 === 0) {
                    wifiApplyLog('poll GET mode after SetAPConfig', { attempt: n, mode: Number.isNaN(m) ? String(text).slice(0, 48) : m });
                }
            }
        } catch (e) {
            if (n === 1) {
                wifiApplyLog('poll GET mode after SetAPConfig error', { message: e && e.message ? e.message : String(e) });
            }
        }
        await delayMs(stepMs);
    }
    wifiApplyLog('poll GET mode after SetAPConfig timed out', { iface, maxWaitMs });
}

/** POST client WiFi profile; throws on HTTP or logical failure. */
async function postWiFiClientConfig(iface, clientData) {
    const url = `/api/wifi/client/config/${iface}`;
    const body = JSON.stringify(clientData);
    wifiApplyLog('→ POST client/config', { url, body: redactWifiClientForLog(clientData), rawJsonLength: body.length });

    const clientResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    const clientBody = await clientResp.text();
    wifiApplyLog('← client/config response', { httpStatus: clientResp.status, body: clientBody });

    if (!clientResp.ok) throw new Error('Failed to save client config: ' + clientBody);
    let clientResult;
    try {
        clientResult = JSON.parse(clientBody);
    } catch {
        throw new Error('Invalid response from client config');
    }
    if (clientResult.success === false) {
        const detail = clientResult.error && clientResult.error.message ? clientResult.error.message : 'success: false';
        throw new Error('Client config: ' + detail);
    }
}

/** POST connect after profile is saved. */
async function postWiFiConnect(iface) {
    const url = `/api/wifi/connect/${iface}`;
    wifiApplyLog('→ POST connect', { url, body: '(none)' });

    const connectResp = await fetch(url, { method: 'POST' });
    const connectBody = await connectResp.text();
    wifiApplyLog('← connect response', { httpStatus: connectResp.status, body: connectBody });

    if (!connectResp.ok) throw new Error('Connect failed: ' + connectBody);
    const trimmed = (connectBody || '').trim();
    if (!trimmed) {
        return;
    }
    let connectResult;
    try {
        connectResult = JSON.parse(trimmed);
    } catch {
        throw new Error('Invalid response from connect');
    }
    if (connectResult.success === false) {
        const detail = connectResult.error && connectResult.error.message ? connectResult.error.message : 'success: false';
        throw new Error('Connect: ' + detail);
    }
}

/**
 * If the form has no AP SSID, try GET ap/properties so SetAPConfig can run before SetWiFiMode(AP).
 * Covers: empty modal fields with profile already on device; quick card toggle before list refresh.
 */
async function ensureApConfigPayload(iface, formApData) {
    const form = formApData && typeof formApData === 'object' ? formApData : null;
    const formSsid = form && form.ssid && String(form.ssid).trim();
    if (formSsid) {
        return form;
    }
    try {
        const apPropsUrl = `/api/wifi/ap/properties/${encodeURIComponent(iface)}`;
        wifiApplyLog('→ GET ap/properties', { url: apPropsUrl });
        const pr = await fetch(apPropsUrl);
        const propsText = await pr.text();
        wifiApplyLog('← GET ap/properties response', { httpStatus: pr.status, body: propsText || '(empty)' });
        if (!pr.ok) return form;
        let p;
        try {
            p = propsText.trim() ? JSON.parse(propsText) : null;
        } catch {
            return form;
        }
        if (!p) return form;
        const ps = p.ssid && String(p.ssid).trim();
        if (!ps) return form;
        return {
            ssid: ps,
            password: (form && form.password) || '',
            security: (form && form.security) || p.security || 'wpa2',
            ipv4Address: (form && form.ipv4Address) || p.ipv4_address || p.ipv4Address || '',
            band: (form && form.band) || p.band || '2.4GHz',
            channel: (form && form.channel != null) ? form.channel : (p.channel != null ? p.channel : 6),
            hidden: form ? !!form.hidden : !!p.hidden,
        };
    } catch (e) {
        return form;
    }
}

/** POST AP profile (SetAPConfig); throws on HTTP or logical failure. system_server expects this before SetWiFiMode(AP). */
async function postWiFiApConfig(iface, apData) {
    const url = `/api/wifi/ap/config/${iface}`;
    const body = JSON.stringify(apData);
    wifiApplyLog('→ POST ap/config', { url, body: redactWifiApForLog(apData) });

    const apResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    const apBody = await apResp.text();
    wifiApplyLog('← ap/config response', { httpStatus: apResp.status, body: apBody });

    if (!apResp.ok) throw new Error('Failed to save AP config: ' + apBody);
    let apResult;
    try {
        apResult = JSON.parse(apBody);
    } catch {
        throw new Error('Invalid response from AP config');
    }
    if (apResult.success === false) {
        const detail = apResult.error && apResult.error.message ? apResult.error.message : 'success: false';
        throw new Error('AP config: ' + detail);
    }
}

/**
 * SetWiFiMode, ap/start, Connect — runs after profile is saved. Errors are only logged when called in background after client save.
 * @param {boolean} throwOnFailure - if false (background), mode/connect errors are logged, not thrown
 */
async function applyWiFiConfigTail(iface, mode, showClient, clientData, apPayload, throwOnFailure) {
    const modeUrl = `/api/wifi/mode/${iface}`;
    const modeBody = JSON.stringify({ mode: mode });

    let skipSetWiFiMode = false;
    try {
        wifiApplyLog('→ GET mode', { url: modeUrl });
        const curResp = await fetch(modeUrl);
        const curText = await curResp.text();
        wifiApplyLog('← GET mode response', { httpStatus: curResp.status, body: curText || '(empty)' });
        if (curResp.ok && curText.trim()) {
            let curData;
            try {
                curData = JSON.parse(curText);
            } catch {
                curData = null;
            }
            if (curData) {
                const currentMode = Number(curData.mode);
                if (wifiCurrentModeMatchesApplyTarget(currentMode, mode)) {
                    skipSetWiFiMode = true;
                    wifiApplyLog('skip POST mode', {
                        reason: 'already compatible with target mode',
                        currentMode,
                        targetMode: mode,
                        interface: iface,
                    });
                }
            }
        }
    } catch {
        /* fall through to POST mode */
    }

    if (!skipSetWiFiMode) {
        const maxModeAttempts = mode === WiFiMode.AP ? 12 : 1;
        for (let attempt = 1; attempt <= maxModeAttempts; attempt++) {
            if (attempt > 1) {
                await delayMs(Math.min(3000, 450 * (attempt - 1)));
            }
            wifiApplyLog('→ POST mode', {
                url: modeUrl,
                body: JSON.parse(modeBody),
                attempt,
                maxAttempts: maxModeAttempts,
            });

            const modeResp = await fetch(modeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: modeBody,
            });
            const modeText = await modeResp.text();
            wifiApplyLog('← mode response', { httpStatus: modeResp.status, body: modeText, attempt });

            if (!modeResp.ok) {
                const err = new Error('Failed to set mode: ' + modeText);
                if (throwOnFailure) throw err;
                console.warn(err.message);
                return;
            }
            let modeResult;
            try {
                modeResult = JSON.parse(modeText);
            } catch {
                const err = new Error('Invalid response from mode');
                if (throwOnFailure) throw err;
                console.warn(err.message);
                return;
            }
            if (modeResult.success !== false) {
                break;
            }
            const errMsg = modeResult.error && modeResult.error.message ? String(modeResult.error.message) : '';
            const retryApRace = mode === WiFiMode.AP && /setapconfig/i.test(errMsg) && attempt < maxModeAttempts;
            if (retryApRace) {
                wifiApplyLog('SetWiFiMode(AP) not ready yet; retry', { message: errMsg, nextAttempt: attempt + 1 });
                continue;
            }
            const detail = errMsg ? ': ' + errMsg : '';
            const err = new Error('Failed to set WiFi mode' + detail);
            if (throwOnFailure) throw err;
            console.warn(err.message);
            return;
        }
    }

    if (apPayload && apPayload.ssid && String(apPayload.ssid).trim()) {
        wifiApplyLog('→ POST ap/start', { url: `/api/wifi/ap/start/${iface}` });
        const apStartResp = await fetch(`/api/wifi/ap/start/${iface}`, { method: 'POST' });
        const apStartText = await apStartResp.text();
        wifiApplyLog('← ap/start response', { httpStatus: apStartResp.status, body: apStartText || '(empty)' });
    }

    if (showClient && clientData && clientData.ssid) {
        try {
            await postWiFiConnect(iface);
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            console.warn('WiFi connect after saved profile:', msg);
        }
    }
}

// Unified Apply: sets mode + saves AP config + saves client config in one click
async function applyWiFiConfig() {
    if (!currentWiFiInterface) return;
    if (wifiApplyInProgress) return;
    wifiApplyInProgress = true;

    const mode = parseInt(document.getElementById('wifi-mode-select').value);
    const btn = document.getElementById('wifi-apply-btn');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
    showWiFiApplyMessage('Applying configuration...', 'info');

    const showClient = mode === WiFiMode.CLIENT;
    let clientData = null;
    if (showClient) {
        const dhcp = document.getElementById('wifi-client-dhcp').checked;
        clientData = {
            ssid: document.getElementById('wifi-client-ssid').value.trim(),
            password: document.getElementById('wifi-client-password').value,
            security: document.getElementById('wifi-client-security').value,
            dhcpEnable: dhcp,
            ipv4Address: dhcp ? '' : document.getElementById('wifi-client-ip').value.trim(),
            ipv4Gateway: dhcp ? '' : document.getElementById('wifi-client-gateway').value.trim(),
            ipv4Dns: dhcp ? [] : document.getElementById('wifi-client-dns').value.split(',').map(s => s.trim()).filter(s => s),
        };
    }

    let apData = null;
    if (mode === WiFiMode.AP) {
        apData = {
            ssid: document.getElementById('wifi-ap-ssid').value.trim(),
            password: document.getElementById('wifi-ap-password').value,
            security: document.getElementById('wifi-ap-security').value,
            ipv4Address: document.getElementById('wifi-ap-ip').value.trim(),
            band: document.getElementById('wifi-ap-band').value,
            channel: parseInt(document.getElementById('wifi-ap-channel').value, 10) || 6,
            hidden: document.getElementById('wifi-ap-hidden').checked,
        };
    }

    try {
        wifiApplyLog('start sequence', {
            interface: currentWiFiInterface,
            targetMode: mode,
            targetModeName: getWiFiModeName(mode),
            note: 'Order: SetClientConfig (if SSID) → SetAPConfig (if AP + SSID) → SetWiFiMode → ap/start (if AP) → Connect (if client SSID).',
            clientSkippedNoSsid: showClient && (!clientData || !clientData.ssid),
        });

        // Save client profile BEFORE SetWiFiMode so the runtime does not drop it when switching mode
        // (Connect requires a persisted profile; some servers clear client config on mode change).
        if (showClient && clientData && clientData.ssid) {
            await postWiFiClientConfig(currentWiFiInterface, clientData);
            // Profile persisted with success — show success and close immediately; mode/connect continue in background.
            showWiFiApplyMessage('Configuration applied successfully!', 'success');
            void refreshWiFiInterfaceViews(currentWiFiInterface);
            setTimeout(() => void refreshWiFiInterfaceViews(currentWiFiInterface), 1500);
            setTimeout(() => closeModal('wifi-config-modal'), 2500);
            void applyWiFiConfigTail(currentWiFiInterface, mode, showClient, clientData, null, false)
                .catch((e) => {
                    console.warn('WiFi mode/connect after profile save:', e);
                })
                .finally(() => {
                    void refreshWiFiInterfaceViews(currentWiFiInterface);
                });
            return;
        }
        if (showClient) {
            wifiApplyLog('skip SetClientConfig', { reason: 'no SSID in form — Connect will also be skipped' });
        }

        // system_server: "to start AP mode call SetAPConfig" — AP profile must exist before SetWiFiMode(AP).
        let apPayload = null;
        if (mode === WiFiMode.AP) {
            apPayload = await ensureApConfigPayload(currentWiFiInterface, apData);
            if (apPayload && apPayload.ssid && String(apPayload.ssid).trim()) {
                await postWiFiApConfig(currentWiFiInterface, apPayload);
                await waitForApModeAfterSetApConfig(currentWiFiInterface, { maxWaitMs: 18000, stepMs: 300 });
            } else {
                wifiApplyLog('skip SetAPConfig', { reason: 'no AP SSID in form or GetAPProperties — SetWiFiMode(AP) may fail' });
            }
        }

        await applyWiFiConfigTail(currentWiFiInterface, mode, showClient, clientData, apPayload, true);

        showWiFiApplyMessage('Configuration applied successfully!', 'success');
        void refreshWiFiInterfaceViews(currentWiFiInterface);
        setTimeout(() => void refreshWiFiInterfaceViews(currentWiFiInterface), 1500);

        setTimeout(() => closeModal('wifi-config-modal'), 2500);

    } catch (error) {
        showWiFiApplyMessage(formatWiFiApplyError(error), 'error');
        void refreshWiFiInterfaceViews(currentWiFiInterface);
    } finally {
        wifiApplyInProgress = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Apply';
    }
}

/** Extra context when system_server returns generic nmcli/hotspot failures (log is from WiFiService, not the HTTP server). */
function wifiApHotspotFailureHint(serverText) {
    const s = String(serverText || '');
    if (/802\.?1X/i.test(s)) {
        return '\n\n[Note] NetworkManager is using 802.1X on the hotspot profile — often a corrupt or client-inherited NM profile. On device: nmcli -f all connection show "wlan0-hotspot", remove 802-1x or delete and recreate the hotspot with WPA-PSK only. journalctl -u NetworkManager -b.';
    }
    if (/exit code 4/i.test(s) || (/starting hotspot/i.test(s) && /wlan0|SetAPConfig|hotspot/i.test(s))) {
        return '\n\n[Note] This comes from system_server (WiFiService → nmcli), not the web server. exit code 4 = failed to activate the hotspot connection in NetworkManager. See: journalctl -u NetworkManager; duplicate profiles (nmcli connection show); wlan0 stuck in "connecting".';
    }
    return '';
}

function formatWiFiApplyError(err) {
    const base = err && err.message ? err.message : String(err);
    return `Error: ${base}${wifiApHotspotFailureHint(base)}`;
}

function showWiFiApplyMessage(text, type) {
    const el = document.getElementById('wifi-apply-message');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--primary, #6366f1)' };
    el.style.backgroundColor = colors[type] || colors.info;
    el.style.color = 'white';
    if (type !== 'info') {
        const ms = type === 'error' && text.length > 200 ? 20000 : 5000;
        setTimeout(() => { el.style.display = 'none'; }, ms);
    }
}

// ===== AP Section =====

async function loadAPProperties(interfaceName) {
    try {
        const resp = await fetch(`/api/wifi/ap/properties/${interfaceName}`);
        if (!resp.ok) return;
        const props = await resp.json();
        if (!props) return;

        // Fill form
        if (props.ssid) document.getElementById('wifi-ap-ssid').value = props.ssid;
        if (props.security) document.getElementById('wifi-ap-security').value = props.security;
        if (props.ipv4_address) document.getElementById('wifi-ap-ip').value = props.ipv4_address;
        if (props.band) document.getElementById('wifi-ap-band').value = props.band;
        if (props.channel) document.getElementById('wifi-ap-channel').value = props.channel;
        document.getElementById('wifi-ap-hidden').checked = props.hidden || false;
    } catch {
        /* ignore */
    }
}

// AP and Client individual save/start/stop removed - handled by unified applyWiFiConfig()

// ===== Client Section =====

function wifiModalShowsClientSection() {
    const modeEl = document.getElementById('wifi-mode-select');
    const m = modeEl ? parseInt(modeEl.value, 10) : NaN;
    return m === WiFiMode.CLIENT;
}

async function loadClientProperties(interfaceName) {
    try {
        const resp = await fetch(`/api/wifi/client/properties/${interfaceName}`);
        if (!resp.ok) {
            return;
        }
        const props = await resp.json();
        if (!props) return;

        // Fill form
        if (props.ssid) document.getElementById('wifi-client-ssid').value = props.ssid;
        if (props.security) document.getElementById('wifi-client-security').value = props.security;
        document.getElementById('wifi-client-dhcp').checked = props.dhcp_enable !== false;
        toggleWiFiClientStatic();

        if (props.ipv4_address) document.getElementById('wifi-client-ip').value = props.ipv4_address;
        if (props.ipv4_gateway) document.getElementById('wifi-client-gateway').value = props.ipv4_gateway;
        if (props.ipv4_dns && props.ipv4_dns.length > 0) {
            document.getElementById('wifi-client-dns').value = props.ipv4_dns.filter(d => d).join(', ');
        }
    } catch {
        /* ignore */
    }
}

function toggleWiFiClientStatic() {
    const dhcp = document.getElementById('wifi-client-dhcp').checked;
    const staticEl = document.getElementById('wifi-client-static-config');
    if (staticEl) staticEl.style.display = dhcp ? 'none' : 'block';
}

async function scanAndShowNetworks() {
    if (!currentWiFiInterface) return;
    const btn = document.getElementById('wifi-scan-btn');
    const resultsEl = document.getElementById('wifi-scan-results');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';

    try {
        const resp = await fetch(`/api/wifi/scan/${currentWiFiInterface}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const result = await resp.json();
        const networks = result.networks || [];

        if (networks.length === 0) {
            resultsEl.innerHTML = '<div style="color: var(--text-muted); padding: 8px;">No networks found</div>';
            resultsEl.style.display = 'block';
            return;
        }

        // Sort by signal strength (higher = better, less negative)
        networks.sort((a, b) => (b.signal_strength || -100) - (a.signal_strength || -100));

        let html = '<div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color, #334155); border-radius: 8px;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">';
        html += '<thead><tr style="background: var(--card-header-bg, #1e293b); position: sticky; top: 0;">';
        html += '<th style="padding: 8px 12px; text-align: left;">SSID</th>';
        html += '<th style="padding: 8px 12px; text-align: center;">Signal</th>';
        html += '<th style="padding: 8px 12px; text-align: center;">Channel</th>';
        html += '<th style="padding: 8px 12px; text-align: center;">Security</th>';
        html += '<th style="padding: 8px 12px; text-align: center;">Band</th>';
        html += '<th style="padding: 8px 12px;"></th>';
        html += '</tr></thead><tbody>';

        for (const net of networks) {
            const ssid = net.ssid || (net.hidden ? '<i>Hidden</i>' : 'Unknown');
            const sig = net.signal_strength || 0;
            const sigColor = sig > -50 ? 'var(--success)' : sig > -70 ? 'var(--warning)' : 'var(--danger)';
            const sigBars = sig > -50 ? '▂▄▆█' : sig > -60 ? '▂▄▆' : sig > -70 ? '▂▄' : '▂';

            html += `<tr style="border-bottom: 1px solid var(--border-color, #334155);">`;
            html += `<td style="padding: 6px 12px; font-weight: 500;">${ssid}</td>`;
            html += `<td style="padding: 6px 12px; text-align: center;"><span style="color: ${sigColor};" title="${sig} dBm">${sigBars}</span> <small>${sig}</small></td>`;
            html += `<td style="padding: 6px 12px; text-align: center;">${net.channel || '-'}</td>`;
            html += `<td style="padding: 6px 12px; text-align: center;">${net.security || 'Open'}</td>`;
            html += `<td style="padding: 6px 12px; text-align: center;">${net.band || '-'}</td>`;
            html += `<td style="padding: 6px 12px; text-align: center;"><button class="btn btn-sm btn-success" onclick="selectScannedNetwork('${(net.ssid || '').replace(/'/g, "\\'")}', '${net.security || 'wpa2'}')" style="padding: 2px 8px; font-size: 0.75rem;"><i class="fas fa-plug"></i></button></td>`;
            html += `</tr>`;
        }

        html += '</tbody></table></div>';
        resultsEl.innerHTML = html;
        resultsEl.style.display = 'block';
    } catch (error) {
        resultsEl.innerHTML = `<div style="color: var(--danger); padding: 8px;">Scan error: ${error.message}</div>`;
        resultsEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> Scan Networks';
    }
}

function selectScannedNetwork(ssid, security) {
    document.getElementById('wifi-client-ssid').value = ssid;
    // Map security string to select value
    const secLower = (security || '').toLowerCase();
    if (secLower.includes('wpa3') && secLower.includes('wpa2')) {
        document.getElementById('wifi-client-security').value = 'wpa2-wpa3';
    } else if (secLower.includes('wpa3')) {
        document.getElementById('wifi-client-security').value = 'wpa3';
    } else if (secLower.includes('wpa') || secLower.includes('psk')) {
        document.getElementById('wifi-client-security').value = 'wpa2';
    } else {
        document.getElementById('wifi-client-security').value = 'none';
    }
    // Focus on password field
    document.getElementById('wifi-client-password').focus();
    // Scroll to form
    document.getElementById('wifi-client-config-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Client individual save/connect/disconnect removed - handled by unified applyWiFiConfig()

// =============================================
// ===== CELLULAR =====
// =============================================

// Store cellular interface data for details modal
let cellularInterfacesData = [];

function renderCellularInterfaces(interfaces) {
    cellularInterfacesData = interfaces;
    let html = '<div class="interfaces-grid">';
    for (const iface of interfaces) {
        const interfaceName = iface.interface_name || 'Unknown';
        const ipv4Address = iface.ipv4_address || '';
        const macAddress = iface.mac_address || 'N/A';
        const isConnected = ipv4Address && ipv4Address.trim() !== '';
        const modem = iface.modem_generic;
        const threeGpp = iface.three_gpp;

        // Show basic modem info if available
        let modemInfoHtml = '';
        if (modem) {
            if (modem.manufacturer || modem.model) {
                modemInfoHtml += `
                    <div class="info-item">
                        <span class="info-label">Modem:</span>
                        <span class="info-value">${[modem.manufacturer, modem.model].filter(Boolean).join(' ')}</span>
                    </div>`;
            }
            if (modem.signal_quality !== undefined) {
                const sq = modem.signal_quality;
                const sqColor = sq > 50 ? 'var(--success, #28a745)' : sq > 20 ? 'var(--warning, #ffc107)' : 'var(--danger, #dc3545)';
                modemInfoHtml += `
                    <div class="info-item">
                        <span class="info-label">Signal:</span>
                        <span class="info-value" style="color: ${sqColor}; font-weight: 600;">${sq}%</span>
                    </div>`;
            }
            if (modem.power_state) {
                modemInfoHtml += `
                    <div class="info-item">
                        <span class="info-label">Power:</span>
                        <span class="info-value">${modem.power_state}</span>
                    </div>`;
            }
        }

        // Show operator if available
        let operatorHtml = '';
        if (threeGpp && threeGpp.operator_name) {
            operatorHtml = `
                <div class="info-item">
                    <span class="info-label">Operator:</span>
                    <span class="info-value">${threeGpp.operator_name}</span>
                </div>`;
        }

        const cellSafeId = interfaceName.replace(/[^a-zA-Z0-9]/g, '_');

        html += `
            <div class="interface-card">
                <div class="interface-header">
                    <h3>${interfaceName}</h3>
                    <div class="interface-header-actions">
                        ${getStatusBadge(isConnected)}
                        <label class="toggle-switch" style="margin: 0;" title="${isConnected ? 'Disconnect' : 'Connect'}">
                            <input type="checkbox" id="cell-toggle-${cellSafeId}" ${isConnected ? 'checked' : ''} onchange="toggleCellularInterface('${interfaceName}', this)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="interface-details">
                    <div class="info-item">
                        <span class="info-label">MAC Address:</span>
                        <span class="info-value">${macAddress}</span>
                    </div>
                    ${operatorHtml}
                    ${modemInfoHtml}
                    <div class="info-item">
                        <span class="info-label">IPv4 Address:</span>
                        <span class="info-value">${ipv4Address || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">IPv4 Gateway:</span>
                        <span class="info-value">${iface.ipv4_gateway || 'N/A'}</span>
                    </div>
                </div>
                <div class="interface-actions">
                    <button class="btn btn-sm btn-primary" onclick="openCellularConfig('${interfaceName}')">
                        <i class="fas fa-cog"></i> Configure
                    </button>
                    <button class="btn btn-sm btn-info" onclick="showCellularDetails('${interfaceName}')" style="background: var(--info, #17a2b8); border-color: var(--info, #17a2b8);">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                </div>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

async function loadCellularInfo() {
    await loadInterfacesFromProto('/cellular/interfaces', '.cellular-card', 'cellular-info-detailed', renderCellularInterfaces);
}

// Open Cellular config modal
async function openCellularConfig(interfaceName) {
    document.getElementById('cell-config-iface-name').textContent = interfaceName;
    document.getElementById('cellular-config-form').dataset.interface = interfaceName;

    const msgEl = document.getElementById('cell-config-message');
    if (msgEl) msgEl.style.display = 'none';

    // Pre-fill from interface data
    const iface = cellularInterfacesData.find(i => i.interface_name === interfaceName);
    if (iface) {
        const isDhcp = !iface.ipv4_address || iface.ipv4_address.trim() === '';
        document.getElementById('cell-dhcp').checked = isDhcp;
        document.getElementById('cell-ipv4-address').value = iface.ipv4_address || '';
        document.getElementById('cell-ipv4-gateway').value = iface.ipv4_gateway || '';
        document.getElementById('cell-ipv4-dns').value = Array.isArray(iface.ipv4_dns) ? iface.ipv4_dns.join(', ') : '';
    } else {
        document.getElementById('cell-dhcp').checked = true;
        document.getElementById('cell-ipv4-address').value = '';
        document.getElementById('cell-ipv4-gateway').value = '';
        document.getElementById('cell-ipv4-dns').value = '';
    }
    toggleCellStaticConfig();
    document.getElementById('cellular-config-modal').style.display = 'block';
}

function toggleCellStaticConfig() {
    const dhcpChecked = document.getElementById('cell-dhcp').checked;
    const staticConfig = document.getElementById('cell-static-config');
    if (staticConfig) {
        staticConfig.style.display = dhcpChecked ? 'none' : 'block';
    }
}

function showCellConfigMessage(text, type) {
    const msgEl = document.getElementById('cell-config-message');
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    msgEl.style.backgroundColor = type === 'success' ? 'var(--success)' : 'var(--danger)';
    msgEl.style.color = 'white';
}

async function saveCellularConfig(e) {
    e.preventDefault();
    const form = document.getElementById('cellular-config-form');
    const interfaceName = form.dataset.interface;
    if (!interfaceName) return;

    const saveBtn = document.getElementById('cell-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    const dhcpEnable = document.getElementById('cell-dhcp').checked;
    const ipv4Address = document.getElementById('cell-ipv4-address').value.trim();
    const ipv4Gateway = document.getElementById('cell-ipv4-gateway').value.trim();
    const ipv4DnsStr = document.getElementById('cell-ipv4-dns').value.trim();
    const ipv4Dns = ipv4DnsStr ? ipv4DnsStr.split(',').map(s => s.trim()).filter(s => s) : [];

    try {
        const response = await fetch(`/api/cellular/config/${interfaceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dhcpEnable: dhcpEnable,
                ipv4Address: ipv4Address,
                ipv4Gateway: ipv4Gateway,
                ipv4Dns: ipv4Dns,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || `HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.success || result.value) {
            showCellConfigMessage(`Configuration saved for ${interfaceName}`, 'success');
            setTimeout(() => {
                closeModal('cellular-config-modal');
                loadCellularInfo();
            }, 1000);
        } else {
            showCellConfigMessage('Failed to save configuration', 'error');
        }
    } catch (error) {
        console.error('Error saving Cellular config:', error);
        showCellConfigMessage(`Error: ${error.message}`, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        }
    }
}

// Show cellular details modal
function showCellularDetails(interfaceName) {
    document.getElementById('cell-details-iface-name').textContent = interfaceName;
    const body = document.getElementById('cell-details-body');

    const iface = cellularInterfacesData.find(i => i.interface_name === interfaceName);
    if (!iface) {
        body.innerHTML = '<div class="loading" style="color: var(--danger);">Interface data not found</div>';
        document.getElementById('cellular-details-modal').style.display = 'block';
        return;
    }

    let html = '';

    // Network Info
    html += '<div class="info-section"><h3 class="info-section-title"><i class="fas fa-network-wired"></i> Network</h3>';
    html += detailItem('Interface', iface.interface_name);
    html += detailItem('MAC Address', iface.mac_address);
    html += detailItem('MTU', iface.mtu);
    html += detailItem('IPv4 Address', iface.ipv4_address);
    html += detailItem('IPv4 Gateway', iface.ipv4_gateway);
    if (iface.ipv4_dns && iface.ipv4_dns.length > 0) {
        html += detailItem('DNS Servers', iface.ipv4_dns.join(', '));
    }
    html += '</div>';

    // 3GPP Info
    if (iface.three_gpp) {
        const gpp = iface.three_gpp;
        html += '<div class="info-section"><h3 class="info-section-title"><i class="fas fa-broadcast-tower"></i> 3GPP</h3>';
        html += detailItem('IMEI', gpp.imei);
        html += detailItem('Operator', gpp.operator_name);
        html += detailItem('Operator Code', gpp.operator_code);
        html += detailItem('Packet Service', gpp.packet_service_state);
        html += detailItem('Registration', gpp.registration_state);
        html += '</div>';
    }

    // Modem Info
    if (iface.modem_generic) {
        const m = iface.modem_generic;
        html += '<div class="info-section"><h3 class="info-section-title"><i class="fas fa-microchip"></i> Modem</h3>';
        html += detailItem('Manufacturer', m.manufacturer);
        html += detailItem('Model', m.model);
        html += detailItem('Revision', m.revision);
        html += detailItem('Hardware Revision', m.hardware_revision);
        if (m.access_technologies && m.access_technologies.length > 0) {
            html += detailItem('Technologies', m.access_technologies.join(', '));
        }
        html += detailItem('Primary Port', m.primary_port);
        html += detailItem('Power State', m.power_state);
        html += detailItem('Signal Quality', m.signal_quality !== undefined ? m.signal_quality + '%' : null);
        html += detailItem('RSSI', m.rssi !== undefined ? m.rssi + ' dBm' : null);
        html += detailItem('BER', m.ber);
        html += '</div>';
    }

    // SIM Card Info
    const simInfo = iface.sim_info || iface.simInfo;
    if (simInfo) {
        html += '<div class="info-section"><h3 class="info-section-title"><i class="fas fa-sim-card"></i> SIM Card</h3>';
        html += detailItem('Active', simInfo.active ? 'Yes' : 'No');
        html += detailItem('ICCID', simInfo.iccid);
        html += detailItem('IMSI', simInfo.imsi);
        html += detailItem('Operator', simInfo.operator_name);
        html += detailItem('Operator Code', simInfo.operator_code);
        if (simInfo.emergency_numbers && simInfo.emergency_numbers.length > 0) {
            html += detailItem('Emergency Numbers', simInfo.emergency_numbers.join(', '));
        }
        html += detailItem('EID', simInfo.eid);
        html += detailItem('SIM Type', simInfo.sim_type);
        if (typeof simInfo.pin_required === 'boolean') {
            html += detailItem('PIN Required', simInfo.pin_required ? 'Yes' : 'No');
        }
        html += '</div>';
    }

    if (!html.trim()) {
        html = '<div class="loading" style="color: var(--text-muted);">No detailed information available</div>';
    }

    body.innerHTML = html;
    document.getElementById('cellular-details-modal').style.display = 'block';
}

function detailItem(label, value) {
    if (value === undefined || value === null || value === '' || value === 'N/A') return '';
    return `<div class="info-item"><span class="info-label">${label}:</span><span class="info-value">${value}</span></div>`;
}

async function toggleCellularInterface(interfaceName, el) {
    const action = el.checked ? 'connect' : 'disconnect';

    try {
        const resp = await fetch(`/api/cellular/${action}/${interfaceName}`, { method: 'POST' });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(errText || `HTTP ${resp.status}`);
        }
        const result = await resp.json();
        if (result.success || result.value) {
            showNetworkNotification(`Cellular ${interfaceName} ${el.checked ? 'connected' : 'disconnected'}`, 'success');
            setTimeout(() => loadCellularInfo(), 1500);
        } else {
            throw new Error('Operation failed');
        }
    } catch (error) {
        el.checked = !el.checked;
        showNetworkNotification(`Error: ${error.message}`, 'error');
    }
}

async function connectCellular(interfaceName) {
    try {
        const response = await fetch(`/api/cellular/connect/${interfaceName}`, { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result.success || result.value) {
            showNotification('Cellular connection started', 'success');
            setTimeout(() => loadCellularInfo(), 1000);
        } else {
            showNotification('Failed to connect cellular interface', 'error');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

async function disconnectCellular(interfaceName) {
    try {
        const response = await fetch(`/api/cellular/disconnect/${interfaceName}`, { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result.success || result.value) {
            showNotification('Cellular disconnected', 'success');
            setTimeout(() => loadCellularInfo(), 1000);
        } else {
            showNotification('Failed to disconnect cellular interface', 'error');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// =============================================
// ===== FORM EVENT LISTENERS =====
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    // Ethernet config form
    const ethForm = document.getElementById('ethernet-config-form');
    if (ethForm) {
        ethForm.addEventListener('submit', saveEthernetConfig);
    }

    // Ethernet DHCP toggle
    const ethDhcpCheckbox = document.getElementById('eth-dhcp');
    if (ethDhcpCheckbox) {
        ethDhcpCheckbox.addEventListener('change', toggleEthStaticConfig);
    }

    // Cellular config form
    const cellForm = document.getElementById('cellular-config-form');
    if (cellForm) {
        cellForm.addEventListener('submit', saveCellularConfig);
    }

    // Cellular DHCP toggle
    const cellDhcpCheckbox = document.getElementById('cell-dhcp');
    if (cellDhcpCheckbox) {
        cellDhcpCheckbox.addEventListener('change', toggleCellStaticConfig);
    }
});

// =============================================
// ===== NOTIFICATIONS =====
// =============================================

// showNetworkNotification is now provided globally by core.js

// =============================================
// ===== REFRESH & INIT =====
// =============================================

function refreshCurrentPage() {
    loadEthernetInfo();
    loadWiFiInfo();
    loadCellularInfo();
}

let networkPageRefreshIntervalId = null;

// Each function is completely independent - errors in one don't affect others
document.addEventListener('DOMContentLoaded', () => {
    loadEthernetInfo();
    loadWiFiInfo();
    loadCellularInfo();
    if (networkPageRefreshIntervalId != null) {
        clearInterval(networkPageRefreshIntervalId);
    }
    networkPageRefreshIntervalId = setInterval(() => {
        if (document.hidden) return;
        refreshCurrentPage();
    }, 5000);
});

window.addEventListener('beforeunload', () => {
    if (networkPageRefreshIntervalId != null) {
        clearInterval(networkPageRefreshIntervalId);
        networkPageRefreshIntervalId = null;
    }
});
