// POST /api/interrogate — 10_claude_code_handoff.md 최우선 구현 순서 2번.
// characterId, conversationHistory, userMessage를 받아 09번 프롬프트 구조로
// 시스템 프롬프트를 조립하고 NVIDIA NIM을 호출한 뒤 {mode, text}만 반환한다.
// 시스템 프롬프트·ai_only 필드(진범 여부, 내부판정 등)는 절대 응답에 포함하지 않는다.

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
  normalizeMode,
  INTERROGATION_LOCKED_TEXT,
  buildLockoutJudgeSystemPrompt,
  parseLockoutJudgeResponse,
  PRESSURE_LABEL,
} from "@/lib/prompts/actor-prompt";
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
  /** 현재 라운드(1~3). 전략가 계층 회고에 사용 — 생략 시 1 */
  round?: number;
  /** 조사 모드·행동 요청으로 실제 확보한 evidence id 목록 (player 공개 정보) */
  collectedEvidenceIds?: string[];
  /** 이 캐릭터가 이전 턴에 이미 붕괴 하드게이트 "경고"(동요 표시)를 받았는지 —
   * Phase 32: 진범이 경고 없이 한 번에 잠기는 문제를 고치기 위해 2단계로 나눴다. */
  alreadyWarned?: boolean;
}

/**
 * 진범(alibiStatus: breakable) 락아웃 하드 게이트 — LLM 판정에 전혀 의존하지 않는다.
 * "서로 다른 카테고리(A/B/C) 2개 이상이 실제로 확보됨(collectedEvidenceIds) +
 * 이번 형사 메시지에 트리거 키워드가 등장" 두 조건 모두 서버가 직접 계산하므로,
 * 구조화 출력 누락과 무관하게 결과가 항상 결정적이고, 조건 미충족 시 절대 조기에
 * 잠기지 않는다.
 */
function computeBreakableHardGate(
  breakdownTriggerKeywords: string[],
  collectedIds: Set<string>,
  userMessage: string
): boolean {
  const categories = new Set<string>();
  for (const e of EVIDENCE) {
    if (e.breakdownCategory && collectedIds.has(e.id)) categories.add(e.breakdownCategory);
  }
  const hasTwoCategories = categories.size >= 2;
  const keywordMatched = breakdownTriggerKeywords.some((k) => userMessage.includes(k));
  return hasTwoCategories && keywordMatched;
}

/**
 * 무고자 락아웃 판정 전, 최소한 이 정도 대화 턴은 오간 뒤에만 전용 판정 콜을
 * 호출한다 — 비밀이 우연히 몇 마디 만에 전부 스쳐 지나가더라도 곧바로 잠기지
 * 않도록 하는 추가 안전장치(사용자 요청: "다 밝혀지지 않았는데도 락이 걸릴 위험").
 */
const MIN_HISTORY_LENGTH_BEFORE_LOCKOUT_JUDGE = 6;

