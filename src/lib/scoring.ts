// 04_game_loop_flow.json proc-score-judge.
// "정답 여부(진범 이름 단순 비교)와 점수(185점 만점 별도 집계)를 독립적으로 계산"
//
// 원본 스펙 문구: "6x5(기본물증)+1x15(연계물증)+4x15(진술증거)+3x10(동기)+30(붕괴보너스)=185"
// 주의(문서 불일치, 실제로 발견됨): 이 항목들을 있는 그대로 더하면
// 6*5 + 1*15 + 4*15 + 3*10 + 30 = 30+15+60+30+30 = 165점이지, 185점이 아니다.
// 원본 04번 문서 자체의 계산 오류로 보인다(10번 문서의 "Anthropic API 호출" 잔존 문구처럼
// 이전 리비전의 흔적). 항목을 임의로 지어내 20점을 채우기보다, 실제로 계산되는 165점
// 만점을 그대로 구현하고 이 불일치를 코드에 기록해둔다.
//
// 이후 실전 피드백으로 두 가지를 추가했다:
//   1) 박서연/정민아 "신발 확인" 물증(ev-shoe-park, ev-shoe-jeong)이 신규 추가되며
//      기본물증 개수가 6→8로 늘어 만점이 165보다 커졌다 — 아래 MAX_SCORE는 항상
//      evidence.ts 실제 데이터에서 동적으로 계산되므로 수치를 손으로 맞출 필요는 없다.
//   2) "효율 보너스"(짧고 날카로운 질문일수록 가점) — 플레이어에게는 정확한 산정 기준을
//      보여주지 않고 힌트 문구만 노출한다(CastingScreen 참고). 기준을 공개하면
//      "질문 개수를 줄여야 한다"는 강박이 생겨 역효과가 난다는 판단.

import { EVIDENCE } from "./game-data/evidence";
import { CHARACTER_LIST } from "./game-data/characters";
import type { CharacterId } from "./game-data/types";

/** 정민아 법인카드 비리(살인과 무관한 서브플롯)와 박서연 알리바이 증명은 사건 해결과
 * 직접 관련이 없어 "기본물증" 집계에서 제외한다(§08 evidence reference 참고). */
const NON_SCORING_EVIDENCE_IDS = new Set(["ev-corporate-card", "ev-convenience-store-receipt"]);
/** 붕괴 트리거 자체는 "붕괴보너스"로 별도 채점하므로 진술증거 집계에서 제외한다. */
const BREAKDOWN_TRIGGER_STATEMENT_ID = "stmt-lee-office-visit";

/**
 * 붕괴 보너스 판정 기준 — evidence.ts에서 isBreakdownTrigger로 플래그된 증거(신발흙 대조 +
 * 관리실 방문 이유 진술)를 둘 다 확보했는지로만 판정한다.
 *
 * 애초에는 "심문 중 AI가 [붕괴조건충족=예]를 선언했는지"를 클라이언트가 알려주는 방식이었으나,
 * 게임 밸런스 수정으로 심문 중에는 진범도 명시적으로 자백하지 않도록 바꾸면서
 * (actor-prompt.ts 상단 주석 참고 — "누가 자백했는지"만 보면 추리 없이 정답이 나오는 문제),
 * 그 신호 자체를 클라이언트에 노출할 수 없게 됐다. 대신 플레이어가 실제로 결정적 증거
 * 두 가지를 모두 확보했는지(원래도 player 공개 정보)로 판정 기준을 바꿨다 — 클라이언트를
 * 신뢰할 필요도 없고, 심문 중 어떤 스포일러도 발생하지 않는다.
 */
const BREAKDOWN_BONUS_EVIDENCE_IDS = EVIDENCE.filter((e) => e.isBreakdownTrigger).map((e) => e.id);

/** 배역별 "동기 정황"을 직접 드러내는 증거 — 3배역 × 10점(§동기 파악)의 판정 기준 */
const MOTIVE_EVIDENCE_IDS = [
  "ev-deleted-call-recovery", // 이현우: 인사평가 통화 정황
  "ev-corporate-card", // 정민아: 법인카드 비리
  "stmt-park-dispute-reason", // 박서연: 성과 갈등
];

