"""Synthetic-only STT profiling; never captures a microphone or calls HR APIs."""
import argparse
import array
import ctypes
import io
import json
import os
from pathlib import Path
import re
import secrets
import socket
import statistics
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
import wave

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[2] / '.local-voice'
BIN = next((ROOT / 'bin').rglob('whisper-cli.exe')).parent
CASES = [
    ('arabic', 'ورجيني رصيد إجازاتي', 'ar'),
    ('jordanian', 'قديش ضايل إلي إجازات؟', 'ar'),
    ('english', 'Show my attendance this month', 'en'),
    ('mixed', 'ورجيني attendance تبعي هالشهر', 'ar'),
]


def cpu_seconds(process):
    if os.name != 'nt':
        return None
    from ctypes import wintypes
    times = [wintypes.FILETIME() for _ in range(4)]
    function = ctypes.windll.kernel32.GetProcessTimes
    function.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
    if not function(process._handle, *[ctypes.byref(value) for value in times]):
        return None
    return sum((value.dwHighDateTime << 32) + value.dwLowDateTime for value in times[2:]) / 1e7


def normalize(text):
    text = ''.join(ch for ch in unicodedata.normalize('NFKD', text.lower()) if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^\w\s]', '', text).split()


def wer(reference, hypothesis):
    reference, hypothesis = normalize(reference), normalize(hypothesis)
    previous = list(range(len(hypothesis) + 1))
    for i, word in enumerate(reference):
        current = [i + 1]
        for j, actual in enumerate(hypothesis):
            current.append(min(current[-1] + 1, previous[j + 1] + 1, previous[j] + (word != actual)))
        previous = current
    return round(previous[-1] / max(1, len(reference)), 3)


def clips():
    folder = ROOT / 'profile-clips'
    folder.mkdir(exist_ok=True)
    from piper import PiperVoice
    voices = {lang: PiperVoice.load(ROOT / 'models' / (name + '.onnx'), use_cuda=False)
              for lang, name in [('ar', 'ar_JO-kareem-low'), ('en', 'en_US-lessac-low')]}
    results = []
    for name, text, lang in CASES:
        target = folder / (name + '.wav')
        conversion = 0
        if not target.exists():
            # Mixed source speech uses each language's own voice, rather than
            # asking the Arabic voice to invent English pronunciation.
            pieces = re.split(r'([A-Za-z]+(?:\s+[A-Za-z]+)*)', text) if name == 'mixed' else [text]
            samples = array.array('h')
            for piece in pieces:
                if not piece.strip():
                    continue
                selected = 'en' if re.search('[A-Za-z]', piece) else lang
                buffer = io.BytesIO()
                with wave.open(buffer, 'wb') as output:
                    voices[selected].synthesize_wav(piece, output)
                started = time.perf_counter()
                with wave.open(io.BytesIO(buffer.getvalue()), 'rb') as source:
                    rate = source.getframerate()
                    raw = array.array('h', source.readframes(source.getnframes()))
                samples.extend(raw[min(len(raw) - 1, int(i * rate / 16000))] for i in range(int(len(raw) * 16000 / rate)))
                conversion += (time.perf_counter() - started) * 1000
            with wave.open(str(target), 'wb') as output:
                output.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
                output.writeframes(samples.tobytes())
        with wave.open(str(target), 'rb') as source:
            duration = source.getnframes() / source.getframerate()
        results.append((name, text, lang, target, duration, round(conversion, 2)))
    return results


def multipart(data, fields):
    boundary = secrets.token_hex(16)
    chunks = []
    for name, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode(), data, f'\r\n--{boundary}--\r\n'.encode()]
    return b''.join(chunks), 'multipart/form-data; boundary=' + boundary


