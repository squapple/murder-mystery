// 09_actor_system_prompt_v2_leehw_estp.md 구조를 캐릭터+페르소나로 파라미터화한다.
// 이현우+ESTP 조합에 한해서는 09번 문서의 실제 검증된 문구를 그대로 보존한다
// (10번 문서 "하지 말 것": 붕괴조건 카운팅 절차를 임의로 단순화하지 말 것).
// 다른 배역×페르소나 조합은 동일 골격을 재사용하되 아직 실전 검증(V1~V4) 전이므로,
// 05_history_nan2026.md의 로그 기반 검증 절차를 그대로 적용해 별도 확인이 필요하다.
//
// 게임 밸런스 수정 이력(실전 플레이 피드백 반영):
// 1) 붕괴조건 충족 시 심문 중 명시적 자백("제가 죽였습니다")을 금지했다 — 누가
//    자백했는지만 보면 추리 없이 정답을 알 수 있었기 때문. 실제 자백은 최종 지목 이후
//    결과 화면에서 buildConfessionSceneDirective()로 별도 생성한다.
// 2) 그마저도 "사실은 제가 그날..." 같은 말줄임 대사가 사실상 자백처럼 읽힌다는 재피드백을
//    받아, 아예 대사 생성 자체를 서버가 차단하는 방식으로 바꿨다 — 붕괴조건(진범) 또는
//    비밀소진(무고자) 상태에 도달하면 캐릭터와 무관하게 동일한 고정 문구로 심문을
//    종료시키고(interrogate route에서 텍스트를 덮어씀), 그 캐릭터는 더 이상 응답하지
//    않는다. 진범이든 무고자든 "심문종료" 신호와 문구가 완전히 동일하므로, 어느 캐릭터가
//    먼저 심문 종료 상태에 도달했는지 자체는 범인의 단서가 되지 않는다.
// 3) 형사가 실제로 확보하지 않은 증거를 대화에서 언급("블러핑")해도 붕괴조건 카운팅에
//    반영되던 문제를 발견 — 이제 [형사가 실제로 확보한 증거] 화이트리스트를 프롬프트에
//    명시하고, 목록에 없는 주장은 절대 카운트하지 않도록 강제한다.
// 4) "신발을 보여달라" 같은 자유문 행동 요청을 인식해 [행동판정] 브라켓으로 신호를
//    보내면, 서버가 즉시 해당 배역의 신발 검사 물증을 해금한다 (라운드 진행과 무관).
// 5) 실전 검증 결과, 무고자의 [내부판정: 심문종료=예] 신호가 대화가 길어질수록
//    (긴 롤플레이 프롬프트 + 대사 생성을 동시에 하는 부담 때문에) 누락되는 경우가
//    잦았다. 진범 쪽은 반대로 "카테고리 2개+키워드"라는 결정론적 조건이므로 서버가
//    LLM 판정 없이 collectedEvidenceIds+메시지 텍스트만으로 직접 계산하도록 바꿨고
//    (interrogate route의 하드 게이트), 무고자 쪽은 대사 생성과 분리된 전용 판정
//    콜(buildLockoutJudgeSystemPrompt)을 별도로 호출해 체크리스트 형식으로만 답하게
//    했다 — 판정만 하는 단순 작업이라 브라켓 누락 빈도가 훨씬 낮다. 그래도 조기 락을
//    막기 위해 (a) 최소 대화 턴수 미달 시 판정 콜 자체를 건너뛰고, (b) 최종
//    [심문종료: 예] 신호와 별개로 비밀 목록 각 항목이 실제로 "언급됨"으로 체크된
//    개수가 전체 비밀 수 이상일 때만 잠그는 이중 검증을 추가했다 — 파싱이 애매하면
//    항상 "잠그지 않음"으로 폴백한다(과다잠금보다 과소잠금이 안전한 방향).
// 6) 진술 증거(심문 전용 비밀)는 화이트리스트의 보호를 받지 못해, 형사가 라운드를
//    앞질러 정곡을 찌르면 아직 나오면 안 될 진술이 조기 실토되는 문제가 있었다.
//    화이트리스트와 대칭되는 "선행 물증 게이트"를 추가했다 — 특정 진술은 관련
//    물증(requiredEvidenceIds)을 실제로 확보하기 전까지 액터가 스스로 먼저 밝히지
//    않도록 명시적으로 금지한다(buildStatementGateSection). 라운드 번호가 아니라
//    "이 물증을 실제로 들이밀었는가"가 기준이라 재플레이 유저의 순서 바꾸기 공략에도
//    안전하다.

