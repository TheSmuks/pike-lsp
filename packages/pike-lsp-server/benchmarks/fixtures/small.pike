//! Small fixture for benchmarking
class Small {
  int x;
  void create(int _x) {
    x = _x;
  }
  int get_x() {
    return x;
  }
}

int main() {
  object s = Small(42);
  write("Value: %d\n", s->get_x());
  return 0;
}
