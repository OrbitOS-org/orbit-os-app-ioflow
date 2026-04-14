// GPIO page functionality

// Proto enum values (aligned with updated proto)
// GpioLevel:     LOW=0, HIGH=1
// GpioDirection: OUT=0, IN=1
const GpioLevel = { LOW: 0, HIGH: 1 };
const GpioDirection = { OUT: 0, IN: 1 };

let gpioPinsList = [];
let pwmPinsList = [];
let gpioTablePollTimer = null;

function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function gpioPinChip(pin) {
    return pin.chipNumber != null ? pin.chipNumber : 0;
}

function getLevelName(level) {
    switch (Number(level)) {
        case GpioLevel.LOW: return 'Low';
        case GpioLevel.HIGH: return 'High';
        default: return 'Unknown';
    }
}

function getLevelColor(level) {
    switch (Number(level)) {
        case GpioLevel.HIGH: return 'var(--success)';
        case GpioLevel.LOW: return 'var(--text-secondary)';
        default: return 'var(--text-muted)';
    }
}

function getDirectionName(dir) {
    switch (Number(dir)) {
        case GpioDirection.OUT: return 'Output';
        case GpioDirection.IN: return 'Input';
        default: return 'Unknown';
    }
}

// ===== IOFlow tabs =====

function switchTab(section, tabName, buttonElement) {
    const tabPanes = document.querySelectorAll('.tabs-content .tab-pane');
    tabPanes.forEach(pane => pane.classList.remove('active'));

    const selectedTab = document.getElementById(`tab-${section}-${tabName}`);
    if (selectedTab) selectedTab.classList.add('active');

    const tabButtons = document.querySelectorAll('.tabs-header .tab-button');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    if (buttonElement) buttonElement.classList.add('active');

    if (section === 'ioflow') {
        if (tabName === 'gpio') {
            startGpioTablePolling();
            refreshGpioTableStates();
        } else {
            stopGpioTablePolling();
        }
    }
    if (section === 'ioflow' && tabName === 'uart') {
        loadUartPorts();
    }
    if (section === 'ioflow' && tabName === 'i2c') {
        loadI2CBuses();
    }
    if (section === 'ioflow' && tabName === 'spi') {
        loadSpiDevices();
    }
}

// ===== GPIO Pins (table + 1s refresh) =====

function isGpioTabActive() {
    const tab = document.getElementById('tab-ioflow-gpio');
    return tab && tab.classList.contains('active');
}

function startGpioTablePolling() {
    stopGpioTablePolling();
    if (!document.getElementById('gpio-pins-tbody')) return;
    gpioTablePollTimer = setInterval(() => {
        if (!document.hidden && isGpioTabActive()) {
            refreshGpioTableStates();
        }
    }, 1000);
}

function stopGpioTablePolling() {
    if (gpioTablePollTimer) {
        clearInterval(gpioTablePollTimer);
        gpioTablePollTimer = null;
    }
}

