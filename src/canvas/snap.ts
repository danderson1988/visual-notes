/** Round a value to the nearest `grid` pixels (default 4). */
export function snap(val: number, grid = 4): number {
  return Math.round(val / grid) * grid;
}
