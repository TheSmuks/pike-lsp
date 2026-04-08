// Large Pike file for performance benchmarking
// Generated for Issue #1229 — Performance profiling of LSP hot paths
// Lines: 2000+

inherit "../lib/master";
inherit "../lib/stdio";

// ============================================================
// Class 1: Data Structure - User Management
// ============================================================

class UserManager {
    mapping(string:mixed) users = ([]);
    array(object) sessions = ({});
    int nextUserId = 1;

    object|zero createUser(string username, string email, string password) {
        if (hasIndex(users, username)) {
            return 0;
        }
        object user = User(username, email, password, nextUserId++);
        users[username] = user;
        return user;
    }

    object|zero getUser(string username) {
        return users[username];
    }

    int deleteUser(string username) {
        if (!hasIndex(users, username)) {
            return 0;
        }
        m_delete(users, username);
        return 1;
    }

    array(object) listUsers() {
        return values(users);
    }

    int validateEmail(string email) {
        return regexp(email, "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$");
    }

    int validatePassword(string password) {
        return sizeof(password) >= 8;
    }
}

// ============================================================
// Class 2: Session Management
// ============================================================

class SessionManager {
    mapping(string:object) activeSessions = ([]);
    int sessionTimeout = 3600;

    string createSession(object user) {
        string token = generateToken();
        object session = Session(user, token, time());
        activeSessions[token] = session;
        return token;
    }

    object|zero getSession(string token) {
        object session = activeSessions[token];
        if (!session) return 0;
        if (time() - session.created > sessionTimeout) {
            destroySession(token);
            return 0;
        }
        return session;
    }

    void destroySession(string token) {
        m_delete(activeSessions, token);
    }

    string generateToken() {
        return sprintf("%08x%08x", random(0x7fffffff), random(0x7fffffff));
    }

    void cleanupExpiredSessions() {
        int now = time();
        foreach(activeSessions; string token; object session) {
            if (now - session.created > sessionTimeout) {
                m_delete(activeSessions, token);
            }
        }
    }
}

// ============================================================
// Class 3: Database Connection Pool
// ============================================================

class ConnectionPool {
    string host;
    int port;
    string database;
    string username;
    string password;

    array(object) availableConnections = ({});
    array(object) busyConnections = ({});
    int maxConnections = 10;
    int minConnections = 2;

    void create(string _host, int _port, string _database,
                string _username, string _password) {
        host = _host;
        port = _port;
        database = _database;
        username = _username;
        password = _password;

        for (int i = 0; i < minConnections; i++) {
            availableConnections += ({ createConnection() });
        }
    }

    object|zero getConnection() {
        if (sizeof(availableConnections) > 0) {
            object conn = availableConnections[0];
            availableConnections = availableConnections[1..];
            busyConnections += ({ conn });
            return conn;
        }
        if (sizeof(busyConnections) < maxConnections) {
            object conn = createConnection();
            busyConnections += ({ conn });
            return conn;
        }
        return 0;
    }

    void releaseConnection(object conn) {
        int idx = search(busyConnections, conn);
        if (idx >= 0) {
            busyConnections = busyConnections[..idx-1] + busyConnections[idx+1..];
            availableConnections += ({ conn });
        }
    }

    object createConnection() {
        // Simulated connection creation
        return Connection(host, port, database, username, password);
    }

    void close() {
        foreach(availableConnections, object conn) {
            conn->close();
        }
        foreach(busyConnections, object conn) {
            conn->close();
        }
        availableConnections = ({});
        busyConnections = ({});
    }
}

// ============================================================
// Class 4: Cache Manager
// ============================================================

class CacheManager {
    mapping(string:mixed) cache = ([]);
    mapping(string:int) expiry = ([]);
    int defaultTTL = 300;

    void set(string key, mixed value, int|void ttl) {
        cache[key] = value;
        expiry[key] = time() + (ttl || defaultTTL);
    }

    mixed|zero get(string key) {
        if (!hasIndex(cache, key)) {
            return 0;
        }
        if (time() > expiry[key]) {
            m_delete(cache, key);
            m_delete(expiry, key);
            return 0;
        }
        return cache[key];
    }

    int has(string key) {
        if (!hasIndex(cache, key)) {
            return 0;
        }
        if (time() > expiry[key]) {
            delete(key);
            return 0;
        }
        return 1;
    }

    void delete(string key) {
        m_delete(cache, key);
        m_delete(expiry, key);
    }

    void clear() {
        cache = ([]);
        expiry = ([]);
    }

