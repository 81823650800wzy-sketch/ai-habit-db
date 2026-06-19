"""
AI Habit DB — 后端 API 服务
核心功能：剪切板监听、文件记录、项目跟踪、应用统计
"""

import os
import re
import json
import time
import hashlib
import subprocess
import threading
import argparse
from copy import deepcopy
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

IMPORT_ERROR = None
try:
    from flask import Flask, jsonify, request
    from flask_cors import CORS
    HAS_FLASK = True
except ImportError as exc:
    IMPORT_ERROR = exc
    HAS_FLASK = False

try:
    from storage.models import (
        init_db, SmartWindowRecord, WindowSwitchEvent,
        SmartClipboardRecord, InputStats
    )
except ImportError as exc:
    try:
        from backend.storage.models import (
            init_db, SmartWindowRecord, WindowSwitchEvent,
            SmartClipboardRecord, InputStats
        )
    except ImportError:
        IMPORT_ERROR = exc
        HAS_FLASK = False

# Windows API
try:
    import win32gui
    import win32con
    import win32api
    import win32clipboard
    import win32process
    import psutil
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

try:
    import pyperclip
    HAS_PYPERCLIP = True
except ImportError:
    HAS_PYPERCLIP = False


# ==================== 设置与隐私边界 ====================

class SettingsStore:
    """PowerToys 风格的模块开关：敏感采集默认关闭，用户显式开启。"""

    DEFAULTS = {
        "modules": {
            "clipboard": False,
            "windowTracking": False,
            "appUsage": False,
        },
        "privacy": {
            "localOnly": True,
            "filterSensitiveClipboard": True,
            "retentionDays": 30,
            "maxClipboardChars": 5000,
        },
    }

    def __init__(self, path):
        self.path = Path(path).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._settings = self._load()

    def _load(self):
        if not self.path.exists():
            self._write(self.DEFAULTS)
            return deepcopy(self.DEFAULTS)

        try:
            with self.path.open("r", encoding="utf-8") as f:
                raw = json.load(f)
            return self._merge(self.DEFAULTS, raw)
        except Exception:
            return deepcopy(self.DEFAULTS)

    def _write(self, value):
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=2)

    def _merge(self, base, patch):
        result = deepcopy(base)
        for key, value in (patch or {}).items():
            if isinstance(value, dict) and isinstance(result.get(key), dict):
                result[key] = self._merge(result[key], value)
            else:
                result[key] = value
        return result

    def get(self):
        with self._lock:
            return deepcopy(self._settings)

    def update(self, patch):
        with self._lock:
            self._settings = self._merge(self._settings, patch or {})
            self._write(self._settings)
            return deepcopy(self._settings)

    def module_enabled(self, name):
        return bool(self.get().get("modules", {}).get(name, False))


