# Activity shift requirement algorithm

This document describes how Inventory Management derives required shift counts for each participant based on slot demand, attendance, and configured rules. The logic is implemented in `src/modules/activity/requirements.ts` and reused by the requirements UI, baseline calculator, and recommendation engine.

## Goals

- Cover all shift slots while respecting capacity
- Honor explicit per-participant overrides exactly
- Apply role-based requirements scaled by attendance
- Share remaining demand fairly across baseline participants, weighted by availability
- Produce deterministic, explainable results

## Inputs

- **Slots**: `{slotId, capacity}` entries representing demand.
- **Participants**: attendance windows (arrival/departure), feasible slot sets, optional `explicitFixedShifts`, optional `roleFixedRequirement` (if fully present), and identifiers.
- **Role requirements** and **overrides**: loaded from plan settings.
- **Rounding mode**: `CEIL` (default), `ROUND`, or `FLOOR`.

## Attendance factor

For each participant we derive a normalized attendance factor `a_j` in `[0, 1]` based on feasible slots compared to the most available participant:

```
a_j = feasibleSlotCount_j / maxFeasibleSlots
```

Participants with no attendance get `a_j = 0`; someone who can attend every slot gets `a_j = 1`.

## Participant groups

Participants are classified into exclusive groups:

- **Explicit**: `explicitFixedShifts` is set; these counts are enforced exactly.
- **Role-fixed**: no explicit override, but `roleFixedRequirement` exists; requirements are scaled by attendance.
- **Baseline**: no explicit or role-fixed amounts; they share the remaining demand.

If both explicit and role-fixed apply, the explicit override wins.

## Fixed contributions

For each participant we compute a fixed contribution `H_j`:

- **Explicit**: `H_j = explicitFixedShifts`
- **Role-fixed**: `H_j = roundUp(a_j * roleFixedRequirement)` using the selected rounding mode
- **Baseline**: `H_j = 0`

`T_fixed = Σ H_j` is subtracted from total slot demand `T` to get remaining demand `T_rem = max(T - T_fixed, 0)`.

## Baseline sharing

Baseline-only participants split `T_rem` by attendance weight:

1. `A_base = Σ a_j` across baseline participants
2. If `T_rem > 0` and `A_base = 0`, the result is infeasible (no available attendance to cover demand)
3. Otherwise `baseline = roundUp(T_rem / A_base)`

Each baseline participant receives `ceil(a_j * baseline)` shifts.

## Balancing pass

After initial rounding we may overshoot or undershoot slot demand:

- **Overshoot**: decrement baseline participants with the most slack without violating their attendance-weighted targets
- **Deficit**: increment baseline participants with highest attendance until the deficit closes

This keeps coverage while minimizing imbalance.

## Outputs

The computation returns per-participant results with:

- `requiredShifts`
- `group` (`explicit`, `role-fixed`, `baseline`)
- `attendanceFactor`, `fixedContribution`, and `baselineContribution`

It also reports totals (`totalRequiredShifts`, `totalFixedShifts`, `remainingShifts`, `baseline`, `sumRequiredShifts`) and `feasible`/`deficit`/`overshoot` flags for diagnostics.

## Key references

- Core implementation: `calculateShiftRequirementsForParticipants` and `calculateBaselineRequirementForPlan` in `src/modules/activity/requirements.ts`.
- Baseline UI trigger and API: requirements panel uses these computations to suggest baseline values and to feed recommendation logic.
