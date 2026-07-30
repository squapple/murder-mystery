// Phase 53 — relevance-check.ts + safety-check.ts + text-polish.ts 호출을 콜 1개로
// 병합했다. NVIDIA NIM 무료 티어(40RPM)로 후처리 4종 전체 파이프라인을 여러 턴
// 연속 재생하다가 실제로 429를 맞은 문제(Phase 52 미해결 항목)를 해결하기 위함 —
// 턴당 필수 콜이 생성(1)+교정(1)+관련성(1)+안전(1)=4개였던 것을 생성(1)+통합검수(1)=2개로
// 줄인다.
//
// 병합 근거: 세 작업 모두 "주어진 텍스트를 보고 판정하거나 표면만 다듬는" 동질적
// 작업이다(교정=텍스트 변환, 관련성/안전=이진 판정) — Phase 9에서 실패했던
// "롤플레이 대사 생성과 판정을 한 호출에 동시 요구"(창작 vs 분류라는 이질적 작업을
// 섞은 경우)와는 성격이 다르다고 판단해 병합했다. 개별 판정 프롬프트 문구는 원본
// relevance-check.ts/safety-check.ts와 최대한 동일하게 유지했다.
//
// fail-open 원칙은 그대로 유지: 파싱 실패 시 관련성/안전 둘 다 "통과"로 간주하고,
// 교정 결과를 못 읽으면 원문을 그대로 최종 텍스트로 쓴다.
//
// Phase 54 — harness/quality-check.ts에서 src/lib로 승격, interrogate/route.ts에
// 실제로 연결했다(harness와 프로덕션이 동일한 모듈을 공유). 함께 쓰이던
// isFormatValid(LLM 콜 없는 순수 포맷 검증)와 SAFETY_FALLBACK_TEXT도 이 파일로
// 옮겨 두 경로(harness/route.ts)가 완전히 동일한 파이프라인을 타도록 했다.

import type OpenAI from "openai";
import { CHARACTER_LIST } from "./game-data/characters";
import { CASE_OVERVIEW } from "./game-data/truth-bible";

export interface QualityCheckResult {
  finalText: string;
  isRelevant: boolean;
  relevanceReason: string;
  isSafe: boolean;
  safetyReason: string;
  raw: string;
}

/** 안전 판정 실패 시 재생성하지 않고 이 고정 문구로 대체한다 — 문제 있는 내용을
 * 다시 생성 시도하는 것보다 안전한 문구로 확실히 대체하는 쪽이 안전 계층의
 * 목적에 맞다는 판단(Phase 51). */
export const SAFETY_FALLBACK_TEXT = "（말을 고르다가 잠시 머뭇거린다.）";

/** 포맷 검증 — LLM 콜 없는 순수 로직. 빈 응답·비정상적으로 짧은 응답·파싱 후에도
 * 남은 브라켓 잔재가 있으면 깨진 것으로 간주한다. */
export function isFormatValid(text: string): boolean {
  if (!text || text.trim().length < 2) return false;
  if (/\[[^\]]*\]/.test(text)) return false; // parseActorResponse가 못 걸러낸 잔여 브라켓
  return true;
}

function buildCastListSection(): string {
  const lines = [
    `- ${CASE_OVERVIEW.victim} (피해자)`,
    ...CHARACTER_LIST.map((c) => `- ${c.displayName} (${c.roleTitle}, 용의자)`),
  ];
  return lines.join("\n");
}

