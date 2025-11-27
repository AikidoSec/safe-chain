export const AGENT_PORT = 8765;
export const PROXY_HOST = "127.0.0.1";
export const INSTALL_DIR = "/Library/Application Support/AikidoSafety";
export const LOG_DIR = "/var/log/aikido-safe-chain";
export const PID_FILE = "/var/run/aikido-safe-chain.pid";
export const CONFIG_FILE = "/Library/Application Support/AikidoSafety/proxy-config.json";
export const LAUNCHD_PLIST = "/Library/LaunchDaemons/dev.aikido.safe-chain.plist";

/**
 * Proxy bypass domains
 */
export const BYPASS_DOMAINS = ["*.local", "169.254/16", "127.0.0.1", "localhost"];

export const LAUNCHD_LABEL = "dev.aikido.safe-chain";
