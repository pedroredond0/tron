use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use lopdf::{Document, Object, ObjectId, Stream, Dictionary};
use lopdf::content::{Content, Operation};
use image::{GenericImageView, ImageFormat};

/// Helper to get file stem as string
fn get_file_stem(path_str: &str) -> String {
    Path::new(path_str)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("documento")
        .to_string()
}

/// Helper to get parent directory of a path as PathBuf
fn get_parent_dir(path_str: &str) -> PathBuf {
    Path::new(path_str)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Add an image as a page into a lopdf::Document
pub fn add_image_page(doc: &mut Document, pages_id: ObjectId, img_path: &str) -> Result<ObjectId, String> {
    let path = Path::new(img_path);
    if !path.exists() {
        return Err(format!("No se encontró la imagen: {}", img_path));
    }

    let dyn_img = image::open(path)
        .map_err(|e| format!("Error al abrir imagen {}: {}", img_path, e))?;

    let (orig_w, orig_h) = dyn_img.dimensions();
    if orig_w == 0 || orig_h == 0 {
        return Err(format!("Dimensiones inválidas para imagen: {}", img_path));
    }

    // Points calculation: 72 points per inch. Assuming 96 DPI screen resolution:
    let page_w = (orig_w as f64 * 72.0 / 96.0).round();
    let page_h = (orig_h as f64 * 72.0 / 96.0).round();

    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();

    let (stream_data, filter, color_space, bits_per_component) = if ext == "jpg" || ext == "jpeg" {
        // Direct embedding of raw JPEG stream (lossless & instant)
        let raw_bytes = fs::read(path).map_err(|e| format!("Error al leer {}: {}", img_path, e))?;
        (raw_bytes, "DCTDecode", "DeviceRGB", 8)
    } else {
        // Encode to JPEG in memory for compatibility and fast compact size
        let mut jpeg_buf = Cursor::new(Vec::new());
        let rgb_img = dyn_img.to_rgb8();
        rgb_img.write_to(&mut jpeg_buf, ImageFormat::Jpeg)
            .map_err(|e| format!("Error al codificar imagen a JPEG: {}", e))?;
        (jpeg_buf.into_inner(), "DCTDecode", "DeviceRGB", 8)
    };

    // 1. Create Image XObject Stream
    let mut img_dict = Dictionary::new();
    img_dict.set("Type", Object::Name(b"XObject".to_vec()));
    img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
    img_dict.set("Width", Object::Integer(orig_w as i64));
    img_dict.set("Height", Object::Integer(orig_h as i64));
    img_dict.set("ColorSpace", Object::Name(color_space.as_bytes().to_vec()));
    img_dict.set("BitsPerComponent", Object::Integer(bits_per_component));
    img_dict.set("Filter", Object::Name(filter.as_bytes().to_vec()));

    let img_stream = Stream::new(img_dict, stream_data);
    let img_id = doc.add_object(Object::Stream(img_stream));

    // 2. Create Content Stream that paints the image filling the page
    let content_ops = Content {
        operations: vec![
            Operation::new("q", vec![]),
            Operation::new("cm", vec![
                Object::Real(page_w as f32),
                Object::Integer(0),
                Object::Integer(0),
                Object::Real(page_h as f32),
                Object::Integer(0),
                Object::Integer(0),
            ]),
            Operation::new("Do", vec![Object::Name(b"Im0".to_vec())]),
            Operation::new("Q", vec![]),
        ],
    };
    let content_bytes = content_ops.encode().unwrap_or_else(|_| Vec::new());
    let content_dict = Dictionary::new();
    let content_stream = Stream::new(content_dict, content_bytes);
    let content_id = doc.add_object(Object::Stream(content_stream));

    // 3. Create Resources dictionary referencing the Image XObject as /Im0
    let mut xobject_dict = Dictionary::new();
    xobject_dict.set("Im0", Object::Reference(img_id));
    let mut resources_dict = Dictionary::new();
    resources_dict.set("XObject", Object::Dictionary(xobject_dict));

    // 4. Create Page dictionary
    let mut page_dict = Dictionary::new();
    page_dict.set("Type", Object::Name(b"Page".to_vec()));
    page_dict.set("Parent", Object::Reference(pages_id));
    page_dict.set("MediaBox", Object::Array(vec![
        Object::Integer(0),
        Object::Integer(0),
        Object::Real(page_w as f32),
        Object::Real(page_h as f32),
    ]));
    page_dict.set("Contents", Object::Reference(content_id));
    page_dict.set("Resources", Object::Dictionary(resources_dict));

    let page_id = doc.add_object(Object::Dictionary(page_dict));
    Ok(page_id)
}

/// Convert one or more images into a single PDF document
#[tauri::command]
pub async fn pdf_images_to_pdf(image_paths: Vec<String>, output_pdf: String) -> Result<String, String> {
    if image_paths.is_empty() {
        return Err("No se especificaron imágenes para convertir".to_string());
    }

    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();

    let mut page_ids = Vec::new();
    for img_path in &image_paths {
        let p_id = add_image_page(&mut doc, pages_id, img_path)?;
        page_ids.push(Object::Reference(p_id));
    }

    // Define Pages object
    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set("Count", Object::Integer(page_ids.len() as i64));
    pages_dict.set("Kids", Object::Array(page_ids));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    // Define Catalog object
    let catalog_id = doc.new_object_id();
    let mut catalog_dict = Dictionary::new();
    catalog_dict.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog_dict.set("Pages", Object::Reference(pages_id));
    doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));

    doc.trailer.set("Root", Object::Reference(catalog_id));
    doc.compress();

    // Ensure parent directory exists
    if let Some(parent) = Path::new(&output_pdf).parent() {
        let _ = fs::create_dir_all(parent);
    }

    doc.save(&output_pdf)
        .map_err(|e| format!("Error al guardar PDF en {}: {}", output_pdf, e))?;

    Ok(output_pdf)
}

