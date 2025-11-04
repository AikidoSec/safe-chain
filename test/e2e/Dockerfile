FROM node:24-bookworm as builder

ENV CI=true

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY packages/safe-chain/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY packages/safe-chain ./

# Build the application
RUN npm --no-git-tag-version version 1.0.0 --allow-same-version
RUN npm pack

FROM buildpack-deps:trixie

# Package manager version arguments with defaults
ARG NODE_VERSION=latest
ARG NPM_VERSION=latest
ARG YARN_VERSION=latest
ARG PNPM_VERSION=latest
ARG PYTHON_VERSION=3

SHELL ["/bin/bash", "-c"]
ENV BASH_ENV=~/.bashrc

# Install a proxy
RUN apt-get update && apt-get install tinyproxy -y

# Install zsh
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v1.2.1/zsh-in-docker.sh)"
# Install fish
RUN apt-get install -y fish && \
    mkdir -p /root/.config/fish/ && \
    touch /root/.config/fish/config.fish

# Install Volta and Node.js
RUN curl https://get.volta.sh | bash
RUN volta install node@${NODE_VERSION}
RUN volta install npm@${NPM_VERSION}
RUN volta install yarn@${YARN_VERSION}
RUN volta install pnpm@${PNPM_VERSION}

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Install Python and pip (pip3)
RUN apt-get update && apt-get install -y python${PYTHON_VERSION} python3-pip && \
    ln -sf /usr/bin/python${PYTHON_VERSION} /usr/local/bin/python3 && \
    ln -sf /usr/bin/pip3 /usr/local/bin/pip3

# Copy and install Safe chain
COPY --from=builder /app/*.tgz /pkgs/
RUN npm install -g /pkgs/*.tgz

WORKDIR /testapp
RUN npm init -y

