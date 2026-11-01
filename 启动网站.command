#!/bin/zsh
cd -- "${0:A:h}" || exit 1
python3 tools/serve-local.py --open
if [ "$?" -ne 0 ]; then
  printf '\n启动失败。请检查 Python 3 或端口占用，然后重试。\n'
  read -r '?按回车关闭…'
fi
