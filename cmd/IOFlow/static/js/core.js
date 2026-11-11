'use strict';
// Opened through the Launcher at /ioflow, the API is proxied at /ioflow/api, not
// /api at the site root (that would reach the portal and answer HTML).
const API_BASE = (location.pathname === '/ioflow' || location.pathname.startsWith('/ioflow/')) ? '/ioflow/api' : '/api';

/** GET (no body) or POST (body) to the app API; throws with the server's message. */
async function api(path, body) {
    const opt = body === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
    const r = await fetch(API_BASE + path, opt);
    if (!r.ok) {
        const msg = (await r.text()).trim();
        throw new Error(msg || `HTTP ${r.status}`);
    }
    return r.headers.get('content-type')?.includes('application/json') ? r.json() : r.text();
}

let toastTimer = 0;
/** Short message at the bottom; errors stay a little longer. */
function toast(msg, isError) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' err' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2500);
}

const $ = (id) => document.getElementById(id);

/** Element from an HTML string (trusted templates only; values go through esc). */
function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
