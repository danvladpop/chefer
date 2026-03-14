'use client';

import { useCallback, useEffect, useState } from 'react';

type SetValue<T> = (value: T | ((prevValue: T) => T)) => void;

/**
 * A type-safe hook for reading and writing to localStorage.
 * Handles SSR gracefully by returning the default value on the server.
 * Syncs across tabs using the 'storage' event.
 *
 * @param key - The localStorage key
 * @param initialValue - The default value if no value is found
 * @returns [storedValue, setValue, removeValue]
 *
 * @example
 * const [theme, setTheme, removeTheme] = useLocalStorage('theme', 'light');
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, SetValue<T>, () => void] {
  // Initialize state with the value from localStorage (or default)
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage.
  const setValue: SetValue<T> = useCallback(
    (value) => {
      if (typeof window === 'undefined') {
        console.warn(`Cannot set localStorage key "${key}" on the server`);
        return;
      }
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));

        // Dispatch a custom event so other hooks with the same key can sync
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(valueToStore) }));
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue],
  );

  const removeValue = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: null }));
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Listen for changes in other tabs/windows
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== key) {
        return;
      }

      try {
        const newValue = event.newValue !== null
          ? (JSON.parse(event.newValue) as T)
          : initialValue;
        setStoredValue(newValue);
      } catch (error) {
        console.warn(`Error parsing storage event for key "${key}":`, error);
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
