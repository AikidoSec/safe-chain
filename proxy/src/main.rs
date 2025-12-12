use clap::Parser;
use rama::telemetry::tracing::{
    self,
    metadata::LevelFilter,
    subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter},
};
mod server;
use server::proxy::run_server;

#[tokio::main]
async fn main() {
    let args = Args::parse();
    setup_tracing();
    run_server(args.port).await;
}

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

#[derive(Parser, Debug)]
struct Args {
    #[arg(short, long, default_value_t = 0)]
    port: u16,
}
