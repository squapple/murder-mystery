// 로컬 전용 대화 품질 테스트 하네스 — 실제 게임과 동일한
// buildActorSystemPrompt/computePatienceLevel을 그대로 재사용해 반복 대화하며
// runQualityCheck(교정+관련성+안전 통합 검수)·포맷 검증을 켜고 끄며 품질 차이를
// 눈으로 비교하기 위한 스크립트다. Next.js 앱/Cloudflare 배포와는 무관 — src/app
// 라우트에 절대 연결하지 않는다.
//
// Phase 51 — 사용자 제안으로 상용 LLM 서비스의 "전처리 지침 + 낮은 temperature +
// 후처리 4종(안전 검사/일관성 검증/표면 교정/포맷 검증+재시도)" 조합을 실험한다.
//
// Phase 53 — 후처리 3종(교정/관련성/안전)을 각각 별도 콜로 부르면 턴당 필수 콜이
// 4개(생성+교정+관련성+안전)라 여러 턴을 빠르게 이어가면 NIM 무료 티어(40RPM)에
// 곧바로 부딪혔다(Phase 52에서 실제로 429 재현). 세 판정을 콜 1개로 병합
// (quality-check.ts)해 턴당 필수 콜을 2개(생성+통합검수)로 줄였다.
//
// 실행: npm run harness  (내부적으로 tsx --env-file=.env.local harness/chat.ts)
//
// 명령어:
//   /help              명령어 목록
//   /reset             대화 기록 초기화(인내심도 0으로 리셋됨)
//   /character <이름>  캐릭터 교체: park(박서연)/lee(이현우)/jeong(정민아)
//   /persona <MBTI>    페르소나 교체 (ISTJ/ISFP/INTP/INFJ/ESTP/ESFJ/ENTJ/ENFP)
//   /quality on|off    교정+관련성+안전 통합 검수(quality-check.ts) 토글 (기본 on) —
//                      관련성 "아니오" 시 1회 재생성, 안전 "아니오" 시 폴백 문구로 대체
//   /exit              종료

import { createInterface } from "node:readline/promises";
import type OpenAI from "openai";
import {
  getNimClient,
  NIM_MODEL,
  ACTOR_TEMPERATURE,
  getReasoningExtraParams,
} from "../src/lib/nim-client";
import {
  buildActorSystemPrompt,
  parseActorResponse,
  INTERROGATION_LOCKED_TEXT,
} from "../src/lib/prompts/actor-prompt";
import { CHARACTERS, getActorPromptView } from "../src/lib/game-data/characters";
import { PERSONAS } from "../src/lib/game-data/personas";
import { computePatienceLevel, PATIENCE_MAX } from "../src/lib/patience";
import { runQualityCheck, isFormatValid, SAFETY_FALLBACK_TEXT } from "../src/lib/quality-check";
import type { CharacterId, Persona } from "../src/lib/game-data/types";

const DEFAULT_CHARACTER_ID: CharacterId = "role-park-seoyeon";
const DEFAULT_PERSONA_KEY = "ESTP"; // Phase 42 실전 브라우저 테스트에서 실제로 쓰였던 조합 — 흥분 시 말이 꼬이는 사례를 재현하기 좋다.

/** /character 명령어 별칭 — 매번 role-xxx 풀네임을 안 쳐도 되게. */
const CHARACTER_ALIASES: Record<string, CharacterId> = {
  park: "role-park-seoyeon",
  박서연: "role-park-seoyeon",
  lee: "role-lee-hyunwoo",
  이현우: "role-lee-hyunwoo",
  jeong: "role-jeong-mina",
  정민아: "role-jeong-mina",
};

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface HarnessState {
  characterId: CharacterId;
  personaKey: string;
  persona: Persona;
  history: ConversationTurn[];
  qualityCheckEnabled: boolean;
}

function printBanner(state: HarnessState) {
  console.log(
    `\n=== 대화 테스트 하네스 === (character=${CHARACTERS[state.characterId].displayName}, persona=${state.personaKey}, temperature=${ACTOR_TEMPERATURE}, quality=${state.qualityCheckEnabled ? "on" : "off"})`
  );
  console.log(
    "명령어: /help /reset /character <park|lee|jeong> /persona <MBTI> /quality on|off /exit\n"
  );
}

function printHelp() {
  console.log(`
/help              이 도움말
/reset             대화 기록 초기화(인내심도 0으로 리셋)
/character <이름>  캐릭터 교체: park(박서연) / lee(이현우) / jeong(정민아)
/persona <MBTI>    페르소나 교체: ${Object.keys(PERSONAS).join(", ")}
/quality on|off    교정+관련성+안전 통합 검수(quality-check.ts) 토글 (기본 on) —
                   관련성 "아니오" 시 1회 재생성, 안전 "아니오" 시 폴백 문구로 대체
/exit              종료
`);
}

