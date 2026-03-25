// Deliberately mis-formatted Pike code for formatter e2e tests.
// Tests use positionForRegex() to locate lines, so line numbers do not need to be stable.
void top_level_function() {
int top_a = 1;
string top_b = "hello";
if (top_a > 0) {
int top_c = 2;
}
}

class FormattingClass {
void class_method() {
int class_x = 1;
if (class_x > 0) {
int class_y = 2;
}
}
}
