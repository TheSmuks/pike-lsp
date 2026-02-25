export const SMALL_CORPUS = {
  uri: 'file:///tmp/qe2-corpus-small.pike',
  filename: '/tmp/qe2-corpus-small.pike',
  text: 'int root = 1;\nint value = root;\nroot = value + root;\n',
};

export const MEDIUM_CORPUS = {
  uri: 'file:///tmp/qe2-corpus-medium.pike',
  filename: '/tmp/qe2-corpus-medium.pike',
  text:
    'class Calculator {\n' +
    '  int add(int a, int b) { return a + b; }\n' +
    '  int mul(int a, int b) { return a * b; }\n' +
    '}\n' +
    'int compute() {\n' +
    '  object c = Calculator();\n' +
    '  return c->add(2, 3) + c->mul(4, 5);\n' +
    '}\n',
};

export const LARGE_CORPUS = {
  uri: 'file:///tmp/qe2-corpus-large.pike',
  filename: '/tmp/qe2-corpus-large.pike',
  text: Array.from({ length: 220 }, (_, i) => {
    if (i % 11 === 0) {
      return `int fn_${i}(int x) { return x + ${i}; }`;
    }
    if (i % 7 === 0) {
      return `string s_${i} = "line_${i}";`;
    }
    return `int v_${i} = ${i};`;
  }).join('\n'),
};

export const BENCHMARK_CORPUS = [SMALL_CORPUS, MEDIUM_CORPUS, LARGE_CORPUS] as const;
