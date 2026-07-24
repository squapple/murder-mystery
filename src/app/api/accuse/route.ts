// POST /api/accuse — 04_game_loop_flow.json human-final-accusation → proc-score-judge → end-result.
// 최종 지목을 받아 정답 여부(진범 이름 단순 비교)와 점수를 독립적으로 계산하고,
// 이 시점부터는 결과 화면이므로 전체 진실·각 배역 페르소나를 최초로 공개한다
// (03_character_sheets.md visibility: player_post_game).
//
// 디브리핑(Phase 27, "AI 친구" 컨셉): 게임이 끝나면 세 배역 모두 캐릭터 연기를
// 내려놓고, 그 역할을 맡았던 AI 친구(페르소나에 이름을 붙였다)로 돌아와 플레이어와
// 뒤풀이 소감을 나눈다. 원래는 진범에게만 "자백" 장면을 따로 만들고 무고자는
// motiveFull 한 줄만 보여줬는데, 그러면 무고자의 곁가지 비밀(예: 정민아의 법인카드
// 비리 목격)이 결과 화면에 전혀 드러나지 않는 문제가 있었다. 세 배역 모두 같은
// 디브리핑 프롬프트(buildDebriefSystemPrompt)로 통일해 이 문제를 해결했다 —
// 진범이든 무고자든 "나는 이런 역할이었고 심문 중 이랬다"는 구조는 동일하다.
// 순서는 플레이어가 지목한 배역이 먼저, 나머지는 CHARACTER_LIST 순서로 이어진다.
// 심문 중에는 이 소감을 절대 미리 들려주지 않는다 — 심문 중 자백을 허용하면
// "누가 자백했는지"만 보고 추리 없이 정답을 알 수 있어 게임이 무의미해진다.
// 디브리핑은 심문용 buildActorSystemPrompt를 재사용하지 않고 전용 프롬프트를 쓴다
// — 심문용 프롬프트를 재사용했다가 "자백 금지" 규칙과 상충해 메타 발언으로
// 이탈했던 전례가 있다(actor-prompt.ts buildDebriefSystemPrompt 주석 참고).

import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { judgeAccusation } from "@/lib/scoring";
import { CHARACTERS, CHARACTER_LIST, getActorPromptView } from "@/lib/game-data/characters";
import { decodeCastingToken } from "@/lib/casting";
import { PERSONAS } from "@/lib/game-data/personas";
import { getNimClient, NIM_MODEL, getReasoningExtraParams } from "@/lib/nim-client";
import { buildDebriefSystemPrompt, buildDebriefDirective } from "@/lib/prompts/actor-prompt";
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
  /** 3배역 각각의 실제 심문 대화 기록 — 디브리핑이 실제 대화를 언급할 수 있게 이어붙여 쓴다 */
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

  // 지목한 배역이 먼저, 나머지는 CHARACTER_LIST 순서로 이어진다.
  const orderedIds: CharacterId[] = [
    accusedCharacterId,
    ...CHARACTER_LIST.map((c) => c.characterId).filter((id) => id !== accusedCharacterId),
  ];

  const client = getNimClient();
  const reasoningExtraParams = getReasoningExtraParams(NIM_MODEL);

  const debriefsById = new Map<CharacterId, string>();
  await Promise.all(
    orderedIds.map(async (id) => {
      const character = CHARACTERS[id];
      const personaKey = castingMap[id];
      const persona = personaKey ? PERSONAS[personaKey] : undefined;
      if (!character || !persona) return;

      try {
        const history = body.conversationsByCharacter?.[id] ?? [];
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: buildDebriefSystemPrompt(
              getActorPromptView(character),
              persona,
              id === accusedCharacterId
            ),
          },
          ...history.map(
            (turn): OpenAI.Chat.ChatCompletionMessageParam => ({
              role: turn.role,
              content: turn.content,
            })
          ),
          { role: "user", content: buildDebriefDirective() },
        ];

        const completion = await client.chat.completions.create({
          model: NIM_MODEL,
          max_tokens: 1024,
          temperature: 1,
          top_p: 0.95,
          messages,
          ...reasoningExtraParams,
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

        debriefsById.set(id, (completion.choices[0]?.message?.content ?? "").trim());
      } catch (err) {
        // 실패해도 결과 자체(정답/점수)는 정상 반환한다 — 이 캐릭터의 디브리핑만 빈 문자열로.
        console.error(`[accuse] 디브리핑 생성 실패(${id}), 빈 문자열로 대체:`, err);
        debriefsById.set(id, "");
      }
    })
  );

  const characters = orderedIds.map((id) => {
    const c = CHARACTERS[id];
    const personaKey = castingMap[id];
    const persona = personaKey ? PERSONAS[personaKey] : undefined;
    return {
      characterId: c.characterId,
      displayName: c.displayName,
      roleTitle: c.roleTitle,
      isCulprit: c.isCulprit,
      motiveFull: c.motiveFull,
      personaTag: persona?.playerTag ?? null,
      mbtiType: persona?.mbtiType ?? null,
      friendName: persona?.friendName ?? null,
      debrief: debriefsById.get(id) ?? "",
    };
  });

  return NextResponse.json({
    isCorrect: result.isCorrect,
    culpritCharacterId: result.culpritCharacterId,
    score: result.score,
    grade: result.grade,
    characters,
  });
}
