<?php
/**
 * دوال مشتركة لإنشاء غرفة Daily تلقائياً من الحجز المدفوع (opay.php) — أضيفت 2026-11-15.
 * نفس ملف الإعدادات ونفس ملف الحالة بتوع api/video.php، فالغرفة بتظهر في صفحة الإدارة video/admin.html
 * والعداد (بدء / تمديد / إنهاء) شغال عليها عادي.
 * مابيعملش exit أبداً: لو حصلت مشكلة بيرجع null والحجز بيكمل.
 */

declare(strict_types=1);

function vl_cfg(): ?array {
    static $cfg = false;
    if ($cfg !== false) return $cfg;
    $path = getenv('HAMLF_VIDEO_CONFIG') ?: dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..') . '/video-config.php';
    if (!is_file($path)) return $cfg = null;
    $c = require $path;
    if (empty($c['daily_api_key']) || empty($c['daily_domain'])) return $cfg = null;
    $c['state_file'] = $c['state_file'] ?? dirname($path) . '/video-rooms.json';
    $c['daily_api_base'] = rtrim($c['daily_api_base'] ?? 'https://api.daily.co/v1', '/');
    return $cfg = $c;
}

/** ينشئ غرفة لميعاد محدد (epoch) ويرجّع رابط صفحة الجلسة على hamlf.com، أو null */
function vl_create_room(string $client, int $minutes, int $scheduled): ?string {
    $c = vl_cfg();
    if (!$c || $scheduled <= 0) return null;
    $minutes = in_array($minutes, [20, 30], true) ? $minutes : 30;
    $name = 'hamlf-' . bin2hex(random_bytes(8));
    $ch = curl_init($c['daily_api_base'] . '/rooms');
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'POST', CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $c['daily_api_key'], 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['name' => $name, 'privacy' => 'public', 'properties' => [
            'exp' => max(time(), $scheduled) + 3 * 3600, 'eject_at_room_exp' => true,
            'enable_chat' => true, 'enable_screenshare' => true, 'enable_prejoin_ui' => true,
        ]]),
    ]);
    $res = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($res === false || $code >= 400) return null;

    $fh = @fopen($c['state_file'], 'c+');
    if (!$fh) return null;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $s = $raw ? (json_decode($raw, true) ?: []) : [];
    $s[$name] = ['client' => mb_substr($client, 0, 80), 'minutes' => $minutes, 'scheduled' => $scheduled,
                 'status' => 'waiting', 'ends_at' => null, 'created' => time()];
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode($s, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    return 'https://hamlf.com/video/?r=' . $name;
}
