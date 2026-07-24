// POST /api/accuse — 04_game_loop_flow.json human-final-accusation → proc-score-judge → end-result.
// 최종 지목을 받아 정답 여부(진범 이름 단순 비교)와 점수를 독립적으로 계산하고,
// 이 시점부터는 결과 화면이므로 전체 진실·각 배역 페르소나를 최초로 공개한다
// (03_character_sheets.md visibility: player_post_game). 게임이 끝난 시점이므로
// 여기서 처음으로 진범의 실제 자백 장면을 생성해 공개한다 — 심문 중에는 절대 하지
// 않는다(심문 중 자백을 허용하면 "누가 자백했는지"만 보고 추리 없이 정답을 알 수
// 있어 게임이 무의미해진다). 자백 장면은 심문용 buildActorSystemPrompt를 재사용하지
// 않고 전용 프롬프트(buildConfessionSceneSystemPrompt)를 쓴다 — 심문용 프롬프트에는
// "자백하지 않는다"는 정반대 규칙이 있어 그대로 재사용하면 같은 대화 안에 상충하는
// 지시가 공존하게 된다(actor-prompt.ts 해당 함수 주석 참고, 실전 제보로 확인된
// 메타 발언 이탈 버그의 원인).

import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { judgeAccusation } from "@/lib/scoring";
import { CHARACTERS, CHARACTER_LIST, getActorPromptView } from "@/lib/game-data/characters";
import { decodeCastingToken } from "@/lib/casting";
import { PERSONAS } from "@/lib/game-data/personas";
import { getNimClient, NIM_MODEL, getReasoningExtraParams } from "@/lib/nim-client";
import {
  buildConfessionSceneSystemPrompt,
  buildConfessionSceneDirective,
  parseActorResponse,
} from "@/lib/prompts/actor-prompt";
import type { CharacterId } from "@/lib/game-data/types";

// Edge 런타임 되돌림 — 05_history_nan2026.md Phase 18 참고 (interrogate/route.ts와 동일 이유).

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface AccuseRequestBody {
  accusedCharacterId: CharacterId;
  castingToken: string;
  revealedEvidenceIds?: string[];
  /** 3배역 합산 질문 글자 수 — 효율 보너스 판정용 */
  totalQuestionChars?: number;
  /** 3배역 각각의 실제 심문 대화 기록 — 진범 쪽 기록만 자백 장면 생성에 이어붙여 쓴다 */
  conversationsByCharacter?: Partial<Record<CharacterId, ConversationTurn[]>>;
}

export async function POST(req: NextRequest) {
  let body: AccuseRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const { accusedCharacterId, castingToken } = body;
  if (!accusedCharacterId || !castingToken) {
    return NextResponse.json(
      { error: "accusedCharacterId, castingToken은 필수입니다." },
      { status: 400 }
    );
  }

  const castingMap = decodeCastingToken(castingToken);
  if (!castingMap) {
    return NextResponse.json({ error: "castingToken이 유효하지 않습니다." }, { status: 400 });
  }

  const result = judgeAccusation(accusedCharacterId, {
    revealedEvidenceIds: Array.isArray(body.revealedEvidenceIds) ? body.revealedEvidenceIds : [],
    totalQuestionChars:
      typeof body.totalQuestionChars === "number" ? body.totalQuestionChars : 0,
  });

  const characters = CHARACTER_LIST.map((c) => {
    const personaKey = castingMap[c.characterId];
    const persona = personaKey ? PERSONAS[personaKey] : undefined;
    return {
      characterId: c.characterId,
      displayName: c.displayName,
      roleTitle: c.roleTitle,
      isCulprit: c.isCulprit,
      motiveFull: c.motiveFull,
      personaTag: persona?.playerTag ?? null,
      mbtiType: persona?.mbtiType ?? null,
    };
  });

  // 진범 자백 장면 생성 — 실패해도 결과 자체(정답/점수)는 정상 반환한다.
  let confessionScene = "";
  try {
    const culprit = CHARACTERS[result.culpritCharacterId];
    const culpritPersonaKey = castingMap[result.culpritCharacterId];
    const culpritPersona = culpritPersonaKey ? PERSONAS[culpritPersonaKey] : undefined;

    if (culprit && culpritPersona) {
      const culpritHistory = body.conversationsByCharacter?.[result.culpritCharacterId] ?? [];
      const client = getNimClient();
      const reasoningExtraParams = getReasoningExtraParams(NIM_MODEL);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: buildConfessionSceneSystemPrompt(getActorPromptView(culprit), culpritPersona),
        },
        ...culpritHistory.map(
          (turn): OpenAI.Chat.ChatCompletionMessageParam => ({ role: turn.role, content: turn.content })
        ),
        { role: "user", content: buildConfessionSceneDirective() },
      ];

      const completion = await client.chat.completions.create({
        model: NIM_MODEL,
        max_tokens: 1024,
        temperature: 1,
        top_p: 0.95,
        messages,
        ...reasoningExtraParams,
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

      const rawText = completion.choices[0]?.message?.content ?? "";
      confessionScene = parseActorResponse(rawText).text;
    }
  } catch (err) {
    console.error("[accuse] 자백 장면 생성 실패, 점수/정답만 반환:", err);
  }

  return NextResponse.json({
    isCorrect: result.isCorrect,
    culpritCharacterId: result.culpritCharacterId,
    score: result.score,
    grade: result.grade,
    characters,
    confessionScene,
  });
}
