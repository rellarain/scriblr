// A short random id for something the planner holds (a goal, a shift, a routine, an item).
export const newId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`
