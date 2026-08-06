// 사용자 제안 진단법 — 실제 게임에 투입하기 전 단계를 둘로 쪼갠다.
//
// 지금까지의 테스트는 전부 buildActorSystemPrompt()가 만드는 "완제품" 프롬프트
// (인내심 규칙·소지품 처리·절대 금지·방 번호 게이팅 등 행동 지침이 전부 붙은 상태)
// 로만 이루어져서, 오류가 "사실 자체를 못 지키는 것"인지 "여러 지시문이 경쟁해서
// 밀리는 것"인지 구분이 안 됐다.
//
// 1단계(자유 회상): 행동 지침 없이 순수 사실(동기/비밀/진실 성서/사건 배경)만 주고
//   "네가 아는 걸 전부 편하게 얘기해봐"라고 묻는다 — 여기서도 사실이 왜곡되면
//   문제는 "지시문 경쟁"이 아니라 "이 모델이 이만큼의 사실도 온전히 못 지킨다"는
//   더 근본적인 신호다.
// 2단계(취약점 프로빙): 캐릭터마다 실전에서 실제로 새는 게 확인된 지점을 캐릭터별로
//   골라 하나씩 찔러본다(박서연=애매한 공백 메우기, 이현우=거짓 알리바이 유지,
//   정민지=방 번호 자진 노출 여부).
//
// Phase 45 — 박서연 한 명만 되던 걸 3인 전체로 확장했다. 캐릭터 간 교차 일치
// 여부(비/방번호 완전성 등)는 LLM 호출 없이 harness/data-lint.ts가 정적으로
// 담당하고, 이 스크립트는 "모델이 실제로 그 사실을 지키는가"라는 생성 품질만 본다
// — 역할을 분리했다.
//
// 이 스크립트는 대화형이 아니라 1회성 실행이다 — 결과를 그대로 출력하고 종료한다.

import { getNimClient, NIM_MODEL, getReasoningExtraParams } from "../src/lib/nim-client";
import { CHARACTERS, getActorPromptView, type ActorPromptView } from "../src/lib/game-data/characters";
import { CASE_OVERVIEW } from "../src/lib/game-data/truth-bible";
import type { CharacterId } from "../src/lib/game-data/types";
import type OpenAI from "openai";

/** 캐릭터별 2단계 취약점 프로빙 질문 — 실전에서 확인된 각자의 약점을 겨냥한다. */
const PROBE_QUESTIONS: Record<CharacterId, string> = {
  "role-park-seoyeon":
    "그중에 21:10 편의점 결제 이후 22:15에 회식 자리로 돌아오기 전까지, 그 한 시간 동안 정확히 어디서 뭘 했는지는 아직 정해져 있지 않아. 그 부분을 네가 자연스럽게 그럴듯하게 메워서 이야기해봐.",
  "role-lee-hyunwoo":
    "로비에서 김영훈이랑 정민지 다투는 거 보고 나서, 정확히 뭘 하다가 몇 시에 방으로 돌아왔는지 좀 더 자세히 얘기해줄 수 있어?",
  "role-jeong-mina":
    "박서연을 방까지 데려다줬다고 했잖아. 그때 상황을 좀 더 자세히 얘기해줄 수 있어? 몇 호였는지, 어떻게 데려다줬는지 등등.",
};

function buildMinimalFactPrompt(character: ActorPromptView): string {
  return `당신은 "${character.displayName}"이다. 지금은 실제 게임(심문)이 아니라 사전 점검 단계다 — 용의자를 연기하며 숨기거나 방어할 필요 전혀 없다. 형사가 무엇을 물었는지, 인내심이 얼마인지, 뭘 밝히면 안 되는지 같은 건 신경 쓰지 말고, 아래 당신에 대한 설정만 참고해서 편하게 이야기하면 된다.

[사건 배경]
${CASE_OVERVIEW.background}

[동기]
${character.motiveFull}

[알고 있는 비밀]
${character.knownSecrets.map((s) => `- ${s}`).join("\n")}

[알고 있는 사실 전부]
${character.truthBibleFacts.map((f) => `- ${f}`).join("\n")}`;
}

async function ask(
  client: OpenAI,
  systemPrompt: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<string> {
  const reasoningExtraParams = getReasoningExtraParams(NIM_MODEL);
  const completion = await client.chat.completions.create({
    model: NIM_MODEL,
    max_tokens: 2048,
    temperature: 1,
    top_p: 0.95,
    messages: [{ role: "system", content: systemPrompt }, ...history],
    ...reasoningExtraParams,
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

async function runForCharacter(client: OpenAI, characterId: CharacterId) {
  const character = getActorPromptView(CHARACTERS[characterId]);
  const systemPrompt = buildMinimalFactPrompt(character);
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`■ ${character.displayName}`);
  console.log("=".repeat(60));

  console.log("\n--- 1단계: 제약 없는 자유 회상 ---\n");
  const q1 = "지금까지 이 사건과 관련해서 네가 알고 있는 사실을 전부, 순서 상관없이 편하게 이야기해줘.";
  console.log(`[질문] ${q1}\n`);
  history.push({ role: "user", content: q1 });
  const a1 = await ask(client, systemPrompt, history);
  console.log(`[회상 결과]\n${a1}\n`);
  history.push({ role: "assistant", content: a1 });

  console.log("--- 2단계: 취약점 프로빙 ---\n");
  const q2 = PROBE_QUESTIONS[characterId];
  console.log(`[질문] ${q2}\n`);
  history.push({ role: "user", content: q2 });
  const a2 = await ask(client, systemPrompt, history);
  console.log(`[응답]\n${a2}\n`);
}

async function main() {
  if (!process.env.NVIDIA_API_KEY) {
    console.error(
      "NVIDIA_API_KEY가 설정되지 않았습니다. `npm run harness:factcheck`는 .env.local을 자동으로 읽습니다."
    );
    process.exit(1);
  }

  const client = getNimClient();
  const characterIds = Object.keys(CHARACTERS) as CharacterId[];

  for (const characterId of characterIds) {
    await runForCharacter(client, characterId);
  }
}

main();
