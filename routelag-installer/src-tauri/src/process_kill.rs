//! Terminate a running RouteLag instance before overwriting/removing its files, without ever
//! shelling out to `taskkill.exe` (which can flash a console window under some launch contexts).

use sysinfo::{ProcessesToUpdate, System};

pub fn kill_by_name(process_name: &str) {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    for process in system.processes_by_name(process_name.as_ref()) {
        process.kill();
    }
    // Give the OS a brief moment to release file handles before we start copying/deleting.
    std::thread::sleep(std::time::Duration::from_millis(300));
}
