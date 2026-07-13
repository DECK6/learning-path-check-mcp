import { addDays, isoDate } from "../lib/date.js";
import { learningGraph } from "./graph.js";

export interface PlanActivityDraft {
  activityId: string;
  day: number;
  week: number;
  date: string;
  conceptId: string;
  minutes: number;
  objective: string;
  completionCheck: string;
}

export interface CalendarEventDraft {
  title: string;
  date: string;
  description: string;
  conceptId: string;
}

export function buildPlanDraft(input: {
  planId: string;
  targetConceptId: string;
  reviewConceptIds: string[];
  durationWeeks: number;
  minutesPerDay: number;
  startDate: string;
}): { orderedConceptIds: string[]; activities: PlanActivityDraft[]; targetRetryDate: string; calendarEvents: CalendarEventDraft[] } {
  learningGraph.require(input.targetConceptId);
  const orderedConceptIds = learningGraph.topologicalSort(input.reviewConceptIds);
  if (!orderedConceptIds.length) throw new Error("복습할 개념을 한 개 이상 선택해 주세요.");
  const startDate = isoDate(input.startDate);
  const totalDays = input.durationWeeks * 7;
  const activities: PlanActivityDraft[] = [];
  for (let day = 0; day < totalDays; day += 1) {
    const conceptId = orderedConceptIds[day % orderedConceptIds.length];
    const concept = learningGraph.require(conceptId);
    activities.push({
      activityId: `${input.planId}-a${String(day + 1).padStart(2, "0")}`,
      day: day + 1,
      week: Math.floor(day / 7) + 1,
      date: addDays(startDate, day),
      conceptId,
      minutes: input.minutesPerDay,
      objective: concept.titleKo,
      completionCheck: concept.evidence[0] ?? "학습한 내용을 자신의 말로 설명했는지 확인합니다.",
    });
  }
  const targetRetryDate = addDays(startDate, totalDays);
  const calendarEvents = activities.map((activity) => ({
    title: `복습: ${learningGraph.require(activity.conceptId).titleKo}`,
    date: activity.date,
    description: `${activity.minutes}분 동안 확인하고 완료 여부를 기록합니다.`,
    conceptId: activity.conceptId,
  }));
  calendarEvents.push({
    title: `재도전: ${learningGraph.require(input.targetConceptId).titleKo}`,
    date: targetRetryDate,
    description: "복습한 선수 개념을 바탕으로 목표 개념을 다시 확인합니다.",
    conceptId: input.targetConceptId,
  });
  return { orderedConceptIds, activities, targetRetryDate, calendarEvents };
}