function renderGpioTable() {
    const tbody = document.getElementById('gpio-pins-tbody');
    if (!tbody) return;

    if (!gpioPinsList.length) {
        tbody.innerHTML = '<tr><td colspan="3">No GPIO pins available</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    gpioPinsList.forEach((pin, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.gpioIdx = String(idx);
        tr.innerHTML = `
            <td><strong>${escapeHtml(pin.name)}</strong></td>
            <td>
                <div class="gpio-cell-toggle">
                    <label class="toggle-switch">
                        <input type="checkbox" data-gpio-idx="${idx}" data-gpio-field="dir" onchange="onGpioTableDirChange(this)">
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="gpio-cell-label gpio-dir-label">—</span>
                </div>
            </td>
            <td>
                <div class="gpio-cell-toggle">
                    <label class="toggle-switch">
                        <input type="checkbox" data-gpio-idx="${idx}" data-gpio-field="lvl" onchange="onGpioTableLevelChange(this)">
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="gpio-cell-label gpio-lvl-label">—</span>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

async function refreshGpioTableStates() {
    const tbody = document.getElementById('gpio-pins-tbody');
    if (!tbody || !gpioPinsList.length) return;

    await Promise.all(gpioPinsList.map(async (pin, idx) => {
        const chip = gpioPinChip(pin);
        const row = tbody.querySelector(`tr[data-gpio-idx="${idx}"]`);
        if (!row) return;
        try {
            const state = await apiCall(
                `/gpio/level?name=${encodeURIComponent(pin.name)}&number=${pin.number}&chip=${chip}`
            );
            const dirToggle = row.querySelector('input[data-gpio-field="dir"]');
            const lvlToggle = row.querySelector('input[data-gpio-field="lvl"]');
            const isOut = Number(state.direction) === GpioDirection.OUT;
            const isHigh = Number(state.level) === GpioLevel.HIGH;
            if (dirToggle) dirToggle.checked = isOut;
            if (lvlToggle) lvlToggle.checked = isHigh;
            const dirLab = row.querySelector('.gpio-dir-label');
            const lvlLab = row.querySelector('.gpio-lvl-label');
            if (dirLab) dirLab.textContent = isOut ? 'Output' : 'Input';
            if (lvlLab) {
                lvlLab.textContent = isHigh ? 'HIGH' : 'LOW';
                if (isHigh) {
                    lvlLab.style.color = 'var(--success)';
                } else {
                    lvlLab.style.color = '';
                }
            }
        } catch {
            const dirLab = row.querySelector('.gpio-dir-label');
            const lvlLab = row.querySelector('.gpio-lvl-label');
            if (dirLab) dirLab.textContent = 'Error';
            if (lvlLab) lvlLab.textContent = 'Error';
        }
    }));
}

async function loadGpioPins() {
    try {
        const resp = await apiCall('/gpio/pins');
        gpioPinsList = resp.pins || [];
        renderGpioTable();
        await refreshGpioTableStates();
        if (isGpioTabActive()) {
            startGpioTablePolling();
        }
    } catch (e) {
        stopGpioTablePolling();
        console.error('Error loading GPIO pins:', e);
        const tbody = document.getElementById('gpio-pins-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="3" style="color:var(--danger);">Failed to load pins</td></tr>';
        }
    }
}

async function onGpioTableDirChange(el) {
    const idx = parseInt(el.dataset.gpioIdx, 10);
    const pin = gpioPinsList[idx];
    if (!pin) {
        el.checked = !el.checked;
        return;
    }
    const chipNumber = gpioPinChip(pin);
    const direction = el.checked ? 'OUT' : 'IN';
    const row = el.closest('tr');
    const label = row && row.querySelector('.gpio-dir-label');
    if (label) label.textContent = el.checked ? 'Output' : 'Input';
    try {
        const resp = await fetch('/api/gpio/direction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pinName: pin.name,
                pinNumber: pin.number,
                chipNumber,
                direction,
            }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        showNotification(`${pin.name} direction → ${direction}`, 'success');
    } catch (e) {
        el.checked = !el.checked;
        if (label) label.textContent = el.checked ? 'Output' : 'Input';
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function onGpioTableLevelChange(el) {
    const idx = parseInt(el.dataset.gpioIdx, 10);
    const pin = gpioPinsList[idx];
    if (!pin) {
        el.checked = !el.checked;
        return;
    }
    const chipNumber = gpioPinChip(pin);
    const level = el.checked ? 'HIGH' : 'LOW';
    const row = el.closest('tr');
    const label = row && row.querySelector('.gpio-lvl-label');
    if (label) {
        label.textContent = level;
        if (el.checked) {
            label.style.color = 'var(--success)';
        } else {
            label.style.color = '';
        }
    }
    try {
        const resp = await fetch('/api/gpio/level', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pinName: pin.name,
                pinNumber: pin.number,
                chipNumber,
                level,
            }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        showNotification(`${pin.name} level → ${level}`, 'success');
    } catch (e) {
        el.checked = !el.checked;
        if (label) {
            label.textContent = el.checked ? 'HIGH' : 'LOW';
            if (el.checked) {
                label.style.color = 'var(--success)';
            } else {
                label.style.color = '';
            }
        }
        showNotification(`Error: ${e.message}`, 'error');
    }
}

// ===== PWM Pins =====

async function loadPwmPins() {
    try {
        const resp = await apiCall('/gpio/pwm/pins');
        pwmPinsList = resp.pins || [];
        const select = document.getElementById('pwm-pin-select');
        if (!select) return;

        const current = select.value;

        select.innerHTML = '<option value="">-- Select a PWM pin --</option>';
        for (const pin of pwmPinsList) {
            const opt = document.createElement('option');
            opt.value = `${pin.name}|${pin.number}`;
            opt.textContent = `${pin.name} (#${pin.number})`;
            select.appendChild(opt);
        }

        if (current) {
            select.value = current;
            onPwmPinSelected();
        }
    } catch (e) {
        console.error('Error loading PWM pins:', e);
    }
}

async function onPwmPinSelected() {
    const select = document.getElementById('pwm-pin-select');
    const details = document.getElementById('pwm-pin-details');
    if (!select || !details) return;

    if (!select.value) {
        details.style.display = 'none';
        return;
    }

    const [name, number] = select.value.split('|');
    details.style.display = 'block';

    document.getElementById('pwm-status-label').textContent = 'Loading...';

    try {
        const state = await apiCall(`/gpio/pwm?name=${encodeURIComponent(name)}&number=${number}`);
        const enabled = state.enabled || false;
        const duty = state.dutyCycle !== undefined ? state.dutyCycle : (state.duty_cycle || 0);
        const freq = state.frequencyHz || state.frequency_hz || 0;

        // Status toggle
        const toggle = document.getElementById('pwm-status-toggle');
        const label = document.getElementById('pwm-status-label');
        const icon = document.getElementById('pwm-status-icon');
        toggle.checked = enabled;
        label.textContent = enabled ? 'Active' : 'Inactive';
        icon.style.color = enabled ? 'var(--success)' : 'var(--text-muted)';


        // Pre-fill form (duty is 0-1, display as 0-100%)
        var dutyPct = Math.round((duty || 0) * 100);
        document.getElementById('pwm-set-duty').value = dutyPct;
        document.getElementById('pwm-set-duty-range').value = dutyPct;
        document.getElementById('pwm-set-freq').value = Math.round(freq) || 1000;
        document.getElementById('pwm-set-freq-range').value = Math.round(freq) || 1000;
    } catch (e) {
        document.getElementById('pwm-status-label').textContent = 'Error';
    }
}

