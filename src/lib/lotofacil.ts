export const TOTAL_NUMBERS = 25;
export const MIN_PICK = 15;
export const MAX_PICK = 20;

export type Game = number[];

// Rows of the Lotofácil grid (5x5)
export const ROWS = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20],
  [21, 22, 23, 24, 25],
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

export async function fetchDraw(concurso: number): Promise<DrawResult> {
  const res = await fetch(`https://loteriascaixa-api.herokuapp.com/api/lotofacil/${concurso}`);
  if (!res.ok) throw new Error(`Falha ao buscar concurso ${concurso}`);
  const data = await res.json();
  return {
    concurso: data.concurso,
    data: data.data,
    dezenas: data.dezenas,
  };
}

// ============ MOTOR IA ============

export interface MotorAnalysis {
  draws: DrawResult[];
  frequency: Record<number, number>;       // how many times each number appeared in last 5
  hotNumbers: number[];                     // most frequent (sorted desc)
  coldNumbers: number[];                    // least frequent (sorted asc)
  rowDistribution: number[];                // avg picks per row across last 5
  pairFrequency: Map<string, number>;       // pairs that appear together
  consecutivePatterns: number[];            // how many consecutive numbers per draw avg
  evenOddRatio: { even: number; odd: number }; // average even/odd split
}

export async function fetchLast5Draws(): Promise<DrawResult[]> {
  const latest = await fetchLatestDraw();
  const concursoStart = latest.concurso;

  const promises = [
    Promise.resolve(latest),
    ...Array.from({ length: 4 }, (_, i) => fetchDraw(concursoStart - (i + 1))),
  ];

  const draws = await Promise.all(promises);
  return draws.sort((a, b) => a.concurso - b.concurso);
}

