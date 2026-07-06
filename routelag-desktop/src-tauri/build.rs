use std::path::Path;

fn main() {
    warn_if_bundled_engine_is_missing();
    warn_if_frontend_dist_is_missing();

    let profile = std::env::var("PROFILE").unwrap_or_default();
    let execution_level = if profile == "release" {
        "requireAdministrator"
    } else {
        "asInvoker"
    };

    let manifest = format!(
        r#"
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="{execution_level}" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#
    );

    let windows = tauri_build::WindowsAttributes::new().app_manifest(&manifest);
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run build script");
}

fn warn_if_frontend_dist_is_missing() {
    let dist_index = Path::new("../dist/index.html");
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let tauri_env = std::env::var("TAURI_ENV").unwrap_or_default();
    let is_tauri_dev = tauri_env == "dev" || tauri_env == "development";

    if !is_tauri_dev && !dist_index.exists() {
        let message = "Desktop frontend dist is missing at routelag-desktop/dist/index.html.\n\
            Run `npm.cmd run build` in routelag-desktop before building the Rust binary.\n\
            Without it, the exe will try to load http://127.0.0.1:1420 and show ERR_CONNECTION_REFUSED.";

        if profile == "release" {
            panic!("{message}");
        }

        println!("cargo:warning={message}");
    }

    if dist_index.exists() {
        println!("cargo:rerun-if-changed=../dist/index.html");
    }
}

fn warn_if_bundled_engine_is_missing() {
    println!("cargo:rerun-if-changed=engine/windows/RouteLagEngine.exe");
    println!("cargo:rerun-if-changed=engine/windows/routelag-wg.exe");
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let engine_dir = Path::new(&manifest_dir).join("engine").join("windows");
    let preferred_service = engine_dir.join("RouteLagEngine.exe");
    let preferred_tools = engine_dir.join("routelag-wg.exe");
    let fallback_service = engine_dir.join("wireguard.exe");
    let fallback_tools = engine_dir.join("wg.exe");

    let has_service = preferred_service.is_file() || fallback_service.is_file();
    let has_tools = preferred_tools.is_file() || fallback_tools.is_file();

    if !has_service || !has_tools {
        println!(
            "cargo:warning=Bundled RouteLag Engine binaries are missing from src-tauri/engine/windows."
        );
        println!(
            "cargo:warning=Expected RouteLagEngine.exe and routelag-wg.exe, or dev fallback wireguard.exe and wg.exe."
        );
    }
}
