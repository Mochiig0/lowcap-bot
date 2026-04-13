import {
  type CoreDictionary,
  type LearnedDictionary,
  isTrendFresh,
  loadCoreDictionary,
  loadLearnedDictionary,
  loadTrendDictionary,
  type TrendDictionary,
  type WeightedKeyword,
} from "./dictionaries.js";

const S_RANK_MIN = 8;
const A_RANK_MIN = 5;
const B_RANK_MIN = 2;

type ScoreHit = {
  source: "core" | "learned_keyword" | "learned_pattern" | "trend" | "combo";
  key: string;
  score: number;
  tag?: string;
};

export type ScoreResult = {
  total: number;
  rank: "S" | "A" | "B" | "C";
  breakdown: {
    totals: {
      core: number;
      learned: number;
      trend: number;
      combo: number;
    };
    hits: ScoreHit[];
    trendFresh: boolean;
    trendCapped: boolean;
    trendOnly: boolean;
  };
};

type ScoreTextDependencies = {
  core: CoreDictionary;
  trend: TrendDictionary;
  learned: LearnedDictionary;
  trendFresh?: boolean;
};

function scoreKeywords(
  text: string,
  source: ScoreHit["source"],
  keywords: WeightedKeyword[],
): { score: number; hits: ScoreHit[] } {
  let score = 0;
  const hits: ScoreHit[] = [];

  for (const entry of keywords) {
    if (text.includes(entry.keyword.toLowerCase())) {
      score += entry.score;
      hits.push({
        source,
        key: entry.keyword,
        score: entry.score,
        tag: entry.tag,
      });
    }
  }

  return { score, hits };
}

function computeComboBoosts(text: string): { score: number; hits: ScoreHit[] } {
  let score = 0;
  const hits: ScoreHit[] = [];

  const comboRules = [
    {
      id: "pokemon_x_dog_x_newinfo",
      required: ["pokemon", "dog", "newinfo"],
      score: 2,
    },
    {
      id: "animal_x_tech",
      required: ["animal", "tech"],
      score: 1,
    },
    {
      id: "politics_scandal_x_meme",
      required: ["politics scandal", "meme"],
      score: 2,
    },
  ];

  for (const rule of comboRules) {
    const matched = rule.required.every((needle) => text.includes(needle));
    if (matched) {
      score += rule.score;
      hits.push({
        source: "combo",
        key: rule.id,
        score: rule.score,
      });
    }
  }

  return { score, hits };
}

function rankFromTotal(total: number, trendOnly: boolean): "S" | "A" | "B" | "C" {
  if (!trendOnly && total >= S_RANK_MIN) return "S";
  if (total >= A_RANK_MIN) return "A";
  if (total >= B_RANK_MIN) return "B";
  return "C";
}

export function scoreTextWithDependencies(
  text: string,
  dependencies: ScoreTextDependencies,
): ScoreResult {
  const { core, trend, learned } = dependencies;
  const trendFresh = dependencies.trendFresh ?? isTrendFresh(trend);

  const coreRes = scoreKeywords(text, "core", core.keywords);
  const learnedKeywordRes = scoreKeywords(text, "learned_keyword", learned.keywords);

  let learnedPatternScore = 0;
  const learnedPatternHits: ScoreHit[] = [];
  for (const pattern of learned.patterns) {
    const re = new RegExp(pattern.pattern, "i");
    if (re.test(text)) {
      learnedPatternScore += pattern.score;
      learnedPatternHits.push({
        source: "learned_pattern",
        key: pattern.pattern,
        score: pattern.score,
        tag: pattern.tag,
      });
    }
  }

  const trendRes = trendFresh
    ? scoreKeywords(text, "trend", trend.keywords)
    : { score: 0, hits: [] as ScoreHit[] };

  const trendCappedScore = Math.min(trendRes.score, 3);
  const trendCapped = trendRes.score > trendCappedScore;

  const comboRes = computeComboBoosts(text);

  const learnedScore = learnedKeywordRes.score + learnedPatternScore;
  const nonTrendScore = coreRes.score + learnedScore + comboRes.score;
  const total = nonTrendScore + trendCappedScore;
  const trendOnly = nonTrendScore <= 0 && trendCappedScore > 0;
  const rank = rankFromTotal(total, trendOnly);

  return {
    total,
    rank,
    breakdown: {
      totals: {
        core: coreRes.score,
        learned: learnedScore,
        trend: trendCappedScore,
        combo: comboRes.score,
      },
      hits: [
        ...coreRes.hits,
        ...learnedKeywordRes.hits,
        ...learnedPatternHits,
        ...trendRes.hits,
        ...comboRes.hits,
      ],
      trendFresh,
      trendCapped,
      trendOnly,
    },
  };
}

export async function scoreText(text: string): Promise<ScoreResult> {
  const [core, trend, learned] = await Promise.all([
    loadCoreDictionary(),
    loadTrendDictionary(),
    loadLearnedDictionary(),
  ]);

  return scoreTextWithDependencies(text, { core, trend, learned });
}
