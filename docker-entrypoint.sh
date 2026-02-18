#!/bin/bash
set -e

# Generate SSH host keys if they don't exist
if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    echo "Generating SSH host keys..."
    ssh-keygen -A
fi

# Fix permissions for developer user home if mounted
if [ -d /home/developer ]; then
    chown -R developer:developer /home/developer 2>/dev/null || true
fi

# Start SSH daemon
exec /usr/sbin/sshd -D
