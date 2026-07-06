use std::ffi::OsStr;
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn apply_no_window(cmd: &mut Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn apply_no_window(_cmd: &mut Command) {}

fn apply_piped_stdio(cmd: &mut Command) {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
}

fn apply_piped_stdio_with_stdin(cmd: &mut Command) {
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
}

/// Spawn a background process without showing a console window on Windows.
pub fn hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    apply_no_window(&mut cmd);
    apply_piped_stdio(&mut cmd);
    cmd
}

/// Same as [`hidden_command`], but accepts a path to an executable.
pub fn hidden_command_program(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    apply_no_window(&mut cmd);
    apply_piped_stdio(&mut cmd);
    cmd
}

/// Hidden process with piped stdin for programs that read from standard input.
pub fn hidden_command_program_with_stdin(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    apply_no_window(&mut cmd);
    apply_piped_stdio_with_stdin(&mut cmd);
    cmd
}

/// Run PowerShell hidden. Prefer direct executables when possible.
pub fn hidden_powershell_command(script: &str) -> Command {
    let mut cmd = hidden_command("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-Command",
        script,
    ]);
    cmd
}
