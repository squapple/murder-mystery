// 01_truth_bible.md — 단일 진실 공급원(SSOT).
// 디렉터 계층은 이 문서 전체를 LLM을 거치지 않는 고정 데이터로 내장한다 (§6).
// 여기 없는 사실은 어떤 계층(디렉터/전략가/액터)도 임의로 생성해서는 안 된다.

export const CASE_OVERVIEW = {
  victim: "김영훈, 마케팅팀장, 30대 후반(38세)",
  timeOfDeath: "워크숍 둘째 날 새벽 23:45경",
  location: "강원도 연수원 산책로",
  discoveredAt: "06:00",
  causeOfDeath: "산책로에서의 몸싸움 끝 사망",
  culprit: "이현우",
  background: "OO기업 마케팅팀 워크숍, 1박 2일",
} as const;

export interface TimelineEvent {
  time: string;
  event: string;
  /** §4-A 교차 목격 진술 ID (해당 시) */
  witnessRef?: string;
}

/** §4 분단위 타임라인 원본 — 전체. 캐릭터별 발췌는 characters.ts에서 구성한다. */
export const TIMELINE: TimelineEvent[] = [
  { time: "19:00", event: "회식 시작" },
  { time: "22:00", event: "피해자, 본사와 인사평가 통화" },
  { time: "22:10", event: "이현우, 로비에서 통화 중 — 박서연이 얼핏 목격", witnessRef: "W1" },
  { time: "22:30", event: "이현우, 피해자 방 노크" },
  { time: "22:45", event: "이현우, CCTV 사각지대 관련 정황 발생" },
  { time: "22:50", event: "이현우, 복도에서 급히 나가는 모습 — 정민아가 목격", witnessRef: "W2" },
  { time: "23:00–00:15", event: "박서연, 편의점 외출 (→ 물리적 알리바이 성립)" },
  { time: "23:05", event: "편의점 방향으로 걸어가는 박서연 — 이현우가 목격", witnessRef: "W3" },
  { time: "23:20", event: "정민아, 법인카드 영수증 목격 후 귀실 (→ 알리바이 성립)" },
  { time: "23:20", event: "로비에서 정민아와 짧게 마주침 — 박서연이 목격", witnessRef: "W4" },
  { time: "23:25", event: "창백한 얼굴로 걸어오는 정민아 — 박서연이 목격", witnessRef: "W5" },
  { time: "23:30–00:00", event: "CCTV 공백 구간" },
  { time: "23:45", event: "몸싸움 및 사망 (이현우)" },
  { time: "06:00", event: "시신 발견" },
];

/** §4-A 교차 목격 진술 5건 — 목격자/시각/내용/대조 포인트 */
export interface CrossWitnessStatement {
  id: string;
  witness: CharacterDisplayName;
  time: string;
  content: string;
  crossCheckHint: string;
}

export type CharacterDisplayName = "박서연" | "이현우" | "정민아";

export const CROSS_WITNESS_STATEMENTS: CrossWitnessStatement[] = [
  {
    id: "W1",
    witness: "박서연",
    time: "22:10",
    content:
      "로비에서 이현우가 누군가와 통화하며 예민해 보이는 모습을 봄 (내용은 못 들음)",
    crossCheckHint:
      "이현우의 \"그냥 회식 중이었다\"는 진술과 대조하면 통화 사실 자체를 숨기려 했는지 드러남",
  },
  {
    id: "W2",
    witness: "정민아",
    time: "22:50",
    content: "복도에서 이현우가 서두르며 나가는 모습을 봄",
    crossCheckHint:
      "이현우가 \"쭉 방에 있었다\"고 주장하면 정면으로 모순됨 — CCTV 공백 진입 직전 정황과 시간대 일치",
  },
  {
    id: "W3",
    witness: "이현우",
    time: "23:05",
    content: "편의점 방향으로 걸어가는 박서연을 봄",
    crossCheckHint:
      "진범인 이현우 본인이 무의식중에 박서연의 알리바이를 뒷받침하는 진술을 하게 됨 — 형사가 이현우에게 \"그날 밤 다른 사람 본 적 있냐\"고 물으면 얻을 수 있는 역설적 단서",
  },
  {
    id: "W4",
    witness: "정민아",
    time: "23:20",
    content: "로비에서 박서연과 짧게 마주쳐 인사함",
    crossCheckHint: "박서연의 편의점 알리바이를 시간상으로 한 번 더 보강",
  },
  {
    id: "W5",
    witness: "박서연",
    time: "23:25",
    content: "창백한 얼굴로 걸어오는 정민아를 봄 (법인카드 비리 목격 직후)",
    crossCheckHint:
      "정민아의 심리 상태에 대한 정황 증거 — 정민아를 추궁할 때 \"그 시간에 왜 그렇게 안색이 안 좋았냐\"는 질문의 근거가 됨",
  },
];

/** §5 Fair-play 원칙 (설계 불변식) — 코드 레벨 가드레일 근거 문서화용 */
export const FAIR_PLAY_PRINCIPLES = [
  "모든 용의자는 동기와 비밀을 가진다 — 파고들수록 전원이 수상해 보여야 한다.",
  "무고한 용의자(박서연, 정민아)의 물리적 알리바이는 끝까지 깨지지 않는다 — 어떤 액터 계층의 즉흥 반응도 이 알리바이를 스스로 부정하는 발언을 생성해서는 안 된다.",
  "진범(이현우)만이 CCTV 공백 + 신발흙 대조 + 진술이라는 3개의 독립 증거가 서로 교차 검증되며 완전히 무너진다.",
  '"완전히 배제되는 알리바이는 없다 — 있다면 그게 범인이다"라는 역설계 원칙을 위반하는 새로운 단서를 임의로 추가하지 않는다.',
] as const;

/**
 * start-briefing 노드용 — 게임 진입 시 첫 화면에 보여줄 산문 인트로.
 * PUBLIC_CASE_BRIEF와 동일한 사실만 담되(진실 성서 §1 공개 허용분), 표·나열이 아니라
 * 서술형 문장으로 재구성했다 — 몰입감을 위한 텍스트일 뿐 새 사실은 없다.
 */
export const PROSE_INTRO = `강원도 OO연수원, 새벽 06시경. 산책로에서 한 남성의 사체가 발견됐다.

사체는 전날부터 이곳에서 1박 2일 워크숍을 진행하던 OO기업 마케팅팀의 김영훈 팀장(30대 후반, 38세)으로 밝혀졌다. 사인은 산책로에서의 몸싸움 끝에 의한 사망으로 추정된다.

전날 저녁에는 팀 전체가 참석한 회식이 있었던 것으로 확인됐다. 경찰은 회식 이후 행적이 석연치 않은 직원 세 명을 유력한 용의자로 지목해 연수원으로 불러들였다.

당신은 이 사건을 맡은 형사다. 지금부터 세 사람을 심문해, 그날 밤 산책로에서 실제로 무슨 일이 있었는지 밝혀내야 한다.`;

/** proc-case-brief 노드용 — 플레이어에게 공개되는 사건 개요 (§1 중 공개 허용분) */
export const PUBLIC_CASE_BRIEF = {
  victim: CASE_OVERVIEW.victim,
  location: CASE_OVERVIEW.location,
  timeOfDeath: CASE_OVERVIEW.timeOfDeath,
  discoveredAt: CASE_OVERVIEW.discoveredAt,
  background: CASE_OVERVIEW.background,
} as const;
