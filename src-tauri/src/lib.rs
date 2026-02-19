#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Oculta la ventana de consola al ejecutar PowerShell (impresión silenciosa).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn list_printers_windows() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-Printer | Select-Object -ExpandProperty Name",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell error: {}", stderr));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let list: Vec<String> = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .filter(|s| !s.eq_ignore_ascii_case("Microsoft Print to PDF"))
        .collect();
    Ok(list)
}

#[cfg(not(windows))]
fn list_printers_windows() -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    return list_printers_windows();
    #[cfg(not(windows))]
    return Ok(vec![]);
}

#[cfg(windows)]
fn print_ticket_windows(text: &str, printer_name: Option<&str>) -> Result<(), String> {
    let mut temp = std::env::temp_dir();
    temp.push("novum_ticket_");
    temp.set_extension("txt");
    let path = temp.to_string_lossy();
    let mut f = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
    f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    drop(f);

    let cmd = if let Some(name) = printer_name {
        format!(
            "Get-Content -Path '{}' -Raw | Out-Printer -Name '{}'",
            path.replace('\'', "''"),
            name.replace('\'', "''")
        )
    } else {
        format!(
            "Get-Content -Path '{}' -Raw | Out-Printer",
            path.replace('\'', "''")
        )
    };

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &cmd])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&temp);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Error al imprimir: {}", stderr));
    }
    Ok(())
}

#[cfg(not(windows))]
fn print_ticket_windows(_text: &str, _printer_name: Option<&str>) -> Result<(), String> {
    Err("Impresión solo soportada en Windows".to_string())
}

#[tauri::command]
fn print_ticket(payload: PrintTicketPayload) -> Result<(), String> {
    let printer_name = payload.printer_name.filter(|s| !s.is_empty());
    if printer_name.is_none() {
        return Err("No printer configured".to_string());
    }
    let text_for_file = if payload.use_crlf == Some(true) {
        format!("{}\r\n", payload.text.replace('\n', "\r\n"))
    } else {
        format!("{}\n", payload.text)
    };
    print_ticket_windows(&text_for_file, printer_name.as_deref())
}

#[derive(serde::Deserialize)]
struct PrintTicketPayload {
    text: String,
    #[serde(rename = "printerName")]
    printer_name: Option<String>,
    #[serde(rename = "useCrlf")]
    use_crlf: Option<bool>,
}

#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    date: Option<String>,
    body: Option<String>,
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version,
        date: u.date.map(|d| d.to_string()),
        body: u.body,
    }))
}

#[tauri::command]
async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let Some(update) = update else {
        return Err("No hay actualización disponible".to_string());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // En Windows el instalador cierra la app; en otros SO podrías llamar a relaunch desde el frontend si hace falta
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Ventana principal: en dev carga localhost, en producción carga https://novuum.pro
            let url = if cfg!(debug_assertions) {
                WebviewUrl::External("http://localhost:5173".parse().unwrap())
            } else {
                WebviewUrl::External("https://novuum.pro".parse().unwrap())
            };
            WebviewWindowBuilder::new(app, "main", url)
                .title("Novuum POS")
                .inner_size(1280.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_ticket,
            get_app_version,
            check_update,
            download_and_install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
