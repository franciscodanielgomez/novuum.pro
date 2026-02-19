#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
use std::io::Write;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
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

// --- Impresión por archivo + PowerShell (alternativa / fallback) ---
#[cfg(windows)]
fn print_ticket_file_windows(text: &str, printer_name: Option<&str>) -> Result<(), String> {
    let mut temp = std::env::temp_dir();
    temp.push("novum_ticket_");
    temp.set_extension("txt");
    let path = temp.to_string_lossy();
    let mut f = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
    let text_for_file = format!("{}\r\n", text.replace('\n', "\r\n"));
    f.write_all(text_for_file.as_bytes()).map_err(|e| e.to_string())?;
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
fn print_ticket_file_windows(_text: &str, _printer_name: Option<&str>) -> Result<(), String> {
    Err("Impresión solo soportada en Windows".to_string())
}

// --- Impresión por GDI (dibujo línea a línea, sin ventanas ni diálogos) ---
#[cfg(windows)]
fn print_ticket_gdi_windows(text: &str, printer_name: &str) -> Result<(), String> {
    use std::iter;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::*;
    use windows::Win32::Graphics::Gdi::*;

    fn str_to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(iter::once(0)).collect()
    }

    let driver = str_to_wide("WINSPOOL");
    let device = str_to_wide(printer_name);
    let doc_name = str_to_wide("Ticket Novum");

    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return Ok(());
    }

    unsafe {
        let hdc = CreateDCW(
            PCWSTR::from_raw(driver.as_ptr()),
            PCWSTR::from_raw(device.as_ptr()),
            PCWSTR::null(),
            None,
        );
        if hdc.is_invalid() {
            return Err(format!(
                "No se pudo abrir la impresora: {}",
                std::io::Error::last_os_error()
            ));
        }

        let mut docinfo = DOCINFOW {
            cbSize: std::mem::size_of::<DOCINFOW>() as i32,
            lpszDocName: PCWSTR::from_raw(doc_name.as_ptr()),
            lpszOutput: PCWSTR::null(),
            lpszDatatype: PCWSTR::null(),
            fwType: 0,
        };

        if StartDocW(hdc, &docinfo) <= 0 {
            let _ = DeleteDC(hdc);
            return Err(format!(
                "StartDoc falló: {}",
                std::io::Error::last_os_error()
            ));
        }

        if StartPage(hdc) <= 0 {
            let _ = EndDoc(hdc);
            let _ = DeleteDC(hdc);
            return Err(format!(
                "StartPage falló: {}",
                std::io::Error::last_os_error()
            ));
        }

        // Fuente fija para ticket (térmico)
        let font = CreateFontW(
            120,  // height (0.12" approx at 1000 logical units/inch for thermal)
            0,
            0,
            0,
            400,  // FW_NORMAL
            0,
            0,
            0,
            DEFAULT_CHARSET.0,
            OUT_DEFAULT_PRECIS.0,
            CLIP_DEFAULT_PRECIS.0,
            DEFAULT_QUALITY.0,
            (FF_MODERN | FIXED_PITCH).0,
            PCWSTR::from_raw(str_to_wide("Consolas").as_ptr()),
        );
        let old_font = if !font.is_invalid() {
            SelectObject(hdc, font)
        } else {
            HGDIOBJ::default()
        };

        SetBkMode(hdc, BKMODE_TRANSPARENT);

        let mut tm = TEXTMETRICW::default();
        if GetTextMetrics(hdc, &mut tm).as_bool() {
            let line_height = (tm.tmHeight + tm.tmExternalLeading) as i32;
            let margin_x = 50;
            let mut y = 100i32;

            for line in lines {
                let line_wide = str_to_wide(line);
                if line_wide.len() > 1 {
                    let len = (line_wide.len() - 1) as i32; // sin el null
                    let _ = TextOutW(
                        hdc,
                        margin_x,
                        y,
                        PCWSTR::from_raw(line_wide.as_ptr()),
                        len,
                    );
                }
                y += line_height;
            }
        } else {
            // Fallback sin métricas: dibujar con espaciado fijo
            let line_height = 150i32;
            let margin_x = 50;
            let mut y = 100i32;
            for line in lines {
                let line_wide = str_to_wide(line);
                if line_wide.len() > 1 {
                    let len = (line_wide.len() - 1) as i32;
                    let _ = TextOutW(
                        hdc,
                        margin_x,
                        y,
                        PCWSTR::from_raw(line_wide.as_ptr()),
                        len,
                    );
                }
                y += line_height;
            }
        }

        if !old_font.is_invalid() {
            let _ = SelectObject(hdc, old_font);
        }
        if !font.is_invalid() {
            let _ = DeleteObject(font);
        }

        if EndPage(hdc) <= 0 {
            let _ = EndDoc(hdc);
            let _ = DeleteDC(hdc);
            return Err(format!(
                "EndPage falló: {}",
                std::io::Error::last_os_error()
            ));
        }
        if EndDoc(hdc) <= 0 {
            let _ = DeleteDC(hdc);
            return Err(format!(
                "EndDoc falló: {}",
                std::io::Error::last_os_error()
            ));
        }
        let _ = DeleteDC(hdc);
    }
    Ok(())
}

#[cfg(not(windows))]
fn print_ticket_gdi_windows(_text: &str, _printer_name: &str) -> Result<(), String> {
    Err("Impresión solo soportada en Windows".to_string())
}

#[tauri::command]
fn print_ticket(payload: PrintTicketPayload) -> Result<(), String> {
    let printer_name = payload
        .printer_name
        .filter(|s| !s.is_empty())
        .ok_or("No printer configured")?;
    #[cfg(windows)]
    return print_ticket_gdi_windows(payload.text.as_str(), printer_name.as_str());
    #[cfg(not(windows))]
    {
        let _ = printer_name;
        Err("Impresión solo soportada en Windows".to_string())
    }
}

/// Comando alternativo: imprimir por archivo + PowerShell (CRLF). Útil para volver atrás si hace falta.
#[tauri::command]
fn print_ticket_file(payload: PrintTicketPayload) -> Result<(), String> {
    let printer_name = payload.printer_name.filter(|s| !s.is_empty());
    if printer_name.is_none() {
        return Err("No printer configured".to_string());
    }
    print_ticket_file_windows(payload.text.as_str(), printer_name.as_deref())
}

#[derive(serde::Deserialize)]
struct PrintTicketPayload {
    text: String,
    #[serde(rename = "printerName")]
    printer_name: Option<String>,
    #[serde(rename = "useCrlf")]
    #[allow(dead_code)]
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
            print_ticket_file,
            get_app_version,
            check_update,
            download_and_install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
