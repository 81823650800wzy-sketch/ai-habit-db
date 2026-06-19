<div align="center">

# 🧠 AI Habit DB

### 你的数字生活记忆体

<p>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%2F11-blue?style=flat-square&logo=windows" />
  <img src="https://img.shields.io/badge/Electron-28+-47848F?style=flat-square&logo=electron" />
  <img src="https://img.shields.io/badge/Python-3.9+-3776AB?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
</p>

<p>
  <strong>参考 Windows 剪切板 (Win+V) 体验</strong><br/>
  不抢焦点 · 单击粘贴 · 智能分类 · 本地AI训练
</p>

<p>
  <a href="#-快速开始">快速开始</a> •
  <a href="#-核心功能">核心功能</a> •
  <a href="#-截图">截图</a> •
  <a href="#-下载安装">下载</a> •
  <a href="#-ai训练">AI训练</a>
</p>

</div>

---

## 🤔 这是什么？

**AI Habit DB** 是一个本地运行的数字行为记录系统，参考 Windows Win+V 剪切板的交互体验，让你可以：

- 📋 **智能剪切板** — 自动记录复制内容，分类整理，一键粘贴
- 🖥️ **应用追踪** — 记录你用了什么软件，用了多久
- 📁 **项目识别** — 自动识别你在 VSCode/PyCharm 中打开的项目
- 🤖 **AI训练** — 导出数据集，训练你的个人AI助手
- 🔒 **完全本地** — 数据不出本机，隐私第一

## ✨ 核心功能

### 📋 智能剪切板

```
┌─────────────────────────────────────────────────┐
│ 🔍 搜索剪切板、文件、应用...                      │
├─────────────────────────────────────────────────┤
│ 📋 def calculate(data):     Python · 使用5次     │
│    return sum(d['value'])   14:32                │
│                                                  │
│ 🔗 https://github.com       链接 · 使用3次       │
│    github.com                  14:15             │
│                                                  │
│ 🖼️ C:\Users\pic\screenshot  图片 · 使用2次      │
│    screenshot.png             14:00              │
└─────────────────────────────────────────────────┘
```

**特性：**
- ✅ 不抢焦点 — 弹窗出现时，你的输入框保持焦点
- ✅ 单击粘贴 — 点击即粘贴到当前输入位置
- ✅ 智能分类 — 代码、链接、文件、图片自动分类
- ✅ 使用排序 — 常用内容自动排在前面
- ✅ 权限控制 — 每种操作都可独立开关

### 🖥️ 应用追踪

自动记录你使用的每个应用，统计使用时长：

```json
{
  "apps": [
    { "name": "VS Code", "hours": 4.2, "path": "C:\\...\\Code.exe" },
    { "name": "Chrome", "hours": 2.1, "path": "C:\\...\\chrome.exe" },
    { "name": "微信", "hours": 1.3, "path": "C:\\...\\WeChat.exe" }
  ]
}
```

### 📁 项目识别

自动从 IDE 窗口标题提取项目信息：

| IDE | 窗口标题格式 | 提取结果 |
|-----|-------------|----------|
| VS Code | `main.py — my-project - VS Code` | `my-project` |
| PyCharm | `my-project - PyCharm` | `my-project` |
| Terminal | `C:\projects\my-app — Terminal` | `my-app` |

### 🤖 AI 训练数据导出

支持多种格式导出，方便训练：

```bash
# JSONL 格式（适合大模型微调）
{"text": "用户在14:32复制了一段Python代码..."}

# CSV 格式（适合数据分析）
timestamp,type,content,language,app
2024-01-01 14:32,code,"def calculate...",Python,Code.exe

# JSON 格式（通用）
{ "clipboard": [...], "windows": [...], "apps": [...] }
```

## 📸 截图

<div align="center">

