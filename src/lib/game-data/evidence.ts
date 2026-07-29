// 08_evidence_reference_for_tester.md — 물증/진술 증거 데이터.
// 조사 모드 UI(proc-investigation, AI 불필요)의 데이터 소스.
// 여기 없는 단서를 임의로 추가하지 않는다 (10번 문서 "하지 말 것").
//
// Phase 39 — 스토리라인 대규모 개편. 붕괴조건 시스템(A/B/C 카테고리, isBreakdownTrigger)을
// 완전히 폐지하면서 관련 필드를 전부 제거했고, 살해도구가 돌→흉기(등산용 칼)+베란다 끈
// 트릭으로 바뀌며 신발 관련 물증 전부(ev-shoe-*)와 그 근거였던 현장 흙 감식(ev-soil-analysis)을
// 삭제했다. 관리실 서브플롯(stmt-lee-office-visit)도 삭제. 대신 방 배정표·베란다 흔적·
// 흉기(칼)·가방 조사 결과가 새로 들어왔다. 이현우·정민아의 동기가 완전히 재설계되며
// 관련 동기 공개 물증/진술도 새로 썼다(truth-bible.ts Phase 39 이력 참고).
//
// **결정적 연결고리(방 배정 → 위치 관계 → 베란다 끈 트릭)를 설명하거나 암시하는 문구를
// 어떤 카드에도 넣지 않는다** — 사용자 명시적 지시("절대 하지 말 것"). 방 배정표는
// 숫자만, 베란다 흔적은 사실만, 흉기는 발견 경위만 서술하고, "그래서 범인이 누구다"로
// 이어지는 해석은 카드 어디에도 적지 않는다. 플레이어가 스스로 조합해야 한다.

export type EvidenceCategory = "physical" | "statement";

export type RevealTiming =
  | "round1_base" // 1R 기본공개
  | "round1_end" // 1R 종료
  | "round2_end" // 2R 종료
  | "round3_open" // 3R 개방
  | "action_triggered"; // 라운드와 무관, 심문 중 특정 행동(예: 가방 확인 요청)으로만 해금

export interface EvidenceItem {
  id: string;
  category: EvidenceCategory;
  name: string;
  revealedFact: string;
  revealTiming: RevealTiming;
  /** 다른 물증을 먼저 확보해야 조사 모드에서 클릭 가능해지는 경우 (물증→물증 게이트) */
  requiresEvidenceId?: string;
  /**
   * Phase 38 — "증거 수집" 채점 대상 여부를 명시적으로 표시한다. 라운드만 되면 자동으로
   * 뜨는 물증/진술 증거를 그냥 클릭하는 것만으로 점수가 다 채워지는 문제가 있었다.
   * "심문으로 직접 요구해서 찾아낸"(action_triggered) 증거 중에서도, 사건 해결에 실제로
   * 의미 있는 것만 채점 대상으로 삼는다. 생략 시 false로 취급 — scoring.ts의
   * SCORING_EVIDENCE가 이 필드를 기준으로 채점 대상을 정한다.
   */
  scorable?: boolean;
  /**
   * 조사 모드에서 카드를 클릭했을 때 확대 표시되는 상세 설명. revealedFact(카드 면)는
   * 짧은 headline, detail은 실제 서사가 담긴 상세로 역할을 분리했다(Phase 35).
   */
  detail?: string;
}

