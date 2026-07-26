// 08_evidence_reference_for_tester.md — 물증 10종 + 진술 증거 5종 = 15종
// (18번 문서 배치2: 박서연 휴대폰 사진첩 추가로 9→10종).
// 조사 모드 UI(proc-investigation, AI 불필요)의 데이터 소스.
// 여기 없는 단서를 임의로 추가하지 않는다 (10번 문서 "하지 말 것").
//
// Phase 35 — 실전 리뷰 피드백: 카드마다 "클릭 전 카드 면에 보이는 정보량"이
// 들쭉날쭉했다("사망추정시각"처럼 짧은 headline + 클릭 시 상세가 이상적인 카드가
// 있는가 하면, "법인카드 내역"처럼 결론까지 카드 면에 그대로 노출된 카드도 있었다).
// 전체 카드를 "카드 면 = 짧은 headline, 클릭 = 서사가 살아있는 상세"로 통일했다.
// 진술 증거(다른 팀원의 증언)도 같은 원칙으로 손봤다 — 카드 제목 자체를 정보원을
// 가리키는 익명 라벨("팀원 A의 증언" 류)로 바꾸고, 실제 내용은 상세보기로 옮겼다.

export type EvidenceCategory = "physical" | "statement";

export type RevealTiming =
  | "round1_base" // 1R 기본공개
  | "round1_end" // 1R 종료
  | "round2_end" // 2R 종료
  | "round3_open" // 3R 개방
  | "action_triggered"; // 라운드와 무관, 심문 중 특정 행동(예: 신발 요청)으로만 해금

export interface EvidenceItem {
  id: string;
  category: EvidenceCategory;
  name: string;
  revealedFact: string;
  revealTiming: RevealTiming;
  /** 다른 물증을 먼저 확보해야 조사 모드에서 클릭 가능해지는 경우 (물증→물증 게이트) */
  requiresEvidenceId?: string;
  /** 결정적 붕괴 트리거를 구성하는 증거인지 */
  isBreakdownTrigger?: boolean;
  /**
   * 진범 붕괴 조건의 3개 독립 카테고리(A=CCTV, B=신발흙 대조, C=진술) 중 어디에 속하는지.
   * 서버가 collectedEvidenceIds로부터 "카테고리 2개 이상 확보" 여부를 결정론적으로 계산하기 위한 태그.
   * stmt-lee-office-visit(트리거 질문 자체)에는 붙이지 않는다 — 카테고리가 아니라 키워드 매칭 대상이므로.
   */
  breakdownCategory?: "A" | "B" | "C";
  /**
   * Phase 38 — "증거 수집" 채점 대상 여부를 명시적으로 표시한다. 실전 피드백: 라운드만
   *되면 자동으로 뜨는 물증/진술 증거를 그냥 클릭하는 것만으로 점수가 다 채워져서,
   * 심문 한 번 없이 오답을 지목해도 A등급이 나오는 문제가 있었다. "심문으로 직접
   * 요구해서 찾아낸" action_triggered 증거 중에서도, 사건 해결에 실제로 의미 있는
   * 것만 채점 대상으로 삼는다(예: 이현우 신발의 흙 성분=의미있음, 박서연/정민아
   * 신발처럼 "사건과 무관"으로 판명되는 것=의미없음). 생략 시 false로 취급 —
   * scoring.ts의 SCORING_EVIDENCE가 이 필드를 기준으로 채점 대상을 정한다.
   */
  scorable?: boolean;
  /**
   * 조사 모드에서 카드를 클릭했을 때 확대 표시되는 상세 설명. Phase 35부터는 사실상
   * 모든 항목에 채워져 있다 — revealedFact(카드 면)는 짧은 headline, detail은 실제
   * 서사가 담긴 상세로 역할을 분리했다.
   */
  detail?: string;
}

