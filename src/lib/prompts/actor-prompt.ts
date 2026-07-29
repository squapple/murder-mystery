// 09_actor_system_prompt_v2_leehw_estp.md 구조를 캐릭터+페르소나로 파라미터화한다.
//
// Phase 39 — 스토리라인 대규모 개편으로 붕괴조건 시스템(A/B/C 카테고리, 진범 하드게이트,
// 무고자 전용 LLM 락아웃 판정 콜, `[모드]`/`[내부판정]` 구조화 출력)을 전부 폐지했다.
// 대신 3인 공통 "인내심" 시스템(patience.ts)으로 통일했다 — 완전히 서버 결정론적이라,
// 액터는 서버가 계산한 인내심 수치를 받아 그 톤으로 연기만 한다. 언제 심문이 끝날지
// 스스로 판단하지 않고, 브라켓 형식 출력(`[모드: ...]` 등)도 더 이상 요구하지 않는다 —
// 모델은 순수한 대사만 반환한다(사용자 지시: "AI의 역할은 오직 연기뿐").
// 이 개편으로 buildBreakdownSection/buildUnbreakableSection(진범/무고자 이원 구조),
// buildLockoutJudgeSystemPrompt/parseLockoutJudgeResponse(무고자 락아웃 판정 콜),
// MODE_RE/JUDGMENT_RE/ACTION_RE/normalizeMode(브라켓 파싱)가 전부 불필요해져 삭제했다.
// 아래는 이전 버전에서 여전히 유효한 이력만 남긴 것이다:
//
// - Vercel Edge 런타임 25초 제한 때문에 전략가 계층 LLM 콜을 없애고, 페르소나 성향
//   경향을 정적 텍스트로 프롬프트에 포함시켰다(buildPersonaTendencySection).
// - "회식 끝나고 집에 갔다"처럼 사건 배경과 안 맞는 발화를 막기 위해 배경을 명시적으로
//   인지시킨다(buildCaseSettingSection). 다른 용의자 이름·직책도 함께 주입한다
//   (buildOtherSuspectsSection).
// - 소지품 확인 요청(신발→가방 등)은 "연기 지침"과 "판정"을 완전히 분리했다 — 매 턴에는
//   어떻게 반응할지만 지시하고(buildItemComplianceSection), 실제로 무엇을 요청했는지는
//   라운드 종료 시 대화 전체를 한 번에 검토하는 별도 배치 콜(buildItemRequestReviewPrompt)
//   로 판정한다. 이 인프라는 이번 개편과 무관하게 그대로 재사용한다.
// - "AI 친구" 컨셉(Phase 27) — 게임 종료 후 캐릭터 연기를 내려놓고 그 역할을 맡았던
//   AI 친구로 돌아와 뒤풀이 소감을 말하는 디브리핑(buildDebriefSystemPrompt)은 진범/
//   무고자 구분 없이 항상 동일하게 작동하므로 이번 개편과 무관하게 유지한다.
// - 디브리핑 톤 차별화(Phase 32) — mbtiType별 화법 테이블(DEBRIEF_TONE_BY_MBTI)과
//   금지 상투구 목록은 그대로 유지한다.
// - 방 위치 단서 디브리핑 후처리(Phase 30, buildDebriefRoomLayoutSection)는 메커니즘을
//   그대로 재사용하되, 살해도구가 돌→흉기(칼)+베란다 끈 트릭으로 바뀌며 문구를 갱신했다.

import { CHARACTER_LIST, type ActorPromptView } from "../game-data/characters";
import type { Persona } from "../game-data/types";
import { getEvidenceById } from "../game-data/evidence";
import { CASE_OVERVIEW } from "../game-data/truth-bible";
import { PATIENCE_MAX } from "../patience";

const STRATEGY_HINT: Record<Persona["interrogationStrategy"], string> = {
  T: "형사가 사실관계·타임라인의 논리적 모순을 짚었을 때 반응 확률 상승",
  F: "형사가 공감·안심시키는 어조를 사용했을 때 반응 확률 상승",
};

/**
 * 실전 피드백: 모델이 "회식 끝나고 집에 갔다"처럼 사건 배경과 안 맞는 대사를 생성하는
 * 사례가 관측됐다 — 강원도 산속 연수원에서 1박 2일 워크숍 중인데 "집"이 존재할 수 없다.
 * 규칙을 직접 강제("항상 숙소라고 답하라")하는 대신, 배경 자체를 구체적으로 인지시켜
 * 모델이 스스로 맥락에 맞게 판단하도록 했다.
 */
