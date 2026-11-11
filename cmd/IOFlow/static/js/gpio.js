'use strict';
// IOFlow page: GPIO, PWM, UART, I2C and SPI. Everything shown comes from the
// device's API, so the page is the same on every board. Pins are told apart by
// name (on some boards every pin has chip 0 line 0).

const OUT = 0, IN = 1;           // GpioDirection in the SDK
const POLL_MS = 1000;

// ===== tabs =====
const loaded = {};               // tab → loaded once
function showTab(name) {
    // The open tab goes in the address (#i2c): a reload or a saved link opens it again.
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.p === name));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'p-' + name));
    if (name === 'gpio') gpioStart(); else gpioStop();
    if (name === 'uart') uartLoad();            // ports can come and go: always
    else if (!loaded[name]) {
        loaded[name] = true;
        ({ pwm: pwmLoad, i2c: i2cLoad, spi: spiLoad })[name]?.();
    }
}
document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => showTab(t.dataset.p); });

$('theme').onclick = () => {
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light';   // dark by default
    try { localStorage.setItem('ioflow-theme', r.dataset.theme); } catch (_) { /* private mode */ }
};

// ===== header: board and what it has =====
async function header() {
    const [info, pins, pwm, uart, i2c, spi] = await Promise.allSettled([
        api('/gpio/info'), api('/gpio/pins'), api('/gpio/pwm/pins'),
        api('/gpio/uart/ports'), api('/gpio/i2c/buses'), api('/gpio/spi/devices'),
    ]);
    const v = (r, k) => (r.status === 'fulfilled' && r.value && r.value[k]) || [];
    const counts = {
        gpio: v(pins, 'pins').length, pwm: v(pwm, 'pins').length, uart: v(uart, 'ports').length,
        i2c: v(i2c, 'buses').length, spi: v(spi, 'devices').length,
    };
    const parts = [];
    if (info.status === 'fulfilled') {
        const b = [info.value.vendor, info.value.model].filter(Boolean).join(' ');
        if (b) parts.push(b);
    }
    const label = { gpio: 'GPIO', pwm: 'PWM', uart: 'UART', i2c: 'I²C', spi: 'SPI' };
    for (const k of Object.keys(label)) if (counts[k]) parts.push(`${counts[k]} ${label[k]}`);
    $('dev').textContent = parts.join(' · ') || ' ';
    // A tab with nothing on this board is hidden (GPIO always stays).
    for (const k of ['pwm', 'uart', 'i2c', 'spi']) {
        const settled = { pwm, uart, i2c, spi }[k];
        if (settled.status === 'fulfilled' && counts[k] === 0) {
            document.querySelector(`.tab[data-p="${k}"]`).hidden = true;
        }
    }
}

// ===== GPIO =====
const gpio = { pins: [], cards: new Map(), filter: 'all', timer: 0, run: 0, busy: new Map() };

async function gpioLoad() {
    try {
        const r = await api('/gpio/pins');
        gpio.pins = r.pins || [];
    } catch (e) {
        $('pins').innerHTML = `<p class="empty">Could not read the pins: ${esc(e.message)}</p>`;
        return;
    }
    const box = $('pins');
    box.innerHTML = '';
    if (!gpio.pins.length) { box.innerHTML = '<p class="empty">This board has no GPIO pins.</p>'; return; }
    for (const p of gpio.pins) {
        const c = el(`<div class="pin"><header><span class="n" title="${esc(p.name)}">${esc(p.name)}</span><span class="led"></span></header>
            <div class="seg"><button data-d="in" aria-pressed="false">In</button><button data-d="out" aria-pressed="false">Out</button></div>
            <div class="lvl"><b>—</b><button class="sw" role="switch" aria-checked="false" aria-label="${esc(p.name)} level" disabled></button></div></div>`);
        c.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => gpioSetDir(p, b.dataset.d === 'out' ? 'OUT' : 'IN'); });
        c.querySelector('.sw').onclick = () => gpioSetLevel(p);
        box.appendChild(c);
        gpio.cards.set(p.name, { el: c, dir: null, lvl: null });
    }
    await gpioRefresh();
}