const BASIC_PHYSICAL_EVIDENCE = EVIDENCE.filter(
  (e) => e.category === "physical" && !e.isBreakdownTrigger && !NON_SCORING_EVIDENCE_IDS.has(e.id)
);
const LINKED_PHYSICAL_EVIDENCE = EVIDENCE.filter(
  (e) => e.category === "physical" && e.isBreakdownTrigger
);
const SCORING_STATEMENT_EVIDENCE = EVIDENCE.filter(
  (e) => e.category === "statement" && e.id !== BREAKDOWN_TRIGGER_STATEMENT_ID
);

const POINTS_PER_BASIC = 5;
const POINTS_PER_LINKED = 15;
const POINTS_PER_STATEMENT = 15;
const POINTS_PER_MOTIVE = 10;
const BREAKDOWN_BONUS = 30;

/**
 * 효율 보너스 — 3배역 합산 질문 글자 수(공백 포함, 토큰 수의 근사치)가 짧을수록 가점.
 * 구간은 튜닝 가능한 밸런스 값이다: 짧은 질문 10~15개(질문당 30~50자) 정도로 핵심을
 * 찌르면 만점 구간에 들어오도록 잡았다. 질문 "개수"가 아니라 "글자 수"를 기준으로 삼은
 * 이유는, 개수 기준은 플레이어에게 "질문을 아껴야 한다"는 명시적 강박을 주지만 글자 수는
 * 체감하기 어려워 오히려 자연스럽게 간결한 질문을 유도한다는 판단(사용자 피드백).
 */
const EFFICIENCY_BONUS_MAX = 20;
const EFFICIENCY_TIERS: Array<{ maxChars: number; bonus: number }> = [
  { maxChars: 400, bonus: 20 },
  { maxChars: 700, bonus: 12 },
  { maxChars: 1100, bonus: 6 },
];

function computeEfficiencyBonus(totalQuestionChars: number): number {
  for (const tier of EFFICIENCY_TIERS) {
    if (totalQuestionChars <= tier.maxChars) return tier.bonus;
  }
  return 0;
}

export const MAX_SCORE =
  BASIC_PHYSICAL_EVIDENCE.length * POINTS_PER_BASIC +
  LINKED_PHYSICAL_EVIDENCE.length * POINTS_PER_LINKED +
  SCORING_STATEMENT_EVIDENCE.length * POINTS_PER_STATEMENT +
  CHARACTER_LIST.length * POINTS_PER_MOTIVE +
  BREAKDOWN_BONUS +
  EFFICIENCY_BONUS_MAX;

export interface ScoreBreakdown {
  basicEvidencePoints: number;
  linkedEvidencePoints: number;
  statementEvidencePoints: number;
  motivePoints: number;
  breakdownBonus: number;
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
  /** 3배역에게 보낸 모든 질문 메시지의 총 글자 수 */
  totalQuestionChars: number;
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const revealedSet = new Set(input.revealedEvidenceIds);

  const basicEvidencePoints =
    BASIC_PHYSICAL_EVIDENCE.filter((e) => revealedSet.has(e.id)).length * POINTS_PER_BASIC;
  const linkedEvidencePoints =
    LINKED_PHYSICAL_EVIDENCE.filter((e) => revealedSet.has(e.id)).length * POINTS_PER_LINKED;
  const statementEvidencePoints =
    SCORING_STATEMENT_EVIDENCE.filter((e) => revealedSet.has(e.id)).length * POINTS_PER_STATEMENT;
  const motivesRevealedCount = MOTIVE_EVIDENCE_IDS.filter((id) => revealedSet.has(id)).length;
  const motivePoints = motivesRevealedCount * POINTS_PER_MOTIVE;
  const breakdownAchieved = BREAKDOWN_BONUS_EVIDENCE_IDS.every((id) => revealedSet.has(id));
  const breakdownBonus = breakdownAchieved ? BREAKDOWN_BONUS : 0;
  const efficiencyBonus = computeEfficiencyBonus(Math.max(0, input.totalQuestionChars));

  const total =
    basicEvidencePoints +
    linkedEvidencePoints +
    statementEvidencePoints +
    motivePoints +
    breakdownBonus +
    efficiencyBonus;

  return {
    basicEvidencePoints,
    linkedEvidencePoints,
    statementEvidencePoints,
    motivePoints,
    breakdownBonus,
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
