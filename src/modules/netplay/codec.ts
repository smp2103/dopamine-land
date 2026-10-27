// netplay 코드 글자 — 연결 코드·세이브 코드를 "복사해서 붙여넣을 수 있는 한 줄"로 접고 편다.
// 모양: `DL1` + 방식 글자 + '.' + base64url.   방식 z = CompressionStream('deflate') 로 눌렀음 · j = 그냥 JSON(누르개가 없는 브라우저).
// 붙여넣을 땐 앞뒤 잡글·줄바꿈·공백이 섞여도 된다(코드 조각만 골라 읽는다). 서버·외부 라이브러리 없음.
// 부수효과 없음(DOM 없이 node 에서도 돈다).

/** 코드 머리 — 바꾸면 옛 코드를 못 읽으니 새 숫자로 */
export const CODE_HEAD = 'DL1';
/** 붙여넣은 글에서 코드 조각 찾기 */
const CODE_RE = /DL1([zj])\.([A-Za-z0-9_-]+)/;

// ───────────── base64url ─────────────
export function toB64url(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b.length % 4 === 2 ? '==' : b.length % 4 === 3 ? '=' : b.length % 4 === 1 ? null : '';
  if (pad === null) throw new Error('b64');
  const bin = atob(b + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ───────────── 누르기(deflate) ─────────────
type StreamCtor = new (format: 'deflate') => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
const CS = (): StreamCtor | null => (globalThis as unknown as { CompressionStream?: StreamCtor }).CompressionStream ?? null;
const DS = (): StreamCtor | null => (globalThis as unknown as { DecompressionStream?: StreamCtor }).DecompressionStream ?? null;
/** 이 환경에서 누를 수 있나 */
export const canCompress = () => !!CS() && !!DS();

async function pipe(ctor: StreamCtor, data: Uint8Array): Promise<Uint8Array> {
  const s = new ctor('deflate');
  const w = s.writable.getWriter();
  // 쓰기와 읽기를 같이 돌려야 큰 데이터에서 막히지 않는다
  const wrote = (async () => { await w.write(data); await w.close(); })();
  // 깨진 데이터면 읽기 쪽이 먼저 던진다 — 쓰기 쪽 실패가 떠돌지 않게 잡아 둔다
  wrote.catch(() => {});
  const chunks: Uint8Array[] = [];
  const r = s.readable.getReader();
  for (;;) {
    const { value, done } = await r.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  await wrote;
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** 아무 JSON 값 → 코드 한 줄. compress=false 면 늘 j 방식 */
export async function encodeCode(value: unknown, o: { compress?: boolean } = {}): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  const ctor = o.compress === false ? null : CS();
  if (ctor) {
    try { return `${CODE_HEAD}z.${toB64url(await pipe(ctor, raw))}`; } catch { /* 아래 j 로 */ }
  }
  return `${CODE_HEAD}j.${toB64url(raw)}`;
}

export type DecodeResult<T = unknown> = { ok: true; value: T } | { ok: false; err: 'empty' | 'format' | 'corrupt' | 'nozip' };

/** 붙여넣은 글 → JSON 값. 잡글이 섞여도 코드 조각만 읽는다 */
export async function decodeCode<T = unknown>(text: string): Promise<DecodeResult<T>> {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!t) return { ok: false, err: 'empty' };
  const m = CODE_RE.exec(t);
  if (!m) return { ok: false, err: 'format' };
  let bytes: Uint8Array;
  try { bytes = fromB64url(m[2]); } catch { return { ok: false, err: 'corrupt' }; }
  if (m[1] === 'z') {
    const ctor = DS();
    if (!ctor) return { ok: false, err: 'nozip' };
    try { bytes = await pipe(ctor, bytes); } catch { return { ok: false, err: 'corrupt' }; }
  }
  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as T }; } catch { return { ok: false, err: 'corrupt' }; }
}

/** 오류 → 귀여운 안내 글 */
export function codeErrText(err: string): string {
  switch (err) {
    case 'empty': return '코드를 붙여넣어 주세요!';
    case 'format': return '도파민랜드 코드가 아닌 것 같아요 (DL1… 로 시작해요)';
    case 'nozip': return '이 브라우저는 눌린 코드를 못 펴요 — 크롬·엣지로 해 봐요';
    default: return '코드가 조금 깨졌어요. 처음부터 끝까지 다시 복사해 봐요!';
  }
}

/** 짧은 확인용 해시(FNV-1a 32비트, 16진수 8자) — 세이브 코드가 온전한지 본다 */
export function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
