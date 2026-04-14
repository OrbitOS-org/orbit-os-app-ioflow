// Shared real-time log viewer (SSE) — used by Developer > Logs tab

let eventSource = null;
let logCount = 0;
let maxLogs = 500;
let reconnectTimer = null;
let logEntries = [];
let logEntryBuffer = [];
let flushScheduled = false;
let logViewerStylesInjected = false;

const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
    FATAL: 4
};

function getLevelClass(level) {
    switch (Number(level)) {
        case LogLevel.DEBUG:   return 'log-debug';
        case LogLevel.INFO:    return 'log-info';
        case LogLevel.WARNING: return 'log-warning';
        case LogLevel.ERROR:   return 'log-error';
        case LogLevel.FATAL:   return 'log-fatal';
        default: return 'log-debug';
    }
}

function getLevelBadge(levelName) {
    const colors = {
        'DEBUG':   '#6c757d',
        'INFO':    '#17a2b8',
        'WARNING': '#ffc107',
        'ERROR':   '#dc3545',
        'FATAL':   '#8b0000'
    };
    const color = colors[levelName] || '#6c757d';
    return `<span style="color:${color};font-weight:600;font-size:0.7rem;">${levelName}</span>`;
}

function formatLogTimestamp(timestampMs) {
    if (!timestampMs) return '--:--:--';
    const d = new Date(timestampMs);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createLogLineElement(entry) {
    const line = document.createElement('div');
    line.className = `log-line ${getLevelClass(entry.level)}`;
    line.innerHTML = `<span class="log-time">${formatLogTimestamp(entry.timestampMs)}</span> ${getLevelBadge(entry.levelName)} <span class="log-app">${escapeHtml(entry.app || '—')}</span>${entry.tag ? `<span class="log-tag">[${escapeHtml(entry.tag)}]</span>` : ''} <span class="log-msg">${escapeHtml(entry.message)}</span>`;
    return line;
}

function flushLogBuffer() {
    flushScheduled = false;
    if (logEntryBuffer.length === 0) return;

    const container = document.getElementById('log-entries');
    const emptyMsg = document.getElementById('log-empty');
    if (!container) { logEntryBuffer = []; return; }

    if (emptyMsg) emptyMsg.style.display = 'none';

    const batch = logEntryBuffer.splice(0, 50);
    const fragment = document.createDocumentFragment();
    for (const entry of batch) {
        fragment.appendChild(createLogLineElement(entry));
        logEntries.push(entry);
    }
    container.appendChild(fragment);
    logCount = logEntries.length;

    while (logEntries.length > maxLogs) {
        container.removeChild(container.firstChild);
        logEntries.shift();
        logCount--;
    }

    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = logCount + ' entries';

    const autoScroll = document.getElementById('log-autoscroll');
    if (autoScroll && autoScroll.checked) {
        const logContainer = document.getElementById('log-container');
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    }

    if (logEntryBuffer.length > 0) {
        flushScheduled = true;
        requestAnimationFrame(flushLogBuffer);
    }
}

function queueLogEntry(entry) {
    logEntryBuffer.push(entry);
    if (!flushScheduled) {
        flushScheduled = true;
        requestAnimationFrame(flushLogBuffer);
    }
}

function setLogStreamStatus(connected) {
    const el = document.getElementById('log-status');
    if (!el) return;
    if (connected) {
        el.className = 'status-badge status-connected';
        el.textContent = 'Connected';
    } else {
        el.className = 'status-badge status-disconnected';
        el.textContent = 'Disconnected';
    }
}

function connectSSE() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }

    const level = document.getElementById('log-level-filter')?.value || '0';
    const app = document.getElementById('log-app-filter')?.value || '';
    const tag = document.getElementById('log-tag-filter')?.value || '';

    let url = `/api/logs/stream?level=${level}`;
    if (app) url += `&app=${encodeURIComponent(app)}`;
    if (tag) url += `&tag=${encodeURIComponent(tag)}`;

    eventSource = new EventSource(url);

    eventSource.onopen = function() {
        setLogStreamStatus(true);
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };

    eventSource.onmessage = function(event) {
        try {
            const entry = JSON.parse(event.data);
            queueLogEntry(entry);
        } catch (e) {
            console.error('Failed to parse log entry:', e);
        }
    };

    eventSource.onerror = function() {
        setLogStreamStatus(false);
        eventSource.close();
        eventSource = null;
        reconnectTimer = setTimeout(connectSSE, 3000);
    };
}

function disconnectSSE() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    setLogStreamStatus(false);
}

let filterDebounce = null;
function applyFilters() {
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(function() {
        clearLogs();
        connectSSE();
    }, 500);
}

function clearLogs() {
    const container = document.getElementById('log-entries');
    if (container) container.innerHTML = '';
    logEntries = [];
    logEntryBuffer = [];
    logCount = 0;
    flushScheduled = false;
    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = '0 entries';
    const emptyMsg = document.getElementById('log-empty');
    if (emptyMsg) emptyMsg.style.display = '';
}

function exportLogs() {
    if (logEntries.length === 0) {
        showNotification('No logs to export', 'error');
        return;
    }

    const lines = logEntries.map(function(e) {
        var ts = formatLogTimestamp(e.timestampMs);
        var pad = (e.levelName || 'UNKNOWN').padEnd(7);
        var app = e.app || '—';
        var tag = e.tag ? '[' + e.tag + '] ' : '';
        return ts + '  ' + pad + '  ' + app + '  ' + tag + e.message;
    });

    var content = lines.join('\n');
    var blob = new Blob([content], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var now = new Date();
    var filename = 'logs_' + now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0') + '.log';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Exported ' + logEntries.length + ' entries', 'success');
}

function injectLogViewerStyles() {
    if (logViewerStylesInjected) return;
    logViewerStylesInjected = true;
    const style = document.createElement('style');
    style.id = 'log-viewer-styles';
    style.textContent = `
        .log-line {
            padding: 2px 8px;
            border-bottom: 1px solid rgba(255,255,255,0.02);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .log-line:hover {
            background: rgba(255,255,255,0.03);
        }
        .log-time {
            color: var(--text-muted);
            flex-shrink: 0;
        }
        .log-app {
            color: var(--primary);
            font-weight: 500;
            flex-shrink: 0;
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .log-tag {
            color: var(--text-secondary);
            flex-shrink: 0;
        }
        .log-msg {
            color: var(--text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .log-debug .log-msg { color: var(--text-muted); }
        .log-info .log-msg { color: var(--text-primary); }
        .log-warning .log-msg { color: #ffc107; }
        .log-error .log-msg { color: #dc3545; }
        .log-fatal .log-msg { color: #ff4444; font-weight: 700; }
        .log-fatal { background: rgba(139,0,0,0.1); }
    `;
    document.head.appendChild(style);
}

/** Call when the Logs tab becomes visible */
function initLogViewer() {
    injectLogViewerStyles();
    connectSSE();
}

function refreshLogViewer() {
    clearLogs();
    connectSSE();
}

window.addEventListener('beforeunload', disconnectSSE);
