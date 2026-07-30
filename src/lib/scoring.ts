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
// 의미 있는 것에만 붙어 있다.
//
// Phase 39 — 스토리라인 대규모 개편으로 evidence.ts의 증거 id가 전면 교체됐다(신발→
// 가방, 돌→칼 등). SCORING_EVIDENCE/MOTIVE_EVIDENCE_IDS가 참조하던 옛 id를 새 id로
// 재매핑만 했다.
//
// Phase 58 — 배포 후 실전 플레이로 드러난 채점 시스템 전체의 구조적 문제 3가지를
// 사용자와 논의해 전면 재설계했다(제안 단계에서 사용자가 세부 수치 확정):
//   1. isCorrect(정답 여부)와 grade(등급)가 완전히 독립 계산이라, 오답을 지목해도
//      증거/동기/효율만 채우면 S등급이 나오는 모순이 있었다 — 오답 시 등급을 항상
//      C로, 점수도 65점(100점 만점)으로 캡을 씌운다.
//   2. "증거 수집"이 사실상 이현우(진범) 전용이었다(scorable: true 3개가 전부
//      이현우 것) — 박서연/정민아를 조사해도 0점이라, 누가 범인인지 모르는 채로
//      골고루 수사하는 정상적인 태도가 손해였다. "수사 성실도"(3인 전원의
//      가방·신발·휴대폰 9개, 균등 배점)와 "핵심 단서 확보"(기존 scorable 3개,
//      더 높은 배점)로 분리했다.
//   3. "심문 효율"이 순수 실시간 소요 시간 기준이라 전체의 31%(20/65점)를 차지해,
//      롤플레이를 음미하기보다 빨리 끝내는 쪽으로 유인이 쏠릴 위험이 있었다.
//      patience.ts가 이미 추적하는 "비슷한 질문 3번째 반복"(낭비성 재질문) 횟수
//      기준으로 교체하고, 사용자 요청대로 관대한 커브 + 최저 5점 보장으로 바꿨다.
//
// Phase 59 — Phase 58의 "심문 효율"에도 같은 종류의 결함이 남아있었다: 심문을 아예
// 0번 하면 낭비성 반복도 0번이라 오히려 만점(22점)이 나왔다 — "동기 파악"(라운드
// 자동 공개)과 겹쳐, 오답이어도 등급 게이트로 막히지만 정답을 운 좋게 찍으면
// "심문 0회인데 B등급"이 가능했다. 사용자 제안으로 방향을 뒤집었다 — "낭비 적을수록
// 가점"에서 "인내심을 실제로 얼마나 건드렸나"로 교체(키워드 신규 적중 + 3번째 반복
// 트리거 총횟수 × 0.5점). 심문을 안 하면 이제 0점이라 위 결함이 막힌다. 다만 소지품
// 요청("가방"/"신발"/"휴대폰")이 patienceKeywords에도 들어있어(Phase 42) "수사
// 성실도"/"핵심 단서 확보"와 소폭 겹친다 — 완전 분리보다는, 배점 비중이 작고(항목당
// 최대 22점 중 일부일 뿐) Phase 42에서 의도적으로 넣은 키워드를 도로 빼는 것도
// 부자연스럽다고 판단해 겹침을 허용하기로 했다(사용자 확인).
// 배점 총합은 100점(18+30+30+22)이 되도록 설계했지만, 혹시 모를 계산 오차에
// 대비해 최종 합계에도 안전장치로 Math.min(..., MAX_SCORE) 클램프를 걸어둔다.

import { EVIDENCE } from "./game-data/evidence";
import { CHARACTER_LIST } from "./game-data/characters";
import { countPatienceEngagement } from "./patience";
import type { CharacterId } from "./game-data/types";

/** 배역별 "동기 정황"을 직접 드러내는 증거 — 3배역 × 10점(§동기 파악)의 판정 기준. */
const MOTIVE_EVIDENCE_IDS = [
  "stmt-lee-family-history", // 이현우: 여동생-김영훈 관련 가족사 정황
  "stmt-jeong-breakup-reason", // 정민아: 김영훈과의 과거 연애 정황
  "stmt-park-dispute-reason", // 박서연: 성과 가로채기 갈등
];

