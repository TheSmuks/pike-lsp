//! Main class that inherits from utils - for dependency tracking tests
inherit "lib/utils.pike";

class Main {
    void run() {
        object utils = Utils();
        string greeting = utils->get_greeting();
    }
}
