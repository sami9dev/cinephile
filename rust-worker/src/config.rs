use std::env;
use std::fs;

fn load_dotenv() {
    for path in &[
        "rust-worker/.env",
        "cineflue084-main/rust-worker/.env",
        "cineflue084-main/.env.local",
        "cineflue084-main/.env",
        ".env",
        ".env.local",
        "../.env.local",
        "../.env",
        "../../.env.local",
        "../../.env",
    ] {
        if let Ok(content) = fs::read_to_string(path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((key, val)) = trimmed.split_once('=') {
                    let k = key.trim();
                    let v = val.trim().trim_matches('"').trim_matches('\'');
                    if env::var(k).is_err() && !v.is_empty() {
                        env::set_var(k, v);
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub concurrency: usize,
    pub request_timeout_ms: u64,
    pub upstash_redis_rest_url: Option<String>,
    pub upstash_redis_rest_token: Option<String>,
    pub supabase_url: Option<String>,
    pub supabase_service_role_key: Option<String>,
    pub telegram_bot_token: Option<String>,
    pub tmdb_api_key: String,
    pub admin_secret_key: Option<String>,
    pub cinefuel_api_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        load_dotenv();

        let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(10000);

        // Conservative worker limit defaulting to 1 per service instance
        let concurrency = env::var("WORKER_CONCURRENCY")
            .ok()
            .and_then(|c| c.parse::<usize>().ok())
            .unwrap_or(1);

        let request_timeout_ms = env::var("REQUEST_TIMEOUT_MS")
            .ok()
            .and_then(|t| t.parse::<u64>().ok())
            .unwrap_or(15000);

        let upstash_redis_rest_url = env::var("UPSTASH_REDIS_REST_URL")
            .or_else(|_| env::var("KV_REST_API_URL"))
            .ok()
            .map(|u| u.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|u| !u.is_empty());

        let upstash_redis_rest_token = env::var("UPSTASH_REDIS_REST_TOKEN")
            .or_else(|_| env::var("KV_REST_API_TOKEN"))
            .ok()
            .map(|t| t.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|t| !t.is_empty());

        let supabase_url = env::var("NEXT_PUBLIC_SUPABASE_URL")
            .or_else(|_| env::var("SUPABASE_URL"))
            .ok()
            .map(|u| u.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|u| !u.is_empty());

        let supabase_service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
            .or_else(|_| env::var("SUPABASE_SERVICE_KEY"))
            .ok()
            .map(|k| k.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|k| !k.is_empty());

        let telegram_bot_token = env::var("TELEGRAM_BOT_TOKEN")
            .ok()
            .map(|t| t.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|t| !t.is_empty());

        let tmdb_api_key = env::var("TMDB_API_KEY")
            .or_else(|_| env::var("NEXT_PUBLIC_TMDB_API_KEY"))
            .unwrap_or_default()
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();

        let admin_secret_key = env::var("ADMIN_SECRET_KEY")
            .or_else(|_| env::var("ADMIN_SESSION_SECRET"))
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let cinefuel_api_url = env::var("CINEFUEL_API_URL")
            .or_else(|_| env::var("NEXT_PUBLIC_SITE_URL"))
            .unwrap_or_else(|_| "http://localhost:3000".to_string())
            .trim_end_matches('/')
            .to_string();

        Self {
            host,
            port,
            concurrency,
            request_timeout_ms,
            upstash_redis_rest_url,
            upstash_redis_rest_token,
            supabase_url,
            supabase_service_role_key,
            telegram_bot_token,
            tmdb_api_key,
            admin_secret_key,
            cinefuel_api_url,
        }
    }
}
