int shared_var = 10;

void caller() {
  int x = shared_var;
  callee(x);
}

void callee(int arg) {
  write(arg);
  write(shared_var);
}
