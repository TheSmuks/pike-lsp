// Test file for Pike LSP extension
// This file contains various Pike constructs to test diagnostics and symbols

// Variables
int counter = 0;
string message = "Hello, Pike!";
float ratio = 3.14;

// Array and mapping types
array(int) numbers = ({ 1, 2, 3, 4, 5 });
mapping(string:int) word_counts = ([]);

// Stdlib file handle for testing completion
Stdio.File file;

// Function with arguments
void greet(string name, int times) {
  for (int i = 0; i < times; i++) {
    write("Hello, %s!\n", name);
  }
}

// Function with return type
int factorial(int n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

// Class definition
class Person {
  string name;
  int age;
  
  void create(string _name, int _age) {
    name = _name;
    age = _age;
  }
  
  string describe() {
    return sprintf("%s is %d years old", name, age);
  }
}

// Constant
constant VERSION = "1.0.0";

// Typedef
typedef function(int, int: int) BinaryOp;

// Main function
int main(int argc, array(string) argv) {
  write("Pike LSP Test\n");

  Person p = Person("Alice", 30);
  write("%s\n", p->describe());

  greet("World", 3);
  write("5! = %d\n", factorial(5));

  // Test stdlib file completion
  Stdio.File f = Stdio.File();
  f->write("test\n");

  return 0;
}

// This line has a syntax error to test diagnostics:
// int broken = ;
