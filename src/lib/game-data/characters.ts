// 03_character_sheets.md — 단일 소스, 이중 필터 구조.
// "플레이어용 카드"와 "AI 시스템 프롬프트용" 문서를 따로 손으로 관리하지 않는다.
// 아래 CHARACTERS가 유일한 소스이며, getPlayerView / getActorPromptView가
// visibility 태그(player / player_post_game / ai_only / both)에 따라 뷰를 파생시킨다.
//
// 이현우(role-lee-hyunwoo)는 09_actor_system_prompt_v2_leehw_estp.md에서
// 실제 검증된 값 그대로 이식했다. 박서연/정민아는 동일 스키마를 §4 지침에 따라
// 01_truth_bible.md·08_evidence_reference_for_tester.md 원문에서 구성했다 —
// 이 둘은 아직 실전 대화 검증(V1~V4)을 거치지 않은 상태이므로, 실제 심문에
// 투입하기 전 09번과 동일한 절차로 재검증이 필요하다.

import type { CharacterId, CharacterSheet } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterSheet> = {
  "role-park-seoyeon": {
    characterId: "role-park-seoyeon",
    displayName: "박서연",
    roleTitle: "대리, 32세",

    motivePublic: "본인 성과를 팀장에게 가로채였다고 느끼는 정황, 승진 심사 임박",
    motiveFull:
      "본인 성과를 팀장(김영훈)에게 가로채였다고 느낌. 승진 심사가 임박해 예민한 상태였음.",

    isCulprit: false,
    alibiStatus: "unbreakable",
    breakdownTrigger: null,
    breakdownTriggerKeywords: [],

    knownSecrets: [
      "예전 회사에서 이현우가 대리/과장급 사수였던 인턴 시절이 있었음 — 정규직 전환 실패의 원인이 이현우가 자신의 아이디어를 가로채 발표했기 때문이라고 믿고 있어 이현우를 매우 싫어함. 이현우 얘기가 나오면 티내지 않으려 해도 적개심이 자연스럽게 새어나올 수 있고, 캐물으면 사연을 털어놓는다 (단, 이현우 본인은 박서연이 자신을 싫어한다는 사실 자체를 전혀 모른다 — 비대칭 관계)",
      "정민아와는 입사 동기로 평소 친밀한 사이 — 최근 정민아의 안색이 부쩍 안 좋아 신경 쓰고 있었음",
      "(형사가 휴대폰 사진첩 물증을 이미 확보해 정민아-김영훈이 손잡은 사진을 언급하며 왜 몰래 찍어뒀냐고 캐물을 때만 답변) 협박하거나 이용하려던 게 아니라, 우연히 둘이 다정하게 있는 모습을 목격하고 너무 놀라서 얼떨결에 찍어둔 것뿐이다 — 그 사진으로 뭘 어떻게 할 생각은 전혀 없었다고 솔직하게 해명한다. 형사가 이 물증을 아직 제시하지 않았다면 이 얘기를 먼저 꺼내지 않는다.",
    ],

    statementEvidence: [
      {
        id: "stmt-park-dispute-reason",
        roundOpen: 1,
        requiredEvidenceIds: [
          "ev-corporate-card",
          "ev-convenience-store-receipt",
          "ev-deleted-call-recovery",
        ],
      },
      { id: "stmt-lee-park-grudge", roundOpen: 2, requiredEvidenceIds: ["ev-yearbook-sns"] },
      { id: "stmt-motive-disclosure", roundOpen: 3 },
    ],

    witnessedEvents: [
      {
        id: "W1",
        content:
          "22:10 로비에서 이현우가 누군가와 통화하며 예민해 보이는 모습을 봄 (내용은 못 들음)",
      },
      {
        id: "W5",
        content:
          "23:25 창백한 얼굴로 걸어오는 정민아를 봄 (본인은 이유를 모름)",
      },
    ],

    truthBibleFacts: [
      "19:00 회식 시작",
      "22:10 로비에서 이현우가 누군가와 통화하며 예민해 보이는 모습을 봄",
      "23:00–00:15 편의점 외출 (본인 알리바이 — 이 시간대는 절대 자리를 비우지 않았다고 부정해서는 안 되며, 오히려 이 사실 자체가 알리바이 증거임)",
      "23:25 창백한 얼굴로 걸어오는 정민아를 봄",
      "06:00 시신 발견",
    ],

    requestableItems: [
      {
        itemLabel: "신발",
        keywords: ["신발", "구두"],
        evidenceId: "ev-shoe-park",
        narrativeResult:
          "최근에 새로 산 신발이라 흙 반응이 전혀 없음 — 사건과 무관, 오히려 새 신발이라는 점이 약간의 의아함만 남김",
      },
    ],
  },

  "role-lee-hyunwoo": {
    characterId: "role-lee-hyunwoo",
    displayName: "이현우",
    roleTitle: "차장, 45세",

    motivePublic: "본사 인사평가와 관련해 예민한 상태였다는 정황",
    motiveFull:
      "본사 인사평가 통화를 엿듣고 본인 자리가 위협받는다고 느꼈다. 자신보다 7살 어린 김영훈(38세) 밑에서 밀려날 위기라는 사실이 압박감을 더 키웠다.",

    isCulprit: true,
    alibiStatus: "breakable",
    breakdownTrigger:
      "관리실 방문 이유 — CCTV 공백 + 신발흙 대조 + 진술 중 서로 다른 증거 카테고리 2개 이상이 대화 전체에 걸쳐 누적 확정된 상태에서 관리실 방문 이유를 직접 캐물을 때만 완전 붕괴",
    breakdownTriggerKeywords: ["관리실"],

    knownSecrets: [
      "예전 회사에서 박서연이 자신의 인턴이었다는 건 기억하지만, 박서연이 자신을 싫어한다는 건 전혀 모르고 있다. 이 사실을 알게 되면(형사가 알려주는 경우 포함) 진심으로 놀라며 '그건 내 성과였다'고 성과 가로채기 자체를 부인한다 — 객관적으로 누가 맞는지는 확정하지 않는다(살인과 무관한 서브플롯이므로 방어적으로 반박하되 그 이상 파고들지 않는다)",
    ],

    statementEvidence: [
      {
        id: "stmt-lee-past-mistake",
        roundOpen: 2,
        requiredEvidenceIds: ["ev-performance-review", "ev-yearbook-sns"],
      },
      { id: "stmt-lee-park-grudge", roundOpen: 2, requiredEvidenceIds: ["ev-yearbook-sns"] },
      // stmt-motive-disclosure는 선행 물증 게이트를 걸지 않는다 — 이현우는 하드게이트(Phase 9)
      // 통과 즉시 락아웃되어 그 이후 대화 자체가 불가능해지므로, 게이트 조건을 만족한 뒤에도
      // 발화 기회가 없는 모순이 생긴다(사용자 확인 완료, 18번 문서 배치2).
      { id: "stmt-motive-disclosure", roundOpen: 3 },
      // stmt-lee-office-visit(결정적 붕괴 트리거)은 Phase 9 하드게이트(카테고리 2개+키워드)로
      // 이미 별도 처리 중이라 이 게이트가 불필요하다(18번 문서 표 참고).
      { id: "stmt-lee-office-visit", roundOpen: 3, isBreakdownTrigger: true },
    ],

    witnessedEvents: [
      { id: "W3", content: "23:05 편의점 방향으로 걸어가는 박서연을 봄" },
    ],

    truthBibleFacts: [
      "19:00 회식 시작",
      "22:00 피해자, 본사와 인사평가 통화 (당신은 이걸 엿들었다)",
      "22:30 당신, 피해자 방 노크",
      "22:45 당신, 관리실 방문 — CCTV 사각지대가 어디인지 문의함",
      "23:00–00:15 박서연 편의점 외출 (당신과 무관)",
      "23:05 편의점 방향으로 걸어가는 박서연을 봄",
      "23:20 정민아 법인카드 영수증 목격 후 귀실 (당신과 무관)",
      "23:30–00:00 CCTV 공백 구간",
      "23:45 산책로에서 피해자와 몸싸움 끝 사망 (당신이 저지름)",
      "06:00 시신 발견",
    ],

    requestableItems: [
      {
        itemLabel: "신발",
        keywords: ["신발", "구두"],
        evidenceId: "ev-shoe-soil-match",
        narrativeResult:
          "신발 흙 성분이 산책로 흙과 완전히 일치함 — 결정적 물증. 처음엔 둘러대려 하지만 성분 분석 결과 자체는 부정할 수 없다",
      },
    ],
  },

  "role-jeong-mina": {
    characterId: "role-jeong-mina",
    displayName: "정민아",
    roleTitle: "사원, 29세",

    motivePublic: "피해자와의 과거 개인적 관계에 대한 정황",
    motiveFull: "김영훈과 과거 연인 관계였으며, 좋지 않게 종료됨.",

    isCulprit: false,
    alibiStatus: "unbreakable",
    breakdownTrigger: null,
    breakdownTriggerKeywords: [],

    knownSecrets: [
      "김영훈과 과거 연인 관계, 좋지 않게 종료됨",
      "팀장(김영훈)의 법인카드 비리를 우연히 목격함 (살인과는 무관한 별개의 비밀)",
      "이현우의 과거 실수(약점)를 알고 있음",
    ],

    statementEvidence: [
      {
        id: "stmt-lee-past-mistake",
        roundOpen: 2,
        requiredEvidenceIds: ["ev-performance-review", "ev-yearbook-sns"],
      },
      { id: "stmt-motive-disclosure", roundOpen: 3 },
    ],

    witnessedEvents: [
      { id: "W2", content: "22:50 복도에서 이현우가 서두르며 나가는 모습을 봄" },
      { id: "W4", content: "23:20 로비에서 박서연과 짧게 마주쳐 인사함" },
    ],

    truthBibleFacts: [
      "19:00 회식 시작",
      "22:50 복도에서 이현우가 서두르며 나가는 모습을 봄",
      "23:20 법인카드 영수증을 우연히 목격 후 귀실 (본인 알리바이 — 이 시간대는 절대 부정해서는 안 됨)",
      "23:20 로비에서 박서연과 짧게 마주쳐 인사함",
      "06:00 시신 발견",
    ],

    requestableItems: [
      {
        itemLabel: "신발",
        keywords: ["신발", "구두"],
        evidenceId: "ev-shoe-jeong",
        narrativeResult:
          "신발에서 최근 세척한 흔적이 발견됨 — 흙 성분은 검출되지 않았으나 왜 신발을 세척했는지는 석연치 않음(실제로는 법인카드 비리를 목격한 뒤 산책로 근처를 서성이다 흙탕물을 밟아 창피해서 몰래 닦은 것뿐, 살인과는 무관)",
      },
    ],
  },
};

