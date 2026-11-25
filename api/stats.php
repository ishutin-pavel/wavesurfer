<?php
/**
 * Лайки и прослушивания.
 * GET  — отдать статистику
 * POST — записать событие: { action: "like"|"play", track: "file.mp3" }
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const DATA_FILE = __DIR__ . '/../data/stats.json';

// ---------- Утилиты ----------
function loadStats(): array {
    if (!is_file(DATA_FILE)) return [];
    $raw = @file_get_contents(DATA_FILE);
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : [];
}

function saveStats(array $stats): bool {
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0775, true);

    // Атомарная запись через временный файл + flock
    $tmp = DATA_FILE . '.tmp.' . getmypid();
    $fp = @fopen($tmp, 'wb');
    if (!$fp) return false;
    if (!flock($fp, LOCK_EX)) { fclose($fp); @unlink($tmp); return false; }
    fwrite($fp, json_encode($stats, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return @rename($tmp, DATA_FILE);
}

function trackKey(string $track): string {
    // Только имя файла, без путей — защита от подмены
    return basename($track);
}

// ---------- GET: отдать статистику ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['ok' => true, 'stats' => loadStats()], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- POST: записать событие ----------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) $data = $_POST;

$action = (string)($data['action'] ?? '');
$track  = trackKey((string)($data['track'] ?? ''));

if ($track === '' || !in_array($action, ['like', 'play'], true)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Неверные параметры']);
    exit;
}

// ---------- Блокируем файл на время read-modify-write ----------
$lockFile = DATA_FILE . '.lock';
$dir = dirname(DATA_FILE);
if (!is_dir($dir)) @mkdir($dir, 0775, true);
$lock = fopen($lockFile, 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Не удалось заблокировать файл']);
    exit;
}

$stats = loadStats();
if (!isset($stats[$track])) {
    $stats[$track] = ['likes' => 0, 'plays' => 0, 'liked_ips' => []];
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

if ($action === 'like') {
    // Защита от повторного лайка с одного IP
    $likedIps = $stats[$track]['liked_ips'] ?? [];
    if (in_array($ip, $likedIps, true)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        echo json_encode(['ok' => true, 'already' => true, 'likes' => $stats[$track]['likes']]);
        exit;
    }
    $likedIps[] = $ip;
    $stats[$track]['liked_ips'] = array_slice($likedIps, -10000); // защита от разрастания
    $stats[$track]['likes'] = (int)($stats[$track]['likes'] ?? 0) + 1;
} else { // play
    $stats[$track]['plays'] = (int)($stats[$track]['plays'] ?? 0) + 1;
}

saveStats($stats);

flock($lock, LOCK_UN);
fclose($lock);

echo json_encode([
    'ok' => true,
    'likes' => $stats[$track]['likes'],
    'plays' => $stats[$track]['plays'],
], JSON_UNESCAPED_UNICODE);