function gpioPaint(name) {
    const c = gpio.cards.get(name);
    if (!c) return;
    // BUSY: the pin is taken by another function (a UART, PWM or SPI on the same
    // pins). It is not broken, so it is shown apart from a real error.
    const busy = !!c.err && /BUSY|in use/i.test(c.err);
    const out = c.dir === OUT, hi = c.lvl === 1, bad = !!c.err && !busy;
    c.el.classList.toggle('hi', hi && !bad);
    c.el.classList.toggle('bad', bad);
    c.el.classList.toggle('busy', busy);
    c.el.title = busy ? 'In use by another function on the same pins (UART, PWM or SPI).' : (c.err || '');
    const [bIn, bOut] = c.el.querySelectorAll('.seg button');
    bIn.setAttribute('aria-pressed', !busy && c.dir === IN);
    bOut.setAttribute('aria-pressed', !busy && out);
    bIn.disabled = bOut.disabled = busy;
    c.el.querySelector('.lvl b').textContent = busy ? 'Busy' : bad ? 'Error' : c.lvl === null ? '—' : hi ? 'HIGH' : 'LOW';
    const sw = c.el.querySelector('.sw');
    sw.setAttribute('aria-checked', hi);
    sw.disabled = !out || bad || busy;
    const f = gpio.filter;
    c.el.hidden = (f === 'out' && !out) || (f === 'in' && c.dir !== IN) || (f === 'hi' && !hi);
}

async function gpioRefresh() {
    let r;
    try {
        r = await api('/gpio/states');
    } catch (_) {
        $('live').classList.add('off');
        return;
    }
    $('live').classList.remove('off');
    const now = Date.now();
    for (const s of r.states || []) {
        const c = gpio.cards.get(s.name);
        if (!c || (gpio.busy.get(s.name) || 0) > now) continue;  // a change of ours is on its way
        c.err = s.error || '';
        if (!c.err) { c.dir = s.direction; c.lvl = s.level; }
        gpioPaint(s.name);
    }
}

// The next refresh leaves one second after the previous answer: requests never pile up.
function gpioStart() {
    gpioStop();
    if (!gpio.pins.length) return;
    $('live').hidden = false;
    const run = gpio.run;
    const tick = async () => {
        if (!document.hidden) await gpioRefresh();
        if (run === gpio.run) gpio.timer = setTimeout(tick, POLL_MS);
    };
    gpio.timer = setTimeout(tick, POLL_MS);
}
function gpioStop() {
    gpio.run++;
    clearTimeout(gpio.timer);
    $('live').hidden = true;
}
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('p-gpio').classList.contains('on')) gpioRefresh();
});

async function gpioSetDir(p, dir) {
    const c = gpio.cards.get(p.name);
    gpio.busy.set(p.name, Date.now() + 1500);
    const prev = c.dir;
    c.dir = dir === 'OUT' ? OUT : IN;
    gpioPaint(p.name);
    try {
        await api('/gpio/direction', { pinName: p.name, pinNumber: p.number, chipNumber: p.chipNumber || 0, direction: dir });
    } catch (e) {
        c.dir = prev;
        gpioPaint(p.name);
        toast(`${p.name}: ${e.message}`, true);
    }
    gpio.busy.delete(p.name);
}

async function gpioSetLevel(p) {
    const c = gpio.cards.get(p.name);
    const next = c.lvl === 1 ? 0 : 1;
    gpio.busy.set(p.name, Date.now() + 1500);
    const prev = c.lvl;
    c.lvl = next;
    gpioPaint(p.name);
    try {
        await api('/gpio/level', { pinName: p.name, pinNumber: p.number, chipNumber: p.chipNumber || 0, level: next ? 'HIGH' : 'LOW' });
    } catch (e) {
        c.lvl = prev;
        gpioPaint(p.name);
        toast(`${p.name}: ${e.message}`, true);
    }
    gpio.busy.delete(p.name);
}

