//! RXML.pike - Stub module for RXML (Roxen XML) framework LSP support
//!
//! Provides minimal stub implementations of RXML classes to allow
//! Pike code using RXML APIs to compile during LSP analysis.

//! RXML.Tag flag constants (Roxen 6.1)
constant FLAG_EMPTY_ELEMENT = 1 << 0;      // Tag has no closing
constant FLAG_STREAM_CONTENT = 1 << 1;     // Stream tag content
constant FLAG_DONT_REPORT_RESULT = 1 << 2; // Don't report result

//! RXML.Tag stub - base class for RXML tags
//! In real Roxen, this is used to create custom RXML tags
class Tag {
    string name = "";
    mapping(string:mixed) args = ([]);
    int flags = 0;

    void create(string|int n, void|mapping a) {
        name = (string)n;
        args = a || ([]);
    }
}

//! RXML.TagSet stub - collection of RXML tags
//! In real Roxen, this manages tag namespaces and containers
class TagSet {
    string name = "";
    array(Tag) tags = ({});

    void create(string n, void|array(Tag) t) {
        name = n;
        tags = t || ({});
    }

    void add_tag(Tag t) {
        tags += ({t});
    }

    Tag get_tag(string name) {
        foreach (tags; Tag t) {
            if (t->name == name) return t;
        }
        return 0;
    }

    void remove_tag(string name) {
        tags = filter(tags, lambda(Tag t) { return t->name != name; });
    }

    void register_tag(Tag t) {
        remove_tag(t->name);
        add_tag(t);
    }
}

//! RXML.PXml stub - XML parser utility
//! In real Roxen, this parses XML/RXML content
class PXml {
    string data = "";
    mixed ctx;

    void create(string d, void|mixed c) {
        data = d;
        ctx = c;
    }

    string get_xml() { return data; }
}

//! RXML.Roxen stub - main RXML namespace
class Roxen {
    static TagSet default_set = TagSet("default");
}
