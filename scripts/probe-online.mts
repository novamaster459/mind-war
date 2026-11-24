// Two-client online smoke test in real headless Chrome against the built PWA.
// Host creates a room, guest joins with the 4-letter code, host starts the
// match, and both clients must land on the battle screen with no exceptions.
import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class CDP {
  private id = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  events: any[] = [];
  constructor(private ws: WebSocket) {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method: string, params: any = {}): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr: string): Promise<string> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'ERR:' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

async function launch(port: number, profile: string) {
  const chrome: ChildProcess = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + tmpdir() + '\\' + profile,
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = '';
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t: any) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('CDP timeout on port ' + port);

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.once('open', r));
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  return { cdp, close: () => { ws.close(); chrome.kill(); } };
}

const clickByText = (text: string) => `(() => {
  const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent||'').toUpperCase().includes(${JSON.stringify(text.toUpperCase())}));
  if (!b) return 'NO_BUTTON';
  b.click();
  return 'OK';
})()`;

const summary = `JSON.stringify({
  screen: document.body.innerText.replace(/\\s+/g,' ').slice(0, 260),
  canvases: document.querySelectorAll('canvas').length,
  buttons: [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).slice(0,10)
})`;

const problems = (cdp: CDP) => {
  const out: string[] = [];
  for (const e of cdp.events) {
    if (e.method === 'Runtime.exceptionThrown') {
      out.push('EXCEPTION: ' + (e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text));
    } else if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
      out.push('CONSOLE.error: ' + e.params.args.map((a: any) => a.value ?? a.description ?? a.type).join(' '));
    } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
      out.push('LOG.error: ' + e.params.entry.text);
    }
  }
  return [...new Set(out)];
};

async function main() {
  const host = await launch(9341, 'wr-online-host');
  const guest = await launch(9342, 'wr-online-guest');

  try {
    // ---- Host: open lobby, create a room --------------------------------
    await host.cdp.send('Page.navigate', { url: `${BASE}/?screen=lobby` });
    await sleep(3500);
    console.log('[host] create  =>', await host.cdp.eval(clickByText('Create Room')));
    await sleep(2500);

    const code = await host.cdp.eval(`(() => {
      const el = [...document.querySelectorAll('div')]
        .find(d => /^[A-Z]{4}$/.test((d.textContent||'').trim()) && d.className.includes('text-4xl'));
      return el ? el.textContent.trim() : 'NONE';
    })()`);
    console.log('[host] room code =>', code);
    if (!/^[A-Z]{4}$/.test(code)) throw new Error('Could not read room code from host DOM');

    // ---- Guest: join with that code -------------------------------------
    await guest.cdp.send('Page.navigate', { url: `${BASE}/?screen=lobby` });
    await sleep(3000);
    const setCode = `(() => {
      const input = [...document.querySelectorAll('input')].find(i => i.maxLength === 4);
      if (!input) return 'NO_INPUT';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(code)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'TYPED';
    })()`;
    console.log('[guest] type code =>', await guest.cdp.eval(setCode));
    await sleep(500);
    console.log('[guest] join    =>', await guest.cdp.eval(clickByText('Join Room')));
    await sleep(2500);

    console.log('[host] lobby  =>', await host.cdp.eval(summary));
    console.log('[guest] lobby =>', await guest.cdp.eval(summary));

    // ---- Host starts the match ------------------------------------------
    console.log('[host] start  =>', await host.cdp.eval(clickByText('Start')));
    await sleep(5000);

    console.log('[host] battle =>', await host.cdp.eval(summary));
    console.log('[guest] battle =>', await guest.cdp.eval(summary));

    // ---- End a turn from each side --------------------------------------
    console.log('[host] end turn =>', await host.cdp.eval(clickByText('End Turn')));
    await sleep(1500);
    console.log('[guest] end turn =>', await guest.cdp.eval(clickByText('End Turn')));
    await sleep(3000);

    console.log('[host] after  =>', await host.cdp.eval(summary));
    console.log('[guest] after =>', await guest.cdp.eval(summary));

    const hostProblems = problems(host.cdp);
    const guestProblems = problems(guest.cdp);
    console.log('--- HOST PROBLEMS (' + hostProblems.length + ') ---\n' + hostProblems.join('\n'));
    console.log('--- GUEST PROBLEMS (' + guestProblems.length + ') ---\n' + guestProblems.join('\n'));
  } finally {
    host.close();
    guest.close();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('ONLINE PROBE FAIL:', e.message);
  process.exit(1);
});