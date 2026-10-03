// AI features are on by default; deploy the friend-facing instance with
// NEXT_PUBLIC_ENABLE_AI=false to ship the no-AI build.
export const AI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI !== "false";
