pub(crate) fn find_free_port(preferred: u16) -> u16 {
    for port in preferred..preferred.saturating_add(200) {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    preferred
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_free_port_returns_preferred_when_available() {
        let port = find_free_port(43210);
        assert!(port >= 43210);
        assert!(port < 43210 + 200);
    }
}
