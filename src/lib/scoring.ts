// 04_game_loop_flow.json proc-score-judge.
// "정답 여부(진범 이름 단순 비교)와 점수를 독립적으로 계산"
//
// Phase 32 — 실전 리뷰 피드백으로 채점 체계를 단순화했다. 기존엔 기본물증/연계물증/
// 진술증거/붕괴보너스 4개 카테고리로 나뉘어 있었는데, "연계물증·붕괴보너스가 왜 0점인지
// 모르겠다"는 지적이 반복됐다(신발흙 대조·관리실 진술은 각각 다른 방식으로만 얻어져서
// 다른 카드처럼 그냥 클릭/자연 확보되지 않는데, 그 사실이 안내되지 않았기 때문). 사용자
// 판단: 붕괴보너스처럼 "미리 알려주면 무너뜨릴 때까지 이것저것 찔러보게 만드는" 카테고리는
// 아예 없애고, 그냥 "설계해둔 증거를 얼마나 찾았는가" 하나로 통합하는 게 낫다 — 이제
// 신발흙 대조나 관리실 진술도 특별 취급 없이 다른 증거와 동일하게 "증거 수집" 점수에
// 들어간다(단, 진범 락아웃 트리거로 쓰이는 기능적 역할 자체는 evidence.ts의
// breakdownCategory/isBreakdownTrigger 태그로 그대로 유지된다 — 채점 로직에서만 특별
// 취급을 없앴다). 채점 기준 자체는 이제 게임 시작 전에 미리 공개한다(CastingScreen 등) —
// "숨겨진 페널티"라는 지적에 대응.
//
// 최종 카테고리: 증거 수집(전체 증거 중 확보한 개수 비례) / 동기 파악(3배역×10) /
// 심문 효율(소요 시간 기반, 최대 20). MAX_SCORE는 항상 evidence.ts 실제 데이터에서
// 동적으로 계산되므로 수치를 손으로 맞출 필요는 없다.

import { EVIDENCE } from "./game-data/evidence";
import { CHARACTER_LIST } from "./game-data/characters";
import type { CharacterId } from "./game-data/types";

/** 정민아 법인카드 비리(살인과 무관한 서브플롯)와 박서연 알리바이 증명은 사건 해결과
 * 직접 관련이 없어 "증거 수집" 집계에서 제외한다(§08 evidence reference 참고). */
const NON_SCORING_EVIDENCE_IDS = new Set(["ev-corporate-card", "ev-convenience-store-receipt"]);

/** 배역별 "동기 정황"을 직접 드러내는 증거 — 3배역 × 10점(§동기 파악)의 판정 기준 */
const MOTIVE_EVIDENCE_IDS = [
  "ev-deleted-call-recovery", // 이현우: 인사평가 통화 정황
  "ev-corporate-card", // 정민아: 법인카드 비리
  "stmt-park-dispute-reason", // 박서연: 성과 갈등
];

/** "증거 수집" 채점 대상 — NON_SCORING을 제외한 모든 물증·진술 증거. 신발흙 대조나
 * 관리실 진술처럼 확보 방식이 특수한 증거도 이제 차별 없이 여기 포함된다. */
const SCORING_EVIDENCE = EVIDENCE.filter((e) => !NON_SCORING_EVIDENCE_IDS.has(e.id));

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