document.querySelectorAll('.chip').forEach((ch) => {
    ch.onclick = () => {
        gpio.filter = ch.dataset.f;
        document.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === ch));
        for (const name of gpio.cards.keys()) gpioPaint(name);
    };
});

// ===== PWM =====
async function pwmLoad() {
    const box = $('pwms');
    let chans;
    try {
        chans = (await api('/gpio/pwm/pins')).pins || [];
    } catch (e) {
        box.innerHTML = `<p class="empty">Could not read the PWM channels: ${esc(e.message)}</p>`;
        return;
    }
    box.innerHTML = chans.length ? '' : '<p class="empty">This board has no PWM channels.</p>';
    for (const ch of chans) box.appendChild(pwmCard(ch));
}

function pwmCard(ch) {
    const c = el(`<div class="card"><h3><svg class="i"><use href="#ic-pwm"/></svg>${esc(ch.name)}<span class="sp"></span>
        <button class="sw" role="switch" aria-checked="false" aria-label="${esc(ch.name)} on or off"></button></h3>
        <svg class="wave" viewBox="0 0 300 46" preserveAspectRatio="none" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2"/></svg>
        <label class="f">Duty <b class="out dv">0%</b><input type="range" min="0" max="100" step="0.5" value="50"></label>
        <div class="row"><label class="f">Frequency (Hz)<input class="in fq" type="number" min="1" value="1000" style="width:130px"></label></div></div>`);
    const sw = c.querySelector('.sw'), range = c.querySelector('input[type=range]'), fq = c.querySelector('.fq');
    const path = c.querySelector('path'), dv = c.querySelector('.dv');
    const on = () => sw.getAttribute('aria-checked') === 'true';
    const draw = () => {
        const d = +range.value / 100, P = 60;
        let p = 'M0 40';
        if (on()) { for (let x = 0; x < 300; x += P) p += ` H${x} V${d > 0 ? 6 : 40} H${x + P * d} V40`; }
        path.setAttribute('d', p + ' H300');
        dv.textContent = range.value + '%';
    };
    const body = () => ({ pinName: ch.name, pinNumber: ch.number, dutyCycle: +range.value / 100, frequencyHz: +fq.value });
    const apply = async () => {
        if (!on()) return;
        try { await api('/gpio/pwm', body()); } catch (e) { toast(`${ch.name}: ${e.message}`, true); }
    };
    sw.onclick = async () => {
        const want = !on();
        try {
            if (want) await api('/gpio/pwm', body());
            else await api('/gpio/pwm/disable', { pinName: ch.name, pinNumber: ch.number });
            sw.setAttribute('aria-checked', want);
        } catch (e) { toast(`${ch.name}: ${e.message}`, true); }
        draw();
    };
    range.oninput = draw;
    range.onchange = apply;
    fq.onchange = apply;
    api(`/gpio/pwm?name=${encodeURIComponent(ch.name)}&number=${ch.number}`).then((s) => {
        sw.setAttribute('aria-checked', !!s.enabled);
        if (s.frequencyHz) fq.value = Math.round(s.frequencyHz);
        range.value = Math.round((s.dutyCycle || 0) * 1000) / 10;
        draw();
    }).catch(() => draw());
    draw();
    return c;
}

// ===== UART =====
const uart = { open: false, port: '', es: null, rx: [], rxTimer: 0, echo: null };

async function uartLoad() {
    let ports = [];
    try { ports = (await api('/gpio/uart/ports')).ports || []; } catch (e) { toast('UART: ' + e.message, true); }
    const sel = $('u-port'), cur = sel.value;
    sel.innerHTML = ports.length ? ports.map((p) => `<option>${esc(p)}</option>`).join('') : '<option value="">No ports</option>';
    if (ports.includes(cur)) sel.value = cur;
    else uartConfig();
    pickerTitle(sel);
}