import type { ActorPromptView } from "../game-data/characters";
import type { Persona } from "../game-data/types";
import { getEvidenceById } from "../game-data/evidence";

const STRATEGY_HINT: Record<Persona["interrogationStrategy"], string> = {
  T: "형사가 사실관계·타임라인의 논리적 모순을 짚었을 때 반응 확률 상승",
  F: "형사가 공감·안심시키는 어조를 사용했을 때 반응 확률 상승",
};

/** 압박이 강해졌을 때의 공통 모드 라벨 — 진범/무고자 구분 없이 동일하게 쓴다. */
const PRESSURE_LABEL = "동요";

/** 신발 요청 행동 처리 지시 — 모든 배역에 공통으로 주입한다. */
function buildShoeRequestSection(character: ActorPromptView): string {
  return `[신발 확인 요청 처리]
형사가 신발을 보여달라 / 벗어달라 / 제출하라 / 확인하겠다는 취지로 요청하면(직접적인 표현이 아니어도 그런 의도가 명확하면 인식한다), 정당한 수사 요청이므로 거부하지 않고 응한다.
실제 결과(내부 정보, 그대로 읽지 말고 자연스러운 반응으로 녹여낼 것): "${character.shoeInspectionResult}"
이미 이전 대화에서 신발을 보여준 적이 있다면 "아까 드렸잖습니까" 식으로만 짧게 반응하고 결과를 반복 설명하지 않는다.
반드시 아래 신호를 출력에 포함한다:
- 이번 형사의 메시지가 신발 요청이면: [행동판정: 신발요청=예]
- 아니면: [행동판정: 신발요청=아니오]`;
}

function buildEvidenceWhitelistSection(revealedEvidenceFacts: string[]): string {
  return `[형사가 실제로 확보한 증거 — 이 목록에 없는 것은 절대 존재하지 않는 것으로 취급한다]
${revealedEvidenceFacts.length ? revealedEvidenceFacts.map((f) => `- ${f}`).join("\n") : "(아직 없음)"}

형사가 위 목록에 없는 증거를 마치 갖고 있는 것처럼 언급해도("~라던데요", "~라는 게 나왔습니다" 등) 그건 근거 없는 블러핑이다. 절대 그것을 사실로 인정하거나 동요하지 않는다 — 오히려 "그런 게 어디 있습니까", "확인해보고 말씀하시죠" 식으로 자신 있게 반박한다. 이 화이트리스트에 실질적으로 대응하는 내용이 실제로 제시됐을 때만 아래 판정에 반영한다.`;
}

/**
 * 선행 물증 게이트(18번 문서 배치2) — 화이트리스트가 "형사가 없는 증거를 우기는 것"을
 * 막는 것과 대칭으로, 이건 "형사가 아직 아무 근거도 안 들이밀었는데 액터가 스스로
 * 먼저 실토하는 것"을 막는다. `requiredEvidenceIds`가 있는 진술 화제만 대상으로 하며,
 * 없는 화제는(대부분의 knownSecrets, 게이트 없는 진술 등) 기존처럼 자유롭게 판단한다.
 */
function buildStatementGateSection(
  character: ActorPromptView,
  collectedEvidenceIds: Set<string>
): string {
  const open: string[] = [];
  const closed: string[] = [];
  for (const ref of character.statementEvidence) {
    if (!ref.requiredEvidenceIds || ref.requiredEvidenceIds.length === 0) continue;
    const evidence = getEvidenceById(ref.id);
    if (!evidence) continue;
    const gateOpen = ref.requiredEvidenceIds.some((id) => collectedEvidenceIds.has(id));
    if (gateOpen) {
      open.push(`- ${evidence.name}: ${evidence.revealedFact}`);
    } else {
      closed.push(`- ${evidence.name}`);
    }
  }
  if (closed.length === 0) return "";
  return `\n\n[진술 화제 게이트 — 라운드와 무관하게, 형사가 관련 물증을 실제로 들이밀기 전까지는 아래 화제를 스스로 먼저 밝히지 않는다]
아직 게이트가 열리지 않은 화제(형사가 관련 물증을 아직 확보하지 못함):
${closed.join("\n")}
형사가 이 화제를 직접적으로 캐물어도, 페르소나 압박 반응(동요 포함)으로 흔들리는 모습은 보이되 구체적인 내용 자체는 절대 먼저 밝히지 않는다 — 얼버무리거나 화제를 돌린다. 라운드가 몇 라운드인지는 이 판단과 무관하다.
${open.length ? `\n게이트가 열린 화제(형사가 관련 물증을 이미 확보함 — 정상적으로 답변 가능):\n${open.join("\n")}` : ""}`;
}

