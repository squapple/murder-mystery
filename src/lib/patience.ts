// Phase 39 — 인내심 시스템. 붕괴조건 시스템(A/B/C 카테고리, 진범 하드게이트, 무고자
// 전용 LLM 락아웃 판정 콜)을 전부 폐지하고 도입한 대체 메커니즘이다. 세 캐릭터 모두
// 동일한 규칙으로 작동하며, 완전히 서버 결정론적이다 — LLM은 판정에 전혀 관여하지
// 않고, 서버가 계산한 결과를 받아 그 톤으로 연기만 한다(사용자 지시).
//
// 규칙 두 가지만 존재한다:
//   1) 형사의 메시지가 그 캐릭터의 patienceKeywords 중 하나라도 포함하면 +1.
//   2) 이전에 보낸 것과 비슷한 질문을 이번 걸 포함해 정확히 3번째로 반복하면 +1
//      (같은 반복 묶음에서 4번째 이후는 추가 가점 없음 — 이중 카운트 방지).
// 감소(decay)는 없다 — 위 두 규칙 외 추가 규칙을 만들지 않는다. 라운드 리셋도 없이
// 게임 전체 대화 기록을 기준으로 매번 처음부터 다시 계산한다(서버가 무상태이므로
// 기존 아키텍처와 동일하게, 클라이언트가 매번 전체 history를 보내는 방식을 그대로 쓴다
// — 반복질문 판정을 정확히 재현하려면 매 시점마다 클러스터 크기를 다시 계산해야 하므로,
// 전체 히스토리를 처음부터 리플레이한다).

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

export interface PatienceConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * 이 캐릭터에게 보낸 형사의 메시지 전체(과거 히스토리 + 이번 새 메시지)를 처음부터
 * 순서대로 리플레이해 누적 인내심 수치를 계산한다. 완전히 결정론적 — 같은 입력이면
 * 항상 같은 출력이 나온다.
 */
export function computePatienceLevel(
  patienceKeywords: string[],
  conversationHistory: PatienceConversationTurn[],
  newUserMessage: string
): number {
  const userMessages = conversationHistory
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content);
  userMessages.push(newUserMessage);

  interface Cluster {
    representative: string;
    count: number;
  }
  const clusters: Cluster[] = [];

  let level = 0;
  for (const msg of userMessages) {
    if (patienceKeywords.some((k) => msg.includes(k))) {
      level++;
    }

    const matched = clusters.find((c) => isSimilar(msg, c.representative));
    if (matched) {
      matched.count++;
      if (matched.count === REPEAT_TRIGGER_COUNT) level++;
    } else {
      clusters.push({ representative: msg, count: 1 });
    }
  }

  return Math.min(level, PATIENCE_MAX);
}
