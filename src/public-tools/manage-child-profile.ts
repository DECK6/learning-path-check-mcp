import { z } from "zod";
import { MAX_NICKNAME_CHARS } from "../config/limits.js";
import type { ToolDefinition } from "../lib/types.js";
import { newId } from "../lib/id.js";
import { requireAuthenticatedScopeKey } from "../identity.js";
import { getUserStore } from "../store/store.js";
import type { ChildProfile } from "../store/types.js";
import { toolResult } from "./common.js";

export const manageChildProfileInputSchema = z.object({
  action: z.enum(["create", "read", "update", "delete"]).describe("실행 작업. create는 생성, read는 조회, update는 수정, delete는 연쇄 삭제입니다"),
  childId: z.string().min(1).optional().describe("update와 delete에 필수인 자녀 프로필 ID. read에서 생략하면 현재 사용자의 목록을 조회하며 create에서는 생략합니다"),
  nickname: z.string().min(1).max(MAX_NICKNAME_CHARS).optional().describe("실명이 아닌 가족 내 별명. create에 필수이며 update에서 변경할 때 사용합니다"),
  schoolLevel: z.enum(["elementary", "middle", "high"]).optional().describe("학교급. create에 필수이며 elementary, middle, high 중 하나입니다"),
  grade: z.number().int().min(1).max(6).optional().describe("학년. create에 필수이며 초등 1~6, 중·고등 1~3 범위입니다"),
  interestedSubjects: z.array(z.string().min(1).max(40)).max(20).optional().describe("관심 과목의 짧은 이름 목록. 실명·학교명·연락처를 넣지 않습니다"),
  learningGoals: z.array(z.string().min(1).max(100)).max(20).optional().describe("학습 목표의 짧은 목록. 민감정보나 성적표 원문을 넣지 않습니다"),
  minutesPerDay: z.number().int().min(5).max(240).optional().describe("하루 학습 가능 시간(분), 5~240"),
  guardianConsent: z.literal(true).optional().describe("create와 동의 기록이 없는 기존 프로필 update에 필요한 보호자 저장 동의 확인값. 저장 항목을 안내해 명시적 동의를 받은 뒤에만 true로 전달하며 추정하지 않습니다"),
  confirmDelete: z.boolean().optional().default(false).describe("delete 연쇄 삭제를 사용자가 확인한 경우에만 true로 전달합니다"),
});

function validateGrade(level: ChildProfile["schoolLevel"], grade: number): void {
  const max = level === "elementary" ? 6 : 3;
  if (grade > max) throw new Error(`${level} 학교급의 학년은 1~${max} 범위여야 합니다.`);
}