export function analyzeDraws(draws: DrawResult[]): MotorAnalysis {
  const frequency: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) frequency[i] = 0;

  const pairFrequency = new Map<string, number>();
  let totalEven = 0;
  let totalOdd = 0;
  let totalConsecutive = 0;
  const rowTotals = [0, 0, 0, 0, 0];

  for (const draw of draws) {
    const nums = draw.dezenas.map(Number).sort((a, b) => a - b);

    // Frequency
    for (const n of nums) {
      frequency[n]++;
    }

    // Pairs
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${nums[i]}-${nums[j]}`;
        pairFrequency.set(key, (pairFrequency.get(key) || 0) + 1);
      }
    }

    // Even/Odd
    totalEven += nums.filter((n) => n % 2 === 0).length;
    totalOdd += nums.filter((n) => n % 2 !== 0).length;

    // Consecutive
    let consec = 0;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1] + 1) consec++;
    }
    totalConsecutive += consec;

    // Row distribution
    for (let r = 0; r < 5; r++) {
      rowTotals[r] += nums.filter((n) => ROWS[r].includes(n)).length;
    }
  }

  const count = draws.length;
  const entries = Object.entries(frequency).map(([k, v]) => ({ num: Number(k), freq: v }));
  const hotNumbers = [...entries].sort((a, b) => b.freq - a.freq).map((e) => e.num);
  const coldNumbers = [...entries].sort((a, b) => a.freq - b.freq).map((e) => e.num);

  return {
    draws,
    frequency,
    hotNumbers,
    coldNumbers,
    rowDistribution: rowTotals.map((t) => Math.round(t / count)),
    pairFrequency,
    consecutivePatterns: [Math.round(totalConsecutive / count)],
    evenOddRatio: {
      even: Math.round(totalEven / count),
      odd: Math.round(totalOdd / count),
    },
  };
}

/**
 * Generate a smart game using weighted probability based on analysis.
 * Strategy:
 * 1. Weight hot numbers higher (appeared more in last 5 draws)
 * 2. Respect average row distribution
 * 3. Maintain similar even/odd ratio
 * 4. Include some top pairs
 * 5. Add slight randomness to avoid identical games
 */
export function generateSmartGame(analysis: MotorAnalysis, count: number): Game {
  const { frequency, rowDistribution, evenOddRatio } = analysis;

  // Build weighted pool: each number gets weight = frequency + 1 (so cold numbers still have a chance)
  const weights: { num: number; weight: number }[] = [];
  for (let i = 1; i <= 25; i++) {
    // Base weight from frequency (higher = more likely)
    const freqWeight = frequency[i] + 1;
    // Small random factor to diversify
    const randomFactor = 0.5 + Math.random();
    weights.push({ num: i, weight: freqWeight * randomFactor });
  }

  // Target row distribution (scale to match count)
  const totalRowDist = rowDistribution.reduce((a, b) => a + b, 0);
  const targetRows = rowDistribution.map((r) => Math.round((r / totalRowDist) * count));

  // Adjust so sum equals count
  let diff = count - targetRows.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const idx = Math.floor(Math.random() * 5);
    if (diff > 0 && targetRows[idx] < 5) {
      targetRows[idx]++;
      diff--;
    } else if (diff < 0 && targetRows[idx] > 0) {
      targetRows[idx]--;
      diff++;
    }
  }

  // Target even/odd
  const targetEven = Math.round((evenOddRatio.even / (evenOddRatio.even + evenOddRatio.odd)) * count);
  const targetOdd = count - targetEven;

  // Pick numbers row by row, weighted
  const selected: number[] = [];
  let evenCount = 0;
  let oddCount = 0;

  for (let r = 0; r < 5; r++) {
    const rowNums = ROWS[r];
    const rowWeights = rowNums
      .map((n) => {
        const w = weights.find((x) => x.num === n)!;
        // Boost or penalize based on even/odd balance
        let eoBonus = 1;
        if (n % 2 === 0 && evenCount >= targetEven) eoBonus = 0.3;
        if (n % 2 !== 0 && oddCount >= targetOdd) eoBonus = 0.3;
        return { num: n, weight: w.weight * eoBonus };
      })
      .sort((a, b) => b.weight - a.weight);

    const pickCount = Math.min(targetRows[r], rowNums.length);
    // Weighted random selection from this row
    const rowPool = [...rowWeights];
    for (let p = 0; p < pickCount && rowPool.length > 0; p++) {
      const totalW = rowPool.reduce((s, x) => s + x.weight, 0);
      let rand = Math.random() * totalW;
      let pickedIdx = 0;
      for (let i = 0; i < rowPool.length; i++) {
        rand -= rowPool[i].weight;
        if (rand <= 0) {
          pickedIdx = i;
          break;
        }
      }
      const picked = rowPool[pickedIdx];
      selected.push(picked.num);
      if (picked.num % 2 === 0) evenCount++;
      else oddCount++;
      rowPool.splice(pickedIdx, 1);
    }
  }

  // If we still need more numbers (rounding issues), fill from remaining weighted
  const remaining = Array.from({ length: 25 }, (_, i) => i + 1)
    .filter((n) => !selected.includes(n))
    .map((n) => ({ num: n, weight: (weights.find((w) => w.num === n)?.weight || 1) }))
    .sort((a, b) => b.weight - a.weight);

  while (selected.length < count && remaining.length > 0) {
    const totalW = remaining.reduce((s, x) => s + x.weight, 0);
    let rand = Math.random() * totalW;
    let idx = 0;
    for (let i = 0; i < remaining.length; i++) {
      rand -= remaining[i].weight;
      if (rand <= 0) { idx = i; break; }
    }
    selected.push(remaining[idx].num);
    remaining.splice(idx, 1);
  }

  return selected.sort((a, b) => a - b);
}

export function generateSmartGames(
  analysis: MotorAnalysis,
  quantity: number,
  numbersPerGame: number
): Game[] {
  const games: Game[] = [];
  const seen = new Set<string>();

  let attempts = 0;
  while (games.length < quantity && attempts < quantity * 10) {
    const game = generateSmartGame(analysis, numbersPerGame);
    const key = game.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      games.push(game);
    }
    attempts++;
  }

  return games;
}

// ============ MOTOR EINSTEIN ============
// Inspired by Einstein's concepts: entropy, statistical equilibrium,
// hidden variable theory, symmetry breaking, and Boltzmann distribution

export interface EinsteinAnalysis {
  draws: DrawResult[];
  entropy: Record<number, number>;          // Shannon entropy per number position
  boltzmannWeights: Record<number, number>; // Boltzmann-like energy distribution
  symmetryScore: Record<number, number>;    // How "balanced" each number is
  hiddenPatterns: number[][];               // Discovered hidden correlations
  equilibriumState: number[];               // Numbers at statistical equilibrium
  deviationNumbers: number[];               // Numbers deviating from expected distribution
  goldenRatioPositions: number[];           // Numbers aligned with golden ratio spacing
}

export function analyzeDrawsEinstein(draws: DrawResult[]): EinsteinAnalysis {
  const allNums = draws.map(d => d.dezenas.map(Number).sort((a, b) => a - b));
  const totalDraws = draws.length;

  // 1. Frequency base
  const freq: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) freq[i] = 0;
  for (const nums of allNums) for (const n of nums) freq[n]++;

  // 2. Shannon Entropy per number — measures unpredictability
  const entropy: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    const p = freq[i] / (totalDraws * 15); // probability of appearance
    entropy[i] = p > 0 ? -p * Math.log2(p) - (1 - p) * Math.log2(1 - p || 0.001) : 0;
  }

  // 3. Boltzmann Distribution — "energy levels" based on deviation from expected
  const expectedFreq = (totalDraws * 15) / 25; // expected uniform frequency
  const boltzmannWeights: Record<number, number> = {};
  const kT = 1.5; // temperature parameter
  for (let i = 1; i <= 25; i++) {
    const energy = Math.abs(freq[i] - expectedFreq);
    boltzmannWeights[i] = Math.exp(-energy / kT);
  }

  // 4. Symmetry Score — how symmetrically a number appears relative to center (13)
  const symmetryScore: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    const mirror = 26 - i; // symmetric counterpart
    const myFreq = freq[i] || 0;
    const mirrorFreq = freq[mirror] || 0;
    symmetryScore[i] = 1 / (1 + Math.abs(myFreq - mirrorFreq)); // closer = higher score
  }

  // 5. Hidden Variable Patterns — pairs/triples that always appear together (Einstein's hidden variables)
  const pairMap = new Map<string, number>();
  for (const nums of allNums) {
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${nums[i]}-${nums[j]}`;
        pairMap.set(key, (pairMap.get(key) || 0) + 1);
      }
    }
  }
  const hiddenPatterns: number[][] = [];
  for (const [key, count] of pairMap.entries()) {
    if (count >= totalDraws * 0.8) { // appears in 80%+ of draws
      hiddenPatterns.push(key.split("-").map(Number));
    }
  }

  // 6. Equilibrium State — numbers closest to expected frequency (stable)
  const deviations = Array.from({ length: 25 }, (_, i) => ({
    num: i + 1,
    dev: Math.abs(freq[i + 1] - expectedFreq),
  }));
  deviations.sort((a, b) => a.dev - b.dev);
  const equilibriumState = deviations.slice(0, 12).map(d => d.num);
  const deviationNumbers = deviations.slice(12).map(d => d.num);

  // 7. Golden Ratio positions — Fibonacci/golden ratio spacing
  const phi = 1.618033988749;
  const goldenRatioPositions: number[] = [];
  for (let i = 1; i <= 25; i++) {
    const goldenPos = Math.round(((i * phi) % 25) + 1);
    if (goldenPos >= 1 && goldenPos <= 25 && !goldenRatioPositions.includes(goldenPos)) {
      goldenRatioPositions.push(goldenPos);
    }
  }

  return {
    draws,
    entropy,
    boltzmannWeights,
    symmetryScore,
    hiddenPatterns,
    equilibriumState,
    deviationNumbers,
    goldenRatioPositions,
  };
}