function getSelectedPwmPin() {
    const select = document.getElementById('pwm-pin-select');
    if (!select || !select.value) { showNotification('Select a PWM pin first', 'error'); return null; }
    const [name, number] = select.value.split('|');
    return { pinName: name, pinNumber: parseInt(number) };
}

async function setSelectedPwm() {
    const pin = getSelectedPwmPin();
    if (!pin) return;
    const dutyPct = parseFloat(document.getElementById('pwm-set-duty').value);
    const dutyCycle = dutyPct / 100;
    const frequencyHz = parseFloat(document.getElementById('pwm-set-freq').value);
    if (isNaN(dutyPct) || isNaN(frequencyHz)) { showNotification('Fill in duty cycle and frequency', 'error'); return; }

    try {
        const resp = await fetch('/api/gpio/pwm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...pin, dutyCycle, frequencyHz })
        });
        if (!resp.ok) throw new Error(await resp.text());
        showNotification(`PWM configured on ${pin.pinName}`, 'success');
        await onPwmPinSelected();
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function onPwmToggleChanged(el) {
    const pin = getSelectedPwmPin();
    if (!pin) { el.checked = !el.checked; return; }

    const label = document.getElementById('pwm-status-label');
    const icon = document.getElementById('pwm-status-icon');

    if (el.checked) {
        // Enabling — apply current slider values
        const dutyPct = parseFloat(document.getElementById('pwm-set-duty').value);
        const dutyCycle = dutyPct / 100;
        const frequencyHz = parseFloat(document.getElementById('pwm-set-freq').value);
        if (isNaN(dutyPct) || isNaN(frequencyHz)) {
            el.checked = false;
            showNotification('Set duty cycle and frequency first', 'error');
            return;
        }
        try {
            const resp = await fetch('/api/gpio/pwm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...pin, dutyCycle, frequencyHz })
            });
            if (!resp.ok) throw new Error(await resp.text());
            label.textContent = 'Active';
            icon.style.color = 'var(--success)';
            showNotification(`PWM enabled on ${pin.pinName}`, 'success');
            await onPwmPinSelected();
        } catch (e) {
            el.checked = false;
            label.textContent = 'Inactive';
            icon.style.color = 'var(--text-muted)';
            showNotification(`Error: ${e.message}`, 'error');
        }
    } else {
        // Disabling
        try {
            const resp = await fetch('/api/gpio/pwm/disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pin)
            });
            if (!resp.ok) throw new Error(await resp.text());
            label.textContent = 'Inactive';
            icon.style.color = 'var(--text-muted)';
            showNotification(`PWM disabled on ${pin.pinName}`, 'success');
            await onPwmPinSelected();
        } catch (e) {
            el.checked = true;
            label.textContent = 'Active';
            icon.style.color = 'var(--success)';
            showNotification(`Error: ${e.message}`, 'error');
        }
    }
}

// ===== Range <-> Input Sync =====

function syncDutyFromRange(val) {
    document.getElementById('pwm-set-duty').value = val;
}

function syncDutyFromInput(val) {
    var v = Math.max(0, Math.min(100, parseInt(val) || 0));
    document.getElementById('pwm-set-duty-range').value = v;
}

function syncFreqFromRange(val) {
    document.getElementById('pwm-set-freq').value = val;
}

function syncFreqFromInput(val) {
    var v = Math.max(1, Math.min(100000, parseInt(val) || 1));
    document.getElementById('pwm-set-freq-range').value = v;
}

// ===== UART =====

async function loadUartPorts() {
    try {
        const resp = await apiCall('/gpio/uart/ports');
        const ports = resp.ports || [];
        const select = document.getElementById('uart-port-select');
        if (!select) return;

        const current = select.value;
        select.innerHTML = '<option value="">-- Select port --</option>';
        for (const port of ports) {
            const opt = document.createElement('option');
            opt.value = port;
            opt.textContent = port;
            select.appendChild(opt);
        }

        if (current && ports.includes(current)) {
            select.value = current;
            onUartPortSelected();
        }
    } catch (e) {
        console.error('Error loading UART ports:', e);
    }
}

async function onUartPortSelected() {
    const select = document.getElementById('uart-port-select');
    const details = document.getElementById('uart-port-details');
    const toggle = document.getElementById('uart-status-toggle');
    const label = document.getElementById('uart-status-label');
    const icon = document.getElementById('uart-status-icon');
    if (!select || !details) return;

    const configSection = document.getElementById('uart-config-section');
    const configGrid = document.getElementById('uart-config-grid');
    if (!select.value) {
        if (configGrid) configGrid.style.display = 'flex';
        if (toggle) { toggle.checked = false; }
        if (label) { label.textContent = 'Closed'; }
        if (icon) { icon.style.color = 'var(--text-muted)'; }
        const ioSection = document.getElementById('uart-io-section');
        if (ioSection) ioSection.style.display = 'none';
        return;
    }

    if (configGrid) configGrid.style.display = 'flex';

    try {
        const cfg = await apiCall(`/gpio/uart/config?port=${encodeURIComponent(select.value)}`);
        document.getElementById('uart-baudrate').value = cfg.baudrate || 115200;
        document.getElementById('uart-data-bits').value = cfg.dataBits || 8;
        document.getElementById('uart-parity').value = (cfg.parity || 'none').toLowerCase();
        document.getElementById('uart-stop-bits').value = cfg.stopBits || '1';
        document.getElementById('uart-flow').value = (cfg.flowControl || 'none').toLowerCase();
    } catch (e) {
        // Port not open or error — use defaults
        document.getElementById('uart-baudrate').value = 115200;
        document.getElementById('uart-data-bits').value = 8;
        document.getElementById('uart-parity').value = 'none';
        document.getElementById('uart-stop-bits').value = '1';
        document.getElementById('uart-flow').value = 'none';
    }
    // Always default to Closed — user must explicitly open
    if (toggle) { toggle.checked = false; }
    if (label) { label.textContent = 'Closed'; }
    if (icon) { icon.style.color = 'var(--text-muted)'; }
    const ioSection = document.getElementById('uart-io-section');
    if (ioSection) ioSection.style.display = 'none';
    uartStopListen();
}