async function handler(rawInput: unknown) {
  const input = manageChildProfileInputSchema.parse(rawInput ?? {});
  const store = getUserStore();
  const scopeKey = requireAuthenticatedScopeKey();
  if (input.action === "create") {
    if (!input.nickname || !input.schoolLevel || !input.grade) throw new Error("create에는 nickname, schoolLevel, grade가 필요합니다.");
    if (input.guardianConsent !== true) throw new Error("프로필 저장 전 보호자 동의가 필요합니다. 동의 후 guardianConsent=true로 다시 호출하세요.");
    validateGrade(input.schoolLevel, input.grade);
    const now = new Date().toISOString();
    const consent = { version: "v1" as const, grantedAt: now };
    const child: ChildProfile = {
      id: newId("child"),
      nickname: input.nickname,
      schoolLevel: input.schoolLevel,
      grade: input.grade,
      interestedSubjects: input.interestedSubjects ?? [],
      learningGoals: input.learningGoals ?? [],
      ...(input.minutesPerDay ? { minutesPerDay: input.minutesPerDay } : {}),
      guardianConsent: consent,
      createdAt: now,
      updatedAt: now,
    };
    await store.upsertChild(scopeKey, child);
    const scopeNotice = "프로필은 로그인한 PlayMCP 사용자 스코프에 격리 저장됩니다.";
    return toolResult(`# 자녀 프로필 생성\n\n- childId: ${child.id}\n- 별명: ${child.nickname}\n- 학교급·학년: ${child.schoolLevel} ${child.grade}학년\n- 보호자 저장 동의: ${consent.version} · ${consent.grantedAt}\n- 저장 항목: 별명, 학교급·학년, 관심 과목, 학습 목표, 학습 가능 시간\n- 저장하지 않는 항목: 실명, 학교명, 연락처, 주소, 성적표 원본\n\n${scopeNotice}`, { action: "create", childId: child.id, profile: child, consent, scopeNotice });
  }
  if (input.action === "read") {
    if (input.childId) {
      const child = await store.getChild(scopeKey, input.childId);
      if (!child) throw new Error("자녀 프로필을 찾을 수 없습니다.");
      const consentLabel = child.guardianConsent ? `${child.guardianConsent.version} · ${child.guardianConsent.grantedAt}` : "기록 없음 · 다음 학습 기록 전에 재동의 필요";
      return toolResult(`# 자녀 프로필\n\n- childId: ${child.id}\n- 별명: ${child.nickname}\n- 학교급·학년: ${child.schoolLevel} ${child.grade}학년\n- 관심 과목: ${child.interestedSubjects.join(", ") || "없음"}\n- 학습 목표: ${child.learningGoals.join(", ") || "없음"}\n- 하루 학습 시간: ${child.minutesPerDay ? `${child.minutesPerDay}분` : "미설정"}\n- 보호자 저장 동의: ${consentLabel}\n- 생성 시각: ${child.createdAt}\n- 수정 시각: ${child.updatedAt}`, { action: "read", childId: child.id, profile: child, consentRequired: !child.guardianConsent });
    }
    const children = await store.listChildren(scopeKey);
    return toolResult(`# 자녀 프로필 목록\n\n${children.length ? children.map((child) => `- ${child.nickname}: ${child.id}`).join("\n") : "- 저장된 프로필이 없습니다."}`, { action: "read", children });
  }
  if (!input.childId) throw new Error(`${input.action}에는 childId가 필요합니다.`);
  const existing = await store.getChild(scopeKey, input.childId);
  if (!existing) throw new Error("자녀 프로필을 찾을 수 없습니다.");
  if (input.action === "update") {
    if (!existing.guardianConsent && input.guardianConsent !== true) throw new Error("이 프로필은 보호자 저장 동의 기록이 없습니다. 저장 항목을 안내하고 명시적 동의를 받은 뒤 guardianConsent=true로 다시 호출하세요.");
    const schoolLevel = input.schoolLevel ?? existing.schoolLevel;
    const grade = input.grade ?? existing.grade;
    validateGrade(schoolLevel, grade);
    const updated: ChildProfile = {
      ...existing,
      ...(input.nickname ? { nickname: input.nickname } : {}),
      schoolLevel,
      grade,
      ...(input.interestedSubjects ? { interestedSubjects: input.interestedSubjects } : {}),
      ...(input.learningGoals ? { learningGoals: input.learningGoals } : {}),
      ...(input.minutesPerDay ? { minutesPerDay: input.minutesPerDay } : {}),
      guardianConsent: existing.guardianConsent ?? { version: "v1", grantedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    };
    await store.upsertChild(scopeKey, updated);
    return toolResult(`# 자녀 프로필 수정\n\n- childId: ${updated.id}\n- 별명: ${updated.nickname}\n- 학교급·학년: ${updated.schoolLevel} ${updated.grade}학년\n- 보호자 저장 동의: ${updated.guardianConsent?.version} · ${updated.guardianConsent?.grantedAt}`, { action: "update", childId: updated.id, profile: updated });
  }
  if (!input.confirmDelete) throw new Error("삭제 전 사용자 확인이 필요합니다. 확인 후 confirmDelete=true로 다시 호출하세요.");
  const deleted = await store.deleteChild(scopeKey, input.childId);
  return toolResult(`# 자녀 프로필 삭제 완료\n\n- childId: ${input.childId}\n- 삭제된 프로필: ${deleted.children}개\n- 함께 삭제된 점검·상태·계획·기록: ${deleted.checks + deleted.statuses + deleted.plans + deleted.progress}개`, { action: "delete", childId: input.childId, deleted });
}

export const manageChildProfileTool: ToolDefinition = {
  name: "manage_child_profile",
  title: "자녀 프로필 관리",
  description: "Requires an authenticated PlayMCP user. Create, read, update, or cascade-delete a privacy-minimized child profile with Learning Path Check(우리 아이 뭐 배우지? 체크). Before create or re-consenting a legacy profile, explain the stored fields and ask the guardian for explicit consent; never infer consent. Create requires nickname, schoolLevel, grade, and guardianConsent=true. Update and delete require childId. Delete also requires explicit confirmation with confirmDelete=true and removes the child's checks, statuses, plans, and progress records.",
  inputSchema: manageChildProfileInputSchema,
  handler,
};