/** 핵심 단서 확보 — evidence.ts에서 scorable: true로 명시된, 사건 해결에 실제로
 * 기여하는 증거만(전부 이현우 것: 신발/가방/휴대폰). */
const KEY_CLUE_EVIDENCE = EVIDENCE.filter((e) => e.scorable === true);

/** 수사 성실도 — 3인 전원의 가방·신발·휴대폰(소지품 확인) 물증 전체. 누구 것이든
 * 균등 배점 — 무고자를 조사하는 것도 정당한 수사 행위이므로 손해를 보면 안 된다. */
const PERSONAL_ITEM_EVIDENCE = EVIDENCE.filter(
  (e) => e.id.startsWith("ev-bag-") || e.id.startsWith("ev-shoe-") || e.id.startsWith("ev-phone-")
);

const POINTS_PER_PERSONAL_ITEM = 2; // 9개 × 2 = 18
const POINTS_PER_KEY_CLUE = 10; // 3개 × 10 = 30
const POINTS_PER_MOTIVE = 10; // 3개 × 10 = 30

/**
 * 심문 효율(심문 강도) — Phase 59에서 "인내심을 실제로 얼마나 건드렸나"로 교체했다.
 * 3배역 각각의 patienceKeywords를 기준으로 그 배역과의 대화에서 발생한 트리거
 * 총횟수(키워드 신규 적중 + 3번째 반복)를 세고, 트리거 1회당 POINTS_PER_TRIGGER점을
 * 준다 — 상한(EFFICIENCY_BONUS_MAX)만 있고 하한(0점)은 없다. 심문을 아예 안 하면
 * 트리거도 0이라 정직하게 0점이 된다(Phase 58까지 있었던 "안 할수록 유리" 결함을
 * 이 방향 전환으로 막는다).
 */
const EFFICIENCY_BONUS_MAX = 22;
const POINTS_PER_PATIENCE_TRIGGER = 0.5;

interface ScoreConversationTurn {
  role: "user" | "assistant";
  content: string;
}

function computeEfficiencyBonus(
  conversationsByCharacter: Partial<Record<CharacterId, ScoreConversationTurn[]>> | undefined
): number {
  if (!conversationsByCharacter) return 0;

  let totalTriggers = 0;
  for (const character of CHARACTER_LIST) {
    const history = conversationsByCharacter[character.characterId];
    if (!history) continue;
    const userMessages = history.filter((t) => t.role === "user").map((t) => t.content);
    totalTriggers += countPatienceEngagement(character.patienceKeywords, userMessages);
  }

  return Math.min(totalTriggers * POINTS_PER_PATIENCE_TRIGGER, EFFICIENCY_BONUS_MAX);
}

/** 오답 시 등급/점수 상한(Phase 58) — 정답 여부와 등급이 모순되는 것을 막기 위한
 * 게이트. 오답이면 아무리 수사를 잘했어도 등급은 항상 "C", 점수는 65점(100점 만점)
 * 을 넘지 못한다. */
const WRONG_ANSWER_SCORE_CAP = 65;
const WRONG_ANSWER_GRADE: Grade = "C";

export const MAX_SCORE =
  PERSONAL_ITEM_EVIDENCE.length * POINTS_PER_PERSONAL_ITEM +
  KEY_CLUE_EVIDENCE.length * POINTS_PER_KEY_CLUE +
  CHARACTER_LIST.length * POINTS_PER_MOTIVE +
  EFFICIENCY_BONUS_MAX;

/**
 * 채점 기준 사전 공개용(Phase 32 — CastingScreen에서 시작 전에 서브퀘스트처럼
 * 보여준다). 게임 진행 중 정확한 산정 기준을 숨기던 기존 원칙을 뒤집은 결정 —
 * "점수 시스템의 목적 자체가 진범만 잡으면 끝이 아니라는 걸 알려주려는 것이었으니,
 * 처음부터 밝히는 게 낫다"는 판단(사용자).
 */
