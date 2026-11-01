# 地形观察室 · Terrain explorer

主规划地图继续使用原有底图和百分比坐标。新增观察室提供独立的二维贴图与三维相对高度网格，避免把裁切不同的素材直接套在现有点位上。

## 资源与范围

| 输入 | 网站产物 | 用途 |
| --- | --- | --- |
| `erangel-pubg/textures/erangel_8k.png`，8192²，2021 文件日期 | 8K / 2K WebP | 海岛二维卫星图 / 三维贴图 |
| `map-pubg-erangel/textures/yainuc8nla2z.jpeg`，8192²，2019 文件日期 | 4K / 2K WebP | 海岛无字地貌 / 三维贴图；保留原署名 |
| `pubg-maps-5.7.6/{erangel,miramar}/*height_l16_lod0.png`，8192²，16 位 | 193² 高度网格、2K 设色 WebP | 海岛和沙漠的相对起伏 |

高度资源出自 [cgcostume/pubg-maps](https://github.com/cgcostume/pubg-maps) 的旧版 PUBG PC 地形资料。输入的最小值、最大值和尺寸记录在 `assets/terrain-data/manifest.json`。网格按原始全图范围归一化为 unsigned 16-bit little-endian 数据，不声称单位是米，也没有校准海平面或手游现版高程。三维视图中的「起伏增强」是视觉放大，不是物理高度比例。

两个 FBX 都没有直接用于网站：网页从高度图生成有限网格，避免增加模型解析器和大体积二进制模型。三维使用 2K 贴图，高清二维卫星图保留 8192² 分辨率。全部资源按需加载，不在初始页面请求。

参考 [PUBGMAPS 的海岛页面](https://pubgmaps.gg/zh/map/erangel) 的视图切换与地图工具组织；没有复制站点源代码，也没有将其 PC 载具、密室等点位混入本项目的手游数据。

## 重新生成

需要 Python、Pillow、numpy。仅运行本项目的转换脚本，无需运行素材目录里的提取脚本。

```bash
python3 tools/prepare-terrain.py \
  --height-root /path/to/pubg-maps-5.7.6 \
  --satellite /path/to/erangel-pubg/textures/erangel_8k.png \
  --illustrated /path/to/map-pubg-erangel/textures/yainuc8nla2z.jpeg \
  --output assets/terrain-data
```

源文件保持不变。转换脚本生成归一化网格与阴影设色图，并将贴图压缩为 WebP。网站运行不依赖 Python 图片库。

## 浏览器实现

- `terrain-viewer.js`：原生 WebGL 1，约 37,000 个顶点，16 位索引；按需渲染，不运行持续动画循环。异步加载按版本号丢弃旧请求结果，关闭观察室不再上传旧纹理。
- 不支持 WebGL 时切到二维；上下文丢失时保留二维可用性。资源请求失败有重试入口。
- 对话框由原生 `dialog` 管理焦点与 Escape，方向键调整三维视角，按钮支持缩放与重置。
- `map-survey.js`：测距、网格和坐标单独渲染，不改变游戏规划对象。测距节点不写入 localStorage、不写入方案链接；切换地图会清空。
- 测距与参考网格沿用主项目的 8 km 边长假设。各段是平面直线估算，不计算道路绕行或地形坡度。

## 本地运行和检查

双击根目录的 `启动网站.command`，或执行：

```bash
python3 tools/serve-local.py --open
node --test
node --check terrain-viewer.js
node --check map-survey.js
```

服务仅绑定 `127.0.0.1`，排除备份、Git 元数据和本机配置。端口默认 8642，可用 `--port` 修改。资源权利说明见 [NOTICE](../NOTICE.md)。
