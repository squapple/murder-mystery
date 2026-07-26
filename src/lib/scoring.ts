// 04_game_loop_flow.json proc-score-judge.
// "정답 여부(진범 이름 단순 비교)와 점수를 독립적으로 계산"
//
// Phase 32 — 기본물증/연계물증/진술증거/붕괴보너스 4개 카테고리를 증거 수집/동기
// 파악/심문 효율 3개로 단순화했다. 채점 기준은 게임 시작 전에 미리 공개한다
// (CastingScreen 등) — "숨겨진 페널티"라는 지적에 대응.
//
// Phase 38 — 그런데 "증거 수집"을 라운드마다 자동으로 뜨는 물증·진술 카드까지 전부
// 포함시켰더니, 심문을 한 번도 안 하고 조사 모드 카드만 클릭해도(라운드만 지나면
// 뜨는 카드라 클릭 자체는 항상 가능했다) 증거 수집 점수가 거의 다 채워지는 문제가
// 발생했다 — 오답을 지목해도 A등급이 나올 정도였다(사용자 실측). "자동으로 밝혀지는
// 증거"는 클릭 하나로 채점에 반영되는 게 의미가 없다는 판단 — 이제 "증거 수집"은
// evidence.ts에서 `scorable: true`로 명시된 것만 집계한다. 이 플래그는 오직
// action_triggered(심문 중 직접 요구해서 찾아낸) 증거 중에서도 사건 해결에 실제로
// 의미 있는 것에만 붙어 있다(예: 이현우 신발의 흙 성분=의미있음, 박서연/정민아
// 신발이나 박서연 휴대폰처럼 "사건과 무관"으로 판명되는 함정 요청=의미없음). 라운드
// 게이트가 걸린 물증·진술 카드는 여전히 클릭해서 확보·열람할 수 있지만(심문 중
// 근거로 제시하는 용도), 이제 그 자체로는 점수에 반영되지 않는다.

import { EVIDENCE } from "./game-data/evidence";
import { CHARACTER_LIST } from "./game-data/characters";
import type { CharacterId } from "./game-data/types";

/** 배역별 "동기 정황"을 직접 드러내는 증거 — 3배역 × 10점(§동기 파악)의 판정 기준.
 * "증거 수집" 채점과는 독립적으로 유지한다 — 사용자가 이번엔 "증거 수집"만 고쳐달라고
 * 명시했다. */
const MOTIVE_EVIDENCE_IDS = [
  "ev-deleted-call-recovery", // 이현우: 인사평가 통화 정황
  "ev-corporate-card", // 정민아: 법인카드 비리
  "stmt-park-dispute-reason", // 박서연: 성과 갈등
];

/** "증거 수집" 채점 대상 — evidence.ts에서 scorable: true로 명시된 것만. */
const SCORING_EVIDENCE = EVIDENCE.filter((e) => e.scorable === true);

const POINTS_PER_EVIDENCE = 5;
const POINTS_PER_MOTIVE = 10;

/**
 * 효율 보너스 — 원래는 3배역 합산 질문 글자 수 기준이었으나(짧고 날카로운 질문일수록
 * 가점), 실전 피드백으로 "글자 수 기준이 너무 빡빡하거나 체감이 안 된다"는 지적을 받아
 * Phase 30에서 총 소요 시간 기준으로 교체했다 — 게임 시작(1라운드 진입)부터 최종
 * 지목까지 걸린 실제 시간을 잰다. 사용자 예시 기준("15분이면 만점, 20분이면 -2")을
 * 그대로 반영해 구간을 잡았다.
 */
const EFFICIENCY_BONUS_MAX = 20;
const EFFICIENCY_TIERS: Array<{ maxMinutes: number; bonus: number }> = [
  { maxMinutes: 15, bonus: 20 },
  { maxMinutes: 20, bonus: 18 },
  { maxMinutes: 25, bonus: 14 },
  { maxMinutes: 30, bonus: 8 },
  { maxMinutes: 40, bonus: 4 },
];

