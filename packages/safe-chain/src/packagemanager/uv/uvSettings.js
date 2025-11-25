export const UV_PACKAGE_MANAGER = "uv";

// Unlike pip, uv only has one invocation method: the 'uv' command.
// There is no 'uv3' or 'python -m uv' pattern, so we don't need
// invocation tracking like pip does.