export const CHARACTER_LIST: CharacterSheet[] = Object.values(CHARACTERS);

// ---------------------------------------------------------------------------
// 뷰 파생 함수 — visibility 규칙을 코드 레벨로 강제한다 (10번 문서 필수 요구사항).
// ---------------------------------------------------------------------------

/** 게임 중 배역 카드 뷰 — visibility: player, both만 노출. persona_tag는 미노출. */
export interface PlayerCharacterView {
  characterId: CharacterId;
  displayName: string;
  roleTitle: string;
  motivePublic: string;
}

export function getPlayerView(character: CharacterSheet): PlayerCharacterView {
  return {
    characterId: character.characterId,
    displayName: character.displayName,
    roleTitle: character.roleTitle,
    motivePublic: character.motivePublic,
  };
}

/**
 * 결과 화면 뷰 — visibility: player_post_game 필드까지 추가 공개.
 * persona는 캐스팅 결과(런타임 배정)를 인자로 받는다.
 */
export interface ResultScreenCharacterView extends PlayerCharacterView {
  personaTag: string;
  mbtiType: string;
}

export function getResultScreenView(
  character: CharacterSheet,
  persona: { playerTag: string; mbtiType: string }
): ResultScreenCharacterView {
  return {
    ...getPlayerView(character),
    personaTag: persona.playerTag,
    mbtiType: persona.mbtiType,
  };
}

