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
//
// Phase 62 — 실전 리뷰에서 디브리핑 텍스트에 글자 깨짐(생성 글리치)이 그대로
// 노출되는 사례가 지적됐다. 원인은 이 경로가 interrogate/route.ts와 달리 교정
// 파이프라인(quality-check.ts)을 전혀 안 거치고 모델 원문을 그대로 썼기 때문 —
// 포맷 검증→통합 검수(교정/관련성/안전)→교정 신뢰성 재확인까지 동일한 구조로
// 연결했다. "질문" 자리에는 디브리핑 지시문(buildDebriefDirective)을 그대로 써서
// 관련성 판정이 자연스럽게 성립하게 했다.
//
// Phase 68 — "교정→재확인" 재시도 로직을 quality-check.ts의
// correctWithFidelityAndEscalation으로 승격(interrogate/accuse/harness 공유). 빠른
// 모델로 MAX_FIDELITY_RETRIES회를 다 써도 반려되면 마지막 한 번만 ESCALATION_MODEL로
// 교정을 재시도한다 — interrogate/route.ts 주석 참고.

import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { judgeAccusation } from "@/lib/scoring";
import { CHARACTERS, CHARACTER_LIST, getActorPromptView } from "@/lib/game-data/characters";
import { decodeCastingToken } from "@/lib/casting";
import { PERSONAS } from "@/lib/game-data/personas";
import {
  getNimClient,
  NIM_MODEL,
  MAX_FIDELITY_RETRIES,
  ESCALATION_MODEL,
  getReasoningExtraParams,
  withRateLimitRetry,
} from "@/lib/nim-client";
import {
  runQualityCheck,
  isFormatValid,
  SAFETY_FALLBACK_TEXT,
  correctWithFidelityAndEscalation,
} from "@/lib/quality-check";
import { buildDebriefSystemPrompt, buildDebriefDirective } from "@/lib/prompts/actor-prompt";
// Phase 33에서 쓰던 polishText/POLISH_MODEL 연동은 Phase 35에서 되돌렸다(interrogate/route.ts
// 주석 참고) — 나중을 위해 text-polish.ts/POLISH_MODEL 자체는 남겨뒀다. Phase 62부터는
// 디브리핑도 quality-check.ts(교정+관련성+안전+신뢰성 재확인)를 거친다 — 아래 참고.
import { logPipelineStep } from "@/lib/debug-log";
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
  /** 3배역 각각의 실제 심문 대화 기록 — 디브리핑이 실제 대화를 언급할 수 있게 이어붙여
   * 쓰는 동시에, 채점의 심문 효율(낭비성 재질문 횟수)에도 그대로 쓰인다(Phase 58) */
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
    conversationsByCharacter: body.conversationsByCharacter,
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
        // Phase 36 — 이 캐릭터를 한 번도 심문하지 않고 지목까지 갔을 때, 디브리핑이
        // "그때 CCTV 얘기 던지실 때" 같은 있지도 않은 대화를 지어내던 문제를 고쳤다.
        const wasInterrogated = history.length > 0;

        // Phase 66 — quality-check.ts 내부 로그(runQualityCheck/verifyCorrectionFidelity)
        // 만으로는 이 디브리핑이 어느 캐릭터 것인지 구분이 안 됐다(3명이 Promise.all로
        // 동시에 돌아가므로) — interrogate/route.ts의 turn-start/turn-end와 동일하게
        // character 컨텍스트를 감싸는 마커를 추가했다.
        logPipelineStep({
          stage: "debrief-start",
          character: id,
          isAccused: id === accusedCharacterId,
          wasInterrogated,
        });
        const systemPrompt = buildDebriefSystemPrompt(
          getActorPromptView(character),
          persona,
          id === accusedCharacterId,
          wasInterrogated
        );
        const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(
          (turn): OpenAI.Chat.ChatCompletionMessageParam => ({
            role: turn.role,
            content: turn.content,
          })
        );
        const directive = buildDebriefDirective(wasInterrogated);

        async function generateDebriefOnce(extraReminder?: string): Promise<string> {
          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            {
              role: "system",
              content: extraReminder ? `${systemPrompt}\n\n${extraReminder}` : systemPrompt,
            },
            ...historyMessages,
            { role: "user", content: directive },
          ];

          const completion = await withRateLimitRetry(
            () =>
              client.chat.completions.create({
                model: NIM_MODEL,
                max_tokens: 1024,
                temperature: 1,
                top_p: 0.95,
                messages,
                ...reasoningExtraParams,
              } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams),
            "accuse"
          );

          return (completion.choices[0]?.message?.content ?? "").trim();
        }

        let rawText = await generateDebriefOnce();

        // Phase 62 — 인터로게이트와 동일한 후처리 파이프라인을 디브리핑에도 연결했다.
        // 기존엔 모델 원문을 교정·검증 없이 그대로 썼는데, 결과 화면이라는 게임에서
        // 가장 감정적인 순간에 오탈자·글자 깨짐이 그대로 노출되는 문제가 있었다.
        if (!isFormatValid(rawText)) {
          rawText = await generateDebriefOnce(
            "[재생성 지시] 방금 답변이 비어있거나 형식이 깨졌다. 자연스러운 문장으로 다시 답하라."
          );
        }

        // Phase 66 — 3명의 디브리핑이 Promise.all로 동시에 도는데, quality-check.ts의
        // 로그 함수는 자체적으로 어느 캐릭터인지 알 방법이 없다(순수 유틸 함수) — 이
        // logContext 없이는 3명분 quality-check/fidelity-check 로그가 뒤섞여서 구분이
        // 안 됐다(실측 확인, debrief-start/end만으로는 안 됨).
        const logContext = { character: id };

        // "질문" 자리에는 디브리핑을 요청한 지시문(directive)을 그대로 쓴다 — 관련성
        // 판정이 "이 소감이 방금 받은 지시(소감을 말해달라)에 실제로 응답했는가"를
        // 볼 수 있게 하기 위함.
        let verdict = await runQualityCheck(
          client,
          NIM_MODEL,
          directive,
          rawText,
          reasoningExtraParams,
          undefined,
          logContext
        );

        async function verifyAndMaybeRetryCorrection(
          sourceText: string,
          initialVerdict: Awaited<ReturnType<typeof runQualityCheck>>
        ): Promise<Awaited<ReturnType<typeof runQualityCheck>>> {
          return correctWithFidelityAndEscalation(
            client,
            NIM_MODEL,
            ESCALATION_MODEL,
            systemPrompt,
            historyMessages,
            directive,
            sourceText,
            initialVerdict,
            MAX_FIDELITY_RETRIES,
            logContext
          );
        }

        verdict = await verifyAndMaybeRetryCorrection(rawText, verdict);
        let finalText = verdict.finalText;

        if (!verdict.isRelevant) {
          const retryText = await generateDebriefOnce(
            "[재생성 지시] 방금 소감이 요청받은 내용(방금까지의 심문을 돌아보며 소감을 나누는 것)에서 벗어났다. 다시 답하라."
          );
          verdict = await runQualityCheck(
            client,
            NIM_MODEL,
            directive,
            retryText,
            reasoningExtraParams,
            undefined,
            logContext
          );
          verdict = await verifyAndMaybeRetryCorrection(retryText, verdict);
          finalText = verdict.finalText;
        }

        if (!verdict.isSafe) {
          finalText = SAFETY_FALLBACK_TEXT;
        }

        logPipelineStep({
          stage: "debrief-end",
          character: id,
          finalText,
        });

        debriefsById.set(id, finalText);
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
