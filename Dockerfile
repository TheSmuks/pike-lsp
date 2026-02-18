# Pike LSP Development Environment
# Usage: docker compose up -d
# Then: ssh -p 2222 developer@localhost (password: developer)
# Or: docker compose exec pike-lsp-dev bash

FROM ubuntu:24.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    wget \
    xvfb \
    libgmp-dev \
    bison \
    flex \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcb-xinerama0 \
    libxcb-icccm4 \
    libxcb-image0 \
    libxcb-keysyms1 \
    libxcb-randr0 \
    libxcb-render-util0 \
    libxcb-shape0 \
    libxkbcommon0 \
    libxkbcommon-x11-0 \
    libgbm1 \
    libasound2t64 \
    libnss3 \
    libxss1 \
    libxtst6 \
    libxdamage1 \
    libatspi2.0-0 \
    libgtk-3-0 \
    # SSH and TMUX
    openssh-server \
    tmux \
    vim \
    sudo \
    # Shell script linting
    shellcheck \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Install Claude CLI and oh-my-claudecode
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    export PATH="$HOME/.local/bin:$PATH" && \
    bunx install -g @anthropic-ai/claude-code

# Clone Pike and Roxen source trees
ENV PIKE_SRC=/workspace/pike
ENV ROXEN_SRC=/workspace/roxen
RUN git clone --depth 1 --branch v8.0.1116 https://github.com/pikelang/Pike.git ${PIKE_SRC} && \
    git clone --depth 1 --branch rxnpatch/6.1 https://github.com/pikelang/Roxen.git ${ROXEN_SRC}

# Note: oh-my-claudecode setup should be done inside container with claude --setup

# Install Pike from apt (8.0.1738 - Ubuntu 24.04 package)
RUN apt-get update && apt-get install -y pike8.0 && rm -rf /var/lib/apt/lists/*

# Verify Pike
RUN pike --version || echo "Warning: Pike not installed"

# Create developer user with password "developer"
RUN useradd -m -s /bin/bash developer && \
    echo "developer:developer" | chpasswd && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Setup SSH
RUN mkdir /var/run/sshd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PermitUserEnvironment no/PermitUserEnvironment yes/' /etc/ssh/sshd_config

WORKDIR /workspace

# Copy dependency files first for better caching
COPY package.json bun.lock* ./
COPY tsconfig*.json ./
COPY packages packages/

# Install dependencies
RUN bun install

# Copy source
COPY . .

# Build
RUN bun run build

# Fix permissions for developer user
RUN chown -R developer:developer /workspace

USER developer

# SSH port
EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
