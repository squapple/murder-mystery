// NVIDIA NIM (build.nvidia.com) — OpenAI 호환 API 클라이언트.
// 10_claude_code_handoff.md 기술 스택 절 참조. 서버 API Route에서만 호출한다 —
// 시스템 프롬프트나 ai_only 필드가 클라이언트로 내려가지 않도록 이 모듈은
// "use server" 경계 밖(app/api 라우트 핸들러)에서만 import한다.

import OpenAI from "openai";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

let cachedClient: OpenAI | null = null;

export function getNimClient(): OpenAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NVIDIA_API_KEY 환경변수가 설정되지 않았습니다. .env.local에 NVIDIA_API_KEY=nvapi-... 를 추가하세요."
    );
  }

  cachedClient = new OpenAI({ baseURL: NVIDIA_BASE_URL, apiKey });
  return cachedClient;
}

/**
 * 확정 모델: google/diffusiongemma-26b-a4b-it (병렬 토큰 생성 diffusion LLM).
 *
 * 지연시간 문제 해결을 위해 07개 모델을 동일 3~4턴 시나리오(1R CCTV만 → 2R
 * 신발흙+관리실질문(A+B, 미붕괴 기대) → 3R 목격진술 추가(A+B+C) → 4R 재차 압박)로
 * 비교 테스트한 결과:
 *   - deepseek-ai/deepseek-v4-flash + thinking:high: V1~V4 전부 정확했으나 55~71초로 느림
 *     (medium 재검증 2회 모두 138~150초로 오히려 더 느려 폐기 — 아래 DEEPSEEK_REASONING_PARAMS 참고)
 *   - deepseek-ai/deepseek-v4-pro: turn1이 3분 가까이 걸려 flash보다도 느려 중단
 *   - meta/llama-3.3-70b-instruct: 55초(개선 없음) + 한국어 대사에 힌디어/한자 뒤섞임 → 폐기
 *   - nvidia/nvidia-nemotron-nano-9b-v2: 15.7초로 빠르나 마찬가지로 언어 깨짐 → 폐기
 *   - openai/gpt-oss-20b, gpt-oss-120b: 4~7초로 빠르고 한국어도 깨끗했으나 둘 다
 *     turn2(A+B 2개, C 없음)에서 조기 완전자백 — 모델 크기와 무관한 gpt-oss 계열
 *     (harmony 포맷) 공통 결함으로 판단, fair-play 붕괴조건 위반이라 폐기
 *   - google/diffusiongemma-26b-a4b-it: **채택**. turn1~4가 각각 0.58~0.75초(4턴 합쳐도
 *     3초 미만 — flash 1턴보다 압도적으로 빠름), 한국어 품질 자연스럽고 ESTP 페르소나
 *     (흥분/반말 전환) 표현도 우수. turn2(A+B)에서 조기붕괴 없이 정확히 버텼고, turn3에서
 *     A+B+C가 다 모였는데도 한 번 더 명시적으로 다그쳐야 turn4에서 붕괴 — 사람 심문
 *     심리상 오히려 자연스러운 지연이며 fair-play를 어기지 않음.
 *
 * 폴백: 이 모델이 이후 실사용(8×3 페르소나 확장, 실제 참가자 심문 등)에서 문제가
 * 발견되면 deepseek-ai/deepseek-v4-flash + thinking:high로 되돌린다 — 유일하게
 * V1~V4를 전부 흠결 없이 통과했던 조합이며, 유일한 단점은 속도였다.
 *
 * 카탈로그가 수시로 바뀌므로, 실사용 전 build.nvidia.com에서 유효성 재확인 권장.
 * 환경변수로 다른 카탈로그 모델과 비교 테스트할 수 있도록 오버라이드를 허용한다.
 */
export const NIM_MODEL = process.env.NVIDIA_NIM_MODEL || "google/diffusiongemma-26b-a4b-it";

/**
 * deepseek-v4-flash 기준 검증 결과: thinking 켜고 reasoning_effort=high가 유일하게
 * 안정적이었다 (medium은 두 차례 재현된 실측으로 폐기 — high 55~71초 대비 medium
 * 138~150초). 이 설정은 deepseek 계열 전용이다.
 */
const DEEPSEEK_REASONING_PARAMS = {
  chat_template_kwargs: { thinking: true, reasoning_effort: "high" },
};

/**
 * 모델 계열마다 reasoning 제어 방식이 달라 하나의 파라미터로 통일할 수 없다:
 *   - deepseek 계열: chat_template_kwargs.{thinking, reasoning_effort}
 *   - openai/gpt-oss 계열: 최상위 reasoning_effort 파라미터 (단, fair-play 붕괴조건
 *     조기 위반으로 현재 폐기 상태 — 위 NIM_MODEL 주석 참고)
 *   - nvidia-nemotron-nano 계열: 시스템 프롬프트 안의 /think, /no_think 키워드
 *     (요청 바디 파라미터가 아니므로 여기서 처리하지 않음)
 *   - google/diffusiongemma 계열(확정 모델): 별도 reasoning 파라미터 없이 기본 호출만으로
 *     V1~V4를 전부 만족했다 — "configurable thinking mode"가 있다는 문서도 있었지만
 *     굳이 켤 필요가 없을 만큼 기본 동작이 이미 빠르고 정확해 추가 조사하지 않았다.
 *   - 그 외(llama-3.3-70b-instruct 등 reasoning 토글이 없는 일반 instruct 모델): 없음
 * 알 수 없는 모델은 빈 객체를 반환해 그대로 기본 동작으로 호출한다.
 */
export function getReasoningExtraParams(model: string): Record<string, unknown> {
  if (model.startsWith("deepseek-ai/")) return DEEPSEEK_REASONING_PARAMS;
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "medium" };
  return {};
}
