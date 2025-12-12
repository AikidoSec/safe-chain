//! HTTP/HTTPS proxy implementation using the Rama framework.
//!
//! Supports both CONNECT tunneling (for HTTPS) and plain HTTP proxying.
//! Includes graceful shutdown, body size limits, and structured logging.

use rama::{
    extensions::ExtensionsMut,
    http::{
        client::EasyHttpWebClient,
        layer::{
            remove_header::{RemoveRequestHeaderLayer, RemoveResponseHeaderLayer},
            trace::TraceLayer,
            upgrade::UpgradeLayer,
        },
        matcher::MethodMatcher,
        server::HttpServer,
        service::web::response::IntoResponse,
        Request, Response, StatusCode,
    },
    layer::ConsumeErrLayer,
    net::{http::RequestContext, proxy::ProxyTarget, stream::layer::http::BodyLimitLayer},
    rt::Executor,
    service::service_fn,
    tcp::{client::service::Forwarder, server::TcpListener},
    telemetry::tracing::{self},
    Layer, Service,
};
use std::{convert::Infallible, time::Duration};

/// Maximum allowed body size for proxied requests and responses.
/// Protects against memory exhaustion from excessively large payloads.
const MAX_BODY_SIZE: usize = 500 * 1024 * 1024; // 500 MB

/// Starts the proxy server with graceful shutdown support.
///
/// Spawns the server task and waits for a shutdown signal (e.g., Ctrl+C).
/// Active connections are given up to 30 seconds to complete before forced termination.
pub async fn run_server(port: u16) {
    let graceful = rama::graceful::Shutdown::default();

    graceful.spawn_task_fn(move |guard| server_task(guard, port));

    graceful
        .shutdown_with_limit(Duration::from_secs(30))
        .await
        .expect("graceful shutdown");
}

/// Core server task that binds to a port and serves HTTP/HTTPS traffic.
///
/// Configures the HTTP server with:
/// - CONNECT method upgrade for HTTPS tunneling
/// - Hop-by-hop header removal (Connection, Keep-Alive, etc.)
/// - Body size limits to prevent resource exhaustion
/// - Request/response tracing for observability
async fn server_task(guard: rama::graceful::ShutdownGuard, port: u16) {
    let tcp_service = TcpListener::build()
        .bind(format!("127.0.0.1:{}", port))
        .await
        .unwrap_or_else(|e| panic!("Failed to bind tcp proxy to 127.0.0.1:{}: {}", port, e));

    let local_address = tcp_service
        .local_addr()
        .expect("Could not get bound local address for TCP server");

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

    tracing::info!(proxy.address = %local_address, "safe-chain proxy running");

    tcp_service
        .serve_graceful(
            guard,
            (
                // protect the http proxy from too large bodies, both from request and response end
                BodyLimitLayer::symmetric(MAX_BODY_SIZE),
            )
                .into_layer(http_service),
        )
        .await;
}

/// Handles HTTPS CONNECT requests by establishing a TCP tunnel.
///
/// Extracts the target host:port from the request and stores it in request extensions
/// for use by the TCP forwarder. Returns 200 OK to signal successful tunnel establishment,
/// or 400 BAD REQUEST if the target cannot be determined.
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
            tracing::error!(uri = %req.uri(), "error extracting authority: {err:?}");
            return Err(StatusCode::BAD_REQUEST.into_response());
        }
    }

    Ok((StatusCode::OK.into_response(), req))
}

/// Forwards plain HTTP requests to their destination.
///
/// Uses an HTTP client to relay requests transparently. Returns 502 BAD GATEWAY
/// if the upstream server is unreachable or returns an error. The `Infallible` return
/// type indicates this handler always produces a response (never panics the service).
async fn http_plain_proxy(req: Request) -> Result<Response, Infallible> {
    let uri = req.uri().clone();

    let client = EasyHttpWebClient::default();
    tracing::info!(uri = %uri, "serving http over proxy");

    match client.serve(req).await {
        Ok(resp) => Ok(resp),
        Err(err) => {
            tracing::error!(uri = %uri, "error forwarding request: {err:?}");
            let resp = StatusCode::BAD_GATEWAY.into_response();
            Ok(resp)
        }
    }
}
