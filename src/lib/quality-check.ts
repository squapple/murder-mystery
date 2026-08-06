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
//
// Phase 55(실험, harness 전용) — 실전 플레이에서 "관련성 판정이 자기가 방금 고친
// 교정본을 같은 호출 안에서 스스로 평가"하는 구조적 약점이 지적됐다(Phase 9의
// "생성+판정 동시 요구" 문제가 형태만 바꿔 재현). 이를 보완하기 위해
// `verifyCorrectionFidelity`를 신설 — 교정으로 텍스트가 실제로 바뀐 경우에만,
// 중립 비교자가 아니라 **같은 액터 페르소나를 다시 불러 원문과 교정본이 같은
// 의미인지 직접 확인**시킨다(중립 판정자는 원문 작성자가 아니라서 의도를 잘못
// 해석할 위험이 있다는 사용자 지적 반영). 실패 시 이전 교정 시도를 알려주고
// 재교정 → 재검증을 반복하되(횟수는 harness에서 1회/5회 비교 실험 중), 끝까지
// 실패하면 교정을 포기하고 원문(raw, 포맷 검증만 통과한 텍스트)으로 폴백한다.
//
// 교정 지시문(1번 항목)에 "문장이 종결어미를 다 못 갖추고 끊기는 경우"도 추가했다
// — diffusiongemma가 음절을 중복시키는 것("뿐뿐입니다")의 반대 증상(끝음절 탈락,
// "~~겁.")도 같은 계열의 생성 결함으로 관측됐다. 단, "..."(말줄임표)로 명시적으로
// 끝나는 문장은 의도된 연출이므로 절대 건드리지 않도록 예외를 명시했다.
//
// Phase 65 — "원문→교정→검증 단계를 직접 보고 싶다"는 요청으로 각 단계 결과를
// debug-log.ts를 통해 파일에 남긴다(Cloudflare Workers 배포본에서는 자동으로
// 무동작 — 로컬 `npm run dev`에서만 실제로 쌓인다).
//
// Phase 67 — Phase 65 로그를 실제로 분석해보니, 최종적으로 나간 텍스트에 조사·어미
// 탈락/오기가 4건 살아남아 있었다("나가는 보길래", "갔겠가요", "죽고 지 3개월",
// "말씀드릴 사까지는"). 각 사례를 quality-check 로그로 추적한 결과, 모델이 이
// 문장들을 실제로 보고도 changed:false(고칠 게 없음)로 판정했다는 게 확인됐다 —
// 배선 문제가 아니라 교정 지시문 자체에 "문장 중간"의 조사/어미 탈락 유형이 아예
// 없었던 것(기존 (d)항은 "문장 끝"의 종결어미 탈락만 다뤘다). (e)항으로 이 유형을
// 명시적으로 추가하고, 실제로 관측된 4개 사례를 그대로 예시로 넣었다.

import type OpenAI from "openai";
import { CHARACTER_LIST } from "./game-data/characters";
import { CASE_OVERVIEW } from "./game-data/truth-bible";
import { logPipelineStep } from "./debug-log";
import { getReasoningExtraParams } from "./nim-client";
import { renderKoreanUsageDictionary } from "./korean-usage-dictionary";

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

