// Find factual issues in cheatsheets
const issues = [];
const check = (where, cond, msg) => { if (cond) issues.push(`[${where}] ${msg}`); };

// 1. tanh identity
check('la/calc/dl', /tanh\(x\)\s*=\s*2\\sigma\(2x\)\s*-\s*1/.test(''),
  'tanh identity: 2σ(2x) - 1 is the correct identity IF σ is the standard logistic sigmoid');

// 2. Check lines for common factual claims
const lines = [
  ['math/Trig/Exact', 'sin 30° = 1/2', 'sin 30° = 1/2 ✓'],
  ['math/Trig/Exact', 'cos 60° = 1/2', 'cos 60° = 1/2 ✓'],
  ['math/Trig/Exact', 'sin 45° = √2/2', 'sin 45° = √2/2 ✓'],
  ['math/Trig/Exact', 'tan 60° = √3', 'tan 60° = √3 ✓'],
  ['calc/Derivatives/d arctan', '1/(1+x²)', '✓'],
  ['calc/Derivatives/d arcsin', '1/√(1-x²)', '✓'],
  ['calc/Derivatives/d arccos', '-1/√(1-x²)', 'MISSING — should be in cheatsheet'],
  ['calc/Derivatives/d arccot', '-1/(1+x²)', 'MISSING — should be in cheatsheet'],
  ['la/Systems/least squares', '(AᵀA)⁻¹Aᵀb', '✓ standard OLS'],
  ['la/Eigen/char poly', 'det(A - λI) = 0', '✓'],
  ['la/Eigen/trace', 'Σ λᵢ', '✓'],
  ['ml/Regression/Ridge', 'λ||w||²', '✓'],
  ['ml/Classification/SVM', 'hard-margin formulation', 'no soft-margin ξ mentioned — could add'],
  ['ml/Classification/Naive Bayes', 'P(y|x) ∝ P(y) ∏P(xᵢ|y)', 'subscript i is missing on ∏'],
  ['dl/Activations/tanh', '2σ(2x) - 1', 'correct but unusual form, could also write (eˣ-e⁻ˣ)/(eˣ+e⁻ˣ)'],
  ['dl/Activations/GELU', 'x · Φ(x)', '✓ (Φ is standard normal CDF)'],
  ['dl/Activations/Swish', 'x · σ(βx)', '✓'],
  ['dl/Regularization/Dropout', 'zero out each activation with prob p', 'no Bernoulli mask math — could add'],
  ['dl/Architectures/LSTM', 'forget/input/output gates', 'no gate equations — could add'],
  ['dl/Architectures/Transformer', 'attention is all you need', '✓ reference'],
  ['dl/Loss/Focal', '-(1-pₜ)^γ log pₜ', '✓'],
  ['dl/Loss/Huber', 'quadratic near 0, linear in tails', 'MISSING from DL cheatsheet (only in ML)'],
  ['llm/Decoding/length penalty', '|y|^α / (α + |y|)', '✓ (Wu et al. 2016 form)'],
  ['llm/Decoding/repetition penalty', 'divide logit of already-seen tokens by r > 1', '✓'],
  ['prob/Core/Independence vs Cov', 'Independent ⇒ Cov = 0 (NOT the converse!)', '✓ good note'],
  ['prob/Estimation/MAP', 'argmax_θ log P(data|θ) + log P(θ)', 'subscript θ missing in argmax'],
  ['prob/Estimation/95% CI', '1.96 σ/√n', 'two-sided 95% ✓'],
  ['prog/Graph/Bellman-Ford', 'O(VE)', '✓'],
  ['prog/Recurrences/Master Case 1', 'f(n) = O(n^(log_b a - ε))', '✓'],
  ['oop/SOLID/LSP example', 'Square subclass of Rectangle breaks invariants', '✓ classic example'],
  ['oop/UML/dashed arrow', 'dependency (uses-a)', '✓'],
  ['oop/UML/open diamond', 'aggregation (weak has-a)', '✓'],
  ['oop/UML/filled diamond', 'composition (strong has-a, owns lifecycle)', '✓'],
  ['calc/Integration/parts', '∫u dv = uv - ∫v du', '✓'],
];

for (const [where, claim, verdict] of lines) {
  console.log(`${verdict.startsWith('MISSING') ? '⚠' : '✓'}  ${where} — ${claim}: ${verdict}`);
}
console.log(`\nTotal flagged: ${lines.filter(l => l[2].startsWith('MISSING') || l[2].startsWith('⚠')).length}`);