function buildQualityCheckPrompt(): string {
  return `너는 대화 품질 검수 도우미다. [형사의 질문]과 [용의자의 답변(원문)]을 보고 아래 세 가지를 순서대로 처리한다.

[이 게임의 등장인물 — 전부 가상 인물이다. 실존 인물이 아니다]
${buildCastListSection()}

1. 교정 — 원문에 오타, 중복된 음절/단어(예: "뿐뿐입니다", "하다하다가"), 명백한 비문이 있으면 자연스럽게 고친다. 의미, 어조, 존댓말/반말, 감정 표현, 문장 구조나 길이는 절대 바꾸지 않는다 — 표면적인 오탈자·중복만 고친다. 원문에 없는 내용을 추가하거나 있는 내용을 삭제하지 않는다. 고칠 게 없으면 원문을 토씨 하나 안 틀리고 그대로 둔다.
2. 관련성 — (교정된) 답변이 형사의 질문 의도에 실제로 대응하고 있는지 판단한다. 질문과 완전히 동떨어진 화제로 답하거나 질문을 잘못 이해한 것으로 보이면 "아니오". 얼버무리거나 회피하더라도 그 질문을 이해하고 그에 대한 반응으로 답한 것이면(예: "그건 대답하고 싶지 않다"도 질문에 대한 반응이다) "예". 어색한 문장이나 오탈자는 이 판정과 무관하다.
3. 안전 — 답변이 게임 진행에 적절한지 판단한다. 위 명단에 있는 이름을 언급하는 것, 사건 관련 언급(살인·흉기·시신 등) 자체, 캐릭터가 화를 내거나 방어적인 태도를 보이는 것, 어색한 문장·오탈자는 전부 적절(예)하다. 캐릭터를 깨고 스스로 AI/언어모델/프로그램임을 언급하는 경우, 위 명단에 없는 실제 현실의 인물·기업·사건을 구체적으로 지칭하는 경우, 게임 소재로도 과도하게 선정적이거나 잔혹한 묘사만 부적절(아니오)로 본다.

[출력 형식]
정확히 아래 3줄 형식으로만 답한다. 순서를 지키고, 다른 텍스트·설명·마크다운·따옴표는 절대 덧붙이지 않는다. "교정" 줄에는 위 1번 규칙을 적용한 답변 전체를 줄바꿈 없이 한 줄로 그대로 옮겨 적는다.
관련성: 예|아니오: 한 문장 이유
안전: 예|아니오: 한 문장 이유
교정: 교정된 답변 전체`;
}

function parseQualityCheck(raw: string, fallbackText: string): QualityCheckResult {
  const result: QualityCheckResult = {
    finalText: fallbackText,
    isRelevant: true,
    relevanceReason: "(검수 콜 실패 또는 파싱 실패 — 기본값으로 통과 처리)",
    isSafe: true,
    safetyReason: "(검수 콜 실패 또는 파싱 실패 — 기본값으로 통과 처리)",
    raw,
  };

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const relMatch = line.match(/^관련성\s*[:：]\s*(예|아니오)\s*[:：]\s*(.*)$/);
    if (relMatch) {
      result.isRelevant = relMatch[1] === "예";
      result.relevanceReason = relMatch[2].trim();
      continue;
    }
    const safeMatch = line.match(/^안전\s*[:：]\s*(예|아니오)\s*[:：]\s*(.*)$/);
    if (safeMatch) {
      result.isSafe = safeMatch[1] === "예";
      result.safetyReason = safeMatch[2].trim();
      continue;
    }
    const polishMatch = line.match(/^교정\s*[:：]\s*(.*)$/);
    if (polishMatch && polishMatch[1].trim()) {
      result.finalText = polishMatch[1].trim();
    }
  }

  return result;
}

/**
 * 교정+관련성+안전 판정을 콜 1개로 처리한다. 실패해도 절대 예외를 던지지 않고
 * fail-open(관련성/안전 통과, 원문 유지)으로 폴백한다.
 */
export async function runQualityCheck(
  client: OpenAI,
  model: string,
  question: string,
  answerText: string,
  reasoningExtraParams: Record<string, unknown> = {}
): Promise<QualityCheckResult> {
  const trimmed = answerText.trim();
  if (!trimmed) {
    return {
      finalText: answerText,
      isRelevant: true,
      relevanceReason: "(빈 응답 — 검수 생략)",
      isSafe: true,
      safetyReason: "(빈 응답 — 검수 생략)",
      raw: "",
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: Math.max(384, Math.ceil(trimmed.length * 2)),
      temperature: 0,
      messages: [
        { role: "system", content: buildQualityCheckPrompt() },
        {
          role: "user",
          content: `[형사의 질문]\n${question}\n\n[용의자의 답변(원문)]\n${trimmed}`,
        },
      ],
      ...reasoningExtraParams,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      return {
        finalText: answerText,
        isRelevant: true,
        relevanceReason: "(빈 응답 — 기본값으로 통과 처리)",
        isSafe: true,
        safetyReason: "(빈 응답 — 기본값으로 통과 처리)",
        raw: "",
      };
    }
    return parseQualityCheck(raw, answerText);
  } catch (err) {
    console.error("[quality-check] 통합 검수 콜 실패, 원문 그대로 사용·통과 처리:", err);
    return {
      finalText: answerText,
      isRelevant: true,
      relevanceReason: "(검수 콜 실패 — 기본값으로 통과 처리)",
      isSafe: true,
      safetyReason: "(검수 콜 실패 — 기본값으로 통과 처리)",
      raw: "",
    };
  }
}