function buildQualityCheckPrompt(previousRejectedCorrection?: string): string {
  const retryNote = previousRejectedCorrection
    ? `\n\n[참고 — 직전 교정 시도가 반려됨]\n"${previousRejectedCorrection}"\n위 교정은 원래 답변과 의미가 달라졌다고 판정되어 반려됐다. 이번에는 의미를 절대 바꾸지 않는 선에서만 다시 교정하라 — 확신이 없으면 차라리 원문을 그대로 두는 쪽을 택하라.`
    : "";

  return `너는 대화 품질 검수 도우미다. [형사의 질문]과 [용의자의 답변(원문)]을 보고 아래 세 가지를 순서대로 처리한다.

[이 게임의 등장인물 — 전부 가상 인물이다. 실존 인물이 아니다]
${buildCastListSection()}

[국어 사전 — 과거에 실제로 틀렸던 표현들. 원문에 이 표현(또는 아주 비슷한 표현)이 나오면 뜻과 활용을 참고해 올바르게 고친다]
${renderKoreanUsageDictionary()}

1. 교정 — 원문에 다음과 같은 표면적 결함이 있으면 자연스럽게 고친다: (a) 오타, (b) 중복된 음절/단어(예: "뿐뿐입니다", "하다하다가"), (c) 명백한 비문, (d) 문장이 종결어미를 다 갖추지 못하고 중간에 끊긴 것처럼 끝나는 경우(예: "~~한 겁."처럼 "겁니다"/"거예요" 등에서 뒷부분이 탈락한 형태) — 자연스러운 종결어미로 완성한다, (e) **문장 끝이 아니라 문장 "중간"에서** 조사나 어미가 한두 글자 빠지거나 잘못 쓰여서 어색해지는 경우 — 이 유형은 문장 전체를 훑어봐도 눈에 잘 안 띄니 특히 꼼꼼히 확인한다(위 [국어 사전] 참고). **띄어쓰기 문제(단어를 붙여 썼는지 띄어 썼는지)는 절대 손대지 않는다** — 한국어 화자도 띄어쓰기 규칙을 잘 모르는 경우가 흔해 이건 결함으로 치지 않고, 억지로 고치려다 오히려 새 오류(음절 중복 등)를 만든 사례가 있었다. 단, "..."(말줄임표)로 명시적으로 끝나는 문장은 캐릭터가 의도적으로 말을 흐리는 연출이므로 절대 건드리지 않는다. 의미, 어조, 존댓말/반말, 감정 표현, 문장 구조나 길이는 절대 바꾸지 않는다 — 위 (a)~(e) 표면적 결함만 고친다. 원문에 없는 내용을 추가하거나 있는 내용을 삭제하지 않는다. 고칠 게 없으면 원문을 토씨 하나 안 틀리고 그대로 둔다.
2. 관련성 — (교정된) 답변이 형사의 질문 의도에 실제로 대응하고 있는지 판단한다. 질문과 완전히 동떨어진 화제로 답하거나 질문을 잘못 이해한 것으로 보이면 "아니오". 얼버무리거나 회피하더라도 그 질문을 이해하고 그에 대한 반응으로 답한 것이면(예: "그건 대답하고 싶지 않다"도 질문에 대한 반응이다) "예". 어색한 문장이나 오탈자는 이 판정과 무관하다.
3. 안전 — 답변이 게임 진행에 적절한지 판단한다. 위 명단에 있는 이름을 언급하는 것, 사건 관련 언급(살인·흉기·시신 등) 자체, 캐릭터가 화를 내거나 방어적인 태도를 보이는 것, 어색한 문장·오탈자는 전부 적절(예)하다. 캐릭터를 깨고 스스로 AI/언어모델/프로그램임을 언급하는 경우, 위 명단에 없는 실제 현실의 인물·기업·사건을 구체적으로 지칭하는 경우, 게임 소재로도 과도하게 선정적이거나 잔혹한 묘사만 부적절(아니오)로 본다.
${retryNote}

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
 *
 * previousRejectedCorrection — verifyCorrectionFidelity가 직전 교정 시도를
 * 반려했을 때, 같은 실수를 반복하지 않도록 그 시도 내용을 알려주고 재교정을
 * 요청한다(Phase 55 실험).
 */
export async function runQualityCheck(
  client: OpenAI,
  model: string,
  question: string,
  answerText: string,
  reasoningExtraParams: Record<string, unknown> = {},
  previousRejectedCorrection?: string,
  logContext: Record<string, unknown> = {}
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
        { role: "system", content: buildQualityCheckPrompt(previousRejectedCorrection) },
        {
          role: "user",
          content: `[형사의 질문]\n${question}\n\n[용의자의 답변(원문)]\n${trimmed}`,
        },
      ],
      ...reasoningExtraParams,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      logPipelineStep({
        ...logContext,
        stage: "quality-check",
        question,
        original: answerText,
        rawModelOutput: "",
        outcome: "empty-response-fallback",
      });
      return {
        finalText: answerText,
        isRelevant: true,
        relevanceReason: "(빈 응답 — 기본값으로 통과 처리)",
        isSafe: true,
        safetyReason: "(빈 응답 — 기본값으로 통과 처리)",
        raw: "",
      };
    }
    const result = parseQualityCheck(raw, answerText);
    logPipelineStep({
      ...logContext,
      stage: "quality-check",
      question,
      previousRejectedCorrection: previousRejectedCorrection ?? null,
      original: answerText,
      corrected: result.finalText,
      changed: result.finalText.trim() !== answerText.trim(),
      isRelevant: result.isRelevant,
      relevanceReason: result.relevanceReason,
      isSafe: result.isSafe,
      safetyReason: result.safetyReason,
      rawModelOutput: raw,
    });
    return result;
  } catch (err) {
    console.error("[quality-check] 통합 검수 콜 실패, 원문 그대로 사용·통과 처리:", err);
    logPipelineStep({
      ...logContext,
      stage: "quality-check",
      question,
      original: answerText,
      outcome: "call-failed",
      error: err instanceof Error ? err.message : String(err),
    });
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

export interface FidelityCheckResult {
  matches: boolean;
  reason: string;
  raw: string;
}

/**
 * 교정본이 원문과 같은 의미인지, 중립 비교자가 아니라 "같은 액터 페르소나"를
 * 다시 불러 직접 확인시킨다(Phase 55 실험). 중립 비교자는 원문 작성자가 아니라서
 * 원래 의도를 잘못 해석할 위험이 있다는 지적을 반영 — actorSystemPrompt/history를
 * 원래 생성 때와 동일하게 재사용해 같은 맥락(캐릭터 시트·성향·인내심 수준·대화
 * 흐름)을 그대로 가진 채로 판단하게 한다. fail-open: 실패 시 "일치함(예)"로 간주해
 * 교정본을 그대로 쓴다 — 이 단계 실패가 대화 흐름을 막으면 안 된다.
 */
export async function verifyCorrectionFidelity(
  client: OpenAI,
  model: string,
  actorSystemPrompt: string,
  historyMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  userMessage: string,
  originalText: string,
  correctedText: string,
  reasoningExtraParams: Record<string, unknown> = {},
  logContext: Record<string, unknown> = {}
): Promise<FidelityCheckResult> {
  const fallback: FidelityCheckResult = {
    matches: true,
    reason: "(검증 콜 실패 — 기본값으로 통과 처리)",
    raw: "",
  };

  // 원래 답변을 assistant 턴으로 넣어 대화가 실제로 거기까지 진행된 것처럼 만든
  // 뒤, 그 다음 user 턴으로 판정 지시를 붙인다 — 시스템 프롬프트 끝에 지시를
  // 덧붙이기만 했을 때는 대화의 마지막 턴이 여전히 형사의 원래 질문이라, 모델이
  // 지시를 무시하고 그냥 롤플레이 답변을 이어서 생성해버리는 문제가 있었다(실측
  // 확인). 마지막 턴을 판정 지시로 만들어야 모델이 그 지시에 실제로 응답한다.
  const verificationInstruction = `[역할 전환 지시 — 지금부터는 캐릭터를 연기하지 않는다]
방금 당신이 한 답변("${originalText}")을 누군가 오탈자·비문·끊긴 문장만 고치려고 시도해서 아래처럼 다듬었다:

[다듬은 답변]
${correctedText}

다듬은 답변이 원래 답변과 의미·의도·뉘앙스가 완전히 같은지만 판단하라. 표면적인 단어 선택 차이나 어순 차이는 무관하고, 오직 의미가 달라졌는지만 본다. 조금이라도 원래 의도와 달라졌다면 다르다고 판단한다.

[출력 형식 — 아래 두 형식 중 정확히 하나를 골라 그대로 출력한다. 두 형식을 섞거나 그대로 나열하지 않는다]
의미가 같다면 다음 형식으로 답한다:
일치: 예: 한 문장 이유
의미가 다르다면 다음 형식으로 답한다:
일치: 아니오: 한 문장 이유

다른 텍스트·설명·따옴표·마크다운은 절대 덧붙이지 않는다.`;

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: actorSystemPrompt },
      ...historyMessages,
      { role: "user", content: userMessage },
      { role: "assistant", content: originalText },
      { role: "user", content: verificationInstruction },
    ];

    const completion = await client.chat.completions.create({
      model,
      max_tokens: 128,
      temperature: 0,
      messages,
      ...reasoningExtraParams,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & typeof reasoningExtraParams);

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    // 모델이 "예|아니오" 템플릿을 그대로 베끼는 등 형식을 어길 때를 대비해, 정확한
    // 한 줄 매치 실패 시 "일치" 이후 먼저 등장하는 예/아니오 토큰으로 한 번 더
    // 느슨하게 시도한다 — 단, "예|아니오"처럼 두 토큰이 나란히 붙어 있으면(형식
    // 붕괴로 실제 선택을 알 수 없는 경우) 그 시도도 실패로 두고 fail-open한다.
    const strictMatch = raw.match(/^일치\s*[:：]\s*(예|아니오)\s*[:：]\s*(.*)$/m);
    if (strictMatch) {
      const result = { matches: strictMatch[1] === "예", reason: strictMatch[2].trim(), raw };
      logPipelineStep({
        ...logContext,
        stage: "fidelity-check",
        originalText,
        correctedText,
        matches: result.matches,
        reason: result.reason,
        parseMode: "strict",
        rawModelOutput: raw,
      });
      return result;
    }
    const corruptedTemplate = /일치\s*[:：]\s*예\s*[|｜]\s*아니오/.test(raw);
    if (!corruptedTemplate) {
      const looseMatch = raw.match(/일치[^가-힣]{0,3}(예|아니오)/);
      if (looseMatch) {
        const result = { matches: looseMatch[1] === "예", reason: raw.slice(0, 200), raw };
        logPipelineStep({
          ...logContext,
          stage: "fidelity-check",
          originalText,
          correctedText,
          matches: result.matches,
          reason: result.reason,
          parseMode: "loose",
          rawModelOutput: raw,
        });
        return result;
      }
    }
    logPipelineStep({
      ...logContext,
      stage: "fidelity-check",
      originalText,
      correctedText,
      outcome: "parse-failed-fallback-to-matches-true",
      rawModelOutput: raw,
    });
    return { ...fallback, raw };
  } catch (err) {
    console.error("[quality-check] 의미 보존 검증 콜 실패, 일치로 간주:", err);
    logPipelineStep({
      ...logContext,
      stage: "fidelity-check",
      originalText,
      correctedText,
      outcome: "call-failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

/**
 * Phase 68 — "교정(엄마)→재확인(아이)" 루프를 interrogate/accuse/harness 세 곳이
 * 각자 거의 동일하게 중복 구현하고 있었다(로직 불일치 위험) — 여기 한 번만
 * 구현하고 세 호출부가 공유하게 승격했다. 동시에 "빠른 모델로 maxRetries회 다
 * 실패하면 마지막 한 번만 더 좋지만 느린 모델(escalationModel)로 교정을 재시도"
 * 하는 기능을 추가했다("유치원 선생님" 비유, 사용자 제안) — 로그 분석으로 발견한
 * "교정이 관용구를 잘못 재현하는" 문제(피가 거리더라고요 → 거꾸리치더라고요)에
 * 대응한다. 승격 대상은 오직 "교정 시도"뿐이다 — 재확인(verifyCorrectionFidelity)
 * 은 escalation 여부와 무관하게 항상 fastModel로 한다(사용자 명시: "2번에만 쓰고").
 * escalation 결과도 반드시 다시 fastModel의 재확인을 거친다 — escalation이라고
 * 무조건 통과시키지 않는다.
 */
export async function correctWithFidelityAndEscalation(
  client: OpenAI,
  fastModel: string,
  escalationModel: string,
  actorSystemPrompt: string,
  historyMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  userMessage: string,
  sourceText: string,
  initialVerdict: QualityCheckResult,
  maxRetries: number,
  logContext: Record<string, unknown> = {}
): Promise<QualityCheckResult> {
  let verdict = initialVerdict;
  if (verdict.finalText.trim() === sourceText.trim()) return verdict;

  const fastReasoningParams = getReasoningExtraParams(fastModel);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const fidelity = await verifyCorrectionFidelity(
      client,
      fastModel,
      actorSystemPrompt,
      historyMessages,
      userMessage,
      sourceText,
      verdict.finalText,
      fastReasoningParams,
      logContext
    );
    if (fidelity.matches) return verdict;
    if (attempt >= maxRetries) break;

    const rejected = verdict.finalText;
    verdict = await runQualityCheck(
      client,
      fastModel,
      userMessage,
      sourceText,
      fastReasoningParams,
      rejected,
      logContext
    );
    if (verdict.finalText.trim() === sourceText.trim()) return verdict;
  }

  // maxRetries회를 다 썼는데도 "아이"가 계속 반려했다 — 마지막으로 한 번만
  // escalationModel("유치원 선생님")에게 교정을 맡긴다. 직전까지 반려된 시도를
  // 그대로 알려줘 같은 실수를 반복하지 않게 한다.
  const escalationLogContext = { ...logContext, escalated: true };
  const escalationReasoningParams = getReasoningExtraParams(escalationModel);
  const escalatedVerdict = await runQualityCheck(
    client,
    escalationModel,
    userMessage,
    sourceText,
    escalationReasoningParams,
    verdict.finalText,
    escalationLogContext
  );

  if (escalatedVerdict.finalText.trim() === sourceText.trim()) {
    return escalatedVerdict;
  }

  // escalation 결과도 예외 없이 fastModel의 "아이"에게 다시 확인받는다.
  const escalatedFidelity = await verifyCorrectionFidelity(
    client,
    fastModel,
    actorSystemPrompt,
    historyMessages,
    userMessage,
    sourceText,
    escalatedVerdict.finalText,
    fastReasoningParams,
    escalationLogContext
  );

  if (escalatedFidelity.matches) {
    return escalatedVerdict;
  }

  logPipelineStep({
    ...escalationLogContext,
    stage: "fidelity-check",
    outcome: "escalation-also-rejected-fallback-to-source",
  });
  return { ...verdict, finalText: sourceText };
}
