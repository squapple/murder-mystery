// 02_persona_design.md §2 8유형 직교설계표.
// 페르소나(배우) ≠ 배역(사건 역할) — 완전히 독립적으로 조합된다.
// 카드에 노출되는 태그는 정직성 판정을 포함하지 않는다 ("거짓말을 잘함" 류 금지).

import type { Persona } from "./types";

export const PERSONAS: Record<string, Persona> = {
  ISTJ: {
    mbtiType: "ISTJ",
    interrogationStrategy: "T",
    pressureTolerance: "높음",
    corneredReaction: "침묵",
    playerTag: "원칙과 절차를 중시하는 편",
  },
  ISFP: {
    mbtiType: "ISFP",
    interrogationStrategy: "F",
    pressureTolerance: "높음",
    corneredReaction: "침묵",
    playerTag: "감정을 잘 드러내지 않는 편",
  },
  INTP: {
    mbtiType: "INTP",
    interrogationStrategy: "T",
    pressureTolerance: "낮음",
    corneredReaction: "실토",
    playerTag: "논리적 허점을 지적당하면 당황하는 편",
  },
  INFJ: {
    mbtiType: "INFJ",
    interrogationStrategy: "F",
    pressureTolerance: "높음",
    corneredReaction: "침묵",
    playerTag: "속을 잘 안 보여주지만 흔들림엔 예민한 편",
  },
  ESTP: {
    mbtiType: "ESTP",
    interrogationStrategy: "T",
    pressureTolerance: "낮음",
    corneredReaction: "실토(흥분)",
    playerTag: "즉흥적이고 감정이 표정에 바로 드러나는 편",
  },
  ESFJ: {
    mbtiType: "ESFJ",
    interrogationStrategy: "F",
    pressureTolerance: "낮음",
    corneredReaction: "실토(하소연)",
    playerTag: "관계와 분위기에 신경을 많이 쓰는 편",
  },
  ENTJ: {
    mbtiType: "ENTJ",
    interrogationStrategy: "T",
    pressureTolerance: "높음",
    corneredReaction: "침묵(역공)",
    playerTag: "밀리면 오히려 되받아치는 편",
  },
  ENFP: {
    mbtiType: "ENFP",
    interrogationStrategy: "F",
    pressureTolerance: "낮음",
    corneredReaction: "실토(횡설수설)",
    playerTag: "말이 많아지면서 스스로 정보를 흘리는 편",
  },
};

export const PERSONA_LIST: Persona[] = Object.values(PERSONAS);
