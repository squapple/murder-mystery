// POST /api/interrogate — characterId, conversationHistory, userMessage를 받아
// 09번 프롬프트 구조로 시스템 프롬프트를 조립하고 NVIDIA NIM을 호출한 뒤
// {text, locked, patienceLevel}만 반환한다. 시스템 프롬프트·ai_only 필드(진범 여부 등)는
// 절대 응답에 포함하지 않는다.
//
// Phase 39 — 붕괴조건 하드게이트(computeBreakableHardGate)와 무고자 전용 LLM 락아웃
// 판정 콜을 전부 삭제하고, 3인 공통 인내심 시스템(patience.ts)으로 교체했다. 인내심은
// LLM을 부르기 **전에** 서버가 결정론적으로 계산한다 — 최대치에 도달하면 LLM 호출
// 자체를 생략하고 고정 문구를 즉시 반환하고, 그 미만이면 계산된 수치를 프롬프트에
// 주입해 그 톤으로만 연기하게 한다(모델은 언제 잠글지 절대 판단하지 않는다).

import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import {
  getNimClient,
  NIM_MODEL,
  getReasoningExtraParams,
} from "@/lib/nim-client";
// Phase 33에서 쓰던 polishText/POLISH_MODEL 연동은 Phase 35에서 되돌렸다 —
// 자세한 이유는 아래 responseText 계산부 주석 참고. import만 빼고
// text-polish.ts/POLISH_MODEL 자체는 나중을 위해 남겨뒀다.
import {
  buildActorSystemPrompt,
  parseActorResponse,
  INTERROGATION_LOCKED_TEXT,
} from "@/lib/prompts/actor-prompt";
import { computePatienceLevel, PATIENCE_MAX } from "@/lib/patience";
import { CHARACTERS, getActorPromptView } from "@/lib/game-data/characters";
import { PERSONAS } from "@/lib/game-data/personas";
import { EVIDENCE } from "@/lib/game-data/evidence";
import { resolvePersonaForCharacter } from "@/lib/casting";
import type { CharacterId, Persona } from "@/lib/game-data/types";

// Edge 런타임 되돌림 — Phase 18 참고. Edge는 25초 응답 마감이 있는데, 콜 수를
// 줄여도(2→1) 여전히 매번 정확히 그 경계에서 FUNCTION_INVOCATION_TIMEOUT이 재현됐다
// (Edge→NVIDIA 최초 연결 수립 자체가 오래 걸리는 것으로 추정 — 이전엔 2콜째가 1콜째의
// 웜 커넥션에 얹혀가서 우연히 25초 안에 들어왔던 것으로 보인다). Node.js/Fluid Compute
// 기본 300초 한도로 되돌려, 느리고 들쭉날쭉하더라도(9~157초) 최소한 응답은 오게 한다
// — 100% 확정 실패보다는 낫다는 판단.

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface InterrogateRequestBody {
  characterId: CharacterId;
  castingToken: string;
  conversationHistory?: ConversationTurn[];
  userMessage: string;
  /** 현재 라운드(1~3) — 서버 로그용, 게임 로직에는 더 이상 쓰이지 않는다. 생략 시 1 */
  round?: number;
  /** 조사 모드·행동 요청으로 실제 확보한 evidence id 목록 (player 공개 정보) */
  collectedEvidenceIds?: string[];
}

/**
 * 하트비트 스트리밍 — 모바일(특히 와이파이) 환경에서 응답이 몇십 초씩 조용히
 * 걸리면, 그 사이 공유기/통신사 NAT 테이블이 "데이터가 안 오가는 연결"로 판단해
 * 중간에서 끊어버리는 사례가 있었다. 서버가 NIM 응답을 기다리는 동안 주기적으로
 * 하트비트 바이트를 흘려보낸다. NDJSON으로 프레이밍한다: {"type":"heartbeat"} 줄을
 * 간격마다 흘려보내고, 마지막에 {"type":"result",...} 또는 {"type":"error",...}
 * 한 줄로 마무리한다.
 */
const HEARTBEAT_INTERVAL_MS = 5000;

