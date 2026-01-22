//! Medium fixture for benchmarking (~100 lines)
import Stdio;

class DataProcessor {
  mapping(string:mixed) data = ([]);
  int processed_count = 0;

  void create(mapping(string:mixed) initial_data) {
    data = initial_data;
  }

  void add_item(string key, mixed value) {
    data[key] = value;
  }

  mixed get_item(string key) {
    return data[key];
  }

  void process_all() {
    foreach(data; string k; mixed v) {
      process_item(k, v);
      processed_count++;
    }
  }

  protected void process_item(string k, mixed v) {
    if (stringp(v)) {
      data[k] = upper_case(v);
    } else if (intp(v)) {
      data[k] = v * 2;
    }
  }

  int get_count() {
    return processed_count;
  }
}

class ExtendedProcessor {
  inherit DataProcessor;

  float multiplier = 1.5;

  void set_multiplier(float m) {
    multiplier = m;
  }

  protected void process_item(string k, mixed v) {
    if (floatp(v)) {
      data[k] = v * multiplier;
    } else {
      ::process_item(k, v);
    }
  }
}

int main() {
  mapping test_data = ([
    "name": "pike lsp",
    "version": 3,
    "ratio": 0.5,
    "active": 1
  ]);

  object p = ExtendedProcessor(test_data);
  p->set_multiplier(2.5);
  p->process_all();

  write("Processed %d items\n", p->get_count());
  write("Name: %s\n", p->get_item("name"));
  write("Ratio: %f\n", p->get_item("ratio"));

  return 0;
}
