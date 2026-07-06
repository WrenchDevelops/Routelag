//! Relaunches this same executable elevated (UAC) to run a headless "worker" that performs the
//! privileged Program Files / HKLM operations, while the visible window stays non-elevated.
//! This is the only place a native Windows dialog (the UAC consent prompt) is shown.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

pub enum ElevateError {
    UserDeclined,
    Failed(String),
}

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
pub struct ElevatedProcess {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for ElevatedProcess {}

#[cfg(windows)]
impl ElevatedProcess {
    /// Waits up to `timeout_ms`; returns `Some(exit_code)` once the process has exited.
    pub fn try_wait(&mut self, timeout_ms: u32) -> Option<u32> {
        use windows_sys::Win32::Foundation::WAIT_OBJECT_0;
        use windows_sys::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject};

        let result = unsafe { WaitForSingleObject(self.handle, timeout_ms) };
        if result != WAIT_OBJECT_0 {
            return None;
        }
        let mut code: u32 = 0;
        unsafe { GetExitCodeProcess(self.handle, &mut code) };
        Some(code)
    }
}

#[cfg(windows)]
impl Drop for ElevatedProcess {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::CloseHandle;
        unsafe { CloseHandle(self.handle) };
    }
}

#[cfg(windows)]
pub fn launch_elevated(exe_path: &str, args: &str) -> Result<ElevatedProcess, ElevateError> {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_CANCELLED};
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let verb = to_wide("runas");
    let file = to_wide(exe_path);
    let params = to_wide(args);

    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS;
    info.lpVerb = verb.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = params.as_ptr();
    info.nShow = SW_HIDE as i32;

    let ok = unsafe { ShellExecuteExW(&mut info) };
    if ok == 0 {
        let err = unsafe { GetLastError() };
        return if err == ERROR_CANCELLED {
            Err(ElevateError::UserDeclined)
        } else {
            Err(ElevateError::Failed(format!(
                "Windows refused to launch the elevated installer (error {err})"
            )))
        };
    }

    if info.hProcess.is_null() {
        return Err(ElevateError::Failed("Windows did not return a process handle".into()));
    }

    Ok(ElevatedProcess { handle: info.hProcess })
}

#[cfg(not(windows))]
pub struct ElevatedProcess;

#[cfg(not(windows))]
impl ElevatedProcess {
    pub fn try_wait(&mut self, _timeout_ms: u32) -> Option<u32> {
        Some(0)
    }
}

#[cfg(not(windows))]
pub fn launch_elevated(_exe_path: &str, _args: &str) -> Result<ElevatedProcess, ElevateError> {
    Err(ElevateError::Failed("elevation is only supported on Windows".into()))
}