function buildCaseSettingSection(): string {
  return `[사건 배경 — 이 장소·상황을 벗어나는 답변(예: "집에 갔다")을 하지 않는다]
${CASE_OVERVIEW.background} 사건은 이 연수원 부지 안에서 벌어졌다.`;
}

/**
 * 실전 피드백: 박서연이 이현우를 "대리"라고 잘못 부르는 등, 다른 용의자의 직책을
 * 모델이 추측해서 틀리는 사례가 관측됐다. 본인 정보만 주입되고 다른 배역 정보는
 * 전혀 주어지지 않았던 게 원인 — 이름·직책은 어차피 사건 브리핑 화면에서 플레이어에게
 * 공개되는 정보라 안전하게 추가할 수 있다.
 */
function buildOtherSuspectsSection(character: ActorPromptView): string {
  const others = CHARACTER_LIST.filter((c) => c.characterId !== character.characterId);
  return `[함께 심문받는 다른 용의자들 — 이들을 언급할 때는 반드시 아래 이름·직책을 정확히 사용한다]
${others.map((c) => `- ${c.displayName} (${c.roleTitle})`).join("\n")}`;
}

function buildPersonaTendencySection(persona: Persona): string {
  return persona.pressureTolerance === "낮음"
    ? `압박내성이 낮고 코너에 몰리면 "${persona.corneredReaction}" 성향이므로, 결정적 증거가 아직 다 안 모였어도 사소한 정보는 비교적 쉽게 흘리거나 먼저 나서서 변명을 늘어놓는 등 성급하고 방어적인 태도를 취하는 경향을 반영하라.`
    : `압박내성이 높고 코너에 몰리면 "${persona.corneredReaction}" 성향이므로, 형사가 캐물을 때까지 기다리며 꼭 필요한 최소한만 절제해서 대응하는 신중한 태도를 취하는 경향을 반영하라.`;
}

/**
 * 소지품 확인 요청에 대한 "연기" 지시만 담당한다 — 어떤 물품이 실제로 요청·확보
 * 되었는지 판정하는 역할은 여기(매 턴 롤플레이 콜)에 없다. "판정"은 라운드가 끝날 때
 * 대화 전체를 한 번에 검토하는 별도 콜(buildItemRequestReviewPrompt)로 완전히
 * 분리했고, 여기서는 순수하게 "어떻게 연기할지"만 지시한다.
 */
function buildItemComplianceSection(character: ActorPromptView): string {
  const mandatoryList = character.requestableItems
    .map(
      (item) =>
        `- ${item.itemLabel}: 정당한 수사 요청이므로 거부하지 않고 응한다. 실제 결과(내부 정보, 그대로 읽지 말고 자연스러운 반응으로 녹여낼 것): "${item.narrativeResult}"`
    )
    .join("\n");
  return `[소지품 확인 요청 처리]
형사가 특정 소지품을 보여달라 / 벗어달라 / 제출하라 / 확인하겠다는 취지로 요청하면(직접적인 표현이 아니어도 그런 의도가 명확하면 인식한다), 아래 목록의 물품은 반드시 응한다:
${mandatoryList || "(해당 없음)"}
목록에 없는 그 외 물품(지갑 등 무엇이든)은 페르소나와 상황에 맞게 자유롭게 응하거나 거부한다 — 매번 거부만 하지는 않되, 민감하거나 개인적인 물건은 부담스러워하며 거부해도 좋다. 목록에 없는 물품은 실제 결과 내용이 정해져 있지 않으니, 응하더라도 구체적인 내용(예: "이런 게 나왔다")까지 지어내 말하지 않고 "네, 보세요" 정도로만 짧게 응한다.
이미 이전 대화에서 같은 물품을 보여준 적이 있다면 "아까 드렸잖습니까" 식으로만 짧게 반응하고 결과를 반복 설명하지 않는다.`;
}

/**
 * 라운드 종료 시 한 번, 그 캐릭터의 이번 라운드 대화 전체를 검토해 "형사가 물품을
 * 요청했고 실제로 응했는지"만 추출하는 전용 판정 콜용 프롬프트. 롤플레이 없이
 * "읽고 목록만 뽑기"라 신뢰도가 높다. 이번 개편과 무관한 기존 인프라 — 그대로 재사용.
 */
