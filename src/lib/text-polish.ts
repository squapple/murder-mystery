// Phase 33 — 오타/중복 음절 후처리("증라도", "들렸을 뿐뿐입니다", "침묵하다하다가" 등).
// 실전 리뷰 피드백: "AI가 당황하면 말이 꼬일 수 있다"는 프롤로그 문구(Phase 30)로
// 어느 정도 정당화는 됐지만, 그래도 완성도를 깎는다는 지적이 이어졌다. 프롬프트
// 단으로는 모델 자체의 생성 결함을 없애기 어렵다고 보고(사용자 판단), 대사를 화면에
// 보여주기 직전에 가벼운 교정 콜을 한 번 더 거치는 방식을 택했다.
//
// 중요: 의미·어조·존댓말 여부·감정 표현은 절대 건드리지 않고 표면적인 오탈자/중복만
// 고치도록 강하게 제한한다 — 자칫 대사 내용 자체가 바뀌면 fair-play(진범/무고자
// 신호 동일성) 원칙이 깨질 수 있기 때문. 실패 시(타임아웃, 파싱 이상 등)에는 항상
// 원문을 그대로 반환한다 — 이 단계는 있으면 좋은 보정이지 필수 경로가 아니다.

import type OpenAI from "openai";

function buildPolishSystemPrompt(): string {
  return `너는 한국어 교정 도우미다. 아래 [원문]에 오타, 중복된 음절/단어(예: "뿐뿐입니다", "하다하다가"), 명백한 비문이 있으면 자연스럽게 고쳐라.

[절대 지켜야 할 것]
- 의미, 어조, 존댓말/반말, 감정 표현, 문장 구조나 길이는 절대 바꾸지 않는다 — 표면적인 오탈자·중복만 고친다.
- 원문에 없는 내용을 추가하거나 있는 내용을 삭제하지 않는다.
- 고칠 게 없으면 원문을 토씨 하나 안 틀리고 그대로 돌려준다.
- 수정된 텍스트만 출력한다. 설명, 인사말, 따옴표, 마크다운, "[수정본]" 같은 라벨 등 어떤 부가 텍스트도 절대 덧붙이지 않는다.`;
}

/**
 * 대사 텍스트를 교정 모델에 한 번 더 통과시킨다. 실패해도 절대 예외를 던지지
 * 않고 원문을 그대로 반환한다 — 심문/디브리핑 응답 전체를 이 단계 때문에
 * 실패시키지 않기 위함.
 */
export async function polishText(
  client: OpenAI,
  model: string,
  text: string,
  reasoningExtraParams: Record<string, unknown> = {}
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  try {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: Math.max(256, Math.ceil(trimmed.length * 2)),
      temperature: 0,
      messages: [
        { role: "system", content: buildPolishSystemPrompt() },
        { role: "user", content: `[원문]\n${trimmed}` },
      ],
      ...reasoningExtraParams,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

    const polished = completion.choices[0]?.message?.content?.trim();
    if (!polished) return text;
    return polished;
  } catch (err) {
    console.error("[text-polish] 교정 콜 실패, 원문 그대로 사용:", err);
    return text;
  }
}
