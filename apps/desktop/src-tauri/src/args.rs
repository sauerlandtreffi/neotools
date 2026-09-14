/// Parse CLI / OS-association arguments for a file the user wants to open.
///
/// Skips argv0 so a binary named like a PDF cannot be treated as input.
/// Accepts `--open <path>`, `--open=<path>`, and a bare `*.pdf` path
/// (Windows/Linux file association). `file://` URLs are normalized.
pub fn parse_open_path(args: &[impl AsRef<str>]) -> Option<String> {
    let mut items = args.iter().map(AsRef::as_ref);
    let _argv0 = items.next()?;
    let rest: Vec<&str> = items.collect();
    let mut i = 0;
    while i < rest.len() {
        let arg = rest[i];
        if arg == "--open" {
            return rest.get(i + 1).copied().filter(|s| !s.is_empty()).map(normalize_path);
        }
        if let Some(value) = arg.strip_prefix("--open=") {
            if !value.is_empty() {
                return Some(normalize_path(value));
            }
        }
        if looks_like_pdf(arg) {
            return Some(normalize_path(arg));
        }
        i += 1;
    }
    None
}

fn looks_like_pdf(arg: &str) -> bool {
    if arg.is_empty() {
        return false;
    }
    if arg.starts_with('-') && !arg.starts_with("file:") {
        return false;
    }
    let path_only = arg.split(['?', '#']).next().unwrap_or(arg);
    path_only.to_ascii_lowercase().ends_with(".pdf")
}

fn normalize_path(arg: &str) -> String {
    let stripped = arg.strip_prefix("file://").unwrap_or(arg);
    percent_decode(stripped)
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_flag_with_path() {
        let args = ["neotools", "--open", "/tmp/akte.pdf"];
        assert_eq!(parse_open_path(&args).as_deref(), Some("/tmp/akte.pdf"));
    }

    #[test]
    fn open_equals_form() {
        let args = ["neotools", "--open=/docs/x.pdf"];
        assert_eq!(parse_open_path(&args).as_deref(), Some("/docs/x.pdf"));
    }

    #[test]
    fn bare_pdf_argument() {
        let args = ["neotools", "/docs/file.pdf"];
        assert_eq!(parse_open_path(&args).as_deref(), Some("/docs/file.pdf"));
    }

    #[test]
    fn skips_unrelated_flags() {
        let args = ["neotools", "--flag", "value"];
        assert_eq!(parse_open_path(&args), None);
    }

    #[test]
    fn ignores_argv0_even_if_named_pdf() {
        let args = ["NeoTools.pdf"];
        assert_eq!(parse_open_path(&args), None);
    }

    #[test]
    fn normalizes_file_url() {
        let args = ["neotools", "file:///tmp/report%20v2.pdf"];
        assert_eq!(parse_open_path(&args).as_deref(), Some("/tmp/report v2.pdf"));
    }
}