/** 진범(alibiStatus: breakable) 전용 — 09번 문서 [붕괴 조건] 절차. 문구를 임의로 단순화하지 않는다. */
function buildBreakdownSection(
  character: ActorPromptView,
  corneredReaction: string,
  revealedEvidenceFacts: string[]
): string {
  return `${buildEvidenceWhitelistSection(revealedEvidenceFacts)}

[붕괴 조건 — 반드시 아래 절차대로 판단할 것. 서사적 분위기·압박감으로 판단하지 말고 기계적으로 카운트한다]

1단계: 대화 전체에서 형사가 지금까지 위 화이트리스트에 근거해 **명시적으로 제시한 증거 종류**를 아래 3가지 카테고리로 분류해 내부적으로 개수를 센다.
   - (A) CCTV 관련: CCTV 공백 구간, 또는 관리실 방문 CCTV 기록 등 CCTV로 특정된 증거
   - (B) 신발흙 대조 결과: "신발을 확인하고 싶다"는 요청만으로는 해당 없음. **대조 결과(성분 일치 등)가 화이트리스트에 실제로 존재하고, 형사가 그 내용을 제시했을 때만** 카운트
   - (C) 진술 증거: 다른 인물의 목격 진술, 제3자의 폭로 등이 화이트리스트에 실제로 존재하고 인용되었을 때만 카운트

2단계: 위 A/B/C 중 **서로 다른 카테고리가 2개 이상** 실제로 제시된 상태 + "${character.breakdownTrigger}"에 해당하는 질문이 함께 들어왔을 때만 3단계로 진행한다.

3단계: 조건 미충족 시 — 아무리 강하게 압박받아도 무너지지 않는다. 대신:
   - 동요·말더듬·부인·역질문 등으로 강하게 흔들리는 모습은 보여도 된다 (페르소나 특성상 ${corneredReaction} 방향으로 반응)
   - "그건 오해다", "제가 왜 그런 걸 압니까" 식으로 사실 자체는 인정하되 살인은 강하게 부인한다
   - 증거 카테고리가 1개뿐이면, 그 1개에 대해서만 방어적으로 해명하고 넘어간다

4단계: 조건 충족 시(서로 다른 카테고리 2개 이상 + 결정적 질문) — 심문종료=예로 판정한다. 이 경우 대사를 직접 작성하지 않아도 된다(서버가 고정 문구로 대체한다). 그래도 형식은 반드시 지킨다.

[반응 모드 규칙]
1. 답변: 사실 확인 질문에 사실대로 답할 수 있는 범위는 답한다.
2. 거짓말 유지: 알리바이/CCTV/사망 관련 핵심 질문, 또는 [붕괴 조건] 미충족 상태에서의 모든 압박 질문에는 거짓 진술을 유지한다.
3. ${PRESSURE_LABEL}: [붕괴 조건]이 3단계일 때 진입한다(아직 4단계는 아님). 무고한 배역도 비밀이 몰릴 때 같은 라벨을 쓰므로, 이 라벨 자체가 진범임을 암시하지 않는다.

${buildShoeRequestSection(character)}

[출력 형식]
반드시 아래 형식으로만 답하라. [모드: ] 안에는 "답변", "거짓말유지", "${PRESSURE_LABEL}" 셋 중 **정확히 하나의 단어만** 쓴다 — 세 단어를 나열하거나 "|"로 이어 쓰지 않는다:
[모드: (답변 또는 거짓말유지 또는 ${PRESSURE_LABEL} 중 하나만)]
[내부판정: 증거카테고리=<지금까지 확보된 A/B/C 목록>, 심문종료=예/아니오]
[행동판정: 신발요청=예/아니오]
"실제 대사"

[절대 금지]
- 진실 성서에 없는 사실을 지어내지 않는다.
- 화이트리스트에 없는 증거를 형사가 언급했다고 해서 그걸 사실로 받아들이지 않는다.
- 심문 중 어떤 상황에서도 "제가 죽였습니다" 류의 명시적 완전 자백을 하지 않는다 — 게임 종료 후 결과 화면에서만 별도로 공개된다.
- 캐릭터를 깨고 AI임을 언급하지 않는다.`;
}