export const SCORING_SUMMARY = {
  personalItemTotalCount: PERSONAL_ITEM_EVIDENCE.length,
  pointsPerPersonalItem: POINTS_PER_PERSONAL_ITEM,
  keyClueTotalCount: KEY_CLUE_EVIDENCE.length,
  pointsPerKeyClue: POINTS_PER_KEY_CLUE,
  motiveCharacterCount: CHARACTER_LIST.length,
  pointsPerMotive: POINTS_PER_MOTIVE,
  efficiencyBonusMax: EFFICIENCY_BONUS_MAX,
  pointsPerPatienceTrigger: POINTS_PER_PATIENCE_TRIGGER,
  wrongAnswerScoreCap: WRONG_ANSWER_SCORE_CAP,
  wrongAnswerGrade: WRONG_ANSWER_GRADE,
} as const;

export interface ScoreBreakdown {
  /** 수사 성실도(3인 소지품 확인) 점수 */
  personalItemPoints: number;
  personalItemFoundCount: number;
  personalItemTotalCount: number;
  /** 핵심 단서 확보(이현우 3종) 점수 */
  keyCluePoints: number;
  keyClueFoundCount: number;
  keyClueTotalCount: number;
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
  /** 3배역 각각의 실제 심문 대화 기록 — 심문 효율(낭비성 재질문) 판정용 */
  conversationsByCharacter?: Partial<Record<CharacterId, ScoreConversationTurn[]>>;
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const revealedSet = new Set(input.revealedEvidenceIds);

  const personalItemFoundCount = PERSONAL_ITEM_EVIDENCE.filter((e) => revealedSet.has(e.id)).length;
  const personalItemPoints = personalItemFoundCount * POINTS_PER_PERSONAL_ITEM;

  const keyClueFoundCount = KEY_CLUE_EVIDENCE.filter((e) => revealedSet.has(e.id)).length;
  const keyCluePoints = keyClueFoundCount * POINTS_PER_KEY_CLUE;

  const motivesRevealedCount = MOTIVE_EVIDENCE_IDS.filter((id) => revealedSet.has(id)).length;
  const motivePoints = motivesRevealedCount * POINTS_PER_MOTIVE;

  const efficiencyBonus = computeEfficiencyBonus(input.conversationsByCharacter);

  const rawTotal = personalItemPoints + keyCluePoints + motivePoints + efficiencyBonus;
  const total = Math.min(rawTotal, MAX_SCORE);

  return {
    personalItemPoints,
    personalItemFoundCount,
    personalItemTotalCount: PERSONAL_ITEM_EVIDENCE.length,
    keyCluePoints,
    keyClueFoundCount,
    keyClueTotalCount: KEY_CLUE_EVIDENCE.length,
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

export function judgeAccusation(accusedCharacterId: CharacterId, scoreInput: ScoreInput): JudgeResult {
  const culprit = CHARACTER_LIST.find((c) => c.isCulprit);
  if (!culprit) throw new Error("진범이 정의되지 않았습니다 — 캐릭터 데이터를 확인하세요.");

  const score = computeScore(scoreInput);
  const isCorrect = accusedCharacterId === culprit.characterId;

  // Phase 58 — 오답 게이트: 아무리 수사를 잘했어도 오답이면 등급은 항상 C, 점수는
  // 65점(100점 만점)을 넘지 못한다. "틀렸는데 최고 등급"이라는 모순을 구조적으로
  // 없애면서도, 수사 과정 자체의 부분점수는 65점 한도 내에서 그대로 반영된다.
  const finalScore: ScoreBreakdown = isCorrect
    ? score
    : { ...score, total: Math.min(score.total, WRONG_ANSWER_SCORE_CAP) };
  const grade = isCorrect ? gradeFromScore(finalScore.total, finalScore.maxTotal) : WRONG_ANSWER_GRADE;

  return {
    isCorrect,
    culpritCharacterId: culprit.characterId,
    score: finalScore,
    grade,
  };
}
