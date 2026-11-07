"""Resident, private whisper.cpp process. Audio conversion only, no HR authority."""
import atexit
import ctypes
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise urllib.error.URLError('Native STT redirects are forbidden')


class ChildJob:
    """Windows closes this handle on worker death and terminates native children."""
    def __init__(self, process):
        self.handle = None
        if os.name != 'nt':
            return
        from ctypes import wintypes
        class BasicLimits(ctypes.Structure):
            _fields_ = [('process_time', ctypes.c_int64), ('job_time', ctypes.c_int64), ('flags', wintypes.DWORD),
                        ('min_ws', ctypes.c_size_t), ('max_ws', ctypes.c_size_t), ('active', wintypes.DWORD),
                        ('affinity', ctypes.c_size_t), ('priority', wintypes.DWORD), ('scheduling', wintypes.DWORD)]
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in ['read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes']]
        class Limits(ctypes.Structure):
            _fields_ = [('basic', BasicLimits), ('io', IO), ('process_memory', ctypes.c_size_t), ('job_memory', ctypes.c_size_t),
                        ('peak_process_memory', ctypes.c_size_t), ('peak_job_memory', ctypes.c_size_t)]
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        self.kernel.SetInformationJobObject.restype = wintypes.BOOL
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        limits = Limits(); limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.handle or not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) \
                or not self.kernel.AssignProcessToJobObject(self.handle, wintypes.HANDLE(int(process._handle))):
            self.close()
            raise RuntimeError('Cannot isolate native speech process')

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


class ResidentWhisper:
    def __init__(self, executable: Path, model: Path, threads=4):
        if not isinstance(threads, int) or not 1 <= threads <= min(8, os.cpu_count() or 1):
            raise ValueError('Invalid local STT thread count')
        self.ready = False
        self.job = None
        self.threads = threads
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with socket.socket() as reserved:
            reserved.bind(('127.0.0.1', 0))
            port = reserved.getsockname()[1]
        # Native server has no auth middleware. Keep its prefix unpredictable,
        # private to this worker, with no URL or native transcript logs.
        prefix = '/' + secrets.token_urlsafe(32)
        self.base = f'http://127.0.0.1:{port}{prefix}'
        public = model.parent.parent / 'empty-public'
        public.mkdir(exist_ok=True)
        started = time.perf_counter()
        self.process = subprocess.Popen([str(executable), '-m', str(model), '-t', str(threads), '-ng', '-l', 'auto',
            '-nt', '-bs', '5', '-bo', '5', '--host', '127.0.0.1', '--port', str(port),
            '--request-path', prefix, '--public', str(public)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            self.job = ChildJob(self.process)
            while time.perf_counter() - started < 15:
                if self.process.poll() is not None:
                    raise RuntimeError('Native STT process exited')
                try:
                    with self.http.open(self.base + '/health', timeout=0.25) as response:
                        if response.status == 200:
                            self.startup_ms = round((time.perf_counter() - started) * 1000, 1)
                            self.ready = True
                            atexit.register(self.close)
                            return
                except (OSError, urllib.error.URLError):
                    time.sleep(0.05)
            raise TimeoutError('Native STT startup timeout')
        except BaseException:
            self.close()
            raise

    def available(self):
        return self.ready and self.process.poll() is None

    def transcribe(self, wav: bytes):
        if not self.available():
            raise RuntimeError('Resident STT unavailable')
        boundary = secrets.token_hex(16)
        # Plain JSON avoids verbose_json's additional language-probability
        # encoder pass. Disable word timestamps; preserve auto language/decoding.
        fields = {'response_format': 'json', 'no_language_probabilities': 'true', 'token_timestamps': 'false'}
        chunks = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
                  for name, value in fields.items()]
        chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode(),
                   wav, f'\r\n--{boundary}--\r\n'.encode()]
        request = urllib.request.Request(self.base + '/inference', b''.join(chunks),
                                         {'Content-Type': 'multipart/form-data; boundary=' + boundary})
        started = time.perf_counter()
        try:
            with self.http.open(request, timeout=40) as response:
                result = json.load(response)
            text = result.get('text')
            if not isinstance(text, str):
                raise RuntimeError('Invalid STT response')
            return text.strip(), round((time.perf_counter() - started) * 1000, 1)
        except (TimeoutError, OSError):
            # No hidden retries and no orphaned long-running inference after a
            # timeout. Readiness becomes false until the worker is restarted.
            self.close()
            raise

    def close(self):
        self.ready = False
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=5)
        if self.job:
            self.job.close()