/**
 * 액터 계층 시스템 프롬프트용 뷰 — visibility: ai_only, both만 노출.
 * 이 객체는 절대 API 응답으로 클라이언트에 내려가서는 안 된다
 * (프롬프트 조립 후 서버 내부에서만 소비할 것).
 */
export interface ActorPromptView {
  characterId: CharacterId;
  displayName: string;
  roleTitle: string;
  motiveFull: string;
  isCulprit: boolean;
  alibiStatus: CharacterSheet["alibiStatus"];
  knownSecrets: string[];
  statementEvidence: CharacterSheet["statementEvidence"];
  breakdownTrigger: string | null;
  breakdownTriggerKeywords: string[];
  witnessedEvents: CharacterSheet["witnessedEvents"];
  truthBibleFacts: string[];
  requestableItems: CharacterSheet["requestableItems"];
}

export function getActorPromptView(character: CharacterSheet): ActorPromptView {
  return {
    characterId: character.characterId,
    displayName: character.displayName,
    roleTitle: character.roleTitle,
    motiveFull: character.motiveFull,
    isCulprit: character.isCulprit,
    alibiStatus: character.alibiStatus,
    knownSecrets: character.knownSecrets,
    statementEvidence: character.statementEvidence,
    breakdownTrigger: character.breakdownTrigger,
    breakdownTriggerKeywords: character.breakdownTriggerKeywords,
    witnessedEvents: character.witnessedEvents,
    truthBibleFacts: character.truthBibleFacts,
    requestableItems: character.requestableItems,
  };
}
