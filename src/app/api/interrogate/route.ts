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
import {
  buildActorSystemPrompt,
  parseActorResponse,
  normalizeMode,
  INTERROGATION_LOCKED_TEXT,
  buildLockoutJudgeSystemPrompt,
  parseLockoutJudgeResponse,
} from "@/lib/prompts/actor-prompt";
import { CHARACTERS, getActorPromptView } from "@/lib/game-data/characters";
import { PERSONAS } from "@/lib/game-data/personas";
import { EVIDENCE } from "@/lib/game-data/evidence";
import { resolvePersonaForCharacter } from "@/lib/casting";
import type { CharacterId } from "@/lib/game-data/types";

// Edge 런타임 실험 — 05_history_nan2026.md Phase 13 참고 (casting/route.ts 주석과 동일 이유).
export const runtime = "edge";

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
}

/** 신발 요청 행동이 배역별로 어떤 evidence id를 해금하는지 매핑 */
const SHOE_EVIDENCE_BY_CHARACTER: Record<CharacterId, string> = {
  "role-lee-hyunwoo": "ev-shoe-soil-match",
  "role-park-seoyeon": "ev-shoe-park",
  "role-jeong-mina": "ev-shoe-jeong",
};

/**
 * 실전 관측: 대화가 길어질수록(특히 3라운드) 모델이 [행동판정] 브라켓 자체를
 * 통째로 누락하는 경우가 있었다(대사 자체는 정확히 신발을 벗어주는 연기를 했는데도).
 * AI의 자유문 인식이 의도상으로는 맞았으나 구조화 출력만 누락된 경우를 위한
 * 키워드 기반 보조 감지 — [행동판정]이 명확하지 않을 때만 폴백으로 쓴다.
 */
const SHOE_KEYWORDS = ["신발", "구두"];
const SHOE_REQUEST_VERB_KEYWORDS = ["보여", "벗어", "확인", "제출", "달라", "주시", "달래"];

function looksLikeShoeRequest(message: string): boolean {
  return (
    SHOE_KEYWORDS.some((k) => message.includes(k)) &&
    SHOE_REQUEST_VERB_KEYWORDS.some((k) => message.includes(k))
  );
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
  const revealedEvidenceFacts = EVIDENCE.filter((e) => collectedIds.has(e.id)).map(
    (e) => e.revealedFact
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

  const persona = resolvePersonaForCharacter(castingToken, characterId, PERSONAS);
  if (!persona) {
    return NextResponse.json(
      { error: "castingToken이 유효하지 않습니다. /api/casting을 먼저 호출하세요." },
      { status: 400 }
    );
  }

  const actorPromptView = getActorPromptView(character);
  const reasoningExtraParams = getReasoningExtraParams(NIM_MODEL);
  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = conversationHistory.map(
    (turn): OpenAI.Chat.ChatCompletionMessageParam => ({
      role: turn.role,
      content: turn.content,
    })
  );
  const startedAt = Date.now();

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
    let locked = false;
    if (character.alibiStatus === "breakable") {
      locked = computeBreakableHardGate(
        actorPromptView.breakdownTriggerKeywords,
        collectedIds,
        userMessage
      );
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
    const responseText = locked ? INTERROGATION_LOCKED_TEXT : parsed.text;

    // 신발 요청 행동 처리 — 라운드 진행과 무관하게 즉시 해금한다. 이미 확보된 경우는
    // 다시 내려보내지 않는다(클라이언트가 중복 알림을 띄우지 않도록).
    let unlockedEvidenceId: string | null = null;
    const shoeRequested =
      /신발요청\s*[:=]\s*예/.test(parsed.actionJudgment) || looksLikeShoeRequest(userMessage);
    if (shoeRequested) {
      const shoeId = SHOE_EVIDENCE_BY_CHARACTER[characterId];
      if (shoeId && !collectedIds.has(shoeId)) {
        unlockedEvidenceId = shoeId;
      }
    }

    // 05_history_nan2026.md 프로토콜4(실패 에스컬레이션): 턴 단위 구조화 로그.
    // internalJudgment(진범 여부와 상관된 붕괴판정 상태)는 서버 로그에만 남기고
    // 클라이언트 응답에는 절대 포함하지 않는다.
    console.log(
      `[interrogate] model=${NIM_MODEL} character=${characterId} persona=${persona.mbtiType} round=${round} elapsedMs=${elapsedMs} mode=${parsed.mode} internalJudgment=(${parsed.internalJudgment}) actionJudgment=(${parsed.actionJudgment}) locked=${locked}`
    );

    // 주의: 여기서 진범 여부와 상관된 어떤 신호도(예: "이 캐릭터만 붕괴조건 충족") 응답에
    // 절대 포함하지 않는다 — mode/locked 둘 다 무고자에게도 동일하게 발생할 수 있는
    // 신호이므로 그 자체로는 진범임을 드러내지 않는다.
    return NextResponse.json({
      mode: parsed.mode,
      text: responseText,
      locked,
      unlockedEvidenceId,
    });
  } catch (err) {
    console.error("[interrogate] NVIDIA NIM 호출 실패:", err);
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `AI 호출 실패: ${message}` }, { status: 502 });
  }
}