export const EVIDENCE: EvidenceItem[] = [
  {
    id: "ev-soil-analysis",
    category: "physical",
    name: "현장 흙 감식",
    revealedFact: "사건 현장(산책로) 흙 성분 특정",
    detail:
      "산책로 특정 구간의 흙에서 주변 지역과 구별되는 독특한 광물 성분비가 검출됐다 — 이후 신발 흙 대조의 기준 시료가 된다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-time-of-death",
    category: "physical",
    name: "사망추정시각",
    revealedFact: "23:45경 사망",
    // Phase 30: 살해도구(돌) 서브플롯 추가하며 "흉기 없음, 그냥 넘어져서 다침"이던
    // 기존 소견을 "둔기로 추정되는 물체에 가격당함"으로 수정 — 몸싸움 중 우발적으로
    // 근처 물건을 집어든 것이지 미리 흉기를 준비한 게 아니므로, "계획적 살인이 아니다"
    // 라는 이야기의 큰 틀은 그대로 유지된다.
    detail:
      "부검 소견: 목과 어깨 부위에 다발성 타박상, 뒤통수에 둔기에 의한 것으로 보이는 열상 확인. 자상은 발견되지 않았다 — 몸싸움 중 단순히 넘어져 생긴 손상이라기엔 상처 형태가 지나치게 일정해, 돌이나 각진 물체 같은 둔기로 가격당했을 가능성이 유력하다. 직접 사인은 두부 외상. 위 내용물 소화 정도를 근거로 사망 추정 시각은 23:45경으로 특정됐다. 흉기 자체는 현장에서 발견되지 않았다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-cctv-gap",
    category: "physical",
    name: "CCTV 공백",
    revealedFact: "23:30~00:00 CCTV 공백 구간 존재",
    detail:
      "산책로 진입로 CCTV가 23:30부터 00:00까지 정확히 30분간 녹화되지 않았다. 단순 고장이라기엔 공백 구간이 지나치게 깔끔해, 인위적 조작 가능성이 의심된다.",
    revealTiming: "round1_base",
    breakdownCategory: "A",
  },
  {
    // 실전 피드백(사용자 제안): 캐스팅 화면의 동기 태그를 줄이는 대신, "이번 워크숍이
    // 곧 승진 심사에 반영되는 인사평가 마지막 자리였다"는 팀 전체에 걸리는 배경
    // 사실을 조사 모드 물증으로 옮겼다.
    id: "ev-workshop-purpose",
    category: "physical",
    name: "워크숍 취지 안내문",
    revealedFact: "이번 워크숍이 인사평가 마무리 자리라는 안내문 발견",
    detail:
      "인사팀이 사전에 배포한 워크숍 안내문. 이번 1박 2일 워크숍이 이번 분기 인사평가의 마지막 관찰 기간이며, 여기서의 태도와 성과가 다가오는 승진 심사에 직접 반영된다고 명시돼 있다 — 마케팅팀 전체가 은근히 신경을 곤두세우고 있었을 만한 자리였다는 뜻이다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-corporate-card",
    category: "physical",
    name: "법인카드 내역",
    // 실전 피드백: "정민아 관련 비리 정황"이라는 문구가 정민아 본인이 비리를 저지른
    // 것처럼 읽혀 오해를 샀다. 실제로는 피해자(김영훈) 본인의 오남용이고 정민아는
    // 그걸 우연히 목격한 입장(characters.ts 정민아 knownSecrets 참고) — 그 당사자
    // 클리어는 이제 카드 면이 아니라 상세보기에서 밝힌다.
    revealedFact: "법인카드 오남용 정황 포착",
    detail:
      "법인카드 사용 내역에서 오남용 정황이 발견됐다. 사용 당사자는 피해자 김영훈 본인이며, 정민아는 이를 우연히 목격한 것으로 보인다 — 이현우와는 직접적인 관련이 없다.",
    revealTiming: "round1_end",
  },
  {
    id: "ev-convenience-store-receipt",
    category: "physical",
    name: "편의점 영수증",
    revealedFact: "박서연 외출 기록 확인",
    detail:
      "박서연이 23:00부터 00:15까지 편의점을 다녀왔다는 영수증이 확인됐다 — 박서연의 알리바이를 뒷받침하는 물증이다.",
    revealTiming: "round1_end",
  },
  {
    id: "ev-deleted-call-recovery",
    category: "physical",
    name: "통화/삭제문자 복구",
    revealedFact: "피해자의 삭제된 통화 기록 복구",
    // Phase 37: "인사평가와 관련된 통화"라고만 되어 있어 이현우의 동기와 연결이
    // 안 됐다는 지적 — 통화 내용이 구체적으로 이현우의 인사평가였다고 명시했다.
    detail:
      "피해자 김영훈의 휴대폰에서 22:00경 본사와 나눈 통화 기록이 복구됐다 — 이현우의 이번 분기 인사평가에 대해 논의한 통화였던 것으로 보인다.",
    revealTiming: "round1_end",
  },
  {
    id: "ev-performance-review",
    category: "physical",
    name: "인사평가서",
    revealedFact: "이현우 차장",
    detail:
      "이현우 차장 — 성과는 있으나 팀장(김영훈) 평가에서 최저 평가를 받아 승진 대상에서 제외됨.",
    revealTiming: "round2_end",
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
    id: "ev-shoe-soil-match",
    category: "physical",
    name: "신발흙 대조",
    // 실전 피드백: "= 일치"라는 단정적 문구가 얻는 즉시 "범인 확정" 도장처럼 읽혀서,
    // 그 뒤로는 추리가 아니라 확인 사살이 된다는 지적을 받았다. 여전히 강력한
    // 정황 증거이되 단정을 피해 여지를 남겼다 — 캐릭터 연기 지침(characters.ts
    // requestableItems.narrativeResult)에는 "완전히 일치, 결정적 물증"이라는 내부
    // 진실이 그대로 남아있으므로 붕괴 조건 판정 등 게임 로직에는 영향 없다.
    revealedFact: "이현우 신발에서 흙 성분 검출",
    detail: "이현우 신발 흙 성분이 산책로 흙과 매우 유사하다 — 같은 계열의 흙으로 보인다.",
    // 조사 보드 클릭이 아니라 심문 중 "신발을 보여달라"는 행동 요청으로만 해금된다
    // (10_claude_code_handoff.md 후속 피드백 — 실제 요청 행위 없이 라운드만 지나면
    // 자동 공개되던 걸 없애 몰입감을 높였다).
    revealTiming: "action_triggered",
    isBreakdownTrigger: true,
    breakdownCategory: "B",
    // Phase 38: 진범을 실제로 특정하는 결정적 물증이라 "증거 수집" 채점 대상.
    scorable: true,
  },
  {
    // Phase 38: "사건과 무관"으로 결론 나는 함정성 요청 결과라 증거 수집 점수에는
    // 반영하지 않는다(scorable 생략=false) — 여전히 클릭해서 확보/열람은 가능하다.
    id: "ev-shoe-park",
    category: "physical",
    name: "박서연 신발 확인",
    revealedFact: "박서연 신발 확인 — 흙 반응 없음",
    detail: "최근에 새로 산 신발이라 흙이 묻어있지 않다 — 사건과 무관한 것으로 보인다.",
    revealTiming: "action_triggered",
  },
  {
    // Phase 38: 의심스러운 정황이긴 하지만 사건 해결에 결정적으로 쓰이진 않는
    // 미해결 떡밥이라 증거 수집 점수에는 반영하지 않는다(scorable 생략=false).
    id: "ev-shoe-jeong",
    category: "physical",
    name: "정민아 신발 확인",
    revealedFact: "정민아 신발 확인 — 세척 흔적 발견",
    detail:
      "신발에서 최근 세척한 흔적이 발견됐다. 흙 성분은 나오지 않았지만, 왜 하필 지금 세척했는지는 석연치 않다.",
    revealTiming: "action_triggered",
  },
  {
    // Phase 37: 라운드만 되면 요청 여부와 무관하게 자동으로 뜨던 걸, 신발과 동일하게
    // "심문 중 실제로 휴대폰을 보여달라고 요청했을 때만" 해금되는 구조로 바꿨다
    // (사용자 지적: 3라운드에 그냥 해금되는 게 아니라 요청이 선행돼야 한다).
    // characters.ts 박서연 requestableItems의 "휴대폰" 항목과 짝지어져 있다.
    // Phase 38: 살인 사건 자체와는 무관한 서브플롯(정민아-김영훈 관계 정황)이라
    // 증거 수집 점수에는 반영하지 않는다(scorable 생략=false).
    id: "ev-park-phone-photos",
    category: "physical",
    name: "박서연 휴대폰 사진첩",
    revealedFact: "박서연 휴대폰에서 수상한 사진 발견",
    detail: "정민아와 김영훈이 손을 잡거나 다정한 모습을 몰래 찍어둔 사진이 한 장 발견됐다.",
    revealTiming: "action_triggered",
  },
  {
    // Phase 30: 살해도구 서브플롯. 3라운드에 개방되는 결정적 물증이지만, 이것 하나만으로는
    // 진범을 특정하지 못한다 — 발견 장소(박서연 베란다)만 보면 오히려 박서연이 범인처럼
    // 보이는 함정 단서다. 이현우를 특정하려면 "이현우 숙소가 박서연 숙소 바로 위층"이라는
    // 위치 관계를 심문 대화만으로 캐내야 한다(사용자 지침: 조사 보드 물증 카드로 만들지
    // 않고 심문 전용 단서로 남긴다 — 답을 그냥 공개하는 꼴이 되지 않도록). 그래서 이
    // 항목엔 breakdownCategory를 붙이지 않았다(단독으로 결정타가 되면 안 되므로).
    id: "ev-murder-weapon",
    category: "physical",
    name: "살해도구(돌)",
    revealedFact: "박서연 방 베란다에서 살해도구로 추정되는 돌 발견",
    detail:
      "박서연 숙소(202호) 베란다 화분 뒤에서 주먹만 한 돌 하나가 발견됐다. 표면에 남은 혈흔을 감식한 결과 피해자 김영훈의 혈액형 및 DNA와 일치했다 — 산책로에 흔한 종류의 돌로, 원래 그 자리에 있던 것이 아니라 누군가 옮겨다 놓은 것으로 보인다.",
    revealTiming: "round3_open",
  },
  {
    // Phase 35: 카드 제목을 "박서연 다툼 이유"처럼 결론을 미리 알려주는 라벨 대신,
    // 정보원을 가리키는 익명 라벨로 바꿨다 — 카드 면(revealedFact)만 봐서는 누구 얘기인지
    // 알 수 없고, 클릭해야 실제 내용이 드러난다. name과 revealedFact를 동일한 문구로
    // 중복 노출하지 않도록 revealedFact는 짧은 화제 힌트로 따로 뒀다.
    // Phase 37: "성과를 둘러싼 갈등"이라는 문구가 너무 두루뭉술해서 박서연의 실제
    // 동기(김영훈이 그녀의 성과를 자기 것처럼 보고했다는 것)를 찾아볼 수 없다는
    // 지적 — 가로채기 구도를 명확히 드러내도록 detail을 구체화했다.
    id: "stmt-park-dispute-reason",
    category: "statement",
    name: "팀원 A의 증언",
    revealedFact: "성과 문제에 대한 이야기",
    detail:
      "박서연이 진행했던 프로젝트 성과를 팀장 김영훈이 마치 자기 성과인 것처럼 보고했다는 이야기가 있다 — 박서연은 이 일로 팀장에게 깊은 불만을 갖고 있었다고 한다.",
    revealTiming: "round1_end",
  },
  {
    // Phase 35: 사용자가 제시한 예시 문구를 그대로 쓰면 characters.ts에 이미 정의된
    // 박서연-이현우 갈등의 원인(성과 가로채기 — 박서연이 자기 성과를 이현우에게
    // 빼앗겼다고 믿는 쪽)과 충돌해서, 그 원형(성과 가로채기)과 모순되지 않도록
    // "정민아가 알고 있는 이현우의 과거 실수"는 구체적인 내용을 확정하지 않고
    // 여지를 남기는 쪽으로 조정했다 — characters.ts 정민아 knownSecrets에도 이
    // 실수의 구체적 내용은 정의돼 있지 않다("이현우의 과거 실수(약점)를 알고 있음").
    id: "stmt-lee-past-mistake",
    category: "statement",
    name: "팀원 B의 증언",
    revealedFact: "이현우의 과거에 대한 이야기",
    detail:
      "정민아는 이현우에게 예전 직장에서 있었던 실수, 그러니까 약점이 될 만한 일이 있다는 걸 알고 있다고 말했다 — 다만 정확히 무슨 일이었는지는 끝내 밝히지 않았다.",
    revealTiming: "round2_end",
    breakdownCategory: "C",
  },
  {
    id: "stmt-lee-park-grudge",
    category: "statement",
    name: "팀원 C의 증언",
    revealedFact: "인턴 시절 있었던 일",
    detail:
      "예전 회사에서 박서연이 이현우의 인턴이었던 시절이 있었고, 그때 있었던 성과 문제로 박서연이 이현우에게 안 좋은 감정을 품고 있다는 이야기가 있다.",
    revealTiming: "round2_end",
    breakdownCategory: "C",
  },
  {
    id: "stmt-motive-disclosure",
    category: "statement",
    name: "인사팀원 A의 증언",
    revealedFact: "인사평가에 대한 이야기",
    detail:
      "최근 박서연, 이현우, 정민아가 인사평가에 대해 큰 압박감을 느끼고 있었다고 한다. 인사평가에는 김영훈 팀장의 최종평가가 제일 중요하다.",
    revealTiming: "round3_open",
    breakdownCategory: "C",
  },
  {
    id: "stmt-lee-office-visit",
    category: "statement",
    name: "관리실 직원의 증언",
    revealedFact: "그날 밤 방문자에 대한 이야기",
    detail: "그날 밤 이현우가 관리실에 들러 무언가를 물어보고 갔다는 증언이 나왔다.",
    revealTiming: "round3_open",
    isBreakdownTrigger: true,
  },
];

export function getEvidenceById(id: string): EvidenceItem | undefined {
  return EVIDENCE.find((e) => e.id === id);
}

/**
 * 현재 플레이 중인 라운드(1~3) 기준으로 조사 모드에 공개되는 증거 목록.
 * "종료" 태그(round1_end, round2_end)는 직전 라운드가 끝나며 공개되어 다음 라운드부터
 * 사용 가능해지고, "개방" 태그(round3_open)는 라운드3 자체에서 즉시 공개된다
 * (08_evidence_reference_for_tester.md §사용 팁의 라운드별 실사용 가이드 기준).
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