export function generateEinsteinGame(analysis: EinsteinAnalysis, count: number): Game {
  const { boltzmannWeights, symmetryScore, entropy, hiddenPatterns, goldenRatioPositions } = analysis;

  // Composite weight combining all Einstein factors
  const weights: { num: number; weight: number }[] = [];
  for (let i = 1; i <= 25; i++) {
    const boltzmann = boltzmannWeights[i] || 0.5;
    const symmetry = symmetryScore[i] || 0.5;
    const ent = entropy[i] || 0.5;
    const goldenBonus = goldenRatioPositions.includes(i) ? 1.3 : 1.0;

    // Hidden pattern bonus — numbers in strong pairs get boosted
    let patternBonus = 1.0;
    for (const pair of hiddenPatterns) {
      if (pair.includes(i)) patternBonus += 0.15;
    }

    // Einstein formula: W = B × S × E^0.5 × G × P × R
    const randomFactor = 0.6 + Math.random() * 0.8;
    const weight = boltzmann * symmetry * Math.sqrt(ent + 0.1) * goldenBonus * patternBonus * randomFactor;
    weights.push({ num: i, weight });
  }

  // Weighted random selection
  const selected: number[] = [];
  const pool = [...weights];

  while (selected.length < count && pool.length > 0) {
    const totalW = pool.reduce((s, x) => s + x.weight, 0);
    let rand = Math.random() * totalW;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i].weight;
      if (rand <= 0) { idx = i; break; }
    }
    selected.push(pool[idx].num);
    pool.splice(idx, 1);
  }

  return selected.sort((a, b) => a - b);
}

