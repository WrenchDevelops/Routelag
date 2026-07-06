use thiserror::Error;

#[derive(Debug, Error)]
pub enum ElevationError {
    #[error("Administrator permission was denied. RouteLag will stay in normal mode.")]
    ElevationDenied,
    #[cfg_attr(windows, allow(dead_code))]
    #[error("Elevation is only supported on Windows.")]
    UnsupportedPlatform,
    #[error("Failed to restart as administrator: {0}")]
    Failed(String),
}

#[cfg(windows)]
pub fn is_elevated() -> bool {
    use std::mem::MaybeUninit;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }

        let mut elevation = MaybeUninit::<TOKEN_ELEVATION>::uninit();
        let mut size = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            elevation.as_mut_ptr().cast(),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        );
        CloseHandle(token);

        if ok == 0 {
            return false;
        }

        elevation.assume_init().TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
pub fn is_elevated() -> bool {
    false
}

#[cfg(windows)]
pub fn restart_as_admin() -> Result<(), ElevationError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOW;

    let exe = std::env::current_exe().map_err(|e| ElevationError::Failed(e.to_string()))?;
    let exe_wide: Vec<u16> = OsStr::new(exe.as_os_str())
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let verb: Vec<u16> = OsStr::new("runas")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            exe_wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOW,
        )
    };

    // ShellExecute returns > 32 on success
    if result as isize <= 32 {
        return Err(ElevationError::ElevationDenied);
    }

    std::process::exit(0);
}

#[cfg(not(windows))]
pub fn restart_as_admin() -> Result<(), ElevationError> {
    Err(ElevationError::UnsupportedPlatform)
}