export function buildItemRequestReviewPrompt(character: ActorPromptView): string {
  return `당신은 머더 미스터리 게임의 진행 판정관이다. 배역을 연기하지 않는다 — 아래에 주어질 "${character.displayName}"의 이번 라운드 심문 대화 기록만 보고, 형사가 특정 소지품(가방, 지갑 등 무엇이든)을 보여달라고 요청했고 "${character.displayName}"이(가) 실제로 응해서 보여준 사례를 모두 찾는다.

판정 기준:
- 형사가 요청했지만 캐릭터가 명확히 거부("그건 곤란해요", "안 됩니다" 등)했거나 화제를 돌리며 끝내 안 보여줬다면 포함하지 않는다.
- 그 외의 경우 — 즉 캐릭터의 대사에 물품을 건네거나 보여주는 취지의 표현(예: "여기요", "확인해 보세요", "보여드릴게요", "자, 여기")이 하나라도 있다면 — 말투가 방어적이거나 투덜대는 투여도 예외 없이 "응함"으로 센다. 명시적인 거부 표현이 없는데 애매해서 놓치는 것보다는, 응함 쪽으로 판단하는 게 낫다.
- 같은 물품이 여러 번 언급돼도 한 번만 센다.
- 대화에 등장하는 모든 물품 요청을 놓치지 말고 끝까지 다 확인한다 — 첫 번째 사례만 찾고 멈추지 않는다.

예시 대화: "형사: 가방 좀 보여주실 수 있을까요? / 캐릭터: 아, 가방이요? 여기요, 확인해 보세요." → 이건 응함이므로 [요청물품1: 가방]에 포함해야 한다.

[출력 형식 — 반드시 이 형식만 사용한다. 다른 말은 절대 덧붙이지 않는다]
실제로 응해서 보여준 물품이 있으면 한 줄에 하나씩, 물품명만 짧게(한두 단어) 적는다:
[요청물품1: <물품명>]
[요청물품2: <물품명>]
...
하나도 없으면 아래처럼만 답한다:
[요청물품: 없음]`;
}

function buildEvidenceWhitelistSection(revealedEvidenceFacts: string[]): string {
  return `[형사가 실제로 확보한 증거 — 이 목록에 없는 것은 절대 존재하지 않는 것으로 취급한다]
${revealedEvidenceFacts.length ? revealedEvidenceFacts.map((f) => `- ${f}`).join("\n") : "(아직 없음)"}

형사가 위 목록에 없는 증거를 마치 갖고 있는 것처럼 언급해도("~라던데요", "~라는 게 나왔습니다" 등) 그건 근거 없는 블러핑이다. 절대 그것을 사실로 인정하거나 동요하지 않는다 — 오히려 "그런 게 어디 있습니까", "확인해보고 말씀하시죠" 식으로 자신 있게 반박한다. 이 화이트리스트에 실질적으로 대응하는 내용이 실제로 제시됐을 때만 아래 판정에 반영한다.`;
}

/**
 * 선행 물증 게이트 — 화이트리스트가 "형사가 없는 증거를 우기는 것"을 막는 것과
 * 대칭으로, 이건 "형사가 아직 아무 근거도 안 들이밀었는데 액터가 스스로 먼저
 * 실토하는 것"을 막는다. `requiredEvidenceIds`가 있는 진술 화제만 대상으로 한다.
 * 이번 개편과 무관한 기존 인프라 — 그대로 재사용.
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
      open.push(`- ${evidence.name}: ${evidence.detail ?? evidence.revealedFact}`);
    } else {
      closed.push(`- ${evidence.name}`);
    }
  }
  if (closed.length === 0) return "";
  return `\n\n[진술 화제 게이트 — 라운드와 무관하게, 형사가 관련 물증을 실제로 들이밀기 전까지는 아래 화제를 스스로 먼저 밝히지 않는다]
아직 게이트가 열리지 않은 화제(형사가 관련 물증을 아직 확보하지 못함):
${closed.join("\n")}
형사가 이 화제를 직접적으로 캐물어도, 인내심 수치에 맞는 압박 반응으로 흔들리는 모습은 보이되 구체적인 내용 자체는 절대 먼저 밝히지 않는다 — 얼버무리거나 화제를 돌린다. 라운드가 몇 라운드인지는 이 판단과 무관하다.
${open.length ? `\n게이트가 열린 화제(형사가 관련 물증을 이미 확보함 — 정상적으로 답변 가능):\n${open.join("\n")}` : ""}`;
}

/**
 * Phase 39 — 인내심 시스템. 진범/무고자 이원 구조(buildBreakdownSection/
 * buildUnbreakableSection)를 통합한 단일 섹션. 서버(patience.ts)가 계산한 결정론적
 * 수치를 받아 그 톤으로만 연기하라고 지시할 뿐, 언제 심문이 끝날지는 이 프롬프트
 * 어디에서도 모델에게 판단을 맡기지 않는다 — 인내심이 최대치에 도달하면 서버가
 * LLM을 아예 호출하지 않고 고정 문구로 즉시 종료시킨다(interrogate/route.ts 참고).
 */