async function onUartToggleChanged(el) {
    const port = getSelectedUartPort();
    if (!port) { el.checked = !el.checked; return; }

    const label = document.getElementById('uart-status-label');
    const icon = document.getElementById('uart-status-icon');

    if (el.checked) {
        const baudrate = parseInt(document.getElementById('uart-baudrate').value) || 115200;
        const dataBits = parseInt(document.getElementById('uart-data-bits').value) || 8;
        const parity = document.getElementById('uart-parity').value;
        const stopBits = document.getElementById('uart-stop-bits').value;
        const flowControl = document.getElementById('uart-flow').value;

        try {
            const resp = await fetch('/api/gpio/uart/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port, baudrate, dataBits, parity, stopBits, flowControl })
            });
            if (!resp.ok) throw new Error(await resp.text());
            const data = await resp.json();
            if (!data.success) throw new Error('Open failed');
            const cfgStr = uartFormatConfigString(baudrate, dataBits, parity, stopBits, flowControl);
            label.textContent = `Open (${cfgStr})`;
            icon.style.color = 'var(--success)';
            const ioSection = document.getElementById('uart-io-section');
            if (ioSection) ioSection.style.display = 'block';
            const configSection = document.getElementById('uart-config-section');
            if (configSection) configSection.style.display = 'none';
            uartStartListen(port);
            showNotification(`${port} opened`, 'success');
        } catch (e) {
            el.checked = false;
            label.textContent = 'Closed';
            icon.style.color = 'var(--text-muted)';
            showNotification(`Error: ${e.message}`, 'error');
        }
    } else {
        try {
            const resp = await fetch('/api/gpio/uart/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port })
            });
            if (!resp.ok) throw new Error(await resp.text());
            const data = await resp.json();
            if (!data.success) throw new Error('Close failed');
            label.textContent = 'Closed';
            icon.style.color = 'var(--text-muted)';
            uartStopListen();
            const ioSection = document.getElementById('uart-io-section');
            if (ioSection) ioSection.style.display = 'none';
            const configSection = document.getElementById('uart-config-section');
            if (configSection) configSection.style.display = '';
            showNotification(`${port} closed`, 'success');
        } catch (e) {
            el.checked = true;
            label.textContent = 'Open';
            icon.style.color = 'var(--success)';
            showNotification(`Error: ${e.message}`, 'error');
        }
    }
}

function getSelectedUartPort() {
    const select = document.getElementById('uart-port-select');
    if (!select || !select.value) {
        showNotification('Select port first', 'error');
        return null;
    }
    return select.value;
}

function uartFormatConfigString(baudrate, dataBits, parity, stopBits, flowControl) {
    const p = (parity || 'none').toLowerCase();
    const parLetter = p === 'even' ? 'E' : (p === 'odd' ? 'O' : 'N');
    const base = `${baudrate || 115200}, ${dataBits || 8}${parLetter}${stopBits || 1}`;
    const flow = (flowControl || 'none').toLowerCase();
    if (flow === 'rtscts') return base + ', RTS/CTS';
    if (flow === 'xonxoff') return base + ', XON/XOFF';
    return base;
}

let uartEventSource = null;
/** Buffer bytes until a newline or a short idle (debounce) — avoids one RX log line per gRPC chunk. */
let uartRxBuffer = [];
let uartRxDebounceTimer = null;
const UART_RX_DEBOUNCE_MS = 64;
const UART_RX_MAX_BUFFER = 65536;
/** Last plain-text command; used to hide one duplicate local-echo line on RX. */
let uartLastTxEchoSuppress = null;

/** Strip common CSI/OSC from the shell (e.g. \\x1b[?2004l bracketed paste) so ESC does not show as dots. */
function uartStripAnsiForDisplay(s) {
    if (!s || typeof s !== 'string') return '';
    return s
        .replace(/\x1b\[[0-9;?><]*[a-zA-Z~]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b\][^\x1b]*\x1b\\/g, '');
}

function uartFormatRxTextForLog(bytes) {
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    let t = uartStripAnsiForDisplay(raw);
    t = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    return t.trimEnd();
}

/** Echo-suppress comparison: UTF-8, no ANSI, no \\r/\\n. */
function uartRxBytesToComparableCmd(bytes) {
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const stripped = uartStripAnsiForDisplay(raw);
    return stripped.replace(/\r/g, '').replace(/\n/g, '').trim();
}

