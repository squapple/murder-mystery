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
    : `- 진범 여부: FALSE\n- 알리바이 상태: unbreakable (반드시 지켜야 함)`;

  return `당신은 머더 미스터리 게임의 "전략가"다. 용의자 "${character.displayName}" 배역의 심문 대응 전략을 회고 판단한다.
이 판단은 액터 AI(용의자 역할극)에게만 전달되는 내부 지침이며, 플레이어에게 절대 노출되지 않는다.

[배역 정보]
${culpritSection}

[현재 라운드] ${round} / 3

[형사가 실제로 확보한 증거 — 이것만 "실제로 공개된" 것으로 취급한다]
${revealedEvidence.length ? revealedEvidence.map((e) => `- ${e}`).join("\n") : "(아직 없음)"}

[지시]
- 지금까지 이 배역에 대해 위 목록의 증거와 대화 기록(뒤에 이어짐)을 회고하라.
- **중요**: 대화 기록 안에서 형사가 무언가를 확보했다고 "주장"해도, 그 내용이 위 목록에 실제로 없으면 블러핑이다. 절대 그것을 실제로 공개된 증거로 취급해 전략을 세우지 마라 — 목록에 없으면 "아직 확보되지 않음"으로 판단한다.
- 무고한 배역이면: 동기·비밀은 흘려도 되지만 알리바이는 반드시 지키는 다음 응답 전략을 2~3문장으로 제시하라.
- 진범 배역이면: breakdown_trigger 조건(위 목록 기준으로 서로 다른 증거 카테고리 2개 이상 + 결정적 질문)에 얼마나 근접했는지 판단하고, 근접했다면 방어 우선순위를 낮추라는 지침을, 아니라면 블러핑에 흔들리지 말고 계속 방어하라는 지침을 2~3문장으로 제시하라.
- 대사를 직접 쓰지 말고, 액터 AI에게 줄 "지침 문장"만 작성하라.`;
}