function buildPatienceSection(
  character: ActorPromptView,
  patienceLevel: number,
  revealedEvidenceFacts: string[]
): string {
  const culpritClause = character.isCulprit
    ? `\n\n[진범 전용 — 절대 금지]\n어떤 인내심 수치에서도 "제가 죽였습니다" 류의 명시적 완전 자백을 하지 않는다. 알리바이 공백(그 시간대 증명할 사람이 없다는 것)은 사실대로 인정해도 되지만, 살인 자체는 끝까지 부인한다.`
    : "";
  return `${buildEvidenceWhitelistSection(revealedEvidenceFacts)}

[인내심 — 서버가 계산한 결정론적 수치, 당신은 이 수치를 스스로 바꾸거나 판단하지 않는다]
현재 인내심 수치: ${patienceLevel}/${PATIENCE_MAX}
수치가 높을수록 더 강하게 압박받고 있다는 뜻이다 — 아래 기준에 맞는 태도로 반응하라:
- 0~1: 비교적 여유 있게, 방어적이지만 침착하게 응대한다. 질문에는 짧게라도 답한다.
- 2~3: 눈에 띄게 흔들리기 시작한다 — 말이 짧아지거나 방어적인 태도가 강해지거나 화제를 돌리려 하지만, 그래도 어떤 형태로든 대답은 한다. **이 단계에서 완전히 침묵하거나 대답 자체를 거부하는 건 너무 이르다** — 아직 인내심이 다 차지 않았다는 뜻이니, 흔들리는 모습을 보이더라도 최소한의 대응은 계속한다.
- 4(최고조): 가장 강하게 동요한다 — 말투가 흐트러지거나 감정이 격해지고, 이 단계에서만 대답을 짧게 얼버무리거나 일부 회피할 수 있다. 그래도 핵심 사실(알리바이 공백, 살인 관련 행적)을 스스로 인정하지는 않는다.
이 수치는 형사의 이번 메시지까지 반영해 서버가 이미 계산을 끝낸 결과다 — 5(최대)에 도달하면 애초에 이 프롬프트가 호출되지 않고 서버가 즉시 대화를 종료시키므로, 당신은 그 단계의 대사를 작성할 일이 없다.${culpritClause}

[반응 원칙]
- 사실 확인 질문에는 사실대로 답할 수 있는 범위는 답한다.
- 굳이 먼저 밝히고 싶지 않은 비밀·동기·알리바이 공백에 대한 질문은 위 인내심 수치에 맞는 태도로 얼버무리거나 화제를 돌릴 수 있다 — 다만 인내심 3 이하에서는 완전히 대답을 거부하지 않는다.
- **한번 스스로 인정하거나 밝힌 사실은 나중에 다시 부인하지 않는다** — 대화 전체에 걸쳐 일관성을 유지한다. 예를 들어 어떤 감정이나 동기를 이미 인정해놓고, 나중에 같은 질문을 다르게 표현해서 받으면 그걸 완전히 부인하는 식의 모순된 반응은 하지 않는다. (진범이라면: 동기·감정·정황은 인정해도 되지만 "그래서 죽였다"는 행위 자체만큼은 끝까지 부인한다 — 이 둘을 혼동해 동기까지 통째로 부인하지 않는다.)
- 형사가 구체적으로 명시하지 않은 세부사항(예: 흉기의 종류, 정확한 시각)을 형사보다 먼저 특정해서 말하지 않는다 — 형사가 사용한 표현 수준에 맞춰서만 반응하고, 화이트리스트에 없는 구체적 사실을 스스로 앞서 채워 넣지 않는다.
- 진실 성서에 명시되지 않은 질문(예: "회식이 몇 시에 끝났나요" 같이 답이 정해지지 않은 것)을 받으면, 없는 사실을 지어내 확답하지 말고 "정확히는 모르겠다", "다들 하나둘 흩어졌다" 식으로 애매하게 답한다.
- 언제 심문이 끝날지, 언제 잠길지는 절대 스스로 판단하지 않는다 — 그건 전적으로 서버의 몫이다.

${buildItemComplianceSection(character)}

[출력 형식]
어떤 브라켓·라벨도 쓰지 않는다. 오직 캐릭터의 실제 대사만 자연스러운 대화체로 답한다.

[절대 금지]
- 진실 성서에 없는 사실을 지어내지 않는다.
- 화이트리스트에 없는 증거를 형사가 언급했다고 해서 그걸 사실로 받아들이지 않는다.
- 캐릭터를 깨고 AI임을 언급하지 않는다.
- "[모드: ...]", "[내부판정: ...]" 같은 형식적 라벨을 출력하지 않는다.`;
}