export function generateEinsteinGames(
  analysis: EinsteinAnalysis,
  quantity: number,
  numbersPerGame: number
): Game[] {
  const games: Game[] = [];
  const seen = new Set<string>();

  let attempts = 0;
  while (games.length < quantity && attempts < quantity * 10) {
    const game = generateEinsteinGame(analysis, numbersPerGame);
    const key = game.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      games.push(game);
    }
    attempts++;
  }

  return games;
}

// ============ MOTOR COMBINADO ============
// Merges weights from Preditivo and Einstein motors

export function generateCombinedGame(
  motorAnalysis: MotorAnalysis,
  einsteinAnalysis: EinsteinAnalysis,
  count: number
): Game {
  const { frequency, rowDistribution, evenOddRatio } = motorAnalysis;
  const { boltzmannWeights, symmetryScore, entropy, hiddenPatterns, goldenRatioPositions } = einsteinAnalysis;

  const weights: { num: number; weight: number }[] = [];
  for (let i = 1; i <= 25; i++) {
    // Preditivo weight
    const freqWeight = (frequency[i] + 1) / 6; // normalize to ~0-1

    // Einstein weight
    const boltzmann = boltzmannWeights[i] || 0.5;
    const symmetry = symmetryScore[i] || 0.5;
    const ent = entropy[i] || 0.5;
    const goldenBonus = goldenRatioPositions.includes(i) ? 1.3 : 1.0;

    let patternBonus = 1.0;
    for (const pair of hiddenPatterns) {
      if (pair.includes(i)) patternBonus += 0.15;
    }

    // Combined formula: average both approaches + randomness
    const preditivoScore = freqWeight;
    const einsteinScore = boltzmann * symmetry * Math.sqrt(ent + 0.1) * goldenBonus * patternBonus;
    const randomFactor = 0.5 + Math.random();

    const weight = (preditivoScore + einsteinScore) * randomFactor;
    weights.push({ num: i, weight });
  }

  // Row-aware selection (from Preditivo logic)
  const totalRowDist = rowDistribution.reduce((a, b) => a + b, 0);
  const targetRows = rowDistribution.map((r) => Math.round((r / totalRowDist) * count));
  let diff = count - targetRows.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const idx = Math.floor(Math.random() * 5);
    if (diff > 0 && targetRows[idx] < 5) { targetRows[idx]++; diff--; }
    else if (diff < 0 && targetRows[idx] > 0) { targetRows[idx]--; diff++; }
  }

  const targetEven = Math.round((evenOddRatio.even / (evenOddRatio.even + evenOddRatio.odd)) * count);
  const targetOdd = count - targetEven;

  const selected: number[] = [];
  let evenCount = 0;
  let oddCount = 0;

  for (let r = 0; r < 5; r++) {
    const rowNums = ROWS[r];
    const rowWeights = rowNums
      .map((n) => {
        const w = weights.find((x) => x.num === n)!;
        let eoBonus = 1;
        if (n % 2 === 0 && evenCount >= targetEven) eoBonus = 0.3;
        if (n % 2 !== 0 && oddCount >= targetOdd) eoBonus = 0.3;
        return { num: n, weight: w.weight * eoBonus };
      })
      .sort((a, b) => b.weight - a.weight);

    const pickCount = Math.min(targetRows[r], rowNums.length);
    const rowPool = [...rowWeights];
    for (let p = 0; p < pickCount && rowPool.length > 0; p++) {
      const totalW = rowPool.reduce((s, x) => s + x.weight, 0);
      let rand = Math.random() * totalW;
      let pickedIdx = 0;
      for (let i = 0; i < rowPool.length; i++) {
        rand -= rowPool[i].weight;
        if (rand <= 0) { pickedIdx = i; break; }
      }
      const picked = rowPool[pickedIdx];
      selected.push(picked.num);
      if (picked.num % 2 === 0) evenCount++;
      else oddCount++;
      rowPool.splice(pickedIdx, 1);
    }
  }

  const remaining = Array.from({ length: 25 }, (_, i) => i + 1)
    .filter((n) => !selected.includes(n))
    .map((n) => ({ num: n, weight: weights.find((w) => w.num === n)?.weight || 1 }))
    .sort((a, b) => b.weight - a.weight);

  while (selected.length < count && remaining.length > 0) {
    const totalW = remaining.reduce((s, x) => s + x.weight, 0);
    let rand = Math.random() * totalW;
    let idx = 0;
    for (let i = 0; i < remaining.length; i++) {
      rand -= remaining[i].weight;
      if (rand <= 0) { idx = i; break; }
    }
    selected.push(remaining[idx].num);
    remaining.splice(idx, 1);
  }

  return selected.sort((a, b) => a - b);
}