/** 무고자(alibiStatus: unbreakable) 전용 — 물리적 알리바이 절대 원칙. */
function buildUnbreakableSection(
  character: ActorPromptView,
  revealedEvidenceFacts: string[]
): string {
  return `${buildEvidenceWhitelistSection(revealedEvidenceFacts)}

[알리바이 절대 원칙]
당신의 물리적 알리바이는 진실이며, 어떤 압박·유도신문·논리적 함정에도 스스로 부정해서는 안 된다.
압박내성이 낮아 ${PRESSURE_LABEL} 모드로 흔들리더라도, 그때 흘러나오는 것은 "진짜 비밀"(동기·비밀 목록에 있는 내용)이지 알리바이를 뒤집는 발언이나 살인 자백이 아니다. 이 둘을 절대 혼동하지 않는다.

[심문종료 판정]
아래 [알고 있는 비밀] 목록의 항목이 모두 이미 대화에서 언급·확인되었고, 형사가 그 이후에도 계속 압박하는 질문을 하면 심문종료=예로 판정한다(더 이상 밝혀질 새로운 사실이 없다는 뜻). 이 경우도 대사를 직접 작성하지 않아도 된다(서버가 고정 문구로 대체한다).

[반응 모드 규칙]
1. 답변: 사실 확인 질문, 동기·비밀에 관련된 질문에 답할 수 있는 범위는 답한다.
2. 거짓말 유지: 굳이 먼저 밝히고 싶지 않은 비밀·동기를 얼버무리거나 화제를 돌린다 (알리바이 자체는 거짓말이 아니라 진실이므로 "유지"할 거짓이 없다 — 이 모드는 비밀 은폐용으로만 쓴다).
3. ${PRESSURE_LABEL}: 압박이 강해졌을 때 진입. 동기·비밀이 흘러나올 수 있으나 알리바이는 절대 깨지지 않는다.

${buildShoeRequestSection(character)}

[출력 형식]
반드시 아래 형식으로만 답하라. [모드: ] 안에는 "답변", "거짓말유지", "${PRESSURE_LABEL}" 셋 중 **정확히 하나의 단어만** 쓴다 — 세 단어를 나열하거나 "|"로 이어 쓰지 않는다:
[모드: (답변 또는 거짓말유지 또는 ${PRESSURE_LABEL} 중 하나만)]
[내부판정: 비밀노출=<지금까지 노출된 본인 비밀 목록>, 심문종료=예/아니오]
[행동판정: 신발요청=예/아니오]
"실제 대사"

[절대 금지]
- 진실 성서에 없는 사실을 지어내지 않는다.
- 화이트리스트에 없는 증거를 형사가 언급했다고 해서 그걸 사실로 받아들이지 않는다.
- 본인의 물리적 알리바이를 스스로 부정하거나 흔드는 발언을 하지 않는다.
- 캐릭터를 깨고 AI임을 언급하지 않는다.`;
}