/** Map \\r\\n and lone \\r to \\n before splitting lines (terminal-style). */
function uartNormalizeNewlinesToLF(arr) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === 0x0d && i + 1 < arr.length && arr[i + 1] === 0x0a) {
            result.push(0x0a);
            i++;
        } else if (arr[i] === 0x0d) {
            result.push(0x0a);
        } else {
            result.push(arr[i]);
        }
    }
    return result;
}

function uartEscapeForLog(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function uartParseHex(s) {
    if (!s || typeof s !== 'string') return [];
    const out = [];
    const str = s.replace(/0x/gi, '').replace(/\s+/g, '');
    for (let i = 0; i + 2 <= str.length; i += 2) {
        const byte = parseInt(str.substr(i, 2), 16);
        if (!isNaN(byte)) out.push(byte);
    }
    return out;
}

function uartBytesToHex(bytes) {
    if (!bytes || !bytes.length) return '';
    return Array.from(bytes).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join(' ');
}

function uartAppendLog(dir, textOrBytes) {
    const log = document.getElementById('uart-log');
    if (!log) return;
    const mode = document.getElementById('uart-log-mode')?.value || 'text';
    let displayText;
    if (dir === 'RX' && textOrBytes instanceof Uint8Array) {
        if (mode !== 'hex' && uartLastTxEchoSuppress !== null) {
            if (uartRxBytesToComparableCmd(textOrBytes) === uartLastTxEchoSuppress) {
                uartLastTxEchoSuppress = null;
                return;
            }
        }
        if (mode === 'hex') {
            displayText = uartBytesToHex(textOrBytes);
        } else {
            displayText = uartFormatRxTextForLog(textOrBytes);
            if (displayText === '') return;
        }
    } else {
        displayText = (typeof textOrBytes === 'string') ? textOrBytes : String(textOrBytes);
        if (dir === 'RX' && uartLastTxEchoSuppress !== null) {
            const a = displayText.replace(/\r/g, '').replace(/\n/g, '').trim();
            if (a === uartLastTxEchoSuppress) {
                uartLastTxEchoSuppress = null;
                return;
            }
        }
    }
    const line = document.createElement('div');
    line.className = 'uart-log-line';
    const content = document.createElement('span');
    content.className = dir === 'TX' ? 'uart-log-tx' : 'uart-log-rx';
    content.textContent = displayText || '[empty]';
    content.style.wordBreak = 'break-all';
    line.appendChild(content);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function uartUpdateTxPlaceholder() {
    const input = document.getElementById('uart-write-data');
    const mode = document.getElementById('uart-tx-mode')?.value || 'text';
    const lineEnd = document.getElementById('uart-tx-line-ending');
    if (input) input.placeholder = mode === 'hex' ? '48 65 6C or 0x48656C...' : 'Enter text to send...';
    if (lineEnd) lineEnd.disabled = mode === 'hex';
}

/** Extra bytes appended after the field in Text mode (none / LF / CR / CRLF). */
function uartTxLineEndingSuffix() {
    const v = document.getElementById('uart-tx-line-ending')?.value || 'none';
    if (v === 'lf') return '\n';
    if (v === 'cr') return '\r';
    if (v === 'crlf') return '\r\n';
    return '';
}

function uartStartListen(port) {
    uartStopListen();
    uartRxBuffer = [];
    const url = `/api/gpio/uart/listen?port=${encodeURIComponent(port)}`;
    uartEventSource = new EventSource(url);
    uartEventSource.onmessage = (e) => {
        try {
            const obj = JSON.parse(e.data);
            if (obj.data) {
                try {
                    const decoded = atob(obj.data);
                    const bytes = new Uint8Array(decoded.length);
                    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
                    uartFlushRxChunk(bytes);
                } catch (_) {
                    uartAppendLog('RX', '[binary]');
                }
            }
        } catch (_) {}
    };
    uartEventSource.onerror = () => {
        console.warn('UART listen (SSE) ended or failed — check port open, gRPC, and permissions.');
        uartStopListen();
    };
}

/** Flush complete lines (LF); remainder stays in uartRxBuffer for debounce or next chunk. */
function uartDrainRxCompleteLines() {
    uartRxBuffer = uartNormalizeNewlinesToLF(uartRxBuffer);
    const LF = 0x0A;
    let start = 0;
    for (let i = 0; i < uartRxBuffer.length; i++) {
        if (uartRxBuffer[i] === LF) {
            let lineBytes = uartRxBuffer.slice(start, i);
            while (lineBytes.length > 0 && (lineBytes[lineBytes.length - 1] === 0x0D || lineBytes[lineBytes.length - 1] === 0x0A)) {
                lineBytes.pop();
            }
            if (lineBytes.length > 0) {
                uartAppendLog('RX', new Uint8Array(lineBytes));
            }
            start = i + 1;
        }
    }
    uartRxBuffer = uartRxBuffer.slice(start);
}

function uartScheduleRxDebounceFlush() {
    if (uartRxDebounceTimer) clearTimeout(uartRxDebounceTimer);
    uartRxDebounceTimer = setTimeout(() => {
        uartRxDebounceTimer = null;
        if (uartRxBuffer.length > 0) {
            uartAppendLog('RX', new Uint8Array(uartRxBuffer));
            uartRxBuffer = [];
        }
    }, UART_RX_DEBOUNCE_MS);
}

function uartFlushRxChunk(bytes) {
    if (bytes.length === 0) return;
    uartRxBuffer = uartRxBuffer.concat(Array.from(bytes));
    if (uartRxBuffer.length > UART_RX_MAX_BUFFER) {
        if (uartRxDebounceTimer) {
            clearTimeout(uartRxDebounceTimer);
            uartRxDebounceTimer = null;
        }
        uartAppendLog('RX', new Uint8Array(uartRxBuffer));
        uartRxBuffer = [];
        return;
    }
    if (uartRxDebounceTimer) {
        clearTimeout(uartRxDebounceTimer);
        uartRxDebounceTimer = null;
    }
    uartDrainRxCompleteLines();
    if (uartRxBuffer.length > 0) {
        uartScheduleRxDebounceFlush();
    }
}

function uartStopListen() {
    uartLastTxEchoSuppress = null;
    if (uartRxDebounceTimer) {
        clearTimeout(uartRxDebounceTimer);
        uartRxDebounceTimer = null;
    }
    if (uartRxBuffer.length > 0) {
        uartDrainRxCompleteLines();
        if (uartRxBuffer.length > 0) {
            uartAppendLog('RX', new Uint8Array(uartRxBuffer));
            uartRxBuffer = [];
        }
    }
    if (uartEventSource) {
        uartEventSource.close();
        uartEventSource = null;
    }
}

function uartExportLog() {
    const log = document.getElementById('uart-log');
    if (!log) return;
    const lines = [];
    for (const line of log.querySelectorAll('.uart-log-line')) {
        const t = line.textContent;
        if (t) lines.push(t);
    }
    const text = lines.join('\n');
    if (!text) {
        showNotification('Log is empty', 'error');
        return;
    }
    const d = new Date();
    const fn = `uart_log_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fn;
    a.click();
    URL.revokeObjectURL(a.href);
    showNotification('Log exported', 'success');
}

function uartClearLog() {
    const log = document.getElementById('uart-log');
    if (log) log.innerHTML = '';
}

async function uartWrite() {
    const port = getSelectedUartPort();
    if (!port) return;

    const txMode = document.getElementById('uart-tx-mode')?.value || 'text';
    const input = document.getElementById('uart-write-data').value;
    if (txMode === 'hex') {
        if (!input) {
            showNotification('Enter hex bytes (e.g. 48 65 6C)', 'error');
            return;
        }
    } else {
        const suf = uartTxLineEndingSuffix();
        if (!input && !suf) {
            showNotification('Enter text to send or choose LF/CR/CRLF', 'error');
            return;
        }
    }

    let data, hex, logDisplay;
    if (txMode === 'hex') {
        const bytes = uartParseHex(input);
        if (!bytes.length) {
            showNotification('Invalid hex (e.g. 48 65 6C or 0x48656C)', 'error');
            return;
        }
        data = input.replace(/0x/gi, '').replace(/\s+/g, '');
        hex = true;
        logDisplay = uartBytesToHex(bytes);
    } else {
        const suffix = uartTxLineEndingSuffix();
        data = input + suffix;
        hex = false;
        logDisplay = input;
    }

    // Set echo-suppress before await: echo can arrive over SSE while fetch is still in flight.
    if (txMode === 'hex') {
        uartLastTxEchoSuppress = null;
    } else {
        uartLastTxEchoSuppress = input.trim();
    }

    try {
        const resp = await fetch('/api/gpio/uart/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port, data, hex })
        });
        if (!resp.ok) {
            uartLastTxEchoSuppress = null;
            throw new Error(await resp.text());
        }
        const result = await resp.json();
        uartAppendLog('TX', logDisplay);
        showNotification(`Sent ${result.bytesWritten || 0} bytes`, 'success');
        document.getElementById('uart-write-data').value = '';
    } catch (e) {
        uartLastTxEchoSuppress = null;
        showNotification(`Error: ${e.message}`, 'error');
    }
}

// ===== I2C =====

async function loadI2CBuses() {
    const select = document.getElementById('i2c-bus-select');
    if (!select) return;
    try {
        const resp = await apiCall('/gpio/i2c/buses');
        const buses = resp.buses || [];
        const current = select.value;
        select.innerHTML = '<option value="">-- Select bus --</option>';
        for (const bus of buses) {
            const opt = document.createElement('option');
            opt.value = bus;
            opt.textContent = `I2C-${bus}`;
            select.appendChild(opt);
        }
        if (current && buses.some(b => String(b) === current)) {
            select.value = current;
            onI2CBusSelected();
        }
    } catch (e) {
        console.error('Error loading I2C buses:', e);
        select.innerHTML = '<option value="">-- Select bus --</option>';
        showNotification('I2C not available: ' + (e.message || e), 'error');
    }
}

async function onI2CBusSelected() {
    const select = document.getElementById('i2c-bus-select');
    if (!select || !select.value) return;

    try {
        const cfg = await apiCall(`/gpio/i2c/config?bus=${select.value}`);
        document.getElementById('i2c-clock-hz').value = cfg.clockHz || 400000;
        document.getElementById('i2c-ten-bit').value = cfg.tenBitAddr ? 'true' : 'false';
        document.getElementById('i2c-clock-stretch').value = cfg.clockStretching ? 'true' : 'false';
    } catch (e) {
        document.getElementById('i2c-clock-hz').value = 400000;
        document.getElementById('i2c-ten-bit').value = 'false';
        document.getElementById('i2c-clock-stretch').value = 'true';
    }
}

async function i2cScanBus() {
    const bus = document.getElementById('i2c-bus-select').value;
    if (!bus) {
        showNotification('Select I2C bus first', 'error');
        return;
    }
    const btn = document.getElementById('i2c-scan-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...'; }
    try {
        const resp = await apiCall(`/gpio/i2c/scan?bus=${bus}`);
        const addrs = resp.addresses || [];
        i2cAppendLog('SCAN', `Bus ${bus}: ${addrs.length} device(s) found: ${addrs.map(a => '0x' + a.toString(16)).join(', ') || 'none'}`);
    } catch (e) {
        i2cAppendLog('SCAN', `Bus ${bus}: Error - ${e.message}`);
        showNotification(`Error: ${e.message}`, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Scan'; }
}

async function i2cApplyConfig() {
    const bus = document.getElementById('i2c-bus-select').value;
    if (!bus) {
        showNotification('Select I2C bus first', 'error');
        return;
    }
    const clockHz = parseInt(document.getElementById('i2c-clock-hz').value) || 400000;
    const tenBitAddr = document.getElementById('i2c-ten-bit').value === 'true';
    const clockStretching = document.getElementById('i2c-clock-stretch').value === 'true';
    try {
        const resp = await fetch('/api/gpio/i2c/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bus: parseInt(bus), clockHz, tenBitAddr, clockStretching })
        });
        if (!resp.ok) throw new Error(await resp.text());
        showNotification('I2C config applied', 'success');
    } catch (e) {
        showNotification(`Error: ${e.message}`, 'error');
    }
}

async function i2cTransfer() {
    const bus = document.getElementById('i2c-bus-select').value;
    const addrStr = document.getElementById('i2c-address').value.trim();
    const dataStr = document.getElementById('i2c-write-data').value.trim();
    const readLen = parseInt(document.getElementById('i2c-read-length').value) || 0;

    if (!bus) {
        showNotification('Select I2C bus first', 'error');
        return;
    }
    if (!addrStr) {
        showNotification('Enter device address (hex, e.g. 0x48)', 'error');
        return;
    }
    const addr = addrStr.startsWith('0x') ? parseInt(addrStr, 16) : parseInt(addrStr, 16);
    if (isNaN(addr) || addr < 0 || addr > 0x7f) {
        showNotification('Invalid 7-bit address', 'error');
        return;
    }

    try {
        const resp = await fetch('/api/gpio/i2c/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bus: parseInt(bus),
                address: addr,
                data: dataStr || '',
                readLength: readLen
            })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        if (dataStr) i2cAppendLog('TX', dataStr);
        if (result.data) i2cAppendLog('RX', result.data); else if (readLen > 0 && !result.data) i2cAppendLog('RX', '(empty)');
        showNotification('Transfer complete', 'success');
    } catch (e) {
        i2cAppendLog('ERR', e.message);
        showNotification(`Error: ${e.message}`, 'error');
    }
}

function i2cAppendLog(dir, text) {
    const log = document.getElementById('i2c-log');
    if (!log) return;
    const line = document.createElement('div');
    line.className = 'uart-log-line';
    const content = document.createElement('span');
    if (dir === 'TX') content.className = 'uart-log-tx';
    else if (dir === 'RX') content.className = 'uart-log-rx';
    else content.className = 'peripheral-log-meta';
    content.textContent = text;
    content.style.wordBreak = 'break-all';
    line.appendChild(content);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function i2cExportLog() {
    const log = document.getElementById('i2c-log');
    if (!log) return;
    const lines = [];
    for (const line of log.querySelectorAll('.uart-log-line')) {
        const t = line.textContent;
        if (t) lines.push(t);
    }
    const text = lines.join('\n');
    if (!text) { showNotification('Log is empty', 'error'); return; }
    const d = new Date();
    const fn = `i2c_log_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fn;
    a.click();
    URL.revokeObjectURL(a.href);
    showNotification('Log exported', 'success');
}

function i2cClearLog() {
    const log = document.getElementById('i2c-log');
    if (log) log.innerHTML = '';
}

// ===== SPI =====

async function loadSpiDevices() {
    try {
        const resp = await apiCall('/gpio/spi/devices');
        const devices = resp.devices || [];
        const select = document.getElementById('spi-device-select');
        if (!select) return;

        const current = select.value;
        select.innerHTML = '<option value="">-- Select device --</option>';
        for (const dev of devices) {
            const opt = document.createElement('option');
            opt.value = dev;
            opt.textContent = dev;
            select.appendChild(opt);
        }

        if (current) {
            select.value = current;
            onSpiDeviceSelected();
        }
    } catch (e) {
        console.error('Error loading SPI devices:', e);
    }
}

function onSpiSpeedPresetChange() {
    const sel = document.getElementById('spi-speed-preset');
    const inp = document.getElementById('spi-max-speed-hz');
    if (!sel || !inp || !sel.value) return;
    inp.value = sel.value;
    sel.value = '';
}

function parseSpiDevice(dev) {
    // e.g. spidev0.0 -> bus=0, cs=0
    const m = (dev || '').match(/spidev(\d+)\.(\d+)/);
    return m ? { bus: parseInt(m[1]), chipSelect: parseInt(m[2]) } : null;
}

async function onSpiDeviceSelected() {
    const select = document.getElementById('spi-device-select');
    if (!select || !select.value) return;

    const p = parseSpiDevice(select.value);
    if (!p) return;

    try {
        const cfg = await apiCall(`/gpio/spi/config?bus=${p.bus}&chipSelect=${p.chipSelect}`);
        const hzEl = document.getElementById('spi-max-speed-hz');
        if (hzEl) hzEl.value = String(cfg.maxSpeedHz != null ? cfg.maxSpeedHz : 1000000);
        document.getElementById('spi-bits').value = cfg.bitsPerWord || 8;
        document.getElementById('spi-lsb-first').value = cfg.lsbFirst ? 'true' : 'false';
        document.getElementById('spi-mode').value = String(cfg.mode ?? 0);
    } catch (e) {
        const hzEl = document.getElementById('spi-max-speed-hz');
        if (hzEl) hzEl.value = '1000000';
        document.getElementById('spi-bits').value = 8;
        document.getElementById('spi-lsb-first').value = 'false';
        document.getElementById('spi-mode').value = 0;
    }
}

/** POST /api/gpio/spi/config from current form; throws on failure (Transfer calls this every time — hardware was never configured before). */
async function postSpiConfigFromForm() {
    const select = document.getElementById('spi-device-select');
    if (!select || !select.value) {
        throw new Error('Select SPI device first');
    }
    const p = parseSpiDevice(select.value);
    if (!p) throw new Error('Invalid SPI device');

    const hzIn = document.getElementById('spi-max-speed-hz');
    const maxSpeedHz = Math.max(1, parseInt(hzIn && hzIn.value, 10) || 1000000);
    const bitsPerWord = parseInt(document.getElementById('spi-bits').value, 10) || 8;
    const lsbFirst = document.getElementById('spi-lsb-first').value === 'true';
    const mode = parseInt(document.getElementById('spi-mode').value, 10) || 0;

    const resp = await fetch('/api/gpio/spi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            bus: p.bus,
            chipSelect: p.chipSelect,
            maxSpeedHz,
            bitsPerWord,
            lsbFirst,
            mode
        })
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(text || `HTTP ${resp.status}`);
    let j;
    try {
        j = JSON.parse(text);
    } catch {
        j = {};
    }
    if (j.success === false) throw new Error('SPI config rejected by server');
}

async function spiTransfer() {
    const select = document.getElementById('spi-device-select');
    if (!select || !select.value) {
        showNotification('Select SPI device first', 'error');
        return;
    }
    const p = parseSpiDevice(select.value);
    if (!p) return;

    const dataStr = document.getElementById('spi-write-data').value.trim();
    const readLen = parseInt(document.getElementById('spi-read-length').value, 10) || 0;

    try {
        await postSpiConfigFromForm();

        const resp = await fetch('/api/gpio/spi/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bus: p.bus,
                chipSelect: p.chipSelect,
                dataOut: dataStr || '',
                readLength: readLen
            })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const result = await resp.json();
        if (dataStr) spiAppendLog('TX', dataStr);
        if (result.data) spiAppendLog('RX', result.data);
        showNotification('Transfer complete', 'success');
    } catch (e) {
        spiAppendLog('ERR', e.message);
        showNotification(`Error: ${e.message}`, 'error');
    }
}