export function generateCombinedGames(
  motorAnalysis: MotorAnalysis,
  einsteinAnalysis: EinsteinAnalysis,
  quantity: number,
  numbersPerGame: number
): Game[] {
  const games: Game[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (games.length < quantity && attempts < quantity * 10) {
    const game = generateCombinedGame(motorAnalysis, einsteinAnalysis, numbersPerGame);
    const key = game.join(",");
    if (!seen.has(key)) { seen.add(key); games.push(game); }
    attempts++;
  }
  return games;
}

// ============ NOVOS MOTORES BASEADOS EM MATEMÁTICOS ============

export interface GaussAnalysis {
  draws: DrawResult[];
  normalDistribution: Record<number, number>; // Distribuição normal dos números
  variance: number;                           // Variância dos sorteios
  standardDeviation: number;                  // Desvio padrão
  mean: number;                               // Média dos números sorteados
  confidenceIntervals: { num: number; lower: number; upper: number }[]; // Intervalos de confiança
  leastSquaresFit: number[];                  // Ajuste por mínimos quadrados
}

export interface FibonacciAnalysis {
  draws: DrawResult[];
  fibonacciSequence: number[];                // Sequência de Fibonacci aplicada aos números
  goldenRatioWeights: Record<number, number>; // Pesos baseados na razão áurea
  spiralPositions: number[];                  // Posições em espiral de Fibonacci
  recurrencePatterns: number[][];             // Padrões de recorrência
  phiHarmonics: Record<number, number>;       // Harmônicos da razão áurea
}

export interface TuringAnalysis {
  draws: DrawResult[];
  turingMachineStates: Record<number, number>; // Estados de máquina de Turing simulados
  computabilityScore: Record<number, number>;  // Pontuação de computabilidade
  haltingProbabilities: Record<number, number>; // Probabilidades de parada
  algorithmicComplexity: Record<number, number>; // Complexidade algorítmica
  decisionTreeDepth: number[];                // Profundidade da árvore de decisão
}

export interface PythagorasAnalysis {
  draws: DrawResult[];
  triangularNumbers: number[];                // Números triangulares
  perfectSquares: number[];                   // Quadrados perfeitos
  pythagoreanTriples: number[][];             // Triplas pitagóricas
  geometricRatios: Record<number, number>;    // Razões geométricas
  harmonicSeries: Record<number, number>;     // Série harmônica
}

export function analyzeDrawsGauss(draws: DrawResult[]): GaussAnalysis {
  const allNums = draws.map(d => d.dezenas.map(Number).sort((a, b) => a - b));
  const totalDraws = draws.length;

  // 1. Normal Distribution — Gaussian bell curve fitting
  const freq: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) freq[i] = 0;
  for (const nums of allNums) for (const n of nums) freq[n]++;

  const mean = allNums.flat().reduce((a, b) => a + b, 0) / (totalDraws * 15);
  const variance = allNums.flat().reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / (totalDraws * 15);
  const stdDev = Math.sqrt(variance);

  const normalDistribution: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    const z = (i - mean) / stdDev;
    normalDistribution[i] = Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI));
  }

  // 2. Confidence Intervals — 95% confidence around mean
  const confidenceIntervals = [];
  const zScore = 1.96; // 95% confidence
  for (let i = 1; i <= 25; i++) {
    const lower = mean - zScore * stdDev;
    const upper = mean + zScore * stdDev;
    confidenceIntervals.push({ num: i, lower, upper });
  }

  // 3. Least Squares Fit — linear regression on frequency trends
  const leastSquaresFit: number[] = [];
  const x = Array.from({ length: 25 }, (_, i) => i + 1);
  const y = x.map(n => freq[n]);
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  for (let i = 1; i <= 25; i++) {
    leastSquaresFit.push(slope * i + intercept);
  }

  return {
    draws,
    normalDistribution,
    variance,
    standardDeviation: stdDev,
    mean,
    confidenceIntervals,
    leastSquaresFit,
  };
}