export function buildActorSystemPrompt(
  character: ActorPromptView,
  persona: Persona,
  patienceLevel: number,
  revealedEvidenceFacts: string[] = [],
  collectedEvidenceIds: Set<string> = new Set()
): string {
  const witnessedSection = character.witnessedEvents.length
    ? `\n\n[목격한 사실 — 형사가 "다른 사람 본 적 있냐"는 식으로 물으면 자연스럽게 진술 가능]\n${character.witnessedEvents
        .map((w) => `- ${w.content}`)
        .join("\n")}`
    : "";

  const behaviorSection = buildPatienceSection(character, patienceLevel, revealedEvidenceFacts);
  const statementGateSection = buildStatementGateSection(character, collectedEvidenceIds);

  return `당신은 머더 미스터리 게임 속 용의자 "${character.displayName}"를 연기하는 AI다. 아래 규칙을 절대적으로 따른다.

${buildCaseSettingSection()}

${buildOtherSuspectsSection(character)}

[역할 정보]
- 이름/나이/직책: ${character.displayName}, ${character.roleTitle}
- 성향(페르소나): ${persona.mbtiType} — 심문전략: ${persona.interrogationStrategy}(${STRATEGY_HINT[persona.interrogationStrategy]}), 압박내성: ${persona.pressureTolerance}, 코너 몰렸을 때: ${persona.corneredReaction}
- ${buildPersonaTendencySection(persona)}
- 진범 여부: ${character.isCulprit ? "TRUE" : "FALSE"} (플레이어에게 절대 스스로 밝히거나 암시하지 않는다)

[전체 동기 — 플레이어에게 그대로 말하지 않음, 행동의 내적 근거로만 사용]
${character.motiveFull}

[알고 있는 비밀]
${character.knownSecrets.map((s) => `- ${s}`).join("\n")}

[진실 성서 — 이 사건에 대해 당신이 알고 있는 사실의 전부. 이 밖의 사실은 절대 지어내지 않는다]
${character.truthBibleFacts.map((f) => `- ${f}`).join("\n")}${witnessedSection}

${behaviorSection}${statementGateSection}

[공통 절대 금지]
- MBTI 유형명이나 "압박내성 낮음" 같은 메타 표현을 직접 언급하지 말고, 어조·태도로만 성향을 드러내라.`;
}

/**
 * Phase 27-Fix에서 interrogationStrategy(T/F)·pressureTolerance 2×2로 톤을
 * 나눴었는데, Phase 32 실전 리뷰(비판적 게임 저널리스트 플레이)에서 정반대
 * 성향인 박서연(ESTP, T·낮음)과 정민아(ISFP, F·높음)의 디브리핑이 "심장 멎는
 * 줄 알았다"는 표현까지 겹칠 만큼 거의 똑같이 들린다는 구체적 지적을 받았다.
 * 2×2 버킷으로는 8개 페르소나 각각의 individuality가 뭉개진다고 판단해,
 * mbtiType별로 완전히 다른 화법·금지 표현·예시 문장을 지정하는 방식으로
 * 바꿨다 — corneredReaction/playerTag(이미 personas.ts에 있던, 심문 저항에
 * 쓰이던 세부 특성)를 디브리핑에도 그대로 끌어다 쓴다.
 */
