export const TOTAL_NUMBERS = 25;
export const MIN_PICK = 15;
export const MAX_PICK = 20;

export type Game = number[];

export function generateGame(count: number): Game {
  const numbers: number[] = [];
  while (numbers.length < count) {
    const n = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
    if (!numbers.includes(n)) numbers.push(n);
  }
  return numbers.sort((a, b) => a - b);
}

export function generateGames(quantity: number, numbersPerGame: number): Game[] {
  return Array.from({ length: quantity }, () => generateGame(numbersPerGame));
}

export function checkGame(game: Game, result: number[]): { matches: number; matched: number[]; missed: number[] } {
  const matched = game.filter((n) => result.includes(n));
  const missed = game.filter((n) => !result.includes(n));
  return { matches: matched.length, matched, missed };
}

export interface DrawResult {
  concurso: number;
  data: string;
  dezenas: string[];
}

export async function fetchLatestDraw(): Promise<DrawResult> {
  const res = await fetch("https://loteriascaixa-api.herokuapp.com/api/lotofacil/latest");
  if (!res.ok) throw new Error("Falha ao buscar resultado");
  const data = await res.json();
  return {
    concurso: data.concurso,
    data: data.data,
    dezenas: data.dezenas,
  };
}