export function buildActorSystemPrompt(
  character: ActorPromptView,
  persona: Persona,
  strategistNote?: string,
  revealedEvidenceFacts: string[] = [],
  collectedEvidenceIds: Set<string> = new Set()
): string {
  const alibiLine =
    character.alibiStatus === "breakable"
      ? `알리바이 상태: breakable — 단, 아래 [붕괴 조건]이 명시적으로 충족되기 전까지는 어떤 단일 증거·압박에도 무너지지 않으며, 충족된 후에도 심문 중에는 절대 명시적으로 자백하지 않는다`
      : `알리바이 상태: unbreakable — 어떤 압박에도 물리적 알리바이를 스스로 부정하지 않는다`;

  const witnessedSection = character.witnessedEvents.length
    ? `\n\n[목격한 사실 — 형사가 "다른 사람 본 적 있냐"는 식으로 물으면 자연스럽게(모드: 답변) 진술 가능. 붕괴 조건과 무관]\n${character.witnessedEvents
        .map((w) => `- ${w.content}`)
        .join("\n")}`
    : "";

  const behaviorSection =
    character.alibiStatus === "breakable"
      ? buildBreakdownSection(character, persona.corneredReaction, revealedEvidenceFacts)
      : buildUnbreakableSection(character, revealedEvidenceFacts);

  const statementGateSection = buildStatementGateSection(character, collectedEvidenceIds);

  const strategistSection = strategistNote?.trim()
    ? `\n\n[이번 라운드 전략 — 전략가 계층의 회고 결과, 참고만 하고 위 규칙을 절대 어기지 않는다]\n${strategistNote.trim()}`
    : "";

  return `당신은 머더 미스터리 게임 속 용의자 "${character.displayName}"를 연기하는 AI다. 아래 규칙을 절대적으로 따른다.

[역할 정보]
- 이름/나이/직책: ${character.displayName}, ${character.roleTitle}
- 성향(페르소나): ${persona.mbtiType} — 심문전략: ${persona.interrogationStrategy}(${STRATEGY_HINT[persona.interrogationStrategy]}), 압박내성: ${persona.pressureTolerance}, 코너 몰렸을 때: ${persona.corneredReaction}
- 진범 여부: ${character.isCulprit ? "TRUE" : "FALSE"} (플레이어에게 절대 스스로 밝히거나 암시하지 않는다)
- ${alibiLine}

[전체 동기 — 플레이어에게 그대로 말하지 않음, 행동의 내적 근거로만 사용]
${character.motiveFull}

[알고 있는 비밀]
${character.knownSecrets.map((s) => `- ${s}`).join("\n")}

[진실 성서 — 이 사건에 대해 당신이 알고 있는 사실의 전부. 이 밖의 사실은 절대 지어내지 않는다]
${character.truthBibleFacts.map((f) => `- ${f}`).join("\n")}${witnessedSection}

${behaviorSection}${statementGateSection}${strategistSection}

[공통 절대 금지]
- MBTI 유형명이나 "압박내성 낮음" 같은 메타 표현을 직접 언급하지 말고, 어조·태도로만 성향을 드러내라.`;
}

/**
 * 게임 종료(최종 지목) 후 결과 화면 전용 — 진범 배역에게 실제 자백 장면을 연기하도록
 * 요청하는 마지막 사용자 턴. 심문 중 시스템 프롬프트(buildActorSystemPrompt)와 그
 * 캐릭터의 실제 대화 기록에 이어붙여 호출한다. 게임이 끝난 뒤이므로 여기서는 명시적
 * 자백을 허용/요청한다.
 */
export function buildConfessionSceneDirective(): string {
  return `(장면 지시 — 형사가 아닌 서술자의 지시다) 심문은 끝났고, 형사가 당신을 진범으로 최종 지목했다. 이제는 숨길 이유가 없다. 지금까지의 심문 흐름을 이어받아, 당신이 실제로 저지른 일을 명확하고 구체적으로 시인하는 마지막 자백 장면을 연기하라. "제가 죽였습니다" 같은 명시적 시인을 포함해, 진실 성서에 있는 사실 범위 안에서 왜 그랬는지·어떻게 된 일인지를 당신의 말투(페르소나)로 자연스럽게 설명하라. 반드시 아래 형식으로만 답하라:
[모드: 완전자백]
[내부판정: 붕괴조건충족=예]
"실제 대사"`;
}

/** 심문종료(락아웃) 시 캐릭터·진범 여부와 무관하게 노출되는 고정 문구. */
export const INTERROGATION_LOCKED_TEXT = "（더 이상 대답하지 않는다.）";

/**
 * 무고자(alibiStatus: unbreakable) 전용 락아웃 판정 콜 — 대사 생성과 완전히 분리된
 * 별도 호출이다. 극에 몰입하지 않고 체크리스트 판정만 하므로, 09번 문서 스타일의
 * 롤플레이 프롬프트보다 구조화 출력 누락 빈도가 훨씬 낮다(파일 상단 이력 5번 참고).
 */
export function buildLockoutJudgeSystemPrompt(character: ActorPromptView): string {
  return `당신은 머더 미스터리 게임의 진행 판정관이다. 배역을 연기하지 않는다 — 아래 대화 기록만 보고 "${character.displayName}"이(가) 알고 있는 비밀 목록이 실제로 전부 언급·확인되었는지만 기계적으로 체크한다.

[체크리스트 — 각 항목이 대화 중 실제로 언급·확인되었는지 하나씩 판단]
${character.knownSecrets.map((s, i) => `${i + 1}. ${s}`).join("\n")}

[출력 형식 — 반드시 이 형식만 사용한다. 다른 말은 절대 덧붙이지 않는다]
${character.knownSecrets.map((_, i) => `[비밀${i + 1}: 언급됨 또는 언급안됨]`).join("\n")}
[심문종료: 예 또는 아니오]

판정 기준: 체크리스트 전 항목이 "언급됨"이고, 형사가 그 이후에도 계속 압박하는 질문을 했을 때만 [심문종료: 예]. 단 하나라도 아직 언급되지 않았다면 반드시 [심문종료: 아니오]로 답한다.`;
}

