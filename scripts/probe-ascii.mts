// Renders the page as ASCII art so a text-only agent can "see" the layout.
// Captures a downscaled screenshot via CDP, decodes the PNG with node:zlib,
// and prints a luminance map plus a colour-category map.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import WebSocket from 'ws';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PROBE_PORT ?? 9361);
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------------------
// Minimal PNG decoder (8-bit, non-interlaced, colour types 0/2/3/4/6).
// --------------------------------------------------------------------------
function decodePNG(buf: Buffer): { width: number; height: number; px: (x: number, y: number) => [number, number, number] } {
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${bitDepth}, interlace ${interlace})`);

  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) throw new Error('unsupported colour type ' + colorType);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      switch (filter) {
        case 0: break;
        case 1: v = v + a; break;
        case 2: v = v + b; break;
        case 3: v = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      cur[i] = v & 0xff;
    }
  }

  return {
    width,
    height,
    px(x: number, y: number): [number, number, number] {
      const o = y * stride + x * channels;
      if (colorType === 3 && palette) {
        const idx = out[o];
        return [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
      }
      if (colorType === 0 || colorType === 4) return [out[o], out[o], out[o]];
      return [out[o], out[o + 1], out[o + 2]];
    },
  };
}

class CDP {
  private id = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  constructor(private ws: WebSocket) {
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)!;
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method: string, params: any = {}): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr: string): Promise<any> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.exceptionDetails ? { ERR: r.exceptionDetails.text } : r.result.value;
  }
}

const RAMP = ' .:-=+*#%@';

function classify(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum < 24) return ' '; // page background
  if (max - min < 26) return lum > 170 ? 'W' : lum > 90 ? 'w' : '.'; // greys / white text
  if (b > r && b > g) return 'C'; // cyan / blue
  if (g > r && g > b) return 'G'; // green
  if (r > 150 && g > 110 && b < 90) return 'Y'; // amber
  if (r > g && r > b) return 'R'; // red
  return '?';
}

async function main() {
  const [vw, vh] = (process.env.VIEWPORT ?? '1440x900').split('x').map(Number);
  const cols = Number(process.env.ASCII_COLS ?? 100);
  const url = process.argv[2] ?? `${BASE}/?screen=skirmish`;
  const clickText = process.argv[3] ?? 'DEPLOY TO BATTLEFIELD';

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--no-first-run',
    '--user-data-dir=' + tmpdir() + '\\wr-ascii-' + Date.now(),
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });

  await cdp.send('Page.navigate', { url });
  await sleep(3500);
  if (clickText) {
    console.log('click =>', await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').toUpperCase().includes(${JSON.stringify(clickText.toUpperCase())}));
      if (!b) return 'NO_BUTTON';
      b.click(); return 'OK';
    })()`));
    await sleep(4000);
  }

  const scale = cols / vw;
  const rows = Math.max(1, Math.round(vh * scale * 0.5)); // chars are ~2x tall
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: vw, height: vh, scale },
    captureBeyondViewport: false,
  });
  const img = decodePNG(Buffer.from(shot.data, 'base64'));

  const ramp: string[] = [];
  const cats: string[] = [];
  for (let ry = 0; ry < rows; ry++) {
    let l = '', c = '';
    for (let rx = 0; rx < cols; rx++) {
      const x0 = Math.floor((rx * img.width) / cols), x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * img.width) / cols));
      const y0 = Math.floor((ry * img.height) / rows), y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * img.height) / rows));
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const [r, g, b] = img.px(x, y);
        sr += r; sg += g; sb += b; n++;
      }
      const r = sr / n, g = sg / n, b = sb / n;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      l += RAMP[Math.min(RAMP.length - 1, Math.floor((lum / 255) * RAMP.length))];
      c += classify(r, g, b);
    }
    ramp.push(l);
    cats.push(c);
  }

  console.log(`\n=== ${vw}x${vh} luminance ===`);
  console.log(ramp.join('\n'));
  console.log('\n=== colour map (C=cyan G=green Y=amber R=red W=white .=grey) ===');
  console.log(cats.join('\n'));

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error('ASCII PROBE FAIL:', e.message); process.exit(1); });