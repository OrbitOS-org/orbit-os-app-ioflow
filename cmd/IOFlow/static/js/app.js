const API_BASE = '/api';

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
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
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
    return new Date(timestamp * 1000).toLocaleString('pt-PT');
}

function getStatusBadge(connected) {
    if (connected === true || connected === 'true' || connected === 1) {
        return '<span class="status-badge status-connected">Connected</span>';
    } else if (connected === false || connected === 'false' || connected === 0) {
        return '<span class="status-badge status-disconnected">Disconnected</span>';
    }
    return '<span class="status-badge status-unknown">Unknown</span>';
}

// System Info
async function loadSystemInfo() {
    try {
        const info = await apiCall('/system/info');
        const html = `
            <div class="info-item">
                <span class="info-label">Serial Number:</span>
                <span class="info-value">${info.serialNumber || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Model:</span>
                <span class="info-value">${info.hardwareModel || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Revision:</span>
                <span class="info-value">${info.hardwareRevision || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">OS Version:</span>
                <span class="info-value">${info.osVersion || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Firmware Version:</span>
                <span class="info-value">${info.firmwareVersion || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Uptime:</span>
                <span class="info-value">${formatUptime(info.uptime || 0)}</span>
            </div>
        `;
        document.getElementById('system-info').innerHTML = html;
    } catch (error) {
        document.getElementById('system-info').innerHTML = 
            `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
    }
}

// WiFi
async function loadWiFiInfo() {
    try {
        const interfaces = await apiCall('/wifi/interfaces');
        if (interfaces.length === 0) {
            document.getElementById('wifi-info').innerHTML = 
                '<div class="loading">No WiFi interfaces found</div>';
            return;
        }

        let html = '<div class="interface-list">';
        for (const iface of interfaces) {
            const isConnected = await checkWiFiConnected(iface.interfaceName);
            html += `
                <div class="interface-item">
                    <div class="interface-header">
                        <span class="interface-name">${iface.interfaceName}</span>
                        ${getStatusBadge(isConnected)}
                    </div>
                    <div class="info-item">
                        <span class="info-label">MAC:</span>
                        <span class="info-value">${iface.macAddress || 'N/A'}</span>
                    </div>
                    <div class="interface-actions">
                        <button class="btn btn-sm btn-primary" onclick="scanWiFi('${iface.interfaceName}')">
                            <i class="fas fa-search"></i> Scan
                        </button>
                        <button class="btn btn-sm btn-success" onclick="openWiFiConfig('${iface.interfaceName}')">
                            <i class="fas fa-cog"></i> Configure
                        </button>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        document.getElementById('wifi-info').innerHTML = html;
    } catch (error) {
        document.getElementById('wifi-info').innerHTML = 
            `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
    }
}

async function checkWiFiConnected(interfaceName) {
    try {
        const props = await apiCall(`/wifi/interface/${interfaceName}`);
        return props && props.state === 2; // Assuming 2 is connected state
    } catch {
        return false;
    }
}

async function scanWiFi(interfaceName) {
    try {
        const networks = await apiCall(`/wifi/scan/${interfaceName}`);
        alert(`Found ${networks.length} WiFi networks`);
    } catch (error) {
        alert(`Error scanning: ${error.message}`);
    }
}

function openWiFiConfig(interfaceName) {
    document.getElementById('wifi-modal').style.display = 'block';
    document.getElementById('wifi-config-form').dataset.interface = interfaceName;
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Ethernet
async function loadEthernetInfo() {
    try {
        const interfaces = await apiCall('/ethernet/interfaces');
        if (interfaces.length === 0) {
            document.getElementById('ethernet-info').innerHTML = 
                '<div class="loading">No Ethernet interfaces found</div>';
            return;
        }

        let html = '<div class="interface-list">';
        for (const iface of interfaces) {
            const isConnected = await checkEthernetConnected(iface.interfaceName);
            html += `
                <div class="interface-item">
                    <div class="interface-header">
                        <span class="interface-name">${iface.interfaceName}</span>
                        ${getStatusBadge(isConnected)}
                    </div>
                    <div class="info-item">
                        <span class="info-label">MAC:</span>
                        <span class="info-value">${iface.macAddress || 'N/A'}</span>
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="loadEthernetDetails('${iface.interfaceName}')">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                </div>
            `;
        }
        html += '</div>';
        document.getElementById('ethernet-info').innerHTML = html;
    } catch (error) {
        document.getElementById('ethernet-info').innerHTML = 
            `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
    }
}