export async function POST(req: NextRequest) {
  let body: InterrogateRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const { characterId, castingToken, userMessage } = body;
  const conversationHistory = Array.isArray(body.conversationHistory)
    ? body.conversationHistory
    : [];
  const round = typeof body.round === "number" ? body.round : 1;
  const collectedIds = new Set(
    Array.isArray(body.collectedEvidenceIds) ? body.collectedEvidenceIds : []
  );
  // Phase 35: 카드 면 문구(revealedFact)가 짧은 headline으로 바뀌면서, 액터 프롬프트에
  // 넘기는 "형사가 실제로 확보한 증거" 컨텍스트는 detail(있으면)을 우선 사용한다 —
  // 카드 면이 짧아졌다고 모델이 받는 정보까지 부실해지면 안 된다.
  const revealedEvidenceFacts = EVIDENCE.filter((e) => collectedIds.has(e.id)).map(
    (e) => e.detail ?? e.revealedFact
  );

  if (
    !characterId ||
    !castingToken ||
    typeof userMessage !== "string" ||
    !userMessage.trim()
  ) {
    return NextResponse.json(
      { error: "characterId, castingToken, userMessage는 필수입니다." },
      { status: 400 }
    );
  }

  const character = CHARACTERS[characterId];
  if (!character) {
    return NextResponse.json(
      { error: `알 수 없는 characterId: ${characterId}` },
      { status: 404 }
    );
  }

  const resolvedPersona = resolvePersonaForCharacter(castingToken, characterId, PERSONAS);
  if (!resolvedPersona) {
    return NextResponse.json(
      { error: "castingToken이 유효하지 않습니다. /api/casting을 먼저 호출하세요." },
      { status: 400 }
    );
  }
  // 위에서 null을 걸러낸 뒤 새 바인딩에 담아둔다 — narrowing된 타입이 아래
  // runInterrogation 클로저에도 그대로 유지되도록 하기 위함(TS는 클로저 안에서
  // 바깥 const의 control-flow narrowing을 보존하지 않는다).
  const persona: Persona = resolvedPersona;

  const actorPromptView = getActorPromptView(character);
  const reasoningExtraParams = getReasoningExtraParams(NIM_MODEL);
  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = conversationHistory.map(
    (turn): OpenAI.Chat.ChatCompletionMessageParam => ({
      role: turn.role,
      content: turn.content,
    })
  );
  const startedAt = Date.now();

  // Phase 39 — 인내심은 LLM을 부르기 전에 서버가 결정론적으로 계산한다
  // (patience.ts). 3인 전부 동일한 규칙, 진범 여부와 무관하게 대칭적으로 작동한다.
  const patienceLevel = computePatienceLevel(
    actorPromptView.patienceKeywords,
    conversationHistory,
    userMessage
  );
  const locked = patienceLevel >= PATIENCE_MAX;

  async function runInterrogation(
    controller: ReadableStreamDefaultController<Uint8Array>,
    enc: TextEncoder
  ) {
    try {
      // 인내심이 최대치에 도달했으면 LLM을 아예 호출하지 않는다 — 모델은 언제 잠글지
      // 절대 판단하지 않고, 서버가 계산한 결과만 그대로 반영한다.
      if (locked) {
        console.log(
          `[interrogate] character=${characterId} round=${round} patienceLevel=${patienceLevel}/${PATIENCE_MAX} locked=true (LLM 콜 생략)`
        );
        controller.enqueue(
          enc.encode(
            JSON.stringify({
              type: "result",
              text: INTERROGATION_LOCKED_TEXT,
              locked: true,
              patienceLevel,
            }) + "\n"
          )
        );
        return;
      }

      const client = getNimClient();

      const systemPrompt = buildActorSystemPrompt(
        actorPromptView,
        persona,
        patienceLevel,
        revealedEvidenceFacts,
        collectedIds
      );
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userMessage },
      ];

      const completion = await client.chat.completions.create({
        model: NIM_MODEL,
        max_tokens: 2048,
        temperature: 1,
        top_p: 0.95,
        messages,
        ...reasoningExtraParams,
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming &
        typeof reasoningExtraParams);

      const rawText = completion.choices[0]?.message?.content ?? "";
      const parsed = parseActorResponse(rawText);
      const elapsedMs = Date.now() - startedAt;

      // Phase 33에서 오타/중복 음절 후처리(polishText) 콜을 붙였었으나, Phase 35에서
      // 되돌렸다 — 한 턴만 떼어서 교정하는 방식으로는 맥락(호칭·존비속 관계) 오류까지는
      // 못 잡고, 오히려 손을 대다가 새로 만들어내는 사례도 있었다(사용자 관찰). 전체
      // 대화 맥락을 함께 보는 교정 방식은 지연시간이 크게 늘어날 것으로 예상돼 비용
      // 대비 효율이 애매하다고 판단, 대신 더 나은 모델로 교체하는 방향을 나중에 다시
      // 검토하기로 하고 일단 되돌린다. text-polish.ts와 POLISH_MODEL(nim-client.ts)은
      // 그 재검토를 위해 그대로 남겨뒀다.
      const responseText = parsed.text;

      // 소지품 요청(가방 등) 판정은 여기서 하지 않는다 — 라운드 종료 시
      // /api/round-review가 그 라운드 대화 전체를 한 번에 검토해 일괄 처리한다.

      console.log(
        `[interrogate] model=${NIM_MODEL} character=${characterId} persona=${persona.mbtiType} round=${round} elapsedMs=${elapsedMs} patienceLevel=${patienceLevel}/${PATIENCE_MAX} locked=false`
      );

      controller.enqueue(
        enc.encode(
          JSON.stringify({ type: "result", text: responseText, locked: false, patienceLevel }) +
            "\n"
        )
      );
    } catch (err) {
      console.error("[interrogate] NVIDIA NIM 호출 실패:", err);
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      controller.enqueue(
        enc.encode(JSON.stringify({ type: "error", error: `AI 호출 실패: ${message}` }) + "\n")
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify({ type: "heartbeat" }) + "\n"));
      }, HEARTBEAT_INTERVAL_MS);

      try {
        await runInterrogation(controller, encoder);
      } finally {
        closed = true;
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