class NativeServer:
    def __init__(self, model, threads=4, beam=5, extra=()):
        with socket.socket() as socket_:
            socket_.bind(('127.0.0.1', 0))
            port = socket_.getsockname()[1]
        self.base = f'http://127.0.0.1:{port}/' + secrets.token_hex(24)
        self.started = time.perf_counter()
        self.process = subprocess.Popen([str(BIN / 'whisper-server.exe'), '-m', str(ROOT / 'models' / model),
            '-t', str(threads), '-ng', '-l', 'auto', '-nt', '-bs', str(beam), '-bo', str(beam),
            '--host', '127.0.0.1', '--port', str(port), '--request-path', self.base.split(str(port))[1],
            '--public', str(ROOT / 'empty-public'), *extra], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            while time.perf_counter() - self.started < 15:
                if self.process.poll() is not None:
                    raise RuntimeError('Native STT server failed to start')
                try:
                    with urllib.request.urlopen(self.base + '/health', timeout=0.3) as response:
                        if response.status == 200:
                            self.startup_ms = (time.perf_counter() - self.started) * 1000
                            return
                except (OSError, urllib.error.URLError):
                    time.sleep(0.05)
            raise TimeoutError('Native STT startup timeout')
        except BaseException:
            self.close()
            raise

    def transcribe(self, data, fields=None):
        # verbose_json computes language probabilities with an extra encoder
        # pass in this pinned build. Plain JSON avoids duplicate transcription work.
        body, content_type = multipart(data, {'response_format': 'json', 'no_language_probabilities': 'true', **(fields or {})})
        before = cpu_seconds(self.process)
        started = time.perf_counter()
        request = urllib.request.Request(self.base + '/inference', body, {'Content-Type': content_type})
        with urllib.request.urlopen(request, timeout=40) as response:
            result = json.load(response)
        elapsed = (time.perf_counter() - started) * 1000
        after = cpu_seconds(self.process)
        return result.get('text', '').strip(), elapsed, None if before is None else after - before

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=5)