async function uartConfig() {
    const port = $('u-port').value;
    if (!port) return;
    try {
        const c = await api('/gpio/uart/config?port=' + encodeURIComponent(port));
        if (c.baudrate) $('u-baud').value = String(c.baudrate);
        if (c.dataBits) $('u-data').value = String(c.dataBits);
        $('u-parity').value = (c.parity || 'none').toLowerCase();
        $('u-stop').value = c.stopBits || '1';
        $('u-flow').value = (c.flowControl || 'none').toLowerCase();
    } catch (_) { /* keep the form */ }
}
$('u-port').onchange = async () => { if (uart.open) await uartClose(); uartConfig(); };

function uartState(open) {
    uart.open = open;
    $('u-open').setAttribute('aria-checked', open);
    $('u-state').textContent = open ? 'Open' : 'Closed';
    $('u-tx').disabled = $('u-send').disabled = !open;
    for (const id of ['u-port', 'u-baud', 'u-data', 'u-parity', 'u-stop', 'u-flow']) $(id).disabled = open;
}

async function uartOpen() {
    const port = $('u-port').value;
    if (!port) return;
    try {
        await api('/gpio/uart/open', {
            port, baudrate: +$('u-baud').value, dataBits: +$('u-data').value,
            parity: $('u-parity').value, stopBits: $('u-stop').value, flowControl: $('u-flow').value,
        });
    } catch (e) { toast(`${port}: ${e.message}`, true); return; }
    uart.port = port;
    uartState(true);
    uartLine('t', `${port} open`);
    uart.es = new EventSource(`${API_BASE}/gpio/uart/listen?port=${encodeURIComponent(port)}`);
    uart.es.onmessage = (ev) => {
        let o;
        try { o = JSON.parse(ev.data); } catch (_) { return; }
        if (o.error) { uartLine('er', o.error); return; }
        if (!o.data) return;
        const s = atob(o.data), b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        uartRx(b);
    };
    // The page never closes the port because receiving stopped: other tabs may be
    // using it. A stream that ended is opened again by the browser on its own; one
    // the app refused (the port is no longer open) ends here.
    uart.es.onerror = () => {
        if (!uart.open || !uart.es) return;
        if (uart.es.readyState === EventSource.CLOSED) {
            uart.es = null;
            uartState(false);
            uartLine('er', 'Receiving stopped: the port is no longer open');
        }
    };
}

async function uartClose() {
    const port = uart.port;
    if (uart.es) { uart.es.close(); uart.es = null; }
    uartState(false);
    try { await api('/gpio/uart/close', { port }); } catch (e) { toast(`${port}: ${e.message}`, true); }
}
$('u-open').onclick = () => (uart.open ? uartClose() : uartOpen());

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

function uartLine(cls, text) {
    const log = $('u-log');
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
    const d = document.createElement('div');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = new Date().toTimeString().slice(0, 8);
    const m = document.createElement('span');
    m.className = cls === 't' ? 'hint' : cls;
    m.textContent = (cls === 'tx' ? '→ ' : cls === 'rx' ? '← ' : '') + text;
    d.append(t, m);
    log.appendChild(d);
    while (log.childElementCount > 500) log.firstElementChild.remove();
    if (stick) log.scrollTop = log.scrollHeight;
}

// Text view: whole lines, with what is left shown after a short pause. Hex view: as it comes.
function uartRx(bytes) {
    if ($('u-view').value === 'hex') { uartLine('rx', hex(bytes)); return; }
    uart.rx.push(...bytes);
    let start = 0;
    for (let i = 0; i < uart.rx.length; i++) {
        if (uart.rx[i] === 10) { uartRxLine(uart.rx.slice(start, i)); start = i + 1; }
    }
    uart.rx = uart.rx.slice(start);
    clearTimeout(uart.rxTimer);
    if (uart.rx.length) uart.rxTimer = setTimeout(() => { uartRxLine(uart.rx); uart.rx = []; }, 150);
}
function uartRxLine(bytes) {
    const text = new TextDecoder().decode(new Uint8Array(bytes)).replace(/\r$/, '');
    if (!text) return;
    // A device that echoes what it gets sends our line back: hide that copy once.
    if ($('u-echo').checked && uart.echo && uart.echo.text === text && Date.now() < uart.echo.until) { uart.echo = null; return; }
    uartLine('rx', text);
}

