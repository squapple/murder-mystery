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
//
// Phase 54 — harness/(Phase 44~53)에서 검증한 생성 전 품질 지침 + temperature=0.2 +
// 통합 후처리(교정/관련성/안전, quality-check.ts)를 실제 배포 경로에 연결했다. 턴당
// LLM 콜이 1→2(재시도 시 최대 4~5)로 늘지만, NVIDIA NIM 레이트리밋(40RPM)은 API 키
// 전체에 걸친 공유 한도이므로 혼자/소수 인원이 플레이하는 상황에서는 문제되지 않는다
// (여러 팀이 동시에 플레이하는 대규모 시연 상황이라면 이 계수 증가를 다시 검토할 것).
//
// Phase 60 — Phase 55에서 harness 전용으로 검증했던 교정 신뢰성 재확인
// (verifyCorrectionFidelity: 교정본이 원문 의미를 왜곡했는지 액터 페르소나를 다시
// 불러 확인)을 여기 연결했다. 교정으로 텍스트가 실제로 바뀐 경우에만 추가 콜이
// 나가므로(변경 없으면 스킵) 평소엔 비용 증가가 크지 않다. 재시도 횟수는
// nim-client.ts의 MAX_FIDELITY_RETRIES(harness와 공유)로 고정.

import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import {
  getNimClient,
  NIM_MODEL,
  ACTOR_TEMPERATURE,
  MAX_FIDELITY_RETRIES,
  getReasoningExtraParams,
} from "@/lib/nim-client";
import {
  runQualityCheck,
  isFormatValid,
  SAFETY_FALLBACK_TEXT,
  verifyCorrectionFidelity,
} from "@/lib/quality-check";
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
  // Phase 56 — 라운드가 바뀔 때마다 1씩 깎이도록 round를 전달한다.
  const patienceLevel = computePatienceLevel(
    actorPromptView.patienceKeywords,
    conversationHistory,
    userMessage,
    round
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
        revealedEvidenceFacts
      );

      // Phase 54 — harness/chat.ts와 동일한 재생성 패턴: 재시도 시에도 같은
      // systemPrompt/history를 쓰되, 실패 사유를 짚어주는 지시문 한 줄만 덧붙인다.
      async function generateOnce(extraReminder?: string): Promise<string> {
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: extraReminder ? `${systemPrompt}\n\n${extraReminder}` : systemPrompt,
          },
          ...historyMessages,
          { role: "user", content: userMessage },
        ];

        const completion = await client.chat.completions.create({
          model: NIM_MODEL,
          max_tokens: 2048,
          temperature: ACTOR_TEMPERATURE,
          top_p: 0.95,
          messages,
          ...reasoningExtraParams,
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming &
          typeof reasoningExtraParams);

        const rawText = completion.choices[0]?.message?.content ?? "";
        return parseActorResponse(rawText).text;
      }

      let rawText = await generateOnce();

      // 1단계 — 포맷 검증(LLM 콜 없는 순수 로직). 비었거나 브라켓 잔재가 남아있으면
      // 1회 재생성한다.
      if (!isFormatValid(rawText)) {
        rawText = await generateOnce(
          "[재생성 지시] 방금 답변이 비어있거나 형식이 깨졌다. 대괄호나 라벨 없이, 캐릭터의 실제 대사만 자연스러운 문장으로 다시 답하라."
        );
      }

      // 교정본이 원문 의미를 왜곡했는지, 교정으로 텍스트가 실제로 바뀐 경우에만
      // 같은 액터 페르소나를 다시 불러 확인한다(Phase 55, harness에서 검증 후
      // 이번에 프로덕션에 연결). 실패하면 반려된 교정 내용을 알려주고 재교정→재검증을
      // 최대 MAX_FIDELITY_RETRIES회까지 반복하고, 그래도 실패하면 교정을 포기하고
      // 원문(sourceText)으로 폴백한다 — harness/chat.ts의 runQualityCheckWithFidelity와
      // 동일한 로직.
      async function verifyAndMaybeRetryCorrection(
        sourceText: string,
        initialVerdict: Awaited<ReturnType<typeof runQualityCheck>>
      ): Promise<Awaited<ReturnType<typeof runQualityCheck>>> {
        let verdict = initialVerdict;
        if (verdict.finalText.trim() === sourceText.trim()) return verdict;

        for (let attempt = 1; attempt <= MAX_FIDELITY_RETRIES; attempt++) {
          const fidelity = await verifyCorrectionFidelity(
            client,
            NIM_MODEL,
            systemPrompt,
            historyMessages,
            userMessage,
            sourceText,
            verdict.finalText,
            reasoningExtraParams
          );
          console.log(
            `[interrogate] fidelity ${attempt}/${MAX_FIDELITY_RETRIES} character=${characterId} matches=${fidelity.matches} reason=${fidelity.reason}`
          );

          if (fidelity.matches) return verdict;
          if (attempt >= MAX_FIDELITY_RETRIES) break;

          const rejected = verdict.finalText;
          verdict = await runQualityCheck(
            client,
            NIM_MODEL,
            userMessage,
            sourceText,
            reasoningExtraParams,
            rejected
          );
          if (verdict.finalText.trim() === sourceText.trim()) return verdict;
        }

        console.log(
          `[interrogate] fidelity fallback character=${characterId} — 교정 포기, 원문 사용`
        );
        return { ...verdict, finalText: sourceText };
      }

      // 2단계 — 교정+관련성+안전 통합 검수(콜 1개, Phase 53/54). 관련성 실패 시
      // 1회 재생성 후 다시 통합 검수, 안전 실패 시 재생성 없이 고정 폴백으로
      // 대체한다 — harness/chat.ts와 동일한 파이프라인.
      let verdict = await runQualityCheck(
        client,
        NIM_MODEL,
        userMessage,
        rawText,
        reasoningExtraParams
      );
      verdict = await verifyAndMaybeRetryCorrection(rawText, verdict);
      let responseText = verdict.finalText;

      if (!verdict.isRelevant) {
        const retryText = await generateOnce(
          "[재생성 지시] 방금 답변이 형사의 질문 의도를 놓쳤다. 형사가 실제로 무엇을 물었는지 다시 확인하고, 그 질문에 직접 대응하는 대사로 다시 답하라."
        );
        verdict = await runQualityCheck(
          client,
          NIM_MODEL,
          userMessage,
          retryText,
          reasoningExtraParams
        );
        verdict = await verifyAndMaybeRetryCorrection(retryText, verdict);
        responseText = verdict.finalText;
      }

      if (!verdict.isSafe) {
        responseText = SAFETY_FALLBACK_TEXT;
      }

      const elapsedMs = Date.now() - startedAt;

      // 소지품 요청(가방 등) 판정은 여기서 하지 않는다 — 라운드 종료 시
      // /api/round-review가 그 라운드 대화 전체를 한 번에 검토해 일괄 처리한다.

      console.log(
        `[interrogate] model=${NIM_MODEL} character=${characterId} persona=${persona.mbtiType} round=${round} elapsedMs=${elapsedMs} patienceLevel=${patienceLevel}/${PATIENCE_MAX} locked=false relevance=${verdict.isRelevant} safety=${verdict.isSafe}`
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