def run(args):
    audio = clips()
    rows = []
    path = ROOT / ('stt-profile-' + args.phase + '.json')
    def save(row):
        rows.append(row)
        path.write_text(json.dumps({'syntheticOnly': True, 'physicalMicrophone': False, 'rows': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(row, ensure_ascii=False), flush=True)
    if args.phase == 'baseline':
        starts = []
        for _ in range(3):
            started = time.perf_counter()
            subprocess.run([str(BIN / 'whisper-cli.exe'), '--help'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            starts.append((time.perf_counter() - started) * 1000)
        for name, text, lang, clip, duration, conversion in audio:
            with tempfile.TemporaryDirectory(prefix='hr-stt-profile-') as directory:
                output = str(Path(directory) / 'output')
                started = time.perf_counter()
                process = subprocess.Popen([str(BIN / 'whisper-cli.exe'), '-m', str(ROOT / 'models' / 'ggml-small-q5_1.bin'),
                    '-f', str(clip), '-l', 'auto', '-t', '4', '-ng', '-nt', '-oj', '-of', output],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                try:
                    _, errors = process.communicate(timeout=45)
                except subprocess.TimeoutExpired:
                    process.kill(); process.communicate()
                    save({'case': name, 'timeout': True, 'totalMs': round((time.perf_counter() - started) * 1000)})
                    continue
                total = (time.perf_counter() - started) * 1000
                cpu = cpu_seconds(process)
                metrics = {label.strip(): float(number) for label, number in re.findall(r'whisper_print_timings:\s+([a-z ]+?)\s*=\s*([\d.]+) ms', errors.decode(errors='replace'))}
                runs = {label.strip(): int(number) for label, number in re.findall(r'whisper_print_timings:\s+([a-z ]+?)\s*=\s*[\d.]+ ms /\s*(\d+) runs', errors.decode(errors='replace'))}
                data = json.loads(Path(output + '.json').read_text(encoding='utf-8'))
                transcript = ''.join(segment['text'] for segment in data.get('transcription', [])).strip()
                save({'case': name, 'model': 'small-q5_1', 'mode': 'one-shot', 'threads': 4, 'audioSeconds': round(duration, 3),
                    'wavConversionMs': conversion, 'processHelpMedianMs': round(statistics.median(starts), 2),
                    'timingsMs': metrics, 'runs': runs, 'totalMs': round(total, 1), 'cpuSeconds': cpu,
                    'machineCpuPercent': round((cpu or 0) / (total / 1000) / os.cpu_count() * 100, 1),
                    'transcript': transcript, 'wordErrorRate': wer(text, transcript)})
    elif args.phase == 'fast':
        import numpy as np
        from faster_whisper import WhisperModel
        os.environ['HF_HUB_OFFLINE'] = '1'
        started = time.perf_counter()
        model = WhisperModel(str(ROOT / 'models' / 'faster-whisper-small'), device='cpu', compute_type='int8',
                             cpu_threads=4, num_workers=1, local_files_only=True)
        load_ms = (time.perf_counter() - started) * 1000
        for name, text, lang, clip, duration, conversion in audio:
            with wave.open(str(clip), 'rb') as source:
                pcm = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16).astype(np.float32) / 32768
            started = time.perf_counter(); cpu_started = time.process_time()
            segments, info = model.transcribe(pcm, beam_size=5, best_of=5, language=None, task='transcribe',
                                              condition_on_previous_text=False, word_timestamps=False, vad_filter=False)
            transcript = ''.join(segment.text for segment in segments).strip()
            elapsed = (time.perf_counter() - started) * 1000
            cpu = time.process_time() - cpu_started
            save({'case': name, 'model': 'small multilingual / CTranslate2 int8', 'mode': 'persistent', 'threads': 4,
                  'modelStartupMs': round(load_ms, 1), 'audioSeconds': round(duration, 3), 'totalMs': round(elapsed, 1),
                  'cpuSeconds': cpu, 'machineCpuPercent': round(cpu / (elapsed / 1000) / os.cpu_count() * 100, 1),
                  'detectedLanguage': info.language, 'languageProbability': round(info.language_probability, 3),
                  'transcript': transcript, 'wordErrorRate': wer(text, transcript)})
    else:
        configs = [('ggml-small-q5_1.bin', 4, 5, ())]
        if args.phase == 'optimize':
            configs = [('ggml-small-q5_1.bin', threads, beam, extra) for threads, beam, extra in
                       [(4, 1, ()), (2, 1, ()), (8, 1, ()), (4, 5, ('-ac', '384'))]]
        if args.phase == 'models':
            configs = [(model, 4, 5, ()) for model in ['ggml-base-q5_1.bin', 'ggml-base.bin', 'ggml-tiny.bin'] if (ROOT / 'models' / model).exists()]
        if args.phase == 'hints':
            configs = [('ggml-small-q5_1.bin', 4, 5, ('-ac', '384'))]
        for model, threads, beam, extra in configs:
            server = NativeServer(model, threads, beam, extra)
            try:
                for name, text, lang, clip, duration, conversion in audio:
                    if args.phase == 'optimize' and name not in ['arabic', 'english']:
                        continue
                    try:
                        fields = {'language': lang} if args.phase == 'hints' else None
                        transcript, elapsed, cpu = server.transcribe(clip.read_bytes(), fields)
                        save({'case': name, 'model': model, 'mode': 'persistent', 'threads': threads, 'beam': beam, 'extra': extra,
                            'modelStartupMs': round(server.startup_ms, 1), 'audioSeconds': round(duration, 3), 'totalMs': round(elapsed, 1),
                            'cpuSeconds': cpu, 'machineCpuPercent': round((cpu or 0) / (elapsed / 1000) / os.cpu_count() * 100, 1),
                            'transcript': transcript, 'wordErrorRate': wer(text, transcript)})
                    except Exception as error:
                        save({'case': name, 'model': model, 'threads': threads, 'beam': beam, 'extra': extra, 'error': type(error).__name__})
            finally:
                server.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['baseline', 'persistent', 'optimize', 'models', 'hints', 'fast'], default='baseline')
    run(parser.parse_args())
