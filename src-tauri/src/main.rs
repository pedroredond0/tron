// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, AtomicU64, Ordering};
use std::time::UNIX_EPOCH;
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use tauri::Emitter;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::ptr;

#[cfg(target_os = "windows")]
#[allow(non_snake_case)]
#[repr(C)]
pub struct SHFILEOPSTRUCTW {
    pub hwnd: *mut std::ffi::c_void,
    pub wFunc: u32,
    pub pFrom: *const u16,
    pub pTo: *const u16,
    pub fFlags: u16,
    pub fAnyOperationsAborted: i32,
    pub hNameMappings: *mut std::ffi::c_void,
    pub lpszProgressTitle: *const u16,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct SIZE {
    cx: i32,
    cy: i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct GUID {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

#[cfg(target_os = "windows")]
const IID_ISHELL_ITEM_IMAGE_FACTORY: GUID = GUID {
    data1: 0xbcc18b79,
    data2: 0xba16,
    data3: 0x442f,
    data4: [0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b],
};

#[cfg(target_os = "windows")]
#[repr(C)]
struct IShellItemImageFactoryVtbl {
    pub query_interface: unsafe extern "system" fn(this: *mut std::ffi::c_void, riid: *const GUID, ppv: *mut *mut std::ffi::c_void) -> i32,
    pub add_ref: unsafe extern "system" fn(this: *mut std::ffi::c_void) -> u32,
    pub release: unsafe extern "system" fn(this: *mut std::ffi::c_void) -> u32,
    pub get_image: unsafe extern "system" fn(this: *mut std::ffi::c_void, size: SIZE, flags: u32, phbm: *mut *mut std::ffi::c_void) -> i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct IShellItemImageFactory {
    pub lp_vtbl: *const IShellItemImageFactoryVtbl,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct BITMAP {
    bm_type: i32,
    bm_width: i32,
    bm_height: i32,
    bm_width_bytes: i32,
    bm_planes: u16,
    bm_bits_pixel: u16,
    bm_bits: *mut std::ffi::c_void,
}

#[cfg(target_os = "windows")]
#[repr(C, packed)]
struct BITMAPFILEHEADER {
    bf_type: u16,
    bf_size: u32,
    bf_reserved1: u16,
    bf_reserved2: u16,
    bf_off_bits: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct BITMAPINFOHEADER {
    bi_size: u32,
    bi_width: i32,
    bi_height: i32,
    bi_planes: u16,
    bi_bit_count: u16,
    bi_compression: u32,
    bi_size_image: u32,
    bi_x_pels_per_meter: i32,
    bi_y_pels_per_meter: i32,
    bi_clr_used: u32,
    bi_clr_important: u32,
}

#[cfg(target_os = "windows")]
#[link(name = "shell32")]
extern "system" {
    pub fn SHFileOperationW(lpFileOp: *mut SHFILEOPSTRUCTW) -> i32;
    fn SHCreateItemFromParsingName(
        psz_path: *const u16,
        pbc: *mut std::ffi::c_void,
        riid: *const GUID,
        ppv: *mut *mut std::ffi::c_void,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "ole32")]
extern "system" {
    fn CoInitializeEx(pv_reserved: *mut std::ffi::c_void, dw_co_init: u32) -> i32;
    fn CoUninitialize();
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetDC(h_wnd: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn ReleaseDC(h_wnd: *mut std::ffi::c_void, h_dc: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "gdi32")]
extern "system" {
    fn GetObjectW(h: *mut std::ffi::c_void, c: i32, pv: *mut std::ffi::c_void) -> i32;
    fn GetDIBits(
        hdc: *mut std::ffi::c_void,
        hbm: *mut std::ffi::c_void,
        start: u32,
        c_lines: u32,
        lpv_bits: *mut std::ffi::c_void,
        lpbmi: *mut BITMAPINFOHEADER,
        usage: u32,
    ) -> i32;
    fn DeleteObject(ho: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
const FO_MOVE: u32 = 0x0001;
#[cfg(target_os = "windows")]
const FO_COPY: u32 = 0x0002;
#[cfg(target_os = "windows")]
const FOF_ALLOWUNDO: u16 = 0x0040; // Send to recycle bin if deleting, but for copy/move allows undo

static OPERATION_COUNTER: AtomicU64 = AtomicU64::new(1);
static STREAM_PORT: AtomicU16 = AtomicU16::new(0);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgressPayload {
    pub operation_id: String,
    pub action: String, // "copy" or "move"
    pub current_item: String,
    pub current_index: usize,
    pub total_items: usize,
    pub bytes_copied: u64,
    pub total_bytes: u64,
    pub target_directory: String,
    pub is_done: bool,
    pub speed_bytes_per_sec: f64,
    pub eta_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferFinishedPayload {
    pub operation_id: String,
    pub action: String,
    pub success: bool,
    pub error: Option<String>,
    pub items_count: usize,
    pub total_bytes: u64,
    pub target_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub modified: u64,
    pub extension: String,
    pub file_type: String, // "folder", "image", "audio", "video", "text", "binary"
    pub is_hidden: bool,
}

#[derive(Debug, Deserialize)]
pub struct SherlockFilter {
    pub base_path: String,
    pub search_root: bool,
    pub preset: Option<String>,
    pub query: Option<String>,
    pub size_mode: Option<String>,
    pub size_bytes: Option<u64>,
    pub min_date: Option<u64>,
    pub max_date: Option<u64>,
    pub max_results: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SherlockResult {
    pub items: Vec<FileItem>,
    pub dir_sizes: Vec<DirectorySizeResult>,
}

struct SizeItem {
    size: u64,
    item: FileItem,
}

impl PartialEq for SizeItem {
    fn eq(&self, other: &Self) -> bool {
        self.size == other.size
    }
}
impl Eq for SizeItem {}
impl PartialOrd for SizeItem {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for SizeItem {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.size.cmp(&other.size)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DriveItem {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserPlace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryResult {
    pub current_path: String,
    pub items: Vec<FileItem>,
    pub free_space_bytes: Option<u64>,
    pub total_space_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskSpaceInfo {
    pub free_bytes: u64,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FilePreviewResult {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub modified: u64,
    pub file_type: String, // "image", "audio", "video", "pdf", "text", "folder", "binary"
    pub content: Option<String>,
    pub data_url: Option<String>,
    pub mime_type: Option<String>,
    pub is_too_large: bool,
    pub max_size_bytes: u64,
    pub error_message: Option<String>,
    pub folder_files: Option<usize>,
    pub folder_subdirs: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectorySizeResult {
    pub path: String,
    pub total_size: u64,
    pub file_count: usize,
    pub dir_count: usize,
}

const MAX_PREVIEW_TEXT_SIZE: u64 = 5 * 1024 * 1024; // 5 MB
const MAX_PREVIEW_VIDEO_SIZE: u64 = 80 * 1024 * 1024; // 80 MB limit for video
const MAX_PREVIEW_BINARY_SIZE: u64 = 100 * 1024 * 1024; // 100 MB for images, pdf, audio

#[cfg(target_os = "windows")]
fn get_shell_preview_data_url(file_path: &Path, max_dimension: i32) -> Result<String, String> {
    unsafe {
        CoInitializeEx(ptr::null_mut(), 0x2);
        let path_str = file_path.to_string_lossy();
        let path_w: Vec<u16> = OsStr::new(&*path_str).encode_wide().chain(std::iter::once(0)).collect();
        let mut factory: *mut std::ffi::c_void = ptr::null_mut();
        let hr = SHCreateItemFromParsingName(path_w.as_ptr(), ptr::null_mut(), &IID_ISHELL_ITEM_IMAGE_FACTORY, &mut factory);
        if hr != 0 || factory.is_null() {
            CoUninitialize();
            return Err("No se pudo obtener el elemento de Shell de Windows".into());
        }

        let obj = factory as *mut IShellItemImageFactory;
        let mut hbm: *mut std::ffi::c_void = ptr::null_mut();
        let hr_img = ((*(*obj).lp_vtbl).get_image)(factory, SIZE { cx: max_dimension, cy: max_dimension }, 0x1, &mut hbm);
        ((*(*obj).lp_vtbl).release)(factory);
        CoUninitialize();

        if hr_img != 0 || hbm.is_null() {
            return Err(format!("GetImage falló con código 0x{:08X}", hr_img as u32));
        }

        let mut bm: BITMAP = std::mem::zeroed();
        GetObjectW(hbm, std::mem::size_of::<BITMAP>() as i32, &mut bm as *mut _ as *mut _);
        let w = bm.bm_width;
        let h = bm.bm_height;

        if w <= 0 || h <= 0 || w > 8192 || h > 8192 {
            DeleteObject(hbm);
            return Err("Dimensiones de mapa de bits no válidas".into());
        }

        let mut bih: BITMAPINFOHEADER = std::mem::zeroed();
        bih.bi_size = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bih.bi_width = w;
        bih.bi_height = h;
        bih.bi_planes = 1;
        bih.bi_bit_count = 32;
        bih.bi_compression = 0; // BI_RGB

        let image_size = (w * 4 * h) as usize;
        let mut pixel_data = vec![0u8; image_size];
        let hdc = GetDC(ptr::null_mut());
        GetDIBits(hdc, hbm, 0, h as u32, pixel_data.as_mut_ptr() as *mut _, &mut bih, 0);
        ReleaseDC(ptr::null_mut(), hdc);
        DeleteObject(hbm);

        let file_header_size = 14usize;
        let info_header_size = 40usize;
        let total_size = file_header_size + info_header_size + image_size;

        let bfh = BITMAPFILEHEADER {
            bf_type: 0x4D42, // "BM"
            bf_size: total_size as u32,
            bf_reserved1: 0,
            bf_reserved2: 0,
            bf_off_bits: (file_header_size + info_header_size) as u32,
        };

        let mut bmp_bytes = Vec::with_capacity(total_size);
        let bfh_slice = std::slice::from_raw_parts(&bfh as *const _ as *const u8, file_header_size);
        bmp_bytes.extend_from_slice(bfh_slice);
        let bih_slice = std::slice::from_raw_parts(&bih as *const _ as *const u8, info_header_size);
        bmp_bytes.extend_from_slice(bih_slice);
        bmp_bytes.extend_from_slice(&pixel_data);

        let b64 = BASE64_STANDARD.encode(&bmp_bytes);
        Ok(format!("data:image/bmp;base64,{}", b64))
    }
}

#[cfg(not(target_os = "windows"))]
fn get_shell_preview_data_url(_file_path: &Path, _max_dimension: i32) -> Result<String, String> {
    Err("Shell thumbnail extraction is only supported on Windows".into())
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next().unwrap_or(0);
            let h2 = chars.next().unwrap_or(0);
            let hex_str = [h1, h2];
            if let Ok(st) = std::str::from_utf8(&hex_str) {
                if let Ok(val) = u8::from_str_radix(st, 16) {
                    bytes.push(val);
                    continue;
                }
            }
        } else if b == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn start_streaming_server() {
    let listener = match std::net::TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(_) => return,
    };
    if let Ok(addr) = listener.local_addr() {
        STREAM_PORT.store(addr.port(), Ordering::SeqCst);
    }
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                std::thread::spawn(move || {
                    let mut buf = [0u8; 4096];
                    if let Ok(n) = stream.read(&mut buf) {
                        let req = String::from_utf8_lossy(&buf[..n]);
                        let mut lines = req.lines();
                        if let Some(first_line) = lines.next() {
                            let parts: Vec<&str> = first_line.split_whitespace().collect();
                            if parts.len() >= 2 && parts[0] == "GET" {
                                let query = parts[1];
                                let path_start = query.find("path=").map(|p| p + 5).unwrap_or(0);
                                let raw_path = &query[path_start..];
                                let file_path = percent_decode(raw_path);

                                if let Ok(mut f) = File::open(&file_path) {
                                    let ext = Path::new(&file_path)
                                        .extension()
                                        .and_then(|e| e.to_str())
                                        .unwrap_or("");
                                    let mime = get_mime_type(ext);
                                    let total_size = f.metadata().map(|m| m.len()).unwrap_or(0);

                                    let mut range_val = None;
                                    for l in req.lines() {
                                        if l.to_lowercase().starts_with("range:") {
                                            if let Some(eq) = l.find('=') {
                                                range_val = Some(l[eq + 1..].trim().to_string());
                                            }
                                        }
                                    }

                                    if let Some(r) = range_val {
                                        let r_parts: Vec<&str> = r.split('-').collect();
                                        let start: u64 = r_parts[0].parse().unwrap_or(0);
                                        let end: u64 = if r_parts.len() > 1 && !r_parts[1].is_empty() {
                                            r_parts[1].parse().unwrap_or(total_size.saturating_sub(1))
                                        } else {
                                            total_size.saturating_sub(1)
                                        };
                                        let start = start.min(total_size);
                                        let end = end.min(total_size.saturating_sub(1));
                                        let chunk = if end >= start { end - start + 1 } else { 0 };

                                        let header = format!(
                                            "HTTP/1.1 206 Partial Content\r\nContent-Type: {}\r\nContent-Range: bytes {}-{}/{}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
                                            mime, start, end, total_size, chunk
                                        );
                                        let _ = stream.write_all(header.as_bytes());
                                        if f.seek(SeekFrom::Start(start)).is_ok() {
                                            let _ = std::io::copy(&mut f.take(chunk), &mut stream);
                                        }
                                    } else {
                                        let header = format!(
                                            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
                                            mime, total_size
                                        );
                                        let _ = stream.write_all(header.as_bytes());
                                        let _ = std::io::copy(&mut f, &mut stream);
                                    }
                                } else {
                                    let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
                                    let _ = stream.write_all(not_found.as_bytes());
                                }
                            }
                        }
                    }
                });
            }
        }
    });
}

fn escape_html_str(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn extract_raw_embedded_jpeg(file_path: &Path) -> Option<String> {
    let mut f = File::open(file_path).ok()?;
    let mut buf = vec![0u8; 30 * 1024 * 1024]; // First 30 MB
    let n = f.read(&mut buf).ok()?;
    buf.truncate(n);

    let mut i = 0;
    let mut best_jpeg: Option<(usize, usize, usize)> = None;
    while i < buf.len().saturating_sub(3) {
        if buf[i] == 0xFF && buf[i + 1] == 0xD8 && buf[i + 2] == 0xFF {
            let start = i;
            let mut j = start + 2;
            let mut end = 0;
            while j < buf.len().saturating_sub(1) {
                if buf[j] == 0xFF && buf[j + 1] == 0xD9 {
                    end = j + 2;
                    break;
                }
                j += 1;
            }
            if end > start {
                let sz = end - start;
                if sz >= 4000 {
                    if let Some((_, _, best_sz)) = best_jpeg {
                        if sz > best_sz {
                            best_jpeg = Some((start, end, sz));
                        }
                    } else {
                        best_jpeg = Some((start, end, sz));
                    }
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }

    if let Some((start, end, _)) = best_jpeg {
        let b64 = BASE64_STANDARD.encode(&buf[start..end]);
        Some(format!("data:image/jpeg;base64,{}", b64))
    } else {
        None
    }
}

fn extract_docx_content(file_path: &Path) -> Result<String, String> {
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut doc_xml = String::new();
    {
        let mut entry = archive.by_name("word/document.xml").map_err(|e| e.to_string())?;
        entry.read_to_string(&mut doc_xml).map_err(|e| e.to_string())?;
    }

    let mut html = String::new();
    html.push_str("<div class=\"docx-doc max-w-3xl mx-auto space-y-3 font-sans text-xs leading-relaxed text-gnome-text select-text\">");

    for p_chunk in doc_xml.split("<w:p ") {
        let is_heading = p_chunk.contains("val=\"Heading1\"") || p_chunk.contains("val=\"Heading2\"") || p_chunk.contains("val=\"Heading3\"") || p_chunk.contains("val=\"Title\"");
        let is_bullet = p_chunk.contains("<w:numPr>");

        let mut p_text = String::new();
        for t_chunk in p_chunk.split("<w:t") {
            if let Some(start_bracket) = t_chunk.find('>') {
                if let Some(close_tag) = t_chunk.find("</w:t>") {
                    let val = &t_chunk[start_bracket + 1..close_tag];
                    p_text.push_str(val);
                }
            }
        }

        let trimmed = p_text.trim();
        if !trimmed.is_empty() {
            let escaped = escape_html_str(trimmed);
            if is_heading {
                html.push_str(&format!("<h2 class=\"text-sm font-bold text-gnome-active border-b border-gnome-border/50 pb-1 mt-4 mb-2\">{}</h2>", escaped));
            } else if is_bullet {
                html.push_str(&format!("<div class=\"flex items-start gap-2 pl-4\"><span class=\"text-gnome-active font-bold\">•</span><span>{}</span></div>", escaped));
            } else {
                html.push_str(&format!("<p class=\"text-gnome-text/90\">{}</p>", escaped));
            }
        }
    }

    html.push_str("</div>");
    Ok(html)
}

fn extract_xlsx_content(file_path: &Path) -> Result<String, String> {
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut shared_strings: Vec<String> = Vec::new();
    if let Ok(mut ss_entry) = archive.by_name("xl/sharedStrings.xml") {
        let mut ss_xml = String::new();
        let _ = ss_entry.read_to_string(&mut ss_xml);
        for si_chunk in ss_xml.split("<si>") {
            let mut str_val = String::new();
            for t_chunk in si_chunk.split("<t") {
                if let Some(start_b) = t_chunk.find('>') {
                    if let Some(close_t) = t_chunk.find("</t>") {
                        str_val.push_str(&t_chunk[start_b + 1..close_t]);
                    }
                }
            }
            if !str_val.is_empty() {
                shared_strings.push(str_val);
            }
        }
    }

    let mut sheet_xml = String::new();
    {
        let mut sheet_entry = archive.by_name("xl/worksheets/sheet1.xml").map_err(|e| e.to_string())?;
        sheet_entry.read_to_string(&mut sheet_xml).map_err(|e| e.to_string())?;
    }

    let mut html = String::new();
    html.push_str("<div class=\"xlsx-table-wrapper overflow-auto max-h-[65vh] border border-gnome-border rounded-lg shadow bg-gnome-surface\">");
    html.push_str("<table class=\"w-full text-left text-xs border-collapse font-mono select-text\">");

    let mut row_count = 0;
    for row_chunk in sheet_xml.split("<row ") {
        if row_count > 100 { break; }
        if !row_chunk.contains("</row>") { continue; }

        let row_num = if let Some(r_pos) = row_chunk.find("r=\"") {
            let rest = &row_chunk[r_pos + 3..];
            rest.split('"').next().unwrap_or("")
        } else {
            ""
        };

        html.push_str("<tr class=\"border-b border-gnome-border/40 hover:bg-gnome-hover/50\">");
        html.push_str(&format!("<td class=\"px-2 py-1 bg-gnome-sidebar border-r border-gnome-border text-[10px] text-gnome-textDim text-center select-none font-semibold\">{}</td>", row_num));

        for c_chunk in row_chunk.split("<c ") {
            if !c_chunk.contains("</c>") && !c_chunk.contains("/>") { continue; }
            let is_string = c_chunk.contains("t=\"s\"");
            let cell_val = if let Some(v_start) = c_chunk.find("<v>") {
                if let Some(v_end) = c_chunk.find("</v>") {
                    let raw_v = &c_chunk[v_start + 3..v_end];
                    if is_string {
                        if let Ok(idx) = raw_v.parse::<usize>() {
                            shared_strings.get(idx).cloned().unwrap_or_else(|| raw_v.to_string())
                        } else {
                            raw_v.to_string()
                        }
                    } else {
                        raw_v.to_string()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let escaped = escape_html_str(&cell_val);
            html.push_str(&format!("<td class=\"px-3 py-1.5 border-r border-gnome-border/30 truncate max-w-xs text-gnome-text\">{}</td>", escaped));
        }

        html.push_str("</tr>");
        row_count += 1;
    }

    html.push_str("</table></div>");
    Ok(html)
}

fn extract_pptx_content(file_path: &Path) -> Result<String, String> {
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut slide_names: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            let name = entry.name().to_string();
            if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                slide_names.push(name);
            }
        }
    }

    slide_names.sort_by(|a, b| {
        let num_a: u32 = a.trim_start_matches("ppt/slides/slide").trim_end_matches(".xml").parse().unwrap_or(0);
        let num_b: u32 = b.trim_start_matches("ppt/slides/slide").trim_end_matches(".xml").parse().unwrap_or(0);
        num_a.cmp(&num_b)
    });

    let mut html = String::new();
    html.push_str("<div class=\"pptx-slides-wrapper space-y-4 max-w-3xl mx-auto overflow-auto max-h-[65vh] p-2 select-text\">");

    for (idx, slide_name) in slide_names.iter().enumerate() {
        let mut slide_xml = String::new();
        if let Ok(mut entry) = archive.by_name(slide_name) {
            let _ = entry.read_to_string(&mut slide_xml);
        }

        let mut texts = Vec::new();
        for t_chunk in slide_xml.split("<a:t>") {
            if let Some(end_t) = t_chunk.find("</a:t>") {
                let val = t_chunk[..end_t].trim();
                if !val.is_empty() {
                    texts.push(val.to_string());
                }
            }
        }

        html.push_str("<div class=\"slide-card bg-gnome-sidebar border border-gnome-border rounded-xl p-5 shadow-lg space-y-2\">");
        html.push_str(&format!("<div class=\"text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5\"><span>📽️</span> Diapositiva {}</div>", idx + 1));

        if let Some((first, rest)) = texts.split_first() {
            html.push_str(&format!("<h3 class=\"text-sm font-bold text-gnome-text\">{}</h3>", escape_html_str(first)));
            if !rest.is_empty() {
                html.push_str("<ul class=\"space-y-1 text-xs text-gnome-textDim pl-4\">");
                for item in rest {
                    html.push_str(&format!("<li class=\"list-disc\">{}</li>", escape_html_str(item)));
                }
                html.push_str("</ul>");
            }
        } else {
            html.push_str("<p class=\"text-xs text-gnome-textDim italic\">(Diapositiva con contenido gráfico/visual)</p>");
        }

        html.push_str("</div>");
    }

    html.push_str("</div>");
    Ok(html)
}

fn classify_extension(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "svg" | "webp" | "gif" | "bmp" | "ico" | "tiff" | "tif"
        | "dng" | "heic" | "heif" | "avif" | "cr2" | "nef" | "arw" | "raw" => "image",
        "pdf" => "pdf",
        "mp3" | "wav" | "ogg" | "oga" | "flac" | "m4a" | "aac" | "wma" => "audio",
        "mp4" | "m4v" | "mov" | "avi" | "mkv" | "webm" | "wmv" | "mpg" | "mpeg" | "ts" | "m2ts" | "3gp" => "video",
        "txt" | "md" | "rs" | "json" | "js" | "py" | "log" | "css" | "html" | "xml" | "yaml" | "yml"
        | "toml" | "csv" | "ini" | "conf" | "config" | "sh" | "bat" | "ps1" | "c" | "cpp" | "h" | "hpp"
        | "sql" | "str" => "text",
        "docx" | "doc" | "docm" | "dotx" | "dot"
        | "xlsx" | "xls" | "xlsm" | "xlsb" | "xltx" | "xlt"
        | "pptx" | "ppt" | "pptm" | "potx" | "pot"
        | "odt" | "ods" | "odp" | "rtf" | "epub" => "office",
        _ => "binary",
    }
}

fn get_mime_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "dng" => "image/x-adobe-dng",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "avif" => "image/avif",
        "cr2" => "image/x-canon-cr2",
        "nef" => "image/x-nikon-nef",
        "arw" => "image/x-sony-arw",
        "raw" => "image/raw",
        "pdf" => "application/pdf",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "wma" => "audio/x-ms-wma",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "wmv" => "video/x-ms-wmv",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn get_user_places() -> Vec<UserPlace> {
    let mut places = Vec::new();
    let user_profile = match std::env::var("USERPROFILE") {
        Ok(p) => PathBuf::from(p),
        Err(_) => match std::env::var("HOME") {
            Ok(p) => PathBuf::from(p),
            Err(_) => PathBuf::from("/"),
        },
    };

    places.push(UserPlace {
        id: "home".into(),
        name: "Carpeta Personal".into(),
        path: user_profile.to_string_lossy().to_string(),
        icon: "👤".into(),
    });

    let known = [
        ("desktop", "Escritorio", "Desktop", "🖥️"),
        ("downloads", "Descargas", "Downloads", "📥"),
        ("documents", "Documentos", "Documents", "📝"),
        ("pictures", "Imágenes", "Pictures", "🖼️"),
        ("videos", "Vídeos", "Videos", "🎬"),
        ("music", "Música", "Music", "🎵"),
    ];

    for (id, name, rel, icon) in known {
        let p = user_profile.join(rel);
        if p.exists() {
            places.push(UserPlace {
                id: id.into(),
                name: name.into(),
                path: p.to_string_lossy().to_string(),
                icon: icon.into(),
            });
        }
    }

    places
}

#[tauri::command]
fn get_system_drives() -> Vec<DriveItem> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let drive_root = format!("{}:\\", letter as char);
            let path = Path::new(&drive_root);
            if path.exists() {
                drives.push(DriveItem {
                    name: format!("Unidad ({}:)", letter as char),
                    path: drive_root,
                });
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        drives.push(DriveItem {
            name: "Sistema (/)".into(),
            path: "/".into(),
        });

        #[cfg(target_os = "macos")]
        {
            if let Ok(entries) = fs::read_dir("/Volumes") {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        drives.push(DriveItem {
                            name: entry.file_name().to_string_lossy().to_string(),
                            path: p.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            for mount_root in &["/media", "/mnt"] {
                if let Ok(entries) = fs::read_dir(mount_root) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() {
                            drives.push(DriveItem {
                                name: entry.file_name().to_string_lossy().to_string(),
                                path: p.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    drives
}

#[cfg(target_os = "windows")]
fn query_disk_space(target_path: &Path) -> Option<(u64, u64)> {
    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    let mut path_buf = target_path.to_path_buf();
    if !path_buf.exists() {
        if let Some(parent) = target_path.parent() {
            path_buf = parent.to_path_buf();
        }
    }

    let mut path_str = path_buf.to_string_lossy().to_string();
    if path_str.ends_with(':') {
        path_str.push('\\');
    }

    let wide_path: Vec<u16> = OsStr::new(&path_str)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut free_avail: u64 = 0;
    let mut total: u64 = 0;
    let mut free_total: u64 = 0;

    let ret = unsafe {
        GetDiskFreeSpaceExW(
            wide_path.as_ptr(),
            &mut free_avail,
            &mut total,
            &mut free_total,
        )
    };

    if ret != 0 {
        Some((free_avail, total))
    } else {
        if let Some(prefix) = target_path.components().next() {
            let mut root_str = prefix.as_os_str().to_string_lossy().to_string();
            if root_str.ends_with(':') {
                root_str.push('\\');
            }
            let wide_root: Vec<u16> = OsStr::new(&root_str)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let ret2 = unsafe {
                GetDiskFreeSpaceExW(
                    wide_root.as_ptr(),
                    &mut free_avail,
                    &mut total,
                    &mut free_total,
                )
            };
            if ret2 != 0 {
                return Some((free_avail, total));
            }
        }
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn query_disk_space(target_path: &Path) -> Option<(u64, u64)> {
    use std::process::Command;
    let output = Command::new("df")
        .arg("-Pk")
        .arg(target_path)
        .output()
        .ok()?;

    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let lines: Vec<&str> = text.lines().collect();
        if lines.len() >= 2 {
            let parts: Vec<&str> = lines[1].split_whitespace().collect();
            if parts.len() >= 4 {
                if let (Ok(total_k), Ok(avail_k)) = (parts[1].parse::<u64>(), parts[3].parse::<u64>()) {
                    return Some((avail_k * 1024, total_k * 1024));
                }
            }
        }
    }
    None
}

#[tauri::command]
fn get_disk_free_space(path: Option<String>) -> Result<DiskSpaceInfo, String> {
    let target = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => dirs_or_fallback(),
    };

    if let Some((free_bytes, total_bytes)) = query_disk_space(&target) {
        Ok(DiskSpaceInfo {
            free_bytes,
            total_bytes,
            available_bytes: free_bytes,
        })
    } else {
        Err("No se pudo obtener el espacio libre en disco".to_string())
    }
}

#[tauri::command]
fn read_directory(path: Option<String>) -> Result<DirectoryResult, String> {
    let target_path = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => dirs_or_fallback(),
    };

    if !target_path.exists() {
        return Err(format!("La ruta no existe: {}", target_path.display()));
    }

    if !target_path.is_dir() {
        return Err(format!("La ruta no es un directorio: {}", target_path.display()));
    }

    let entries = match fs::read_dir(&target_path) {
        Ok(e) => e,
        Err(err) => return Err(format!("Acceso denegado o error de lectura: {}", err)),
    };

    let mut items = Vec::new();

    for entry_res in entries {
        if let Ok(entry) = entry_res {
            let p = entry.path();
            let file_name = match entry.file_name().into_string() {
                Ok(n) => n,
                Err(_) => continue,
            };

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let is_dir = metadata.is_dir();
            let size = if is_dir { 0 } else { metadata.len() };
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let extension = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let file_type = if is_dir {
                "folder".to_string()
            } else {
                classify_extension(&extension).to_string()
            };

            #[cfg(target_os = "windows")]
            let is_hidden = {
                use std::os::windows::fs::MetadataExt;
                file_name.starts_with('.') || (metadata.file_attributes() & 0x2 != 0)
            };
            #[cfg(not(target_os = "windows"))]
            let is_hidden = file_name.starts_with('.');

            items.push(FileItem {
                name: file_name,
                path: p.to_string_lossy().to_string(),
                is_directory: is_dir,
                size,
                modified,
                extension,
                file_type,
                is_hidden,
            });
        }
    }

    // Sort: directories first (alphabetical), then files (alphabetical)
    items.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    let (free_space_bytes, total_space_bytes) = match query_disk_space(&target_path) {
        Some((free, total)) => (Some(free), Some(total)),
        None => (None, None),
    };

    Ok(DirectoryResult {
        current_path: target_path.to_string_lossy().to_string(),
        items,
        free_space_bytes,
        total_space_bytes,
    })
}

fn dirs_or_fallback() -> PathBuf {
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(user_profile);
        if p.exists() {
            return p;
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home);
        if p.exists() {
            return p;
        }
    }
    PathBuf::from("/")
}

#[tauri::command]
fn batch_rename(renames: Vec<(String, String)>) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    for (old_path, new_path) in renames {
        if let Err(e) = std::fs::rename(&old_path, &new_path) {
            errors.push(format!("Error renombrando '{}': {}", old_path, e));
        }
    }
    if errors.is_empty() {
        Ok(errors)
    } else {
        Err(errors.join("\n"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderJumpItem {
    pub name: String,
    pub path: String,
    pub relative_path: String,
}

/// Helper function to omit system, hidden, cache and temporary directories during recursive searches
fn should_skip_dir_for_search(name: &str) -> bool {
    // Hidden folders (.git, .cache, .npm, .vscode, .local, etc.)
    if name.starts_with('.') {
        return true;
    }

    let lower = name.to_lowercase();
    match lower.as_str() {
        // macOS system & user cache/runtime dirs
        "library" | "system" | "cores" | ".trashes" | ".spotlight-v100" | "caches" | "application support" => true,
        // Windows system & user cache/runtime dirs
        "appdata" | "application data" | "local settings" | "$recycle.bin" | "system volume information"
        | "windows" | "programdata" | "msocache" | "recovery" | "perflogs" | "temp" | "tmp" => true,
        // Linux system & development noise dirs
        "proc" | "sys" | "dev" | "run" | "var" | "lost+found" | "node_modules" | "target" => true,
        _ => false,
    }
}

#[tauri::command]
fn search_subfolders(
    base_path: String,
    query: String,
    max_depth: Option<usize>,
) -> Result<Vec<FolderJumpItem>, String> {
    let root = PathBuf::from(&base_path);
    if !root.exists() || !root.is_dir() {
        return Err("Directorio base no válido".into());
    }

    let q = query.to_lowercase().trim().to_string();
    let max_d = max_depth.unwrap_or(5);
    let limit = 60;
    let mut results = Vec::new();

    let mut stack = vec![(root.clone(), 0usize)];

    while let Some((current, depth)) = stack.pop() {
        if depth > max_d {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&current) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let name = match entry.file_name().into_string() {
                            Ok(n) => n,
                            Err(_) => continue,
                        };

                        if should_skip_dir_for_search(&name) {
                            continue;
                        }

                        let p = entry.path();
                        let rel = match p.strip_prefix(&root) {
                            Ok(r) => r.to_string_lossy().to_string(),
                            Err(_) => name.clone(),
                        };

                        let matches = if q.is_empty() {
                            depth == 0
                        } else {
                            name.to_lowercase().contains(&q) || rel.to_lowercase().contains(&q)
                        };

                        if matches {
                            results.push(FolderJumpItem {
                                name: name.clone(),
                                path: p.to_string_lossy().to_string(),
                                relative_path: rel,
                            });
                            if results.len() >= limit {
                                return Ok(results);
                            }
                        }

                        if depth < max_d {
                            stack.push((p, depth + 1));
                        }
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| {
        let depth_a = a.relative_path.matches(&['/', '\\'][..]).count();
        let depth_b = b.relative_path.matches(&['/', '\\'][..]).count();
        match depth_a.cmp(&depth_b) {
            std::cmp::Ordering::Equal => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            other => other,
        }
    });

    Ok(results)
}

#[tauri::command]
fn read_file_hex(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 1024];
    let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
    let data = &buffer[..n];

    let mut output = String::new();
    for (i, chunk) in data.chunks(16).enumerate() {
        let offset = i * 16;
        output.push_str(&format!("{:08X}  ", offset));
        for byte in chunk {
            output.push_str(&format!("{:02X} ", byte));
        }
        for _ in 0..(16 - chunk.len()) {
            output.push_str("   ");
        }
        output.push_str(" |");
        for byte in chunk {
            if byte.is_ascii_graphic() || *byte == b' ' {
                output.push(*byte as char);
            } else {
                output.push('.');
            }
        }
        output.push_str("|\n");
    }
    Ok(output)
}

#[tauri::command]
fn read_file_preview(path: String, custom_text_exts: Option<Vec<String>>) -> Result<FilePreviewResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("El archivo no existe".into());
    }

    let meta = fs::metadata(p).map_err(|e| format!("Error de metadatos: {}", e))?;
    let size = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let is_dir = meta.is_dir();
    let file_type = if is_dir {
        "folder".to_string()
    } else if let Some(ref custom) = custom_text_exts {
        if custom.iter().any(|c| c.trim().trim_start_matches('.').eq_ignore_ascii_case(&ext)) {
            "text".to_string()
        } else {
            classify_extension(&ext).to_string()
        }
    } else {
        classify_extension(&ext).to_string()
    };
    let mime_type = get_mime_type(&ext).to_string();

    let mut is_too_large = false;
    let mut content = None;
    let mut data_url = None;
    let mut error_message = None;
    let mut folder_files = None;
    let mut folder_subdirs = None;
    let mut total_folder_size = 0u64;

    if is_dir {
        // Fast shallow count + size
        if let Ok(entries) = fs::read_dir(p) {
            let mut f_count = 0;
            let mut d_count = 0;
            for entry in entries.flatten() {
                if let Ok(m) = entry.metadata() {
                    if m.is_dir() {
                        d_count += 1;
                    } else {
                        f_count += 1;
                        total_folder_size += m.len();
                    }
                }
            }
            folder_files = Some(f_count);
            folder_subdirs = Some(d_count);
        }
    } else if file_type == "text" {
        if size > MAX_PREVIEW_TEXT_SIZE {
            is_too_large = true;
        } else {
            match fs::read(p) {
                Ok(bytes) => {
                    content = Some(String::from_utf8_lossy(&bytes).to_string());
                }
                Err(e) => {
                    error_message = Some(format!("No se pudo leer el archivo de texto: {}", e));
                }
            }
        }
    } else if file_type == "video" || file_type == "audio" {
        let port = STREAM_PORT.load(Ordering::SeqCst);
        if port > 0 {
            let enc_path = url_encode(&path);
            data_url = Some(format!("http://127.0.0.1:{}/stream?path={}", port, enc_path));
            is_too_large = false;
        } else if size > MAX_PREVIEW_VIDEO_SIZE {
            is_too_large = true;
        } else {
            match fs::read(p) {
                Ok(bytes) => {
                    let b64 = BASE64_STANDARD.encode(&bytes);
                    data_url = Some(format!("data:{};base64,{}", mime_type, b64));
                }
                Err(e) => {
                    error_message = Some(format!("No se pudo cargar el archivo multimedia: {}", e));
                }
            }
        }
    } else if file_type == "image" {
        let is_raw_or_heic = matches!(
            ext.as_str(),
            "dng" | "heic" | "heif" | "avif" | "cr2" | "nef" | "arw" | "raw" | "tif" | "tiff"
        );
        if is_raw_or_heic {
            if let Some(jpeg_data_url) = extract_raw_embedded_jpeg(p) {
                data_url = Some(jpeg_data_url);
            } else if let Ok(b64_url) = get_shell_preview_data_url(p, 1600) {
                data_url = Some(b64_url);
            } else if size <= MAX_PREVIEW_BINARY_SIZE {
                if let Ok(bytes) = fs::read(p) {
                    let b64 = BASE64_STANDARD.encode(&bytes);
                    data_url = Some(format!("data:{};base64,{}", mime_type, b64));
                }
            } else {
                is_too_large = true;
            }
        } else if size > MAX_PREVIEW_BINARY_SIZE {
            is_too_large = true;
        } else {
            match fs::read(p) {
                Ok(bytes) => {
                    let b64 = BASE64_STANDARD.encode(&bytes);
                    data_url = Some(format!("data:{};base64,{}", mime_type, b64));
                }
                Err(e) => {
                    if let Ok(b64_url) = get_shell_preview_data_url(p, 1600) {
                        data_url = Some(b64_url);
                    } else {
                        error_message = Some(format!("No se pudo cargar la vista previa: {}", e));
                    }
                }
            }
        }
    } else if file_type == "office" {
        match ext.as_str() {
            "docx" | "docm" | "dotx" => {
                match extract_docx_content(p) {
                    Ok(html_content) => {
                        content = Some(html_content);
                    }
                    Err(e) => {
                        if let Ok(b64_url) = get_shell_preview_data_url(p, 1400) {
                            data_url = Some(b64_url);
                        } else {
                            error_message = Some(format!("No se pudo leer el documento Word: {}", e));
                        }
                    }
                }
            }
            "xlsx" | "xlsm" | "xltx" => {
                match extract_xlsx_content(p) {
                    Ok(html_content) => {
                        content = Some(html_content);
                    }
                    Err(e) => {
                        if let Ok(b64_url) = get_shell_preview_data_url(p, 1400) {
                            data_url = Some(b64_url);
                        } else {
                            error_message = Some(format!("No se pudo leer la hoja de cálculo Excel: {}", e));
                        }
                    }
                }
            }
            "pptx" | "pptm" | "potx" => {
                match extract_pptx_content(p) {
                    Ok(html_content) => {
                        content = Some(html_content);
                    }
                    Err(e) => {
                        if let Ok(b64_url) = get_shell_preview_data_url(p, 1400) {
                            data_url = Some(b64_url);
                        } else {
                            error_message = Some(format!("No se pudo leer la presentación PowerPoint: {}", e));
                        }
                    }
                }
            }
            _ => {
                if let Ok(b64_url) = get_shell_preview_data_url(p, 1400) {
                    data_url = Some(b64_url);
                } else {
                    error_message = Some("Documento en formato binario antiguo. Pulsa 'Abrir' para verlo en Office.".into());
                }
            }
        }
    } else if file_type == "pdf" {
        if size > MAX_PREVIEW_BINARY_SIZE {
            is_too_large = true;
        } else {
            match fs::read(p) {
                Ok(bytes) => {
                    let b64 = BASE64_STANDARD.encode(&bytes);
                    data_url = Some(format!("data:{};base64,{}", mime_type, b64));
                }
                Err(e) => {
                    error_message = Some(format!("No se pudo cargar la vista previa del PDF: {}", e));
                }
            }
        }
    }

    let max_size = if file_type == "text" {
        MAX_PREVIEW_TEXT_SIZE
    } else if file_type == "video" || file_type == "audio" {
        u64::MAX
    } else {
        MAX_PREVIEW_BINARY_SIZE
    };

    Ok(FilePreviewResult {
        path: path.clone(),
        name,
        extension: ext,
        size: if is_dir { total_folder_size } else { size },
        modified,
        file_type,
        content,
        data_url,
        mime_type: Some(mime_type),
        is_too_large,
        max_size_bytes: max_size,
        error_message,
        folder_files,
        folder_subdirs,
    })
}

#[tauri::command]
fn delete_file_item(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("El elemento a eliminar no existe".into());
    }

    trash::delete(&p).map_err(|e| format!("Error al mover a la papelera: {}", e))?;
    Ok(true)
}

#[tauri::command]
fn open_file_default(path: String) -> Result<bool, String> {
    let is_url = path.starts_with("http://") || path.starts_with("https://");
    if !is_url {
        let p = Path::new(&path);
        if !p.exists() {
            return Err("El archivo o ruta no existe".into());
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;

        let wide: Vec<u16> = OsStr::new(&path).encode_wide().chain(std::iter::once(0)).collect();
        let wide_open: Vec<u16> = OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();

        extern "system" {
            fn ShellExecuteW(
                hwnd: *mut std::ffi::c_void,
                lpOperation: *const u16,
                lpFile: *const u16,
                lpParameters: *const u16,
                lpDirectory: *const u16,
                nShowCmd: i32,
            ) -> isize;
        }

        let ret = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                wide_open.as_ptr(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1, // SW_SHOWNORMAL
            )
        };

        if ret > 32 {
            Ok(true)
        } else {
            Err(format!("ShellExecute error code: {}", ret))
        }
    }

    #[cfg(target_os = "macos")]
    {
        let res = std::process::Command::new("open").arg(&path).spawn();
        res.map(|_| true).map_err(|e| format!("Error al abrir con 'open': {}", e))
    }

    #[cfg(target_os = "linux")]
    {
        let res = std::process::Command::new("xdg-open").arg(&path).spawn();
        res.map(|_| true).map_err(|e| format!("Error al abrir con 'xdg-open': {}", e))
    }
}

#[tauri::command]
fn create_new_file(dir_path: String, file_name: String, open_after: bool) -> Result<String, String> {
    let clean_name = file_name.trim();
    if clean_name.is_empty() {
        return Err("El nombre de archivo no puede estar vacío".into());
    }

    let dir = PathBuf::from(&dir_path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Directorio de destino no válido".into());
    }

    let target_file = dir.join(clean_name);
    if target_file.exists() {
        return Err("Ya existe un archivo o carpeta con ese nombre".into());
    }

    fs::write(&target_file, b"").map_err(|e| format!("Error al crear el archivo: {}", e))?;
    let full_path = target_file.to_string_lossy().to_string();

    if open_after {
        let _ = open_file_default(full_path.clone());
    }

    Ok(full_path)
}

#[tauri::command]
fn create_new_directory(dir_path: String, folder_name: String) -> Result<String, String> {
    let clean_name = folder_name.trim();
    if clean_name.is_empty() {
        return Err("El nombre del directorio no puede estar vacío".into());
    }

    let dir = PathBuf::from(&dir_path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Directorio base no válido".into());
    }

    let target_folder = dir.join(clean_name);
    if target_folder.exists() {
        return Err("Ya existe un elemento con ese nombre".into());
    }

    fs::create_dir_all(&target_folder).map_err(|e| format!("Error al crear la carpeta: {}", e))?;
    Ok(target_folder.to_string_lossy().to_string())
}

#[allow(dead_code)]
fn get_path_total_size(p: &Path) -> u64 {
    if p.is_file() {
        p.metadata().map(|m| m.len()).unwrap_or(0)
    } else if p.is_dir() {
        let mut total = 0u64;
        let mut stack = vec![p.to_path_buf()];
        while let Some(dir) = stack.pop() {
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if ep.is_dir() {
                        stack.push(ep);
                    } else if let Ok(m) = entry.metadata() {
                        total += m.len();
                    }
                }
            }
        }
        total
    } else {
        0
    }
}

#[allow(dead_code)]
fn copy_file_chunked<F>(src: &Path, dst: &Path, on_bytes: &mut F) -> std::io::Result<u64>
where
    F: FnMut(u64),
{
    if src == dst {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "No se puede copiar un archivo sobre sí mismo",
        ));
    }
    if let (Ok(s_canon), Ok(d_canon)) = (src.canonicalize(), dst.canonicalize()) {
        if s_canon == d_canon {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "No se puede copiar un archivo sobre sí mismo",
            ));
        }
    }

    let mut reader = File::open(src)?;
    let mut writer = File::create(dst)?;
    let mut buf = [0u8; 1024 * 512]; // 512 KB chunks for smooth UI updates and high throughput
    let mut total_copied = 0u64;

    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        writer.write_all(&buf[..n])?;
        total_copied += n as u64;
        on_bytes(n as u64);
    }
    writer.flush()?;
    Ok(total_copied)
}

#[allow(dead_code)]
fn copy_dir_recursive_with_progress<F>(src: &Path, dst: &Path, on_bytes: &mut F) -> std::io::Result<()>
where
    F: FnMut(u64),
{
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive_with_progress(&from, &to, on_bytes)?;
        } else {
            copy_file_chunked(&from, &to, on_bytes)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn copy_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    target_directory: String,
) -> Result<String, String> {
    let target_dir = PathBuf::from(&target_directory);
    if !target_dir.exists() || !target_dir.is_dir() {
        return Err("Directorio de destino inválido".into());
    }

    let op_id = format!("op_copy_{}", OPERATION_COUNTER.fetch_add(1, Ordering::SeqCst));
    let op_id_ret = op_id.clone();
    let app_handle = app.clone();
    let target_dir_str = target_directory.clone();

    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        let (valid_sources, err_msg) = {
            let mut p_from = Vec::new();
            let mut valid_sources = 0;
            for src in sources {
                let path = PathBuf::from(&src);
                if path.exists() {
                    let mut wstr: Vec<u16> = OsStr::new(&src).encode_wide().collect();
                    p_from.append(&mut wstr);
                    p_from.push(0);
                    valid_sources += 1;
                }
            }
            p_from.push(0);

            let mut p_to: Vec<u16> = OsStr::new(&target_directory).encode_wide().collect();
            p_to.push(0);
            p_to.push(0);

            let mut err_msg = None;
            if valid_sources > 0 {
                let mut op = SHFILEOPSTRUCTW {
                    hwnd: ptr::null_mut(),
                    wFunc: FO_COPY,
                    pFrom: p_from.as_ptr(),
                    pTo: p_to.as_ptr(),
                    fFlags: FOF_ALLOWUNDO,
                    fAnyOperationsAborted: 0,
                    hNameMappings: ptr::null_mut(),
                    lpszProgressTitle: ptr::null(),
                };
                let res = unsafe { SHFileOperationW(&mut op) };
                if res != 0 {
                    err_msg = Some(format!("Error de Windows Shell: {}", res));
                }
            }
            (valid_sources, err_msg)
        };

        #[cfg(not(target_os = "windows"))]
        let (valid_sources, err_msg) = {
            let mut valid_sources = 0;
            let mut err_msg = None;
            for src in sources {
                let src_path = PathBuf::from(&src);
                if !src_path.exists() {
                    continue;
                }
                let file_name = match src_path.file_name() {
                    Some(n) => n,
                    None => continue,
                };
                let mut dest_path = PathBuf::from(&target_directory).join(file_name);

                // Detect if destination is identical to source or already exists
                let is_same_file = src_path == dest_path
                    || match (src_path.canonicalize(), dest_path.canonicalize()) {
                        (Ok(s), Ok(d)) => s == d,
                        _ => false,
                    };

                if is_same_file || dest_path.exists() {
                    let stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or("archivo");
                    let ext = src_path.extension().and_then(|s| s.to_str()).unwrap_or("");
                    let ext_suffix = if ext.is_empty() {
                        String::new()
                    } else {
                        format!(".{}", ext)
                    };

                    let mut counter = 1;
                    loop {
                        let candidate_name = if counter == 1 {
                            format!("{} (copia){}", stem, ext_suffix)
                        } else {
                            format!("{} (copia {}){}", stem, counter, ext_suffix)
                        };
                        let candidate = PathBuf::from(&target_directory).join(candidate_name);
                        let candidate_exists = candidate.exists()
                            || match (src_path.canonicalize(), candidate.canonicalize()) {
                                (Ok(s), Ok(c)) => s == c,
                                _ => false,
                            };
                        if !candidate_exists {
                            dest_path = candidate;
                            break;
                        }
                        counter += 1;
                    }
                }

                // Final safety check: never copy onto self
                if src_path == dest_path {
                    continue;
                }

                let res = if src_path.is_dir() {
                    copy_dir_recursive_with_progress(&src_path, &dest_path, &mut |_| {})
                } else {
                    std::fs::copy(&src_path, &dest_path).map(|_| ())
                };
                if let Err(e) = res {
                    err_msg = Some(format!("Error al copiar: {}", e));
                    break;
                }
                valid_sources += 1;
            }
            (valid_sources, err_msg)
        };

        let _ = app_handle.emit(
            "transfer-finished",
            TransferFinishedPayload {
                operation_id: op_id,
                action: "copy".into(),
                success: err_msg.is_none(),
                error: err_msg,
                items_count: valid_sources,
                total_bytes: 0,
                target_directory: target_dir_str,
            },
        );
    });

    Ok(op_id_ret)
}

#[tauri::command]
fn move_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    target_directory: String,
) -> Result<String, String> {
    let target_dir = PathBuf::from(&target_directory);
    if !target_dir.exists() || !target_dir.is_dir() {
        return Err("Directorio de destino inválido".into());
    }

    let op_id = format!("op_move_{}", OPERATION_COUNTER.fetch_add(1, Ordering::SeqCst));
    let op_id_ret = op_id.clone();
    let app_handle = app.clone();
    let target_dir_str = target_directory.clone();

    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        let (valid_sources, err_msg) = {
            let mut p_from = Vec::new();
            let mut valid_sources = 0;
            for src in sources {
                let path = PathBuf::from(&src);
                if path.exists() {
                    let mut wstr: Vec<u16> = OsStr::new(&src).encode_wide().collect();
                    p_from.append(&mut wstr);
                    p_from.push(0);
                    valid_sources += 1;
                }
            }
            p_from.push(0);

            let mut p_to: Vec<u16> = OsStr::new(&target_directory).encode_wide().collect();
            p_to.push(0);
            p_to.push(0);

            let mut err_msg = None;
            if valid_sources > 0 {
                let mut op = SHFILEOPSTRUCTW {
                    hwnd: ptr::null_mut(),
                    wFunc: FO_MOVE,
                    pFrom: p_from.as_ptr(),
                    pTo: p_to.as_ptr(),
                    fFlags: FOF_ALLOWUNDO,
                    fAnyOperationsAborted: 0,
                    hNameMappings: ptr::null_mut(),
                    lpszProgressTitle: ptr::null(),
                };
                let res = unsafe { SHFileOperationW(&mut op) };
                if res != 0 {
                    err_msg = Some(format!("Error de Windows Shell: {}", res));
                }
            }
            (valid_sources, err_msg)
        };

        #[cfg(not(target_os = "windows"))]
        let (valid_sources, err_msg) = {
            let mut valid_sources = 0;
            let mut err_msg = None;
            for src in sources {
                let src_path = PathBuf::from(&src);
                if !src_path.exists() {
                    continue;
                }
                let file_name = match src_path.file_name() {
                    Some(n) => n,
                    None => continue,
                };
                let dest_path = PathBuf::from(&target_directory).join(file_name);
                if src_path == dest_path {
                    valid_sources += 1;
                    continue;
                }
                let res = if fs::rename(&src_path, &dest_path).is_ok() {
                    Ok(())
                } else if src_path.is_dir() {
                    match copy_dir_recursive_with_progress(&src_path, &dest_path, &mut |_| {}) {
                        Ok(_) => fs::remove_dir_all(&src_path),
                        Err(e) => Err(e),
                    }
                } else {
                    match std::fs::copy(&src_path, &dest_path) {
                        Ok(_) => fs::remove_file(&src_path),
                        Err(e) => Err(e),
                    }
                };
                if let Err(e) = res {
                    err_msg = Some(format!("Error al mover: {}", e));
                    break;
                }
                valid_sources += 1;
            }
            (valid_sources, err_msg)
        };

        let _ = app_handle.emit(
            "transfer-finished",
            TransferFinishedPayload {
                operation_id: op_id,
                action: "move".into(),
                success: err_msg.is_none(),
                error: err_msg,
                items_count: valid_sources,
                total_bytes: 0,
                target_directory: target_dir_str,
            },
        );
    });

    Ok(op_id_ret)
}

fn compute_directory_size(root: &Path, max_entries: Option<usize>) -> (u64, usize, usize) {
    let mut total_size = 0u64;
    let mut file_count = 0usize;
    let mut dir_count = 0usize;
    let mut total_scanned = 0usize;

    let mut stack = vec![root.to_path_buf()];
    while let Some(current_dir) = stack.pop() {
        if let Ok(entries) = fs::read_dir(&current_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    total_scanned += 1;
                    if let Some(limit) = max_entries {
                        if total_scanned >= limit {
                            return (total_size, file_count, dir_count);
                        }
                    }
                    if meta.is_dir() {
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        if should_skip_dir_for_search(&file_name) {
                            continue;
                        }
                        dir_count += 1;
                        stack.push(entry.path());
                    } else {
                        file_count += 1;
                        total_size += meta.len();
                    }
                }
            }
        }
    }
    (total_size, file_count, dir_count)
}

fn build_file_item(entry_path: &Path, meta: &fs::Metadata) -> Option<FileItem> {
    let file_name = entry_path.file_name()?.to_string_lossy().to_string();
    let is_dir = meta.is_dir();
    let ext = entry_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let file_type = if is_dir {
        "folder".to_string()
    } else {
        classify_extension(&ext).to_string()
    };
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    #[cfg(target_os = "windows")]
    let is_hidden = {
        use std::os::windows::fs::MetadataExt;
        file_name.starts_with('.') || (meta.file_attributes() & 0x2 != 0)
    };
    #[cfg(not(target_os = "windows"))]
    let is_hidden = file_name.starts_with('.');

    Some(FileItem {
        name: file_name,
        path: entry_path.to_string_lossy().to_string(),
        is_directory: is_dir,
        size: if is_dir { 0 } else { meta.len() },
        modified,
        extension: ext,
        file_type,
        is_hidden,
    })
}

#[tauri::command]
fn get_directory_size(path: String) -> Result<DirectorySizeResult, String> {
    let root = PathBuf::from(&path);
    if !root.exists() || !root.is_dir() {
        return Err("Directorio no válido".into());
    }

    let (total_size, file_count, dir_count) = compute_directory_size(&root, None);

    Ok(DirectorySizeResult {
        path,
        total_size,
        file_count,
        dir_count,
    })
}

#[tauri::command]
fn sherlock_search(filter: SherlockFilter) -> Result<SherlockResult, String> {
    let mut root = PathBuf::from(&filter.base_path);
    if filter.search_root {
        #[cfg(target_os = "windows")]
        {
            if let Some(prefix) = root.components().next() {
                root = PathBuf::from(format!("{}\\", prefix.as_os_str().to_string_lossy().trim_end_matches('\\')));
            } else {
                root = PathBuf::from("C:\\");
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            root = PathBuf::from("/");
        }
    }

    if !root.exists() || !root.is_dir() {
        return Err("Ruta de búsqueda no válida o inexistente".into());
    }

    let preset = filter.preset.as_deref().unwrap_or("");

    // 1. Preset: Archivos Grandes (Top 25)
    if preset == "largest_files" {
        let mut min_heap: BinaryHeap<Reverse<SizeItem>> = BinaryHeap::with_capacity(26);
        let mut stack = vec![root];
        let mut scanned_count = 0usize;
        const MAX_SCAN: usize = 75_000;

        'scan_files: while let Some(current) = stack.pop() {
            if let Ok(entries) = fs::read_dir(&current) {
                for entry in entries.flatten() {
                    scanned_count += 1;
                    if scanned_count >= MAX_SCAN {
                        break 'scan_files;
                    }

                    let p = entry.path();
                    let meta = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };

                    let file_name = match entry.file_name().into_string() {
                        Ok(n) => n,
                        Err(_) => continue,
                    };

                    if meta.is_dir() {
                        if should_skip_dir_for_search(&file_name) {
                            continue;
                        }
                        stack.push(p);
                    } else {
                        let size = meta.len();
                        if let Some(item) = build_file_item(&p, &meta) {
                            if min_heap.len() < 25 {
                                min_heap.push(Reverse(SizeItem { size, item }));
                            } else if let Some(smallest) = min_heap.peek() {
                                if size > smallest.0.size {
                                    min_heap.pop();
                                    min_heap.push(Reverse(SizeItem { size, item }));
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut items: Vec<FileItem> = min_heap.into_iter().map(|rev| rev.0.item).collect();
        items.sort_by(|a, b| b.size.cmp(&a.size));

        return Ok(SherlockResult {
            items,
            dir_sizes: Vec::new(),
        });
    }

    // 2. Preset: Directorios Grandes (Top 25)
    if preset == "largest_dirs" {
        let mut candidate_dirs: Vec<PathBuf> = Vec::new();

        // Collect subdirectories up to depth 2
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let p = entry.path();
                let file_name = match entry.file_name().into_string() {
                    Ok(n) => n,
                    Err(_) => continue,
                };
                if let Ok(meta) = entry.metadata() {
                    if meta.is_dir() {
                        if should_skip_dir_for_search(&file_name) {
                            continue;
                        }
                        candidate_dirs.push(p.clone());
                        if candidate_dirs.len() < 120 {
                            if let Ok(sub_entries) = fs::read_dir(&p) {
                                for sub_entry in sub_entries.flatten() {
                                    let sub_p = sub_entry.path();
                                    let sub_name = match sub_entry.file_name().into_string() {
                                        Ok(n) => n,
                                        Err(_) => continue,
                                    };
                                    if let Ok(sub_meta) = sub_entry.metadata() {
                                        if sub_meta.is_dir() {
                                            if should_skip_dir_for_search(&sub_name) {
                                                continue;
                                            }
                                            candidate_dirs.push(sub_p);
                                            if candidate_dirs.len() >= 120 {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut min_heap: BinaryHeap<Reverse<SizeItem>> = BinaryHeap::with_capacity(26);
        let mut dir_size_map: std::collections::HashMap<String, DirectorySizeResult> = std::collections::HashMap::new();

        for dir_path in candidate_dirs {
            let (total_size, file_count, dir_count) = compute_directory_size(&dir_path, Some(10_000));
            if let Ok(meta) = fs::metadata(&dir_path) {
                if let Some(mut item) = build_file_item(&dir_path, &meta) {
                    item.size = total_size;
                    let path_str = dir_path.to_string_lossy().to_string();
                    dir_size_map.insert(
                        path_str.clone(),
                        DirectorySizeResult {
                            path: path_str,
                            total_size,
                            file_count,
                            dir_count,
                        },
                    );

                    if min_heap.len() < 25 {
                        min_heap.push(Reverse(SizeItem { size: total_size, item }));
                    } else if let Some(smallest) = min_heap.peek() {
                        if total_size > smallest.0.size {
                            min_heap.pop();
                            min_heap.push(Reverse(SizeItem { size: total_size, item }));
                        }
                    }
                }
            }
        }

        let mut items: Vec<FileItem> = min_heap.into_iter().map(|rev| rev.0.item).collect();
        items.sort_by(|a, b| b.size.cmp(&a.size));

        let dir_sizes: Vec<DirectorySizeResult> = items
            .iter()
            .filter_map(|it| dir_size_map.remove(&it.path))
            .collect();

        return Ok(SherlockResult {
            items,
            dir_sizes,
        });
    }

    // 3. Preset: 24 Horas
    if preset == "last_24h" {
        let now_secs = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let min_time = now_secs.saturating_sub(86400);

        let mut items = Vec::new();
        let mut stack = vec![root];
        let mut scanned_count = 0usize;
        const MAX_SCAN: usize = 60_000;
        let limit = filter.max_results.unwrap_or(300);

        'scan_24h: while let Some(current) = stack.pop() {
            if let Ok(entries) = fs::read_dir(&current) {
                for entry in entries.flatten() {
                    scanned_count += 1;
                    if scanned_count >= MAX_SCAN {
                        break 'scan_24h;
                    }

                    let p = entry.path();
                    let meta = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let file_name = match entry.file_name().into_string() {
                        Ok(n) => n,
                        Err(_) => continue,
                    };

                    let is_dir = meta.is_dir();
                    if is_dir {
                        if should_skip_dir_for_search(&file_name) {
                            continue;
                        }
                        stack.push(p.clone());
                    }

                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    if modified >= min_time {
                        if let Some(item) = build_file_item(&p, &meta) {
                            items.push(item);
                            if items.len() >= limit {
                                break 'scan_24h;
                            }
                        }
                    }
                }
            }
        }

        // Sort modified descending (newest to oldest)
        items.sort_by(|a, b| b.modified.cmp(&a.modified));

        return Ok(SherlockResult {
            items,
            dir_sizes: Vec::new(),
        });
    }

    // 4. Custom Filters (Size, Date, Query)
    let q = filter.query.unwrap_or_default().trim().to_lowercase();
    let size_mode = filter.size_mode.as_deref().unwrap_or("all");
    let size_threshold = filter.size_bytes.unwrap_or(0);
    let min_date = filter.min_date;
    let max_date = filter.max_date;
    let limit = filter.max_results.unwrap_or(300);

    let mut items = Vec::new();
    let mut stack = vec![root];
    let mut scanned_count = 0usize;
    const MAX_SCAN: usize = 75_000;

    'custom_scan: while let Some(current) = stack.pop() {
        if let Ok(entries) = fs::read_dir(&current) {
            for entry in entries.flatten() {
                scanned_count += 1;
                if scanned_count >= MAX_SCAN {
                    break 'custom_scan;
                }

                let p = entry.path();
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                let file_name = match entry.file_name().into_string() {
                    Ok(n) => n,
                    Err(_) => continue,
                };

                let is_dir = meta.is_dir();
                if is_dir {
                    if should_skip_dir_for_search(&file_name) {
                        continue;
                    }
                    stack.push(p.clone());
                }

                // Query match
                if !q.is_empty() && !file_name.to_lowercase().contains(&q) {
                    continue;
                }

                // Size match
                if !is_dir {
                    let len = meta.len();
                    if size_mode == "gt" && len < size_threshold {
                        continue;
                    }
                    if size_mode == "lt" && len > size_threshold {
                        continue;
                    }
                }

                // Date match
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                if let Some(min_d) = min_date {
                    if modified < min_d {
                        continue;
                    }
                }
                if let Some(max_d) = max_date {
                    if modified > max_d {
                        continue;
                    }
                }

                if let Some(item) = build_file_item(&p, &meta) {
                    items.push(item);
                    if items.len() >= limit {
                        break 'custom_scan;
                    }
                }
            }
        }
    }

    Ok(SherlockResult {
        items,
        dir_sizes: Vec::new(),
    })
}

#[tauri::command]
fn search_directory_recursive(base_path: String, query: String, max_results: Option<usize>) -> Result<Vec<FileItem>, String> {
    let root = PathBuf::from(&base_path);
    if !root.exists() || !root.is_dir() {
        return Err("Directorio base no válido".into());
    }

    let q = query.to_lowercase().trim().to_string();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let limit = max_results.unwrap_or(200);
    let mut results = Vec::new();
    let mut stack = vec![root];

    'outer: while let Some(current) = stack.pop() {
        if let Ok(entries) = fs::read_dir(&current) {
            for entry in entries.flatten() {
                let p = entry.path();
                let file_name = match entry.file_name().into_string() {
                    Ok(n) => n,
                    Err(_) => continue,
                };

                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                let is_dir = meta.is_dir();
                if is_dir {
                    if should_skip_dir_for_search(&file_name) {
                        continue;
                    }
                    stack.push(p.clone());
                }

                if file_name.to_lowercase().contains(&q) {
                    let ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    let file_type = if is_dir {
                        "folder".to_string()
                    } else {
                        classify_extension(&ext).to_string()
                    };

                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    #[cfg(target_os = "windows")]
                    let is_hidden = {
                        use std::os::windows::fs::MetadataExt;
                        file_name.starts_with('.') || (meta.file_attributes() & 0x2 != 0)
                    };
                    #[cfg(not(target_os = "windows"))]
                    let is_hidden = file_name.starts_with('.');

                    results.push(FileItem {
                        name: file_name,
                        path: p.to_string_lossy().to_string(),
                        is_directory: is_dir,
                        size: if is_dir { 0 } else { meta.len() },
                        modified,
                        extension: ext,
                        file_type,
                        is_hidden,
                    });

                    if results.len() >= limit {
                        break 'outer;
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
fn open_terminal(path: String, terminal: Option<String>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("La ruta no existe".into());
    }

    let dir = if p.is_dir() {
        p
    } else if let Some(parent) = p.parent() {
        parent.to_path_buf()
    } else {
        PathBuf::from(".")
    };

    let term = terminal.unwrap_or_else(|| "default".to_string()).trim().to_string();

    #[cfg(target_os = "windows")]
    {
        match term.as_str() {
            "wt" => {
                let _ = std::process::Command::new("wt")
                    .arg("-d")
                    .arg(&dir)
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar Windows Terminal (wt): {}", e))?;
            }
            "powershell" => {
                let _ = std::process::Command::new("cmd")
                    .arg("/C")
                    .arg("start")
                    .arg("")
                    .arg("powershell")
                    .arg("-NoExit")
                    .arg("-Command")
                    .arg(format!("Set-Location -LiteralPath '{}'", dir.to_string_lossy()))
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar PowerShell: {}", e))?;
            }
            "pwsh" => {
                let res = std::process::Command::new("pwsh")
                    .arg("-NoExit")
                    .arg("-Command")
                    .arg(format!("Set-Location -LiteralPath '{}'", dir.to_string_lossy()))
                    .spawn();
                if res.is_err() {
                    let _ = std::process::Command::new("cmd")
                        .arg("/C")
                        .arg("start")
                        .arg("")
                        .arg("pwsh")
                        .arg("-NoExit")
                        .arg("-Command")
                        .arg(format!("Set-Location -LiteralPath '{}'", dir.to_string_lossy()))
                        .spawn()
                        .map_err(|e| format!("No se pudo iniciar PowerShell Core (pwsh): {}", e))?;
                }
            }
            "cmd" => {
                let _ = std::process::Command::new("cmd")
                    .arg("/C")
                    .arg("start")
                    .arg("cmd")
                    .arg("/K")
                    .arg(format!("cd /d \"{}\"", dir.to_string_lossy()))
                    .current_dir(&dir)
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar CMD: {}", e))?;
            }
            "alacritty" => {
                let _ = std::process::Command::new("alacritty")
                    .arg("--working-directory")
                    .arg(&dir)
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar Alacritty: {}", e))?;
            }
            "kitty" => {
                let _ = std::process::Command::new("kitty")
                    .arg("--directory")
                    .arg(&dir)
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar Kitty: {}", e))?;
            }
            "ghostty" => {
                let _ = std::process::Command::new("ghostty")
                    .arg(format!("--working-directory={}", dir.to_string_lossy()))
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar Ghostty: {}", e))?;
            }
            "wezterm" => {
                let _ = std::process::Command::new("wezterm")
                    .arg("start")
                    .arg("--cwd")
                    .arg(&dir)
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar WezTerm: {}", e))?;
            }
            "default" | "" => {
                // Try Windows Terminal first, fallback to powershell, fallback to cmd
                let res = std::process::Command::new("wt")
                    .arg("-d")
                    .arg(&dir)
                    .spawn();
                if res.is_err() {
                    let res_ps = std::process::Command::new("cmd")
                        .arg("/C")
                        .arg("start")
                        .arg("")
                        .arg("powershell")
                        .arg("-NoExit")
                        .arg("-Command")
                        .arg(format!("Set-Location -LiteralPath '{}'", dir.to_string_lossy()))
                        .spawn();
                    if res_ps.is_err() {
                        let _ = std::process::Command::new("cmd")
                            .arg("/C")
                            .arg("start")
                            .arg("cmd")
                            .arg("/K")
                            .arg(format!("cd /d \"{}\"", dir.to_string_lossy()))
                            .current_dir(&dir)
                            .spawn();
                    }
                }
            }
            custom => {
                let mut res = std::process::Command::new(custom)
                    .current_dir(&dir)
                    .spawn();
                if res.is_err() {
                    res = std::process::Command::new("cmd")
                        .arg("/C")
                        .arg("start")
                        .arg("")
                        .arg(custom)
                        .current_dir(&dir)
                        .spawn();
                }
                res.map_err(|e| format!("No se pudo iniciar la terminal '{}': {}", custom, e))?;
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        match term.as_str() {
            "alacritty" => {
                let _ = std::process::Command::new("alacritty")
                    .arg("--working-directory")
                    .arg(&dir)
                    .spawn();
            }
            "kitty" => {
                let _ = std::process::Command::new("kitty")
                    .arg("--directory")
                    .arg(&dir)
                    .spawn();
            }
            "ghostty" => {
                let _ = std::process::Command::new("ghostty")
                    .arg(format!("--working-directory={}", dir.to_string_lossy()))
                    .spawn();
            }
            "iterm" | "iterm2" => {
                let _ = std::process::Command::new("open")
                    .arg("-a")
                    .arg("iTerm")
                    .arg(&dir)
                    .spawn();
            }
            "default" | "" | "Terminal" => {
                let _ = std::process::Command::new("open")
                    .arg("-a")
                    .arg("Terminal")
                    .arg(&dir)
                    .spawn();
            }
            custom => {
                let _ = std::process::Command::new(custom)
                    .current_dir(&dir)
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar la terminal '{}': {}", custom, e))?;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        match term.as_str() {
            "alacritty" => {
                let _ = std::process::Command::new("alacritty")
                    .arg("--working-directory")
                    .arg(&dir)
                    .spawn();
            }
            "kitty" => {
                let _ = std::process::Command::new("kitty")
                    .arg("--directory")
                    .arg(&dir)
                    .spawn();
            }
            "ghostty" => {
                let _ = std::process::Command::new("ghostty")
                    .arg(format!("--working-directory={}", dir.to_string_lossy()))
                    .spawn();
            }
            "default" | "" => {
                let _ = std::process::Command::new("x-terminal-emulator")
                    .arg("--working-directory")
                    .arg(&dir)
                    .spawn();
            }
            custom => {
                let _ = std::process::Command::new(custom)
                    .current_dir(&dir)
                    .spawn()
                    .map_err(|e| format!("No se pudo iniciar la terminal '{}': {}", custom, e))?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn rename_file_or_folder(old_path: String, new_name: String) -> Result<(), String> {
    let src = PathBuf::from(&old_path);
    if !src.exists() {
        return Err("El elemento a renombrar no existe".into());
    }
    let parent = src.parent().ok_or("No se pudo obtener la carpeta contenedora")?;
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("El nuevo nombre no puede estar vacío".into());
    }
    let dest = parent.join(new_name);
    if dest.exists() && dest != src {
        return Err("Ya existe un archivo o carpeta con ese nombre en este directorio".into());
    }
    std::fs::rename(&src, &dest).map_err(|e| format!("Error al renombrar: {}", e))?;
    Ok(())
}

#[tauri::command]
fn open_in_editor(file_path: String, editor: String) -> Result<(), String> {
    if !PathBuf::from(&file_path).exists() {
        return Err("File does not exist".into());
    }

    if editor.is_empty() {
        return Err("Editor no especificado".into());
    }

    #[allow(unused_mut)]
    let mut res = std::process::Command::new(&editor)
        .arg(&file_path)
        .spawn();

    #[cfg(target_os = "windows")]
    if res.is_err() {
        // Fallback with cmd /c for .cmd / batch files like code.cmd or codium.cmd or path with spaces
        res = std::process::Command::new("cmd")
            .args(["/c", &editor, &file_path])
            .spawn();
    }

    match res {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("No se pudo abrir {}: {}", editor, e)),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub build_timestamp: u64,
    pub github_url: String,
}

#[tauri::command]
fn get_app_info() -> AppInfo {
    let ts: u64 = env!("BUILD_UNIX_TIMESTAMP").parse().unwrap_or(0);
    AppInfo {
        name: "Tron".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        build_timestamp: ts,
        github_url: "https://github.com/pedroredond0/tron".into(),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveEntryItem {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub uncompressed_size: u64,
    pub compressed_size: u64,
}

#[tauri::command]
fn show_in_system_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("El elemento no existe".into());
    }

    #[cfg(target_os = "windows")]
    {
        if p.is_dir() {
            let _ = std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,{}", path))
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        let dir = if p.is_dir() { p } else { p.parent().unwrap_or(&p).to_path_buf() };
        let _ = std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn show_item_properties(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("El elemento no existe".into());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let path_w: Vec<u16> = OsStr::new(&path).encode_wide().chain(std::iter::once(0)).collect();
        let verb_w: Vec<u16> = OsStr::new("properties").encode_wide().chain(std::iter::once(0)).collect();

        #[allow(non_snake_case)]
        #[repr(C)]
        struct SHELLEXECUTEINFOW {
            cbSize: u32,
            fMask: u32,
            hwnd: *mut std::ffi::c_void,
            lpVerb: *const u16,
            lpFile: *const u16,
            lpParameters: *const u16,
            lpDirectory: *const u16,
            nShow: i32,
            hInstApp: *mut std::ffi::c_void,
            lpIDList: *mut std::ffi::c_void,
            lpClass: *const u16,
            hkeyClass: *mut std::ffi::c_void,
            dwHotKey: u32,
            hIconOrMonitor: *mut std::ffi::c_void,
            hProcess: *mut std::ffi::c_void,
        }

        const SEE_MASK_INVOKEIDLIST: u32 = 0x0000000C;
        const SW_SHOW: i32 = 5;

        extern "system" {
            fn ShellExecuteExW(pExecInfo: *mut SHELLEXECUTEINFOW) -> i32;
        }

        std::thread::spawn(move || {
            unsafe {
                CoInitializeEx(ptr::null_mut(), 0x2);
                let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
                info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
                info.fMask = SEE_MASK_INVOKEIDLIST;
                info.lpVerb = verb_w.as_ptr();
                info.lpFile = path_w.as_ptr();
                info.nShow = SW_SHOW;

                let _ = ShellExecuteExW(&mut info as *mut _);
                CoUninitialize();
            }
        });
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Finder\"\nactivate\nopen information window of (POSIX file \"{}\" as alias)\nend tell",
            path.replace("\"", "\\\"")
        );
        let _ = std::process::Command::new("osascript").arg("-e").arg(&script).spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("nautilus").arg("--properties").arg(&path).spawn();
    }

    Ok(())
}

#[tauri::command]
fn open_with_dialog(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("El elemento no existe".into());
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("rundll32.exe")
            .arg("shell32.dll,OpenAs_RunDLL")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-a")
            .arg("Finder")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn launch_with_app(path: String, app_command: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("El elemento no existe".into());
    }

    #[cfg(target_os = "windows")]
    {
        let res = std::process::Command::new(&app_command)
            .arg(&path)
            .spawn();
        if res.is_err() {
            let _ = std::process::Command::new("cmd")
                .arg("/C")
                .arg("start")
                .arg("")
                .arg(&app_command)
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Error al iniciar {}: {}", app_command, e))?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new(&app_command)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Error al iniciar {}: {}", app_command, e))?;
    }

    Ok(())
}

#[tauri::command]
fn compress_to_zip(source_paths: Vec<String>, output_zip_path: String) -> Result<usize, String> {
    let out_path = PathBuf::from(&output_zip_path);
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let file = File::create(&out_path).map_err(|e| format!("No se pudo crear el archivo zip: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut total_added = 0usize;

    for src_str in source_paths {
        let src = PathBuf::from(&src_str);
        if !src.exists() {
            continue;
        }

        let base_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();

        if src.is_dir() {
            let mut stack = vec![(src.clone(), base_name.clone())];
            while let Some((dir_path, zip_rel_path)) = stack.pop() {
                let dir_entry_name = if zip_rel_path.ends_with('/') {
                    zip_rel_path.clone()
                } else {
                    format!("{}/", zip_rel_path)
                };
                zip.add_directory(&dir_entry_name, options)
                    .map_err(|e| format!("Error al añadir directorio: {}", e))?;

                if let Ok(entries) = fs::read_dir(&dir_path) {
                    for entry in entries.flatten() {
                        let entry_p = entry.path();
                        let entry_name = entry.file_name().to_string_lossy().to_string();
                        let entry_zip_path = format!("{}/{}", zip_rel_path, entry_name);

                        if entry_p.is_dir() {
                            stack.push((entry_p, entry_zip_path));
                        } else {
                            zip.start_file(&entry_zip_path, options)
                                .map_err(|e| format!("Error al iniciar archivo: {}", e))?;
                            let mut f = File::open(&entry_p).map_err(|e| e.to_string())?;
                            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                            total_added += 1;
                        }
                    }
                }
            }
        } else {
            zip.start_file(&base_name, options)
                .map_err(|e| format!("Error al iniciar archivo: {}", e))?;
            let mut f = File::open(&src).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
            total_added += 1;
        }
    }

    zip.finish().map_err(|e| format!("Error al finalizar zip: {}", e))?;
    Ok(total_added)
}

#[tauri::command]
fn extract_zip_archive(zip_path: String, target_dir: String) -> Result<usize, String> {
    let zip_p = PathBuf::from(&zip_path);
    if !zip_p.exists() {
        return Err("El archivo zip no existe".into());
    }

    let target_p = PathBuf::from(&target_dir);
    fs::create_dir_all(&target_p).map_err(|e| format!("No se pudo crear directorio destino: {}", e))?;

    let file = File::open(&zip_p).map_err(|e| format!("Error al abrir zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Archivo zip no válido: {}", e))?;

    let mut extracted_count = 0usize;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let enclosed = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        let outpath = target_p.join(enclosed);

        if file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            extracted_count += 1;
        }
    }

    Ok(extracted_count)
}

#[tauri::command]
fn list_zip_contents(zip_path: String) -> Result<Vec<ArchiveEntryItem>, String> {
    let zip_p = PathBuf::from(&zip_path);
    if !zip_p.exists() {
        return Err("El archivo zip no existe".into());
    }

    let file = File::open(&zip_p).map_err(|e| format!("Error al abrir zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Archivo zip no válido: {}", e))?;

    let mut list = Vec::new();
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            let name = entry.name().to_string();
            let is_dir = entry.is_dir();
            let uncompressed_size = entry.size();
            let compressed_size = entry.compressed_size();

            list.push(ArchiveEntryItem {
                name: PathBuf::from(&name).file_name().unwrap_or_default().to_string_lossy().to_string(),
                path: name,
                is_directory: is_dir,
                uncompressed_size,
                compressed_size,
            });
        }
    }

    Ok(list)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListingOptions {
    pub dir_path: String,
    pub output_path: String,
    pub format: String, // "tree" | "flat"
    pub recursive: bool,
    pub include_files: bool,
    pub max_depth: Option<usize>, // None if unlimited
    pub include_details: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListingResult {
    pub output_path: String,
    pub total_dirs: usize,
    pub total_files: usize,
    pub total_size: u64,
    pub line_count: usize,
}

fn format_listing_size(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    const KIB: f64 = 1024.0;
    const MIB: f64 = KIB * 1024.0;
    const GIB: f64 = MIB * 1024.0;
    const TIB: f64 = GIB * 1024.0;

    let b = bytes as f64;
    if b >= TIB {
        format!("{:.1} TB", b / TIB)
    } else if b >= GIB {
        format!("{:.1} GB", b / GIB)
    } else if b >= MIB {
        format!("{:.1} MB", b / MIB)
    } else if b >= KIB {
        format!("{:.1} KB", b / KIB)
    } else {
        format!("{} B", bytes)
    }
}

fn format_unix_timestamp(secs: u64) -> String {
    if secs == 0 {
        return "--".to_string();
    }
    let days = (secs / 86400) as i64;
    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;

    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1024 + doe / 1461 - doe / 142400) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02} {:02}:{:02}", y, m, d, hours, mins)
}

struct ListingEntry {
    name: String,
    path: PathBuf,
    is_dir: bool,
    size: u64,
    modified: u64,
}

fn traverse_tree_listing(
    dir: &Path,
    prefix: &str,
    current_depth: usize,
    max_depth: Option<usize>,
    include_files: bool,
    include_details: bool,
    output: &mut String,
    total_dirs: &mut usize,
    total_files: &mut usize,
    total_size: &mut u64,
    line_count: &mut usize,
) {
    let entries_res = fs::read_dir(dir);
    if entries_res.is_err() {
        output.push_str(&format!("{}    [Acceso denegado]\n", prefix));
        *line_count += 1;
        return;
    }

    let mut items: Vec<ListingEntry> = Vec::new();
    if let Ok(entries) = entries_res {
        for entry in entries.flatten() {
            let p = entry.path();
            let is_d = p.is_dir();
            if !is_d && !include_files {
                continue;
            }

            let meta = p.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            items.push(ListingEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: p,
                is_dir: is_d,
                size,
                modified,
            });
        }
    }

    items.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    let count = items.len();
    for (idx, item) in items.iter().enumerate() {
        let is_last = idx == count - 1;
        let branch = if is_last { "└── " } else { "├── " };
        let child_prefix = if is_last { "    " } else { "│   " };

        if item.is_dir {
            *total_dirs += 1;
            *line_count += 1;
            let detail = if include_details && item.modified > 0 {
                format!("  (modificado: {})", format_unix_timestamp(item.modified))
            } else {
                String::new()
            };
            output.push_str(&format!("{}{}{}/{}\n", prefix, branch, item.name, detail));

            let can_recurse = match max_depth {
                Some(limit) => current_depth < limit,
                None => true,
            };

            if can_recurse {
                let next_prefix = format!("{}{}", prefix, child_prefix);
                traverse_tree_listing(
                    &item.path,
                    &next_prefix,
                    current_depth + 1,
                    max_depth,
                    include_files,
                    include_details,
                    output,
                    total_dirs,
                    total_files,
                    total_size,
                    line_count,
                );
            }
        } else {
            *total_files += 1;
            *total_size += item.size;
            *line_count += 1;
            let detail = if include_details {
                format!("  ({}, {})", format_listing_size(item.size), format_unix_timestamp(item.modified))
            } else {
                String::new()
            };
            output.push_str(&format!("{}{}{}{}\n", prefix, branch, item.name, detail));
        }
    }
}

fn traverse_flat_listing(
    dir: &Path,
    base_dir: &Path,
    current_depth: usize,
    max_depth: Option<usize>,
    recursive: bool,
    include_files: bool,
    include_details: bool,
    output: &mut String,
    total_dirs: &mut usize,
    total_files: &mut usize,
    total_size: &mut u64,
    line_count: &mut usize,
) {
    let entries_res = fs::read_dir(dir);
    if entries_res.is_err() {
        return;
    }

    let mut items: Vec<ListingEntry> = Vec::new();
    if let Ok(entries) = entries_res {
        for entry in entries.flatten() {
            let p = entry.path();
            let is_d = p.is_dir();
            if !is_d && !include_files {
                continue;
            }

            let meta = p.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            items.push(ListingEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: p,
                is_dir: is_d,
                size,
                modified,
            });
        }
    }

    items.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    for item in &items {
        let rel_path = item.path.strip_prefix(base_dir).unwrap_or(&item.path);
        let rel_display = rel_path.to_string_lossy().to_string();

        *line_count += 1;
        if item.is_dir {
            *total_dirs += 1;
            let date_str = if include_details { format_unix_timestamp(item.modified) } else { "".to_string() };
            output.push_str(&format!("{:<7} {:>10}   {:<16}  {}/\n", "[DIR]", "", date_str, rel_display));

            if recursive {
                let can_recurse = match max_depth {
                    Some(limit) => current_depth < limit,
                    None => true,
                };
                if can_recurse {
                    traverse_flat_listing(
                        &item.path,
                        base_dir,
                        current_depth + 1,
                        max_depth,
                        recursive,
                        include_files,
                        include_details,
                        output,
                        total_dirs,
                        total_files,
                        total_size,
                        line_count,
                    );
                }
            }
        } else {
            *total_files += 1;
            *total_size += item.size;
            let size_str = if include_details { format_listing_size(item.size) } else { "".to_string() };
            let date_str = if include_details { format_unix_timestamp(item.modified) } else { "".to_string() };
            output.push_str(&format!("{:<7} {:>10}   {:<16}  {}\n", "[FILE]", size_str, date_str, rel_display));
        }
    }
}

#[tauri::command]
fn generate_directory_listing(options: ListingOptions) -> Result<ListingResult, String> {
    let target_dir = PathBuf::from(&options.dir_path);
    if !target_dir.exists() || !target_dir.is_dir() {
        return Err("El directorio especificado no existe".into());
    }

    let out_path = PathBuf::from(&options.output_path);
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear el directorio destino: {}", e))?;
    }

    let now_secs = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let now_str = format_unix_timestamp(now_secs);

    let mut output = String::with_capacity(32 * 1024);
    output.push_str("================================================================================\n");
    output.push_str(&format!("LISTADO DE DIRECTORIO: {}\n", options.dir_path));
    output.push_str(&format!("Generado por: Tron File Manager\n"));
    output.push_str(&format!("Fecha de generación: {}\n", now_str));
    output.push_str(&format!("Formato: {}\n", if options.format == "tree" { "Estructura en Árbol" } else { "Lista detallada" }));
    let depth_str = match options.max_depth {
        Some(d) => format!("{} niveles", d),
        None => "Completo (sin límite)".to_string(),
    };
    output.push_str(&format!("Profundidad de exploración: {}\n", depth_str));
    output.push_str(&format!("Contenido: {}\n", if options.include_files { "Directorios y Archivos" } else { "Solo Directorios" }));
    output.push_str("================================================================================\n\n");

    let mut total_dirs = 0usize;
    let mut total_files = 0usize;
    let mut total_size = 0u64;
    let mut line_count = 0usize;

    if options.format == "tree" {
        output.push_str(&format!("[{}]\n", options.dir_path));
        line_count += 1;
        traverse_tree_listing(
            &target_dir,
            "",
            1,
            options.max_depth,
            options.include_files,
            options.include_details,
            &mut output,
            &mut total_dirs,
            &mut total_files,
            &mut total_size,
            &mut line_count,
        );
    } else {
        output.push_str(&format!("{:<7} {:>10}   {:<16}  {}\n", "TIPO", "TAMAÑO", "FECHA", "NOMBRE / RUTA"));
        output.push_str("--------------------------------------------------------------------------------\n");
        line_count += 2;
        traverse_flat_listing(
            &target_dir,
            &target_dir,
            1,
            options.max_depth,
            options.recursive,
            options.include_files,
            options.include_details,
            &mut output,
            &mut total_dirs,
            &mut total_files,
            &mut total_size,
            &mut line_count,
        );
    }

    output.push_str("\n================================================================================\n");
    output.push_str("RESUMEN:\n");
    output.push_str(&format!("- Carpetas: {}\n", total_dirs));
    output.push_str(&format!("- Archivos: {}\n", total_files));
    output.push_str(&format!("- Espacio total: {}\n", format_listing_size(total_size)));
    output.push_str(&format!("- Elementos listados: {}\n", total_dirs + total_files));
    output.push_str("================================================================================\n");

    fs::write(&out_path, output.as_bytes())
        .map_err(|e| format!("Error al escribir el archivo de listado: {}", e))?;

    Ok(ListingResult {
        output_path: options.output_path,
        total_dirs,
        total_files,
        total_size,
        line_count,
    })
}

#[tauri::command]
fn force_exit_app() {
    std::process::exit(0);
}

fn build_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<tauri::menu::Menu<R>, Box<dyn std::error::Error>> {
    use tauri::menu::*;

    let menu = MenuBuilder::new(app);

    // 1. App Submenu (Tron)
    let app_submenu = SubmenuBuilder::new(app, "Tron")
        .item(&MenuItemBuilder::with_id("about_tron", "Acerca de Tron").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open_preferences", "Preferencias...").accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Ocultar Tron"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Ocultar otros"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Mostrar todo"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Salir de Tron"))?)
        .build()?;

    // 2. Archivo
    let file_submenu = SubmenuBuilder::new(app, "Archivo")
        .item(&MenuItemBuilder::with_id("new_file", "Nuevo Archivo...").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("new_folder", "Nueva Carpeta...").accelerator("CmdOrCtrl+Shift+N").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("new_tab", "Nueva Pestaña").accelerator("CmdOrCtrl+T").build(app)?)
        .item(&MenuItemBuilder::with_id("close_tab", "Cerrar Pestaña").accelerator("CmdOrCtrl+W").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("rename_item", "Renombrar...").accelerator("F2").build(app)?)
        .item(&MenuItemBuilder::with_id("duplicate_item", "Duplicar").accelerator("CmdOrCtrl+D").build(app)?)
        .item(&MenuItemBuilder::with_id("compress_zip", "Comprimir en .zip...").build(app)?)
        .item(&MenuItemBuilder::with_id("export_listing", "Generar listado a archivo...").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("delete_item", "Mover a Papelera").accelerator("Backspace").build(app)?)
        .item(&MenuItemBuilder::with_id("show_properties", "Propiedades").accelerator("Alt+Enter").build(app)?)
        .item(&MenuItemBuilder::with_id("add_favorite", "Añadir a Favoritos").accelerator("CmdOrCtrl+B").build(app)?)
        .build()?;

    // 3. Edición
    let edit_submenu = SubmenuBuilder::new(app, "Edición")
        .item(&PredefinedMenuItem::undo(app, Some("Deshacer"))?)
        .item(&PredefinedMenuItem::redo(app, Some("Rehacer"))?)
        .separator()
        .item(&MenuItemBuilder::with_id("cut_items", "Cortar").accelerator("CmdOrCtrl+X").build(app)?)
        .item(&MenuItemBuilder::with_id("copy_items", "Copiar").accelerator("CmdOrCtrl+C").build(app)?)
        .item(&MenuItemBuilder::with_id("paste_items", "Pegar").accelerator("CmdOrCtrl+V").build(app)?)
        .item(&MenuItemBuilder::with_id("select_all", "Seleccionar todo").accelerator("CmdOrCtrl+A").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("copy_path", "Copiar Ruta").accelerator("CmdOrCtrl+Shift+C").build(app)?)
        .item(&MenuItemBuilder::with_id("copy_posix", "Copiar Ruta POSIX").accelerator("CmdOrCtrl+Alt+C").build(app)?)
        .build()?;

    // 4. Ver
    let view_submenu = SubmenuBuilder::new(app, "Ver")
        .item(&MenuItemBuilder::with_id("toggle_quickview", "QuickView").accelerator("Space").build(app)?)
        .item(&MenuItemBuilder::with_id("toggle_split", "Vista Dividida (Panel Dual)").accelerator("CmdOrCtrl+\\").build(app)?)
        .item(&MenuItemBuilder::with_id("refresh_dir", "Actualizar").accelerator("CmdOrCtrl+R").build(app)?)
        .item(&MenuItemBuilder::with_id("toggle_hidden", "Mostrar Archivos Ocultos").accelerator("CmdOrCtrl+H").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open_appearance", "Personalizar Aspecto...").build(app)?)
        .build()?;

    // 5. Herramientas
    let tools_submenu = SubmenuBuilder::new(app, "Herramientas")
        .item(&MenuItemBuilder::with_id("open_sherlock", "Sherlock - Búsqueda Avanzada").accelerator("CmdOrCtrl+Shift+F").build(app)?)
        .item(&MenuItemBuilder::with_id("open_jump", "Ir a Carpeta...").accelerator("CmdOrCtrl+P").build(app)?)
        .item(&MenuItemBuilder::with_id("open_terminal", "Abrir Terminal Aquí").accelerator("CmdOrCtrl+Shift+T").build(app)?)
        .build()?;

    // 6. Ventana
    let window_submenu = SubmenuBuilder::new(app, "Ventana")
        .item(&PredefinedMenuItem::minimize(app, Some("Minimizar"))?)
        .item(&PredefinedMenuItem::fullscreen(app, Some("Pantalla Completa"))?)
        .item(&PredefinedMenuItem::close_window(app, Some("Cerrar Ventana"))?)
        .build()?;

    // 7. Ayuda
    let help_submenu = SubmenuBuilder::new(app, "Ayuda")
        .item(&MenuItemBuilder::with_id("help_shortcuts", "Guía de Atajos de Teclado").accelerator("F1").build(app)?)
        .item(&MenuItemBuilder::with_id("about_tron", "Acerca de Tron").build(app)?)
        .build()?;

    let final_menu = menu
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&tools_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()?;

    Ok(final_menu)
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {:?}\n", info);
        eprintln!("{}", msg);
        let _ = std::fs::write("tron_crash.log", msg);
    }));

    start_streaming_server();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .menu(|app| {
            build_app_menu(app).map_err(|e| {
                eprintln!("Error building menu: {}", e);
                tauri::Error::UnknownPath
            })
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let _ = app.emit("menu-action", id);
        })
        .invoke_handler(tauri::generate_handler![
            get_user_places,
            get_system_drives,
            read_directory,
            read_file_preview,
            read_file_hex,
            batch_rename,
            search_subfolders,
            delete_file_item,
            open_file_default,
            create_new_file,
            create_new_directory,
            rename_file_or_folder,
            copy_items,
            move_items,
            get_directory_size,
            search_directory_recursive,
            sherlock_search,
            force_exit_app,
            open_terminal,
            open_in_editor,
            get_app_info,
            show_in_system_explorer,
            show_item_properties,
            open_with_dialog,
            launch_with_app,
            compress_to_zip,
            extract_zip_archive,
            list_zip_contents,
            generate_directory_listing,
            get_disk_free_space
        ])
        .run(tauri::generate_context!());

    if let Err(err) = result {
        let err_msg = format!("TAURI RUN ERROR: {:?}\n", err);
        eprintln!("{}", err_msg);
        let _ = std::fs::write("tron_crash.log", err_msg);
    }
}