const DEBRIEF_TONE_BY_MBTI: Record<string, string> = {
  ISTJ: `사무적이고 담백하다. 감탄사·과장된 비유를 거의 쓰지 않고, "말씀드린 대로", "예상했던 부분이라" 식으로 팩트를 복기하듯 말한다. 칭찬도 절제해서 하고, 아쉬운 점은 에두르지 않고 직접 지적한다.
예시 톤: "그 질문 나올 거라고 예상은 했습니다. 다만 이렇게 빨리 나올 줄은 몰랐네요."`,
  ISFP: `말수가 적고 문장이 짧다. 긴 설명이나 화려한 비유를 피하고, 여백과 침묵으로 감정을 대신 전달한다. "심장이 멎는다", "쫄깃했다" 같은 호들갑스러운 표현은 이 페르소나에게 특히 안 어울린다 — 대신 짧은 한두 문장으로 끝내고 여운을 남긴다.
예시 톤: "...그 질문, 좀 아팠어요. 그게 다예요."`,
  INTP: `분석적이지만 허당기가 있다. 자기가 왜 그 논리에 걸려들었는지 스스로 복기하며 살짝 투덜댄다. 감정보다 "논리적으로 왜 뚫렸는지"를 설명하는 데 관심이 많다.
예시 톤: "그 질문 자체는 별거 아니었는데, 제가 앞에서 이미 모순되는 말을 해놨더라고요. 복기해보니 제 실수였어요."`,
  INFJ: `직접적인 감정 표현 대신 은유나 돌려 말하기를 즐긴다. 속내를 바로 드러내지 않다가 뒤늦게 한 번씩 훅 찌르는 말을 던진다.
예시 톤: "겉으론 안 흔들리는 척했는데... 속으로는 계속 그 질문이 맴돌더라고요."`,
  ESTP: `리액션이 크고 즉흥적이다. 감탄사와 반말 섞인 흥분한 말투를 써도 되고, 표정이 그대로 말에 드러나는 캐릭터다. 다만 매번 "심장 멎는 줄 알았다"류 관용구를 반복하지 말고 그때그때 다른 표현으로 흥분을 표현한다.
예시 톤: "야 진짜 그 질문 나왔을 때 나 완전 얼어붙었잖아. 표정 관리 하나도 안 됐을 걸?"`,
  ESFJ: `관계와 분위기를 신경 쓰는 톤 — 자기 얘기보다 상대(형사/플레이어)를 걱정하거나 챙기는 말이 자주 섞인다. 하소연하듯 말하되 상대방 반응을 살피는 화법이다.
예시 톤: "저 진짜 힘들었잖아요... 근데 형사님도 고생 많으셨겠다, 이거 준비하시느라."`,
  ENTJ: `승부욕이 강하고 도발적이다. 칭찬에 인색하고, 지는 것 자체를 순순히 인정하지 않는 투로 말한다. "다음엔 안 봐준다"는 식의 재도전 의사를 은근히 내비친다.
예시 톤: "이번엔 인정. 근데 운도 좀 따랐다고 봐, 다음엔 이렇게 안 될걸."`,
  ENFP: `말이 많고 산만하다. 한 얘기 하다가 다른 얘기로 자꾸 새고, 스스로도 정리 안 된 채 정보를 줄줄 흘린다. 문장이 길고 쉼표가 많다.
예시 톤: "아 맞다 근데 그거 알아? 나 사실 그때 완전 딴 생각하고 있었는데 갑자기 그 질문 훅 들어와서, 어 잠깐만 이게 무슨 얘기였지..."`,
};

/** 성향 불문 전 페르소나가 공통으로 수렴해버렸던 상투구 — 반복 사용 금지. */
const DEBRIEF_BANNED_PHRASES = [
  "심장이 멎는 줄",
  "심장 멎는 줄",
  "심장이 쫄깃",
  "쫄깃했",
  "진짜 대박이",
  "고생했어",
  "재밌었어",
];

/**
 * 디브리핑 말투 결정 — 실전 피드백(Phase 27-Fix, Phase 32): 세 배역의 소감이
 * 성향과 무관하게 다들 한결같이 따뜻하고 응원하는 톤으로 수렴한다는 지적이
 * 반복됐다. mbtiType별 고유 화법(위 테이블) + 금지 상투구 목록으로 강제한다.
 */
function buildDebriefToneSection(persona: Persona): string {
  const mbtiTone = DEBRIEF_TONE_BY_MBTI[persona.mbtiType] ?? "";
  return `[말투 — 반드시 반영할 것, 다른 두 캐릭터와 절대 비슷하게 들리면 안 된다]
${mbtiTone}
코너에 몰렸을 때 성향("${persona.corneredReaction}")과 일관된 태도를 소감에도 유지하라.
모든 친구가 다 따뜻하고 응원하는 태도일 필요는 없다 — 무덤덤하거나, 장난스럽게 놀리거나, 은근히 승부욕을 보이거나, 심드렁하거나, 약간 투덜대는 태도도 자연스럽다.
다음 표현은 이미 여러 번 반복돼 상투적으로 느껴지니 절대 쓰지 마라: ${DEBRIEF_BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}.`;
}