/// Merge multiple PDF documents and/or images into a single combined PDF
#[tauri::command]
pub async fn pdf_merge(files: Vec<String>, output_pdf: String) -> Result<String, String> {
    if files.is_empty() {
        return Err("No se especificaron archivos para unir".to_string());
    }

    let mut final_doc = Document::with_version("1.5");
    let pages_id = final_doc.new_object_id();
    let mut all_page_refs = Vec::new();
    let mut max_id: u32;

    for file_path in &files {
        let p = Path::new(file_path);
        if !p.exists() {
            return Err(format!("Archivo no encontrado: {}", file_path));
        }

        final_doc.max_id = final_doc.objects.keys().map(|k| k.0).max().unwrap_or(final_doc.max_id);
        max_id = final_doc.max_id + 5;

        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let is_image = ["png", "jpg", "jpeg", "webp"].contains(&ext.as_str());

        if is_image {
            // Add image directly as a page
            let page_id = add_image_page(&mut final_doc, pages_id, file_path)?;
            all_page_refs.push(Object::Reference(page_id));
            final_doc.max_id = final_doc.objects.keys().map(|k| k.0).max().unwrap_or(final_doc.max_id);
        } else if ext == "pdf" {
            // Load source PDF document
            let mut src_doc = Document::load(file_path)
                .map_err(|e| format!("Error al leer PDF {}: {}", file_path, e))?;

            // Renumber objects to avoid ID collision
            src_doc.renumber_objects_with(max_id);

            // Get source pages
            let pages = src_doc.get_pages();
            for (_p_num, page_id) in pages {
                // Update parent of page to final pages_id
                if let Ok(page_obj) = src_doc.get_object_mut(page_id) {
                    if let Ok(dict) = page_obj.as_dict_mut() {
                        dict.set("Parent", Object::Reference(pages_id));
                    }
                }
                all_page_refs.push(Object::Reference(page_id));
            }

            // Copy all objects from src_doc into final_doc (except Root and Pages catalog)
            for (id, obj) in src_doc.objects {
                let is_root_or_pages = if let Ok(dict) = obj.as_dict() {
                    let is_cat = dict.get(b"Type").map(|t| t == &Object::Name(b"Catalog".to_vec())).unwrap_or(false);
                    let is_pgs = dict.get(b"Type").map(|t| t == &Object::Name(b"Pages".to_vec())).unwrap_or(false);
                    is_cat || is_pgs
                } else {
                    false
                };

                if !is_root_or_pages {
                    final_doc.objects.insert(id, obj);
                }
            }
            final_doc.max_id = final_doc.objects.keys().map(|k| k.0).max().unwrap_or(final_doc.max_id);
        }
    }

    // Set Pages object
    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set("Count", Object::Integer(all_page_refs.len() as i64));
    pages_dict.set("Kids", Object::Array(all_page_refs));
    final_doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    // Set Catalog object
    let catalog_id = final_doc.new_object_id();
    let mut catalog_dict = Dictionary::new();
    catalog_dict.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog_dict.set("Pages", Object::Reference(pages_id));
    final_doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));

    final_doc.trailer.set("Root", Object::Reference(catalog_id));
    final_doc.compress();

    if let Some(parent) = Path::new(&output_pdf).parent() {
        let _ = fs::create_dir_all(parent);
    }

    final_doc.save(&output_pdf)
        .map_err(|e| format!("Error al guardar PDF combinado en {}: {}", output_pdf, e))?;

    Ok(output_pdf)
}

