export const SERVICE_NAME = "Learning Path Check(우리 아이 뭐 배우지? 체크)";
export const SERVICE_ID = "learning-path-check-mcp";
export const SERVICE_VERSION = "0.1.0";
export const SERVICE_DISCLAIMER = "교육과정 탐색과 복습 점검을 돕는 정보이며 성적·학습 상태·입시 결과를 판정하지 않습니다.";

export interface DataVersion {
  elementary: string;
  middle: string;
  high: string;
  bridges: string;
}

export function responseMeta(dataVersion: DataVersion): Record<string, unknown> {
  return Object.freeze({
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    dataVersion,
    disclaimer: SERVICE_DISCLAIMER,
  });
}
