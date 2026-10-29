// src/domain/lib/calc.js
// Tiny, safe expression evaluator for the floating calculator (no eval).
// Supports + − × ÷ ^, % as percent (10% = 0.1), parentheses, unary minus and decimals.
// "×", "x", "÷" and "," (thousands) are accepted as typed or pasted.

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
const RIGHT = { '^': true };

function tokenize(src) {
  const s = String(src)
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1;
      const num = s.slice(i, j);
      if ((num.match(/\./g) || []).length > 1 || num === '.') throw new Error('Bad number');
      out.push({ t: 'n', v: Number(num) });
      i = j;
    } else if (ch === '%') {
      // percent: 15% → 15 × 0.01
      out.push({ t: 'o', v: '*' }, { t: 'n', v: 0.01 });
      i += 1;
    } else if ('+-*/^()'.includes(ch)) {
      out.push({ t: 'o', v: ch });
      i += 1;
    } else {
      throw new Error(`Unexpected "${ch}"`);
    }
  }
  return out;
}

/** Evaluate an expression; throws on invalid input. */
export function evaluate(src) {
  const tokens = tokenize(src);
  if (!tokens.length) return 0;
  const output = [];
  const ops = [];
  let prev = null; // previous token kind: 'n' | 'o' | '(' | ')'
  for (const tk of tokens) {
    if (tk.t === 'n') {
      output.push(tk.v);
      prev = 'n';
      continue;
    }
    const op = tk.v;
    if (op === '(') { ops.push(op); prev = '('; continue; }
    if (op === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop());
      if (!ops.length) throw new Error('Unbalanced )');
      ops.pop();
      prev = ')';
      continue;
    }
    // unary minus / plus
    if ((op === '-' || op === '+') && (prev === null || prev === 'o' || prev === '(')) {
      if (op === '-') { output.push(0); ops.push('u-'); }
      prev = 'o';
      continue;
    }
    if (prev === 'o' || prev === null || prev === '(') throw new Error('Missing number');
    while (ops.length) {
      const top = ops[ops.length - 1];
      if (top === '(') break;
      const pTop = top === 'u-' ? 4 : PREC[top];
      if (pTop > PREC[op] || (pTop === PREC[op] && !RIGHT[op])) output.push(ops.pop());
      else break;
    }
    ops.push(op);
    prev = 'o';
  }
  if (prev === 'o') throw new Error('Missing number');
  while (ops.length) {
    const op = ops.pop();
    if (op === '(') throw new Error('Unbalanced (');
    output.push(op);
  }
  const st = [];
  for (const x of output) {
    if (typeof x === 'number') { st.push(x); continue; }
    const b = st.pop();
    const a = st.pop();
    if (a === undefined || b === undefined) throw new Error('Bad expression');
    switch (x) {
      case '+': st.push(a + b); break;
      case '-': case 'u-': st.push(a - b); break;
      case '*': st.push(a * b); break;
      case '/': if (b === 0) throw new Error('Division by zero'); st.push(a / b); break;
      case '^': st.push(a ** b); break;
      default: throw new Error('Bad operator');
    }
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) throw new Error('Bad expression');
  // trim float noise (0.1 + 0.2)
  return Number(st[0].toPrecision(12));
}

export function tryEvaluate(src) {
  try { return { value: evaluate(src), error: null }; } catch (e) { return { value: null, error: e.message }; }
}