export function analyzeDrawsFibonacci(draws: DrawResult[]): FibonacciAnalysis {
  const allNums = draws.map(d => d.dezenas.map(Number).sort((a, b) => a - b));
  const totalDraws = draws.length;

  // 1. Fibonacci Sequence mapped to lottery numbers
  const fibonacciSequence: number[] = [];
  let a = 1, b = 1;
  while (fibonacciSequence.length < 25) {
    fibonacciSequence.push(a);
    [a, b] = [b, a + b];
  }

  // 2. Golden Ratio Weights — phi-based probability distribution
  const phi = (1 + Math.sqrt(5)) / 2;
  const goldenRatioWeights: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    const ratio = (i * phi) % 1;
    goldenRatioWeights[i] = 1 / (1 + Math.abs(ratio - 0.5)); // Closer to golden ratio = higher weight
  }

  // 3. Spiral Positions — Fibonacci spiral mapping
  const spiralPositions: number[] = [];
  const directions = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // right, down, left, up
  let x = 0, y = 0, dir = 0, steps = 1, stepCount = 0;
  for (let i = 1; i <= 25; i++) {
    spiralPositions.push(Math.abs(x) + Math.abs(y) + 1);
    x += directions[dir][0];
    y += directions[dir][1];
    stepCount++;
    if (stepCount === steps) {
      stepCount = 0;
      dir = (dir + 1) % 4;
      if (dir % 2 === 0) steps++;
    }
  }

  // 4. Recurrence Patterns — Fibonacci-like sequences in draws
  const recurrencePatterns: number[][] = [];
  for (let start = 1; start <= 25; start++) {
    const seq: number[] = [];
    let current = start;
    for (let i = 0; i < 5; i++) {
      if (current <= 25) seq.push(current);
      current += fibonacciSequence[i % fibonacciSequence.length];
    }
    if (seq.length >= 3) recurrencePatterns.push(seq);
  }

  // 5. Phi Harmonics — harmonic series based on golden ratio
  const phiHarmonics: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    phiHarmonics[i] = 1 / (i * phi);
  }

  return {
    draws,
    fibonacciSequence,
    goldenRatioWeights,
    spiralPositions,
    recurrencePatterns,
    phiHarmonics,
  };
}

