use std::path::Path;

fn main() {
    let dist_index = Path::new("../dist/index.html");
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let tauri_env = std::env::var("TAURI_ENV").unwrap_or_default();
    let is_tauri_dev = tauri_env == "dev" || tauri_env == "development";

    if !is_tauri_dev && !dist_index.exists() {
        let message = "Installer frontend dist is missing at routelag-installer/dist/index.html.\n\
            Run `npm.cmd run build` in routelag-installer before building the Rust binary.\n\
            Without it, the exe will try to load http://127.0.0.1:1430 and show ERR_CONNECTION_REFUSED.";

        if profile == "release" {
            panic!("{message}");
        }

        println!("cargo:warning={message}");
    }

    if dist_index.exists() {
        println!("cargo:rerun-if-changed=../dist/index.html");
    }

    #[cfg(windows)]
    {
        let manifest = r#"
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
        <requestedExecutionLevel level="asInvoker" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#;
        let windows = tauri_build::WindowsAttributes::new().app_manifest(manifest);
        let attrs = tauri_build::Attributes::new().windows_attributes(windows);
        tauri_build::try_build(attrs).expect("failed to run Tauri build script");
    }

    #[cfg(not(windows))]
    tauri_build::build();
}
