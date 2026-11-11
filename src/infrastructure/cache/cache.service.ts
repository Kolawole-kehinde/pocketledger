import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}



export interface CacheStats {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  evictions: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Small in-process TTL cache.
 *
 * Entries are lazily expired on read and opportunistically pruned when the
 * cache reaches its configured capacity. The least recently used entry is
 * evicted first.
 */
@Injectable()
export class CacheService implements OnModuleInit {
  private readonly entries = new Map<string, CacheEntry>();
  private maxEntries = DEFAULT_MAX_ENTRIES;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    private readonly configService: ConfigService
  ) {}

  onModuleInit(): void {
    const configured =
      this.configService.get<number>('CACHE_MAX_ENTRIES');

    if (
      typeof configured === 'number' &&
      Number.isFinite(configured) &&
      configured > 0
    ) {
      this.maxEntries = Math.floor(configured);
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }

    // Refresh insertion order so the map behaves as an LRU list.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (ttlSeconds <= 0) {
      this.entries.delete(key);
      return;
    }

    this.entries.delete(key);
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1_000,
    });

    this.evictIfNeeded();
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  deleteByPrefix(prefix: string): number {
    let deleted = 0;

    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        deleted += 1;
      }
    }

    return deleted;
  }

  clear(): void {
    this.entries.clear();
  }

  getStats(): CacheStats {
    this.pruneExpired();

    return {
      size: this.entries.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private evictIfNeeded(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    this.pruneExpired();

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as
        | string
        | undefined;

      if (oldestKey === undefined) {
        return;
      }

      this.entries.delete(oldestKey);
      this.evictions += 1;
    }
  }

  private pruneExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
