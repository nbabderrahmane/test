'use strict';
/*
 * Exhaustive solver for compte-rond (offline tool, not shipped in the game).
 * Rules: 6 numbers, each used at most once, results are reusable, + - x /,
 * no zero or negative result, division only when exact. Trivial x1 and /1 are
 * skipped (they never shorten a solution).
 * A state is the sorted list of numbers still on the table: one operation always
 * removes one number, so the depth of a state is 6 - length.
 */

// All distinct operations on a sorted array: [i, j, op, result], a = arr[i] <= b = arr[j].
function moves(arr, addOnly) {
  const out = [], n = arr.length;
  for (let i = 0; i < n; i++) {
    if (i > 0 && arr[i] === arr[i - 1]) continue;
    const a = arr[i];
    for (let j = i + 1; j < n; j++) {
      if (j > i + 1 && arr[j] === arr[j - 1]) continue;
      const b = arr[j];
      out.push([i, j, '+', a + b]);
      if (addOnly) continue;
      if (a > 1) out.push([i, j, 'x', a * b]);
      if (b > a) out.push([i, j, '-', b - a]);
      if (a > 1 && b % a === 0) out.push([i, j, '/', b / a]);
    }
  }
  return out;
}
function next(arr, m) {
  const r = arr.filter((_, k) => k !== m[0] && k !== m[1]);
  r.push(m[3]);
  return r.sort((x, y) => x - y);
}
const keyOf = a => a.join(',');

// Minimal number of operations to make every value (value -> ops). Starting numbers: 0.
function table(nums, addOnly) {
  const best = new Map();
  nums.forEach(v => best.set(v, 0));
  let frontier = [nums.slice().sort((x, y) => x - y)];
  for (let d = 1; d < nums.length && frontier.length; d++) {
    const seen = new Set(), nxt = [];
    for (const arr of frontier) {
      for (const m of moves(arr, addOnly)) {
        if (!best.has(m[3])) best.set(m[3], d);
        const s = next(arr, m), k = keyOf(s);
        if (!seen.has(k)) { seen.add(k); nxt.push(s); }
      }
    }
    frontier = nxt;
  }
  return best;
}

// One reference solution with the minimal number of operations: [[a, op, b, result], ...].
function solution(nums, target, addOnly) {
  const start = nums.slice().sort((x, y) => x - y);
  let frontier = [{ arr: start, path: [] }];
  for (let d = 1; d < nums.length && frontier.length; d++) {
    const seen = new Set(), nxt = [];
    for (const node of frontier) {
      for (const m of moves(node.arr, addOnly)) {
        const a = node.arr[m[0]], b = node.arr[m[1]];
        const step = m[2] === '-' || m[2] === '/' ? [b, m[2], a, m[3]] : [b, m[2], a, m[3]];
        const path = node.path.concat([step]);
        if (m[3] === target) return path;
        const s = next(node.arr, m), k = keyOf(s);
        if (!seen.has(k)) { seen.add(k); nxt.push({ arr: s, path }); }
      }
    }
    frontier = nxt;
  }
  return null;
}

// Number of distinct minimal solutions (as unordered sets of operations), k = minimal length.
function countMinimal(nums, target, k) {
  const found = new Set(), dead = new Set();
  function dfs(arr, rem, path) {
    const dk = keyOf(arr) + '|' + rem;
    if (dead.has(dk)) return false;
    let any = false;
    for (const m of moves(arr, false)) {
      if (rem === 1) {
        if (m[3] !== target) continue;
        const a = arr[m[0]], b = arr[m[1]];
        found.add(path.concat([b + m[2] + a + '=' + m[3]]).sort().join(';'));
        any = true;
      } else {
        const a = arr[m[0]], b = arr[m[1]];
        if (dfs(next(arr, m), rem - 1, path.concat([b + m[2] + a + '=' + m[3]]))) any = true;
      }
    }
    if (!any) dead.add(dk);
    return any;
  }
  dfs(nums.slice().sort((x, y) => x - y), k, []);
  return found.size;
}

module.exports = { table, solution, countMinimal };
