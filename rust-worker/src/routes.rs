use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use sha2::Digest;
use std::sync::Arc;
use std::time::Instant;
use tracing::info;

use crate::config::Config;
use crate::identifier::MediaIdentifier;
use crate::models::*;
use crate::queue_processor::{LinkBatchJob, QueueProcessor};
use crate::scraper::ContentScraper;
use crate::upstash::UpstashClient;

pub struct ServerContext {
    pub config: Config,
    pub identifier: Arc<MediaIdentifier>,
    pub scraper: Arc<ContentScraper>,
    pub queue_processor: Arc<QueueProcessor>,
    pub upstash: UpstashClient,
    pub start_time: Instant,
}

#[derive(Debug, Deserialize)]
pub struct CacheCheckQuery {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct CacheSaveRequest {
    pub mediator_url: String,
    pub destination: String,
}

#[derive(Debug, Deserialize)]
pub struct EnqueueJobRequest {
    pub url: String,
    pub queue: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EnqueueBatchJobRequest {
    pub urls: Vec<String>,
    pub chat_id: Option<i64>,
    pub message_id: Option<i64>,
    pub bot_token: Option<String>,
}

pub fn create_router(ctx: Arc<ServerContext>) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/api/identify", post(identify_handler))
        .route("/api/scrape-and-identify", post(scrape_and_identify_handler))
        .route("/api/resolve/cache", get(resolve_cache_check_handler))
        .route("/api/resolve/cache-save", post(resolve_cache_save_handler))
        .route("/api/jobs/enqueue", post(jobs_enqueue_handler))
        .route("/api/jobs/:id", get(jobs_get_status_handler))
        .route("/api/queue/enqueue", post(queue_enqueue_handler))
        .route("/api/queue/status", get(queue_status_handler))
        .route("/api/queue/process", post(queue_process_handler))
        .route("/api/stats", get(stats_handler))
        .with_state(ctx)
}

/// Render liveness and health check
async fn health_handler(State(ctx): State<Arc<ServerContext>>) -> impl IntoResponse {
    let cache_ok = ctx.upstash.check_health().await;
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        uptime_secs: ctx.start_time.elapsed().as_secs(),
        active_workers: ctx.config.concurrency,
        cache_connected: cache_ok,
    })
}

/// Direct media identification endpoint
async fn identify_handler(
    State(ctx): State<Arc<ServerContext>>,
    Json(req): Json<IdentifyRequest>,
) -> Result<Json<MediaIdentificationResult>, (StatusCode, String)> {
    if req.text.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Field 'text' is required.".to_string()));
    }

    let job_id = format!("req_{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
    let res = ctx.identifier.identify_media_item(&req, &job_id).await;

    Ok(Json(res))
}

