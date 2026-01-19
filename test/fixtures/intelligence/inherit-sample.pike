//! Inheritance fixture for intelligence tests
//! Tests inheritance traversal and get_inherited handler

class BaseClass {
    //! Base method one
    void base_method_one() {
        // Base implementation
    }

    //! Base method two
    int base_method_two(int x) {
        return x * 2;
    }

    constant BASE_CONST = "base";
}

class MixinClass {
    //! Mixin method
    void mixin_method() {
        // Mixin implementation
    }

    int mixin_value = 100;
}

class DerivedClass {
    inherit BaseClass;
    inherit MixinClass;

    //! Derived class method
    void derived_method() {
        // Derived implementation
    }

    //! Override base method
    void base_method_one() {
        // Overridden implementation
    }

    constant DERIVED_CONST = "derived";
}

class MultiLevelDerived {
    inherit DerivedClass;

    void multi_level_method() {
        // Multi-level implementation
    }
}
