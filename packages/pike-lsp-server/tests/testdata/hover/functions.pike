//! Add two numbers
//! @param a First number
//! @param b Second number
//! @returns Sum of a and b
int add(int a, int b) {
  return a + b;
}

//! Greet someone
void greet(string name) {
  write("Hello, " + name + "!\n");
}

class Calculator {
  int acc = 0;
  void add(int n) { acc += n; }
  int get() { return acc; }
}
