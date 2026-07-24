// POST /api/round-review — 라운드 종료("다음 라운드" 클릭) 시 한 번 호출된다.
// 매 심문 턴마다 소지품 요청을 즉석에서 자기 판정하게 했던 이전 방식이 실전에서
// 신뢰도가 낮았던 문제(actor-prompt.ts 이력 9번 참고)를 해결하기 위해, 그 라운드의
// 캐릭터별 대화 전체를 한 번에 검토하는 전용 판정 콜로 분리했다. 사전 등록된 물품
// (신발 등, evidence.ts와 짝지어진 결정적 물증 포함)과 등록 안 된 임의 물품을 완전히
// 같은 타이밍·같은 판정 방식으로 처리한다 — "즉시 반응하는 증거 = 진짜 증거"라는
// 메타 신호를 플레이어가 눈치채지 못하게 하려는 의도적 설계(사용자 확인).
//
// 이 라운드 안에 요청하지 않은 사전 등록 물증은 다음 라운드로 넘어가면서 그대로
// 미확보 상태로 남는다 — "제때 조사하지 않으면 증거를 못 찾은 것"이라는 사용자의
// 명시적 설계 의도이므로, 여기서 놓친 걸 나중에 구제하는 로직을 추가하지 않는다.
// 같은 이유로 마지막 라운드(3라운드) 종료 후에는 이 콜 자체를 호출하지 않는다
// (다음 라운드 조사모드 자체가 없어 반영할 곳이 없다 — GameApp.tsx 참고).

import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { getNimClient, NIM_MODEL, getReasoningExtraParams } from "@/lib/nim-client";
import { buildItemRequestReviewPrompt } from "@/lib/prompts/actor-prompt";
import { CHARACTER_LIST, getActorPromptView } from "@/lib/game-data/characters";
import { decodeCastingToken } from "@/lib/casting";
import type { CharacterId } from "@/lib/game-data/types";

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface RoundReviewRequestBody {
  castingToken: string;
  conversationsByCharacter?: Partial<Record<CharacterId, ConversationTurn[]>>;
  collectedEvidenceIds?: string[];
}

interface AdHocEvidenceCard {
  id: string;
  name: string;
  revealedFact: string;
}

/** 물품명 문자열을 evidence id 접미사로 안전하게 쓰기 위한 정리 — 공백·기호 제거. */
function slugifyItemName(name: string): string {
  return name.replace(/[^\w가-힣]/g, "").slice(0, 24);
}

const REQUESTED_ITEM_RE = /\[요청물품\d*\s*[:=]\s*([^\]\n]+)\]/g;

/** buildItemRequestReviewPrompt의 출력([요청물품1: 지갑] 형식)에서 물품명 목록만 뽑는다. */
function parseRequestedItems(raw: string): string[] {
  const names: string[] = [];
  for (const match of raw.matchAll(REQUESTED_ITEM_RE)) {
    const name = match[1]?.trim();
    if (name && name !== "없음") names.push(name);
  }
  return names;
}

export async function POST(req: NextRequest) {
  let body: RoundReviewRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const { castingToken } = body;
  if (!castingToken || !decodeCastingToken(castingToken)) {
    return NextResponse.json({ error: "castingToken이 유효하지 않습니다." }, { status: 400 });
  }

  const conversationsByCharacter = body.conversationsByCharacter ?? {};
  const collectedIds = new Set(
    Array.isArray(body.collectedEvidenceIds) ? body.collectedEvidenceIds : []
  );

  const unlockedEvidenceIds: string[] = [];
  const adHocEvidence: AdHocEvidenceCard[] = [];

  try {
    const client = getNimClient();
    const reasoningExtraParams = getReasoningExtraParams(NIM_MODEL);

    await Promise.all(
      CHARACTER_LIST.map(async (character) => {
        const history = conversationsByCharacter[character.characterId];
        if (!history || history.length === 0) return;

        const actorPromptView = getActorPromptView(character);
        const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(
          (turn): OpenAI.Chat.ChatCompletionMessageParam => ({
            role: turn.role,
            content: turn.content,
          })
        );

        const completion = await client.chat.completions.create({
          model: NIM_MODEL,
          max_tokens: 512,
          temperature: 0,
          messages: [
            { role: "system", content: buildItemRequestReviewPrompt(actorPromptView) },
            ...historyMessages,
          ],
          ...reasoningExtraParams,
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

        const raw = completion.choices[0]?.message?.content ?? "";
        const requestedItems = parseRequestedItems(raw);
        console.log(
          `[round-review] character=${character.characterId} requestedItems=[${requestedItems.join(", ")}]`
        );

        for (const itemName of requestedItems) {
          const registered = actorPromptView.requestableItems.find(
            (item) => item.itemLabel === itemName || itemName.includes(item.itemLabel)
          );
          if (registered) {
            if (!collectedIds.has(registered.evidenceId)) {
              unlockedEvidenceIds.push(registered.evidenceId);
            }
          } else {
            const adHocId = `ev-adhoc-${character.characterId}-${slugifyItemName(itemName)}`;
            if (!collectedIds.has(adHocId) && !adHocEvidence.some((e) => e.id === adHocId)) {
              adHocEvidence.push({
                id: adHocId,
                name: `${character.displayName} ${itemName} 확인`,
                revealedFact: "사건과 무관",
              });
            }
          }
        }
      })
    );

    return NextResponse.json({ unlockedEvidenceIds, adHocEvidence });
  } catch (err) {
    console.error("[round-review] NVIDIA NIM 호출 실패:", err);
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `AI 호출 실패: ${message}` }, { status: 502 });
  }
}
