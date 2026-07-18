//! Allowlist for opening external URLs from the desktop app.
//! Rejects file:, javascript:, and non-allowlisted hosts.

use url::Url;

const ALLOWED_HOST_SUFFIXES: &[&str] = &[
    "routelag.com",
    "discord.com",
    "discordapp.com",
    "discord.gg",
    "epicgames.com",
    "clerk.com",
    "clerk.accounts.dev",
    "accounts.dev",
];

const ALLOWED_EXACT_HOSTS: &[&str] = &[
    "routelag.com",
    "www.routelag.com",
    "discord.com",
    "cdn.discordapp.com",
    "epicgames.com",
    "www.epicgames.com",
    "accounts.epicgames.com",
    "clerk.com",
];

pub fn validate_external_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("URL is empty.".to_string());
    }

    let parsed = Url::parse(trimmed).map_err(|_| "URL is not valid.".to_string())?;
    let scheme = parsed.scheme();

    if scheme == "mailto" {
        if parsed.path().is_empty() {
            return Err("mailto URL is missing an address.".to_string());
        }
        return Ok(trimmed.to_string());
    }

    if scheme != "https" {
        return Err("Only https (or mailto) URLs may be opened.".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "URL is missing a host.".to_string())?
        .to_ascii_lowercase();

    if host_is_allowed(&host) {
        Ok(trimmed.to_string())
    } else {
        Err(format!("Opening '{host}' is not allowlisted."))
    }
}

fn host_is_allowed(host: &str) -> bool {
    if ALLOWED_EXACT_HOSTS.iter().any(|h| *h == host) {
        return true;
    }
    ALLOWED_HOST_SUFFIXES.iter().any(|suffix| {
        host == *suffix || host.ends_with(&format!(".{suffix}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_support_and_oauth_hosts() {
        assert!(validate_external_url("https://routelag.com/support/plans").is_ok());
        assert!(validate_external_url("https://discord.com/api/oauth2/authorize?x=1").is_ok());
        assert!(validate_external_url("https://accounts.epicgames.com/id/authorize").is_ok());
        assert!(validate_external_url("https://foo.clerk.accounts.dev/sign-in").is_ok());
        assert!(validate_external_url("mailto:support@routelag.com").is_ok());
    }

    #[test]
    fn rejects_dangerous_schemes_and_hosts() {
        assert!(validate_external_url("http://example.com").is_err());
        assert!(validate_external_url("file:///C:/Windows/System32").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("https://evil.example").is_err());
        assert!(validate_external_url("https://notroutelag.com").is_err());
    }
}
