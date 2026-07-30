// Phase 39 — 인내심 시스템. 붕괴조건 시스템(A/B/C 카테고리, 진범 하드게이트, 무고자
// 전용 LLM 락아웃 판정 콜)을 전부 폐지하고 도입한 대체 메커니즘이다. 세 캐릭터 모두
// 동일한 규칙으로 작동하며, 완전히 서버 결정론적이다 — LLM은 판정에 전혀 관여하지
// 않고, 서버가 계산한 결과를 받아 그 톤으로 연기만 한다(사용자 지시).
//
// 규칙 두 가지만 존재한다:
//   1) 형사의 메시지가 그 캐릭터의 patienceKeywords 중 아직 "사용되지 않은" 키워드를
//      하나라도 포함하면 +1(Phase 57 — 키워드별 1회 한정, 아래 참고).
//   2) 이전에 보낸 것과 비슷한 질문을 이번 걸 포함해 정확히 3번째로 반복하면 +1
//      (같은 반복 묶음에서 4번째 이후는 추가 가점 없음 — 이중 카운트 방지).
// 게임 전체 대화 기록을 기준으로 매번 처음부터 다시 계산한다(서버가 무상태이므로
// 기존 아키텍처와 동일하게, 클라이언트가 매번 전체 history를 보내는 방식을 그대로 쓴다
// — 반복질문 판정을 정확히 재현하려면 매 시점마다 클러스터 크기를 다시 계산해야 하므로,
// 전체 히스토리를 처음부터 리플레이한다).
//
// Phase 56 — "라운드가 바뀔 때 인내심을 한 칸 내리자"는 요청 반영. 별도의 영속
// 상태나 감소 타이머를 두지 않고, 매번 처음부터 재계산하는 기존 구조를 그대로
// 살려서 "위에서 계산한 누적 수치 - (round - 1)"로 라운드 진입 수만큼 깎는다
// (라운드 1: -0, 라운드 2: -1, 라운드 3: -2). 완전히 결정론적이고 상태가
// 필요 없다는 이 시스템의 원래 장점을 그대로 유지한다.
//
// Phase 57 — 실전 플레이에서 "키워드 매칭(+1)"과 "3번째 반복(+1)"이 같은 메시지에서
// 동시에 성립해 그 메시지 하나로 +2가 되는 사례가 확인됐다("메시지 하나가 인내심을
// 최대 1까지만 올려야 한다"는 원칙 위반). 두 가지를 함께 고쳤다:
//   (a) 한 메시지당 증가량을 최대 +1로 캡 — 키워드 경로와 반복 경로 중 하나라도
//       성립하면 그 메시지에서는 딱 1만 오르고, 원인이 둘 다여도 합산하지 않는다.
//   (b) 키워드는 "한 번 작동하면"(그 키워드로 인해 실제로 이번 메시지가 트리거된
//       적이 있으면) 그 뒤로는 같은 키워드가 다시 등장해도 더는 오르지 않는다 —
//       firedKeywords 집합에 넣어 이후 리플레이에서 계속 걸러낸다. 단, 반복 질문
//       경로는 키워드 소진 여부와 완전히 독립적으로 계속 작동한다 — 이미 다룬
//       화제라도 "같은 표현으로 3번째 캐물으면" 여전히 +1이 된다(사용자 명시).
// 두 규칙이 같은 for 루프 안에서 서로 간섭하지 않도록, 메시지당 "이번에 실제로
// 트리거됐는가"를 불리언 하나로 계산한 뒤 그 결과만 최종 level에 반영한다 —
// 키워드 소진 처리와 +1 상한 처리를 분리된 두 단계로 나누면 순서에 따라 결과가
// 달라지는 버그가 생기기 쉽다고 판단해 하나의 흐름으로 합쳤다.

export const PATIENCE_MAX = 5;

/** 반복 질문 판정 임계값 — 정규화한 문자열의 2-gram(bigram) Jaccard 유사도. */
const SIMILARITY_THRESHOLD = 0.6;

/** 같은 반복 묶음이 몇 번째 반복에서 가점을 주는지. */
const REPEAT_TRIGGER_COUNT = 3;