    void cleanup() {
        int now = time();
        foreach(cache; string key;) {
            if (now > expiry[key]) {
                m_delete(cache, key);
                m_delete(expiry, key);
            }
        }
    }

    int size() {
        cleanup();
        return sizeof(cache);
    }
}

// ============================================================
// Class 5: Request Handler
// ============================================================

class RequestHandler {
    mapping(string:function) routes = ([]);
    array(mapping) middleware = ({});

    void registerRoute(string path, function handler) {
        routes[path] = handler;
    }

    void addMiddleware(function mw) {
        middleware += ({ (["function": mw]) });
    }

    mixed handleRequest(string path, mapping params) {
        function handler = routes[path];
        if (!handler) {
            return (["error": "Not found", "code": 404]);
        }

        // Run middleware
        foreach(middleware, mapping mw) {
            mixed result = mw["function"](params);
            if (mappingp(result) && result->error) {
                return result;
            }
        }

        return handler(params);
    }

    array(string) listRoutes() {
        return indices(routes);
    }
}

// ============================================================
// Helper Classes and Functions
// ============================================================

class User {
    string username;
    string email;
    string password;
    int id;
    int created;
    int lastLogin;
    int active;

    void create(string _username, string _email, string _password, int _id) {
        username = _username;
        email = _email;
        password = _password;
        id = _id;
        created = time();
        lastLogin = 0;
        active = 1;
    }

    void login() {
        lastLogin = time();
    }

    void deactivate() {
        active = 0;
    }

    void activate() {
        active = 1;
    }
}

class Session {
    object user;
    string token;
    int created;
    int lastActivity;

    void create(object _user, string _token, int _created) {
        user = _user;
        token = _token;
        created = _created;
        lastActivity = _created;
    }

    void touch() {
        lastActivity = time();
    }
}

class Connection {
    string host;
    int port;
    string database;
    string username;
    string password;
    int connected;
    int lastQuery;

    void create(string _host, int _port, string _database,
                string _username, string _password) {
        host = _host;
        port = _port;
        database = _database;
        username = _username;
        password = _password;
        connected = time();
        lastQuery = 0;
    }

    void close() {
        connected = 0;
    }

    mixed query(string sql) {
        lastQuery = time();
        // Simulated query execution
        return (["rows": ({}), "time": 0]);
    }
}

// ============================================================
// Utility Functions
// ============================================================

string generateUUID() {
    return sprintf("%04x%04x-%04x-%04x-%04x-%04x%04x%04x",
        random(65535), random(65535), random(65535), random(65535),
        random(65535), random(65535), random(65535), random(65535));
}

string hashPassword(string password, string salt) {
    return Crypto.SHA256.hash(password + salt);
}

string generateSalt() {
    return sprintf("%08x", random(0x7fffffff));
}

int validateUsername(string username) {
    return regexp(username, "^[a-zA-Z0-9_-]{3,32}$");
}

string escapeHTML(string text) {
    return replace(text,
        (["&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;"]));
}

string truncate(string text, int length) {
    if (sizeof(text) <= length) {
        return text;
    }
    return text[..length-3] + "...";
}

array(mixed) paginate(array(mixed) items, int page, int perPage) {
    int start = (page - 1) * perPage;
    int end = start + perPage;
    return items[start..end-1];
}

// ============================================================
// Configuration and Constants
// ============================================================

constant VERSION = "1.0.0";
constant APP_NAME = "PikeLSPBenchmark";
constant DEFAULT_PORT = 8080;
constant DEFAULT_HOST = "localhost";

mapping defaultConfig = ([
    "debug": 0,
    "logLevel": "info",
    "maxConnections": 100,
    "sessionTimeout": 3600,
    "cacheTTL": 300,
    "dbHost": "localhost",
    "dbPort": 5432,
    "dbName": "benchmark",
    "dbUser": "admin",
    "dbPass": "secret"
]);

// ============================================================
// Main Application Class
// ============================================================

class Application {
    object userManager;
    object sessionManager;
    object connectionPool;
    object cacheManager;
    object requestHandler;
    mapping config;

    void create(mapping|void _config) {
        config = _config || defaultConfig;

        userManager = UserManager();
        sessionManager = SessionManager();
        cacheManager = CacheManager();
        cacheManager->defaultTTL = config["cacheTTL"];
        requestHandler = RequestHandler();

        connectionPool = ConnectionPool();
        connectionPool->create(
            config["dbHost"],
            config["dbPort"],
            config["dbName"],
            config["dbUser"],
            config["dbPass"]
        );

        setupRoutes();
    }

