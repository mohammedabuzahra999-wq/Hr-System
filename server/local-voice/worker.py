"""Loopback-only audio conversion worker. No HR, database or cloud integrations."""
import hmac
import io
import json
import os
from pathlib import Path
import secrets
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from stt_runtime import ResidentWhisper

ROOT = Path(__file__).resolve().parents[2] / '.local-voice'
MODELS = ROOT / 'models'
STT_MODEL = MODELS / os.environ.get('LOCAL_STT_MODEL', 'ggml-small-q5_1.bin')
WHISPER = next((ROOT / 'bin').rglob('whisper-server.exe'), ROOT / 'bin' / 'whisper-server.exe')
stt = None
VOICES = {'ar': os.environ.get('LOCAL_TTS_AR_VOICE', 'ar_JO-kareem-low'),
          'en': os.environ.get('LOCAL_TTS_EN_VOICE', 'en_US-lessac-low')}
TOKEN = secrets.token_urlsafe(32)
ROOT.mkdir(exist_ok=True)
token_file = ROOT / 'worker.token'
busy = threading.BoundedSemaphore(1)
active_lock = threading.Lock()
active_operation = None
active_started = 0
voices = {}
try:
    from piper import PiperVoice
    for lang, name in VOICES.items():
        voices[lang] = PiperVoice.load(MODELS / (name + '.onnx'), use_cuda=False, download_dir=MODELS)
except Exception:
    print('[local-voice] TTS initialization failed; run the setup command', flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log audio, transcripts, text, credentials or request bodies.

    def reply(self, status, body, content_type='application/json', **headers):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8') if content_type == 'application/json' else body
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        for key, value in headers.items():
            self.send_header(key.replace('_', '-'), str(value))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN)

    def do_GET(self):
        if not self.authorized():
            return self.reply(401, {'error': 'unauthorized'})
        if self.path != '/health':
            return self.reply(404, {'error': 'notFound'})
        with active_lock:
            status = {'busy': active_operation is not None, 'operation': active_operation,
                      'operationMs': round((time.perf_counter() - active_started) * 1000, 1) if active_operation else 0}
        self.reply(200, {'stt': {'engine': 'whisper.cpp', 'model': STT_MODEL.name,
                                'ready': bool(stt and stt.available())},
                         'tts': {'engine': 'Piper', 'voices': VOICES, 'ready': len(voices) == 2}, **status})

    def do_POST(self):
        global active_operation, active_started
        if not self.authorized():
            return self.reply(401, {'error': 'unauthorized'})
        if self.path not in ['/stt', '/tts']:
            return self.reply(404, {'error': 'notFound'})
        # An interrupted/incomplete upload must not hold the inference slot.
        self.connection.settimeout(5)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 960_044:
                return self.reply(413, {'error': 'localVoiceInvalidAudio'})
            body = self.rfile.read(length)
            if len(body) != length:
                return self.reply(400, {'error': 'localVoiceInvalidAudio'})
        except (ValueError, TimeoutError, OSError):
            return
        with active_lock:
            acquired = busy.acquire(blocking=False)
            if acquired:
                active_operation = self.path[1:]
                active_started = time.perf_counter()
        if not acquired:
            return self.reply(429, {'error': 'localVoiceBusy'})
        try:
            started = time.perf_counter()
            if self.path == '/stt':
                if self.headers.get_content_type() != 'audio/wav':
                    return self.reply(415, {'error': 'localVoiceInvalidAudio'})
                with wave.open(io.BytesIO(body), 'rb') as audio:
                    if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                        return self.reply(422, {'error': 'localVoiceInvalidAudio'})
                    if not 3200 <= audio.getnframes() <= 480_000:
                        return self.reply(422, {'error': 'localVoiceInvalidAudio'})
                    if not any(audio.readframes(audio.getnframes())):
                        return self.reply(422, {'error': 'localVoiceNoSpeech'})
                    audio_duration_ms = audio.getnframes() / 16
                if not stt or not stt.available():
                    return self.reply(503, {'error': 'localVoiceUnavailable'})
                # Existing WAV is forwarded in memory to one resident native
                # context. No per-turn process, reload, resample or audio file.
                text, inference_ms = stt.transcribe(body)
                if len(text) < 2 or len(text) > 500:
                    return self.reply(422, {'error': 'localVoiceNoSpeech'})
                return self.reply(200, {'transcript': text, 'sttMs': round((time.perf_counter() - started) * 1000, 1),
                    'profile': {'audioMs': round(audio_duration_ms, 1), 'inferenceMs': inference_ms,
                                'modelLoadMs': 0, 'processStartupMs': 0, 'queueMs': 0, 'threads': stt.threads}})
            if self.path == '/tts':
                if self.headers.get_content_type() != 'application/json':
                    return self.reply(415, {'error': 'localVoiceUnavailable'})
                payload = json.loads(body)
                text, lang = payload.get('text'), payload.get('lang')
                if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500 or lang not in voices:
                    return self.reply(422, {'error': 'localVoiceUnavailable'})
                output = io.BytesIO()
                with wave.open(output, 'wb') as audio:
                    voices[lang].synthesize_wav(text, audio)
                return self.reply(200, output.getvalue(), 'audio/wav', X_TTS_MS=round((time.perf_counter() - started) * 1000, 1))
            self.reply(404, {'error': 'notFound'})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.reply(503, {'error': 'localVoiceUnavailable'})
        finally:
            with active_lock:
                active_operation = None
                busy.release()


if __name__ == '__main__':
    port = int(os.environ.get('LOCAL_VOICE_PORT', '8766'))
    # Bind first: accidentally starting a second worker must not invalidate the
    # token belonging to the worker that is already serving requests.
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    try:
        stt = ResidentWhisper(WHISPER, STT_MODEL, threads=int(os.environ.get('LOCAL_STT_THREADS', '4')))
        print('[local-voice] resident STT model ready; 4 CPU threads by default', flush=True)
    except Exception:
        print('[local-voice] resident STT unavailable; check setup/model configuration', flush=True)
    token_file.write_text(TOKEN, encoding='utf-8')
    token_file.chmod(0o600)
    print(f'[local-voice] loopback CPU worker listening on 127.0.0.1:{port}', flush=True)
    try:
        server.serve_forever()
    finally:
        if stt:
            stt.close()
