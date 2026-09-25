// Gym engine public API (gym_plan.md §3). Signatures are FROZEN after wave 0;
// G1-A implements the bodies. Import from '@chefer/utils'.
export * from './loads';
export * from './progression';
export * from './warmups';
export * from './e1rm';
export * from './prs';
export * from './volume';
export * from './templates';
export * from './weeks';
export * from './deload';
export * from './session';
export * from './workout-reducer';
// Reason-code → sentence explanations (research §1.11/§1.12). Not re-exported
// until now: G2-B (Today / active-workout "Why?" copy) is the first caller.
export * from './reasons';
// Contextual-card priority (G4-A): shared so mobile and web agree on which
// single offer (comeback/deload/stall/recap) to show.
export * from './offers';
