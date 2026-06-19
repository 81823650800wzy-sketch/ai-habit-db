"""
AI Habit DB — 训练数据导出
支持 JSONL, CSV, JSON 格式
"""

import os
import sys
import json
import csv
import argparse
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from storage.models import init_db, SmartClipboardRecord, SmartWindowRecord, WindowSwitchEvent


def get_session():
    db_path = Path("~/.ai-habit-db/data/habits.db").expanduser()
    engine, Session = init_db(db_path)
    return Session()


def export_jsonl(session, days=30, output_path=None):
    """导出 JSONL 格式（适合 OpenAI/HuggingFace 微调）"""
    since = datetime.now() - timedelta(days=days)

    clips = session.query(SmartClipboardRecord)\
        .filter(SmartClipboardRecord.timestamp >= since)\
        .order_by(SmartClipboardRecord.timestamp)\
        .all()

    windows = session.query(SmartWindowRecord)\
        .filter(SmartWindowRecord.timestamp >= since)\
        .order_by(SmartWindowRecord.timestamp)\
        .all()

    if not output_path:
        output_path = os.path.expanduser(f"~/.ai-habit-db/training_{datetime.now().strftime('%Y%m%d')}.jsonl")

    samples = []

    # 从剪切板生成训练样本
    for clip in clips:
        if not clip.content or len(clip.content.strip()) < 10:
            continue

        # 生成问答对
        if clip.is_code:
            samples.append({
                "messages": [
                    {"role": "system", "content": "你是用户的编程助手，了解用户的技术栈和编码习惯。"},
                    {"role": "user", "content": "我最近在写什么代码？"},
                    {"role": "assistant", "content": f"根据您的剪切板记录，您最近复制了一段{clip.language or '代码'}:\n```\n{clip.content[:200]}\n```"}
                ]
            })
        elif clip.content_type == 'url':
            samples.append({
                "messages": [
                    {"role": "system", "content": "你是用户的浏览助手，了解用户的上网习惯。"},
                    {"role": "user", "content": "我最近访问了什么网站？"},
                    {"role": "assistant", "content": f"您最近访问了: {clip.content[:100]}"}
                ]
            })

    # 从窗口记录生成训练样本
    app_times = {}
    for w in windows:
        name = w.process_name or "unknown"
        app_times[name] = app_times.get(name, 0) + (w.duration_seconds or 0)

    if app_times:
        top_apps = sorted(app_times.items(), key=lambda x: x[1], reverse=True)[:5]
        app_list = "\n".join([f"{i+1}. {name} ({seconds/3600:.1f}小时)" for i, (name, seconds) in enumerate(top_apps)])

        samples.append({
            "messages": [
                {"role": "system", "content": "你是用户的效率分析助手，了解用户的应用使用习惯。"},
                {"role": "user", "content": "我最常用什么应用？"},
                {"role": "assistant", "content": f"根据您的使用记录，您最常用的应用是：\n{app_list}"}
            ]
        })

    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        for sample in samples:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')

    return len(samples), output_path


def export_csv(session, days=30, output_path=None):
    """导出 CSV 格式（适合数据分析）"""
    since = datetime.now() - timedelta(days=days)

    clips = session.query(SmartClipboardRecord)\
        .filter(SmartClipboardRecord.timestamp >= since)\
        .order_by(SmartClipboardRecord.timestamp)\
        .all()

    if not output_path:
        output_path = os.path.expanduser(f"~/.ai-habit-db/training_{datetime.now().strftime('%Y%m%d')}.csv")

    with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['timestamp', 'type', 'content', 'language', 'is_code', 'char_count'])

        for clip in clips:
            writer.writerow([
                clip.timestamp.isoformat() if clip.timestamp else '',
                clip.content_type or 'text',
                clip.content[:500] if clip.content else '',
                clip.language or '',
                clip.is_code,
                clip.char_count or 0
            ])

    return len(clips), output_path


def export_json(session, days=30, output_path=None):
    """导出 JSON 格式（通用）"""
    since = datetime.now() - timedelta(days=days)

    clips = session.query(SmartClipboardRecord)\
        .filter(SmartClipboardRecord.timestamp >= since)\
        .order_by(SmartClipboardRecord.timestamp)\
        .all()

    windows = session.query(SmartWindowRecord)\
        .filter(SmartWindowRecord.timestamp >= since)\
        .order_by(SmartWindowRecord.timestamp)\
        .all()

    switches = session.query(WindowSwitchEvent)\
        .filter(WindowSwitchEvent.timestamp >= since)\
        .order_by(WindowSwitchEvent.timestamp)\
        .all()

    if not output_path:
        output_path = os.path.expanduser(f"~/.ai-habit-db/training_{datetime.now().strftime('%Y%m%d')}.json")

    data = {
        "export_time": datetime.now().isoformat(),
        "period_days": days,
        "clipboard": [{
            "content": c.content,
            "type": c.content_type,
            "language": c.language,
            "is_code": c.is_code,
            "char_count": c.char_count,
            "time": c.timestamp.isoformat() if c.timestamp else ""
        } for c in clips],
        "windows": [{
            "title": w.window_title,
            "process": w.process_name,
            "duration": w.duration_seconds,
            "time": w.timestamp.isoformat() if w.timestamp else ""
        } for w in windows],
        "switches": [{
            "to_window": e.to_window,
            "to_process": e.to_process,
            "category": e.category,
            "project": e.project,
            "time": e.timestamp.isoformat() if e.timestamp else ""
        } for e in switches]
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    total = len(clips) + len(windows) + len(switches)
    return total, output_path


def main():
    parser = argparse.ArgumentParser(description="AI Habit DB 训练数据导出")
    parser.add_argument("--format", choices=["jsonl", "csv", "json"], default="jsonl", help="导出格式")
    parser.add_argument("--days", type=int, default=30, help="导出最近N天的数据")
    parser.add_argument("--output", help="输出文件路径")
    args = parser.parse_args()

    session = get_session()

    try:
        if args.format == "jsonl":
            count, path = export_jsonl(session, args.days, args.output)
        elif args.format == "csv":
            count, path = export_csv(session, args.days, args.output)
        else:
            count, path = export_json(session, args.days, args.output)

        print(f"✅ 导出完成: {count} 条记录 -> {path}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