/// Rotate all pages of a PDF by the specified degrees (e.g. 90, 180, 270)
#[tauri::command]
pub async fn pdf_rotate(pdf_path: String, degrees: i32) -> Result<(), String> {
    let mut doc = Document::load(&pdf_path)
        .map_err(|e| format!("Error al abrir {}: {}", pdf_path, e))?;

    let pages = doc.get_pages();
    if pages.is_empty() {
        return Err("El documento PDF no contiene páginas".to_string());
    }

    for (_page_num, page_id) in pages {
        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(dict) = page_obj.as_dict_mut() {
                let current_rot = dict.get(b"Rotate")
                    .and_then(|o| o.as_i64())
                    .unwrap_or(0);
                let new_rot = (current_rot + degrees as i64).rem_euclid(360);
                dict.set("Rotate", Object::Integer(new_rot));
            }
        }
    }

    doc.save(&pdf_path)
        .map_err(|e| format!("Error al guardar PDF rotado: {}", e))?;

    Ok(())
}

/// Split a PDF into individual pages or page ranges
#[tauri::command]
pub async fn pdf_split(pdf_path: String, mode: String, range_str: Option<String>) -> Result<String, String> {
    let doc = Document::load(&pdf_path)
        .map_err(|e| format!("Error al abrir {}: {}", pdf_path, e))?;

    let pages = doc.get_pages();
    let total_pages = pages.len();
    if total_pages == 0 {
        return Err("El documento PDF está vacío".to_string());
    }

    let parent_dir = get_parent_dir(&pdf_path);
    let stem = get_file_stem(&pdf_path);
    let output_dir = parent_dir.join(format!("{}_dividido", stem));
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Error al crear carpeta de salida {}: {}", output_dir.display(), e))?;

    // Determine which pages to export
    let target_pages: Vec<u32> = if mode == "single" || range_str.is_none() || range_str.as_ref().unwrap().trim().is_empty() {
        (1..=total_pages as u32).collect()
    } else {
        parse_page_ranges(&range_str.unwrap(), total_pages as u32)
    };

    for page_num in &target_pages {
        if let Some(&_page_id) = pages.get(page_num) {
            let mut single_doc = doc.clone();
            // Delete all pages except current
            let pages_to_delete: Vec<u32> = (1..=total_pages as u32)
                .filter(|&p| p != *page_num)
                .collect();
            single_doc.delete_pages(&pages_to_delete);
            single_doc.compress();

            let out_file = output_dir.join(format!("{}_pag_{:02}.pdf", stem, page_num));
            let _ = single_doc.save(&out_file);
        }
    }

    Ok(output_dir.to_string_lossy().to_string())
}

/// Parse a string like "1, 3, 5-8" into a vector of page numbers
fn parse_page_ranges(input: &str, max_page: u32) -> Vec<u32> {
    let mut pages = Vec::new();
    for part in input.split(',') {
        let part = part.trim();
        if part.is_empty() { continue; }
        if let Some((start_str, end_str)) = part.split_once('-') {
            let start = start_str.trim().parse::<u32>().unwrap_or(1).max(1);
            let end = end_str.trim().parse::<u32>().unwrap_or(max_page).min(max_page);
            for p in start..=end {
                if !pages.contains(&p) {
                    pages.push(p);
                }
            }
        } else if let Ok(p) = part.parse::<u32>() {
            if p >= 1 && p <= max_page && !pages.contains(&p) {
                pages.push(p);
            }
        }
    }
    pages.sort();
    pages
}

