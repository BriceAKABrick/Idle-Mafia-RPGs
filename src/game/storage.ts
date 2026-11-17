// SafeStorage: Cross-origin iframe & private browsing resilient storage wrapper.
// Safari, Brave, and Incognito modes inside itch.io iframes can throw SecurityError
// even when accessing the `window.localStorage` getter. This utility wraps every
// access in try/catch and transparently falls back to an in-memory Map.

const memoryFallback = new Map<string, string>();
let storageProbed = false;
let nativeLocalStorage: Storage | null = null;

function probeNativeStorage(): Storage | null {
  if (storageProbed) return nativeLocalStorage;
  storageProbed = true;
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage;
    if (!ls) return null;
    const probeKey = '__syndicate_storage_probe__';
    ls.setItem(probeKey, '1');
    ls.removeItem(probeKey);
    nativeLocalStorage = ls;
    return ls;
  } catch {
    nativeLocalStorage = null;
    return null;
  }
}

export const SafeStorage = {
  isPersistent(): boolean {
    return probeNativeStorage() !== null;
  },

  getItem(key: string): string | null {
    const ls = probeNativeStorage();
    if (ls) {
      try {
        const val = ls.getItem(key);
        if (val !== null) {
          memoryFallback.set(key, val);
          return val;
        }
      } catch {
        // Fall through to in-memory fallback
      }
    }
    return memoryFallback.get(key) ?? null;
  },

  setItem(key: string, value: string): boolean {
    memoryFallback.set(key, value);
    const ls = probeNativeStorage();
    if (ls) {
      try {
        ls.setItem(key, value);
        return true;
      } catch {
        // QuotaExceededError or SecurityError — value remains safely in memoryFallback
      }
    }
    return false;
  },

  removeItem(key: string): void {
    memoryFallback.delete(key);
    const ls = probeNativeStorage();
    if (ls) {
      try {
        ls.removeItem(key);
      } catch {
        // Ignore storage errors
      }
    }
  },

  clear(): void {
    memoryFallback.clear();
    const ls = probeNativeStorage();
    if (ls) {
      try {
        ls.clear();
      } catch {
        // Ignore storage errors
      }
    }
  },
};

if (typeof window !== 'undefined') {
  try {
    (window as unknown as { SafeStorage?: typeof SafeStorage }).SafeStorage = SafeStorage;
  } catch {
    // Ignore frozen/locked window environments
  }
}