function spiAppendLog(dir, text) {
    const log = document.getElementById('spi-log');
    if (!log) return;
    const line = document.createElement('div');
    line.className = 'uart-log-line';
    const content = document.createElement('span');
    if (dir === 'TX') content.className = 'uart-log-tx';
    else if (dir === 'RX') content.className = 'uart-log-rx';
    else content.className = 'peripheral-log-meta';
    content.textContent = text;
    content.style.wordBreak = 'break-all';
    line.appendChild(content);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function spiExportLog() {
    const log = document.getElementById('spi-log');
    if (!log) return;
    const lines = [];
    for (const line of log.querySelectorAll('.uart-log-line')) {
        const t = line.textContent;
        if (t) lines.push(t);
    }
    const text = lines.join('\n');
    if (!text) { showNotification('Log is empty', 'error'); return; }
    const d = new Date();
    const fn = `spi_log_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fn;
    a.click();
    URL.revokeObjectURL(a.href);
    showNotification('Log exported', 'success');
}

function spiClearLog() {
    const log = document.getElementById('spi-log');
    if (log) log.innerHTML = '';
}

// ===== Helpers =====

// showNotification is now provided globally by core.js

function refreshCurrentPage() {
    loadGpioPins();
    loadPwmPins();
    loadUartPorts();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    loadGpioPins();
    loadPwmPins();
    loadUartPorts();

    const uartTxInput = document.getElementById('uart-write-data');
    if (uartTxInput) {
        uartTxInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                uartWrite();
            }
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopGpioTablePolling();
        } else if (isGpioTabActive()) {
            startGpioTablePolling();
            refreshGpioTableStates();
        }
    });
    window.addEventListener('pagehide', stopGpioTablePolling);
});
