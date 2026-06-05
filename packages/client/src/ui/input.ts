import { Effect } from "effect";

const debug = () => process.env["SUDOKU_DEBUG"] !== undefined;
function dbg(...args: unknown[]) {
  if (debug()) process.stderr.write(`[key] ${args.map(String).join(" ")}\n`);
}

export type KeyEvent =
  | { readonly kind: "up" }
  | { readonly kind: "down" }
  | { readonly kind: "left" }
  | { readonly kind: "right" }
  | {
      readonly kind: "number";
      readonly value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    }
  | { readonly kind: "erase" }
  | { readonly kind: "hint" }
  | { readonly kind: "quit" }
  | { readonly kind: "enter" }
  | { readonly kind: "char"; readonly value: string }
  | { readonly kind: "unknown" };

let rawActive = false;
let pending = Buffer.alloc(0);
let buffer: Buffer[] = [];
let queued: KeyEvent[] = [];

const ESC = 0x1b;
const CSI = 0x5b;
const SS3 = 0x4f;

function parseEscape(byte: number): KeyEvent | null {
  switch (byte) {
    case 0x41:
      return { kind: "up" };
    case 0x42:
      return { kind: "down" };
    case 0x43:
      return { kind: "right" };
    case 0x44:
      return { kind: "left" };
    default:
      return null;
  }
}

// persistent data handler — never removed, just buffers
function onData(chunk: Buffer) {
  dbg("raw bytes:", [...chunk].map((b) => b.toString(16)).join(" "));
  buffer.push(chunk);
  const data = Buffer.concat(buffer);
  buffer = [];
  drainBuffer(data);
  tryDeliver();
}

function drainBuffer(data: Buffer): Buffer {
  const buf = Buffer.concat([pending, data]);
  pending = Buffer.alloc(0);

  let cursor = 0;
  while (cursor < buf.length) {
    if (
      buf[cursor] === ESC &&
      cursor + 2 < buf.length &&
      (buf[cursor + 1] === CSI || buf[cursor + 1] === SS3)
    ) {
      const kind = parseEscape(buf[cursor + 2]!);
      if (kind !== null) {
        queued.push(kind);
        cursor += 3;
        continue;
      }
    }
    const byte = buf[cursor]!;
    if (byte === 0x0d || byte === 0x0a) {
      queued.push({ kind: "enter" } as KeyEvent);
      cursor++;
      continue;
    }
    if (byte === ESC) {
      if (buf.length - cursor < 3) {
        pending = buf.subarray(cursor);
        return pending;
      }
      cursor++;
      continue;
    }
    if (byte === 0x7f || byte === 0x08) {
      queued.push({ kind: "erase" } as KeyEvent);
      cursor++;
      continue;
    }
    if (byte >= 0x31 && byte <= 0x39) {
      queued.push({
        kind: "number",
        value: (byte - 0x30) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
      });
      cursor++;
      continue;
    }
    if (byte === 0x30) {
      queued.push({ kind: "erase" } as KeyEvent);
      cursor++;
      continue;
    }
    const rawChar = String.fromCharCode(byte);
    const char = rawChar.toLowerCase();
    // WASD / hjkl movement
    if (char === "w" || char === "k") {
      queued.push({ kind: "up" });
      cursor++;
      continue;
    }
    if (char === "s" || char === "j") {
      queued.push({ kind: "down" });
      cursor++;
      continue;
    }
    if (char === "a" || char === "h") {
      queued.push({ kind: "left" });
      cursor++;
      continue;
    }
    if (char === "d" || char === "l") {
      queued.push({ kind: "right" });
      cursor++;
      continue;
    }
    if (char === "q") {
      queued.push({ kind: "quit" });
      cursor++;
      continue;
    }
    if (char === "?") {
      queued.push({ kind: "hint" });
      cursor++;
      continue;
    }
    if (char === "e" || char === "m" || char === "x") {
      queued.push({ kind: "char", value: char });
      cursor++;
      continue;
    }
    queued.push({ kind: "char", value: char });
    cursor++;
  }
  return pending;
}

let resolveRead: ((key: KeyEvent) => void) | null = null;

function tryDeliver() {
  if (resolveRead !== null && queued.length > 0) {
    const key = queued.shift()!;
    dbg("deliver:", JSON.stringify(key));
    const r = resolveRead;
    resolveRead = null;
    r(key);
  }
}

function readKeyRaw(): Effect.Effect<KeyEvent> {
  return Effect.async<KeyEvent>((resume) => {
    resolveRead = (key: KeyEvent) => resume(Effect.succeed(key));
    tryDeliver();
  });
}

function readKeyLine(): Effect.Effect<KeyEvent> {
  return Effect.async<KeyEvent>((resume) => {
    const stdin = process.stdin;
    const onData = (data: Buffer) => {
      stdin.removeListener("data", onData);
      const line = data.toString();
      dbg("line input:", JSON.stringify(line));
      const trimmed = line.trim();
      if (trimmed.length === 1) {
        const byte = trimmed.charCodeAt(0);
        if (byte >= 0x31 && byte <= 0x39) {
          resume(
            Effect.succeed({
              kind: "number",
              value: (byte - 0x30) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
            }),
          );
          return;
        }
        const char = trimmed.toLowerCase();
        if (char === "q") {
          resume(Effect.succeed({ kind: "quit" }));
          return;
        }
        if (char === "h") {
          resume(Effect.succeed({ kind: "hint" }));
          return;
        }
        if (char === "e" || char === "m" || char === "x") {
          resume(Effect.succeed({ kind: "char", value: char }));
          return;
        }
        if (char === "0") {
          resume(Effect.succeed({ kind: "erase" }));
          return;
        }
      }
      if (trimmed === "") {
        resume(Effect.succeed({ kind: "enter" }));
        return;
      }
      resume(Effect.succeed({ kind: "unknown" }));
    };
    stdin.resume();
    stdin.on("data", onData);
  });
}

export function readKey(): Effect.Effect<KeyEvent> {
  return Effect.sync(() => typeof process.stdin.setRawMode === "function").pipe(
    Effect.flatMap((canRaw) => {
      if (canRaw) {
        if (!rawActive) {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          rawActive = true;
          process.stdin.on("data", onData);
          dbg("raw mode activated + persistent listener");
        }
        return readKeyRaw();
      }
      return readKeyLine();
    }),
  );
}

export function restoreStdin(): Effect.Effect<void> {
  return Effect.sync(() => {
    try {
      rawActive = false;
      queued = [];
      buffer = [];
      pending = Buffer.alloc(0);
      resolveRead = null;
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      process.stdin.setRawMode(false);
      dbg("stdin restored");
    } catch {
      // stdin might already be destroyed
    }
  });
}
