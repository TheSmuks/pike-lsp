//! Test fixture for completion context

class MyClass {
    int value;

    void create() {
        value = 42;
    }

    void method() {
        // Member access: this->value
        // Should detect: context=member_access, operator=->, objectName=this
    }
}

Module->function();  // Scope access

void test_plain() {
    int identifie  // Cursor here -> plain identifier completion
}

// Arrow member access
void test_arrow_access() {
    object obj = MyClass();
    obj->  // Cursor here -> member access completion
}

// Dot member access (allowed in Pike for some types)
void test_dot_access() {
    mapping m = ([]);
    m->  // Cursor here -> member access completion
}

// Scope access
void test_scope_access() {
    Module::  // Cursor here -> scope access completion
}