async function uartSend() {
    const port = uart.port, v = $('u-tx').value;
    if (!v || !uart.open) return;
    const isHex = $('u-txmode').value === 'hex';
    const eol = { none: '', lf: '\n', cr: '\r', crlf: '\r\n' }[$('u-eol').value];
    if (!isHex) uart.echo = { text: v, until: Date.now() + 1000 };
    try {
        await api('/gpio/uart/write', { port, data: isHex ? v : v + eol, hex: isHex });
        uartLine('tx', v);
        $('u-tx').value = '';
    } catch (e) { uartLine('er', e.message); }
}
$('u-send').onclick = uartSend;
$('u-tx').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); uartSend(); } };
$('u-clear').onclick = () => { $('u-log').innerHTML = ''; };

// ===== I2C: 1 bus and its settings, 2 scan, 3 talk to one device =====
const hex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const i2c = { mode: 'read' };

function i2cGrid(found) {
    const g = $('i-addr');
    if (!g.childElementCount) {
        for (let a = 0; a < 128; a++) {
            const s = document.createElement('span');
            s.textContent = hex2(a);
            if (a < 8 || a > 0x77) s.className = 'x';           // reserved addresses
            s.onclick = () => { if (s.classList.contains('f')) i2cUse(a, true); };
            g.appendChild(s);
        }
    }
    [...g.children].forEach((s, a) => s.classList.toggle('f', found.includes(a)));
}

// A click on an address takes the cursor to step 3; the scan filling it in on its
// own (one device) does not, so the page does not jump.
function i2cUse(a, focus) {
    $('i-a').value = hex2(a);
    i2cAddrHint();
    if (focus) $('i-reg').focus({ preventScroll: true });
}

const i2cHex = (id) => { const v = parseInt($(id).value.trim() || 'x', 16); return Number.isNaN(v) ? null : v; };
function i2cAddrHint() {
    const a = i2cHex('i-a');
    $('i-adec').textContent = a === null ? '' : (a <= 0x7f ? `= ${a} decimal` : 'over 0x7F: not a 7-bit address');
}
$('i-a').oninput = i2cAddrHint;
// The short hex fields (address, register) are full at two digits: clicking one
// selects what is there, so typing replaces it instead of being refused.
for (const id of ['i-a', 'i-reg']) {
    $(id).addEventListener('focus', (e) => setTimeout(() => e.target.select(), 0));
}

async function i2cLoad() {
    i2cGrid([]);
    let buses = [];
    try { buses = (await api('/gpio/i2c/buses')).buses || []; } catch (e) { toast('I²C: ' + e.message, true); }
    $('i-bus').innerHTML = buses.length ? buses.map((b) => `<option value="${b}">i2c-${b}</option>`).join('') : '<option value="">No buses</option>';
    pickerTitle($('i-bus'));
    i2cConfig();
}

// Step 1: what the page shows is what the bus uses. A bus the app has not set up
// yet gets the settings on screen right away, so scans and transfers never run
// with other ones.
async function i2cConfig() {
    const bus = $('i-bus').value;
    if (bus === '') return;
    try {
        const c = await api('/gpio/i2c/config?bus=' + bus);
        if (c.clockHz) $('i-clock').value = String(c.clockHz);
        $('i-stretch').checked = !!c.clockStretching;
        $('i-applied').textContent = 'in use';
    } catch (_) {
        await i2cApply();
    }
}
async function i2cApply() {
    const bus = $('i-bus').value;
    if (bus === '') return;
    try {
        await api('/gpio/i2c/config', { bus: +bus, clockHz: +$('i-clock').value, tenBitAddr: false, clockStretching: $('i-stretch').checked });
        $('i-applied').textContent = 'applied';
    } catch (e) {
        $('i-applied').textContent = '';
        toast('I²C: ' + e.message, true);
    }
}
$('i-bus').onchange = () => { i2cGrid([]); $('i-found').textContent = 'Look for devices on the bus. Click one that answers to use it below.'; i2cConfig(); };
$('i-clock').onchange = i2cApply;
$('i-stretch').onchange = i2cApply;

