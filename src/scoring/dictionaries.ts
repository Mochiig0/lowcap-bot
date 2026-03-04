import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type WeightedKeyword = {
  keyword: string;
  score: number;
  tag?: string;
};

export type CoreDictionary = {
  keywords: WeightedKeyword[];
};

export type TrendDictionary = {
  generatedAt: string;
  ttlHours: number;
  keywords: WeightedKeyword[];
};

export type LearnedDictionary = {
  keywords: WeightedKeyword[];
  patterns: Array<{ pattern: string; score: number; tag?: string }>;
};

async function readJsonFile<T>(relativePath: string): Promise<T> {
  const filePath = resolve(process.cwd(), relativePath);
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function loadCoreDictionary(): Promise<CoreDictionary> {
  return readJsonFile<CoreDictionary>("data/core.json");
}

export async function loadTrendDictionary(): Promise<TrendDictionary> {
  return readJsonFile<TrendDictionary>("data/trend.json");
}

export async function loadLearnedDictionary(): Promise<LearnedDictionary> {
  return readJsonFile<LearnedDictionary>("data/learned.json");
}

export function isTrendFresh(trend: TrendDictionary, now = new Date()): boolean {
  const generatedAtMs = new Date(trend.generatedAt).getTime();
  if (Number.isNaN(generatedAtMs)) return false;

  const ttlMs = trend.ttlHours * 60 * 60 * 1000;
  return now.getTime() <= generatedAtMs + ttlMs;
}