def looks_sensitive(content):
    if not content:
        return False

    patterns = [
        r"-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----",
        r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[:=]\s*[\"']?[\w\-./+=]{8,}",
        r"(?i)\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})",
    ]
    return any(re.search(pattern, content) for pattern in patterns)


def is_safe_process_name(name):
    """检查进程名是否安全 - 支持各种程序类型"""
    if not name or len(name) > 256:
        return False
    # 允许路径形式的程序名
    if re.match(r'^[A-Za-z]:\\', name) or name.startswith('~'):
        return os.path.exists(os.path.expanduser(name))
    # 允许命令行工具 (python, node, git 等)
    if re.match(r'^[\w][\w\-. ]*$', name):
        return True
    # 允许带参数的命令
    if re.match(r'^[\w][\w\-. ]*(\s+[\w\-./]+)*$', name):
        return True
    return False


# ==================== 剪切板监听器 ====================

class ClipboardMonitor:
    """实时监听系统剪切板"""

    def __init__(self, db_factory, settings):
        self.db_factory = db_factory
        self.settings = settings
        self.running = False
        self._last = None
        self._thread = None

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[Clipboard] 监听器已启动")

    def _loop(self):
        while self.running:
            try:
                if not self.settings.module_enabled("clipboard"):
                    time.sleep(1)
                    continue

                content = self._get()
                if content and content.strip() and content != self._last:
                    self._last = content
                    self._save(content)
            except:
                pass
            time.sleep(0.5)

    def _get(self):
        if HAS_PYPERCLIP:
            try:
                return pyperclip.paste()
            except:
                pass
        if HAS_WIN32:
            try:
                win32clipboard.OpenClipboard()
                try:
                    return win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT)
                except:
                    return None
                finally:
                    win32clipboard.CloseClipboard()
            except:
                pass
        return None

    def _save(self, content):
        if not content or len(content.strip()) < 2:
            return

        privacy = self.settings.get().get("privacy", {})
        if privacy.get("filterSensitiveClipboard", True) and looks_sensitive(content):
            print("[Clipboard] 跳过疑似敏感内容")
            return

        content_type = self._classify(content)
        language = self._detect_lang(content)
        is_code = content_type == 'code' or language is not None
        max_chars = int(privacy.get("maxClipboardChars", 5000))

        session = self.db_factory()
        try:
            record = SmartClipboardRecord(
                content=content[:max_chars],
                content_type=content_type,
                content_hash=hashlib.sha256(content.encode("utf-8", errors="ignore")).hexdigest(),
                char_count=len(content),
                language=language,
                domain=self._extract_domain(content) if content_type == 'url' else None,
                is_code=is_code,
                timestamp=datetime.now()
            )
            session.add(record)
            session.commit()
            print(f"[Clipboard] 捕获: {content_type} ({len(content)} 字符)")
        except Exception as e:
            session.rollback()
        finally:
            session.close()

    def _classify(self, content):
        content = content.strip()

        # 图片 URL
        if re.search(r'\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff)(\?.*)?$', content, re.IGNORECASE):
            return 'image'

        # URL
        if content.startswith(('http://', 'https://')):
            return 'url'

        # 本地文件路径
        if re.match(r'^[A-Z]:\\|^/~|^/', content):
            # 图片文件
            if re.search(r'\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff)$', content, re.IGNORECASE):
                return 'image'
            # 其他文件
            if re.search(r'\.\w{1,10}$', content):
                return 'file'
            return 'path'

        # 代码
        if self._looks_like_code(content):
            return 'code'

        return 'text'

    def _looks_like_code(self, text):
        import re
        indicators = [
            r'^(def|class|function|const|let|var|import|from|if|for|while)\s',
            r'[{}\[\]();]',
            r'^\s*(//|#|/\*|\*)',
            r'=>',
            r'\breturn\b',
            r'\bprint\s*\(',
            r'\bconsole\.log',
        ]
        return any(re.search(p, text, re.MULTILINE) for p in indicators)

    def _detect_lang(self, text):
        import re
        patterns = [
            (r'\bdef\s+\w+\s*\(', 'Python'),
            (r'\bimport\s+\w+', 'Python'),
            (r'\bprint\s*\(', 'Python'),
            (r'\bfunction\s+\w+', 'JavaScript'),
            (r'\b(const|let|var)\s+\w+\s*=', 'JavaScript'),
            (r'\bconsole\.log', 'JavaScript'),
            (r'#include\s*<', 'C++'),
            (r'\bfn\s+\w+', 'Rust'),
        ]
        for p, lang in patterns:
            if re.search(p, text):
                return lang
        return None

    def _extract_domain(self, url):
        import re
        m = re.search(r'https?://([^/]+)', url)
        return m.group(1) if m else None


# ==================== 窗口跟踪器 ====================