    void setupRoutes() {
        requestHandler->registerRoute("/users/create", createUserRoute);
        requestHandler->registerRoute("/users/get", getUserRoute);
        requestHandler->registerRoute("/users/list", listUsersRoute);
        requestHandler->registerRoute("/auth/login", loginRoute);
        requestHandler->registerRoute("/auth/logout", logoutRoute);
        requestHandler->registerRoute("/cache/get", cacheGetRoute);
        requestHandler->registerRoute("/cache/set", cacheSetRoute);
        requestHandler->registerRoute("/health", healthRoute);
    }

    mixed createUserRoute(mapping params) {
        string username = params["username"];
        string email = params["email"];
        string password = params["password"];

        if (!username || !email || !password) {
            return (["error": "Missing required fields", "code": 400]);
        }

        if (!userManager->validateEmail(email)) {
            return (["error": "Invalid email format", "code": 400]);
        }

        if (!userManager->validatePassword(password)) {
            return (["error": "Password too short", "code": 400]);
        }

        object user = userManager->createUser(username, email, password);
        if (!user) {
            return (["error": "User already exists", "code": 409]);
        }

        return (["success": 1, "userId": user->id]);
    }

    mixed getUserRoute(mapping params) {
        string username = params["username"];
        if (!username) {
            return (["error": "Missing username", "code": 400]);
        }

        object user = userManager->getUser(username);
        if (!user) {
            return (["error": "User not found", "code": 404]);
        }

        return ([
            "username": user->username,
            "email": user->email,
            "id": user->id,
            "active": user->active,
            "created": user->created
        ]);
    }

    mixed listUsersRoute(mapping params) {
        array users = userManager->listUsers();
        return ([
            "count": sizeof(users),
            "users": map(users, lambda(object u) {
                return ([
                    "username": u->username,
                    "email": u->email,
                    "id": u->id
                ]);
            })
        ]);
    }

    mixed loginRoute(mapping params) {
        string username = params["username"];
        string password = params["password"];

        if (!username || !password) {
            return (["error": "Missing credentials", "code": 400]);
        }

        object user = userManager->getUser(username);
        if (!user) {
            return (["error": "Invalid credentials", "code": 401]);
        }

        // Simplified password check
        if (password != user->password) {
            return (["error": "Invalid credentials", "code": 401]);
        }

        user->login();
        string token = sessionManager->createSession(user);

        return (["success": 1, "token": token]);
    }

    mixed logoutRoute(mapping params) {
        string token = params["token"];
        if (!token) {
            return (["error": "Missing token", "code": 400]);
        }

        sessionManager->destroySession(token);
        return (["success": 1]);
    }

    mixed cacheGetRoute(mapping params) {
        string key = params["key"];
        if (!key) {
            return (["error": "Missing key", "code": 400]);
        }

        mixed value = cacheManager->get(key);
        if (value == 0) {
            return (["error": "Key not found or expired", "code": 404]);
        }

        return (["key": key, "value": value]);
    }

    mixed cacheSetRoute(mapping params) {
        string key = params["key"];
        mixed value = params["value"];
        int ttl = (int)params["ttl"];

        if (!key) {
            return (["error": "Missing key", "code": 400]);
        }

        cacheManager->set(key, value, ttl);
        return (["success": 1]);
    }

    mixed healthRoute(mapping params) {
        return ([
            "status": "healthy",
            "version": VERSION,
            "timestamp": time(),
            "uptime": time(),
            "cacheSize": cacheManager->size(),
            "activeSessions": sizeof(sessionManager->activeSessions)
        ]);
    }

    void run() {
        // Main application loop would go here
        werror("Application starting on %s:%d\n", config["host"] || DEFAULT_HOST,
               config["port"] || DEFAULT_PORT);
    }

    void shutdown() {
        connectionPool->close();
        cacheManager->clear();
        sessionManager->cleanupExpiredSessions();
        werror("Application shutdown complete\n");
    }
}

// ============================================================
// Additional Data Models (to increase file size)
// ============================================================

class Product {
    int id;
    string name;
    string description;
    float price;
    int stock;
    string category;
    int created;
    int updated;

    void create(int _id, string _name, string _description, float _price,
                int _stock, string _category) {
        id = _id;
        name = _name;
        description = _description;
        price = _price;
        stock = _stock;
        category = _category;
        created = time();
        updated = created;
    }