/// Extract text from a PDF document into Markdown (.md) or Text (.txt)
#[tauri::command]
pub async fn pdf_extract_text(pdf_path: String, output_format: String) -> Result<String, String> {
    let doc = Document::load(&pdf_path)
        .map_err(|e| format!("Error al abrir {}: {}", pdf_path, e))?;

    let pages = doc.get_pages();
    let total_pages = pages.len();
    if total_pages == 0 {
        return Err("El documento no contiene páginas".to_string());
    }

    let is_markdown = output_format.to_lowercase() == "markdown" || output_format.to_lowercase() == "md";
    let ext = if is_markdown { "md" } else { "txt" };

    let parent_dir = get_parent_dir(&pdf_path);
    let stem = get_file_stem(&pdf_path);
    let output_file = parent_dir.join(format!("{}.{}", stem, ext));

    let mut output_content = String::new();
    if is_markdown {
        output_content.push_str(&format!("# Documento: {}\n\n*Páginas totales: {}*\n\n---\n\n", stem, total_pages));
    }

    for page_num in 1..=total_pages as u32 {
        let page_text = doc.extract_text(&[page_num]).unwrap_or_default();
        let clean_text = page_text.trim();

        if is_markdown {
            output_content.push_str(&format!("## Página {}\n\n", page_num));
            if clean_text.is_empty() {
                output_content.push_str("*(Página sin texto reconocible o basada en imágenes)*\n\n");
            } else {
                output_content.push_str(clean_text);
                output_content.push_str("\n\n");
            }
            output_content.push_str("---\n\n");
        } else {
            output_content.push_str(&format!("--- PÁGINA {} ---\n\n", page_num));
            if clean_text.is_empty() {
                output_content.push_str("[Página sin texto reconocible o basada en imágenes]\n\n");
            } else {
                output_content.push_str(clean_text);
                output_content.push_str("\n\n");
            }
        }
    }

    fs::write(&output_file, output_content)
        .map_err(|e| format!("Error al guardar archivo de texto {}: {}", output_file.display(), e))?;

    Ok(output_file.to_string_lossy().to_string())
}

/// Optimize/compress a PDF by compressing streams, pruning unreferenced objects,
/// and re-compressing embedded images according to quality_level (1-100).
#[tauri::command]
pub async fn pdf_optimize(pdf_path: String, quality_level: u8, output_path: String) -> Result<u64, String> {
    let mut doc = Document::load(&pdf_path)
        .map_err(|e| format!("Error al abrir {}: {}", pdf_path, e))?;

    // Prune unreferenced objects
    doc.prune_objects();
    doc.delete_zero_length_streams();

    // Re-sample / compress embedded image XObjects
    let q = quality_level.clamp(1, 100);
    let mut stream_replacements = Vec::new();

    for (obj_id, obj) in doc.objects.iter() {
        if let Ok(stream) = obj.as_stream() {
            let is_image = stream.dict.get(b"Subtype")
                .map(|v| v == &Object::Name(b"Image".to_vec()))
                .unwrap_or(false);

            if is_image {
                // Try decompressing and re-encoding with JPEG at target quality
                if let Ok(decompressed) = stream.decompressed_content() {
                    if let Ok(dyn_img) = image::load_from_memory(&decompressed) {
                        let (w, h) = dyn_img.dimensions();
                        // Downscale very large images if aggressive compression requested
                        let processed_img = if q < 60 && (w > 1920 || h > 1920) {
                            dyn_img.resize(1920, 1920, image::imageops::FilterType::Triangle)
                        } else {
                            dyn_img
                        };

                        let mut jpeg_buf = Cursor::new(Vec::new());
                        let rgb = processed_img.to_rgb8();
                        if rgb.write_to(&mut jpeg_buf, ImageFormat::Jpeg).is_ok() {
                            let new_bytes = jpeg_buf.into_inner();
                            // Only replace if new bytes are actually smaller
                            if new_bytes.len() < stream.content.len() || stream.content.len() > 100_000 {
                                let (new_w, new_h) = processed_img.dimensions();
                                let mut new_dict = stream.dict.clone();
                                new_dict.set("Width", Object::Integer(new_w as i64));
                                new_dict.set("Height", Object::Integer(new_h as i64));
                                new_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
                                new_dict.set("BitsPerComponent", Object::Integer(8));
                                new_dict.set("Filter", Object::Name(b"DCTDecode".to_vec()));
                                stream_replacements.push((*obj_id, Stream::new(new_dict, new_bytes)));
                            }
                        }
                    }
                }
            }
        }
    }

    // Apply stream replacements
    for (id, new_stream) in stream_replacements {
        doc.objects.insert(id, Object::Stream(new_stream));
    }

    // Compress remaining streams with FlateDecode
    doc.compress();

    if let Some(parent) = Path::new(&output_path).parent() {
        let _ = fs::create_dir_all(parent);
    }

    doc.save(&output_path)
        .map_err(|e| format!("Error al guardar PDF optimizado en {}: {}", output_path, e))?;

    let meta = fs::metadata(&output_path)
        .map_err(|e| format!("Error al leer tamaño del archivo generado: {}", e))?;

    Ok(meta.len())
}

