// 08_evidence_reference_for_tester.md — 물증/진술 증거 데이터.
// 조사 모드 UI(proc-investigation, AI 불필요)의 데이터 소스.
// 여기 없는 단서를 임의로 추가하지 않는다 (10번 문서 "하지 말 것").
//
// Phase 39 — 스토리라인 대규모 개편. 붕괴조건 시스템(A/B/C 카테고리, isBreakdownTrigger)을
// 완전히 폐지하면서 관련 필드를 전부 제거했고, 살해도구가 돌→흉기(칼)+베란다 끈 트릭으로
// 바뀌며 신발 관련 물증 전부(ev-shoe-*)와 그 근거였던 현장 흙 감식(ev-soil-analysis)을
// 삭제했다. 관리실 서브플롯(stmt-lee-office-visit)도 삭제.
//
// Phase 40 — 신발 증거 복원(Phase 39에서 삭제한 게 실수였다는 지적). 김영훈 휴대폰
// 통화·문자 기록 물증 신설. 정민지의 "법인카드 비리 목격" 서브플롯을 완전히 삭제하고
// "김영훈과의 로비 다툼"으로 교체.
//
// Phase 41 — 이현우는 계획적으로 살해했다(몸싸움 없이, 플레이어 공개 텍스트엔 명시
// 안 함). CCTV 관련 증거를 전부 삭제. 그날 밤(20:00~24:00) 비가 내렸다는 설정 추가 —
// 신발 증거 근거를 이슬→빗물로 교체, 박서연 신발 세척 습관/목격담 설정 삭제.
//
// Phase 42 — 실전 플레이 피드백을 대거 반영했다:
//   1) **숙소 배정표를 보드 증거에서 삭제**했다 — 방 번호는 오직 심문으로 각 캐릭터에게
//      직접 물어봐야만 알아낼 수 있다(characters.ts truthBibleFacts에 각자 알고 있는
//      사실로만 남긴다). 클릭 한 번으로 세 명 방 번호를 한꺼번에 주는 카드는 힌트가
//      너무 강했다.
//   2) **워크숍 취지 안내문**에서 "마케팅팀 전체가 신경을 곤두세우고 있었을 만한
//      자리"라는 일반화 문장을 삭제했다 — 이제 동기가 3인 전부 다르므로 불필요.
//   3) **낮 산책로 프로그램 기록 → 당일 프로그램 일정표**로 교체 — "그래서 신발에
//      흙이 묻어도 이상하지 않다"는 결론을 카드가 대신 내려주지 않는다. 강사 특강·
//      점심·산책로 탐방·자유시간 같은 당일 일정만 나열하고, 그 정보로 무엇을 추론할지는
//      전적으로 플레이어 몫이다.
//   4) **회사 행사 사진(SNS)·팀원 B의 증언(인턴-사수 그루지) 삭제** — 박서연-이현우
//      개인적 악연 설정을 걷어냈다(사용자 판단: 이제 셋의 동기가 서로 무관하게 완전히
//      독립적이어야 한다). 박서연의 인턴 시절 성과 탈취 이력은 "박서연의 이력"이라는
//      새 물증으로 옮겨, 이현우와의 연결 없이 그녀 개인의 서사로만 남겼다.
//   5) **베란다 난간 흔적 삭제** — 아무 것도 안 하고 라운드만 넘겨도 뜨는 물증이
//      "범인은 이현우"라고 사실상 말해주는 것과 다름없다는 지적(사용자) — 최종 지목은
//      끝까지 "찍기"여야 하므로 완전히 삭제했다. 3라운드에 새로 공개되는 물증은 이제
//      흉기 하나뿐이다.
//   6) **동기 공개 진술들을 전부 2라운드부터 보이도록 앞당겼다**(round2_end→round1_end) —
//      원래 "round2_end" 태그는 3라운드가 되어야 보이는 타이밍이었는데, 사용자의
//      추리 설계상 이 정보들은 2라운드 심문 중에 이미 활용 가능해야 한다.
//   7) **김영훈 휴대폰 통화·문자 내역(공용 물증)을 삭제**하고, 대신 3인 각자의
//      휴대폰을 심문으로 요청하면 그 사람 몫의 통화·문자만 보여주는 개별 물증으로
//      쪼갰다 — 이제 "가방"·"신발"처럼 "휴대폰"도 정식 요청 물품이라 인내심 키워드에도
//      반영된다(characters.ts 참고).
//   8) **흉기 카드 단순화**: "등산용"이라는 수식어와 "손잡이 스트랩 구멍"·"누군가
//      옮겨다 놓은 것으로 보인다" 같은 해석성 문장을 전부 삭제했다 — 스트랩 구멍은
//      나중에 이미지로 보여줄 예정이라 텍스트로 미리 설명하지 않는다(사용자).
//
// **결정적 연결고리(방 배정 → 위치 관계 → 베란다 끈 트릭)를 설명하거나 암시하는 문구를
// 어떤 카드에도 넣지 않는다** — 사용자 명시적 지시("절대 하지 말 것"). 플레이어가
// 스스로 조합해야 한다.

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
  /**
   * Phase 74 — 사용자가 직접 제작한 증거품 이미지(`public/evidence/`)를 카드 썸네일 +
   * 확대 모달에 표시한다. `/evidence/파일명.png` 형태의 public 경로. 없으면(undefined)
   * 이미지 없이 텍스트만 표시된다 — 전체 증거 중 이미지가 준비된 항목만 채운다.
   */
  image?: string;
}

