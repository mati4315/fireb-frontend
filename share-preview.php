<?php
declare(strict_types=1);

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($requestPath) || !preg_match('~^/(?:noticia|s|c)/[^/]+(?:/[^/]*)?$~u', $requestPath)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Vista previa no disponible.');
}

$functionUrl = 'https://us-central1-cdeluar-ddefc.cloudfunctions.net/sharePreview';
$previewUrl = $functionUrl . '?' . http_build_query(
    ['path' => $requestPath],
    '',
    '&',
    PHP_QUERY_RFC3986
);

header('Vary: User-Agent');
header('Cache-Control: no-store, private, max-age=0');
header('X-Content-Type-Options: nosniff');

if (function_exists('curl_init')) {
    $curl = curl_init($previewUrl);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Accept: text/html'],
        CURLOPT_USERAGENT => 'Cdelu-Share-Preview/1.0'
    ]);
    $html = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
} else {
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 8,
            'ignore_errors' => true,
            'header' => "Accept: text/html\r\nUser-Agent: Cdelu-Share-Preview/1.0\r\n"
        ]
    ]);
    $html = @file_get_contents($previewUrl, false, $context);
    $responseHeaders = $http_response_header ?? [];
    $status = 0;
    foreach ($responseHeaders as $responseHeader) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $responseHeader, $matches)) {
            $status = (int) $matches[1];
            break;
        }
    }
    $error = 'cURL is unavailable; used PHP streams';
}

if (!is_string($html) || $html === '' || $status < 200 || $status >= 300) {
    error_log('Cdelu share preview failed: HTTP ' . $status . ' ' . $error);
    http_response_code($status >= 400 && $status < 500 ? $status : 502);
    header('Content-Type: text/plain; charset=utf-8');
    exit('No se pudo cargar la vista previa.');
}

http_response_code(200);
header('Content-Type: text/html; charset=utf-8');
echo $html;
