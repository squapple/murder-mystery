// 03_character_sheets.md §2 단일 소스 스키마를 그대로 타입화한다.
// visibility 규칙(player / player_post_game / ai_only / both)은 각 필드 주석과
// characters.ts의 getPlayerView / getActorPromptView 함수에서 코드 레벨로 강제된다.

export type CharacterId =
  | "role-park-seoyeon"
  | "role-lee-hyunwoo"
  | "role-jeong-mina";

export type InterrogationStrategy = "T" | "F";
export type PressureTolerance = "높음" | "낮음";
export type AlibiStatus = "unbreakable" | "breakable";

export interface WitnessedEvent {
  /** 01_truth_bible.md §4-A 교차 목격 진술 ID (W1~W5) */
  id: string;
  content: string;
}

export interface StatementEvidenceRef {
  id: string;
  roundOpen: number;
  isBreakdownTrigger?: boolean;
  /**
   * 선행 물증 게이트(18번 문서) — 이 목록 중 하나라도 collectedEvidenceIds에 있어야만
   * 액터가 이 진술 화제를 스스로 밝힐 수 있다. 비워두면(또는 생략하면) 기존처럼
   * roundOpen 기준만 적용된다(게이트 없음). "라운드가 됐으니" 대신 "관련 물증을 실제로
   * 들이밀었으니"를 조건으로 삼아, 형사가 라운드를 앞질러 정곡을 찌르는 질문을 던져도
   * 조기 실토가 나오지 않도록 한다.
   */
  requiredEvidenceIds?: string[];
}

/** 02_persona_design.md §2 8유형 직교설계표 한 행 */
export interface Persona {
  mbtiType: string;
  interrogationStrategy: InterrogationStrategy;
  pressureTolerance: PressureTolerance;
  corneredReaction: string;
  /** 플레이어 공개용 태그 — 정직성 판정 표현 금지, 결과 화면에서만 공개(player_post_game) */
  playerTag: string;
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
  alibiStatus: AlibiStatus; // ai_only — fair-play 가드레일 핵심 플래그
  knownSecrets: string[]; // ai_only
  statementEvidence: StatementEvidenceRef[]; // ai_only
  breakdownTrigger: string | null; // ai_only — 이현우만 값 존재
  /**
   * 붕괴 트리거 질문을 서버가 텍스트로 감지하기 위한 키워드 목록 (ai_only, 이현우만 값 존재).
   * LLM 판정에 의존하지 않고 "카테고리 2개 이상 확보 + 이 키워드가 형사 메시지에 등장"을
   * 서버가 결정론적으로 계산해, 진범 락아웃이 절대 조기에 걸리지 않도록 하는 하드 게이트다.
   */
  breakdownTriggerKeywords: string[];
  witnessedEvents: WitnessedEvent[]; // ai_only — §4-A 교차 목격 중 본인이 목격자인 것만

  /** 액터 계층 프롬프트에 주입되는 "본인 역할 파트" 진실 성서 발췌 (ai_only) */
  truthBibleFacts: string[];

  /**
   * "신발 요청" 행동 증거의 실제 결과 (ai_only). 형사가 대화 중 신발을 보여달라고
   * 요청하면(자유문 인식) 이 결과가 대사로 자연스럽게 드러난다. evidence.ts의
   * 대응 물증(예: ev-shoe-soil-match)과 짝을 이룬다.
   */
  shoeInspectionResult: string;
}

/** 게임 시작 시 랜덤 캐스팅 결과: 배역 3개 ↔ 페르소나 8개 중 3개 매핑 */
export interface CastingAssignment {
  characterId: CharacterId;
  persona: Persona;
}