export const EVIDENCE: EvidenceItem[] = [
  {
    // Phase 64 — 사망 장소(산책로)가 이 카드에 명시돼 있지 않았다는 지적(사용자)에
    // revealedFact/detail 양쪽에 장소를 추가했다. CASE_OVERVIEW.location으로 이미
    // 알려져 있는 정보라 새 사실을 만든 건 아니다.
    id: "ev-time-of-death",
    category: "physical",
    name: "사망추정시각",
    revealedFact: "산책로에서 21:45경 사망",
    detail:
      "부검 소견: 어깨와 옆구리 부위에 예리한 흉기에 의한 자상 다수 확인. 직접 사인은 과다출혈. 위 내용물 소화 정도를 근거로 사망 추정 시각은 21:45경으로 특정됐다. 시신은 산책로에서 발견됐고, 부검 결과로도 실제 사망 장소가 그 부근으로 추정된다. 흉기 자체는 현장에서 발견되지 않았다.",
    revealTiming: "round1_base",
    image: "/evidence/body_kyh.png",
  },
  {
    // Phase 64 — "산책로 흙이 특이하다"는 사실 자체가 어디에도 없어, 이후 신발
    // 흙 성분 일치(ev-shoe-lee)가 왜 결정적 증거가 되는지의 전제가 빠져 있었다는
    // 지적(사용자). 산책로 흙이 다른 구역과 뚜렷이 구분된다는 사실만 중립적으로
    // 제시하고, "그래서 누구 신발이 의심스럽다" 같은 결론은 내리지 않는다.
    id: "ev-trail-soil-analysis",
    category: "physical",
    name: "산책로 흙 성분 감식",
    revealedFact: "산책로 흙, 다른 구역과 성분이 구별됨",
    detail:
      "국립과학수사연구원이 연수원 부지 곳곳(주차장, 정원, 산책로 등)의 흙을 채취해 비교했다 — 산책로 구간의 흙은 성분이 뚜렷이 구별되어, 다른 곳의 흙과 혼동될 가능성은 낮다는 감식 결과가 나왔다.",
    revealTiming: "round1_base",
  },
  {
    // Phase 42: "마케팅팀 전체가 신경을 곤두세우고 있었을 만한 자리" 같은 일반화
    // 문장을 삭제했다 — 이제 동기가 3인 전부 다르므로 불필요한 유도였다.
    id: "ev-workshop-purpose",
    category: "physical",
    name: "워크숍 취지 안내문",
    revealedFact: "이번 워크숍이 인사평가 마무리 자리라는 안내문 발견",
    detail:
      "인사팀이 사전에 배포한 워크숍 안내문. 이번 1박 2일 워크숍이 이번 분기 인사평가의 마지막 관찰 기간이며, 여기서의 태도와 성과가 다가오는 승진 심사에 직접 반영된다고 명시돼 있다.",
    revealTiming: "round1_base",
  },
  {
    // Phase 42: "낮 산책로 프로그램 기록"을 대체 — "그래서 신발에 흙이 묻어도
    // 이상하지 않다"는 결론을 카드가 대신 내리지 않는다. 있을 법한 하루 일정만
    // 나열한다.
    id: "ev-day-schedule",
    category: "physical",
    name: "당일 프로그램 일정표",
    revealedFact: "사건 발생 당일 워크숍 프로그램 일정 확인",
    // Phase 74 — 사용자 요청으로 "산책로 탐방"을 낮 일정에서 뺐다. 오전 연수원 도착
    // 및 숙소 배정, 점심, 오후 강사 특강, 자유시간 순으로 재구성.
    detail:
      "그날 진행된 프로그램 일정표가 확인됐다 — 오전 연수원 도착 및 숙소 배정, 점심 식사, 오후 초청 강사 특강, 이후 자유시간 순으로 짜여 있었다.",
    revealTiming: "round1_base",
  },
  {
    id: "ev-convenience-store-receipt",
    category: "physical",
    name: "편의점 영수증",
    revealedFact: "박서연 편의점 결제 기록 확인",
    detail:
      "박서연이 21:10경 편의점에서 결제한 기록이 확인됐다 — 다만 그 이후 정확히 언제 회식 자리로 돌아왔는지는 증명되지 않아, 사망 추정 시각(21:45) 전후의 행적까지 확실히 증명해주지는 못한다.",
    revealTiming: "round1_end",
    image: "/evidence/receipt.png",
  },
  {
    // Phase 40: 정민지의 "법인카드 비리 목격" 서브플롯을 대체 — 그날 밤 심란해 보인
    // 이유를 이 사건 하나로 통합했다. 익명 정보원("다른 팀원")이 출처.
    id: "stmt-jeong-lobby-dispute",
    category: "statement",
    name: "팀원 E의 증언",
    revealedFact: "로비에서 있었던 다툼에 대한 이야기",
    detail:
      "정민지가 로비에서 김영훈을 따라나가 말다툼을 벌이는 모습을 봤다는 목격담이 있다 — 정확히 무슨 이야기였는지까지는 알려지지 않았다.",
    revealTiming: "round1_end",
  },
  {
    // Phase 42: 옛 "팀원 B의 증언"(이현우 인턴-사수 그루지)을 대체 — 이현우와의
    // 연결을 걷어내고, 박서연 개인의 이력으로만 남겼다. "박서연의 과거"라는
    // 출처(인사 기록)로 명시해 "다른 팀원의 증언"(익명 소문) 카테고리와 구분한다.
    id: "ev-park-employment-history",
    category: "physical",
    name: "박서연의 이력",
    revealedFact: "예전 직장에서의 이력 확인",
    detail:
      "박서연이 예전 회사에서 인턴으로 일하던 시절, 담당 사수에게 자신의 아이디어를 빼앗겨 정규직 전환에 실패했던 이력이 확인됐다.",
    revealTiming: "round1_end",
  },
  {
    // Phase 42: round2_end(3라운드에야 노출)에서 round1_end(2라운드부터 노출)로
    // 앞당겼다 — 동기 관련 정보는 2라운드 심문 중에 이미 활용 가능해야 한다는
    // 설계 의도(사용자). 내용도 "지난 4~5년간", "정당한 평가·전환 기회" 등 구체적
    // 수치로 다듬었다.
    id: "stmt-park-dispute-reason",
    category: "statement",
    name: "팀원 A의 증언",
    revealedFact: "성과 문제에 대한 이야기",
    detail:
      "박서연이 지난 4~5년간 진행한 프로젝트가 회사에 상당한 이득을 가져다줬는데도, 팀장 김영훈이 그 성과를 반복적으로 자기 것처럼 보고해 왔다는 이야기가 있다 — 일부 동료는 이 사실을 알고 있지만 적극적으로 나서서 감싸주지는 않는다고 한다.",
    revealTiming: "round1_end",
  },
  {
    // Phase 39: 이현우의 동기(가족사 기반 원한)를 공개하는 진술 증거. 확정된 사실이
    // 아니라 "그런 소문/정황이 있다"는 수준으로만 서술해, 진위를 게임이 판정하지
    // 않는다. Phase 42: round1_end로 앞당김(2라운드부터 노출).
    // Phase 64 — 사용자 요청으로 정확한 시기를 추가했다: 여동생 사망 2년 전, 김영훈
    // 재혼 그로부터 3개월 후.
    // Phase 74 — 사용자 요청으로 다시 간결화: 사망보험금 소문·"이현우가 어떻게
    // 받아들이는지 알려지지 않았다" 문장을 뺐다(이현우가 김영훈을 의심하는 심증은
    // 이제 그의 본인 데이터로만 존재 — characters.ts 참고, 목격담 카드는 순수 사실만
    // 담는다는 원칙과 더 잘 맞는다). "동료가 전해 들은 얘기를 경찰에게 진술하는
    // 톤"으로 두 사실(혼인 관계, 재혼 시기)만 남겼다.
    id: "stmt-lee-family-history",
    category: "statement",
    name: "전 직장 동료의 증언",
    revealedFact: "이현우의 가족사에 대한 이야기",
    detail:
      "이현우에게 여동생이 있었고, 예전에 피해자 김영훈과 결혼했었다는 걸 아는 사람이 있다. 결혼 후 얼마 안 가 여동생이 세상을 떠나며(자살로 처리됨) 그 혼인은 끝났는데, 김영훈은 그로부터 3개월도 채 지나지 않아 재혼했다는 이야기가 있다. 그게 2년 전이었다.",
    revealTiming: "round1_end",
  },
  {
    // Phase 39: 정민지의 동기(김영훈과의 파혼/유산 서브플롯)를 공개하는 진술 증거.
    // 구체적 장면 묘사 없이 "그런 일이 있었다" 수준으로만 서술한다(사용자 명시).
    // Phase 42: round1_end로 앞당김.
    // Phase 64 — 사용자 요청으로 정확한 시기를 추가했다: 2년 전부터 연인 관계,
    // 1년 전 임신, 10개월 전 유산. "무슨 일이 있었는지"의 세부(김영훈의 반응 등)는
    // 여전히 밝히지 않는다 — 시점만 구체화했다.
    id: "stmt-jeong-breakup-reason",
    category: "statement",
    name: "팀원 C의 증언",
    revealedFact: "정민지의 예전 연애에 대한 이야기",
    detail:
      "정민지가 2년 전부터 피해자 김영훈과 연인 관계였다는 걸 아는 사람이 있다 — 결혼까지 이야기가 오갔었고, 1년 전에는 아이도 생겼었다는 이야기가 있다. 그런데 10개월 전쯤 아이를 잃었고, 그 뒤로 사이가 완전히 틀어졌다고 한다. 정확히 그 과정에서 무슨 일이 있었는지까지는 아는 사람이 없다.",
    revealTiming: "round1_end",
  },
  {
    // Phase 39: 이현우가 워크숍 장소·일정과 방 배정을 직접 기획·추진했다는 사실.
    // Phase 42: CCTV 관련 문구를 완전히 삭제했다 — "CCTV가 거의 없다"는 특징을
    // 이현우가 고른 장소에 붙이면 "그가 일부러 그런 곳을 골랐다"는 해석을 카드가
    // 대신 내려주는 셈이라는 지적(사용자) — 그냥 "외진 곳, 오래된 곳"이라는 중립적
    // 묘사만 남겼다. round1_end로 앞당김.
    id: "stmt-lee-workshop-planner",
    category: "statement",
    name: "팀원 D의 증언",
    revealedFact: "워크숍 준비 과정에 대한 이야기",
    detail:
      "이번 워크숍 장소 예약과 숙소 배정을 이현우가 직접 맡아 진행했다는 이야기가 있다 — 지은 지 오래된, 비교적 외진 연수원이다.",
    revealTiming: "round1_end",
  },
  {
    // Phase 42: "등산용"이라는 수식어와 "손잡이 스트랩 구멍"·"누군가 옮겨다 놓은
    // 것으로 보인다" 같은 해석성 문장을 전부 삭제했다 — 스트랩 구멍은 나중에
    // 이미지로 보여줄 예정이라 텍스트로 미리 설명하지 않는다(사용자). 발견 장소
    // (박서연 베란다)만 보면 오히려 박서연이 범인처럼 보이는 함정 단서인 것은
    // 그대로 유지한다.
    id: "ev-murder-weapon-knife",
    category: "physical",
    name: "흉기",
    revealedFact: "박서연 방 베란다에서 흉기로 추정되는 칼 발견",
    detail:
      "박서연 숙소(202호) 베란다 화분 뒤에서 칼 한 자루가 발견됐다. 표면에 남은 혈흔을 감식한 결과 피해자 김영훈의 혈액형 및 DNA와 일치했다.",
    revealTiming: "round3_open",
    image: "/evidence/knife.png",
  },
  {
    // Phase 41 — 신발 증거의 근거를 "이슬/습기"에서 "빗물"로 교체했다. 흙 성분
    // 일치(산책로에 있었다) + 빗물에 젖은 흔적(비가 오던 시간대, 즉 밤에 갔다는
    // 뜻) 두 가지를 한 번의 신발 확인으로 함께 제시한다. "몇 시인지/얼마나
    // 있었는지/어디까지 들어갔는지"는 특정되지 않는다 — "그날 밤 산책로에
    // 있었다"는 강한 심증은 서지만 "죽였다"까지는 확정되지 않는 선에서 멈춰야,
    // 박서연 방에서 나온 흉기와 논리적으로 충돌하며 플레이어의 최종 판단을 계속
    // 흔들어놓는 핵심 장치가 유지된다. 이현우의 2단계 방어(낮 프로그램 핑계 →
    // 빗물 증거 제시되면 "초입까지만, 못 만났다"로 한 단계만 후퇴)는
    // characters.ts knownSecrets에 서술한다.
    id: "ev-shoe-lee",
    category: "physical",
    name: "이현우 신발 확인",
    revealedFact: "이현우 신발에서 흙 성분 일치 + 빗물 흔적 발견",
    detail:
      "신발 흙 성분이 산책로 흙과 일치한다. 흙에는 빗물에 젖었다 마른 흔적도 남아있다 — 그날 밤 20시부터 자정까지 비가 내렸으므로, 낮이 아니라 그 시간대에 산책로에 갔었다는 것만큼은 확정된다. 몇 시인지, 얼마나 오래 있었는지, 어디까지 들어갔는지는 특정되지 않는다.",
    revealTiming: "action_triggered",
    // Phase 40: 진범을 실제로 특정하는 데 기여하는 결정적 정황이라 "증거 수집" 채점
    // 대상으로 삼는다(Phase 38 원칙 계승).
    scorable: true,
    image: "/evidence/shoes_lhw.png",
  },
  {
    // Phase 41: 박서연의 신발 설명을 단순화 — 그냥 "비에 젖어서 슬리퍼를 헹궈냈다"는
    // 평범한 행동으로.
    id: "ev-shoe-park",
    category: "physical",
    name: "박서연 신발 확인",
    revealedFact: "박서연 신발 확인 — 산책로 흔적 없음",
    detail:
      "신발에 산책로 흔적이 전혀 없다 — 그날 밤 비가 와서 슬리퍼에 흙탕물이 좀 튀었었는데, 물로 대충 헹궈냈을 뿐이라고 설명한다.",
    revealTiming: "action_triggered",
    image: "/evidence/shoes_psy.png",
  },
  {
    // Phase 40: 평범한 대조군 — 별다른 의미 없이 막다른 길로 남는다.
    id: "ev-shoe-jeong",
    category: "physical",
    name: "정민지 신발 확인",
    revealedFact: "정민지 신발 확인 — 평범한 흙만 검출",
    detail: "평범한 흙만 묻어있다 — 그 이상 나올 게 없다.",
    revealTiming: "action_triggered",
    image: "/evidence/shoes_jmj.png",
  },
  {
    // 가방 조사(Phase 39 신규 메커니즘) — 3인 전원, 심문 중 "가방 좀 보여달라" 자유문
    // 요청으로만 해금된다. 등산장비가 나와도 특별해 보이지 않도록, 다른 캐릭터의
    // 잡담 소재로 "이현우가 원래 등산이 취미"라는 정보를 자연스럽게 흘려둔다
    // (characters.ts 참고).
    id: "ev-bag-lee",
    category: "physical",
    name: "이현우 가방 확인",
    revealedFact: "이현우 가방 내용물 확인",
    detail:
      "로프, 카라비너 2개, 접이식 등산스틱, 헤드랜턴 — 그 외 세면도구, 여벌 와이셔츠, 상비약, 충전기 등 평범한 소지품들이 들어 있다.",
    revealTiming: "action_triggered",
    scorable: true,
    image: "/evidence/bag_lhw.png",
  },
  {
    id: "ev-bag-park",
    category: "physical",
    name: "박서연 가방 확인",
    revealedFact: "박서연 가방 내용물 확인",
    detail: "화장품 파우치, 보조배터리, 여벌 옷, 개인 수첩, 편의점 영수증 등이 들어 있다.",
    revealTiming: "action_triggered",
    image: "/evidence/bag_psy.png",
  },
  {
    // Phase 56 — 정민지의 임신/유산 서브플롯(stmt-jeong-breakup-reason에서는 뭉뚱그려서만
    // 언급됨)을 구체적으로 발견할 경로가 없다는 지적에, 가방 소지품에 실마리를 심었다.
    // 사용자 명시: "이상하다", "왜 있는지 모르겠다" 같은 해석성 문구를 절대 붙이지 않고
    // 다른 소지품과 동일하게 나열만 한다 — 플레이어가 스스로 알아채야 한다.
    id: "ev-bag-jeong",
    category: "physical",
    name: "정민지 가방 확인",
    revealedFact: "정민지 가방 내용물 확인",
    detail: "업무 수첩, 이어폰, 핸드크림, 두통약, 그리고 아기 옷 한 벌이 들어 있다.",
    revealTiming: "action_triggered",
    image: "/evidence/bag_jmj.png",
  },
  {
    // Phase 64 — 김영훈 본인의 휴대폰 기록을 새로 추가했다(사용자 요청). 박서연/
    // 이현우 각자의 휴대폰(ev-phone-park/ev-phone-lee)은 "내가 보낸" 기록만 보여줘
    // 서로 대조가 필요했는데, 피해자 본인 휴대폰에 양쪽 기록이 한 번에 모여있어
    // 시간순으로 대조하기 쉽게 정리했다. 피해자 소유물이라 심문 요청 없이 현장에서
    // 바로 확보되는 물증이다(action_triggered가 아니라 round1_end) — id를
    // "ev-victim-phone-log"로 지어 scoring.ts의 "ev-phone-" 접두어 필터(수사
    // 성실도 = 각 용의자에게 심문으로 요청해 받은 소지품)에 걸리지 않게 했다 —
    // 이 카드는 요청이 아니라 자동 확보되는 현장 증거라 그 집계에 포함되면 안 된다.
    id: "ev-victim-phone-log",
    category: "physical",
    name: "김영훈 휴대폰 확인",
    revealedFact: "김영훈 휴대폰에서 박서연·이현우와의 통화·문자 기록 확인",
    detail:
      "그날 밤 시간순 기록이 남아있다. 21:05 박서연에게서 문자(\"팀장님 잠깐 이야기 좀 하시죠\") 수신. 21:10 이현우와 통화(응답함). 21:30 박서연에게서 걸려온 전화 부재중. 21:50 이현우에게서 문자(\"다음에 얘기하자\") 수신. 그 외 특이한 기록은 없다.",
    revealTiming: "round1_end",
    image: "/evidence/phone.png",
  },
  {
    // Phase 42 — 옛 "김영훈 휴대폰 통화·문자 내역"(공용 물증, round2_end)을 대체.
    // 이제 "휴대폰"도 가방·신발처럼 심문 중 요청해야만 해금되는 개별 물증이다.
    // 박서연 본인이 보낸 문자·전화 기록만 보여준다(김영훈 쪽 기록과 대칭).
    id: "ev-phone-park",
    category: "physical",
    name: "박서연 휴대폰 확인",
    revealedFact: "박서연 휴대폰에서 김영훈에게 보낸 문자·전화 기록 확인",
    detail:
      "21:05에 김영훈에게 보낸 문자(\"팀장님 잠깐 이야기 좀 하시죠\")와 21:30에 걸었던 부재중 전화 기록이 남아있다. 그 외 특이한 내용은 없다.",
    revealTiming: "action_triggered",
    image: "/evidence/phone.png",
  },
  {
    // Phase 42: 이현우 본인의 휴대폰 — 그가 김영훈을 불러낸 통화와 위장 문자 둘 다
    // 여기서 확인된다. 진범을 실제로 특정하는 데 기여하는 결정적 정황이라 채점
    // 대상으로 삼는다.
    id: "ev-phone-lee",
    category: "physical",
    name: "이현우 휴대폰 확인",
    revealedFact: "이현우 휴대폰에서 김영훈과의 통화·문자 기록 확인",
    detail:
      "21:10에 김영훈과 통화한 기록과, 21:50에 보낸 문자(\"다음에 얘기하자\")가 남아있다. 통화 내용 자체는 남아있지 않다.",
    revealTiming: "action_triggered",
    scorable: true,
    image: "/evidence/phone.png",
  },
  {
    id: "ev-phone-jeong",
    category: "physical",
    name: "정민지 휴대폰 확인",
    revealedFact: "정민지 휴대폰 확인",
    detail: "특별히 눈에 띄는 통화나 문자 기록은 없다.",
    revealTiming: "action_triggered",
    image: "/evidence/phone.png",
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