class WindowTracker:
    """跟踪活动窗口，记录文件和项目"""

    def __init__(self, db_factory, settings):
        self.db_factory = db_factory
        self.settings = settings
        self.running = False
        self._current = None
        self._current_title = ""
        self._current_process = "unknown"
        self._start = None
        self._thread = None

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[Window] 跟踪器已启动")

    def _loop(self):
        while self.running:
            try:
                if not (self.settings.module_enabled("windowTracking") or self.settings.module_enabled("appUsage")):
                    self._save_current()
                    time.sleep(1)
                    continue

                self._track()
            except:
                pass
            time.sleep(1)

    def _track(self):
        if not HAS_WIN32:
            return

        try:
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            if not title:
                return

            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            try:
                proc = psutil.Process(pid)
                process_name = proc.name()
                process_path = proc.exe()
            except:
                process_name = "unknown"
                process_path = ""

            collect_titles = self.settings.module_enabled("windowTracking")
            observed_key = f"{process_name}|{title if collect_titles else ''}"

            # 窗口/进程切换检测。只开应用统计时不保存窗口标题。
            if observed_key != self._current:
                self._save_current()
                self._current = observed_key
                self._current_title = title if collect_titles else ""
                self._current_process = process_name
                self._start = datetime.now()

                if collect_titles:
                    self._record_switch(title, process_name, process_path)

        except:
            pass

    def _save_current(self):
        if not self._current or not self._start:
            return

        duration = (datetime.now() - self._start).total_seconds()
        if duration < 1:
            return

        session = self.db_factory()
        try:
            record = SmartWindowRecord(
                window_title=self._current_title or "",
                process_name=self._current_process or "unknown",
                duration_seconds=duration,
                timestamp=self._start
            )
            session.add(record)
            session.commit()
        except:
            session.rollback()
        finally:
            session.close()

        self._current = None
        self._current_title = ""
        self._current_process = "unknown"
        self._start = None

    def _record_switch(self, title, process_name, process_path):
        # 提取项目名
        project = self._extract_project(title, process_name)
        # 提取文件路径
        file_path = self._extract_file_path(title, process_name)

        self._current_process = process_name

        session = self.db_factory()
        try:
            event = WindowSwitchEvent(
                to_window=title[:512],
                to_process=process_name,
                category=self._categorize(process_name),
                project=project,
                language=None,
                domain=None,
                timestamp=datetime.now()
            )
            session.add(event)

            # 如果检测到文件路径，记录到文件表
            if file_path:
                # 这里可以扩展记录文件打开历史
                pass

            session.commit()
        except:
            session.rollback()
        finally:
            session.close()

    def _extract_project(self, title, process):
        """从窗口标题提取项目名"""
        if not title:
            return None

        proc = process.lower()

        # VS Code / Cursor / Codex: "file.py — project - Visual Studio Code"
        if any(x in proc for x in ['code', 'cursor', 'codex']):
            parts = title.split(' — ')
            if len(parts) >= 2:
                right = parts[1]
                for suffix in [' - Visual Studio Code', ' - Cursor', ' - Code', ' - Codex']:
                    if right.endswith(suffix):
                        right = right[:-len(suffix)]
                        break
                project = right.strip()
                if project and len(project) < 50:
                    return project

        # PyCharm / IDEA: "project - PyCharm"
        if any(x in proc for x in ['pycharm', 'idea', 'webstorm', 'phpstorm']):
            parts = title.split(' - ')
            if len(parts) >= 2:
                project = parts[0].strip()
                if project and len(project) < 50:
                    return project

        # 终端: "path - Terminal"
        if any(x in proc for x in ['terminal', 'cmd', 'powershell', 'wt']):
            parts = title.split(' - ')
            if len(parts) >= 2:
                project = parts[0].strip()
                if project and len(project) < 30:
                    return project

        return None

    def _extract_file_path(self, title, process):
        """从窗口标题提取文件路径"""
        if not title:
            return None

        proc = process.lower()

        # VS Code / Codex: "filename.ext — project"
        if any(x in proc for x in ['code', 'cursor', 'codex']):
            parts = title.split(' — ')
            if len(parts) >= 2:
                filename = parts[0].strip()
                if '.' in filename and len(filename) < 100:
                    return filename

        # 记事本: "filename - Notepad"
        if 'notepad' in proc:
            parts = title.split(' - ')
            if len(parts) >= 2:
                filename = parts[0].strip()
                if '.' in filename:
                    return filename

        # 浏览器: 提取URL中的文件名
        if any(x in proc for x in ['chrome', 'edge', 'firefox']):
            # 尝试从标题中提取URL
            import re
            url_match = re.search(r'https?://[^\s]+', title)
            if url_match:
                return url_match.group(0)

        return None

    def _categorize(self, process):
        """识别程序类型 - 支持各种程序"""
        proc = process.lower()

        # IDE / 代码编辑器
        if any(x in proc for x in ['code', 'cursor', 'codex', 'pycharm', 'idea', 'webstorm', 'phpstorm', 'sublime', 'atom', 'notepad++', 'vim', 'nvim']):
            return 'coding'

        # 浏览器
        if any(x in proc for x in ['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'safari']):
            return 'browsing'

        # 终端 / 命令行
        if any(x in proc for x in ['terminal', 'cmd', 'powershell', 'wt', 'conhost', 'mintty', 'git-bash', 'bash', 'zsh']):
            return 'terminal'

        # 通讯
        if any(x in proc for x in ['wechat', 'qq', 'slack', 'discord', 'telegram', 'teams', 'dingtalk', 'feishu']):
            return 'chatting'

        # 办公
        if any(x in proc for x in ['winword', 'excel', 'powerpnt', 'outlook', 'onenote', 'wps', 'notion', 'obsidian']):
            return 'office'

        # 设计
        if any(x in proc for x in ['figma', 'sketch', 'photoshop', 'illustrator', 'xd', 'canva']):
            return 'design'

        # 媒体
        if any(x in proc for x in ['spotify', 'music', 'vlc', 'potplayer', 'kugou', 'netease', 'bilibili']):
            return 'media'

        # 文件管理
        if any(x in proc for x in ['explorer', 'totalcmd', 'everything']):
            return 'filemanager'

        # 开发工具
        if any(x in proc for x in ['git', 'docker', 'postman', 'navicat', 'dbeaver']):
            return 'devtools'

        return 'other'


# ==================== Flask 应用 ====================

def create_app(port=5001):
    if not HAS_FLASK:
        return None

    app = Flask(__name__)
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": ["null"],
                "allow_headers": ["Content-Type", "X-AI-Habit-Token"],
            }
        },
    )

    data_dir = Path(os.environ.get("AI_HABIT_DATA_DIR", "~/.ai-habit-db")).expanduser()
    data_dir.mkdir(parents=True, exist_ok=True)
    settings = SettingsStore(data_dir / "settings.json")
    expected_token = os.environ.get("AI_HABIT_API_TOKEN", "")

    db_path = data_dir / "data" / "habits.db"
    engine, Session = init_db(db_path)
    app.config["AI_HABIT_DB_ENGINE"] = engine

    def get_session():
        return Session()

    @app.before_request
    def require_local_token():
        if request.method == "OPTIONS":
            return None
        if request.path == "/api/health":
            return None
        if request.path.startswith("/api/") and expected_token:
            token = request.headers.get("X-AI-Habit-Token", "")
            if token != expected_token:
                return jsonify({"success": False, "error": "unauthorized"}), 401
        return None

    def cleanup_expired_records():
        retention_days = int(settings.get().get("privacy", {}).get("retentionDays", 30))
        if retention_days <= 0:
            return

        cutoff = datetime.now() - timedelta(days=retention_days)
        sess = get_session()
        try:
            for model in (SmartClipboardRecord, SmartWindowRecord, WindowSwitchEvent):
                sess.query(model).filter(model.timestamp < cutoff).delete(synchronize_session=False)
            sess.commit()
        except Exception:
            sess.rollback()
        finally:
            sess.close()

    cleanup_expired_records()

    # 启动监听器
    clipboard_monitor = ClipboardMonitor(get_session, settings)
    clipboard_monitor.start()

    window_tracker = WindowTracker(get_session, settings)
    window_tracker.start()

    # ==================== API ====================

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.route("/api/settings", methods=["GET", "PUT"])
    def app_settings():
        if request.method == "GET":
            payload = settings.get()
            payload["dataDir"] = str(data_dir)
            return jsonify(payload)

        updated = settings.update(request.json or {})
        cleanup_expired_records()
        updated["dataDir"] = str(data_dir)
        return jsonify(updated)

    @app.route("/api/privacy/cleanup", methods=["POST"])
    def privacy_cleanup():
        cleanup_expired_records()
        return jsonify({"success": True})

    @app.route("/api/stats")
    def stats():
        sess = get_session()
        try:
            return jsonify({
                "windows": sess.query(SmartWindowRecord).count(),
                "clipboard": sess.query(SmartClipboardRecord).count(),
                "switches": sess.query(WindowSwitchEvent).count(),
            })
        finally:
            sess.close()

    @app.route("/api/clipboard")
    def clipboard():
        sess = get_session()
        try:
            limit = request.args.get("limit", 50, type=int)
            records = sess.query(SmartClipboardRecord)\
                .order_by(SmartClipboardRecord.timestamp.desc())\
                .limit(limit)\
                .all()

            return jsonify([{
                "id": r.id,
                "title": (r.content or "")[:100],
                "content": r.content or "",
                "type": r.content_type or "text",
                "language": r.language,
                "is_code": r.is_code,
                "time": r.timestamp.strftime("%H:%M") if r.timestamp else ""
            } for r in records])
        finally:
            sess.close()

    @app.route("/api/clipboard/clear", methods=["POST"])
    def clear_clipboard():
        sess = get_session()
        try:
            sess.query(SmartClipboardRecord).delete()
            sess.commit()
            return jsonify({"success": True})
        finally:
            sess.close()

    @app.route("/api/projects")
    def projects():
        sess = get_session()
        try:
            # 从窗口切换事件中提取项目
            events = sess.query(WindowSwitchEvent)\
                .filter(WindowSwitchEvent.project.isnot(None))\
                .all()

            project_times = defaultdict(float)
            project_apps = {}

            for e in events:
                if e.project:
                    project_times[e.project] += 1
                    if e.project not in project_apps:
                        project_apps[e.project] = e.to_process

            # 也从窗口记录中提取
            windows = sess.query(SmartWindowRecord).all()
            for w in windows:
                project = window_tracker._extract_project(w.window_title or "", w.process_name or "")
                if project:
                    project_times[project] += w.duration_seconds or 0
                    if project not in project_apps:
                        project_apps[project] = w.process_name

            sorted_projects = sorted(project_times.items(), key=lambda x: x[1], reverse=True)
            return jsonify([{
                "name": p,
                "seconds": s,
                "hours": round(s / 3600, 2),
                "app": project_apps.get(p, "")
            } for p, s in sorted_projects[:15]])
        finally:
            sess.close()

    @app.route("/api/apps")
    def apps():
        sess = get_session()
        try:
            today = datetime.now().replace(hour=0, minute=0, second=0)
            records = sess.query(SmartWindowRecord)\
                .filter(SmartWindowRecord.timestamp >= today)\
                .all()

            app_times = defaultdict(float)
            app_paths = {}

            for r in records:
                app_times[r.process_name] += r.duration_seconds or 0
                # 尝试获取应用路径
                if r.process_name not in app_paths and HAS_WIN32:
                    try:
                        for proc in psutil.process_iter(['name', 'exe']):
                            if proc.info['name'] == r.process_name and proc.info['exe']:
                                app_paths[r.process_name] = proc.info['exe']
                                break
                    except:
                        pass

            sorted_apps = sorted(app_times.items(), key=lambda x: x[1], reverse=True)
            return jsonify([{
                "name": a,
                "seconds": s,
                "hours": round(s / 3600, 2),
                "path": app_paths.get(a, "")
            } for a, s in sorted_apps[:10]])
        finally:
            sess.close()

    # ==================== 操作 API ====================

    @app.route("/api/action/copy", methods=["POST"])
    def action_copy():
        data = request.json or {}
        content = data.get("content", "")
        if not content:
            return jsonify({"success": False})

        try:
            if HAS_PYPERCLIP:
                pyperclip.copy(content)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})

    @app.route("/api/action/paste", methods=["POST"])
    def action_paste():
        """模拟 Ctrl+V"""
        try:
            if HAS_WIN32:
                # 使用 Windows API 发送按键
                win32api.keybd_event(win32con.VK_CONTROL, 0, 0, 0)
                time.sleep(0.05)
                win32api.keybd_event(0x56, 0, 0, 0)  # V key
                time.sleep(0.05)
                win32api.keybd_event(0x56, 0, win32con.KEYEVENTF_KEYUP, 0)
                win32api.keybd_event(win32con.VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
                return jsonify({"success": True})
            return jsonify({"success": False, "error": "不支持"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})

    @app.route("/api/action/open-url", methods=["POST"])
    def action_open_url():
        data = request.json or {}
        url = data.get("url", "")
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        try:
            os.startfile(url)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})

    @app.route("/api/action/open-file", methods=["POST"])
    def action_open_file():
        data = request.json or {}
        file_path = data.get("path", "")
        try:
            file_path = os.path.expanduser(file_path)
            if os.path.exists(file_path):
                os.startfile(file_path)
                return jsonify({"success": True})

            # 尝试常见目录
            for base in ['~/projects', '~/Documents', '~/Desktop', '~']:
                path = os.path.expanduser(f"{base}/{file_path}")
                if os.path.exists(path):
                    os.startfile(path)
                    return jsonify({"success": True, "path": path})

            return jsonify({"success": False, "error": "文件不存在"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})

    @app.route("/api/action/open-project", methods=["POST"])
    def action_open_project():
        data = request.json or {}
        project_name = data.get("project", "")
        project_path = data.get("path", "")

        try:
            # 1. 查找项目路径
            if not project_path:
                for base in ['~/projects', '~/Documents', '~/Desktop', '~', 'C:/Users']:
                    path = os.path.expanduser(f"{base}/{project_name}")
                    if os.path.exists(path):
                        project_path = path
                        break

            # 2. 查找对应的 IDE
            sess = get_session()
            try:
                event = sess.query(WindowSwitchEvent)\
                    .filter(WindowSwitchEvent.project == project_name)\
                    .first()
                app_name = event.to_process if event else None
            finally:
                sess.close()

            # 3. 根据 IDE 类型启动
            if app_name:
                app_lower = app_name.lower()

                # VS Code / Cursor
                if 'code' in app_lower or 'cursor' in app_lower:
                    try:
                        subprocess.Popen([app_name, project_path], shell=False)
                        return jsonify({"success": True, "app": app_name, "path": project_path})
                    except:
                        # 尝试用 code 命令
                        subprocess.Popen(f'code "{project_path}"', shell=True)
                        return jsonify({"success": True, "app": "code", "path": project_path})

                # JetBrains IDE
                if any(x in app_lower for x in ['pycharm', 'idea', 'webstorm', 'phpstorm']):
                    try:
                        subprocess.Popen([app_name, project_path], shell=False)
                        return jsonify({"success": True, "app": app_name, "path": project_path})
                    except:
                        pass

                # 其他 IDE - 尝试通用方式
                try:
                    subprocess.Popen([app_name, project_path], shell=False)
                    return jsonify({"success": True, "app": app_name, "path": project_path})
                except:
                    pass

            # 4. 没有找到 IDE，直接打开文件夹
            if project_path and os.path.exists(project_path):
                os.startfile(project_path)
                return jsonify({"success": True, "path": project_path, "method": "folder"})

            # 5. 最后尝试用系统默认方式打开
            if project_path:
                os.startfile(project_path)
                return jsonify({"success": True, "path": project_path, "method": "startfile"})

            return jsonify({"success": False, "error": "未找到项目"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})

    @app.route("/api/action/launch-app", methods=["POST"])
    def action_launch_app():
        data = request.json or {}
        app_name = data.get("app", "")
        app_path = data.get("path", "")

        if not app_name:
            return jsonify({"success": False, "error": "无应用名"})

        try:
            # 1. 如果有完整路径，直接启动
            if app_path and os.path.exists(app_path):
                os.startfile(app_path)
                return jsonify({"success": True, "method": "path", "path": app_path})

            # 2. 从正在运行的进程中查找路径
            if HAS_WIN32:
                for proc in psutil.process_iter(['name', 'exe']):
                    try:
                        if proc.info['name'] == app_name and proc.info['exe']:
                            os.startfile(proc.info['exe'])
                            return jsonify({"success": True, "method": "process", "path": proc.info['exe']})
                    except:
                        continue

            # 3. 常见应用路径搜索
            common_paths = [
                os.path.expandvars(f"%LOCALAPPDATA%\\{app_name.replace('.exe', '')}\\{app_name}"),
                os.path.expandvars(f"%PROGRAMFILES%\\{app_name.replace('.exe', '')}\\{app_name}"),
                os.path.expandvars(f"%PROGRAMFILES(X86)%\\{app_name.replace('.exe', '')}\\{app_name}"),
                os.path.expandvars(f"%APPDATA%\\{app_name.replace('.exe', '')}\\{app_name}"),
            ]

            for path in common_paths:
                if os.path.exists(path):
                    os.startfile(path)
                    return jsonify({"success": True, "method": "common_path", "path": path})

            # 4. 用 PowerShell 查找 UWP 应用
            try:
                ps_cmd = f'Get-StartApps | Where-Object {{$_.Name -like "*{app_name.replace(".exe", "")}*"}} | Select-Object -First 1 -ExpandProperty AppID'
                result = subprocess.run(['powershell', '-Command', ps_cmd], capture_output=True, text=True, timeout=5)
                if result.returncode == 0 and result.stdout.strip():
                    app_id = result.stdout.strip()
                    subprocess.Popen(f'explorer.exe shell:AppsFolder\\{app_id}', shell=True)
                    return jsonify({"success": True, "method": "uwp", "appid": app_id})
            except:
                pass

            # 5. 最后尝试 start 命令
            subprocess.Popen(f'start "" "{app_name}"', shell=True)
            return jsonify({"success": True, "method": "start"})

        except Exception as e:
            return jsonify({"success": False, "error": str(e), "app": app_name})

    @app.route("/api/export/all")
    def export_all():
        sess = get_session()
        try:
            clips = sess.query(SmartClipboardRecord)\
                .order_by(SmartClipboardRecord.timestamp.desc())\
                .all()
            windows = sess.query(SmartWindowRecord)\
                .order_by(SmartWindowRecord.timestamp.desc())\
                .all()
            switches = sess.query(WindowSwitchEvent)\
                .order_by(WindowSwitchEvent.timestamp.desc())\
                .all()

            data = {
                "clipboard": [{
                    "content": c.content,
                    "type": c.content_type,
                    "language": c.language,
                    "char_count": c.char_count,
                    "time": c.timestamp.isoformat() if c.timestamp else ""
                } for c in clips],
                "windows": [{
                    "window_title": w.window_title,
                    "process_name": w.process_name,
                    "duration_seconds": w.duration_seconds,
                    "time": w.timestamp.isoformat() if w.timestamp else ""
                } for w in windows],
                "switches": [{
                    "to_window": e.to_window,
                    "to_process": e.to_process,
                    "category": e.category,
                    "project": e.project,
                    "time": e.timestamp.isoformat() if e.timestamp else ""
                } for e in switches],
                "settings": settings.get(),
            }

            export_path = os.path.expanduser(f"~/.ai-habit-db/export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
            with open(export_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            return jsonify({"success": True, "path": export_path})
        finally:
            sess.close()

    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    app = create_app(args.port)
    if app:
        print(f"[Backend] API 启动: http://{args.host}:{args.port}")
        app.run(host=args.host, port=args.port, debug=False, use_reloader=False)
    else:
        print(f"[Backend] 缺少依赖: {IMPORT_ERROR}")
        while True:
            time.sleep(1)


if __name__ == "__main__":
    main()