/** 공백·구두점을 제거해 사소한 표현 차이가 유사도 계산에 영향을 주지 않게 한다. */
function normalize(text: string): string {
  return text.replace(/[\s.,!?~"'()[\]{}·…\-]/g, "").toLowerCase();
}

/** 정규화한 문자열의 2-gram(bigram) 집합 — 한국어는 띄어쓰기가 일정하지 않아
 * 단어 단위 분리 대신 문자 bigram을 쓰는 편이 더 안정적으로 유사도를 잡아낸다. */
function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  if (text.length < 2) {
    if (text.length === 1) set.add(text);
    return set;
  }
  for (let i = 0; i < text.length - 1; i++) {
    set.add(text.slice(i, i + 2));
  }
  return set;
}

function jaccardSimilarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const setA = bigrams(normA);
  const setB = bigrams(normB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const g of setA) {
    if (setB.has(g)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isSimilar(a: string, b: string): boolean {
  return jaccardSimilarity(a, b) >= SIMILARITY_THRESHOLD;
}

interface RepeatCluster {
  representative: string;
  count: number;
}

/** 반복 질문 클러스터링 — computePatienceLevel과 countRepeatTriggers(scoring.ts용)가
 * 공유한다. msg가 기존 클러스터 중 하나와 비슷하면 그 클러스터 카운트를 올리고,
 * 정확히 REPEAT_TRIGGER_COUNT번째에 도달했으면 true를 반환한다. */
function detectRepeatTrigger(clusters: RepeatCluster[], msg: string): boolean {
  const matched = clusters.find((c) => isSimilar(msg, c.representative));
  if (matched) {
    matched.count++;
    return matched.count === REPEAT_TRIGGER_COUNT;
  }
  clusters.push({ representative: msg, count: 1 });
  return false;
}

export interface PatienceConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * computePatienceLevel과 countPatienceEngagement(scoring.ts용)가 공유하는 핵심
 * 루프 — 라운드 감소나 PATIENCE_MAX 상한을 적용하기 전의 "순수 트리거 횟수"를
 * 반환한다. 메시지당 최대 +1(Phase 57), 키워드는 1회 한정 소진(Phase 57), 반복
 * 질문 경로는 키워드 소진과 무관하게 독립 작동한다.
 */
function computeRawTriggerCount(patienceKeywords: string[], userMessages: string[]): number {
  const clusters: RepeatCluster[] = [];
  const firedKeywords = new Set<string>();

  let count = 0;
  for (const msg of userMessages) {
    let triggeredThisMessage = false;

    // 키워드 경로 — 아직 한 번도 안 쓰인 키워드가 있으면 트리거하고, 이 메시지에
    // 등장한 키워드는(이미 소진된 것 포함) 전부 소진 처리해 이후로는 다시 안 오르게
    // 한다. 여러 개가 동시에 새로 등장해도 트리거 여부는 한 번만 계산한다.
    const freshKeywords = patienceKeywords.filter((k) => msg.includes(k) && !firedKeywords.has(k));
    if (freshKeywords.length > 0) {
      triggeredThisMessage = true;
      for (const k of freshKeywords) firedKeywords.add(k);
    }

    // 반복 질문 경로 — 키워드 소진 여부와 무관하게 항상 독립적으로 작동한다. 이미
    // 다룬 화제라도 같은 표현으로 3번째 반복하면 여전히 트리거된다.
    if (detectRepeatTrigger(clusters, msg)) {
      triggeredThisMessage = true;
    }

    // 두 경로 중 하나라도 트리거됐으면 이 메시지에서는 최대 +1만 반영한다(Phase 57)
    // — 두 경로가 같은 메시지에서 동시에 성립해도 합산하지 않는다.
    if (triggeredThisMessage) count++;
  }

  return count;
}

/**
 * 이 캐릭터에게 보낸 형사의 메시지 전체(과거 히스토리 + 이번 새 메시지)를 처음부터
 * 순서대로 리플레이해 누적 인내심 수치를 계산한다. 완전히 결정론적 — 같은 입력이면
 * 항상 같은 출력이 나온다.
 *
 * round(기본 1) — 현재 라운드(1~3). 라운드가 바뀔 때마다 1씩 깎는다(Phase 56).
 */
export function computePatienceLevel(
  patienceKeywords: string[],
  conversationHistory: PatienceConversationTurn[],
  newUserMessage: string,
  round: number = 1
): number {
  const userMessages = conversationHistory
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content);
  userMessages.push(newUserMessage);

  const rawCount = computeRawTriggerCount(patienceKeywords, userMessages);
  const roundDiscount = Math.max(0, round - 1);
  return Math.min(Math.max(rawCount - roundDiscount, 0), PATIENCE_MAX);
}

/**
 * Phase 59 — 채점(scoring.ts)의 "심문 효율"(→ 심문 강도) 항목용. 순수 소요 시간
 * 기준(Phase 30)과 "낭비성 반복 적을수록 가점"(Phase 58) 둘 다 "심문을 아예 안 하면
 * 오히려 만점"이라는 같은 결함을 가지고 있었다 — 사용자가 "인내심을 얼마나
 * 건드렸나"로 방향을 뒤집자고 제안했다: 라운드 감소·PATIENCE_MAX 상한 없이, 이
 * 캐릭터에게 인내심을 실제로 몇 번 성공적으로 올렸는지(키워드 신규 적중 + 3번째
 * 반복) 그대로 센다. 심문을 안 하면 0 — 더 이상 만점이 아니다.
 */
export function countPatienceEngagement(patienceKeywords: string[], userMessages: string[]): number {
  return computeRawTriggerCount(patienceKeywords, userMessages);
}
