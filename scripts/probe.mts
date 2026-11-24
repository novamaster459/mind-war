// Headless-Chrome reproduction harness for the "stuck on grid after deploy" bug.
// Drives the app via CDP: loads a URL, optionally clicks a button by text,
// then reports console errors / page exceptions / body text.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PROBE_PORT ?? 9333);
const PROFILE = process.env.PROBE_PROFILE ?? 'wr-test-profile';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome CDP never came up');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function main() {
  const url = process.argv[2] ?? 'http://localhost:5199/';
  // Steps: JSON array of [buttonText, settleMsAfter] pairs.
  const steps: [string, number][] = process.argv[3] ? JSON.parse(process.argv[3]) : [];
  const settleMs = Number(process.argv[4] ?? 4000);

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--user-data-dir=' + tmpdir() + '\\' + PROFILE,
    'about:blank',
  ], { stdio: 'ignore' });

  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.once('open', r));
  const cdp = new CDP(ws);

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  await cdp.send('Page.navigate', { url });
  await sleep(settleMs);

  if (steps.length > 0) {
    for (const [clickText, waitMs] of steps) {
      const expr = `(() => {
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find(x => (x.textContent||'').toUpperCase().includes(${JSON.stringify(clickText.toUpperCase())}));
        if (!b) return 'NO_BUTTON_FOUND:' + btns.map(x=>x.textContent.trim()).join('|');
        b.click();
        return 'CLICKED:' + b.textContent.trim();
      })()`;
      const res = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log('click =>', res.result.value);
      await sleep(waitMs);
    }
  }

  // Report console + exceptions.
  const problems = [];
  for (const e of cdp.events) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails;
      problems.push('EXCEPTION: ' + (d.exception?.description ?? d.text));
    } else if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
      problems.push('CONSOLE.' + e.params.type + ': ' + e.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    } else if (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level)) {
      problems.push('LOG.' + e.params.entry.level + ': ' + e.params.entry.text);
    }
  }

  const state = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      text: document.body.innerText.slice(0, 400),
      canvases: document.querySelectorAll('canvas').length,
      buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0,12)
    })`,
    returnByValue: true,
  });

  console.log('--- PAGE STATE ---');
  console.log(state.result.value);
  console.log('--- PROBLEMS (' + problems.length + ') ---');
  console.log([...new Set(problems)].slice(0, 25).join('\n'));

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error('HARNESS FAIL:', e.message);
  process.exit(1);
});