/// Scrapes a series/movie page and identifies all releases in one coordinated pass.
/// PRIORITY 1: Checks Upstash cache BEFORE scraping. Returns sub-millisecond if available.
async fn scrape_and_identify_handler(
    State(ctx): State<Arc<ServerContext>>,
    Json(req): Json<ScrapeAndIdentifyRequest>,
) -> Result<Json<ScrapeAndIdentifyResponse>, (StatusCode, String)> {
    let raw_url = req.url.trim();
    if raw_url.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Field 'url' is required.".to_string()));
    }

    let total_start = Instant::now();
    let job_id = format!("job_{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

    // 1. PRIORITY 1: Check Upstash BEFORE scraping (Sub-millisecond instant hit)
    let url_hash = format!("{:x}", sha2::Sha256::digest(raw_url.as_bytes()));
    if let Some(mut cached_resp) = ctx.upstash.get_cached_scrape(&url_hash).await {
        cached_resp.timing_ms.total_ms = total_start.elapsed().as_millis() as u64;
        info!(
            job_id = %job_id,
            url = %raw_url,
            total = cached_resp.total,
            elapsed_ms = cached_resp.timing_ms.total_ms,
            "⚡ Upstash cache HIT before scraping! Returning pre-identified releases instantly."
        );
        return Ok(Json(cached_resp));
    }

    // 2. Upstash Deduplication Lock: prevent overlapping scrape jobs for the same URL
    let acquired = ctx.upstash.acquire_dedup_lock(&url_hash, 60).await;
    if !acquired {
        info!(job_id = %job_id, url = %raw_url, "Duplicate job in progress; checking if result finished");
        // Re-check cache once more in case the concurrent worker just finished
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        if let Some(mut cached_resp) = ctx.upstash.get_cached_scrape(&url_hash).await {
            cached_resp.timing_ms.total_ms = total_start.elapsed().as_millis() as u64;
            return Ok(Json(cached_resp));
        }
    }

    // 3. Fetch and Parse Page Content
    let (title, is_movie, mut releases, mut timing) = match ctx.scraper.fetch_and_parse(raw_url, &job_id).await {
        Ok(res) => res,
        Err(e) => {
            ctx.upstash.release_dedup_lock(&url_hash).await;
            return Err((StatusCode::UNPROCESSABLE_ENTITY, e));
        }
    };

    // 4. Identify each release using MediaIdentifier with bounded concurrency
    let tmdb_start = Instant::now();
    for release in &mut releases {
        let id_req = IdentifyRequest {
            text: release.title.clone(),
            url: Some(release.mediator_url.clone()),
            source_path: None,
            forced_year: None,
            forced_type: Some(if is_movie { "movie".to_string() } else { "tv".to_string() }),
            forced_tmdb_id: None,
            forced_title: Some(title.clone()),
        };

        let identified = ctx.identifier.identify_media_item(&id_req, &job_id).await;
        release.identified = Some(identified);
    }
    let tmdb_elapsed = tmdb_start.elapsed();

    timing.metadata_lookup_ms = Some(tmdb_elapsed.as_millis() as u64);
    timing.total_ms = total_start.elapsed().as_millis() as u64;

    let response = ScrapeAndIdentifyResponse {
        success: true,
        content_url: raw_url.to_string(),
        title,
        is_movie,
        total: releases.len(),
        releases,
        timing_ms: timing,
    };

    // 5. PRIORITY 1: Store in Upstash Redis cache (24 hour TTL) so future lookups are instant
    ctx.upstash.set_cached_scrape(&url_hash, &response, 86400).await;

    // 6. Release Deduplication Lock
    ctx.upstash.release_dedup_lock(&url_hash).await;

    info!(
        job_id = %job_id,
        stage = "total",
        elapsed_ms = response.timing_ms.total_ms,
        releases_count = response.total,
        "Scrape and identification pass completed & cached in Upstash"
    );

    Ok(Json(response))
}

/// Checks Upstash cache for a resolved mediator -> HubCloud destination link
async fn resolve_cache_check_handler(
    State(ctx): State<Arc<ServerContext>>,
    Query(query): Query<CacheCheckQuery>,
) -> impl IntoResponse {
    let raw_url = query.url.trim();
    if raw_url.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "url is required"}))).into_response();
    }

    let mediator_hash = format!("{:x}", sha2::Sha256::digest(raw_url.as_bytes()));
    if let Some(dest) = ctx.upstash.get_cached_resolved_link(&mediator_hash).await {
        (StatusCode::OK, Json(json!({
            "cached": true,
            "sourceUrl": raw_url,
            "destination": dest
        }))).into_response()
    } else {
        (StatusCode::OK, Json(json!({
            "cached": false,
            "sourceUrl": raw_url
        }))).into_response()
    }
}

/// Stores a resolved HubCloud destination link in Upstash Redis
async fn resolve_cache_save_handler(
    State(ctx): State<Arc<ServerContext>>,
    Json(payload): Json<CacheSaveRequest>,
) -> impl IntoResponse {
    let med_url = payload.mediator_url.trim();
    let dest_url = payload.destination.trim();
    if med_url.is_empty() || dest_url.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "mediator_url and destination required"}))).into_response();
    }

    let mediator_hash = format!("{:x}", sha2::Sha256::digest(med_url.as_bytes()));
    // Cache for 7 days (604800s) in Upstash Redis
    ctx.upstash.set_cached_resolved_link(&mediator_hash, dest_url, 604800).await;
    // Persist to Supabase public.links
    ctx.queue_processor.persist_to_supabase(med_url, dest_url).await;

    (StatusCode::OK, Json(json!({
        "success": true,
        "mediatorUrl": med_url,
        "destination": dest_url
    }))).into_response()
}

