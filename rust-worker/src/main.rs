use sha2::Digest;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tokio::signal;
use tokio::sync::Semaphore;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use cinefuel_rust_worker::config::Config;
use cinefuel_rust_worker::identifier::MediaIdentifier;
use cinefuel_rust_worker::models;
use cinefuel_rust_worker::routes::{create_router, ServerContext};
use cinefuel_rust_worker::scraper::ContentScraper;
use cinefuel_rust_worker::upstash::UpstashClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize structured JSON/fmt logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cinefuel_rust_worker=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2. Load configuration from environment
    let cfg = Config::from_env();
    info!(
        category = "CONFIG",
        port = cfg.port,
        concurrency = cfg.concurrency,
        timeout_ms = cfg.request_timeout_ms,
        upstash_configured = cfg.upstash_redis_rest_url.is_some(),
        tmdb_configured = !cfg.tmdb_api_key.is_empty(),
        "Loaded CineFuel Rust Scraping & Identification Worker config"
    );

    // 3. Initialize services
    let upstash = UpstashClient::new(
        cfg.upstash_redis_rest_url.clone(),
        cfg.upstash_redis_rest_token.clone(),
    );
    let identifier = Arc::new(MediaIdentifier::new(cfg.clone(), upstash.clone()));
    let scraper = Arc::new(ContentScraper::new(cfg.request_timeout_ms));
    let queue_processor = Arc::new(cinefuel_rust_worker::queue_processor::QueueProcessor::new(
        cfg.clone(),
        upstash.clone(),
    ));

    let ctx = Arc::new(ServerContext {
        config: cfg.clone(),
        identifier: identifier.clone(),
        scraper: scraper.clone(),
        queue_processor: queue_processor.clone(),
        upstash: upstash.clone(),
        start_time: Instant::now(),
    });

    // 4. PRIORITY 4: High-Throughput Bounded Queue Processor (drains Upstash Redis via non-blocking RPOP)
    if upstash.is_configured() {
        let q_upstash = upstash.clone();
        let q_scraper = scraper.clone();
        let q_identifier = identifier.clone();
        let q_queue_processor = queue_processor.clone();
        let semaphore = Arc::new(Semaphore::new(cfg.concurrency));

        tokio::spawn(async move {
            info!(concurrency = cfg.concurrency, "Upstash Redis queue manager active with bounded concurrency");
            loop {
                let mut found_work = false;

                // Priority 0: Link Resolution Batch Queue (drains cinefuel:queue:link_jobs off Windows PC)
                if let Some(payload_str) = q_upstash.dequeue_job("link_jobs").await {
                    found_work = true;
                    if let Ok(job) = serde_json::from_str::<cinefuel_rust_worker::queue_processor::LinkBatchJob>(&payload_str) {
                        let proc = q_queue_processor.clone();
                        let sem = semaphore.clone();
                        tokio::spawn(async move {
                            let _permit = match sem.acquire().await {
                                Ok(p) => p,
                                Err(_) => return,
                            };
                            proc.process_link_job(job).await;
                        });
                    }
                }

                // Priority A: Scrape Queue
                if let Some(payload_str) = q_upstash.dequeue_job("scrape").await {
                    found_work = true;
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&payload_str) {
                        if let Some(target_url) = v.get("url").and_then(|u| u.as_str()) {
                            let url_str = target_url.to_string();
                            let s_upstash = q_upstash.clone();
                            let s_scraper = q_scraper.clone();
                            let s_identifier = q_identifier.clone();
                            let sem = semaphore.clone();

                            tokio::spawn(async move {
                                let _permit = match sem.acquire().await {
                                    Ok(p) => p,
                                    Err(_) => return,
                                };

                                let job_id = format!("q_sc_{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
                                let url_hash = format!("{:x}", sha2::Sha256::digest(url_str.as_bytes()));

                                // PRIORITY 1: Check cache BEFORE scraping
                                if let Some(_) = s_upstash.get_cached_scrape(&url_hash).await {
                                    info!(job_id = %job_id, url = %url_str, "Queued job already cached; skipping network scrape");
                                    return;
                                }

                                match s_scraper.fetch_and_parse(&url_str, &job_id).await {
                                    Ok((title, is_movie, mut releases, timing)) => {
                                        for release in &mut releases {
                                            let id_req = models::IdentifyRequest {
                                                text: release.title.clone(),
                                                url: Some(release.mediator_url.clone()),
                                                source_path: None,
                                                forced_year: None,
                                                forced_type: Some(if is_movie { "movie".to_string() } else { "tv".to_string() }),
                                                forced_tmdb_id: None,
                                                forced_title: Some(title.clone()),
                                            };
                                            release.identified = Some(s_identifier.identify_media_item(&id_req, &job_id).await);
                                        }
                                        let resp = models::ScrapeAndIdentifyResponse {
                                            success: true,
                                            content_url: url_str.clone(),
                                            title,
                                            is_movie,
                                            total: releases.len(),
                                            releases,
                                            timing_ms: timing,
                                        };
                                        s_upstash.set_cached_scrape(&url_hash, &resp, 86400).await;
                                        info!(job_id = %job_id, url = %url_str, "Background scrape job processed & stored in Upstash");
                                    }
                                    Err(e) => {
                                        error!(job_id = %job_id, url = %url_str, error = %e, "Background scrape job failed");
                                        let _ = s_upstash.enqueue_job("deadletter", &payload_str).await;
                                    }
                                }
                            });
                        }
                    }
                }

                // Priority B: Ingestion / Identification Queue
                if let Some(payload_str) = q_upstash.dequeue_job("ingest").await {
                    found_work = true;
                    if let Ok(id_req) = serde_json::from_str::<models::IdentifyRequest>(&payload_str) {
                        let i_identifier = q_identifier.clone();
                        let sem = semaphore.clone();
                        tokio::spawn(async move {
                            let _permit = match sem.acquire().await {
                                Ok(p) => p,
                                Err(_) => return,
                            };
                            let job_id = format!("q_id_{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
                            i_identifier.identify_media_item(&id_req, &job_id).await;
                        });
                    }
                }

                if found_work {
                    // Small yield between jobs when active
                    tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
                } else {
                    // Exponential backoff to avoid high polling on idle queue
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                }
            }
        });
    }

    // 5. Build Router & Bind TCP Listener
    let app = create_router(ctx);
    let addr = SocketAddr::from(([0, 0, 0, 0], cfg.port));

    info!(
        category = "SERVER",
        "CineFuel Rust Worker HTTP service listening at http://{}:{}",
        cfg.host,
        cfg.port
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("CineFuel Rust Worker gracefully shut down.");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
