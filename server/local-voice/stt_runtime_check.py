"""Offline resident STT lifecycle/transport tests; no models, HR or network."""
from pathlib import Path
import socket
import unittest
from unittest.mock import MagicMock, patch
from stt_runtime import ResidentWhisper


def response(data):
    result = MagicMock()
    result.status = 200
    result.read.return_value = data
    result.__enter__.return_value = result
    return result


class ResidentTests(unittest.TestCase):
    def setUp(self):
        self.process = MagicMock()
        self.process.poll.return_value = None
        self.process.wait.return_value = 0
        self.patches = [patch('stt_runtime.subprocess.Popen', return_value=self.process),
                        patch('stt_runtime.ChildJob'), patch('stt_runtime.atexit.register'),
                        patch('stt_runtime.urllib.request.build_opener'), patch('pathlib.Path.mkdir')]
        self.spawn, self.job, _, self.opener, _ = [item.start() for item in self.patches]
        self.request = self.opener.return_value.open
        self.request.return_value = response(b'{"status":"ok"}')

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()

    def runtime(self):
        return ResidentWhisper(Path('whisper-server.exe'), Path('models/model.bin'), 4)

    def test_resident_context_and_private_memory_transport(self):
        runtime = self.runtime()
        self.request.return_value = response('{"text":" مرحبا "}'.encode())
        self.assertEqual(runtime.transcribe(b'synthetic-wav')[0], 'مرحبا')
        self.assertEqual(runtime.transcribe(b'synthetic-wav')[0], 'مرحبا')
        self.assertEqual(self.spawn.call_count, 1, 'Do not reload/start a process for each turn')
        argv = self.spawn.call_args.args[0]
        self.assertNotIn('--convert', argv, 'Do not re-encode or write audio files')
        self.assertEqual(argv[argv.index('--host') + 1], '127.0.0.1')
        prefix = argv[argv.index('--request-path') + 1]
        self.assertGreater(len(prefix), 40)
        request = self.request.call_args.args[0]
        self.assertIn(prefix + '/inference', request.full_url)
        self.assertIn(b'no_language_probabilities', request.data)
        self.assertNotIn(b'verbose_json', request.data)
        self.assertNotIn(b'OPENAI', request.data)
        self.assertEqual(self.request.call_args.kwargs['timeout'], 40)
        handlers = self.opener.call_args.args
        self.assertEqual(handlers[0].proxies, {})
        with self.assertRaises(OSError):
            handlers[1].redirect_request(None, None, 307, 'redirect', {}, 'https://example.invalid')
        runtime.close()
        self.process.kill.assert_called_once()
        self.job.return_value.close.assert_called_once()

    def test_timeout_stops_native_work_and_does_not_retry(self):
        runtime = self.runtime()
        self.request.side_effect = socket.timeout('timeout')
        with self.assertRaises(TimeoutError):
            runtime.transcribe(b'synthetic-wav')
        self.assertFalse(runtime.available())
        self.assertEqual(self.spawn.call_count, 1)
        self.process.kill.assert_called_once()

    def test_isolation_failure_cleans_up(self):
        self.job.side_effect = RuntimeError('job unavailable')
        with self.assertRaises(RuntimeError):
            self.runtime()
        self.process.kill.assert_called_once()


if __name__ == '__main__':
    unittest.main()
