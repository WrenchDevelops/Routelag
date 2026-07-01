use std::path::Path;

fn main() {
    warn_if_bundled_engine_is_missing();

    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(
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
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#,
    );
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run build script");
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
