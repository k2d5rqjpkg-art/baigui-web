/**
 * Simple in-memory LRU cache for LLM responses.
 * Avoids re-querying the API for identical prompts — saves cost during playtest loops.
 *
 * Bound: 100 entries. When full, the least-recently-used entry is evicted.
 * Key: FNV-1a 32-bit hash of the prompt string (fast, deterministic, good enough for dedup).
 */

export interface LRUCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  has(key: string): boolean;
  size(): number;
  clear(): void;
}

interface Entry<V> {
  value: V;
  insertedAt: number;
}

/**
 * FNV-1a 32-bit hash. https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
 * Cheap, well-distributed for short ASCII strings, zero deps.
 */
export function hashKey(s: string): string {
  let h = 0x811c9dc5; // offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in u32 via Math.imul
    h = Math.imul(h, 0x01000193);
  }
  // Convert to unsigned hex
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class LRU<V> implements LRUCache<V> {
  private readonly max: number;
  private readonly map: Map<string, Entry<V>>;

  constructor(maxEntries: number = 100) {
    if (maxEntries <= 0) throw new Error('LRU maxEntries must be > 0');
    this.max = maxEntries;
    this.map = new Map();
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Refresh recency: re-insert to move to the end of insertion order.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      // Evict oldest (Map preserves insertion order)
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, insertedAt: Date.now() });
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Module-level singleton: one shared cache for all LLM calls in a session.
 * Bounded to 100 entries to keep memory predictable.
 */
export const llmCache = new LRU<string>(100);
