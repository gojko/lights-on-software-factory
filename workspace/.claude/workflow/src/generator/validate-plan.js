import { planChecks } from './plan-checks.js';
import { readPlanSteps } from './read-plan-steps.js';

/**
 * Every structural fault of a plan, in the order the checks run.
 *
 * The steps come from the plan text, and the three parts together make the one
 * object `{ planText, steps, block }` that each check of `planChecks` reads.
 * `plan-checks.js` states what the checks answer.
 *
 * A fault of the whole plan states an empty step, because it sits at no step.
 */
export const validatePlan = ({ planPath, planText, block }) => {
	const plan = { planText, steps: readPlanSteps(planText), block };

	return planChecks.flatMap((check) => check(plan)).map(({ step, fault }) => ({ planPath, step, fault }));
};
