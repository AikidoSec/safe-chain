use std::{convert::Infallible, time::Duration};

use rama::{
    Layer, Service,
    extensions::ExtensionsMut,
    http::{
        Request, Response, StatusCode,
        client::EasyHttpWebClient,
        layer::{
            remove_header::{RemoveRequestHeaderLayer, RemoveResponseHeaderLayer},
            trace::TraceLayer,
            upgrade::UpgradeLayer,
        },
        matcher::MethodMatcher,
        server::HttpServer,
        service::web::response::IntoResponse,
    },
    layer::ConsumeErrLayer,
    net::{http::RequestContext, proxy::ProxyTarget, stream::layer::http::BodyLimitLayer},
    rt::Executor,
    service::service_fn,
    tcp::{client::service::Forwarder, server::TcpListener},
    telemetry::tracing::{
        self,
        metadata::LevelFilter,
        subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt},
    },
};

#[tokio::main]
async fn main() {
    setup_tracing();
    run_server().await;
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

async fn run_server() {
    let graceful = rama::graceful::Shutdown::default();

    graceful.spawn_task_fn(server_task);

    graceful
        .shutdown_with_limit(Duration::from_secs(30))
        .await
        .expect("graceful shutdown");
}

async fn server_task(guard: rama::graceful::ShutdownGuard) {
    let tcp_service = TcpListener::build()
        .bind("127.0.0.1:3128")
        .await
        .expect("bind tcp proxy to 127.0.0.1:3128");
    let exec = Executor::graceful(guard.clone());

    let http_service = HttpServer::auto(exec).service(
        (
            TraceLayer::new_for_http(),
            ConsumeErrLayer::default(),
            UpgradeLayer::new(
                MethodMatcher::CONNECT,
                service_fn(http_connect_accept),
                ConsumeErrLayer::default().into_layer(Forwarder::ctx()),
            ),
            RemoveResponseHeaderLayer::hop_by_hop(),
            RemoveRequestHeaderLayer::hop_by_hop(),
        )
            .into_layer(service_fn(http_plain_proxy)),
    );

    tcp_service
        .serve_graceful(
            guard,
            (
                // protect the http proxy from too large bodies, both from request and response end
                BodyLimitLayer::symmetric(500 * 1024 * 1024),
            )
                .into_layer(http_service),
        )
        .await;
}

async fn http_connect_accept(mut req: Request) -> Result<(Response, Request), Response> {
    match RequestContext::try_from(&req).map(|ctx| ctx.host_with_port()) {
        Ok(authority) => {
            tracing::info!(
                server.address = %authority.host,
                server.port = authority.port,
                "accept CONNECT",
            );
            req.extensions_mut().insert(ProxyTarget(authority));
        }
        Err(err) => {
            tracing::error!("error extracting authority: {err:?}");
            return Err(StatusCode::BAD_REQUEST.into_response());
        }
    }

    return Ok((StatusCode::OK.into_response(), req));
}

async fn http_plain_proxy(req: Request) -> Result<Response, Infallible> {
    let client = EasyHttpWebClient::default();

    return match client.serve(req).await {
        Ok(resp) => Ok(resp),
        Err(err) => {
            tracing::error!("Error forwarding request: {err:?}");
            let resp = StatusCode::BAD_GATEWAY.into_response();
            Ok(resp)
        }
    };
}
