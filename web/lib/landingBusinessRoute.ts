import type { FlowState } from "./draft";
import type { BusinessModel } from "./api";
import { BUSINESS_MODEL_OPTIONS, defaultGoalFor, isGoalValidFor } from "./businessModel";

/** Shared with the interview's change-route control. Owner-written answers survive. */
export function changeBusinessRoute(flow: FlowState, model: BusinessModel): FlowState {
  const changed = flow.draft.business_model !== model;
  return {
    ...flow, modelConfirmed: true,
    ...(changed ? { plan: null, planFor: undefined, quarterPlan: null, quarterPlanFor: undefined,
      chosenDirection: null, directionFeedback: undefined, planFeedback: undefined, planInputs: undefined,
      successOptions: null, successOptionsFor: undefined, targetSuggestion: null, targetSuggestionFor: undefined } : {}),
    draft: {
      ...flow.draft, business_model: model,
      software: model === "saas" ? flow.draft.software : undefined,
      goal: flow.draft.goal && isGoalValidFor(model, flow.draft.goal) ? flow.draft.goal : defaultGoalFor(model),
      success: changed ? undefined : flow.draft.success,
      baseline: changed ? undefined : flow.draft.baseline,
      lever: changed ? undefined : flow.draft.lever,
      target: changed ? undefined : flow.draft.target,
      grow_where: ["services", "saas"].includes(model) ? undefined : flow.draft.grow_where,
    },
  };
}

/** Explicit landing choice wins; unsupported paths never silently become a shop. */
export function applyLandingBusinessRoute(flow: FlowState, requested: string | null): FlowState {
  const model = BUSINESS_MODEL_OPTIONS.find(option => option.key === requested)?.key;
  if (!model) return flow;
  const changed = flow.draft.business_model !== model;
  const next = changeBusinessRoute(flow, model);
  if (changed && next.step !== "name") next.step = model === "saas" ? "software_offer" : "what";
  return next;
}
