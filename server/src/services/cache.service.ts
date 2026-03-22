import { logger } from "../utils/logger";

let redis: any = null;

// Initialize Redis connection
export const initRedis = (client: any) => {
  redis = client;
};

/**
 * Cache Service for multi-organization dashboard metrics
 * Implements key-based caching with organization scope
 * TTL (Time-To-Live) for automatic cache invalidation
 */
class CacheService {
  /**
   * Set a cache entry with optional TTL
   * @param key Cache key (should include organizationId for isolation)
   * @param value Data to cache
   * @param ttl Time to live in seconds (default: 300s = 5min)
   */
  async set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    try {
      if (!redis) {
        logger.warn("[Cache] Redis not initialized, skipping cache");
        return;
      }

      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await redis.set(key, serialized, { EX: ttl });
      } else {
        await redis.set(key, serialized);
      }
    } catch (error) {
      logger.error(`[Cache] Failed to set key ${key}:`, error);
      // Don't throw - cache failure shouldn't break application
    }
  }

  /**
   * Get a cache entry
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!redis) {
        return null;
      }

      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`[Cache] Failed to get key ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete a cache entry
   * @param key Cache key
   */
  async delete(key: string): Promise<void> {
    try {
      if (!redis) return;
      await redis.del(key);
    } catch (error) {
      logger.error(`[Cache] Failed to delete key ${key}:`, error);
    }
  }

  /**
   * Invalidate all cache keys matching a pattern
   * Useful when data changes affect multiple cached entries
   * Example: invalidatePattern("dashboard:metrics:*") when org data changes
   * @param pattern Redis SCAN pattern (e.g., "dashboard:metrics:*")
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (!redis) return;

      const keys: string[] = [];
      let cursor = "0";

      // Scan all keys matching pattern
      do {
        const [newCursor, scannedKeys] = await redis.scan(
          parseInt(cursor),
          "MATCH",
          pattern
        );
        cursor = newCursor.toString();
        keys.push(...scannedKeys);
      } while (cursor !== "0");

      // Delete all matched keys
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.error(`[Cache] Failed to invalidate pattern ${pattern}:`, error);
    }
  }

  /**
   * Invalidate all cache for a specific organization
   * Call this when org data changes (members added, sessions created, etc.)
   * @param organizationId Organization ID to invalidate
   */
  async invalidateOrganization(organizationId: string): Promise<void> {
    await this.invalidatePattern(`*:${organizationId}:*`);
    await this.delete(`dashboard:metrics:${organizationId}`);
    await this.delete(`org:stats:${organizationId}`);
    await this.delete(`org:health:${organizationId}`);
  }

  /**
   * Get multiple cache entries at once
   * @param keys Array of cache keys
   */
  async getManyIfFresh<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (!redis) {
        return keys.map(() => null);
      }

      const values = await redis.mget(...keys);
      return values.map((v: any) => (v ? JSON.parse(v) : null));
    } catch (error) {
      logger.error(`[Cache] Failed to get multiple keys:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Increment a counter in cache (for rate limiting, metrics)
   * @param key Counter key
   * @param increment Amount to increment (default: 1)
   * @param ttl Optional TTL to set on first increment
   */
  async increment(key: string, increment: number = 1, ttl?: number): Promise<number> {
    try {
      if (!redis) return 0;

      const result = await redis.incrby(key, increment);
      if (ttl) {
        await redis.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error(`[Cache] Failed to increment key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getStats(): Promise<{
    connected: boolean;
    memory: string;
    keys: number;
    memoryPeak: string;
  }> {
    try {
      if (!redis) {
        return {
          connected: false,
          memory: "not initialized",
          keys: 0,
          memoryPeak: "not initialized",
        };
      }

      const info = await redis.info("memory");
      const dbsize = await redis.dbsize();

      const lines = info.split("\r\n");
      const stats: Record<string, string> = {};

      lines.forEach((line: string) => {
        const [key, value] = line.split(":");
        if (key && value) {
          stats[key] = value;
        }
      });

      return {
        connected: true,
        memory: stats["used_memory_human"] || "unknown",
        keys: dbsize,
        memoryPeak: stats["used_memory_peak_human"] || "unknown",
      };
    } catch (error) {
      logger.error("[Cache] Failed to get stats:", error);
      return {
        connected: false,
        memory: "error",
        keys: 0,
        memoryPeak: "error",
      };
    }
  }

  /**
   * Clear all cache (use with caution - ideally only for testing)
   */
  async clearAll(): Promise<void> {
    try {
      if (!redis) return;

      await redis.flushdb();
      logger.info("[Cache] All cache cleared");
    } catch (error) {
      logger.error("[Cache] Failed to clear all cache:", error);
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
