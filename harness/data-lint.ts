// 저작 체크리스트를 코드로 강제하는 정적 검사 — LLM 호출 없이 문자열/정규식만으로
// 돈다(비용 0, 즉시 실행). Phase 45에서 손으로 찾아낸 4가지 결함(방 번호 인라인,
// "칼" 미중립화, 정민지 비 사실 누락, 이현우 방번호 독립 사실 부재)을 다시는
// 놓치지 않도록 회귀 방지 가드로 만들었다.
//
// Phase 49 — 사용자 지적: "칼"을 게이팅 문구와 함께 두는 것 자체가 문제였다 —
// 정보를 주고 "모르는 척 하라"고 덮어씌우는 방식이 아니라, 무고자에게는 흉기
// 관련 정보(칼/흉기) 자체를 아예 주지 않아야 한다(evidence.ts를 통해서만 등장).
// 진범(이현우)은 예외 — 본인이 실제로 한 일이라 알고 있는 게 맞고, 페르소나에
// 따라 실수로 언급하는 것도 허용된다(사용자 명시). 규칙 2를 "게이팅 여부 확인"에서
// "무고자 데이터에 아예 존재하는지 확인"으로 강화했다.
//
// 실행: npm run harness:lint

import { CHARACTER_LIST } from "../src/lib/game-data/characters";

interface Violation {
  characterId: string;
  rule: string;
  detail: string;
}

const INLINE_ROOM_NUMBER_RE = /\([0-9]+호\)/;
const STANDALONE_ROOM_FACT_RE = /^숙소는 [0-9]+호/;
const RAIN_FACT_RE = /비/;

function main() {
  const violations: Violation[] = [];

  for (const character of CHARACTER_LIST) {
    const allFactStrings = [...character.knownSecrets, ...character.truthBibleFacts];
    const allTextIncludingRules = [...allFactStrings, ...character.behaviorRules];

    // 규칙 1 — 방 번호는 서술 문장 안에 인라인으로 등장해서는 안 된다(독립된
    // "숙소는 N호" 문장으로만 존재해야 한다).
    for (const fact of allFactStrings) {
      if (INLINE_ROOM_NUMBER_RE.test(fact) && !STANDALONE_ROOM_FACT_RE.test(fact)) {
        violations.push({
          characterId: character.characterId,
          rule: "방 번호 인라인 노출",
          detail: fact,
        });
      }
    }

    // 규칙 2 — 무고자(진범이 아닌 캐릭터)에게는 흉기 관련 정보("칼"/"흉기") 자체가
    // 존재해서는 안 된다. "형사가 밝히기 전까진 모르는 척 하라"는 지시로 덮는 게
    // 아니라, 애초에 그 정보를 안 줘야 한다 — evidence.ts를 통해서만(형사가 실제로
    // 확보했을 때만) 등장해야 한다. 진범(이현우)은 예외 — 본인이 실제로 한 일이라
    // 알고 있는 게 맞고, 페르소나에 따라 실수로 언급하는 것도 허용된다(사용자 명시).
    if (!character.isCulprit) {
      for (const text of allTextIncludingRules) {
        if (text.includes("칼") || text.includes("흉기")) {
          violations.push({
            characterId: character.characterId,
            rule: "무고자 데이터에 흉기 관련 정보(칼/흉기)가 존재함 — evidence.ts를 통해서만 등장해야 함",
            detail: text,
          });
        }
      }
    }

    // 규칙 3 — 전원 공통 사실(그날 밤 비) 누락 검사.
    const hasRainFact = character.truthBibleFacts.some((f) => RAIN_FACT_RE.test(f));
    if (!hasRainFact) {
      violations.push({
        characterId: character.characterId,
        rule: "공통 사실 누락 — '비' 관련 사실이 truthBibleFacts에 없음",
        detail: "(해당 없음)",
      });
    }

    // 규칙 4 — 캐릭터마다 "숙소는 N호" 독립 사실이 하나는 있어야 한다(형사가 방
    // 번호만 물었을 때 답할 근거가 있어야 함).
    const hasStandaloneRoomFact = character.truthBibleFacts.some((f) => STANDALONE_ROOM_FACT_RE.test(f));
    if (!hasStandaloneRoomFact) {
      violations.push({
        characterId: character.characterId,
        rule: "독립된 '숙소는 N호' 사실 없음",
        detail: "(해당 없음)",
      });
    }
  }

  if (violations.length === 0) {
    console.log("✓ 위반 사항 없음 — 모든 캐릭터가 저작 체크리스트를 통과했습니다.");
    return;
  }

  console.log(`✗ 위반 사항 ${violations.length}건 발견:\n`);
  for (const v of violations) {
    console.log(`[${v.characterId}] ${v.rule}`);
    console.log(`  ${v.detail}\n`);
  }
  process.exitCode = 1;
}

main();
