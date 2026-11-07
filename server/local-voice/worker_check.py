"""Real loopback HTTP concurrency checks with fake speech engines; no HR/audio model."""
import http.client
import importlib.util
import io
import json
from pathlib import Path
import socket
import sys
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

sys.path.insert(0, str(Path(__file__).resolve().parent))


class Voice:
    @staticmethod
    def load(*_args, **_kwargs):
        return Voice()

    def synthesize_wav(self, _text, output):
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
        output.writeframes(b'\x01\x00' * 3200)


spec = importlib.util.spec_from_file_location('isolated_voice_worker_check', Path(__file__).with_name('worker.py'))
worker = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'piper': SimpleNamespace(PiperVoice=Voice)}):
    spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.started = threading.Event(); self.release = threading.Event(); self.body_read = threading.Event()
        worker.stt = SimpleNamespace(available=lambda: True, threads=4, transcribe=self.transcribe)
        body_read = self.body_read

        class ObservedReader:
            def __init__(self, source): self.source = source
            def __getattr__(self, name): return getattr(self.source, name)
            def read(self, length): body_read.set(); return self.source.read(length)

        class Handler(worker.Handler):
            def setup(self): super().setup(); self.rfile = ObservedReader(self.rfile)

        self.server = worker.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()

    def tearDown(self):
        self.release.set(); self.server.shutdown(); self.server.server_close(); self.thread.join(timeout=3)

    def transcribe(self, _wav):
        self.started.set()
        if not self.release.wait(3): raise TimeoutError('Synthetic gate timeout')
        return 'Synthetic transcription', 1

    def request(self, path, body=None, kind='application/json'):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        try:
            connection.request('GET' if body is None else 'POST', path, body, {'Authorization': 'Bearer ' + worker.TOKEN, 'Content-Type': kind})
            response = connection.getresponse(); data = response.read()
            return response.status, json.loads(data) if response.headers.get_content_type() == 'application/json' else data
        finally: connection.close()

    def test_busy_health_and_slot_release(self):
        audio = io.BytesIO()
        with wave.open(audio, 'wb') as out:
            out.setnchannels(1); out.setsampwidth(2); out.setframerate(16000); out.writeframes(b'\x01\x00' * 3200)
        results = []
        task = threading.Thread(target=lambda: results.append(self.request('/stt', audio.getvalue(), 'audio/wav')))
        task.start()
        try:
            self.assertTrue(self.started.wait(1))
            status, health = self.request('/health')
            self.assertEqual(status, 200); self.assertTrue(health['busy']); self.assertEqual(health['operation'], 'stt')
            self.assertGreaterEqual(health['operationMs'], 0)
            status, _ = self.request('/tts', b'{"text":"Synthetic","lang":"en"}')
            self.assertEqual(status, 429, 'Worker stays single-operation; backend admission must wait')
        finally: self.release.set(); task.join(timeout=3)
        self.assertEqual(results[0][0], 200)
        status, health = self.request('/health')
        self.assertEqual(status, 200); self.assertFalse(health['busy']); self.assertIsNone(health['operation'])
        self.assertEqual(self.request('/tts', b'{"text":"Synthetic","lang":"en"}')[0], 200)

    def test_partial_upload_never_locks_inference(self):
        client = socket.create_connection(('127.0.0.1', self.port), timeout=3)
        try:
            headers = f'POST /tts HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {worker.TOKEN}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n'
            client.sendall(headers.encode() + b'{')
            self.assertTrue(self.body_read.wait(1))
            self.assertFalse(self.request('/health')[1]['busy'])
            self.assertEqual(self.request('/tts', b'{"text":"Synthetic","lang":"en"}')[0], 200)
        finally: client.close()


if __name__ == '__main__': unittest.main()
