// Layout probe: after navigating to the battle screen, report the geometry and
// computed style of the HUD vs the Pixi canvas, so we can tell whether this is
// a CSS/layout problem (HUD off-screen / canvas oversized) or a crash.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PROBE_PORT ?? 9355);
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class CDP {
  private id = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  events: any[] = [];
  constructor(private ws: WebSocket) {
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)!;
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method: string, params: any = {}): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr: string): Promise<any> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return { ERR: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    return r.result.value;
  }
}

const GEO = `(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      zIndex: cs.zIndex, position: cs.position, overflow: cs.overflow,
    };
  };
  const canvases = [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect();
    return {
      attrW: c.width, attrH: c.height,
      cssW: Math.round(r.width), cssH: Math.round(r.height),
      x: Math.round(r.x), y: Math.round(r.y),
      style: c.getAttribute('style'),
    };
  });
  const root = document.getElementById('root');
  const topBar = [...document.querySelectorAll('div')].find(d => d.className && String(d.className).includes('z-20'));
  const host = canvases.length ? document.querySelector('canvas')?.parentElement : null;
  return {
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    doc: { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight },
    body: rect(document.body),
    root: rect(root),
    topBar: rect(topBar),
    host: rect(host),
    canvases,
    hudText: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 160),
  };
})()`;

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1440,900',
    '--no-first-run',
    '--user-data-dir=' + tmpdir() + '\\wr-layout-' + Date.now(),
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = '';
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      wsUrl = list.find((t: any) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.once('open', r));
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');

  const vp = process.env.VIEWPORT ?? '1440x900';
  const [w, h] = vp.split('x').map(Number);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });

  await cdp.send('Page.navigate', { url: `${BASE}/?screen=skirmish` });
  await sleep(3500);
  for (const label of ['DEPLOY TO BATTLEFIELD']) {
    const r = await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes(${JSON.stringify(label)}));
      if (!b) return 'NO_BUTTON';
      b.click(); return 'OK';
    })()`);
    console.log('click', label, '=>', r);
  }
  await sleep(4000);

  const geo = await cdp.eval(GEO);
  console.log(JSON.stringify(geo, null, 2));

  const errs = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map((e) => e.method === 'Runtime.exceptionThrown'
      ? 'EXCEPTION: ' + (e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text)
      : 'LOG.error: ' + e.params.entry.text);
  console.log('--- ERRORS (' + errs.length + ') ---\n' + errs.join('\n'));

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error('LAYOUT PROBE FAIL:', e.message); process.exit(1); });