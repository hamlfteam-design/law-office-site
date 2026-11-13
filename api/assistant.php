<?php
/**
 * مساعد المكتب — الإيميل (info@hamlf.com).
 *
 * صفحة المراجعة (assistant/inbox.html) — جلسة بكلمة سر الإدارة:
 *   POST ?action=login {password}      POST ?action=logout      GET ?action=me
 *   GET  ?action=list[&status=drafted|sent|all]
 *   GET  ?action=get&id=…
 *   POST ?action=send    {id, reply}            ← الإرسال الفعلى — بعد موافقة الإدارة بس
 *   POST ?action=ignore  {id}
 *   POST ?action=revise  {id, instruction, reply}   ← «عدّل بالعربى وهو يترجم»
 *   POST ?action=redraft {id}
 *   POST ?action=poll                         ← «تحديث الآن»
 *
 * التشغيل الدورى (Cron على Hostinger كل ٥–١٠ دقايق):
 *   php /home/USER/public_html/api/assistant.php poll
 *   أو  GET https://hamlf.com/api/assistant.php?action=cron&token=<cron_token>
 * المساعد عمره ما بيبعت لوحده: بيسحب الإيميلات ويجهّز مسودات بس.
 */

declare(strict_types=1);

require __DIR__ . '/assistant-lib/core.php';

date_default_timezone_set('Africa/Cairo');

/* ---------- سطر الأوامر (Cron) ---------- */
if (PHP_SAPI === 'cli') {
    try {
        $r = as_poll();
        echo json_encode(['ok' => true] + $r, JSON_UNESCAPED_UNICODE), "\n";
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, ($e instanceof AsError ? $e->code_str . ' ' : '') . $e->getMessage() . "\n");
        exit(1);
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

function out(array $d, int $code = 200): void {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

function input(): array {
    $j = json_decode((string) file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
}

function start_session(): void {
    session_name('hamlf_assistant');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS'])]);
    session_start();
}

function require_admin(): void {
    start_session();
    if (empty($_SESSION['as_admin'])) throw new AsError('unauthorized', 401);
    session_write_close();   // مانقفلش الجلسة على نداءات Claude الطويلة
}

function require_post(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') throw new AsError('method', 405);
}

function id_in(array $in): int {
    $id = (int) ($in['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) throw new AsError('bad_id', 422);
    return $id;
}

try {
    $cfg = as_cfg();
    $action = (string) ($_GET['action'] ?? '');

    switch ($action) {
        case 'cron': {
            $t = (string) ($_GET['token'] ?? '');
            if (strlen((string) $cfg['cron_token']) < 24 || !hash_equals((string) $cfg['cron_token'], $t)) throw new AsError('unauthorized', 401);
            out(['ok' => true] + as_poll());
        }
        case 'login': {
            require_post();
            start_session();
            if (!hash_equals((string) $cfg['admin_password'], (string) (input()['password'] ?? ''))) {
                usleep(800000);
                throw new AsError('wrong_password', 401);
            }
            session_regenerate_id(true);
            $_SESSION['as_admin'] = true;
            out(['ok' => true]);
        }
        case 'logout': {
            start_session(); $_SESSION = []; session_destroy();
            out(['ok' => true]);
        }
        case 'me': {
            start_session();
            out(['ok' => true, 'admin' => !empty($_SESSION['as_admin'])]);
        }
        case 'list': {
            require_admin();
            $status = (string) ($_GET['status'] ?? 'drafted');
            $where = ['drafted' => "status IN ('drafted','new','error')", 'sent' => "status = 'sent'", 'all' => '1=1'][$status] ?? "status IN ('drafted','new','error')";
            $rows = as_db()->query("SELECT * FROM emails WHERE $where ORDER BY id DESC LIMIT 300")->fetchAll();
            $counts = as_db()->query("SELECT status, COUNT(*) n FROM emails GROUP BY status")->fetchAll(PDO::FETCH_KEY_PAIR);
            out(['ok' => true, 'emails' => array_map('as_public', $rows), 'counts' => $counts, 'last_poll' => as_meta('last_poll')]);
        }
        case 'get': {
            require_admin();
            out(['ok' => true, 'email' => as_public(as_get(id_in([])), true)]);
        }
        case 'send': {
            require_post(); require_admin();
            $in = input();
            as_send(id_in($in), (string) ($in['reply'] ?? ''));
            out(['ok' => true]);
        }
        case 'ignore': {
            require_post(); require_admin();
            as_db()->prepare("UPDATE emails SET status = 'ignored' WHERE id = ? AND status != 'sent'")->execute([id_in(input())]);
            out(['ok' => true]);
        }
        case 'revise': {
            require_post(); require_admin();
            $in = input();
            $ins = trim((string) ($in['instruction'] ?? ''));
            if ($ins === '' || mb_strlen($ins) > 2000) throw new AsError('bad_instruction', 422);
            out(['ok' => true] + as_revise(id_in($in), $ins, (string) ($in['reply'] ?? '')));
        }
        case 'redraft': {
            require_post(); require_admin();
            $id = id_in(input());
            as_draft($id);
            out(['ok' => true, 'email' => as_public(as_get($id), true)]);
        }
        case 'poll': {
            require_post(); require_admin();
            $r = as_poll();
            as_meta('last_poll', (string) time());
            out(['ok' => true] + $r);
        }
        default:
            throw new AsError('unknown_action', 404);
    }
} catch (AsError $e) {
    out(['ok' => false, 'error' => $e->code_str, 'detail' => $e->getMessage() !== $e->code_str ? $e->getMessage() : null], $e->http);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'server_error', 'detail' => mb_substr(get_class($e) . ': ' . $e->getMessage(), 0, 300)], 500);
}
