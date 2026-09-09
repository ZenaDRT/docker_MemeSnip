<?php
/**
 * MemeSnip — Profile Avatar Upload Handler
 * Receives multipart/form-data image uploads and securely stores them in /htdocs/avatars/
 * Mirrors the validation pattern used by api/upload.php, scoped to avatar images only.
 *
 * Security & Validation:
 * - Method check (POST only)
 * - File extension & MIME type validation via finfo
 * - File size cap (5MB limit — smaller than meme uploads, avatars don't need to be large)
 * - Path traversal defense & filename sanitization
 * - Collision-resistant unique filename generation
 * - Clean JSON responses with no internal server path leakage
 *
 * Known Limitation:
 * - This endpoint does not enforce server-side authentication (e.g. Firebase Auth JWT verification).
 *   Authentication gating is enforced client-side before calling this endpoint. A direct POST to
 *   this endpoint could upload an orphaned avatar file that no user profile ever references.
 */

// Force JSON response header
header('Content-Type: application/json; charset=utf-8');

// Helper to return standardized JSON error response and terminate execution
function sendErrorResponse(string $message, int $statusCode = 400): void
{
    http_response_code($statusCode);
    echo json_encode([
        'success' => false,
        'error' => $message
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// 1. Validate HTTP Request Method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method Not Allowed. Use POST.', 405);
}

// 2. Validate Uploaded File Existence and Upload Errors
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    sendErrorResponse('No file payload was received under the field "file".', 400);
}

$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    switch ($file['error']) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            sendErrorResponse('Uploaded file exceeds the maximum allowed upload size.', 413);
            break;
        case UPLOAD_ERR_PARTIAL:
            sendErrorResponse('File upload was interrupted and only partially uploaded.', 400);
            break;
        case UPLOAD_ERR_NO_FILE:
            sendErrorResponse('No file was selected for upload.', 400);
            break;
        case UPLOAD_ERR_NO_TMP_DIR:
        case UPLOAD_ERR_CANT_WRITE:
        case UPLOAD_ERR_EXTENSION:
        default:
            sendErrorResponse('Server error occurred during file upload handling.', 500);
            break;
    }
}

// 3. Validate File Size (5MB cap — avatars are small, don't need meme-sized allowance)
// 5MB = 5 * 1024 * 1024 bytes = 5,242,880 bytes
$maxSizeBytes = 5 * 1024 * 1024;
if ($file['size'] > $maxSizeBytes || filesize($file['tmp_name']) > $maxSizeBytes) {
    sendErrorResponse('Image size exceeds the maximum limit of 5MB.', 413);
}

// 4. Validate File Extension and MIME Type (images only — no video for avatars)
$allowedExtensions = [
    'jpg' => ['image/jpeg'],
    'jpeg' => ['image/jpeg'],
    'png' => ['image/png'],
    'gif' => ['image/gif'],
    'webp' => ['image/webp']
];

$rawOriginalName = $file['name'] ?? 'avatar.png';
$baseOriginalName = basename($rawOriginalName); // Strip directory path traversal components
$extension = strtolower(pathinfo($baseOriginalName, PATHINFO_EXTENSION));

if (!array_key_exists($extension, $allowedExtensions)) {
    sendErrorResponse('Invalid file extension. Allowed formats: JPG, PNG, GIF, WEBP.', 400);
}

// Inspect actual file binary MIME type using PHP Fileinfo
if (!function_exists('finfo_open')) {
    sendErrorResponse('Fileinfo extension is not available on this server.', 500);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$detectedMime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!$detectedMime || !in_array($detectedMime, $allowedExtensions[$extension], true)) {
    sendErrorResponse('File content does not match the expected format for .' . $extension . ' files.', 400);
}

// 5. Sanitize Filename and Append Collision-Resistant Unique Suffix
$namePart = pathinfo($baseOriginalName, PATHINFO_FILENAME);

// Replace whitespace and non-alphanumeric characters with underscore
$cleanName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $namePart);
// Collapse multiple consecutive underscores
$cleanName = preg_replace('/_+/', '_', $cleanName);
// Trim leading and trailing hyphens and underscores
$cleanName = trim($cleanName, '_-');

if ($cleanName === '') {
    $cleanName = 'avatar';
}

// Generate unique timestamp + cryptographic random string suffix
try {
    $randomHex = bin2hex(random_bytes(4));
} catch (Exception $e) {
    $randomHex = substr(md5(uniqid((string) mt_rand(), true)), 0, 8);
}

$finalFilename = sprintf('%s_%s_%s.%s', $cleanName, time(), $randomHex, $extension);

// 6. Target Directory and File Storage
$targetDir = realpath(__DIR__ . '/../avatars');

if ($targetDir === false) {
    // If realpath failed (e.g. avatars folder doesn't exist yet), attempt to create it
    $targetDir = __DIR__ . '/../avatars';
    if (!is_dir($targetDir)) {
        if (!mkdir($targetDir, 0755, true)) {
            sendErrorResponse('Server storage directory could not be initialized.', 500);
        }
    }
}

$destinationPath = rtrim($targetDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $finalFilename;

// Move uploaded temporary file to final destination
if (!move_uploaded_file($file['tmp_name'], $destinationPath)) {
    sendErrorResponse('Failed to persist uploaded file to server storage.', 500);
}

// 7. Success JSON Response
http_response_code(200);
echo json_encode([
    'success' => true,
    'filename' => $finalFilename
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
