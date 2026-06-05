import { Effect, Option, Queue } from "effect";

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

const ESC = 0x1b;
const CSI = 0x5b;
const SS3 = 0x4f;

function parseEscape(byte: number): Option.Option<KeyEvent> {
  switch (byte) {
    case 0x41:
      return Option.some({ kind: "up" });
    case 0x42:
      return Option.some({ kind: "down" });
    case 0x43:
      return Option.some({ kind: "right" });
    case 0x44:
      return Option.some({ kind: "left" });
    default:
      return Option.none();
  }
}

function drainBuffer(buf: Buffer): {
  readonly events: KeyEvent[];
  readonly pending: Buffer;
} {
  let cursor = 0;
  let pending: Buffer = Buffer.alloc(0);
  const events: KeyEvent[] = [];

  while (cursor < buf.length) {
    if (
      buf[cursor] === ESC &&
      cursor + 2 < buf.length &&
      (buf[cursor + 1] === CSI || buf[cursor + 1] === SS3)
    ) {
      const kind = parseEscape(buf[cursor + 2]!);
      if (Option.isSome(kind)) {
        events.push(kind.value);
        cursor += 3;
        continue;
      }
    }
    const byte = buf[cursor]!;
    if (byte === 0x0d || byte === 0x0a) {
      events.push({ kind: "enter" } as KeyEvent);
      cursor++;
      continue;
    }
    if (byte === ESC) {
      if (buf.length - cursor < 3) {
        pending = buf.subarray(cursor) as Buffer;
        return { events, pending };
      }
      cursor++;
      continue;
    }
    if (byte === 0x7f || byte === 0x08) {
      events.push({ kind: "erase" } as KeyEvent);
      cursor++;
      continue;
    }
    if (byte >= 0x31 && byte <= 0x39) {
      events.push({
        kind: "number",
        value: (byte - 0x30) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
      });
      cursor++;
      continue;
    }
    if (byte === 0x30) {
      events.push({ kind: "erase" } as KeyEvent);
      cursor++;
      continue;
    }
    const rawChar = String.fromCharCode(byte);
    const char = rawChar.toLowerCase();
    if (char === "w" || char === "k") {
      events.push({ kind: "up" });
      cursor++;
      continue;
    }
    if (char === "s" || char === "j") {
      events.push({ kind: "down" });
      cursor++;
      continue;
    }
    if (char === "a" || char === "h") {
      events.push({ kind: "left" });
      cursor++;
      continue;
    }
    if (char === "d" || char === "l") {
      events.push({ kind: "right" });
      cursor++;
      continue;
    }
    if (char === "q") {
      events.push({ kind: "quit" });
      cursor++;
      continue;
    }
    if (char === "?") {
      events.push({ kind: "hint" });
      cursor++;
      continue;
    }
    if (char === "e" || char === "m" || char === "x") {
      events.push({ kind: "char", value: char });
      cursor++;
      continue;
    }
    events.push({ kind: "char", value: char });
    cursor++;
  }
  return { events, pending };
}

export function makeReadKey(): Effect.Effect<{
  readonly readKey: Effect.Effect<KeyEvent>;
  readonly restoreStdin: Effect.Effect<void>;
}> {
  return Effect.gen(function* (_) {
    const queue = yield* Queue.unbounded<KeyEvent>();
    let inputPending: Buffer = Buffer.alloc(0);

    function onData(chunk: Buffer) {
      const combined = Buffer.concat([inputPending, chunk]);
      const { events, pending } = drainBuffer(combined);
      inputPending = pending;
      for (const event of events) {
        Queue.unsafeOffer(queue, event);
      }
    }

    const readKey: Effect.Effect<KeyEvent> = Queue.take(queue);

    const setupStdin = Effect.sync(() => {
      if (typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", onData);
        dbg("raw mode activated");
      } else {
        process.stdin.resume();
        process.stdin.on("data", onData);
        dbg("line mode activated");
      }
    });

    const restoreStdin = Effect.sync(() => {
      try {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        if (typeof process.stdin.setRawMode === "function") {
          process.stdin.setRawMode(false);
        }
        inputPending = Buffer.alloc(0);
        dbg("stdin restored");
      } catch {
        // stdin might already be destroyed
      }
    });

    yield* setupStdin;
    return { readKey, restoreStdin };
  });
}
