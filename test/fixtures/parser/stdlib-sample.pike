//! Sample from Pike stdlib for integration testing
//! This mimics common patterns found in Pike's standard library

//! Get port options mapping for server configuration
mapping(string:mixed) get_port_options(int port) {
    mapping(string:mixed) opts = ([
        "port": port,
        "reuse": 1,
    ]);

    return opts;
}

//! Parse a command string into arguments
array(string) parse_command(string cmd) {
    array parts = cmd / " ";
    return filter(parts, lambda(string s) { return sizeof(s) > 0; });
}

//! A simple class representing a connection
class Connection {
    //! Host name
    string host;

    //! Port number
    int port;

    //! Create a new connection
    void create(string _host, int _port) {
        host = _host;
        port = _port;
    }

    //! Connect to the host
    int connect() {
        return 1;
    }

    //! Disconnect from the host
    void disconnect() {
        host = 0;
        port = 0;
    }
}

//! Constant for default timeout
constant DEFAULT_TIMEOUT = 30;

//! Enumeration for connection states
enum ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
};