export const EVIDENCE: EvidenceItem[] = [
  {
    id: "ev-time-of-death",
    category: "physical",
    name: "사망추정시각",
    revealedFact: "21:45경 사망",
    detail:
      "부검 소견: 어깨와 옆구리 부위에 예리한 흉기에 의한 자상 다수 확인. 급소를 정확히 노린 상처는 아니며, 몸싸움 중 여러 차례 팔이 스치듯 부딪힌 흔적과 일치한다 — 계획적으로 급소를 노렸다기보다는, 몸싸움 도중 우발적으로 벌어진 상해로 추정된다. 직접 사인은 과다출혈. 위 내용물 소화 정도를 근거로 사망 추정 시각은 21:45경으로 특정됐다. 흉기 자체는 현장에서 발견되지 않았다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-workshop-purpose",
    category: "physical",
    name: "워크숍 취지 안내문",
    revealedFact: "이번 워크숍이 인사평가 마무리 자리라는 안내문 발견",
    detail:
      "인사팀이 사전에 배포한 워크숍 안내문. 이번 1박 2일 워크숍이 이번 분기 인사평가의 마지막 관찰 기간이며, 여기서의 태도와 성과가 다가오는 승진 심사에 직접 반영된다고 명시돼 있다 — 마케팅팀 전체가 은근히 신경을 곤두세우고 있었을 만한 자리였다는 뜻이다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-cctv-gap",
    category: "physical",
    name: "CCTV 공백",
    revealedFact: "21:30~22:00 CCTV 공백 구간 존재",
    // Phase 39: 관리실 서브플롯(누군가 CCTV를 조작하려 했다는 설정)을 삭제하고,
    // "그 시간대엔 다들 흩어져 있어 서로를 못 봤다"는 세 사람 공통의 평범한 사실로
    // 격하했다 — 더 이상 누구 하나를 특정하는 단서가 아니다.
    detail:
      "산책로 진입로 CCTV가 21:30부터 22:00까지 정확히 30분간 녹화되지 않았다. 다만 그 시간대엔 참가자 대부분이 각자 숙소나 산책로 근처에 흩어져 있었을 시간이라, 단순 정전이나 설비 문제일 가능성도 배제할 수 없다 — 이 공백 자체는 세 사람 모두에게 공통으로 해당하는 정황일 뿐, 누구 하나를 가리키는 결정적 단서는 아니다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-room-assignment",
    category: "physical",
    name: "숙소 배정표",
    revealedFact: "참가자별 숙소 호수 확인",
    detail: "박서연 202호, 정민아 203호, 이현우 302호 — 워크숍 기간 배정된 개인 숙소 목록이다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-corporate-card",
    category: "physical",
    name: "법인카드 내역",
    revealedFact: "법인카드 오남용 정황 포착",
    detail:
      "법인카드 사용 내역에서 오남용 정황이 발견됐다. 사용 당사자는 피해자 김영훈 본인이며, 정민아는 이를 우연히 목격한 것으로 보인다 — 살인 사건 자체와는 무관한 별개의 정황이다.",
    revealTiming: "round1_end",
  },
  {
    id: "ev-convenience-store-receipt",
    category: "physical",
    name: "편의점 영수증",
    // Phase 39: 예전엔 이 영수증 한 장으로 박서연의 알리바이가 통째로 성립됐다 — 이제는
    // 아무도 완전한 알리바이를 갖지 않도록, 결제 시각 하나만 증명하고 나머지 공백은
    // 여전히 증명되지 않는 형태로 다시 썼다.
    revealedFact: "박서연 편의점 결제 기록 확인",
    detail:
      "박서연이 21:05경 편의점에서 결제한 기록이 확인됐다 — 그 시간에 편의점에 있었다는 것만 증명할 뿐, 편의점에서 숙소까지는 걸어서 10분 남짓이라 이 영수증만으로 21:45 전후 행적까지 증명되지는 않는다.",
    revealTiming: "round1_end",
  },
  {
    id: "ev-yearbook-sns",
    category: "physical",
    name: "회사 행사 사진(SNS)",
    revealedFact: "예전 회사 행사 사진 발견",
    detail:
      "예전 회사 행사 사진(SNS 태그)에서 박서연과 이현우가 같은 자리에 있었던 것이 발견됐다 — 인턴-사수로 함께 일했던 시절이다.",
    revealTiming: "round2_end",
  },
  {
    id: "stmt-park-dispute-reason",
    category: "statement",
    name: "팀원 A의 증언",
    revealedFact: "성과 문제에 대한 이야기",
    detail:
      "박서연이 지난 몇 년간 진행했던 프로젝트 성과를 팀장 김영훈이 반복적으로 자기 성과인 것처럼 보고해 왔다는 이야기가 있다 — 박서연은 정당한 평가·승진 기회를 여러 차례 놓쳤고, 이 일로 팀장에게 깊은 불만을 갖고 있었다고 한다.",
    revealTiming: "round2_end",
  },
  {
    id: "stmt-lee-park-grudge",
    category: "statement",
    name: "팀원 B의 증언",
    revealedFact: "인턴 시절 있었던 일",
    detail:
      "예전 회사에서 박서연이 이현우의 인턴이었던 시절이 있었고, 그때 있었던 성과 문제로 박서연이 이현우에게 안 좋은 감정을 품고 있다는 이야기가 있다.",
    revealTiming: "round2_end",
  },
  {
    // Phase 39: 이현우의 새 동기(가족사 기반 원한)를 공개하는 신규 진술 증거.
    // 확정된 사실이 아니라 "그런 소문/정황이 있다"는 수준으로만 서술해, 진위를
    // 게임이 판정하지 않는다 — 박서연-이현우 갈등과 동일한 패턴.
    id: "stmt-lee-family-history",
    category: "statement",
    name: "전 직장 동료의 증언",
    revealedFact: "이현우의 가족사에 대한 이야기",
    detail:
      "이현우에게 여동생이 있었고, 예전에 피해자 김영훈과 결혼했었다는 걸 아는 사람이 있다. 그런데 결혼 후 얼마 안 가 여동생이 세상을 떠났고, 자살로 처리됐다는 이야기가 있다 — 사망보험금이나 이후 김영훈의 재혼이 유독 빨랐다는 정황도 함께 도는데, 전부 확인된 사실은 아니고 소문 수준이다. 이현우 본인이 이 일을 어떻게 받아들이고 있는지는 알려져 있지 않다.",
    revealTiming: "round2_end",
  },
  {
    // Phase 39: 정민아의 새 동기(김영훈과의 파혼/유산 서브플롯)를 공개하는 신규 진술
    // 증거. 구체적 장면 묘사 없이 "그런 일이 있었다" 수준으로만 서술한다(사용자 명시).
    id: "stmt-jeong-breakup-reason",
    category: "statement",
    name: "팀원 C의 증언",
    revealedFact: "정민아의 예전 연애에 대한 이야기",
    detail:
      "정민아가 예전에 피해자 김영훈과 연인 관계였다는 걸 아는 사람이 있다 — 결혼까지 이야기가 오갔다고 하는데, 좋지 않게 끝났다고 한다. 정확히 무슨 일이 있었는지까지는 아는 사람이 없다.",
    revealTiming: "round2_end",
  },
  {
    // Phase 39: 이현우가 워크숍 장소·일정과 방 배정을 직접 기획·추진했다는 사실 —
    // 위 ev-room-assignment(숙소 배정표)와 시기를 떨어뜨려 배치해, 두 정보를 플레이어가
    // 스스로 연결해야만 의미가 생기도록 했다. 이 카드 자체는 그 연결을 설명하지 않는다.
    id: "stmt-lee-workshop-planner",
    category: "statement",
    name: "팀원 D의 증언",
    revealedFact: "워크숍 준비 과정에 대한 이야기",
    detail:
      "이번 워크숍 장소 예약과 숙소 배정을 이현우가 직접 맡아 진행했다는 이야기가 있다.",
    revealTiming: "round2_end",
  },
  {
    // Phase 39: 살해도구 서브플롯 신버전 — 돌 대신 등산용 칼. 발견 장소(박서연 베란다)만
    // 보면 오히려 박서연이 범인처럼 보이는 함정 단서인 것은 기존과 동일하게 유지한다.
    // 손잡이의 스트랩 구멍은 사실만 서술하고, 그 용도(끈을 꿰어 위층에서 내려보내는
    // 트릭)는 어디에도 설명하지 않는다.
    id: "ev-murder-weapon-knife",
    category: "physical",
    name: "흉기(등산용 칼)",
    revealedFact: "박서연 방 베란다에서 흉기로 추정되는 칼 발견",
    detail:
      "박서연 숙소(202호) 베란다 화분 뒤에서 등산·캠핑용으로 보이는 칼 한 자루가 발견됐다. 손잡이 끝에 스트랩을 걸 수 있는 작은 구멍이 나 있다. 표면에 남은 혈흔을 감식한 결과 피해자 김영훈의 혈액형 및 DNA와 일치했다 — 원래 그 자리에 있던 물건이 아니라, 누군가 옮겨다 놓은 것으로 보인다.",
    revealTiming: "round3_open",
  },
  {
    // Phase 39: 이현우 방 베란다 난간의 물리적 흔적 — 이것도 사실만 서술하고 해석은
    // 하지 않는다.
    id: "ev-balcony-strap-marks",
    category: "physical",
    name: "베란다 난간 흔적",
    revealedFact: "이현우 방 베란다 난간에서 마찰 흔적 발견",
    detail:
      "이현우 숙소(302호) 베란다 난간에서 미세한 마찰 흔적이 발견됐다 — 끈이나 로프 같은 가늘고 긴 물체가 여러 번 스친 자국으로 보인다. 언제, 왜 생긴 흔적인지는 확인되지 않았다.",
    revealTiming: "round3_open",
  },
  {
    // 가방 조사(Phase 39 신규 메커니즘) — 3인 전원, 심문 중 "가방 좀 보여달라" 자유문
    // 요청으로만 해금된다(round-review가 처리, characters.ts requestableItems 참고).
    // 등산장비가 나와도 특별해 보이지 않도록, 다른 캐릭터의 잡담 소재로 "이현우가 원래
    // 등산이 취미"라는 정보를 자연스럽게 흘려둔다(characters.ts 참고) — "얘 가방에서
    // 등산장비가 나왔다=범인이다"라는 메타 추론을 막기 위한 위장.
    id: "ev-bag-lee",
    category: "physical",
    name: "이현우 가방 확인",
    revealedFact: "이현우 가방 내용물 확인",
    detail:
      "로프, 카라비너 2개, 접이식 등산스틱, 헤드랜턴 — 그 외 세면도구, 여벌 와이셔츠, 상비약, 충전기 등 평범한 소지품들이 들어 있다.",
    revealTiming: "action_triggered",
    // Phase 39: 심문으로 요구해서 찾아낸 것 중 사건 해결에 실제로 의미 있는 항목이라
    // "증거 수집" 채점 대상으로 삼는다(Phase 38 원칙 계승) — 옛 ev-shoe-soil-match의
    // 자리를 잇는다.
    scorable: true,
  },
  {
    id: "ev-bag-park",
    category: "physical",
    name: "박서연 가방 확인",
    revealedFact: "박서연 가방 내용물 확인",
    detail: "화장품 파우치, 보조배터리, 여벌 옷, 개인 수첩, 편의점 영수증 등이 들어 있다.",
    revealTiming: "action_triggered",
  },
  {
    id: "ev-bag-jeong",
    category: "physical",
    name: "정민아 가방 확인",
    revealedFact: "정민아 가방 내용물 확인",
    detail: "업무 수첩, 이어폰, 핸드크림, 두통약 등이 들어 있다.",
    revealTiming: "action_triggered",
  },
];

export function getEvidenceById(id: string): EvidenceItem | undefined {
  return EVIDENCE.find((e) => e.id === id);
}

/**
 * 현재 플레이 중인 라운드(1~3) 기준으로 조사 모드에 공개되는 증거 목록.
 * "종료" 태그(round1_end, round2_end)는 직전 라운드가 끝나며 공개되어 다음 라운드부터
 * 사용 가능해지고, "개방" 태그(round3_open)는 라운드3 자체에서 즉시 공개된다.
 */
export function getAvailableEvidenceForRound(round: number): EvidenceItem[] {
  const allowed: Set<RevealTiming> =
    round <= 1
      ? new Set(["round1_base"])
      : round === 2
        ? new Set(["round1_base", "round1_end"])
        : new Set(["round1_base", "round1_end", "round2_end", "round3_open"]);
  return EVIDENCE.filter((e) => allowed.has(e.revealTiming));
}
