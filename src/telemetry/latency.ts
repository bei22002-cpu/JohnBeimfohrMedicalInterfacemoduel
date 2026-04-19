/** Target budgets from product brief — informational only. */
export const BUDGET_MS = {
  localCommand: 300,
  aiInterpreted: 1500,
  complexSequence: 3000,
} as const;

export function hashCommand(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function measureFrameCommit(cb: (ms: number) => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cb(typeof performance !== "undefined" ? performance.now() : 0);
    });
  });
}