async function generateOnce(
  state: HarnessState,
  userMessage: string,
  patienceLevel: number,
  extraReminder?: string
): Promise<string> {
  const character = getActorPromptView(CHARACTERS[state.characterId]);
  const client = getNimClient();
  const reasoningExtraParams = getReasoningExtraParams(NIM_MODEL);

  let systemPrompt = buildActorSystemPrompt(character, state.persona, patienceLevel, []);
  if (extraReminder) {
    systemPrompt += `\n\n[재생성 지시 — 방금 답변이 형사의 질문에 제대로 대응하지 못했다고 판단됨]\n${extraReminder}`;
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...state.history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];

  const completion = await client.chat.completions.create({
    model: NIM_MODEL,
    max_tokens: 2048,
    temperature: ACTOR_TEMPERATURE,
    top_p: 0.95,
    messages,
    ...reasoningExtraParams,
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

  const rawText = completion.choices[0]?.message?.content ?? "";
  return parseActorResponse(rawText).text;
}

async function handleUserMessage(state: HarnessState, userMessage: string) {
  const character = getActorPromptView(CHARACTERS[state.characterId]);
  const patienceLevel = computePatienceLevel(character.patienceKeywords, state.history, userMessage);

  if (patienceLevel >= PATIENCE_MAX) {
    console.log(`\n[인내심 ${patienceLevel}/${PATIENCE_MAX} — 잠김, LLM 콜 생략]`);
    console.log(INTERROGATION_LOCKED_TEXT);
    state.history.push({ role: "user", content: userMessage });
    state.history.push({ role: "assistant", content: INTERROGATION_LOCKED_TEXT });
    return;
  }

  console.log(`\n[인내심 ${patienceLevel}/${PATIENCE_MAX}]`);

  let rawText = await generateOnce(state, userMessage, patienceLevel);
  console.log(`[RAW]      ${rawText}`);

  // 1단계 — 포맷 검증(LLM 없는 로직): 비었거나 브라켓 잔재가 남아있으면 1회 재생성.
  if (!isFormatValid(rawText)) {
    console.log("[FORMAT] 무효 — 1회 재생성 시도");
    rawText = await generateOnce(
      state,
      userMessage,
      patienceLevel,
      "방금 답변이 비어있거나 형식이 깨졌다. 대괄호나 라벨 없이, 캐릭터의 실제 대사만 자연스러운 문장으로 다시 답하라."
    );
    console.log(`[FORMAT RETRY] ${rawText}`);
  }

  let finalText = rawText;

  // 2단계 — 교정+관련성+안전 통합 검수(콜 1개, Phase 53). 관련성 실패 시 1회
  // 재생성 후 다시 통합 검수, 안전 실패 시 재생성 없이 고정 폴백으로 대체한다
  // (문제 있는 내용을 다시 생성 시도하는 것보다 안전한 문구로 확실히 대체하는
  // 쪽이 안전 계층의 목적에 맞다는 기존 판단 유지).
  if (state.qualityCheckEnabled) {
    let verdict = await runQualityCheck(getNimClient(), NIM_MODEL, userMessage, finalText, getReasoningExtraParams(NIM_MODEL));
    console.log(`[QUALITY] 관련성=${verdict.isRelevant ? "예" : "아니오"}(${verdict.relevanceReason}) 안전=${verdict.isSafe ? "예" : "아니오"}(${verdict.safetyReason})`);
    console.log(`[POLISHED] ${verdict.finalText}`);
    finalText = verdict.finalText;

    if (!verdict.isRelevant) {
      console.log("[RETRY] 관련성 검수 실패 — 1회 재생성 시도");
      const retryText = await generateOnce(
        state,
        userMessage,
        patienceLevel,
        "방금 답변이 형사의 질문 의도를 놓쳤다. 형사가 실제로 무엇을 물었는지 다시 확인하고, 그 질문에 직접 대응하는 대사로 다시 답하라."
      );
      console.log(`[RETRY RAW] ${retryText}`);
      verdict = await runQualityCheck(getNimClient(), NIM_MODEL, userMessage, retryText, getReasoningExtraParams(NIM_MODEL));
      console.log(`[RETRY QUALITY] 관련성=${verdict.isRelevant ? "예" : "아니오"}(${verdict.relevanceReason}) 안전=${verdict.isSafe ? "예" : "아니오"}(${verdict.safetyReason})`);
      finalText = verdict.finalText;
    }

    if (!verdict.isSafe) {
      console.log(`[SAFETY FALLBACK] ${SAFETY_FALLBACK_TEXT}`);
      finalText = SAFETY_FALLBACK_TEXT;
    }
  }

  state.history.push({ role: "user", content: userMessage });
  state.history.push({ role: "assistant", content: finalText });
}

/** 명령어/일반 메시지 한 줄을 처리한다. 인터랙티브 모드와 배치 모드가 공유한다. */
async function processLine(state: HarnessState, rawLine: string): Promise<"continue" | "exit"> {
  const line = rawLine.trim();
  if (!line) return "continue";

  if (line.startsWith("/")) {
    const [cmd, ...rest] = line.slice(1).split(/\s+/);
    const arg = rest.join(" ");

    if (cmd === "exit" || cmd === "quit") return "exit";

    if (cmd === "help") {
      printHelp();
      return "continue";
    }

    if (cmd === "reset") {
      state.history = [];
      console.log("[대화 기록 초기화됨]");
      return "continue";
    }

    if (cmd === "character") {
      const characterId = CHARACTER_ALIASES[arg.toLowerCase()] ?? CHARACTER_ALIASES[arg];
      if (!characterId) {
        console.log(`알 수 없는 캐릭터: ${arg} (가능: park, lee, jeong)`);
        return "continue";
      }
      state.characterId = characterId;
      state.history = [];
      console.log(`[캐릭터를 ${CHARACTERS[characterId].displayName}로 교체, 대화 기록 초기화됨]`);
      return "continue";
    }

    if (cmd === "persona") {
      const key = arg.toUpperCase();
      if (!PERSONAS[key]) {
        console.log(`알 수 없는 페르소나: ${arg} (가능: ${Object.keys(PERSONAS).join(", ")})`);
        return "continue";
      }
      state.personaKey = key;
      state.persona = PERSONAS[key];
      state.history = [];
      console.log(`[페르소나를 ${key}로 교체, 대화 기록 초기화됨]`);
      return "continue";
    }

    if (cmd === "quality") {
      state.qualityCheckEnabled = arg === "on";
      console.log(`[quality: ${state.qualityCheckEnabled ? "on" : "off"}]`);
      return "continue";
    }

    console.log(`알 수 없는 명령어: /${cmd} (/help 참고)`);
    return "continue";
  }

  try {
    await handleUserMessage(state, line);
  } catch (err) {
    console.error("[오류]", err);
  }
  return "continue";
}

function createInitialState(): HarnessState {
  return {
    characterId: DEFAULT_CHARACTER_ID,
    personaKey: DEFAULT_PERSONA_KEY,
    persona: PERSONAS[DEFAULT_PERSONA_KEY],
    history: [],
    // Phase 51 — 사용자 요청으로 후처리를 기본 on으로 바꿨다("항상 켜둔 채 점검").
    qualityCheckEnabled: true,
  };
}

/**
 * 배치 모드 — stdin이 TTY가 아닐 때(파이프/리다이렉트) 쓴다. `rl.question()`을 반복
 * 호출하는 인터랙티브 루프는 파이프 입력 전체가 미리 버퍼링돼 있으면 stdin이 EOF에
 * 도달한 시점과 각 question() 호출 타이밍이 어긋나 뒷줄이 씹히는 문제가 있었다(질문
 * 하나 보내고 응답 기다리는 사이 파이프가 이미 끝까지 다 흘러들어와 버림). 스크립트로
 * 여러 턴을 한 번에 재현·검증할 때 이 문제를 피하려고, 이 경로에서는 stdin 전체를
 * 먼저 다 읽어 줄 단위로 순서대로 처리한다.
 */
async function runBatchMode(state: HarnessState) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const lines = Buffer.concat(chunks).toString("utf-8").split(/\r?\n/);

  for (const line of lines) {
    console.log(`\n형사> ${line}`);
    const result = await processLine(state, line);
    if (result === "exit") break;
  }
}

async function runInteractiveMode(state: HarnessState) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  for (;;) {
    let line: string;
    try {
      line = await rl.question("형사> ");
    } catch {
      break; // stdin이 닫힘(EOF) — 조용히 루프만 빠져나간다.
    }
    const result = await processLine(state, line);
    if (result === "exit") break;
  }

  rl.close();
}

async function main() {
  if (!process.env.NVIDIA_API_KEY) {
    console.error(
      "NVIDIA_API_KEY가 설정되지 않았습니다. `npm run harness`는 .env.local을 자동으로 읽습니다 — 파일에 키가 있는지 확인하세요."
    );
    process.exit(1);
  }

  const state = createInitialState();
  printBanner(state);

  if (process.stdin.isTTY) {
    await runInteractiveMode(state);
  } else {
    await runBatchMode(state);
  }

  console.log("종료합니다.");
}

main();