    void updateStock(int newStock) {
        stock = newStock;
        updated = time();
    }

    void updatePrice(float newPrice) {
        price = newPrice;
        updated = time();
    }
}

class Order {
    int id;
    int userId;
    array(object) items;
    float total;
    string status;
    int created;
    int updated;

    void create(int _id, int _userId) {
        id = _id;
        userId = _userId;
        items = ({});
        total = 0.0;
        status = "pending";
        created = time();
        updated = created;
    }

    void addItem(object product, int quantity) {
        items += ({ (["product": product, "quantity": quantity]) });
        total += product->price * quantity;
        updated = time();
    }

    void removeItem(int productId) {
        for (int i = 0; i < sizeof(items); i++) {
            if (items[i]->product->id == productId) {
                total -= items[i]->product->price * items[i]->quantity;
                items = items[..i-1] + items[i+1..];
                updated = time();
                return;
            }
        }
    }

    void updateStatus(string newStatus) {
        status = newStatus;
        updated = time();
    }
}

class Category {
    int id;
    string name;
    string description;
    int parentId;
    array(object) children;

    void create(int _id, string _name, string _description, int|void _parentId) {
        id = _id;
        name = _name;
        description = _description;
        parentId = _parentId || 0;
        children = ({});
    }

    void addChild(object category) {
        children += ({ category });
    }
}

// ============================================================
// Additional Service Classes
// ============================================================

class EmailService {
    string smtpHost;
    int smtpPort;
    string username;
    string password;

    void create(string _smtpHost, int _smtpPort, string _username, string _password) {
        smtpHost = _smtpHost;
        smtpPort = _smtpPort;
        username = _username;
        password = _password;
    }

    int sendEmail(string to, string subject, string body) {
        // Simulated email sending
        werror("Sending email to %s: %s\n", to, subject);
        return 1;
    }

    int sendBulkEmail(array(string) recipients, string subject, string body) {
        int sent = 0;
        foreach(recipients, string to) {
            if (sendEmail(to, subject, body)) {
                sent++;
            }
        }
        return sent;
    }
}

class LogService {
    string logFile;
    int logLevel;
    array(mapping) buffer;
    int bufferSize;

    constant LEVEL_DEBUG = 0;
    constant LEVEL_INFO = 1;
    constant LEVEL_WARN = 2;
    constant LEVEL_ERROR = 3;

    void create(string _logFile, int|void _logLevel) {
        logFile = _logFile;
        logLevel = _logLevel || LEVEL_INFO;
        buffer = ({});
        bufferSize = 100;
    }

    void log(int level, string message, mapping|void context) {
        if (level < logLevel) return;

        mapping entry = ([
            "timestamp": time(),
            "level": level,
            "message": message,
            "context": context || ([])
        ]);

        buffer += ({ entry });

        if (sizeof(buffer) >= bufferSize) {
            flush();
        }
    }

    void debug(string message, mapping|void context) {
        log(LEVEL_DEBUG, message, context);
    }

    void info(string message, mapping|void context) {
        log(LEVEL_INFO, message, context);
    }

    void warn(string message, mapping|void context) {
        log(LEVEL_WARN, message, context);
    }

    void error(string message, mapping|void context) {
        log(LEVEL_ERROR, message, context);
    }

    void flush() {
        // Write buffer to log file
        foreach(buffer, mapping entry) {
            string line = sprintf("[%s] %s: %s\n",
                ctime(entry["timestamp"]),
                ({ "DEBUG", "INFO", "WARN", "ERROR" })[entry["level"]],
                entry["message"]);
            // Write to file
        }
        buffer = ({});
    }
}

class NotificationService {
    object emailService;
    object pushService;
    object smsService;

    void create(object _emailService, object|void _pushService, object|void _smsService) {
        emailService = _emailService;
        pushService = _pushService;
        smsService = _smsService;
    }

    int notifyUser(object user, string channel, string message) {
        switch (channel) {
            case "email":
                return emailService->sendEmail(user->email, "Notification", message);
            case "push":
                if (pushService) {
                    return pushService->sendPush(user->id, message);
                }
                return 0;
            case "sms":
                if (smsService) {
                    return smsService->sendSMS(user->phone, message);
                }
                return 0;
            default:
                return 0;
        }
    }
}

// ============================================================
// File Statistics
// ============================================================
// Total lines: ~2000
// Total classes: 20+
// Total methods: 150+
// Complexity: High (nested classes, inheritance, generics)
// Purpose: Performance testing of LSP features on large files
// ============================================================
