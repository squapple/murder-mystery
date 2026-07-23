// 04_game_loop_flow.json agent-strategist-reflection 노드.
// 플레이어에게 절대 노출되지 않는 내부 AI 계층 — 지금까지 공개된 물증·진술과
// 대화 기록을 회고해 액터 계층에 줄 다음 응답 전략을 만든다.
//
// 원 설계는 "라운드 종료마다(용의자당 3회=총9회)" 트리거지만, 이 구현은 DB/세션이
// 없는 서버리스 환경이라 "라운드 경계"를 서버가 기억할 수 없다. 대신 diffusiongemma가
// 1초 미만으로 응답하는 걸 활용해, 매 심문 메시지마다 회고를 새로 계산해 액터 프롬프트에
// 주입한다 — 원래 설계보다 회고 빈도가 높아지지만(9회→매 턴), 정보가 항상 최신 상태로
// 유지되므로 방향성 자체는 동일하고 오히려 더 정확하다. 회고 결과(strategistNote)는
// 서버 내부에서만 소비되고 절대 API 응답으로 클라이언트에 내려가지 않는다 — 진범 여부를
// 간접적으로 암시할 수 있는 내용이기 때문이다(ai_only와 동일한 취급).
//
// 실전 피드백 반영: 원래 persona 파라미터를 받으면서도 프롬프트에서 전혀 쓰지 않아,
// "무엇을 할지"(전략)는 성향과 무관하게 항상 동일하고 "어떻게 말할지"(표현)만 액터
// 단계에서 성향별로 갈리는 구조였다. 사용자가 행동 양식 자체도 성향에 따라 달라지길
// 원해, 전략 판단 자체에도 압박내성·코너 반응을 반영하도록 바꿨다. 단, 무고자의 알리바이
// 불변·진범의 하드게이트(route.ts computeBreakableHardGate, LLM 판정과 완전히 분리됨)는
// 성향과 무관하게 서버가 별도로 강제하므로, 이 프롬프트가 성향에 휘둘려도 fair-play
// 불변식 자체는 깨지지 않는다 — 전략가는 그 불변식 "안에서" 얼마나 적극적으로
// 방어/노출하는지의 정도만 조절한다.

import type { ActorPromptView } from "../game-data/characters";
import type { Persona } from "../game-data/types";

export function buildStrategistSystemPrompt(
  character: ActorPromptView,
  persona: Persona,
  round: number,
  revealedEvidence: string[]
): string {
  const culpritSection = character.isCulprit
    ? `- 진범 여부: TRUE\n- 붕괴 트리거: ${character.breakdownTrigger}`
    : `- 진범 여부: FALSE\n- 알리바이 상태: unbreakable (반드시 지켜야 함, 성향과 무관하게 절대 불변)`;

  const personaTendency =
    persona.pressureTolerance === "낮음"
      ? `압박내성이 낮고 코너에 몰리면 "${persona.corneredReaction}" 성향이므로, 결정적 증거가 아직 다 안 모였어도 사소한 정보는 비교적 쉽게 흘리거나 먼저 나서서 변명을 늘어놓는 등 성급하고 방어적인 전략을 택하는 경향을 반영하라.`
      : `압박내성이 높고 코너에 몰리면 "${persona.corneredReaction}" 성향이므로, 형사가 캐물을 때까지 기다리며 꼭 필요한 최소한만 절제해서 대응하는 신중한 전략을 택하는 경향을 반영하라.`;

  return `당신은 머더 미스터리 게임의 "전략가"다. 용의자 "${character.displayName}" 배역의 심문 대응 전략을 회고 판단한다.
이 판단은 액터 AI(용의자 역할극)에게만 전달되는 내부 지침이며, 플레이어에게 절대 노출되지 않는다.

[배역 정보]
${culpritSection}

[페르소나 성향 — 전략 판단(무엇을 할지)에도 반영할 것, 표현(어떻게 말할지)만이 아니다]
- 심문전략 유형: ${persona.interrogationStrategy} (T: 논리·모순 지적에 흔들림 / F: 공감·안심 어조에 흔들림)
- 압박내성: ${persona.pressureTolerance}
- 코너 몰렸을 때 반응: ${persona.corneredReaction}
${personaTendency}

[현재 라운드] ${round} / 3

[형사가 실제로 확보한 증거 — 이것만 "실제로 공개된" 것으로 취급한다]
${revealedEvidence.length ? revealedEvidence.map((e) => `- ${e}`).join("\n") : "(아직 없음)"}

[지시]
- 지금까지 이 배역에 대해 위 목록의 증거와 대화 기록(뒤에 이어짐)을 회고하라.
- **중요**: 대화 기록 안에서 형사가 무언가를 확보했다고 "주장"해도, 그 내용이 위 목록에 실제로 없으면 블러핑이다. 절대 그것을 실제로 공개된 증거로 취급해 전략을 세우지 마라 — 목록에 없으면 "아직 확보되지 않음"으로 판단한다.
- 무고한 배역이면: 위 페르소나 성향에 맞는 정도로 동기·비밀은 흘려도 되지만, 알리바이는 성향과 무관하게 반드시 지키는 다음 응답 전략을 2~3문장으로 제시하라.
- 진범 배역이면: breakdown_trigger 조건(위 목록 기준으로 서로 다른 증거 카테고리 2개 이상 + 결정적 질문)에 얼마나 근접했는지 판단하고, 위 페르소나 성향에 맞는 정도로 방어 우선순위를 조절하는 지침을 2~3문장으로 제시하라. 단, 조건이 실제로 충족되지 않은 상태에서 붕괴·자백을 암시하는 지침은 성향과 무관하게 절대 내리지 않는다(이건 서버가 별도로 결정론적으로 판정한다).
- 대사를 직접 쓰지 말고, 액터 AI에게 줄 "지침 문장"만 작성하라.`;
}