async function checkEthernetConnected(interfaceName) {
    try {
        const props = await apiCall(`/ethernet/interface/${interfaceName}`);
        return props && props.state === 2;
    } catch {
        return false;
    }
}

async function loadEthernetDetails(interfaceName) {
    try {
        const props = await apiCall(`/ethernet/interface/${interfaceName}`);
        alert(`IP: ${props.ipv4Address || 'N/A'}\nGateway: ${props.ipv4Gateway || 'N/A'}`);
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Cellular
async function loadCellularInfo() {
    try {
        const interfaces = await apiCall('/cellular/interfaces');
        if (interfaces.length === 0) {
            document.getElementById('cellular-info').innerHTML = 
                '<div class="loading">No Cellular interfaces found</div>';
            return;
        }

        let html = '<div class="interface-list">';
        for (const iface of interfaces) {
            const isConnected = await checkCellularConnected(iface.interfaceName);
            html += `
                <div class="interface-item">
                    <div class="interface-header">
                        <span class="interface-name">${iface.interfaceName}</span>
                        ${getStatusBadge(isConnected)}
                    </div>
                    <div class="info-item">
                        <span class="info-label">IP:</span>
                        <span class="info-value">${iface.ipv4Address || 'N/A'}</span>
                    </div>
                    <div class="interface-actions">
                        <button class="btn btn-sm btn-success" onclick="connectCellular('${iface.interfaceName}')">
                            <i class="fas fa-plug"></i> Connect
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="disconnectCellular('${iface.interfaceName}')">
                            <i class="fas fa-unplug"></i> Disconnect
                        </button>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        document.getElementById('cellular-info').innerHTML = html;
    } catch (error) {
        document.getElementById('cellular-info').innerHTML = 
            `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
    }
}

async function checkCellularConnected(interfaceName) {
    try {
        const props = await apiCall(`/cellular/interface/${interfaceName}`);
        return props && props.ipv4Address;
    } catch {
        return false;
    }
}

async function connectCellular(interfaceName) {
    try {
        const result = await apiCall(`/cellular/connect/${interfaceName}`, 'POST');
        if (result.success) {
            alert('Cellular connection started');
            loadCellularInfo();
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function disconnectCellular(interfaceName) {
    try {
        const result = await apiCall(`/cellular/disconnect/${interfaceName}`, 'POST');
        if (result.success) {
            alert('Cellular connection disconnected');
            loadCellularInfo();
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Power
async function rebootSystem() {
    if (!confirm('Are you sure you want to reboot the system?')) return;
    
    try {
        const result = await apiCall('/power/reboot', 'POST', { force: false, reason: 'Web interface' });
        if (result.success) {
            alert('System will be rebooted...');
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function shutdownSystem() {
    if (!confirm('Are you sure you want to shutdown the system?')) return;
    
    try {
        const result = await apiCall('/power/shutdown', 'POST', { force: false, reason: 'Web interface' });
        if (result.success) {
            alert('System will be shut down...');
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Apps
async function loadPackages() {
    try {
        const packages = await apiCall('/package/list');
        if (packages.length === 0) {
            document.getElementById('package-info').innerHTML = 
                '<div class="loading">No apps installed</div>';
            return;
        }

        let html = '<div class="package-list">';
        for (const pkg of packages) {
            html += `
                <div class="package-item">
                    <div class="package-info">
                        <div class="package-name">${pkg.displayName || pkg.appName}</div>
                        <div class="package-version">Version: ${pkg.version || 'N/A'}</div>
                    </div>
                    <div class="package-status">
                        ${pkg.isRunning ? 
                            '<span class="status-badge status-connected">Running</span>' : 
                            '<span class="status-badge status-disconnected">Stopped</span>'}
                    </div>
                </div>
            `;
        }
        html += '</div>';
        document.getElementById('package-info').innerHTML = html;
    } catch (error) {
        document.getElementById('package-info').innerHTML = 
            `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
    }
}

// Sensors
async function loadSensorInfo() {
    try {
        const data = await apiCall('/sensor/capabilities');
        const capabilities = data.capabilities || [];
        
        if (capabilities.length === 0) {
            document.getElementById('sensor-info').innerHTML = 
                '<div class="loading">No sensors available</div>';
            return;
        }

        let html = '<div class="info-item"><span class="info-label">Available Sensors:</span></div>';
        capabilities.forEach(sensor => {
            html += `
                <div class="info-item">
                    <span class="info-value">${sensor}</span>
                </div>
            `;
        });
        
        document.getElementById('sensor-info').innerHTML = html;
    } catch (error) {
        document.getElementById('sensor-info').innerHTML = 
            `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
    }
}

// WiFi Config Form
document.getElementById('wifi-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const interfaceName = e.target.dataset.interface;
    const ssid = document.getElementById('wifi-ssid').value;
    const password = document.getElementById('wifi-password').value;
    const security = document.getElementById('wifi-security').value;
    const dhcp = document.getElementById('wifi-dhcp').checked;
    const ip = document.getElementById('wifi-ip').value;
    const gateway = document.getElementById('wifi-gateway').value;
    const dns = document.getElementById('wifi-dns').value.split(',').map(s => s.trim()).filter(s => s);

    try {
        const result = await apiCall(`/wifi/client/config/${interfaceName}`, 'POST', {
            ssid,
            password,
            security,
            dhcpEnable: dhcp,
            ipv4Address: ip,
            ipv4Gateway: gateway,
            ipv4Dns: dns
        });

        if (result.success) {
            alert('WiFi configuration applied successfully!');
            closeModal('wifi-modal');
            loadWiFiInfo();
        }
    } catch (error) {
        alert(`Error configuring: ${error.message}`);
    }
});

document.getElementById('wifi-dhcp').addEventListener('change', (e) => {
    document.getElementById('wifi-static-config').style.display = e.target.checked ? 'none' : 'block';
});

// Refresh all
async function refreshAll() {
    await Promise.all([
        loadSystemInfo(),
        loadWiFiInfo(),
        loadEthernetInfo(),
        loadCellularInfo(),
        loadPackages(),
        loadSensorInfo()
    ]);
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

// Tab Functions
function switchTab(section, tabName) {
    // Hide all tabs in the section
    const tabPanes = document.querySelectorAll(`#section-${section} .tab-pane`);
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(`tab-${section}-${tabName}`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Update tab buttons
    const tabButtons = document.querySelectorAll(`#section-${section} .tab-button`);
    tabButtons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Load data for specific tabs
    if (section === 'system' && tabName === 'metrics') {
        loadSystemMetrics();
    } else if (section === 'system' && tabName === 'update') {
        loadUpdateInfo();
    } else if (section === 'system' && tabName === 'security') {
        loadSecurityInfo();
    }
}

// System Metrics
function loadSystemMetrics() {
    // Simulated metrics - replace with actual API calls
    setTimeout(() => {
        const metrics = {
            cpu: Math.floor(Math.random() * 100),
            memory: Math.floor(Math.random() * 100),
            disk: Math.floor(Math.random() * 100),
            network: Math.floor(Math.random() * 100)
        };
        
        document.getElementById('cpu-usage').textContent = metrics.cpu + '%';
        document.getElementById('cpu-bar').style.width = metrics.cpu + '%';
        
        document.getElementById('memory-usage').textContent = metrics.memory + '%';
        document.getElementById('memory-bar').style.width = metrics.memory + '%';
        
        document.getElementById('disk-usage').textContent = metrics.disk + '%';
        document.getElementById('disk-bar').style.width = metrics.disk + '%';
        
        document.getElementById('network-traffic').textContent = metrics.network + '%';
        document.getElementById('network-bar').style.width = metrics.network + '%';
    }, 300);
}

// Update Info
async function loadUpdateInfo() {
    const currentVersion = document.getElementById('current-version');
    if (currentVersion) {
        try {
            const ver = await apiCall('/system/version');
            let display = 'N/A';
            if (ver) {
                const v = ver.version !== undefined && ver.version !== '' ? String(ver.version) : '';
                const r = ver.revision !== undefined && ver.revision !== '' ? String(ver.revision) : '';
                if (v && r) display = `${v}.${r}`;
                else if (v) display = v;
                else if (r) display = r;
            }
            currentVersion.textContent = display;
        } catch (_) {
            currentVersion.textContent = 'N/A';
        }
    }
    setTimeout(() => {
        const latestVersion = document.getElementById('latest-version');
        const updateStatus = document.getElementById('update-status');
        if (latestVersion) latestVersion.textContent = 'Checking...';
        if (updateStatus) updateStatus.textContent = 'Up to date';
    }, 300);
}

// Security Info (legacy dashboard helpers; unused by IOFlow UI)
function loadSecurityInfo() {
    setTimeout(() => {
        const fw = document.getElementById('firewall-status');
        const ssl = document.getElementById('ssl-status');
        const scan = document.getElementById('last-scan');
        if (fw) fw.textContent = 'Active';
        if (ssl) ssl.textContent = 'Enabled';
        if (scan) scan.textContent = 'Never';
    }, 300);
}

function checkForUpdates() {
    alert('Checking for updates...');
    setTimeout(() => {
        document.getElementById('latest-version').textContent = 'v1.0.1';
        document.getElementById('update-status').textContent = 'Update available';
        document.getElementById('install-update-btn').disabled = false;
    }, 2000);
}

function installUpdate() {
    if (confirm('Are you sure you want to install the update? The system will restart.')) {
        alert('Update installation started. System will restart shortly.');
    }
}

function runSecurityScan() {
    alert('Security scan started...');
    setTimeout(() => {
        document.getElementById('last-scan').textContent = new Date().toLocaleString();
        alert('Security scan completed. No issues found.');
    }, 2000);
}

function changePassword() {
    const newPassword = prompt('Enter new password:');
    if (newPassword) {
        alert('Password change functionality will be implemented soon.');
    }
}

// Sidebar and Navigation Functions (legacy; no sidebar in IOFlow UI)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const section = document.getElementById(`section-${sectionId}`);
    if (section) {
        section.classList.add('active');
    }
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.nav-item')?.classList.add('active');
    
    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'system': 'System',
        'network': 'Network',
        'power': 'Power Management',
        'packages': 'Apps',
        'sensors': 'Sensors',
        'about': 'About'
    };
    document.getElementById('page-title').textContent = titles[sectionId] || 'Dashboard';
    
    // Load data for the section
    if (sectionId === 'dashboard') {
        refreshAll();
    } else if (sectionId === 'system') {
        loadSystemInfo();
        setTimeout(() => {
            const systemInfo = document.getElementById('system-info')?.innerHTML;
            if (systemInfo && document.getElementById('system-info-detailed')) {
                document.getElementById('system-info-detailed').innerHTML = systemInfo;
            }
        }, 500);
    } else if (sectionId === 'network') {
        loadWiFiInfo();
        loadEthernetInfo();
        loadCellularInfo();
        // Copy to detailed views if they exist
        setTimeout(() => {
            const wifiInfo = document.getElementById('wifi-info')?.innerHTML;
            const ethernetInfo = document.getElementById('ethernet-info')?.innerHTML;
            const cellularInfo = document.getElementById('cellular-info')?.innerHTML;
            if (wifiInfo && document.getElementById('wifi-info-detailed')) {
                document.getElementById('wifi-info-detailed').innerHTML = wifiInfo;
            }
            if (ethernetInfo && document.getElementById('ethernet-info-detailed')) {
                document.getElementById('ethernet-info-detailed').innerHTML = ethernetInfo;
            }
            if (cellularInfo && document.getElementById('cellular-info-detailed')) {
                document.getElementById('cellular-info-detailed').innerHTML = cellularInfo;
            }
        }, 500);
    } else if (sectionId === 'packages') {
        loadPackages();
        setTimeout(() => {
            const packageInfo = document.getElementById('package-info')?.innerHTML;
            if (packageInfo && document.getElementById('package-info-detailed')) {
                document.getElementById('package-info-detailed').innerHTML = packageInfo;
            }
        }, 500);
    } else if (sectionId === 'sensors') {
        loadSensorInfo();
        setTimeout(() => {
            const sensorInfo = document.getElementById('sensor-info')?.innerHTML;
            if (sensorInfo && document.getElementById('sensor-info-detailed')) {
                document.getElementById('sensor-info-detailed').innerHTML = sensorInfo;
            }
        }, 500);
    } else if (sectionId === 'about') {
        // About page doesn't need data loading
    }
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Set current year in footer
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
    
    refreshAll();
    // Auto-refresh every 30 seconds
    setInterval(refreshAll, 30000);
});
