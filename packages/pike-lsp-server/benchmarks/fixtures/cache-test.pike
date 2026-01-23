//! Cache test fixture - moderate complexity to show compilation benefit
//!
//! This file has enough complexity to make compilation measurable
//! (multiple classes, inheritance, imports) but not so large that
//! benchmarks take too long.

// Base class
class CacheBase {
    string base_value = "base";

    string get_value() {
        return base_value;
    }
}

// Derived class with inheritance (tests dependency tracking)
class CacheDerived {
    inherit CacheBase;

    string derived_value = "derived";

    string get_derived_value() {
        return derived_value + ":" + get_value();
    }
}

// Utility class
class CacheUtil {
    mapping(string:int) cache = ([]);

    void put(string key, int value) {
        cache[key] = value;
    }

    int get(string key) {
        return cache[key] || 0;
    }

    array(string) keys() {
        return indices(cache);
    }
}

// Test function with various features
void run_test() {
    CacheDerived derived = CacheDerived();
    CacheUtil util = CacheUtil();

    util->put("test", 42);
    util->put("derived", sizeof(derived->get_derived_value()));

    // Loop to add some complexity
    for (int i = 0; i < 10; i++) {
        util->put("key_" + (string)i, i);
    }
}