/// Enqueues a batch of links for cloud processing and returns promptly (<100ms)
async fn jobs_enqueue_handler(
    State(ctx): State<Arc<ServerContext>>,
    Json(req): Json<EnqueueBatchJobRequest>,
) -> impl IntoResponse {
    let urls: Vec<String> = req.urls.into_iter().map(|u| u.trim().to_string()).filter(|u| !u.is_empty()).collect();
    if urls.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "No valid URLs provided"}))).into_response();
    }

    let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
    let job_id = format!("job_{:x}", now_ms);

    // PRIORITY 1: Check if ALL links are already cached
    let mut all_cached = true;
    let mut cached_results = Vec::new();

    for url in &urls {
        let hash = format!("{:x}", sha2::Sha256::digest(url.as_bytes()));
        if let Some(dest) = ctx.upstash.get_cached_resolved_link(&hash).await {
            cached_results.push(json!({
                "source_url": url,
                "destination": dest,
                "from_cache": true
            }));
        } else {
            all_cached = false;
            break;
        }
    }

    if all_cached {
        info!(job_id = %job_id, total = urls.len(), "All batch URLs cached in Upstash Redis; returning instant hit");
        return (StatusCode::OK, Json(json!({
            "success": true,
            "job_id": job_id,
            "all_cached": true,
            "total_urls": urls.len(),
            "results": cached_results
        }))).into_response();
    }

    // Otherwise, enqueue to Upstash Redis queue for asynchronous processing in cloud worker
    let job_payload = LinkBatchJob {
        job_id: job_id.clone(),
        chat_id: req.chat_id,
        message_id: req.message_id,
        bot_token: req.bot_token,
        urls: urls.clone(),
        enqueued_at: now_ms,
    };

    let payload_str = match serde_json::to_string(&job_payload) {
        Ok(s) => s,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to serialize job"}))).into_response(),
    };

    let enqueued = ctx.upstash.enqueue_job("link_jobs", &payload_str).await;

    // Set initial status
    let initial_status = json!({
        "job_id": job_id,
        "status": "queued",
        "enqueued_at": now_ms,
        "total_urls": urls.len(),
        "completed_urls": 0
    });
    ctx.upstash.set_job_meta(&job_id, &initial_status, 86400).await;

    (StatusCode::OK, Json(json!({
        "success": enqueued,
        "job_id": job_id,
        "queued": true,
        "all_cached": false,
        "total_urls": urls.len(),
        "message": "Job successfully queued for background cloud execution"
    }))).into_response()
}

/// Retrieves the status, timing, and metrics for a link job
async fn jobs_get_status_handler(
    State(ctx): State<Arc<ServerContext>>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    if let Some(meta) = ctx.upstash.get_job_meta(&job_id).await {
        (StatusCode::OK, Json(meta)).into_response()
    } else {
        (StatusCode::NOT_FOUND, Json(json!({
            "error": "Job not found",
            "job_id": job_id
        }))).into_response()
    }
}

/// Enqueues a job into Upstash Redis queue for async background processing
async fn queue_enqueue_handler(
    State(ctx): State<Arc<ServerContext>>,
    Json(req): Json<EnqueueJobRequest>,
) -> impl IntoResponse {
    let q_name = req.queue.unwrap_or_else(|| "scrape".to_string());
    let payload = json!({
        "url": req.url,
        "enqueuedAt": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()
    });

    let success = ctx.upstash.enqueue_job(&q_name, &payload.to_string()).await;
    let depth = ctx.upstash.get_queue_length(&q_name).await;

    (StatusCode::OK, Json(json!({
        "success": success,
        "queue": q_name,
        "depth": depth
    }))).into_response()
}

/// Reports Upstash queue depth and status
async fn queue_status_handler(
    State(ctx): State<Arc<ServerContext>>,
) -> impl IntoResponse {
    let scrape_depth = ctx.upstash.get_queue_length("scrape").await;
    let ingest_depth = ctx.upstash.get_queue_length("ingest").await;

    Json(json!({
        "activeWorkers": ctx.config.concurrency,
        "queues": {
            "scrape": scrape_depth,
            "ingest": ingest_depth
        }
    }))
}

/// Drains Upstash Redis queue without blocking commands
async fn queue_process_handler(
    State(ctx): State<Arc<ServerContext>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut processed_count = 0;

    // Drain up to 10 pending tasks per invocation
    for _ in 0..10 {
        if let Some(payload_str) = ctx.upstash.dequeue_job("ingest").await {
            if let Ok(id_req) = serde_json::from_str::<IdentifyRequest>(&payload_str) {
                let job_id = format!("q_{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
                ctx.identifier.identify_media_item(&id_req, &job_id).await;
                processed_count += 1;
            }
        } else {
            break; // Queue is empty
        }
    }

    Ok(Json(json!({
        "success": true,
        "processed": processed_count
    })))
}

/// Worker engine runtime statistics
async fn stats_handler(State(ctx): State<Arc<ServerContext>>) -> impl IntoResponse {
    let scrape_depth = ctx.upstash.get_queue_length("scrape").await;
    Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "uptimeSecs": ctx.start_time.elapsed().as_secs(),
        "concurrency": ctx.config.concurrency,
        "queueDepth": scrape_depth,
        "cacheConnected": ctx.upstash.check_health().await
    }))
}
