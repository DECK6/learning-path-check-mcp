const replacements: Array<[RegExp, string]> = [
  [/아이(?:는|가)?\s*이\s*개념을\s*모릅니다[.]?/g, "현재 답변에서는 이 개념을 한 번 더 확인하는 것이 좋습니다."],
  [/학습\s*부진(?:입니다|이다)?/g, "추가 확인이 필요한 학습 상태"],
  [/학년\s*수준에\s*미달(?:합니다|이다)?/g, "현재 정보에서 추가 확인이 필요합니다"],
  [/수준\s*미달/g, "추가 확인 필요"],
];

export function sanitizeLearningTerms(value: string): string {
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function containsForbiddenLearningTerms(value: string): boolean {
  return [/아이(?:는|가)?\s*이\s*개념을\s*모릅니다/, /학습\s*부진/, /학년\s*수준에\s*미달/, /수준\s*미달/].some((pattern) => pattern.test(value));
}
