# Raycast Script Command 生成模板

## 我的环境

- macOS，Python 通过 pyenv 管理
- pyenv 实际 Python 路径：`/Users/zjc/.pyenv/versions/3.12.9/bin/python3`
- Raycast Script Commands 目录：`/Users/zjc/Downloads/git备份/documents/RaycastScripts/`
- 所有脚本**平铺**在该目录下，不使用子文件夹

## 目录结构约定

```
RaycastScripts/
├── pyenv_python.sh          # 公共路径解析器，已存在，无需生成
├── {name}.sh                # Raycast 入口，包含元信息
└── {name}_core.py           # Python 业务逻辑
```

## pyenv_python.sh 说明

公共脚本已存在，路径为 `$SCRIPT_DIR/pyenv_python.sh`。
它会动态解析 pyenv 的 python3 路径，解析成功后导出 `$PYTHON` 变量供调用方使用。
解析优先级：pyenv 动态解析 → `$PYENV_PYTHON_FALLBACK` 环境变量 → 内置硬编码路径 → 系统 python3。

## 输出要求

每次生成两个文件：

### 1. `{name}.sh`（Raycast 入口）

```bash
#!/bin/bash
# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title {标题}
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon {emoji}
# @raycast.packageName {分组名}
# @raycast.description {描述}
# @raycast.author zjc
# @raycast.argument1 { "type": "text", "placeholder": "{占位提示}", "optional": false }
# @raycast.argument2 { "type": "text", "placeholder": "{占位提示}", "optional": true }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 动态注入 python 路径
source "$SCRIPT_DIR/pyenv_python.sh"

# 执行核心脚本
exec "$PYTHON" "$SCRIPT_DIR/{name}_core.py" "$1" $2
```

注意：
- 参数按实际需求增减，不需要的 argument 直接删除
- `exec "$PYTHON" ... "$1" $2` 中参数个数与 argument 数量对应

### 2. `{name}_core.py`（Python 业务逻辑）

```python
#!/usr/bin/env python3
"""
{name}_core.py —— {功能描述}

用法：
  python {name}_core.py <参数1> [参数2]

依赖安装：
  pip install ...
"""

from __future__ import annotations  # 兼容 Python 3.7+ 的类型注解语法

import sys
import argparse
from pathlib import Path
# ... 其他 import

def main() -> None:
    # Raycast 传入时 argument1 是单个字符串，按空格拆分还原为多个参数
    argv = sys.argv[1:]
    if argv and not argv[0].startswith("-"):
        split = argv[0].split()
        argv = split + argv[1:]

    parser = argparse.ArgumentParser(description="{功能描述}")
    # ... 添加参数

    args = parser.parse_args(argv)
    # ... 业务逻辑

if __name__ == "__main__":
    main()
```

注意：
- 必须包含 `from __future__ import annotations`
- 必须包含 Raycast argv 拆分处理逻辑
- Python 文件本身不包含任何 Raycast 元信息

## 使用方式

生成文件后，在 RaycastScripts 目录下执行：
```bash
chmod +x {name}.sh
```

---

## 我的需求