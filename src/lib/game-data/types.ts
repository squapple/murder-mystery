// 03_character_sheets.md §2 단일 소스 스키마를 그대로 타입화한다.
// visibility 규칙(player / player_post_game / ai_only / both)은 각 필드 주석과
// characters.ts의 getPlayerView / getActorPromptView 함수에서 코드 레벨로 강제된다.

export type CharacterId =
  | "role-park-seoyeon"
  | "role-lee-hyunwoo"
  | "role-jeong-mina";

export type InterrogationStrategy = "T" | "F";
export type PressureTolerance = "높음" | "낮음";

export interface WitnessedEvent {
  /** 01_truth_bible.md §4-A 교차 목격 진술 ID (W1~W5) */
  id: string;
  content: string;
}

export interface StatementEvidenceRef {
  id: string;
  roundOpen: number;
}

/** 02_persona_design.md §2 8유형 직교설계표 한 행 */
export interface Persona {
  mbtiType: string;
  interrogationStrategy: InterrogationStrategy;
  pressureTolerance: PressureTolerance;
  corneredReaction: string;
  /** 플레이어 공개용 태그 — 정직성 판정 표현 금지, 결과 화면에서만 공개(player_post_game) */
  playerTag: string;
  /**
   * "AI 친구" 컨셉(Phase 27)용 이름 — 결과 화면 뒤풀이(디브리핑)에서 이 이름으로
   * 자기소개하며 소감을 말한다. 게임 중에는 노출되지 않고 player_post_game 시점에만
   * 공개된다(personaTag/mbtiType과 동일한 공개 시점).
   */
  friendName: string;
}

/**
 * 03_character_sheets.md §2 단일 소스 스키마.
 * visibility 태그가 붙은 필드는 아래 주석대로:
 *   both / player / player_post_game / ai_only
 * mbtiType 이하 페르소나 관련 필드는 배역 고정 데이터에는 없고,
 * 캐스팅 연출 단계에서 assignPersona()로 런타임 주입된다 (§5).
 */
export interface CharacterSheet {
  characterId: CharacterId; // both
  displayName: string; // both
  roleTitle: string; // both

  motivePublic: string; // player — 스포일러 없는 동기 요약
  motiveFull: string; // ai_only — 진실 성서 원문 동기 전문

  isCulprit: boolean; // ai_only — 절대 플레이어 뷰에 렌더링 금지
  knownSecrets: string[]; // ai_only
  statementEvidence: StatementEvidenceRef[]; // ai_only
  /**
   * 인내심 시스템(Phase 39) — 이 캐릭터에게 보낸 형사의 메시지가 이 키워드 중 하나라도
   * 포함하면 서버가 결정론적으로 인내심 +1을 매긴다(LLM 판정 아님, patience.ts 참고).
   * 붕괴조건 시스템의 breakdownTriggerKeywords(진범 전용)를 대체 — 이제 3인 전부 동일한
   * 규칙으로, 진범 여부와 무관하게 각자의 동기/사건 관련 키워드를 갖는다.
   */
  patienceKeywords: string[]; // ai_only
  witnessedEvents: WitnessedEvent[]; // ai_only — §4-A 교차 목격 중 본인이 목격자인 것만

  /** 액터 계층 프롬프트에 주입되는 "본인 역할 파트" 진실 성서 발췌 (ai_only) */
  truthBibleFacts: string[];

  /**
   * 심문 중 "이 물품 좀 보여달라"는 자유문 요청에 응답할, 사전 등록된 소지품 목록
   * (ai_only). 원래 신발 전용이었던 걸(shoeInspectionResult) 일반화했다 — 목록에 있는
   * 물품(가방·신발·휴대폰)은 "정당한 수사 요청"으로 취급해 거부 없이 반드시 응하고,
   * evidence.ts의 대응 물증을 해금한다. 목록에 없는 물품(지갑 등 뭐든)을 요청받으면
   * 액터가 페르소나에 맞게 자유롭게 응하거나 거부하되, 실제로 응한 경우에도 그 결과
   * "내용"은 절대 모델이 지어내지 않는다 — 서버가 물품명+고정 문구("특이할 만한 점이
   * 보이지 않는다")로만 조사모드 카드를 생성한다(진실 성서 밖 사실을 새로 만들지
   * 않는다는 원칙 보호).
   */
  requestableItems: RequestableItem[];
}

/** CharacterSheet.requestableItems 항목 하나 — "정당한 수사 요청"으로 반드시 응해야 하는 소지품. */
export interface RequestableItem {
  /** 자유문 인식 실패 시 폴백 키워드 매칭과, 서버의 물품명 대조에 함께 쓰는 라벨 */
  itemLabel: string;
  /** 자유문 인식 보조 키워드 (예: ["신발", "구두"]) */
  keywords: string[];
  /** 해금할 evidence.ts 물증 id */
  evidenceId: string;
  /** 액터가 이 물품을 보여줄 때 대사로 자연스럽게 녹여낼 실제 결과 (내부 정보) */
  narrativeResult: string;
}

/** 게임 시작 시 랜덤 캐스팅 결과: 배역 3개 ↔ 페르소나 8개 중 3개 매핑 */
export interface CastingAssignment {
  characterId: CharacterId;
  persona: Persona;
}
