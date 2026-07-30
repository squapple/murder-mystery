// 디버그용 — 실제 조립된 시스템 프롬프트를 눈으로 확인하기 위한 일회성 스크립트.
import { buildActorSystemPrompt } from "../src/lib/prompts/actor-prompt";
import { CHARACTERS, getActorPromptView } from "../src/lib/game-data/characters";
import { PERSONAS } from "../src/lib/game-data/personas";

const view = getActorPromptView(CHARACTERS["role-park-seoyeon"]);
const prompt = buildActorSystemPrompt(view, PERSONAS.ESTP, 0, []);
console.log(prompt);
console.log(`\n\n[전체 길이] ${prompt.length}자`);