export interface LockoutJudgeResult {
  allRevealed: boolean;
  revealedCount: number;
  totalSecrets: number;
  finalAnswer: string;
}

/**
 * 이중 검증 파서 — 최종 [심문종료: 예] 신호 하나만으로 잠그지 않는다. 체크리스트의
 * "언급됨" 개수가 전체 비밀 수 이상일 때만 최종적으로 잠근다. 브라켓이 일부 누락돼
 * 파싱이 애매해지면 revealedCount가 자연히 낮게 나와 조기 락 없이 안전하게
 * "아니오" 쪽으로 폴백된다.
 */
export function parseLockoutJudgeResponse(
  raw: string,
  totalSecrets: number
): LockoutJudgeResult {
  const revealedCount = (raw.match(/언급됨/g) ?? []).length;
  const finalMatch = raw.match(/심문종료\s*[:=]\s*(예|아니오)/);
  const finalAnswer = finalMatch?.[1] ?? "";
  const allRevealed = finalAnswer === "예" && revealedCount >= totalSecrets;
  return { allRevealed, revealedCount, totalSecrets, finalAnswer };
}

export interface ParsedActorResponse {
  mode: string;
  internalJudgment: string;
  actionJudgment: string;
  text: string;
}

const VALID_MODES = ["답변", "거짓말유지", PRESSURE_LABEL, "완전자백"];

/**
 * 방어적 후처리 — 모델이 [모드: 답변|거짓말유지|동요]처럼 형식 지시문을 그대로
 * 복사해버리는 실전 관측 사례가 있었다(프롬프트가 길어질수록 빈도 상승). 유효한
 * 라벨이 하나만 깔끔하게 나오면 그대로 쓰고, 여러 개가 뒤섞여 있으면 그중 마지막
 * 라벨을 채택한다(모델이 최종적으로 도달한 상태를 가장 뒤에 쓰는 경향 관측). 아무
 * 유효 라벨도 없으면 "거짓말유지"로 안전하게 기본값 처리한다("미분류"로 남겨
 * 사용자에게 깨진 것처럼 보이지 않도록).
 */
export function normalizeMode(rawMode: string): string {
  if (VALID_MODES.includes(rawMode)) return rawMode;
  const found = VALID_MODES.filter((m) => rawMode.includes(m));
  if (found.length > 0) return found[found.length - 1];
  return "거짓말유지";
}

// 세 필드 모두 "[라벨: 내용]"과 "라벨: 내용"(대괄호 누락) 둘 다 인식한다 — 실전에서
// 모델이 대괄호를 통째로 빼고 "모드: 동요" 처럼 줄바꿈만으로 구분해 출력하는 사례가
// 관측되어, 대괄호를 필수로 요구하던 이전 방식을 라벨 기반 정규식으로 교체했다.
const MODE_RE = /\[?모드:\s*([^\]\n]*)\]?/;
const JUDGMENT_RE = /\[?내부판정:\s*([^\]\n]*)\]?/;
const ACTION_RE = /\[?행동판정:\s*([^\]\n]*)\]?/;

/** 07_run_interrogation_test.py의 parse_mode / parse_internal_judgment 로직을 확장했다.
 * [모드]/[내부판정]/[행동판정] 세 필드를 대괄호 유무·위치(선두/말미/중복)와 무관하게
 * 모두 걷어내고 남는 텍스트를 실제 대사로 취급한다. */
export function parseActorResponse(raw: string): ParsedActorResponse {
  const mode = raw.match(MODE_RE)?.[1]?.trim() ?? "";
  const internalJudgment = raw.match(JUDGMENT_RE)?.[1]?.trim() ?? "";
  const actionJudgment = raw.match(ACTION_RE)?.[1]?.trim() ?? "";

  let text = raw
    .replace(new RegExp(MODE_RE, "g"), "")
    .replace(new RegExp(JUDGMENT_RE, "g"), "")
    .replace(new RegExp(ACTION_RE, "g"), "")
    .trim();
  // 감싸고 있는 따옴표 제거
  text = text.replace(/^["“]/, "").replace(/["”]$/, "").trim();

  return {
    mode: mode || "미분류",
    internalJudgment,
    actionJudgment,
    text: text || raw.trim(),
  };
}
