// 08_evidence_reference_for_tester.md — 물증 10종 + 진술 증거 5종 = 15종
// (18번 문서 배치2: 박서연 휴대폰 사진첩 추가로 9→10종).
// 조사 모드 UI(proc-investigation, AI 불필요)의 데이터 소스.
// 여기 없는 단서를 임의로 추가하지 않는다 (10번 문서 "하지 말 것").

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
   * 조사 모드에서 카드를 클릭했을 때 확대 표시되는 상세 설명 (플레이어 실전 피드백 반영).
   * 생략 시 revealedFact를 그대로 확대 표시에 사용한다 — 모든 항목에 강제할 필요는 없다.
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
    detail:
      "부검 소견: 목과 어깨 부위에 다발성 타박상, 뒤통수에 열상 확인. 흉기에 의한 자상·열상은 발견되지 않았다 — 몸싸움 중 넘어지며 바닥이나 주변 지형지물에 부딪혀 생긴 손상으로 추정된다. 직접 사인은 두부 외상. 위 내용물 소화 정도를 근거로 사망 추정 시각은 23:45경으로 특정됐다.",
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
    // 사실을 조사 모드 물증으로 옮겼다 — 각 배역의 동기를 직접 알려주지 않아도,
    // 플레이어가 이 정황과 각자의 태도를 스스로 연결해 추리하게 만드는 용도.
    id: "ev-workshop-purpose",
    category: "physical",
    name: "워크숍 취지 안내문",
    revealedFact: "이번 워크숍은 이번 분기 인사평가를 마무리하는 자리 — 평가 결과가 곧 승진 심사에 반영될 예정",
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
    // 그걸 우연히 목격한 입장(characters.ts 정민아 knownSecrets 참고) — 당사자를
    // 명확히 밝히도록 문구를 고쳤다.
    revealedFact: "법인카드 오남용 정황 — 사용 당사자는 피해자(김영훈) 본인, 정민아는 이를 우연히 목격한 것으로 보임 (이현우와 직접 관련 없음)",
    revealTiming: "round1_end",
  },
  {
    id: "ev-convenience-store-receipt",
    category: "physical",
    name: "편의점 영수증",
    revealedFact: "박서연 23:00~00:15 외출 확인 (박서연 알리바이용)",
    revealTiming: "round1_end",
  },
  {
    id: "ev-deleted-call-recovery",
    category: "physical",
    name: "통화/삭제문자 복구",
    revealedFact: "22:00 피해자-본사 인사평가 통화 정황",
    revealTiming: "round1_end",
  },
  {
    id: "ev-performance-review",
    category: "physical",
    name: "인사평가서",
    revealedFact: "이현우 본인이 평가 대상, 위협감 느낄 만한 내용",
    revealTiming: "round2_end",
  },
  {
    id: "ev-yearbook-sns",
    category: "physical",
    name: "회사 행사 사진(SNS)",
    revealedFact:
      "예전 회사 행사 사진(SNS 태그)에서 박서연-이현우가 같은 자리에 있었음이 발견됨 (인턴-사수 시절)",
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
    revealedFact: "이현우 신발 흙 성분이 산책로 흙과 매우 유사하다 — 같은 계열의 흙으로 보인다",
    // 조사 보드 클릭이 아니라 심문 중 "신발을 보여달라"는 행동 요청으로만 해금된다
    // (10_claude_code_handoff.md 후속 피드백 — 실제 요청 행위 없이 라운드만 지나면
    // 자동 공개되던 걸 없애 몰입감을 높였다).
    revealTiming: "action_triggered",
    isBreakdownTrigger: true,
    breakdownCategory: "B",
  },
  {
    id: "ev-shoe-park",
    category: "physical",
    name: "박서연 신발 확인",
    revealedFact: "최근에 새로 산 신발이라 흙 반응 없음 — 사건과 무관",
    revealTiming: "action_triggered",
  },
  {
    id: "ev-shoe-jeong",
    category: "physical",
    name: "정민아 신발 확인",
    revealedFact: "신발에서 최근 세척한 흔적 발견 — 흙은 안 나왔지만 석연치 않음",
    revealTiming: "action_triggered",
  },
  {
    id: "ev-park-phone-photos",
    category: "physical",
    name: "박서연 휴대폰 사진첩",
    revealedFact: "정민아와 김영훈이 손을 잡거나 다정한 모습을 몰래 찍어둔 사진 1장",
    revealTiming: "round3_open",
  },
  {
    id: "stmt-park-dispute-reason",
    category: "statement",
    name: "박서연 다툼 이유",
    revealedFact: "박서연-김영훈 성과 갈등",
    revealTiming: "round1_end",
  },
  {
    id: "stmt-lee-past-mistake",
    category: "statement",
    name: "정민아-이현우 트러블",
    revealedFact: "정민아가 이현우 과거 실수를 알고 있음",
    revealTiming: "round2_end",
    breakdownCategory: "C",
  },
  {
    id: "stmt-lee-park-grudge",
    category: "statement",
    name: "박서연-이현우 악연 사건",
    revealedFact:
      "예전 회사에서 박서연이 이현우의 인턴이었던 시절이 있었고, 그때 있었던 성과 문제로 박서연이 이현우에게 안 좋은 감정을 품고 있다는 이야기가 있다.",
    revealTiming: "round2_end",
    breakdownCategory: "C",
  },
  {
    id: "stmt-motive-disclosure",
    category: "statement",
    name: "각자의 동기 자진공개/은폐",
    revealedFact: "인사평가나 성과 문제로 다들 나름의 압박감을 느끼고 있었다는 정황이 있다.",
    revealTiming: "round3_open",
    breakdownCategory: "C",
  },
  {
    id: "stmt-lee-office-visit",
    category: "statement",
    name: "이현우 관리실 방문 이유",
    revealedFact: "그날 밤 이현우가 관리실에 들러 무언가를 물어보고 갔다는 증언이 나왔다.",
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