### 主界面 — 亮色毛玻璃风格
![主界面](https://via.placeholder.com/800x500/ffffff/333333?text=AI+Habit+DB+主界面)

### 设置面板 — 权限控制
![设置](https://via.placeholder.com/800x500/ffffff/333333?text=设置面板)

### 数据分析 — 使用统计
![分析](https://via.placeholder.com/800x500/ffffff/333333?text=数据分析)

</div>

## 🚀 快速开始

### 方式一：下载安装包（推荐）

1. 前往 [Releases](https://github.com/yourusername/ai-habit-db/releases) 下载最新版
2. 运行 `AI-Habit-DB-Setup.exe`
3. 安装完成后按 `Ctrl+Shift+Space` 唤出

### 方式二：从源码运行

```bash
# 克隆仓库
git clone https://github.com/yourusername/ai-habit-db.git
cd ai-habit-db

# 安装依赖
npm install

# 启动
npm start
```

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+Space` | 唤出主面板 |
| `Ctrl+Shift+C` | 直接打开剪切板 |
| `Ctrl+Shift+P` | 直接打开项目 |
| `Ctrl+Shift+T` | 直接打开应用 |
| `↑↓` | 导航选择 |
| `Enter` | 粘贴/打开 |
| `Tab` | 切换分类 |
| `Esc` | 关闭面板 |

## 🎯 操作方式

### 单击 = 主操作

| 内容类型 | 单击效果 |
|----------|----------|
| 文本 | 粘贴到输入框 |
| 代码 | 粘贴到输入框 |
| URL | 粘贴链接 |
| 图片 | 打开图片 |
| 文件 | 打开文件 |
| 项目 | 用 IDE 打开 |
| 应用 | 复制路径 |

### 悬浮 = 备选按钮

鼠标悬停显示操作按钮，点击执行备选操作。

## 🤖 AI 训练

### 导出训练数据

```bash
# 方式一：命令行
cd ai-habit-db
python backend/export_training.py --format jsonl --days 30

# 方式二：界面操作
设置 → 数据管理 → 导出训练数据
```

### 训练格式示例

```jsonl
{"messages": [{"role": "system", "content": "你是用户的AI助手，了解用户的使用习惯。"}, {"role": "user", "content": "我最常用什么应用？"}, {"role": "assistant", "content": "根据您的使用记录，您最常用的应用是：1. VS Code (4.2小时/天) 2. Chrome (2.1小时/天) 3. 微信 (1.3小时/天)"}]}
{"messages": [{"role": "system", "content": "你是用户的AI助手。"}, {"role": "user", "content": "我一般几点开始工作？"}, {"role": "assistant", "content": "根据您的活跃时段分析，您通常在9:00-10:00开始高强度工作，14:00-15:00有一个工作高峰期。"}]}
```

### 支持的训练平台

| 平台 | 格式 | 状态 |
|------|------|------|
| OpenAI Fine-tuning | JSONL | ✅ |
| HuggingFace | JSONL/CSV | ✅ |
| LoRA/QLoRA | JSONL | ✅ |
| LangChain | JSON | ✅ |

## ⚙️ 配置说明

### 设置项

| 设置 | 说明 | 默认值 |
|------|------|--------|
| 主题 | 亮色/暗色/跟随系统 | 跟随系统 |
| 透明度 | 窗口透明度 | 85% |
| 背景图 | 自定义背景 | 无 |
| 开机自启 | Windows 启动时自动运行 | 关闭 |

### 采集模块

| 模块 | 说明 | 默认 |
|------|------|------|
| 剪切板记忆 | 记录复制内容 | 关闭 |
| 应用时长 | 统计应用使用时间 | 关闭 |
| 窗口与项目 | 记录窗口切换和项目 | 关闭 |

### 操作权限

| 权限 | 说明 | 默认 |
|------|------|------|
| 打开文件 | 双击文件可打开 | 开启 |
| 打开链接 | 双击URL可打开浏览器 | 开启 |
| 启动应用 | 双击应用可启动 | 开启 |
| 打开文件夹 | 双击路径可打开文件夹 | 开启 |
| 自动粘贴 | 单击后自动Ctrl+V | 开启 |

### 隐私保护

| 设置 | 说明 | 默认 |
|------|------|------|
| 敏感内容过滤 | 自动跳过密码/token | 开启 |
| 数据保留天数 | 自动清理旧数据 | 30天 |
| 本地存储 | 数据不出本机 | 强制开启 |

## 📁 项目结构

```
ai-habit-db/
├── electron/                  # Electron 主进程
│   ├── main.js               # 窗口管理、快捷键、IPC
│   └── preload.js            # 安全桥接
├── src/                       # 前端界面
│   ├── popup.html            # 弹窗结构
│   ├── js/popup.js           # 核心逻辑
│   └── styles/               # 样式文件
├── backend/                   # Python 后端
│   ├── server.py             # API 服务
│   └── storage/models.py     # 数据库模型
├── assets/                    # 资源文件
├── package.json              # Electron 配置
└── README.md                 # 本文件
```

## 🔧 开发

```bash
# 开发模式（启用 DevTools）
npm run dev

# 构建安装包
npm run build

# 仅构建 Windows
npm run build:win
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 🙏 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面框架
- [Flask](https://flask.palletsprojects.com/) - Python Web 框架
- [Chart.js](https://www.chartjs.org/) - 图表库
- [PowerToys](https://github.com/microsoft/PowerToys) - 剪切板交互参考

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star 支持一下！**

</div>
