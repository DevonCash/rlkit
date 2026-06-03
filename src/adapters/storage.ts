/**
 * adapters/storage — the save codec + pluggable storage backends (§16, §17).
 *
 * `encodeState`/`decodeState` round-trip a `WorldState` through **devalue**,
 * which natively preserves the `Map`s and shared references that JSON cannot.
 * devalue does not know our typed-array layers, so three reducers/revivers
 * carry `Uint16Array`/`Float32Array`/`Uint8Array` across as base64 of their
 * raw bytes (compact, and avoids the per-number overhead of an array literal).
 *
 * Byte order: base64 captures the buffer host-endian. Every target platform is
 * little-endian, so a save is portable in practice; this is the one assumption.
 *
 * `Storage` is the async slot interface from §16; it composes the codec over a
 * synchronous `StorageLike` (structurally `localStorage`, or the in-memory
 * backend here). Typing the backend structurally keeps this adapter — and the
 * whole library build — free of the DOM lib while still wrapping `localStorage`.
 */
import { stringify, parse } from 'devalue';
import type { WorldState } from '../core/world';
import type { SaveBlob } from '../content/validate';

// --- base64 over raw bytes (no DOM atob/btoa, no Node Buffer) ---------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV: number[] = (() => {
  const inv = new Array<number>(128).fill(-1);
  for (let i = 0; i < B64.length; i++) inv[B64.charCodeAt(i)] = i;
  return inv;
})();

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '==';
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '=';
  }
  return out;
}

function base64ToBytes(s: string): Uint8Array {
  let len = s.length;
  while (len > 0 && s[len - 1] === '=') len--;
  const outLen = (len * 3) >> 2;
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_INV[s.charCodeAt(i)]!;
    const b = B64_INV[s.charCodeAt(i + 1)]!;
    const c = i + 2 < len ? B64_INV[s.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < len ? B64_INV[s.charCodeAt(i + 3)]! : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < outLen) out[o++] = (n >> 16) & 0xff;
    if (o < outLen) out[o++] = (n >> 8) & 0xff;
    if (o < outLen) out[o++] = n & 0xff;
  }
  return out;
}

/** Bytes view over a typed array, honoring its offset/length within its buffer. */
function viewBytes(a: Uint16Array | Float32Array | Uint8Array): Uint8Array {
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

// --- devalue codec ----------------------------------------------------------

const reducers: Record<string, (v: unknown) => unknown> = {
  Uint16: (v) => (v instanceof Uint16Array ? bytesToBase64(viewBytes(v)) : undefined),
  Float32: (v) => (v instanceof Float32Array ? bytesToBase64(viewBytes(v)) : undefined),
  Uint8: (v) => (v instanceof Uint8Array ? bytesToBase64(viewBytes(v)) : undefined),
};

const revivers: Record<string, (v: unknown) => unknown> = {
  Uint16: (s) => new Uint16Array(base64ToBytes(s as string).buffer),
  Float32: (s) => new Float32Array(base64ToBytes(s as string).buffer),
  Uint8: (s) => base64ToBytes(s as string),
};

/** Encode a `WorldState` snapshot to a string (devalue + typed-array base64). */
export function encodeState(state: WorldState): string {
  return stringify(state, reducers);
}

/** Decode a snapshot string to a raw value (validated downstream by `parseSave`). */
export function decodeState(str: string): unknown {
  return parse(str, revivers);
}

// --- storage backends -------------------------------------------------------

/**
 * The synchronous key→string store the async {@link Storage} composes over.
 * Structurally satisfied by the DOM `localStorage` and by {@link createMemoryStorage}.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory {@link StorageLike} (tests, ephemeral runs). */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** Slot-keyed persistence for save blobs (§16). */
export interface Storage {
  save(slot: string, blob: SaveBlob): Promise<void>;
  load(slot: string): Promise<SaveBlob | null>;
}

const SLOT_PREFIX = 'rlkit:save:';

/**
 * A {@link Storage} over any {@link StorageLike} backend. The envelope's
 * `schemaVersion` rides as JSON; the `world` snapshot rides as a devalue string;
 * they are joined with a newline so neither needs escaping.
 */
export function createStorage(backend: StorageLike = createMemoryStorage()): Storage {
  return {
    async save(slot, blob) {
      const payload = `${blob.schemaVersion}\n${encodeState(blob.world)}`;
      backend.setItem(SLOT_PREFIX + slot, payload);
    },
    async load(slot) {
      const payload = backend.getItem(SLOT_PREFIX + slot);
      if (payload === null) return null;
      const nl = payload.indexOf('\n');
      const schemaVersion = Number(payload.slice(0, nl));
      const world = decodeState(payload.slice(nl + 1)) as WorldState;
      return { schemaVersion, world };
    },
  };
}