export function analyzeDrawsTuring(draws: DrawResult[]): TuringAnalysis {
  const allNums = draws.map(d => d.dezenas.map(Number).sort((a, b) => a - b));
  const totalDraws = draws.length;

  // 1. Turing Machine States — simulate simple TM states for each number
  const turingMachineStates: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    // Simple state machine: even/odd transitions
    let state = i % 2;
    for (let j = 0; j < 5; j++) {
      state = (state + 1) % 2; // Toggle state
    }
    turingMachineStates[i] = state;
  }

  // 2. Computability Score — based on algorithmic complexity
  const computabilityScore: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    // Score based on prime factors (more factors = more complex)
    let factors = 0;
    for (let j = 2; j <= Math.sqrt(i); j++) {
      if (i % j === 0) factors++;
    }
    computabilityScore[i] = factors / Math.log(i + 1);
  }

  // 3. Halting Probabilities — probability that a "computation" halts
  const haltingProbabilities: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    // Based on Collatz conjecture steps until reaching 1
    let steps = 0;
    let n = i;
    while (n !== 1 && steps < 100) {
      n = n % 2 === 0 ? n / 2 : 3 * n + 1;
      steps++;
    }
    haltingProbabilities[i] = steps < 100 ? 1 / (steps + 1) : 0.1;
  }

  // 4. Algorithmic Complexity — Kolmogorov complexity approximation
  const algorithmicComplexity: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    // Approximate complexity by binary representation length
    algorithmicComplexity[i] = Math.floor(Math.log2(i)) + 1;
  }

  // 5. Decision Tree Depth — depth needed to classify number patterns
  const decisionTreeDepth: number[] = [];
  for (let depth = 1; depth <= 5; depth++) {
    decisionTreeDepth.push(depth);
  }

  return {
    draws,
    turingMachineStates,
    computabilityScore,
    haltingProbabilities,
    algorithmicComplexity,
    decisionTreeDepth,
  };
}

export function analyzeDrawsPythagoras(draws: DrawResult[]): PythagorasAnalysis {
  const allNums = draws.map(d => d.dezenas.map(Number).sort((a, b) => a - b));
  const totalDraws = draws.length;

  // 1. Triangular Numbers — sum of first n natural numbers
  const triangularNumbers: number[] = [];
  for (let n = 1; triangularNumbers.length < 15; n++) {
    const tri = (n * (n + 1)) / 2;
    if (tri <= 25) triangularNumbers.push(tri);
  }

  // 2. Perfect Squares — squares of integers
  const perfectSquares: number[] = [];
  for (let n = 1; n * n <= 25; n++) {
    perfectSquares.push(n * n);
  }

  // 3. Pythagorean Triples — triples satisfying a² + b² = c²
  const pythagoreanTriples: number[][] = [];
  for (let a = 1; a <= 5; a++) {
    for (let b = a + 1; b <= 5; b++) {
      const c = Math.sqrt(a * a + b * b);
      if (Number.isInteger(c) && c <= 25) {
        pythagoreanTriples.push([a, b, c]);
      }
    }
  }

  // 4. Geometric Ratios — ratios based on geometric progressions
  const geometricRatios: Record<number, number> = {};
  const ratio = 1.5; // Geometric ratio
  for (let i = 1; i <= 25; i++) {
    geometricRatios[i] = Math.pow(ratio, i % 5);
  }

  // 5. Harmonic Series — sum of reciprocals
  const harmonicSeries: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) {
    let sum = 0;
    for (let k = 1; k <= i; k++) {
      sum += 1 / k;
    }
    harmonicSeries[i] = sum;
  }

  return {
    draws,
    triangularNumbers,
    perfectSquares,
    pythagoreanTriples,
    geometricRatios,
    harmonicSeries,
  };
}

export function generateGaussGame(analysis: GaussAnalysis, count: number): Game {
  const { normalDistribution, confidenceIntervals, leastSquaresFit } = analysis;

  const weights: { num: number; weight: number }[] = [];
  for (let i = 1; i <= 25; i++) {
    const normal = normalDistribution[i] || 0.5;
    const lsFit = leastSquaresFit[i - 1] || 0;
    const inConfidence = confidenceIntervals.find(ci => ci.num === i && i >= ci.lower && i <= ci.upper) ? 1.2 : 1.0;

    const weight = normal * (lsFit + 1) * inConfidence;
    weights.push({ num: i, weight });
  }

  weights.sort((a, b) => b.weight - a.weight);
  const selected = weights.slice(0, count).map(w => w.num).sort((a, b) => a - b);
  return selected;
}