function computeEfficiencyBonus(totalElapsedSeconds: number): number {
  const minutes = totalElapsedSeconds / 60;
  for (const tier of EFFICIENCY_TIERS) {
    if (minutes <= tier.maxMinutes) return tier.bonus;
  }
  return 0;
}

export const MAX_SCORE =
  SCORING_EVIDENCE.length * POINTS_PER_EVIDENCE +
  CHARACTER_LIST.length * POINTS_PER_MOTIVE +
  EFFICIENCY_BONUS_MAX;

/**
 * 채점 기준 사전 공개용(Phase 32 — CastingScreen에서 시작 전에 서브퀘스트처럼
 * 보여준다). 게임 진행 중 정확한 산정 기준을 숨기던 기존 원칙을 뒤집은 결정 —
 * "점수 시스템의 목적 자체가 진범만 잡으면 끝이 아니라는 걸 알려주려는 것이었으니,
 * 처음부터 밝히는 게 낫다"는 판단(사용자).
 */
export const SCORING_SUMMARY = {
  evidenceTotalCount: SCORING_EVIDENCE.length,
  pointsPerEvidence: POINTS_PER_EVIDENCE,
  motiveCharacterCount: CHARACTER_LIST.length,
  pointsPerMotive: POINTS_PER_MOTIVE,
  efficiencyBonusMax: EFFICIENCY_BONUS_MAX,
  efficiencyTopTierMinutes: EFFICIENCY_TIERS[0].maxMinutes,
} as const;

export interface ScoreBreakdown {
  evidenceCollectionPoints: number;
  /** 결과 화면에 "N개 중 M개 확보"로 노출하기 위한 원본 카운트 */
  evidenceFoundCount: number;
  evidenceTotalCount: number;
  motivePoints: number;
  efficiencyBonus: number;
  total: number;
  maxTotal: number;
}

export type Grade = "S" | "A" | "B" | "C";

export function gradeFromScore(score: number, maxTotal: number): Grade {
  const ratio = score / maxTotal;
  if (ratio >= 0.9) return "S";
  if (ratio >= 0.7) return "A";
  if (ratio >= 0.5) return "B";
  return "C";
}

export interface ScoreInput {
  /** 조사 모드·심문을 통해 확보한 물증·진술 evidence id 목록 */
  revealedEvidenceIds: string[];
  /** 게임 시작부터 최종 지목까지 걸린 총 시간(초) */
  totalElapsedSeconds: number;
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const revealedSet = new Set(input.revealedEvidenceIds);

  const evidenceFoundCount = SCORING_EVIDENCE.filter((e) => revealedSet.has(e.id)).length;
  const evidenceCollectionPoints = evidenceFoundCount * POINTS_PER_EVIDENCE;
  const motivesRevealedCount = MOTIVE_EVIDENCE_IDS.filter((id) => revealedSet.has(id)).length;
  const motivePoints = motivesRevealedCount * POINTS_PER_MOTIVE;
  const efficiencyBonus = computeEfficiencyBonus(Math.max(0, input.totalElapsedSeconds));

  const total = evidenceCollectionPoints + motivePoints + efficiencyBonus;

  return {
    evidenceCollectionPoints,
    evidenceFoundCount,
    evidenceTotalCount: SCORING_EVIDENCE.length,
    motivePoints,
    efficiencyBonus,
    total,
    maxTotal: MAX_SCORE,
  };
}

export interface JudgeResult {
  isCorrect: boolean;
  culpritCharacterId: CharacterId;
  score: ScoreBreakdown;
  grade: Grade;
}

export function judgeAccusation(
  accusedCharacterId: CharacterId,
  scoreInput: ScoreInput
): JudgeResult {
  const culprit = CHARACTER_LIST.find((c) => c.isCulprit);
  if (!culprit) throw new Error("진범이 정의되지 않았습니다 — 캐릭터 데이터를 확인하세요.");

  const score = computeScore(scoreInput);
  return {
    isCorrect: accusedCharacterId === culprit.characterId,
    culpritCharacterId: culprit.characterId,
    score,
    grade: gradeFromScore(score.total, score.maxTotal),
  };
}