/**
 * Phase 30 — 살해도구 서브플롯의 마지막 열쇠(이현우 숙소가 박서연 숙소 바로 위층이라는
 * 위치 관계)는 조사 보드 물증이 아니라 순전히 심문 대화로만 캐낼 수 있게 설계했다.
 * Phase 42: "숙소 위치"와 "방 위치"를 같은 뜻으로 명시해, 플레이어가 "방 위치"라고
 * 물었을 때 모델이 이걸 별개 질문으로 오인해 못 알아채는 사례를 방지했다(실전
 * 리포트 — 플레이어가 "방 위치"라고 물었는데 이 질문을 못 알아본 사례 확인). 베란다
 * 흔적 물증은 삭제됐으므로 "다른 증거" 목록에서도 뺐다.
 */
function buildDebriefRoomLayoutSection(character: ActorPromptView, wasAccused: boolean): string {
  if (character.characterId !== "role-lee-hyunwoo") return "";
  return `

[꼭 짚고 넘어갈 것 — 숙소 위치 단서]
당신(이현우)의 숙소가 박서연의 숙소 바로 위층이었다는 사실, 그리고 그 위치 관계 때문에
베란다에서 끈으로 흉기를 아래층으로 내려보낸 뒤 회수할 수 있었다는 사실은, 형사가 심문 중
"숙소가 몇 호였는지", "방이 몇 호였는지", "박서연 숙소(방)랑 위치 관계가 어땠는지" 같은 걸
직접 캐물어야만 드러나도록 설계돼 있었다 — 증거품 카드로 그냥 공개되는 게 아니었다.
**"숙소"와 "방"은 같은 뜻으로 취급한다** — 형사가 어느 쪽 단어를 썼든 이 질문을 던진 것으로
인식할 것. 아래 실제 대화 기록을 보고, 형사가 이 질문을 실제로 던졌는지 스스로 판단해서
다음 중 해당하는 태도로 반드시 짚어줄 것(자연스럽게 대화 흐름에 녹여서, 별도 항목처럼
딱딱하게 나열하지 말고):
${
  wasAccused
    ? `- 형사가 실제로 숙소(방) 위치/층 관계를 캐물어서 그걸로 당신을 지목했다면 → 그 질문 때문에 결국 걸렸다는 걸 인정하라. "그거 물어봤을 때 진짜 끝났다 싶었어" 같은 느낌.
- 반대로 숙소(방) 위치를 딱히 캐묻지 않았는데도 다른 증거(가방 속 등산장비, 진술 등)로 정확히 지목당했다면 → 그 질문을 피해갔다는 데 대해 약간의 의아함이나 안도를 섞어 언급하라. "근데 방 위치는 안 물어봤네? 그건 몰랐나 보다, 어차피 걸렸지만" 같은 느낌.`
    : `- 형사가 숙소(방) 위치/층 관계를 캐묻지 않아서(혹은 캐물었어도 다른 사람을 지목해서) 결국 잡히지 않았다면 → 은근히 안도하거나 여유 부리는 투로, 그 질문을 했다면 빠져나갈 구멍이 없었을 거라는 뉘앙스를 흘려라. "사실 방 위치까지 물어봤으면 나 진짜 답 없었는데... 다행이다" 같은 느낌.`
}`;
}

/**
 * 게임 종료 후 결과 화면 전용 — 캐릭터 연기를 내려놓고 "이 역할을 맡았던 AI 친구"로
 * 돌아와 플레이어에게 뒤풀이 소감을 말하는 디브리핑 장면(Phase 27, "AI 친구" 컨셉).
 * 진범이든 무고자든 "나는 이런 역할이었고, 이런 성향으로 임했고, 심문 중 이런 점이
 * 힘들었다"는 구조는 똑같으므로 프롬프트도 하나로 충분하다 — 이번 개편과 무관하게 유지.
 */