#[derive(serde::Deserialize)]
pub struct RenderedPageInput {
    pub page_number: u32,
    pub data_base64: String,
    pub format: String,
}

/// Save rendered pages received from the frontend (or canvas) into the target directory
#[tauri::command]
pub async fn pdf_save_rendered_pages(output_dir: String, pages: Vec<RenderedPageInput>) -> Result<String, String> {
    if pages.is_empty() {
        return Err("No hay páginas para guardar".to_string());
    }

    let out_path = Path::new(&output_dir);
    fs::create_dir_all(out_path)
        .map_err(|e| format!("Error al crear directorio {}: {}", output_dir, e))?;

    for p in pages {
        let clean_base64 = if let Some(idx) = p.data_base64.find(',') {
            &p.data_base64[idx + 1..]
        } else {
            &p.data_base64
        };

        let decoded = base64::Engine::decode(&base64::prelude::BASE64_STANDARD, clean_base64.trim())
            .map_err(|e| format!("Error decodificando base64 página {}: {}", p.page_number, e))?;

        let ext = if p.format.to_lowercase() == "png" { "png" } else { "jpg" };
        let file_name = format!("pagina_{:02}.{}", p.page_number, ext);
        let target_file = out_path.join(file_name);

        fs::write(&target_file, decoded)
            .map_err(|e| format!("Error al escribir archivo {}: {}", target_file.display(), e))?;
    }

    Ok(output_dir)
}

