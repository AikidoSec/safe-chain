use clap::Parser;
use rama::telemetry::tracing::{
    self,
    metadata::LevelFilter,
    subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter},
};
mod server;
use server::proxy::run_server;

/// CLI arguments for configuring proxy behavior.
#[derive(Parser)]
#[command(
    about = "A security-focused HTTP/HTTPS proxy for Safe-chain",
    version,
    author
)]
struct Args {
    /// TCP port binding. Use 0 for OS-assigned port (recommended for avoiding conflicts).
    #[arg(short, long, default_value_t = 0)]
    port: u16,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    setup_tracing();
    run_server(args.port).await;
}

/// Configures structured logging with runtime control via `RUST_LOG` environment variable.
///
/// Defaults to INFO level to balance visibility with performance.
/// Use `RUST_LOG=debug` or `RUST_LOG=trace` for troubleshooting.
fn setup_tracing() {
    tracing::subscriber::registry()
        .with(fmt::layer())
        .with(
            EnvFilter::builder()
                .with_default_directive(LevelFilter::INFO.into())
                .from_env_lossy(),
        )
        .init();
    tracing::info!("Tracing is set up");
}