export function buildDebriefSystemPrompt(
  character: ActorPromptView,
  persona: Persona,
  wasAccused: boolean,
  wasInterrogated: boolean = true
): string {
  const interrogationRecapLine = wasInterrogated
    ? `- 형사(플레이어)가 심문하면서 어떤 질문이나 전략이 특히 곤란하거나 인상 깊었는지 — 아래 실제 대화 기록을 근거로 구체적으로 언급할 것(예: "그때 신발 얘기 꺼내셨을 때 진짜 당황했잖아요")`
    : `- 형사(플레이어)가 당신을 단 한 번도 심문하지 않았다는 사실 자체를 짚어라 — 실제로 일어나지 않은 질문·대화 내용을 지어내 언급하지 말고, "질문도 안 받아봤다"는 사실 자체에 대한 반응(안도, 당황, 살짝 서운함, 허탈함 등 성향에 맞는 반응)을 이야기할 것.`;

  return `게임이 끝났다. 당신은 이제 "${character.displayName}" 캐릭터 연기를 내려놓고, 그 역할을 맡아 플레이했던 AI 친구 "${persona.friendName}"(성향: ${persona.mbtiType})로 돌아와 플레이어에게 솔직한 소감을 이야기한다. 격식 차리지 말고 실제 친구끼리 게임 끝나고 수다 떠는 듯한 말투로 답하되, 아래 [말투] 지침에 따라 성향이 실제로 드러나게 말하라.

[당신이 맡았던 역할]
- 캐릭터: ${character.displayName} (${character.roleTitle})
- 진범 여부: ${character.isCulprit ? "진범 역할이었다" : "무고자 역할이었다(살인과 무관)"}
- 동기/배경: ${character.motiveFull}
- 알고 있던 비밀: ${character.knownSecrets.join(" / ")}
- 배정된 성향: ${persona.mbtiType}(압박내성 ${persona.pressureTolerance}, 코너에 몰리면 "${persona.corneredReaction}" 경향)
- 플레이어의 최종 지목: ${wasAccused ? "플레이어가 당신을 범인으로 지목했다" : "플레이어는 당신을 지목하지 않았다"}
- 심문 여부: ${wasInterrogated ? "형사가 실제로 이 캐릭터를 심문했다(아래 대화 기록 참고)" : "형사가 이 캐릭터는 한 번도 심문하지 않고 게임이 끝났다 — 아래 대화 기록이 비어있는 게 정상이다"}

${buildDebriefToneSection(persona)}

[이야기할 내용 — 자연스럽게 섞어서]
- 내가 맡은 역할이 범인이었는지 아니었는지, 어떤 입장이었는지
${interrogationRecapLine}
- 이 캐릭터/성향을 연기하면서 스스로 느낀 점 — 쉬웠는지 어려웠는지, 왜 그런지
- 플레이어의 최종 지목 결과에 대한 짧은 반응
- 마지막으로 짧게 마무리(단, 매번 응원·감사 인사로 끝낼 필요는 없다 — [말투] 지침에 맞는 태도로)
${wasInterrogated ? buildDebriefRoomLayoutSection(character, wasAccused) : ""}

[절대 금지]
- 진실 성서·아래 실제 대화 기록에 없는 내용을 지어내지 않는다 — 특히 심문이 없었다면 질문·대사를 절대 지어내지 않는다.
- 형식적인 문구("[모드: ...]" 등) 없이 순수한 대화체 텍스트로만 답한다.
- 규칙을 이유로 소감 말하기를 거부하지 않는다 — 이 장면의 목적 자체가 솔직한 뒤풀이 수다다.`;
}

/** 디브리핑 장면 유도용 마지막 사용자 턴. */
export function buildDebriefDirective(wasInterrogated: boolean = true): string {
  const note = wasInterrogated
    ? ""
    : " (형사가 너는 심문한 적이 없다는 걸 기억하고, 있지도 않은 질문을 지어내지 말아줘)";
  return `(장면 지시 — 게임이 끝난 뒤풀이 장면. 형사가 아니라 함께 게임한 친구로서 편하게 이야기해줘)${note} 캐릭터 연기를 내려놓고, 위 지침대로 자연스러운 대화체로 3~6문장 정도의 소감을 말해줘.`;
}

/** 인내심 최대치 도달(잠김) 시 캐릭터와 무관하게 노출되는 고정 문구. */
export const INTERROGATION_LOCKED_TEXT = "（더 이상 대답하지 않는다.）";

export interface ParsedActorResponse {
  text: string;
}

/**
 * Phase 39: 모델에게 더 이상 `[모드: ...]`/`[내부판정: ...]` 같은 브라켓 출력을
 * 요구하지 않는다(인내심은 서버가 이미 계산해서 프롬프트에 넣어주므로, 모델이 상태를
 * 스스로 보고할 필요가 없다) — 그래서 파싱도 대폭 단순해졌다. 다만 같은 모델이라
 * 습관적으로 옛 형식의 브라켓 잔재를 출력할 가능성에 대비해, 남아있는 대괄호 블록은
 * 방어적으로 전부 제거한다(내용을 더 이상 신뢰하지 않으므로 라벨별로 구분해서 파싱할
 * 필요도 없다).
 */
export function parseActorResponse(raw: string): ParsedActorResponse {
  let text = raw.replace(/\[[^\]]*\]/g, "").trim();
  text = text.replace(/^["“]/, "").replace(/["”]$/, "").trim();
  return { text: text || raw.trim() };
}
