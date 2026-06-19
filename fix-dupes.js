const fs = require('fs');
const path = 'D:/Development/GikiTest/data.js';
let c = fs.readFileSync(path, 'utf8');

const evalStr = 'var w={};' + c
  .replace('const CATEGORIES', 'w.CATEGORIES')
  .replace('const CONCEPTS', 'w.CONCEPTS')
  .replace('const QUESTIONS', 'w.QUESTIONS')
  .replace('const CHEATSHEETS', 'w.CHEATSHEETS');
eval(evalStr);

const domainDistractors = {
  llm: ["Train","Inference","Pretrain","Fine-tune","Evaluate","Quantize","Compress","Align","Decode","Encode","Embed","Tokenize","Sample","Greedy","Beam","Top-k","Temperature","Penalize","Cache","Stream","Batched","Cached","Recurrent","Parallel","SFT","RLHF","DPO","LoRA","PEFT","RAG","Agent","Tool-use","Context","Prompt","Completion","Embedding","Logit","Probability","Entropy","Loss"],
  nlp: ["Stemming","Lemmatization","Tokenization","Vectorization","Embedding","BPE","Word2Vec","GloVe","FastText","BERT","GPT","T5","ELMo","CoVe","Bag-of-Words","TF-IDF","Cosine","Jaccard","BLEU","ROUGE","F1","EM"],
  dl: ["Forward","Backward","ReLU","Sigmoid","Tanh","Softmax","GELU","Swish","SGD","Adam","RMSProp","Momentum","AdamW","AdaGrad","Dropout","BatchNorm","LayerNorm","GroupNorm","CNN","RNN","LSTM","GRU","Transformer","MLP","ResNet","U-Net"],
  ml: ["Linear","Logistic","Decision Tree","Random Forest","XGBoost","SVM","k-NN","Bagging","Boosting","Stacking","Naive Bayes","PCA","t-SNE","k-Means","DBSCAN","Hierarchical","MSE","MAE","Cross-Entropy","Hinge","Huber","F1","AUC"],
  oop: ["Class","Object","Instance","Method","Attribute","Interface","Abstract","Inheritance","Composition","Aggregation","Polymorphism","Encapsulation"],
  prog: ["Stack","Queue","Heap","Tree","Graph","Array","Linked list","Hash table","Bubble sort","Merge sort","Quick sort","Heap sort","Binary search","Recursion","Iteration","Memoization","Backtracking","Greedy","DP"],
  prob: ["Bernoulli","Binomial","Poisson","Normal","Exponential","Uniform","t","Chi-square","Bayes","MLE","MAP","EM","Bootstrap","p-value"],
  la: ["Identity","Zero matrix","Diagonal","Triangular","Symmetric","Skew-symmetric","Orthogonal","Positive definite","Singular","Full rank"],
  math: ["Sum","Product","Limit","Derivative","Integral","Series","Convergent","Divergent","Polynomial","Exponential","Trigonometric"],
  calc: ["Linear","Quadratic","Cubic","Polynomial","Rational","Trigonometric","Exponential","Logarithmic","Differentiate","Integrate","Convergent","Divergent"]
};

let fixed = 0;
for (const q of w.QUESTIONS) {
  const counts = {};
  for (const o of q.opts) counts[o] = (counts[o] || 0) + 1;
  if (!Object.values(counts).some(v => v > 1)) continue;
  const pool = domainDistractors[q.cat] || domainDistractors.llm;
  const seed = q.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const shuffled = pool.slice().sort((a, b) => ((seed * (a.charCodeAt(0) + 1)) % 100) - ((seed * (b.charCodeAt(0) + 1)) % 100));
  const seen = new Set();
  const newOpts = [];
  let pi = 0;
  for (let i = 0; i < q.opts.length; i++) {
    const o = q.opts[i];
    if (counts[o] > 1) {
      let d = null;
      while (pi < shuffled.length * 4 && (d === null || seen.has(d))) {
        d = shuffled[pi % shuffled.length] + (pi >= shuffled.length ? " (alt)" : "");
        pi++;
      }
      if (!d) d = "Option " + i;
      newOpts.push(d);
      seen.add(d);
    } else {
      let v = o;
      let suffix = 0;
      while (seen.has(v)) { v = o + " (" + (++suffix) + ")"; }
      newOpts.push(v);
      seen.add(v);
    }
  }
  q.opts = newOpts;
  fixed++;
}
console.log('Fixed:', fixed);

const lines = c.split('\n');
for (const q of w.QUESTIONS) {
  let inQ = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('id:"' + q.id + '"')) { inQ = i; break; }
  }
  if (inQ < 0) continue;
  for (let j = inQ; j < Math.min(inQ + 5, lines.length); j++) {
    if (/opts:\[/.test(lines[j])) {
      const newOptsStr = q.opts.map(o => '"' + o.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',');
      const indent = lines[j].match(/^\s*/)[0];
      lines[j] = indent + 'opts:[' + newOptsStr + '],';
      break;
    }
  }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Written, length', lines.join('\n').length);
