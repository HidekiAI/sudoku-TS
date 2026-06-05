import { Effect } from "effect";
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
  let styled: string;
  if (isConflict) {
    styled = chalk.red.bold(display);
  } else if (isGiven) {
    styled = chalk.cyan.bold(display);
  } else if (value !== 0) {
    styled = chalk.green(display);
  } else {
    styled = chalk.dim(display);
  }
  if (isCursor) {
    styled = chalk.bgYellow.black(styled);
  }
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
  const lines: string[] = [];
  const topThick = blockDiv(TTL, TC, TTC, TTR, HH, TTC);
  const topThin = blockDiv(TL, TC, TTC, TR, H, TTC);
  const midThick = blockDiv(LLC, C, CC, RRC, HH, CC);
  const botThick = blockDiv(BBL, BC, BBC, BBR, HH, BBC);
  const botThin = blockDiv(BL, BC, BBC, BR, H, BBC);
  const cellThin = blockDiv(LC, C, CC, RC, H, CC);

  lines.push("");
  lines.push(topThick);
  for (let r = 0; r < 9; r++) {
    const rowParts: string[] = [];
    for (let g = 0; g < 3; g++) {
      const cells: string[] = [];
      for (let c = g * 3; c < g * 3 + 3; c++) {
        const value = state.board[r]?.[c] ?? 0;
        const isGiven = state.givenMask[r]?.[c] ?? false;
        const isCursor = state.cursor.row === r && state.cursor.col === c;
        const isConflict = state.conflicts[r]?.[c] ?? false;
        cells.push(renderCell(value, isGiven, isCursor, isConflict));
      }
      rowParts.push(cells.join(V));
    }
    lines.push(`  ${VV}${rowParts.join(VV)}${VV}`);
    if (r === 2 || r === 5) {
      lines.push(midThick);
    } else if (r < 8) {
      lines.push(cellThin);
    }
  }
  lines.push(botThick);
  lines.push("");
  return lines;
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