export function generateGaussGames(analysis: GaussAnalysis, quantity: number, numbersPerGame: number): Game[] {
  const games: Game[] = [];
  const seen = new Set<string>();

  let attempts = 0;
  while (games.length < quantity && attempts < quantity * 10) {
    const game = generateGaussGame(analysis, numbersPerGame);
    const key = game.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      games.push(game);
    }
    attempts++;
  }

  return games;
}

export function generateFibonacciGame(analysis: FibonacciAnalysis, count: number): Game {
  const { goldenRatioWeights, spiralPositions, phiHarmonics } = analysis;

  const weights: { num: number; weight: number }[] = [];
  for (let i = 1; i <= 25; i++) {
    const golden = goldenRatioWeights[i] || 0.5;
    const spiral = spiralPositions[i - 1] || 1;
    const harmonic = phiHarmonics[i] || 0.1;

    const weight = golden * (1 / spiral) * harmonic * 100; // Scale up harmonics
    weights.push({ num: i, weight });
  }

  weights.sort((a, b) => b.weight - a.weight);
  const selected = weights.slice(0, count).map(w => w.num).sort((a, b) => a - b);
  return selected;
}

export function generateFibonacciGames(analysis: FibonacciAnalysis, quantity: number, numbersPerGame: number): Game[] {
  const games: Game[] = [];
  const seen = new Set<string>();

  let attempts = 0;
  while (games.length < quantity && attempts < quantity * 10) {
    const game = generateFibonacciGame(analysis, numbersPerGame);
    const key = game.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      games.push(game);
    }
    attempts++;
  }

  return games;
}

export function generateTuringGame(analysis: TuringAnalysis, count: number): Game {
  const { computabilityScore, haltingProbabilities, algorithmicComplexity } = analysis;

  const weights: { num: number; weight: number }[] = [];
  for (let i = 1; i <= 25; i++) {
    const comp = computabilityScore[i] || 0.5;
    const halt = haltingProbabilities[i] || 0.5;
    const alg = algorithmicComplexity[i] || 1;

    const weight = comp * halt * (1 / alg); // Lower complexity = higher weight
    weights.push({ num: i, weight });
  }

  weights.sort((a, b) => b.weight - a.weight);
  const selected = weights.slice(0, count).map(w => w.num).sort((a, b) => a - b);
  return selected;
}

export function generateTuringGames(analysis: TuringAnalysis, quantity: number, numbersPerGame: number): Game[] {
  const games: Game[] = [];
  const seen = new Set<string>();

  let attempts = 0;
  while (games.length < quantity && attempts < quantity * 10) {
    const game = generateTuringGame(analysis, numbersPerGame);
    const key = game.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      games.push(game);
    }
    attempts++;
  }

  return games;
}

export function generatePythagorasGame(analysis: PythagorasAnalysis, count: number): Game {
  const { triangularNumbers, perfectSquares, pythagoreanTriples, geometricRatios, harmonicSeries } = analysis;

  const weights: { num: number; weight: number }[] = [];
  for (let i = 1; i <= 25; i++) {
    let weight = 1.0;

    // Bonus for triangular numbers
    if (triangularNumbers.includes(i)) weight *= 1.5;

    // Bonus for perfect squares
    if (perfectSquares.includes(i)) weight *= 1.3;

    // Bonus for numbers in Pythagorean triples
    const inTriple = pythagoreanTriples.some(triple => triple.includes(i));
    if (inTriple) weight *= 1.4;

    // Geometric and harmonic factors
    weight *= geometricRatios[i] || 1.0;
    weight *= harmonicSeries[i] || 1.0;

    weights.push({ num: i, weight });
  }

  weights.sort((a, b) => b.weight - a.weight);
  const selected = weights.slice(0, count).map(w => w.num).sort((a, b) => a - b);
  return selected;
}

export function generatePythagorasGames(analysis: PythagorasAnalysis, quantity: number, numbersPerGame: number): Game[] {
  const games: Game[] = [];
  const seen = new Set<string>();

  let attempts = 0;
  while (games.length < quantity && attempts < quantity * 10) {
    const game = generatePythagorasGame(analysis, numbersPerGame);
    const key = game.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      games.push(game);
    }
    attempts++;
  }

  return games;
}
