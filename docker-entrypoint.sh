#!/bin/bash
set -e

# Generate SSH host keys if they don't exist (requires root)
if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    echo "Generating SSH host keys..."
    sudo ssh-keygen -A
fi

# Fix permissions for developer user home if mounted
if [ -d /home/developer ]; then
    sudo chown -R developer:developer /home/developer 2>/dev/null || true
fi

# Start SSH daemon (requires root)
exec sudo /usr/sbin/sshd -D
