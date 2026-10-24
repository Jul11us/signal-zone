# 开发指南 · Developer guide

## Runtime

The application runs as static HTML, CSS, and JavaScript. Serve the repository root over HTTP; there is no bundler, framework, application server, or WebGL dependency. Google Fonts is optional and falls back to system fonts. The user interface is currently Chinese.

```text
index.html              Entry point, toolbar, panels, font links
styles-v4.css           Navy / paper / signal-red visual system
data-v4.js              Maps, markers, reference zones, model weights, playbook
app-core.js             Map viewport, layers, search, sharing, bookmarks, photo viewer
app-game.js             Four-step planning, scenario scoring, review, PNG export
pano.js                 Canvas 2D procedural terrain illustrations
assets/map-*.jpg        Bundled third-party game map images
assets/terrain/         Optional user-supplied terrain photographs
docs/readme/            Repository cover and product previews
tools/                  Reproducible presentation tooling
tests/                  Regression checks
```

## 数据入口

- `MAP_DATA`：三图点位、载具、地形、资源与密度评级。坐标以地图百分比表示。
- `TERRAIN_CATS`：19 类地形标签及说明。
- `CIRCLE_RADIUS_M`：各地图参考圈半径；不要将参考值视为手游官方数值。
- `CIRCLE_RULES`：等待时间、缩圈速度与伤害等参考参数。
- `CIRCLE_PREDICTOR`：水面、资源、掩体、位移与方向延续等评分参数。
- `PRO_PLAYBOOK`：运营思路与战术说明，修改时应核对来源与时效。

静态数据集包含 120 个点位与房群、106 个地形标注、56 个载具标注。更新条目后，请同步 README 和封面的计数。

## 圈形推演

`app-game.js` 内的 `CirclePredictor` 使用参考半径和输入圈，在可行域内采样 600 个候选圆心，通过水面、物资、掩体及移动偏好评分，再聚合为候选区域。水面比例依据地图像素估计，依赖地图可被 Canvas 同源读取。

结果属于启发式场景推演。模型权重、softmax 评分和区域质量不能直接解释为经过校准的真实命中概率。回溯统计由本机记录的相邻圈样本重算；少量手动样本不足以证明泛化表现。权重调整在至少 8 个相邻圈样本后开放，当前可变因素以实际代码为准。

## 状态与分享

- 收藏、复盘与校准参数：浏览器 `localStorage`。
- 分享方案：URL hash 中的编码状态，包含地图、航线、圈形和大头针。
- 分享内容不包含完整收藏库和复盘库，但链接本身可以被持有者读取。
- 方案卡：浏览器 Canvas 生成 1080 × 1500 PNG，下载到本机。

## 增加地形照片

按 `assets/terrain/README.txt` 的规则创建 `assets/terrain/<terrain-id>/1.jpg` 至 `6.jpg`。地形 ID 来自 `data-v4.js`。只使用有权发布的图片；当前仓库未附带实拍照片，默认展示程序化示意视图。

## 检查与预览

```bash
node --check app-core.js
node --check app-game.js
node --check data-v4.js
node --check pano.js
node --test
python -m http.server 8642 --bind 127.0.0.1
```

在浏览器检查三图切换、搜索定位、游戏模式四步流程、圈形确认、分享恢复和 PNG 导出。`index.html` 中的静态文件查询参数用于缓存更新；修改应用资源时同步递增相应参数。

README 封面通过以下命令重新生成（需要 Pillow 及脚本所引用的字体）：

```bash
python tools/render_readme_cover.py
```

仓库仅收录应用、公开说明、测试和精选预览。本地设计讨论、草稿及大量核对截图通过 `.gitignore` 保留在开发目录内。
