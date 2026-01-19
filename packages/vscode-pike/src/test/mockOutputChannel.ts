/**
 * Mock Output Channel for testing
 *
 * This class mimics VSCode's OutputChannel interface for testing purposes.
 * It saves all logs to an array while also printing them to the real console.
 */

export interface MockOutputChannel {
    name: string;
    append(value: string): void;
    appendLine(value: string): void;
    replace(value: string): void;
    clear(): void;
    show(preserveFocus?: boolean): void;
    hide(): void;
    dispose(): void;
    getLogs(): string[];
    getLogsAsString(): string;
    contains(message: string): boolean;
    filter(pattern: RegExp | string): string[];
    drain(): string[];
    count: number;
}

export class MockOutputChannelImpl implements MockOutputChannel {
    name: string;
    private logs: string[] = [];

    constructor(name: string) {
        this.name = name;
    }

    append(value: string): void {
        this.logs.push(value);
        // Also print to real console for visibility during tests
        process.stdout.write(value);
    }

    appendLine(value: string): void {
        const line = value + '\n';
        this.logs.push(line);
        // Also print to real console for visibility during tests
        console.log(`[${this.name}] ${value}`);
    }

    replace(value: string): void {
        this.clear();
        this.append(value);
    }

    clear(): void {
        this.logs = [];
    }

    show(_preserveFocus?: boolean): void {
        // No-op for tests - we don't have a real UI
    }

    hide(): void {
        // No-op for tests
    }

    dispose(): void {
        this.clear();
    }

    /**
     * Get all logged messages
     */
    getLogs(): string[] {
        return [...this.logs];
    }

    /**
     * Get all logs as a single string
     */
    getLogsAsString(): string {
        return this.logs.join('');
    }

    /**
     * Check if a specific string was logged
     */
    contains(message: string): boolean {
        return this.logs.some(log => log.includes(message));
    }

    /**
     * Get logs that match a pattern
     */
    filter(pattern: RegExp | string): string[] {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        return this.logs.filter(log => regex.test(log));
    }

    /**
     * Clear logs and return them
     */
    drain(): string[] {
        const drained = [...this.logs];
        this.clear();
        return drained;
    }

    /**
     * Get the number of log entries
     */
    get count(): number {
        return this.logs.length;
    }
}

/**
 * Create a mock output channel
 */
export function createMockOutputChannel(name: string): MockOutputChannel {
    return new MockOutputChannelImpl(name);
}
