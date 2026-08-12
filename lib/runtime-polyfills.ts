/**
 * Polyfill dei metodi JS moderni usati dalle dipendenze (expo-router /
 * react-navigation / reanimated) che NON esistono sui WebView Android datati,
 * come il browser in-app di WhatsApp/Gmail.
 *
 * Caso reale: aprendo /join-link/<code> dal browser interno di WhatsApp la
 * navigazione crashava ("Something went wrong") perché react-navigation chiama
 * `routes.findLast(...)` (Chrome >= 97) durante il render. Altri metodi a
 * rischio trovati nel bundle esportato: toSorted/toReversed (Chrome >= 110),
 * structuredClone (>= 98), Object.hasOwn (>= 93), at (>= 92),
 * replaceAll (>= 85), crypto.randomUUID (>= 92).
 *
 * Questo modulo va importato PRIMA di ogni altro import applicativo in
 * app/_layout.tsx. I guard `typeof`/`in` lo rendono un no-op sui runtime
 * moderni (e su Hermes nativo). Nessuna dipendenza esterna.
 */

/* eslint-disable no-extend-native */

type AnyFn = (...args: unknown[]) => unknown;

function define(obj: object, name: string, fn: AnyFn) {
  try {
    Object.defineProperty(obj, name, {
      value: fn,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    // Mai far fallire il bootstrap per un polyfill.
  }
}

const arrayProto = Array.prototype as unknown as Record<string, unknown>;

if (typeof arrayProto.findLast !== "function") {
  define(Array.prototype, "findLast", function (this: unknown[], predicate: AnyFn, thisArg?: unknown) {
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  } as AnyFn);
}

if (typeof arrayProto.findLastIndex !== "function") {
  define(Array.prototype, "findLastIndex", function (this: unknown[], predicate: AnyFn, thisArg?: unknown) {
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  } as AnyFn);
}

if (typeof arrayProto.at !== "function") {
  define(Array.prototype, "at", function (this: unknown[], index: number) {
    const n = Math.trunc(Number(index)) || 0;
    const i = n < 0 ? this.length + n : n;
    return i >= 0 && i < this.length ? this[i] : undefined;
  } as AnyFn);
}

if (typeof arrayProto.toSorted !== "function") {
  define(Array.prototype, "toSorted", function (this: unknown[], compareFn?: (a: unknown, b: unknown) => number) {
    return [...this].sort(compareFn);
  } as AnyFn);
}

if (typeof arrayProto.toReversed !== "function") {
  define(Array.prototype, "toReversed", function (this: unknown[]) {
    return [...this].reverse();
  } as AnyFn);
}

const stringProto = String.prototype as unknown as Record<string, unknown>;

if (typeof stringProto.at !== "function") {
  define(String.prototype, "at", function (this: string, index: number) {
    const n = Math.trunc(Number(index)) || 0;
    const i = n < 0 ? this.length + n : n;
    return i >= 0 && i < this.length ? this.charAt(i) : undefined;
  } as AnyFn);
}

if (typeof stringProto.replaceAll !== "function") {
  define(String.prototype, "replaceAll", function (
    this: string,
    search: string | RegExp,
    replacement: string | AnyFn,
  ) {
    if (search instanceof RegExp) {
      if (!search.flags.includes("g")) {
        throw new TypeError("replaceAll must be called with a global RegExp");
      }
      return this.replace(search, replacement as string);
    }
    return this.split(String(search)).join(
      typeof replacement === "function" ? String((replacement as AnyFn)(search, 0, this)) : String(replacement),
    );
  } as AnyFn);
}

if (typeof (Object as unknown as Record<string, unknown>).hasOwn !== "function") {
  define(Object, "hasOwn", function (obj: object, key: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(Object(obj), key);
  } as AnyFn);
}

const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.structuredClone !== "function") {
  define(globalThis, "structuredClone", function (value: unknown) {
    // Fallback JSON: sufficiente per gli oggetti di configurazione animazioni
    // (reanimated) che sono plain objects serializzabili.
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  } as AnyFn);
}

const cryptoObj = g.crypto as { randomUUID?: unknown; getRandomValues?: (a: Uint8Array) => Uint8Array } | undefined;
if (cryptoObj && typeof cryptoObj.getRandomValues === "function" && typeof cryptoObj.randomUUID !== "function") {
  define(cryptoObj as object, "randomUUID", function () {
    const bytes = cryptoObj.getRandomValues!(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } as AnyFn);
}

export {};
