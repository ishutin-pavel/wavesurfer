<?php
/**
 * Отправка комментария к песне на e-mail.
 * POST: track (название), message (текст)
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// Разрешён только POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// Настройки
const TO_EMAIL   = 'mohov@bk.ru';
const FROM_EMAIL = 'no-reply@your-domain.ru'; // замените на свой домен (важно для доставки)
const SUBJECT_PREFIX = '[Аудиоплеер]';

// Читаем входные данные (JSON или form-urlencoded)
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

$track   = trim((string)($data['track'] ?? ''));
$message = trim((string)($data['message'] ?? ''));

// Валидация
if ($track === '' || $message === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Пустой комментарий']);
    exit;
}
if (mb_strlen($message) > 5000) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Слишком длинный текст']);
    exit;
}

// Простая защита от спама: не больше 1 сообщения в 60 сек с одного IP
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$rateFile = __DIR__ . '/../data/comment-rate.json';
$rate = [];
if (is_file($rateFile)) {
    $rate = json_decode((string)file_get_contents($rateFile), true) ?: [];
}
$now = time();
if (isset($rate[$ip]) && ($now - $rate[$ip]) < 60) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Слишком часто. Подождите минуту.']);
    exit;
}
$rate[$ip] = $now;
// чистим старые записи (старше суток)
$rate = array_filter($rate, fn($t) => ($now - $t) < 86400);
@file_put_contents($rateFile, json_encode($rate), LOCK_EX);

// Санитизация заголовков (защита от инъекции)
$cleanTrack = str_replace(["\r", "\n"], ' ', $track);
$subject = SUBJECT_PREFIX . ' Комментарий к песне: ' . $cleanTrack;

$body = "Новый комментарий к песне.\n\n"
      . "Песня: {$track}\n"
      . "IP: {$ip}\n"
      . "Дата: " . date('Y-m-d H:i:s') . "\n\n"
      . "Сообщение:\n{$message}\n";

$headers = [
    'From: ' . FROM_EMAIL,
    'Reply-To: ' . FROM_EMAIL,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    'X-Mailer: PHP/' . phpversion(),
];

$sent = mail(TO_EMAIL, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));

if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Не удалось отправить письмо']);
}
