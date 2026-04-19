#pragma strict_types

//! LSP Foundation Tests (PUnit)
//!
//! Unit tests for LSP.pmod foundation modules:
//! - Compat.pmod: Version detection and polyfills
//! - Cache.pmod: LRU caching with statistics
//!
//! Run with: pike -M test/lib/punit -M pike-scripts run_tests.pike test/punit/foundation-tests.pike

#include <PUnit.pmod/macros.h>
import PUnit;
inherit PUnit.TestCase;

constant test_tags = ([
	"test_compat_pike_version": ({"compat", "version"}),
	"test_compat_pi_version_constant": ({"compat", "version"}),
	"test_compat_trim_whites_basic": ({"compat", "trim"}),
	"test_compat_trim_whites_tabs_and_newlines": ({"compat", "trim"}),
	"test_compat_trim_whites_empty": ({"compat", "trim"}),
	"test_compat_trim_whites_preserves_internal": ({"compat", "trim"}),
	"test_cache_program_put_get": ({"cache", "lru"}),
	"test_cache_stdlib_put_get": ({"cache"}),
	"test_cache_clear": ({"cache"}),
	"test_cache_program_lru_eviction": ({"cache", "lru"}),
	"test_cache_statistics": ({"cache", "stats"}),
	"test_cache_set_limits": ({"cache"}),
	"test_cache_clear_all": ({"cache"}),
]);

// ─── Helpers ──────────────────────────────────────────────────────

private mixed get_compat() {
	return master()->resolv("LSP.Compat");
}

private mixed get_cache() {
	return master()->resolv("LSP.Cache");
}

void setup() {
	// Ensure pike-scripts/ is on the module path
	string base = __FILE__;
	for (int i = 0; i < 10; i++) {
		base = dirname(base);
		if (basename(base) == "pike-lsp") break;
	}
	string pike_scripts = combine_path(base, "pike-scripts");
	master()->add_module_path(pike_scripts);
}

// ─── Compat.pmod Tests ────────────────────────────────────────────

void test_compat_pike_version() {
	mixed compat = get_compat();
	array version = compat->pike_version();
	assert_gte(sizeof(version), 3);
	assert_gte(version[0], 7);
	// Must be 7.6, 7.8, or 8.x
	assert_true(
		(version[0] == 7 && (version[1] == 6 || version[1] == 8)) ||
		version[0] == 8
	);
}

void test_compat_pi_version_constant() {
	mixed compat = get_compat();
	string version_str = compat->PIKE_VERSION_STRING;
	assert_true(stringp(version_str) && sizeof(version_str) > 0);
	assert_match("^[0-9]+\\.[0-9]+$", version_str);
}

void test_compat_trim_whites_basic() {
	mixed compat = get_compat();
	assert_equal("test", compat->trim_whites("  test"));
	assert_equal("test", compat->trim_whites("test  "));
	assert_equal("test", compat->trim_whites("  test  "));
}

void test_compat_trim_whites_tabs_and_newlines() {
	mixed compat = get_compat();
	assert_equal("test", compat->trim_whites("\ttest\t"));
	assert_equal("test", compat->trim_whites("\ntest\n"));
	assert_equal("test", compat->trim_whites(" \n\t test \t\n "));
}

void test_compat_trim_whites_empty() {
	mixed compat = get_compat();
	assert_equal("", compat->trim_whites(""));
	assert_equal("", compat->trim_whites("   "));
}

void test_compat_trim_whites_preserves_internal() {
	mixed compat = get_compat();
	assert_equal("hello  world", compat->trim_whites("  hello  world  "));
}

// ─── Cache.pmod Tests ─────────────────────────────────────────────

void test_cache_program_put_get() {
	mixed cache = get_cache();
	cache->clear("program_cache");

	cache->put("program_cache", "key1", "program1");
	assert_equal("program1", cache->get("program_cache", "key1"));
	assert_null(cache->get("program_cache", "nonexistent"));
}

void test_cache_stdlib_put_get() {
	mixed cache = get_cache();
	cache->clear("stdlib_cache");

	mapping data = (["symbols": (["foo": "bar"])]);
	cache->put("stdlib_cache", "module1", data);
	mixed result = cache->get("stdlib_cache", "module1");
	assert_true(mappingp(result));
	assert_equal("bar", result->symbols->foo);
}

void test_cache_clear() {
	mixed cache = get_cache();
	cache->clear("program_cache");

	cache->put("program_cache", "key1", "value1");
	cache->put("program_cache", "key2", "value2");
	cache->clear("program_cache");

	assert_null(cache->get("program_cache", "key1"));
	assert_null(cache->get("program_cache", "key2"));
}

void test_cache_program_lru_eviction() {
	mixed cache = get_cache();
	cache->clear("program_cache");
	cache->set_limits(3, 50);

	cache->put("program_cache", "key1", "value1");
	cache->put("program_cache", "key2", "value2");
	cache->put("program_cache", "key3", "value3");

	// Access key1 to make it recently used (key2 becomes LRU)
	cache->get("program_cache", "key1");

	// Add one more — should evict key2
	cache->put("program_cache", "key4", "value4");

	assert_null(cache->get("program_cache", "key2"));
	assert_equal("value1", cache->get("program_cache", "key1"));
	assert_equal("value3", cache->get("program_cache", "key3"));
	assert_equal("value4", cache->get("program_cache", "key4"));
}

void test_cache_statistics() {
	mixed cache = get_cache();
	cache->clear("program_cache");
	cache->clear("stdlib_cache");

	mapping stats = cache->get_stats();
	assert_equal(0, stats->program_size);

	cache->put("program_cache", "key1", "value1");
	cache->put("program_cache", "key2", "value2");
	cache->get("program_cache", "key1");   // hit
	cache->get("program_cache", "missing"); // miss

	stats = cache->get_stats();
	assert_equal(2, stats->program_size);
	assert_gte(stats->program_hits, 1);
	assert_gte(stats->program_misses, 1);
}

void test_cache_set_limits() {
	mixed cache = get_cache();
	cache->set_limits(5, 10);
	mapping stats = cache->get_stats();
	assert_equal(5, stats->program_max);
	assert_equal(10, stats->stdlib_max);
}

void test_cache_clear_all() {
	mixed cache = get_cache();
	cache->put("program_cache", "key1", "value1");
	cache->put("stdlib_cache", "module1", (["data": "test"]));

	cache->clear("all");

	mapping stats = cache->get_stats();
	assert_equal(0, stats->program_size);
	assert_equal(0, stats->stdlib_size);
}
