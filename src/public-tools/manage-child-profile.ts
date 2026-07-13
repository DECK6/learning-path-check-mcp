import { z } from "zod";
import { MAX_NICKNAME_CHARS } from "../config/limits.js";
import type { ToolDefinition } from "../lib/types.js";
import { newId } from "../lib/id.js";
import { currentScopeKey, isPublicScope } from "../identity.js";
import { getUserStore } from "../store/store.js";
import type { ChildProfile } from "../store/types.js";
import { toolResult } from "./common.js";

export const manageChildProfileInputSchema = z.object({
  action: z.enum(["create", "read", "update", "delete"]),
  childId: z.string().min(1).optional(),
  nickname: z.string().min(1).max(MAX_NICKNAME_CHARS).optional(),
  schoolLevel: z.enum(["elementary", "middle", "high"]).optional(),
  grade: z.number().int().min(1).max(6).optional(),
  interestedSubjects: z.array(z.string().min(1).max(40)).max(20).optional(),
  learningGoals: z.array(z.string().min(1).max(100)).max(20).optional(),
  minutesPerDay: z.number().int().min(5).max(240).optional(),
  confirmDelete: z.boolean().optional().default(false),
});

function validateGrade(level: ChildProfile["schoolLevel"], grade: number): void {
  const max = level === "elementary" ? 6 : 3;
  if (grade > max) throw new Error(`${level} 학교급의 학년은 1~${max} 범위여야 합니다.`);
}

async function handler(rawInput: unknown) {
  const input = manageChildProfileInputSchema.parse(rawInput ?? {});
  const store = getUserStore();
  const scopeKey = currentScopeKey();
  if (input.action === "create") {
    if (!input.nickname || !input.schoolLevel || !input.grade) throw new Error("create에는 nickname, schoolLevel, grade가 필요합니다.");
    validateGrade(input.schoolLevel, input.grade);
    const now = new Date().toISOString();
    const child: ChildProfile = {
      id: newId("child"),
      nickname: input.nickname,
      schoolLevel: input.schoolLevel,
      grade: input.grade,
      interestedSubjects: input.interestedSubjects ?? [],
      learningGoals: input.learningGoals ?? [],
      ...(input.minutesPerDay ? { minutesPerDay: input.minutesPerDay } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await store.upsertChild(scopeKey, child);
    const capability = isPublicScope() ? "사용자 식별 헤더가 없어 childId가 접근 권한 역할을 합니다. 잃어버리면 복구할 수 없으니 대화에 유지하세요." : "프로필은 현재 사용자 스코프에 격리 저장됩니다.";
    return toolResult(`# 자녀 프로필 생성\n\n- childId: ${child.id}\n- 별명: ${child.nickname}\n- 학교급·학년: ${child.schoolLevel} ${child.grade}학년\n- 저장 항목: 별명, 학교급·학년, 관심 과목, 학습 목표, 학습 가능 시간\n- 저장하지 않는 항목: 실명, 학교명, 연락처, 주소, 성적표 원본\n\n${capability}`, { action: "create", childId: child.id, profile: child, capabilityNotice: capability });
  }
  if (input.action === "read") {
    if (input.childId) {
      const child = await store.getChild(scopeKey, input.childId);
      if (!child) throw new Error("자녀 프로필을 찾을 수 없습니다.");
      return toolResult(`# 자녀 프로필\n\n- childId: ${child.id}\n- 별명: ${child.nickname}\n- 학교급·학년: ${child.schoolLevel} ${child.grade}학년\n- 관심 과목: ${child.interestedSubjects.join(", ") || "없음"}\n- 학습 목표: ${child.learningGoals.join(", ") || "없음"}\n- 하루 학습 시간: ${child.minutesPerDay ? `${child.minutesPerDay}분` : "미설정"}\n- 생성 시각: ${child.createdAt}\n- 수정 시각: ${child.updatedAt}`, { action: "read", childId: child.id, profile: child });
    }
    if (isPublicScope()) throw new Error("사용자 식별 헤더가 없는 공개 스코프에서는 목록을 표시하지 않습니다. childId를 전달해 주세요.");
    const children = await store.listChildren(scopeKey);
    return toolResult(`# 자녀 프로필 목록\n\n${children.length ? children.map((child) => `- ${child.nickname}: ${child.id}`).join("\n") : "- 저장된 프로필이 없습니다."}`, { action: "read", children });
  }
  if (!input.childId) throw new Error(`${input.action}에는 childId가 필요합니다.`);
  const existing = await store.getChild(scopeKey, input.childId);
  if (!existing) throw new Error("자녀 프로필을 찾을 수 없습니다.");
  if (input.action === "update") {
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
      updatedAt: new Date().toISOString(),
    };
    await store.upsertChild(scopeKey, updated);
    return toolResult(`# 자녀 프로필 수정\n\n- childId: ${updated.id}\n- 별명: ${updated.nickname}\n- 학교급·학년: ${updated.schoolLevel} ${updated.grade}학년`, { action: "update", childId: updated.id, profile: updated });
  }
  if (!input.confirmDelete) throw new Error("삭제 전 사용자 확인이 필요합니다. 확인 후 confirmDelete=true로 다시 호출하세요.");
  const deleted = await store.deleteChild(scopeKey, input.childId);
  return toolResult(`# 자녀 프로필 삭제 완료\n\n- childId: ${input.childId}\n- 삭제된 프로필: ${deleted.children}개\n- 함께 삭제된 점검·상태·계획·기록: ${deleted.checks + deleted.statuses + deleted.plans + deleted.progress}개`, { action: "delete", childId: input.childId, deleted });
}

export const manageChildProfileTool: ToolDefinition = {
  name: "manage_child_profile",
  title: "자녀 프로필 관리",
  description: "Create, read, update, or delete a privacy-minimized child profile with Learning Path Check(우리 아이 뭐 배우지? 체크). Explain the stored fields and obtain guardian consent before create; confirm deletion before calling with confirmDelete=true.",
  inputSchema: manageChildProfileInputSchema,
  handler,
};