// Step 2
$('i-scan').onclick = async () => {
    const bus = $('i-bus').value;
    if (bus === '') return;
    $('i-scan').disabled = true;
    $('i-found').textContent = 'Scanning…';
    try {
        const a = (await api('/gpio/i2c/scan?bus=' + bus)).addresses || [];
        i2cGrid(a);
        $('i-found').textContent = a.length
            ? `${a.length} device${a.length > 1 ? 's' : ''}: ${a.map((x) => '0x' + hex2(x)).join(', ')}. Click one to use it below.`
            : 'No devices answered. Check the wiring, the power and the clock.';
    } catch (e) { $('i-found').textContent = e.message; }
    $('i-scan').disabled = false;
};

// Step 3
function i2cMode(m) {
    i2c.mode = m;
    document.querySelectorAll('#i-mode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
    document.querySelectorAll('#p-i2c [data-for]').forEach((l) => { l.hidden = !l.dataset.for.split(' ').includes(m); });
    $('i-run').textContent = { read: 'Read', write: 'Write', raw: 'Send' }[m];
}
document.querySelectorAll('#i-mode button').forEach((b) => { b.onclick = () => i2cMode(b.dataset.m); });

function i2cLog(cls, text) {
    const log = $('i-log');
    const d = document.createElement('div');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = new Date().toTimeString().slice(0, 8);
    const m = document.createElement('span');
    m.className = cls;
    m.textContent = text;
    d.append(t, m);
    log.appendChild(d);
    while (log.childElementCount > 200) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
}

$('i-run').onclick = async () => {
    const address = i2cHex('i-a');
    if (address === null || address > 0x7f) { toast('Device: choose an address in the scan, or type it in hex', true); return; }
    const A = '0x' + hex2(address);
    let data = '', readLength = 0, what;
    if (i2c.mode === 'raw') {
        data = $('i-w').value.trim();
        readLength = +$('i-rn').value || 0;
        if (!data && !readLength) { toast('Raw: bytes to send, bytes to read, or both', true); return; }
        what = `${A}${data ? ' W ' + data.toUpperCase() : ''}${readLength ? ' R ' + readLength : ''}`;
    } else {
        const reg = i2cHex('i-reg');
        if (reg === null || reg > 0xff) { toast('Register: one byte in hex, e.g. 01', true); return; }
        if (i2c.mode === 'read') {
            readLength = +$('i-n').value || 1;
            data = hex2(reg);
            what = `${A} read 0x${hex2(reg)} (${readLength} byte${readLength > 1 ? 's' : ''})`;
        } else {
            const val = $('i-val').value.trim();
            if (!val) { toast('Write register: the value(s) to write', true); return; }
            data = hex2(reg) + ' ' + val;
            what = `${A} write 0x${hex2(reg)} ← ${val.toUpperCase()}`;
        }
    }
    try {
        const r = await api('/gpio/i2c/transfer', { bus: +$('i-bus').value, address, data, readLength });
        i2cLog('tx', what + (readLength ? ' → ' + (r.data || '').toUpperCase() : ' ✓'));
    } catch (e) { i2cLog('er', what + ': ' + e.message); }
};
i2cMode('read');

// ===== SPI: 1 device and settings, 2 transfers =====
// The platform clocks max(sent, read) bytes, padding with 00, and gives back what
// came in only when a read is asked. The page always asks (sent + extra), so the
// answer to every byte is shown under the byte that was sent.
const spiParts = (d) => { const m = /spidev(\d+)\.(\d+)/.exec(d || ''); return m ? { bus: +m[1], chipSelect: +m[2] } : null; };

async function spiLoad() {
    let devs = [];
    try { devs = (await api('/gpio/spi/devices')).devices || []; } catch (e) { toast('SPI: ' + e.message, true); }
    $('s-dev').innerHTML = devs.length ? devs.map((d) => `<option>${esc(d)}</option>`).join('') : '<option value="">No devices</option>';
    pickerTitle($('s-dev'));
    spiConfig();
}

// Step 1: what the page shows is what the device uses (as for I2C).
async function spiConfig() {
    const p = spiParts($('s-dev').value);
    if (!p) return;
    try {
        const c = await api(`/gpio/spi/config?bus=${p.bus}&chipSelect=${p.chipSelect}`);
        $('s-mode').value = String(c.mode ?? 0);
        if (c.maxSpeedHz) {
            const sel = $('s-speed');
            if (![...sel.options].some((o) => o.value === String(c.maxSpeedHz))) sel.add(new Option(`${c.maxSpeedHz} Hz`, c.maxSpeedHz));
            sel.value = String(c.maxSpeedHz);
        }
        if (c.bitsPerWord) $('s-bits').value = c.bitsPerWord;
        $('s-lsb').value = c.lsbFirst ? 'true' : 'false';
        $('s-applied').textContent = 'in use';
    } catch (_) {
        await spiApply();
    }
}
async function spiApply() {
    const p = spiParts($('s-dev').value);
    if (!p) return;
    try {
        await api('/gpio/spi/config', { ...p, maxSpeedHz: +$('s-speed').value, bitsPerWord: +$('s-bits').value, lsbFirst: $('s-lsb').value === 'true', mode: +$('s-mode').value });
        $('s-applied').textContent = 'applied';
    } catch (e) {
        $('s-applied').textContent = '';
        toast('SPI: ' + e.message, true);
    }
}
$('s-dev').onchange = spiConfig;
for (const id of ['s-mode', 's-speed', 's-bits', 's-lsb']) $(id).onchange = spiApply;

// Bytes in a hex text, the way the app reads it (0x, spaces, : - , ; allowed).
function hexBytes(text) {
    const t = text.trim().toLowerCase().split(/\s+/).filter(Boolean).map((p) => p.replace(/^0x/, '').replace(/[:,;-]/g, '')).join('');
    if (!/^[0-9a-f]*$/.test(t)) return null;
    const h = t.length % 2 ? '0' + t : t;
    return h.match(/../g) || [];
}

function spiLog(rows) {
    const log = $('s-log');
    const time = new Date().toTimeString().slice(0, 8);
    rows.forEach(([cls, label, text], i) => {
        const d = document.createElement('div');
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = i ? ' '.repeat(time.length) : time;
        const m = document.createElement('span');
        m.className = cls;
        m.textContent = `${label}  ${text}`;
        d.append(t, m);
        log.appendChild(d);
    });
    while (log.childElementCount > 300) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
}

// Step 2
$('s-run').onclick = async () => {
    const p = spiParts($('s-dev').value);
    if (!p) return;
    const sent = hexBytes($('s-w').value);
    if (sent === null) { toast('Send: hex bytes, e.g. 9F or 0x03 0x00', true); return; }
    const extra = Math.max(0, +$('s-n').value || 0);
    const total = sent.length + extra;
    if (!total) { toast('Send some bytes, or read some', true); return; }
    const tx = sent.concat(Array(extra).fill('00')).map((b) => b.toUpperCase());
    try {
        const r = await api('/gpio/spi/transfer', { ...p, dataOut: sent.join(' '), readLength: total });
        const rx = (r.data || '').toUpperCase().split(/\s+/).filter(Boolean);
        spiLog([['tx', 'TX', tx.join(' ')], ['rx', 'RX', rx.join(' ') || '(nothing)']]);
    } catch (e) {
        spiLog([['tx', 'TX', tx.join(' ')], ['er', '!!', e.message]]);
    }
};
$('s-w').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('s-run').click(); } };

// ===== pickers: the whole name on hover, whatever its length =====
function pickerTitle(sel) { sel.title = sel.options[sel.selectedIndex]?.text || ''; }
for (const id of ['u-port', 'i-bus', 's-dev']) $(id).addEventListener('change', () => pickerTitle($(id)));

// ===== start =====
header();
{
    const t = location.hash.slice(1);
    if (t !== 'gpio' && document.querySelector(`.tab[data-p="${CSS.escape(t)}"]`)) showTab(t);
}
gpioLoad().then(() => { if ($('p-gpio').classList.contains('on')) gpioStart(); });
