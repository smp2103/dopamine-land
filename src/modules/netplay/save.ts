// 세이브 코드 — 지금 저장(coins·bag·dex·flags)을 눌러서 한 줄 코드로, 코드를 다시 저장으로.
// 코드 속 모양: { k:'save', v: 저장 버전, at: 만든 시각, h: hash32(JSON(d)), d: SaveData }.
// 불러올 땐 core 의 migrateSave 로 옛 모양·깨진 칸을 다듬는다. 사진(IndexedDB)은 들어가지 않는다.
import { migrateSave, SAVE_VERSION, type SaveData } from '../../core/state';
import { encodeCode, decodeCode, codeErrText, hash32 } from './codec';

export interface SaveCodeBody { k: 'save'; v: number; at: number; h: string; d: SaveData }

/** 저장 → 코드 */
export async function exportSave(snap: SaveData, at = Date.now()): Promise<string> {
  const d = migrateSave(JSON.parse(JSON.stringify(snap)));
  const body: SaveCodeBody = { k: 'save', v: SAVE_VERSION, at, h: hash32(JSON.stringify(d)), d };
  return encodeCode(body);
}

export type ImportResult =
  | { ok: true; data: SaveData; at: number; summary: { coins: number; dex: number; items: number } }
  | { ok: false; err: string; text: string };

/** 코드 → 저장(검사 + 다듬기). 아직 아무것도 덮어쓰지 않는다 */
export async function importSave(text: string): Promise<ImportResult> {
  const r = await decodeCode<SaveCodeBody>(text);
  if (!r.ok) return { ok: false, err: r.err, text: codeErrText(r.err) };
  const b = r.value as Partial<SaveCodeBody> | null;
  if (!b || typeof b !== 'object' || b.k !== 'save' || !b.d || typeof b.d !== 'object') {
    return { ok: false, err: 'kind', text: '세이브 코드가 아니에요 — 친구 연결 코드는 👫 친구 창에 넣어요' };
  }
  if (typeof b.v === 'number' && b.v > SAVE_VERSION) return { ok: false, err: 'newer', text: '더 새 버전 게임에서 만든 코드예요. 게임을 새로고침해 봐요!' };
  if (typeof b.h === 'string' && hash32(JSON.stringify(b.d)) !== b.h) {
    // 한 번 다듬은 모양으로도 맞춰 본다(만든 쪽이 다듬은 뒤 해시를 냈으니 보통은 바로 맞는다)
    if (hash32(JSON.stringify(migrateSave(b.d))) !== b.h) return { ok: false, err: 'hash', text: codeErrText('corrupt') };
  }
  const data = migrateSave(b.d);
  const items = Object.values(data.bag).reduce((a, n) => a + n, 0);
  return { ok: true, data, at: typeof b.at === 'number' ? b.at : 0, summary: { coins: data.coins, dex: Object.keys(data.dex).length, items } };
}

/** 덮어쓰기 전에 지금 저장을 남겨 두는 곳(되돌리기용) */
export const BACKUP_KEY = 'dopamine-land-save-backup';
