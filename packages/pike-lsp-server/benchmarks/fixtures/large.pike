//! Large fixture for benchmarking (~1000 lines)

class BaseComponent {
  string name;
  int id;
  
  void create(string _name, int _id) {
    name = _name;
    id = _id;
  }
  
  string get_name() { return name; }
  int get_id() { return id; }
  void set_name(string n) { name = n; }
}

class Component1 {
  inherit BaseComponent;
  int value_1;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_1 = v;
  }
  
  int get_value() { return value_1; }
  void set_value(int v) { value_1 = v; }
  
  string process_1(string input) {
    return sprintf("comp_1: %s (%d)", input, value_1);
  }
  
  void complex_operation_1(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_1;
    }
  }
}
class Component2 {
  inherit BaseComponent;
  int value_2;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_2 = v;
  }
  
  int get_value() { return value_2; }
  void set_value(int v) { value_2 = v; }
  
  string process_2(string input) {
    return sprintf("comp_2: %s (%d)", input, value_2);
  }
  
  void complex_operation_2(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_2;
    }
  }
}
class Component3 {
  inherit BaseComponent;
  int value_3;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_3 = v;
  }
  
  int get_value() { return value_3; }
  void set_value(int v) { value_3 = v; }
  
  string process_3(string input) {
    return sprintf("comp_3: %s (%d)", input, value_3);
  }
  
  void complex_operation_3(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_3;
    }
  }
}
class Component4 {
  inherit BaseComponent;
  int value_4;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_4 = v;
  }
  
  int get_value() { return value_4; }
  void set_value(int v) { value_4 = v; }
  
  string process_4(string input) {
    return sprintf("comp_4: %s (%d)", input, value_4);
  }
  
  void complex_operation_4(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_4;
    }
  }
}
class Component5 {
  inherit BaseComponent;
  int value_5;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_5 = v;
  }
  
  int get_value() { return value_5; }
  void set_value(int v) { value_5 = v; }
  
  string process_5(string input) {
    return sprintf("comp_5: %s (%d)", input, value_5);
  }
  
  void complex_operation_5(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_5;
    }
  }
}
class Component6 {
  inherit BaseComponent;
  int value_6;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_6 = v;
  }
  
  int get_value() { return value_6; }
  void set_value(int v) { value_6 = v; }
  
  string process_6(string input) {
    return sprintf("comp_6: %s (%d)", input, value_6);
  }
  
  void complex_operation_6(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_6;
    }
  }
}
class Component7 {
  inherit BaseComponent;
  int value_7;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_7 = v;
  }
  
  int get_value() { return value_7; }
  void set_value(int v) { value_7 = v; }
  
  string process_7(string input) {
    return sprintf("comp_7: %s (%d)", input, value_7);
  }
  
  void complex_operation_7(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_7;
    }
  }
}
class Component8 {
  inherit BaseComponent;
  int value_8;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_8 = v;
  }
  
  int get_value() { return value_8; }
  void set_value(int v) { value_8 = v; }
  
  string process_8(string input) {
    return sprintf("comp_8: %s (%d)", input, value_8);
  }
  
  void complex_operation_8(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_8;
    }
  }
}
class Component9 {
  inherit BaseComponent;
  int value_9;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_9 = v;
  }
  
  int get_value() { return value_9; }
  void set_value(int v) { value_9 = v; }
  
  string process_9(string input) {
    return sprintf("comp_9: %s (%d)", input, value_9);
  }
  
  void complex_operation_9(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_9;
    }
  }
}
class Component10 {
  inherit BaseComponent;
  int value_10;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_10 = v;
  }
  
  int get_value() { return value_10; }
  void set_value(int v) { value_10 = v; }
  
  string process_10(string input) {
    return sprintf("comp_10: %s (%d)", input, value_10);
  }
  
  void complex_operation_10(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_10;
    }
  }
}
class Component11 {
  inherit BaseComponent;
  int value_11;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_11 = v;
  }
  
  int get_value() { return value_11; }
  void set_value(int v) { value_11 = v; }
  
  string process_11(string input) {
    return sprintf("comp_11: %s (%d)", input, value_11);
  }
  
  void complex_operation_11(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_11;
    }
  }
}
class Component12 {
  inherit BaseComponent;
  int value_12;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_12 = v;
  }
  
  int get_value() { return value_12; }
  void set_value(int v) { value_12 = v; }
  
  string process_12(string input) {
    return sprintf("comp_12: %s (%d)", input, value_12);
  }
  
  void complex_operation_12(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_12;
    }
  }
}
class Component13 {
  inherit BaseComponent;
  int value_13;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_13 = v;
  }
  
  int get_value() { return value_13; }
  void set_value(int v) { value_13 = v; }
  
  string process_13(string input) {
    return sprintf("comp_13: %s (%d)", input, value_13);
  }
  
  void complex_operation_13(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_13;
    }
  }
}
class Component14 {
  inherit BaseComponent;
  int value_14;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_14 = v;
  }
  
  int get_value() { return value_14; }
  void set_value(int v) { value_14 = v; }
  
  string process_14(string input) {
    return sprintf("comp_14: %s (%d)", input, value_14);
  }
  
  void complex_operation_14(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_14;
    }
  }
}
class Component15 {
  inherit BaseComponent;
  int value_15;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_15 = v;
  }
  
  int get_value() { return value_15; }
  void set_value(int v) { value_15 = v; }
  
  string process_15(string input) {
    return sprintf("comp_15: %s (%d)", input, value_15);
  }
  
  void complex_operation_15(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_15;
    }
  }
}
class Component16 {
  inherit BaseComponent;
  int value_16;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_16 = v;
  }
  
  int get_value() { return value_16; }
  void set_value(int v) { value_16 = v; }
  
  string process_16(string input) {
    return sprintf("comp_16: %s (%d)", input, value_16);
  }
  
  void complex_operation_16(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_16;
    }
  }
}
class Component17 {
  inherit BaseComponent;
  int value_17;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_17 = v;
  }
  
  int get_value() { return value_17; }
  void set_value(int v) { value_17 = v; }
  
  string process_17(string input) {
    return sprintf("comp_17: %s (%d)", input, value_17);
  }
  
  void complex_operation_17(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_17;
    }
  }
}
class Component18 {
  inherit BaseComponent;
  int value_18;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_18 = v;
  }
  
  int get_value() { return value_18; }
  void set_value(int v) { value_18 = v; }
  
  string process_18(string input) {
    return sprintf("comp_18: %s (%d)", input, value_18);
  }
  
  void complex_operation_18(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_18;
    }
  }
}
class Component19 {
  inherit BaseComponent;
  int value_19;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_19 = v;
  }
  
  int get_value() { return value_19; }
  void set_value(int v) { value_19 = v; }
  
  string process_19(string input) {
    return sprintf("comp_19: %s (%d)", input, value_19);
  }
  
  void complex_operation_19(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_19;
    }
  }
}
class Component20 {
  inherit BaseComponent;
  int value_20;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_20 = v;
  }
  
  int get_value() { return value_20; }
  void set_value(int v) { value_20 = v; }
  
  string process_20(string input) {
    return sprintf("comp_20: %s (%d)", input, value_20);
  }
  
  void complex_operation_20(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_20;
    }
  }
}
class Component21 {
  inherit BaseComponent;
  int value_21;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_21 = v;
  }
  
  int get_value() { return value_21; }
  void set_value(int v) { value_21 = v; }
  
  string process_21(string input) {
    return sprintf("comp_21: %s (%d)", input, value_21);
  }
  
  void complex_operation_21(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_21;
    }
  }
}
class Component22 {
  inherit BaseComponent;
  int value_22;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_22 = v;
  }
  
  int get_value() { return value_22; }
  void set_value(int v) { value_22 = v; }
  
  string process_22(string input) {
    return sprintf("comp_22: %s (%d)", input, value_22);
  }
  
  void complex_operation_22(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_22;
    }
  }
}
class Component23 {
  inherit BaseComponent;
  int value_23;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_23 = v;
  }
  
  int get_value() { return value_23; }
  void set_value(int v) { value_23 = v; }
  
  string process_23(string input) {
    return sprintf("comp_23: %s (%d)", input, value_23);
  }
  
  void complex_operation_23(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_23;
    }
  }
}
class Component24 {
  inherit BaseComponent;
  int value_24;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_24 = v;
  }
  
  int get_value() { return value_24; }
  void set_value(int v) { value_24 = v; }
  
  string process_24(string input) {
    return sprintf("comp_24: %s (%d)", input, value_24);
  }
  
  void complex_operation_24(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_24;
    }
  }
}
class Component25 {
  inherit BaseComponent;
  int value_25;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_25 = v;
  }
  
  int get_value() { return value_25; }
  void set_value(int v) { value_25 = v; }
  
  string process_25(string input) {
    return sprintf("comp_25: %s (%d)", input, value_25);
  }
  
  void complex_operation_25(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_25;
    }
  }
}
class Component26 {
  inherit BaseComponent;
  int value_26;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_26 = v;
  }
  
  int get_value() { return value_26; }
  void set_value(int v) { value_26 = v; }
  
  string process_26(string input) {
    return sprintf("comp_26: %s (%d)", input, value_26);
  }
  
  void complex_operation_26(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_26;
    }
  }
}
class Component27 {
  inherit BaseComponent;
  int value_27;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_27 = v;
  }
  
  int get_value() { return value_27; }
  void set_value(int v) { value_27 = v; }
  
  string process_27(string input) {
    return sprintf("comp_27: %s (%d)", input, value_27);
  }
  
  void complex_operation_27(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_27;
    }
  }
}
class Component28 {
  inherit BaseComponent;
  int value_28;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_28 = v;
  }
  
  int get_value() { return value_28; }
  void set_value(int v) { value_28 = v; }
  
  string process_28(string input) {
    return sprintf("comp_28: %s (%d)", input, value_28);
  }
  
  void complex_operation_28(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_28;
    }
  }
}
class Component29 {
  inherit BaseComponent;
  int value_29;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_29 = v;
  }
  
  int get_value() { return value_29; }
  void set_value(int v) { value_29 = v; }
  
  string process_29(string input) {
    return sprintf("comp_29: %s (%d)", input, value_29);
  }
  
  void complex_operation_29(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_29;
    }
  }
}
class Component30 {
  inherit BaseComponent;
  int value_30;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_30 = v;
  }
  
  int get_value() { return value_30; }
  void set_value(int v) { value_30 = v; }
  
  string process_30(string input) {
    return sprintf("comp_30: %s (%d)", input, value_30);
  }
  
  void complex_operation_30(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_30;
    }
  }
}
class Component31 {
  inherit BaseComponent;
  int value_31;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_31 = v;
  }
  
  int get_value() { return value_31; }
  void set_value(int v) { value_31 = v; }
  
  string process_31(string input) {
    return sprintf("comp_31: %s (%d)", input, value_31);
  }
  
  void complex_operation_31(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_31;
    }
  }
}
class Component32 {
  inherit BaseComponent;
  int value_32;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_32 = v;
  }
  
  int get_value() { return value_32; }
  void set_value(int v) { value_32 = v; }
  
  string process_32(string input) {
    return sprintf("comp_32: %s (%d)", input, value_32);
  }
  
  void complex_operation_32(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_32;
    }
  }
}
class Component33 {
  inherit BaseComponent;
  int value_33;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_33 = v;
  }
  
  int get_value() { return value_33; }
  void set_value(int v) { value_33 = v; }
  
  string process_33(string input) {
    return sprintf("comp_33: %s (%d)", input, value_33);
  }
  
  void complex_operation_33(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_33;
    }
  }
}
class Component34 {
  inherit BaseComponent;
  int value_34;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_34 = v;
  }
  
  int get_value() { return value_34; }
  void set_value(int v) { value_34 = v; }
  
  string process_34(string input) {
    return sprintf("comp_34: %s (%d)", input, value_34);
  }
  
  void complex_operation_34(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_34;
    }
  }
}
class Component35 {
  inherit BaseComponent;
  int value_35;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_35 = v;
  }
  
  int get_value() { return value_35; }
  void set_value(int v) { value_35 = v; }
  
  string process_35(string input) {
    return sprintf("comp_35: %s (%d)", input, value_35);
  }
  
  void complex_operation_35(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_35;
    }
  }
}
class Component36 {
  inherit BaseComponent;
  int value_36;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_36 = v;
  }
  
  int get_value() { return value_36; }
  void set_value(int v) { value_36 = v; }
  
  string process_36(string input) {
    return sprintf("comp_36: %s (%d)", input, value_36);
  }
  
  void complex_operation_36(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_36;
    }
  }
}
class Component37 {
  inherit BaseComponent;
  int value_37;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_37 = v;
  }
  
  int get_value() { return value_37; }
  void set_value(int v) { value_37 = v; }
  
  string process_37(string input) {
    return sprintf("comp_37: %s (%d)", input, value_37);
  }
  
  void complex_operation_37(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_37;
    }
  }
}
class Component38 {
  inherit BaseComponent;
  int value_38;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_38 = v;
  }
  
  int get_value() { return value_38; }
  void set_value(int v) { value_38 = v; }
  
  string process_38(string input) {
    return sprintf("comp_38: %s (%d)", input, value_38);
  }
  
  void complex_operation_38(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_38;
    }
  }
}
class Component39 {
  inherit BaseComponent;
  int value_39;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_39 = v;
  }
  
  int get_value() { return value_39; }
  void set_value(int v) { value_39 = v; }
  
  string process_39(string input) {
    return sprintf("comp_39: %s (%d)", input, value_39);
  }
  
  void complex_operation_39(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_39;
    }
  }
}
class Component40 {
  inherit BaseComponent;
  int value_40;
  
  void create(string n, int id, int v) {
    ::create(n, id);
    value_40 = v;
  }
  
  int get_value() { return value_40; }
  void set_value(int v) { value_40 = v; }
  
  string process_40(string input) {
    return sprintf("comp_40: %s (%d)", input, value_40);
  }
  
  void complex_operation_40(mapping m) {
    foreach(m; string k; mixed v) {
      if(intp(v)) m[k] = v + value_40;
    }
  }
}
int main() {
  array(object) components = ({});
  for(int i=0; i<40; i++) {
    // We use a trick to instantiate classes by name or just use them
  }
  return 0;
}
