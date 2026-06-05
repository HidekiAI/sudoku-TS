import { Array, Effect } from "effect";
import chalk from "chalk";
import type { Board } from "@sudoku-ts/shared";
import type { ClientState } from "../state.js";
import { serverUrl } from "../api/game-api.js";

// Thin (cell-level)
const H = "─";
const V = "│";
const C = "┼";
const TL = "┌";
const TR = "┐";
const BL = "└";
const BR = "┘";
const TC = "┬";
const BC = "┴";
const LC = "├";
const RC = "┤";

// Thick (3×3 block-level)
const HH = "═";
const VV = "║";
const CC = "╬";
const TTL = "╔";
const TTR = "╗";
const BBL = "╚";
const BBR = "╝";
const TTC = "╦";
const BBC = "╩";
const LLC = "╠";
const RRC = "╣";

function renderCell(
  value: number,
  isGiven: boolean,
  isCursor: boolean,
  isConflict: boolean,
): string {
  const display = value === 0 ? "." : String(value);
  const base = isConflict
    ? chalk.red.bold(display)
    : isGiven
      ? chalk.cyan.bold(display)
      : value !== 0
        ? chalk.green(display)
        : chalk.dim(display);
  const styled = isCursor ? chalk.bgYellow.black(base) : base;
  return ` ${styled} `;
}

function cellDiv(line: string, cross: string): string {
  return `${line.repeat(3)}${cross}${line.repeat(3)}${cross}${line.repeat(3)}`;
}

function blockDiv(
  left: string, // ╔ ╠ ╚ ┌ ├ └
  thinCross: string, // ┬ ┼ ┴
  thickCross: string, // ╦ ╬ ╩
  right: string, // ╗ ╣ ╝ ┤ ┘
  line: string, // ─ ═
  blockJoin: string, // ╦ ╬ ╩
): string {
  const inner = cellDiv(line, thinCross);
  return `  ${left}${inner}${blockJoin}${inner}${blockJoin}${inner}${right}`;
}

function renderStatusLine(state: ClientState): string {
  const diff = chalk.cyan(state.difficulty.padEnd(8));
  const moves = chalk.yellow(String(state.movesCount));
  const time = chalk.white(`${state.elapsedSeconds}s`);
  const status =
    state.status === "completed"
      ? chalk.green("✓ SOLVED")
      : chalk.blue("● PLAYING");
  return `  ${status}  ${diff}  Moves: ${moves}  Time: ${time}`;
}

function renderMessage(state: ClientState): string {
  const msg = state.message;
  if (state.phase === "completed") {
    return `  ${chalk.green.bold(msg)}`;
  }
  if (msg.startsWith("Incorrect") || msg.startsWith("Cannot")) {
    return `  ${chalk.red(msg)}`;
  }
  return `  ${chalk.white(msg)}`;
}

function renderBoardGrid(state: ClientState): string[] {
  const topThick = blockDiv(TTL, TC, TTC, TTR, HH, TTC);
  const midThick = blockDiv(LLC, C, CC, RRC, HH, CC);
  const botThick = blockDiv(BBL, BC, BBC, BBR, HH, BBC);
  const cellThin = blockDiv(LC, C, CC, RC, H, CC);

  const gridLines = Array.flatMap(
    Array.makeBy(9, (r) => r),
    (r) => {
      const rowLine = `  ${VV}${Array.makeBy(3, (g) =>
        Array.makeBy(3, (c) => {
          const col = g * 3 + c;
          const value = state.board[r]?.[col] ?? 0;
          const isGiven = state.givenMask[r]?.[col] ?? false;
          const isCursor = state.cursor.row === r && state.cursor.col === col;
          const isConflict = state.conflicts[r]?.[col] ?? false;
          return renderCell(value, isGiven, isCursor, isConflict);
        }).join(V),
      ).join(VV)}${VV}`;
      if (r === 2 || r === 5) return [rowLine, midThick];
      if (r < 8) return [rowLine, cellThin];
      return [rowLine];
    },
  );

  return ["", topThick, ...gridLines, botThick, ""];
}

export function renderConnectingString(): string {
  return [
    `${chalk.bold("  SUDOKU")}`,
    `${chalk.dim("  ───────")}`,
    "",
    `  ${chalk.yellow("⟳")}  ${chalk.white("Waiting for server...")}`,
    "",
    `  ${chalk.dim("Server:")}  ${chalk.cyan(serverUrl())}`,
    "",
    `  ${chalk.dim("Status:")}  ${chalk.yellow("connecting")}`,
    "",
    `${chalk.dim("  Make sure the server is running and try again.")}`,
    "",
    `  ${chalk.dim("Press")} ${chalk.white("q")} ${chalk.dim("to return to menu")}`,
  ].join("\n");
}

function renderGameBoard(state: ClientState): string {
  return [
    `${chalk.bold("  SUDOKU")}`,
    `${chalk.dim("  ───────")}`,
    ...renderBoardGrid(state),
    renderStatusLine(state),
    renderMessage(state),
  ].join("\n");
}

export function render(state: ClientState): Effect.Effect<void> {
  return Effect.sync(() => {
    console.clear();
    if (state.phase === "connecting") {
      console.log(renderConnectingString());
    } else {
      console.log(renderGameBoard(state));
    }
  });
}
