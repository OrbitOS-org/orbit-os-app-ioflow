// System page functionality

/** Same string as Information → API Version (`GET /system/version`). */
async function getApiVersionDisplay() {
    try {
        const ver = await apiCall('/system/version');
        if (!ver) return 'N/A';
        const v = ver.version !== undefined && ver.version !== '' ? String(ver.version) : '';
        const r = ver.revision !== undefined && ver.revision !== '' ? String(ver.revision) : '';
        if (v && r) return `${v}.${r}`;
        if (v) return v;
        if (r) return r;
    } catch (_) {
        /* ignore */
    }
    return 'N/A';
}

// System Info
async function loadSystemInfo() {
    try {
        const info = await apiCall('/system/info');
        const apiVersionDisplay = await getApiVersionDisplay();

        function row(label, value) {
            return `<div class="info-item"><span class="info-label">${label}</span><span class="info-value">${value || 'N/A'}</span></div>`;
        }
        function section(title, icon, rows) {
            return `<div class="info-section"><div class="info-section-title"><i class="fas fa-${icon}"></i> ${title}</div>${rows}</div>`;
        }

        const ramGB = info.totalRam ? (info.totalRam / (1024*1024*1024)).toFixed(1) + ' GB' : 'N/A';

        const html =
            section('Build', 'code-branch',
                row('OS Version', info.osVersion) +
                row('API Version', apiVersionDisplay) +
                row('Build Date', info.buildDate)
            ) +
            section('Device', 'microchip',
                row('Device Name', info.deviceName) +
                row('Hardware Model', info.hardwareModel) +
                row('Hardware Version', info.hardwareVersion) +
                row('Machine ID', `<span class="font-mono">${info.machineId || 'N/A'}</span>`) +
                row('Architecture', info.architecture)
            ) +
            section('Hardware', 'server',
                row('Board Model', info.boardModel) +
                row('Board Vendor', info.boardVendor) +
                row('SoC Model', info.socModel) +
                row('SoC Vendor', info.socVendor)
            ) +
            section('Processor', 'cogs',
                row('CPU Model', info.cpuModel) +
                row('Cores / Threads', `${info.cpuCores || 'N/A'} / ${info.cpuThreads || 'N/A'}`) +
                row('Frequency Range', `${info.cpuMinMhz || 0} – ${info.cpuMaxMhz || 0} MHz`) +
                row('Total RAM', ramGB)
            ) +
            section('Operating System', 'laptop-code',
                row('OS', info.osName) +
                row('Distro', `${info.distro || 'N/A'} ${info.distroVersion || ''}`.trim()) +
                row('Kernel', info.kernelVersion)
            );

        const element = document.getElementById('system-info-detailed');
        if (element) element.innerHTML = html;
    } catch (error) {
        const element = document.getElementById('system-info-detailed');
        if (element) {
            element.innerHTML = `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
        }
    }
}

// Tab Functions
function switchTab(section, tabName, buttonElement) {
    // Hide all tab panes in the tabs container
    const tabPanes = document.querySelectorAll('.tabs-content .tab-pane');
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(`tab-${section}-${tabName}`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Update tab buttons - remove active from all
    const tabButtons = document.querySelectorAll('.tabs-header .tab-button');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Activate the clicked button
    if (buttonElement) {
        buttonElement.classList.add('active');
    } else {
        // Fallback: find button by onclick attribute
        tabButtons.forEach(btn => {
            if (btn.getAttribute('onclick')?.includes(`'${tabName}'`)) {
                btn.classList.add('active');
            }
        });
    }
    
    // Load data for specific tabs
    if (section === 'system') {
        // Stop all periodic updates when switching tabs
        stopMetricsUpdate();
        stopTimeUpdate();
        
        if (tabName === 'information') {
            loadSystemInfo();
        } else if (tabName === 'metrics') {
            startMetricsUpdate();
        } else if (tabName === 'update') {
            loadUpdateInfo();
        } else if (tabName === 'time') {
            loadTimeInfo();
        } else if (tabName === 'security') {
            loadSecurityInfo();
        } else if (tabName === 'account') {
            loadAccountInfo();
        }
    }
}

// System Metrics
let metricsInterval = null;
let charts = {
    cpu: null,
    cpuFreq: null,
    load: null,
    memory: null,
    memoryMb: null,
    temperature: null,
    disk: null,
    diskIo: null,
    network: null,
    networkPackets: null
};
const MAX_DATA_POINTS = 30; // Keep last 30 data points

async function loadSystemMetrics() {
    try {
        const metrics = await apiCall('/system/metrics');
        
        // CPU Usage per core
        if (metrics.cpuCorePercent && metrics.cpuCorePercent.length > 0) {
            updateCpuCoreChart(metrics.cpuCorePercent);
        } else {
            // Fallback to total if no per-core data
            updateCpuCoreChart([metrics.cpuUsage || 0]);
        }
        
        // CPU Frequency
        if (metrics.cpuFreq) {
            updateChart('cpuFreq', metrics.cpuFreq.current || 0);
        }
        
        // Load Average
        if (metrics.sysUptime && metrics.sysUptime.loadAverage && metrics.sysUptime.loadAverage.length >= 3) {
            const load = metrics.sysUptime.loadAverage;
            updateChart('load', load[0], load[1], load[2]);
        }
        
        // Memory Usage (%)
        const memoryPercent = Math.round(metrics.memoryUsage || 0);
        updateChart('memory', memoryPercent);
        
        // Memory Usage (MB)
        if (metrics.virtualMemory) {
            const vm = metrics.virtualMemory;
            const usedMB = (vm.used || 0) / (1024 * 1024);
            const freeMB = (vm.free || 0) / (1024 * 1024);
            updateChart('memoryMb', usedMB, freeMB);
        }
        
        // SoC Thermal
        const temp = Math.round(metrics.socThermal || 0);
        updateChart('temperature', temp);
        
        // Disk Usage
        if (metrics.diskUsage) {
            const disks = Object.values(metrics.diskUsage);
            if (disks.length > 0) {
                const diskPercent = disks[0].percent || 0;
                updateChart('disk', diskPercent);
            }
        }
        
        // Disk I/O
        if (metrics.diskIoCounters) {
            const io = metrics.diskIoCounters;
            const readMB = (io.readBytes || 0) / (1024 * 1024);
            const writeMB = (io.writeBytes || 0) / (1024 * 1024);
            updateChart('diskIo', readMB, writeMB);
        }
        
        // Network Traffic
        if (metrics.network) {
            const bytesSent = metrics.network.bytesSent || 0;
            const bytesRecv = metrics.network.bytesRecv || 0;
            const sentMB = bytesSent / (1024 * 1024);
            const recvMB = bytesRecv / (1024 * 1024);
            updateChart('network', sentMB, recvMB);
        }
        
        // Network Packets
        if (metrics.network) {
            const net = metrics.network;
            const packetsSent = net.packetsSent || 0;
            const packetsRecv = net.packetsRecv || 0;
            updateChart('networkPackets', packetsSent, packetsRecv);
        }
    } catch (error) {
        console.error('Error loading metrics:', error);
    }
}

// Initialize charts
function initializeCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#cbd5e1'
                }
            }
        },
        scales: {
            x: {
                ticks: { color: '#94a3b8' },
                grid: { color: '#1a1a1a' }
            },
            y: {
                ticks: { color: '#94a3b8' },
                grid: { color: '#1a1a1a' }
            }
        }
    };

    // CPU Chart (per-core bar chart)
    const cpuCtx = document.getElementById('cpu-chart');
    if (cpuCtx && !charts.cpu) {
        charts.cpu = new Chart(cpuCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU Usage (%)',
                    data: [],
                    backgroundColor: [],
                    borderColor: [],
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ctx.parsed.y.toFixed(1) + '%'; }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        min: 0,
                        max: 100,
                        ticks: {
                            color: '#94a3b8',
                            callback: function(v) { return v + '%'; }
                        },
                        grid: { color: '#1e293b' }
                    }
                }
            }
        });
    }

    // CPU Frequency Chart
    const cpuFreqCtx = document.getElementById('cpu-freq-chart');
    if (cpuFreqCtx && !charts.cpuFreq) {
        charts.cpuFreq = new Chart(cpuFreqCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU Frequency (MHz)',
                    data: [],
                    borderColor: '#f59e0b',
                    tension: 0.4,
                    fill: false
                }]
            },
            options: chartOptions
        });
    }

    // Load Average Chart
    const loadCtx = document.getElementById('load-chart');
    if (loadCtx && !charts.load) {
        charts.load = new Chart(loadCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '1min',
                        data: [],
                        borderColor: '#10b981',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: '5min',
                        data: [],
                        borderColor: '#3b82f6',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: '15min',
                        data: [],
                        borderColor: '#8b5cf6',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: chartOptions
        });
    }

    // Memory Chart
    const memoryCtx = document.getElementById('memory-chart');
    if (memoryCtx && !charts.memory) {
        charts.memory = new Chart(memoryCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Memory Usage (%)',
                    data: [],
                    borderColor: '#10b981',
                    tension: 0.4,
                    fill: false
                }]
            },
            options: chartOptions
        });
    }

    // Memory MB Chart
    const memoryMbCtx = document.getElementById('memory-mb-chart');
    if (memoryMbCtx && !charts.memoryMb) {
        charts.memoryMb = new Chart(memoryMbCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Used (MB)',
                        data: [],
                        borderColor: '#ef4444',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Free (MB)',
                        data: [],
                        borderColor: '#10b981',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: chartOptions
        });
    }

    // Temperature Chart
    const tempCtx = document.getElementById('temperature-chart');
    if (tempCtx && !charts.temperature) {
        charts.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#ef4444',
                    tension: 0.4,
                    fill: false
                }]
            },
            options: chartOptions
        });
    }

    // Disk Chart
    const diskCtx = document.getElementById('disk-chart');
    if (diskCtx && !charts.disk) {
        charts.disk = new Chart(diskCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Disk Usage (%)',
                    data: [],
                    borderColor: '#f59e0b',
                    tension: 0.4,
                    fill: false
                }]
            },
            options: chartOptions
        });
    }

    // Disk I/O Chart
    const diskIoCtx = document.getElementById('disk-io-chart');
    if (diskIoCtx && !charts.diskIo) {
        charts.diskIo = new Chart(diskIoCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Read (MB)',
                        data: [],
                        borderColor: '#3b82f6',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Write (MB)',
                        data: [],
                        borderColor: '#8b5cf6',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: chartOptions
        });
    }

    // Network Chart
    const networkCtx = document.getElementById('network-chart');
    if (networkCtx && !charts.network) {
        charts.network = new Chart(networkCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Bytes Sent (MB)',
                        data: [],
                        borderColor: '#3b82f6',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Bytes Received (MB)',
                        data: [],
                        borderColor: '#8b5cf6',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: chartOptions
        });
    }

    // Network Packets Chart
    const networkPacketsCtx = document.getElementById('network-packets-chart');
    if (networkPacketsCtx && !charts.networkPackets) {
        charts.networkPackets = new Chart(networkPacketsCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Packets Sent',
                        data: [],
                        borderColor: '#3b82f6',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Packets Received',
                        data: [],
                        borderColor: '#8b5cf6',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: chartOptions
        });
    }
}

// Update chart data
const coreColors = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
    '#14b8a6', '#a855f7', '#84cc16', '#e11d48',
    '#0ea5e9', '#d946ef', '#22c55e', '#fb923c'
];

function updateCpuCoreChart(corePercents) {
    const chart = charts.cpu;
    if (!chart) return;

    // Labels: Core 0, Core 1, ...
    chart.data.labels = corePercents.map(function(_, i) { return 'Core ' + i; });

    // Values
    var values = corePercents.map(function(v) { return Math.round(v * 10) / 10; });
    chart.data.datasets[0].data = values;

    // Colors based on usage (green < 50, yellow 50-80, red > 80)
    chart.data.datasets[0].backgroundColor = values.map(function(v) {
        if (v < 50) return '#10b981aa';
        if (v < 80) return '#f59e0baa';
        return '#ef4444aa';
    });
    chart.data.datasets[0].borderColor = values.map(function(v) {
        if (v < 50) return '#10b981';
        if (v < 80) return '#f59e0b';
        return '#ef4444';
    });

    chart.update('none');
}

function updateChart(chartName, value, value2 = null, value3 = null) {
    if (!charts[chartName]) return;

    const now = new Date().toLocaleTimeString();
    const chart = charts[chartName];
    
    // Add new data point
    chart.data.labels.push(now);
    
    // Add to first dataset
    if (chart.data.datasets[0] && Array.isArray(chart.data.datasets[0].data)) {
        chart.data.datasets[0].data.push(value);
    }
    
    // Add second dataset if provided
    if (value2 !== null && chart.data.datasets[1] && Array.isArray(chart.data.datasets[1].data)) {
        chart.data.datasets[1].data.push(value2);
    }
    
    // Add third dataset if provided (for load average)
    if (value3 !== null && chart.data.datasets[2] && Array.isArray(chart.data.datasets[2].data)) {
        chart.data.datasets[2].data.push(value3);
    }
    
    // Keep only last MAX_DATA_POINTS
    if (chart.data.labels.length > MAX_DATA_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(dataset => {
            if (Array.isArray(dataset.data)) {
                dataset.data.shift();
            }
        });
    }
    
    chart.update('none'); // 'none' for smooth animation without delay
}

// Start periodic metrics update
function startMetricsUpdate() {
    // Clear existing interval if any
    if (metricsInterval) {
        clearInterval(metricsInterval);
    }
    
    // Initialize charts if not already done
    if (!charts.cpu) {
        initializeCharts();
    }
    
    // Update immediately
    loadSystemMetrics();
    // Then update every 5 seconds
    metricsInterval = setInterval(loadSystemMetrics, 5000);
}

// Stop periodic metrics update
function stopMetricsUpdate() {
    if (metricsInterval) {
        clearInterval(metricsInterval);
        metricsInterval = null;
    }
    // Don't destroy charts, just stop updating them
}

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Update Info
async function loadUpdateInfo() {
    const currentVersion = document.getElementById('current-version');
    if (currentVersion) {
        currentVersion.textContent = await getApiVersionDisplay();
    }
    const updateStatus = document.getElementById('update-status');
    if (updateStatus) updateStatus.innerHTML = '<span class="status-badge status-connected">Up to date</span>';

    // Setup update form handler
    const updateForm = document.getElementById('system-update-form');
    if (updateForm && !updateForm.dataset.initialized) {
        updateForm.dataset.initialized = 'true';
        updateForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fileInput = document.getElementById('update-file');
            const file = fileInput.files[0];
            if (!file) {
                showNotification('Please select a .orbit update file', 'warning');
                return;
            }

            // Validate extension
            if (!file.name.toLowerCase().endsWith('.orbit')) {
                showNotification('Invalid file format. Please select a .orbit file.', 'error');
                return;
            }

            const confirmed = await showConfirm('Are you sure you want to install the update? The system will restart.', 'Install Update');
            if (!confirmed) {
                return;
            }

            const formData = new FormData();
            formData.append('update', file);

            const progressDiv = document.getElementById('update-progress');
            const progressBar = document.getElementById('update-progress-bar');
            const installBtn = document.getElementById('install-update-btn');

            progressDiv.style.display = 'block';
            progressBar.value = 0;
            installBtn.disabled = true;

            try {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        progressBar.value = (e.loaded / e.total) * 100;
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        if (response.success) {
                            const updateStatus = document.getElementById('update-status');
                            if (updateStatus) updateStatus.innerHTML = '<span class="status-badge status-warning">Restarting...</span>';
                            showNotification('Update file sucessfully sent! System will restart shortly.', 'success');
                        } else {
                            showNotification('Failed to install update', 'error');
                        }
                    } else {
                        showNotification(`Error installing update: ${xhr.statusText}`, 'error');
                    }
                    progressDiv.style.display = 'none';
                    installBtn.disabled = false;
                });

                xhr.addEventListener('error', () => {
                    showNotification('Error uploading update file', 'error');
                    progressDiv.style.display = 'none';
                    installBtn.disabled = false;
                });

                xhr.open('POST', '/api/system/update');
                xhr.send(formData);
            } catch (error) {
                showNotification(`Error: ${error.message}`, 'error');
                progressDiv.style.display = 'none';
                installBtn.disabled = false;
            }
        });
    }
}

// Security Info
async function loadSecurityInfo() {
    try {
        const [untrusted, devMode, ssh] = await Promise.all([
            apiCall('/system/security/untrusted-apps').catch(() => ({ allowed: false })),
            apiCall('/system/security/dev-mode').catch(() => ({ enabled: false })),
            apiCall('/system/security/ssh').catch(() => ({ enabled: false })),
        ]);

        function toggleRow(id, label, desc, checked, onChange) {
            return `
                <div class="toggle-item">
                    <div class="toggle-item-info">
                        <span class="toggle-item-label">${label}</span>
                        <span class="toggle-item-desc">${desc}</span>
                    </div>
                    <div class="toggle-item-right">
                        <label class="toggle-switch">
                            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} onchange="${onChange}">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>`;
        }

        const el = document.getElementById('security-settings-content');
        if (el) {
            el.innerHTML =
                toggleRow('toggle-ssh', 'SSH Server', 'Allow remote SSH access to the device', ssh.enabled, "toggleSecuritySetting('ssh', this.checked, this)") +
                toggleRow('toggle-dev-mode', 'Development Mode', 'Enable development features and debug access', devMode.enabled, "onDevModeToggle(this)") +
                toggleRow('toggle-untrusted', 'Untrusted Apps', 'Allow installation of untrusted Apps', untrusted.allowed, "onUntrustedAppsToggle(this)");
        }
    } catch (e) {
        console.error('Error loading security info:', e);
    }
}

/** Confirmation when enabling development mode. */
async function onDevModeToggle(checkbox) {
    const enable = checkbox.checked;
    if (enable) {
        const ok = await showConfirm(
            'Enable development mode? The dashboard will show developer-only areas. Only turn this on if you trust this network and understand the security implications.',
            'Enable development mode'
        );
        if (!ok) {
            checkbox.checked = false;
            return;
        }
    }
    await toggleSecuritySetting('dev-mode', enable, checkbox);
}

/** Confirmation is shown only when enabling untrusted app installation. */
async function onUntrustedAppsToggle(checkbox) {
    const enable = checkbox.checked;
    if (enable) {
        const ok = await showConfirm(
            'Allow installation of untrusted apps? You will be able to install packages that are not signed or verified, which may reduce device security.',
            'Confirm security change'
        );
        if (!ok) {
            checkbox.checked = false;
            return;
        }
    }
    await toggleSecuritySetting('untrusted-apps', enable, checkbox);
}

async function toggleSecuritySetting(setting, enable, toggleEl) {
    const toggle = toggleEl || null;
    if (toggle) toggle.disabled = true;
    try {
        const action = enable ? 'enable' : 'disable';
        const resp = await fetch(`/api/system/security/${setting}/${action}`, { method: 'POST' });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? `${setting} ${action}d` : 'Operation failed', result.success ? 'success' : 'error');
        if (!result.success && toggle) toggle.checked = !enable;
        if (result.success && setting === 'dev-mode') {
            window.location.reload();
        }
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
        if (toggle) toggle.checked = !enable;
    } finally {
        if (toggle) toggle.disabled = false;
    }
}


// ===== Time & NTP =====

let timeUpdateInterval = null;

async function loadTimeInfo() {
    await Promise.all([loadCurrentTime(), loadNTPStatus(), loadNTPServers()]);
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    timeUpdateInterval = setInterval(loadCurrentTime, 60000); // update every minute
}

function stopTimeUpdate() {
    if (timeUpdateInterval) { clearInterval(timeUpdateInterval); timeUpdateInterval = null; }
}

function formatDateTime(ts) {
    const d = new Date(ts * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatUptimeMinutes(sec) {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);
    return parts.join(' ');
}

async function loadCurrentTime() {
    try {
        const [timeResp, uptimeResp] = await Promise.all([
            apiCall('/time/seconds'), apiCall('/time/uptime')
        ]);
        const timeEl = document.getElementById('system-time-value');
        if (timeEl && timeResp.time) timeEl.textContent = formatDateTime(timeResp.time);
        const uptimeEl = document.getElementById('system-uptime-value');
        if (uptimeEl && uptimeResp.uptimeSec !== undefined) uptimeEl.textContent = formatUptimeMinutes(uptimeResp.uptimeSec);
    } catch (e) { console.error('Error loading time:', e); }
}

async function loadNTPStatus() {
    try {
        const resp = await apiCall('/time/ntp/status');
        const synced = resp.ntpSync || false;
        const toggle = document.getElementById('ntp-toggle');
        if (toggle) toggle.checked = synced;
        const desc = document.getElementById('ntp-status-desc');
        if (desc) desc.textContent = synced ? 'NTP is active — time is synchronized' : 'NTP is disabled — using local clock';
    } catch (e) { console.error('Error loading NTP status:', e); }
}

async function loadNTPServers() {
    try {
        const resp = await apiCall('/time/ntp/servers');
        const textarea = document.getElementById('ntp-servers-input');
        if (textarea) textarea.value = (resp.servers || []).join('\n');
    } catch (e) { console.error('Error loading NTP servers:', e); }
}

async function toggleNTPSync(enable) {
    const toggle = document.getElementById('ntp-toggle');
    if (toggle) toggle.disabled = true;
    try {
        const resp = await fetch(`/api/time/ntp/${enable ? 'enable' : 'disable'}`, { method: 'POST' });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? `NTP ${enable ? 'enabled' : 'disabled'}` : 'Operation failed', result.success ? 'success' : 'error');
        if (!result.success && toggle) toggle.checked = !enable;
        await loadNTPStatus();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
        if (toggle) toggle.checked = !enable;
    } finally {
        if (toggle) toggle.disabled = false;
    }
}

async function saveNTPServers() {
    const textarea = document.getElementById('ntp-servers-input');
    if (!textarea) return;
    const servers = textarea.value.split('\n').map(s => s.trim()).filter(s => s);
    if (!servers.length) { showNotification('Enter at least one NTP server', 'error'); return; }
    try {
        const resp = await fetch('/api/time/ntp/servers', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ servers })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'NTP servers saved' : 'Failed to save', result.success ? 'success' : 'error');
        if (result.success) await loadNTPServers();
    } catch (e) { showNotification(`Error: ${e.message}`, 'error'); }
}

// showNotification is now provided globally by core.js

// ===== Account =====

async function loadAccountInfo() {
    const container = document.getElementById('account-container');
    if (!container) return;
    try {
        const status = await apiCall('/account/status');
        const registered = status.registered || false;
        const email = status.email || '';

        if (registered) {
            container.innerHTML = `
                <div class="info-section">
                    <div class="info-section-title"><i class="fas fa-check-circle"></i> Account Status</div>
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="info-value"><span class="status-badge status-connected">Registered</span></span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Email</span>
                        <span class="info-value font-mono">${email}</span>
                    </div>
                </div>
                <div style="margin-top:var(--spacing-md);">
                    <button class="btn btn-danger" onclick="removeAccount()"><i class="fas fa-user-minus"></i> Remove Account</button>
                </div>`;
        } else {
            container.innerHTML = `
                <div class="info-section">
                    <div class="info-section-title"><i class="fas fa-info-circle"></i> Account Status</div>
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="info-value"><span class="status-badge status-disconnected">Not Registered</span></span>
                    </div>
                </div>
                <div style="margin-top:var(--spacing-md);">
                    <h3 style="color:var(--text-primary);margin-bottom:var(--spacing-sm);font-size:1rem;">Register Account</h3>
                    <form onsubmit="registerAccount(event)" style="display:flex;flex-direction:column;gap:var(--spacing-sm);max-width:400px;">
                        <div class="form-group">
                            <label><i class="fas fa-envelope"></i> Email</label>
                            <input type="email" id="account-email" placeholder="your@email.com" required>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-lock"></i> Password</label>
                            <input type="password" id="account-password" placeholder="Password" required>
                        </div>
                        <button type="submit" class="btn btn-primary"><i class="fas fa-user-plus"></i> Register</button>
                    </form>
                </div>`;
        }
    } catch (e) {
        container.innerHTML = `<div class="loading" style="color: var(--danger);">Error: ${e.message}</div>`;
    }
}

async function registerAccount(e) {
    e.preventDefault();
    const email = document.getElementById('account-email').value.trim();
    const password = document.getElementById('account-password').value;
    if (!email || !password) return;
    try {
        const resp = await fetch('/api/account/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'Account registered' : (result.message || 'Registration failed'), result.success ? 'success' : 'error');
        if (result.success) await loadAccountInfo();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function removeAccount() {
    const password = prompt('Enter your password to remove the account:');
    if (!password) return;
    try {
        const resp = await fetch('/api/account/remove', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        showNotification(result.success ? 'Account removed' : (result.message || 'Failed to remove'), result.success ? 'success' : 'error');
        if (result.success) await loadAccountInfo();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

function refreshCurrentPage() {
    loadSystemInfo();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    loadSystemInfo();
    
    // Stop periodic updates when page is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopMetricsUpdate();
            stopTimeUpdate();
        }
    });
});