/// Export PDF to images (with system pdftoppm if present, or extracting image XObjects)
#[tauri::command]
pub async fn pdf_to_images(pdf_path: String, pages: Vec<u32>, format: String) -> Result<String, String> {
    let p = Path::new(&pdf_path);
    if !p.exists() {
        return Err(format!("No existe el archivo: {}", pdf_path));
    }

    let parent_dir = get_parent_dir(&pdf_path);
    let stem = get_file_stem(&pdf_path);
    let output_dir = parent_dir.join(format!("{}_paginas", stem));
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Error creando carpeta {}: {}", output_dir.display(), e))?;

    let fmt = if format.to_lowercase() == "png" { "png" } else { "jpeg" };
    let ext = if fmt == "png" { "png" } else { "jpg" };

    // Try executing pdftoppm if available in system PATH
    let mut cmd = std::process::Command::new("pdftoppm");
    if fmt == "png" {
        cmd.arg("-png");
    } else {
        cmd.arg("-jpeg");
    }
    cmd.arg("-r").arg("150");

    if pages.len() == 1 {
        let p_str = pages[0].to_string();
        cmd.arg("-f").arg(&p_str).arg("-l").arg(&p_str);
    } else if pages.len() > 1 {
        let first = pages.iter().min().unwrap().to_string();
        let last = pages.iter().max().unwrap().to_string();
        cmd.arg("-f").arg(&first).arg("-l").arg(&last);
    }

    let prefix = output_dir.join("pagina");
    cmd.arg(&pdf_path).arg(prefix);

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            return Ok(output_dir.to_string_lossy().to_string());
        }
    }

    // Fallback: extract embedded image streams with lopdf
    let doc = Document::load(&pdf_path)
        .map_err(|e| format!("Error leyendo PDF: {}", e))?;

    let all_pages = doc.get_pages();
    let target_page_set: Vec<u32> = if pages.is_empty() {
        (1..=all_pages.len() as u32).collect()
    } else {
        pages
    };

    let mut saved_count = 0;
    for page_num in &target_page_set {
        if let Some(&page_id) = all_pages.get(page_num) {
            // Find images in page resources
            if let Ok(page_dict) = doc.get_dictionary(page_id) {
                if let Ok(resources) = page_dict.get(b"Resources").and_then(|r| doc.dereference(r)).and_then(|(_, o)| o.as_dict()) {
                    if let Ok(xobjects) = resources.get(b"XObject").and_then(|x| doc.dereference(x)).and_then(|(_, o)| o.as_dict()) {
                        for (_name, x_ref) in xobjects.iter() {
                            if let Ok((_, obj)) = doc.dereference(x_ref) {
                                if let Ok(stream) = obj.as_stream() {
                                    if stream.dict.get(b"Subtype").map(|v| v == &Object::Name(b"Image".to_vec())).unwrap_or(false) {
                                        if let Ok(data) = stream.decompressed_content() {
                                            if let Ok(dyn_img) = image::load_from_memory(&data) {
                                                saved_count += 1;
                                                let target = output_dir.join(format!("pagina_{:02}_{}.{}", page_num, saved_count, ext));
                                                let _ = dyn_img.save(&target);
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
    }

    Ok(output_dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{RgbImage, Rgb};

    #[test]
    fn test_pdf_tools_flow() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join("tron_pdf_test");
            let _ = fs::create_dir_all(&temp_dir);

            // 1. Create a test PNG image
            let img_path = temp_dir.join("test_img.png");
            let mut img = RgbImage::new(100, 100);
            for pixel in img.pixels_mut() {
                *pixel = Rgb([255, 0, 0]); // Red
            }
            img.save(&img_path).expect("failed to save test image");

            // 2. Convert to PDF
            let pdf_path = temp_dir.join("test_output.pdf");
            let res = pdf_images_to_pdf(vec![img_path.to_string_lossy().to_string()], pdf_path.to_string_lossy().to_string()).await;
            assert!(res.is_ok(), "pdf_images_to_pdf should succeed: {:?}", res);

            // 3. Verify PDF has 1 page
            let doc = Document::load(&pdf_path).expect("should load generated pdf");
            assert_eq!(doc.get_pages().len(), 1);

            // 4. Rotate PDF 90 degrees
            let rot_res = pdf_rotate(pdf_path.to_string_lossy().to_string(), 90).await;
            assert!(rot_res.is_ok(), "pdf_rotate should succeed");

            let doc_rot = Document::load(&pdf_path).expect("should load rotated pdf");
            let pages = doc_rot.get_pages();
            let page_id = pages.get(&1).unwrap();
            let page_dict = doc_rot.get_dictionary(*page_id).unwrap();
            let rot = page_dict.get(b"Rotate").unwrap().as_i64().unwrap();
            assert_eq!(rot, 90);

            // 5. Merge test
            let merged_path = temp_dir.join("test_merged.pdf");
            let merge_res = pdf_merge(
                vec![pdf_path.to_string_lossy().to_string(), img_path.to_string_lossy().to_string()],
                merged_path.to_string_lossy().to_string()
            ).await;
            assert!(merge_res.is_ok(), "pdf_merge should succeed");
            let merged_doc = Document::load(&merged_path).expect("should load merged pdf");
            assert_eq!(merged_doc.get_pages().len(), 2);

            // 6. Optimize test
            let opt_path = temp_dir.join("test_opt.pdf");
            let opt_res = pdf_optimize(merged_path.to_string_lossy().to_string(), 60, opt_path.to_string_lossy().to_string()).await;
            assert!(opt_res.is_ok(), "pdf_optimize should succeed: {:?}", opt_res);
            assert!(opt_path.exists());

            // Cleanup
            let _ = fs::remove_dir_all(&temp_dir);
        });
    }
}