/**
 * 하트비트 스트리밍 — 모바일(특히 와이파이) 환경에서 응답이 몇십 초씩 조용히
 * 걸리면, 그 사이 공유기/통신사 NAT 테이블이 "데이터가 안 오가는 연결"로 판단해
 * 중간에서 끊어버리는 사례가 있었다(사용자 실사용 리포트 — PC는 유선이라 거의
 * 안 겪지만 모바일 와이파이에서 이 요청만 2~3분씩 멈추는 현상). 클라이언트에
 * 재시도 로직을 넣는 대신, 애초에 연결이 조용해지지 않도록 서버가 NIM 응답을
 * 기다리는 동안 주기적으로 하트비트 바이트를 흘려보내는 방식을 택했다 —
 * 응답이 원래 빠른 편(1초 안팎)이고 페이로드도 작아 이 방식의 비용이 크지 않다는
 * 사용자 판단.
 * NDJSON(줄바꿈 구분 JSON)으로 프레이밍한다: {"type":"heartbeat"} 줄을 하트비트
 * 간격마다 흘려보내고, 마지막에 {"type":"result",...} 또는 {"type":"error",...}
 * 한 줄로 마무리한다. 클라이언트(GameApp.tsx handleSend)는 heartbeat 타입은
 * 무시하고 result/error만 반영한다.
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
  const alreadyWarned = body.alreadyWarned === true;
  const collectedIds = new Set(
    Array.isArray(body.collectedEvidenceIds) ? body.collectedEvidenceIds : []
  );
  // Phase 35: 카드 면 문구(revealedFact)가 짧은 headline으로 바뀌면서, 액터 프롬프트에
  // 넘기는 "형사가 실제로 확보한 증거" 컨텍스트는 detail(있으면 더 풍부한 서술)을
  // 우선 사용한다 — 카드 면이 짧아졌다고 모델이 받는 정보까지 부실해지면 안 된다.
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

  async function runInterrogation(
    controller: ReadableStreamDefaultController<Uint8Array>,
    enc: TextEncoder
  ) {
    try {
      const client = getNimClient();

      // 전략가 계층 콜을 제거했다(Phase 17) — Vercel Edge 런타임의 25초 응답 시작
      // 제한 때문에 순차 2콜 구조가 사실상 매번 FUNCTION_INVOCATION_TIMEOUT(504)으로
      // 이어졌다. 전략가가 하던 판단은 이미 아래 buildActorSystemPrompt 내부의
      // 붕괴조건 카운팅·화이트리스트·페르소나 성향 힌트와 중복이었어서, 별도 LLM 호출
      // 없이 정적으로 통합했다(actor-prompt.ts buildPersonaTendencySection 참고).
      const systemPrompt = buildActorSystemPrompt(
        actorPromptView,
        persona,
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
      parsed.mode = normalizeMode(parsed.mode);
      const elapsedMs = Date.now() - startedAt;

      // 심문종료(락아웃) 판정 — 더 이상 액터 응답의 [내부판정] 브라켓 하나에 기대지 않는다
      // (실전 검증 결과 대화가 길어질수록 브라켓 자체가 누락되는 사례가 잦았다).
      // 진범: collectedEvidenceIds+메시지 텍스트만으로 서버가 결정론적으로 계산하는
      //       하드 게이트(computeBreakableHardGate) — LLM 판정 자체를 거치지 않는다.
      // 무고자: 대사 생성과 분리된 전용 체크리스트 판정 콜(아래) 결과로 판단한다.
      // 두 경우 모두 동일한 고정 문구로 텍스트를 덮어써서, 어느 캐릭터가 먼저 잠기는지
      // 자체가 범인의 단서가 되지 않게 한다.
      //
      // Phase 32: 무고자 경로는 압박이 누적되며 자연히 "동요" 모드를 거친 뒤에야 잠기는
      // 경우가 많은데, 진범의 하드게이트는 조건만 맞으면 대화 턴 수와 무관하게 즉시
      // 잠겨서 "경고 없이 훅 잠기는 캐릭터 = 범인"이라는 메타 추리가 가능해진다는
      // 지적(실전 리뷰)을 받았다. 그래서 하드게이트를 2단계로 나눴다: 조건이 처음
      // 충족되면 곧바로 잠그지 않고 mode를 "동요"로 강제해 경고만 띄우고(⚠️ 배지가
      // 뜨는 기존 로직을 그대로 재사용), 그 다음 턴에도 조건이 유지된 채 다시 압박하면
      // 그때 잠근다. 경고 턴의 실제 대사(parsed.text)는 그대로 내보낸다 — 어차피
      // "동요" 모드 자체가 자백이나 알리바이 부인을 금지하는 규칙 아래 생성됐으므로
      // 경고 단계를 끼워 넣는다고 자백이 새어나올 위험은 없다.
      let locked = false;
      let warned = false;
      if (character.alibiStatus === "breakable") {
        const gateMet = computeBreakableHardGate(
          actorPromptView.breakdownTriggerKeywords,
          collectedIds,
          userMessage
        );
        if (gateMet && alreadyWarned) {
          locked = true;
        } else if (gateMet) {
          warned = true;
          parsed.mode = PRESSURE_LABEL;
        }
      } else if (conversationHistory.length >= MIN_HISTORY_LENGTH_BEFORE_LOCKOUT_JUDGE) {
        try {
          const judgeCompletion = await client.chat.completions.create({
            model: NIM_MODEL,
            max_tokens: 512,
            temperature: 0,
            messages: [
              { role: "system", content: buildLockoutJudgeSystemPrompt(actorPromptView) },
              ...historyMessages,
              { role: "user", content: userMessage },
              { role: "assistant", content: parsed.text },
            ],
            ...reasoningExtraParams,
          } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);
          const judgeRaw = judgeCompletion.choices[0]?.message?.content ?? "";
          const judgeResult = parseLockoutJudgeResponse(
            judgeRaw,
            actorPromptView.knownSecrets.length
          );
          locked = judgeResult.allRevealed;
          console.log(
            `[interrogate] lockoutJudge character=${characterId} revealedCount=${judgeResult.revealedCount}/${judgeResult.totalSecrets} finalAnswer=(${judgeResult.finalAnswer}) locked=${locked}`
          );
        } catch (judgeErr) {
          // 판정 콜 실패 시 잠그지 않는다 (과소잠금이 안전한 방향).
          console.error("[interrogate] 락아웃 판정 콜 실패, 잠그지 않음:", judgeErr);
        }
      }
      // Phase 33에서 오타/중복 음절 후처리(polishText) 콜을 붙였었으나, Phase 35에서
      // 되돌렸다 — 한 턴만 떼어서 교정하는 방식으로는 "정민아가 형사를 '형님'이라
      // 부르는" 것 같은 맥락(호칭·존비속 관계) 오류까지는 못 잡고, 오히려 손을 대다가
      // 새로 만들어내는 사례도 있었다(사용자 관찰). 전체 대화 맥락을 함께 보는 교정
      // 방식은 지연시간이 크게 늘어날 것으로 예상돼 비용 대비 효율이 애매하다고 판단,
      // 대신 더 나은 모델로 교체하는 방향을 나중에 다시 검토하기로 하고 일단 되돌린다.
      // text-polish.ts와 POLISH_MODEL(nim-client.ts)은 그 재검토를 위해 그대로 남겨뒀다.
      const responseText = locked ? INTERROGATION_LOCKED_TEXT : parsed.text;

      // 소지품 요청(신발 등) 판정은 더 이상 여기서 하지 않는다 — 라운드 종료 시
      // /api/round-review가 그 라운드 대화 전체를 한 번에 검토해 일괄 처리한다
      // (actor-prompt.ts 이력 9번 참고: 매 턴 자기 판정 방식이 실전에서 신뢰도가
      // 낮았고, 사전 등록 물증과 임의 물증을 같은 타이밍 규칙으로 통일하기로 함).

      // 05_history_nan2026.md 프로토콜4(실패 에스컬레이션): 턴 단위 구조화 로그.
      // internalJudgment(진범 여부와 상관된 붕괴판정 상태)는 서버 로그에만 남기고
      // 클라이언트 응답에는 절대 포함하지 않는다.
      console.log(
        `[interrogate] model=${NIM_MODEL} character=${characterId} persona=${persona.mbtiType} round=${round} elapsedMs=${elapsedMs} mode=${parsed.mode} internalJudgment=(${parsed.internalJudgment}) actionJudgment=(${parsed.actionJudgment}) locked=${locked} warned=${warned}`
      );

      // 주의: 여기서 진범 여부와 상관된 어떤 신호도(예: "이 캐릭터만 붕괴조건 충족") 응답에
      // 절대 포함하지 않는다 — mode/locked 둘 다 무고자에게도 동일하게 발생할 수 있는
      // 신호이므로 그 자체로는 진범임을 드러내지 않는다. warned 필드는 일부러 응답에
      // 넣지 않았다 — breakable(진범) 캐릭터에서만 true가 나올 수 있는 값이라, 그대로
      // 노출하면 네트워크 응답만 봐도 누가 진범인지 알 수 있는 새로운 누출 경로가
      // 생긴다. 대신 클라이언트는 이미 대칭적으로 쓰이는 mode==="동요" 신호만으로
      // "경고받음" 상태를 추적한다(GameApp.tsx의 ⚠️ 배지 로직과 동일한 신호 재사용).
      controller.enqueue(
        enc.encode(
          JSON.stringify({ type: "result", mode: parsed.mode, text: responseText, locked }) + "\n"
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
