#pragma strict_types
class Foo {
  int alpha;
  int beta;
  void gamma() {}
  void delta() {}
}

void test() {
  Foo f = Foo();
  f->  // completions: alpha, beta, gamma, delta
}
