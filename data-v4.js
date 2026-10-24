/* =========================================================================
 * 战术视界 · 和平精英综合情报站  v4.0
 * data-v4.js —— 数据层
 * 坐标体系：所有 coords 均为 [x百分比, y百分比]，相对地图图片左上角
 * ========================================================================= */

/* ------------------------- 地形标注分类（16 类） ------------------------- */
const TERRAIN_CATS = {
  reverseSlope:  { name: '反坡',        icon: '⛰',  color: '#f0a63e', group: '地形', desc: '背向敌人的斜坡，可低姿态接近并遮挡视线' },
  pit:           { name: '凹坑',        icon: '🕳',  color: '#a78bfa', group: '地形', desc: '天然下凹地形，可蹲伏躲避子弹' },
  toilet:        { name: '厕所',        icon: '🚻', color: '#94a3b8', group: '房型', desc: '独立小建筑，单面出入口，极易被围' },
  house:         { name: '房型',        icon: '🏠', color: '#5bd1e8', group: '房型', desc: '各类建筑结构、楼层与卡点分析' },
  tower:         { name: '炮楼',        icon: '🗼', color: '#fb7a99', group: '房型', desc: '高台建筑，视野压制强但暴露度也高' },
  gasStation:    { name: '加油站',      icon: '⛽', color: '#ff9350', group: '设施', desc: '载具刷新集中区，转移与卡点枢纽' },
  bunker:        { name: '防空洞',      icon: '🚪', color: '#7c8da6', group: '设施', desc: '地下空间，出入口少，决赛圈苟分首选' },
  powerTower:    { name: '电塔',        icon: '⚡', color: '#f2d14e', group: '设施', desc: '可攀爬高点，360°观察周边' },
  waterEdge:     { name: '水边苟分点',  icon: '🌊', color: '#45d6e5', group: '苟分', desc: '水岸岩石/芦苇，视野与撤离兼顾' },
  hiddenSpot:    { name: '山上隐蔽点',  icon: '🌲', color: '#58d68d', group: '苟分', desc: '林地山坳，不易被发现' },
  relativeHigh:  { name: '相对制高点',  icon: '🏔',  color: '#6fa8ff', group: '高点', desc: '可步行/载具抵达的山顶高地' },
  absoluteHigh:  { name: '绝对制高点',  icon: '🚁', color: '#d78cf5', group: '高点', desc: '仅紧急呼救器可达，载具与步行无法到达' },
  secretRoom:    { name: '密室',        icon: '🔐', color: '#b880f0', group: '特殊', desc: '隐藏房间，高价值物资与安全空间' },
  bridge:        { name: '桥',          icon: '🌉', color: '#f5c04e', group: '特殊', desc: '跨水通道，卡桥与反卡桥战术核心' },
  explosive:     { name: '炸药堆',      icon: '💥', color: '#f2555a', group: '特殊', desc: '油桶/炸药堆，可引爆清场或设置陷阱' },
  island:        { name: '小岛',        icon: '🏝',  color: '#3fd8c4', group: '特殊', desc: '离岸岛屿，安全但受圈形限制' },
  beacon:        { name: '召唤基站',    icon: '📡', color: '#39c6a0', group: '特殊', desc: '荣都复活机制：到达基站约10秒召回阵亡队友，复活有音效，先封烟再操作' },
  airdropGun:    { name: '空投枪必刷点', icon: '🎁', color: '#e05bd8', group: '特殊', desc: '荣都固定刷新空投武器（人机背包）的高价值点位' },
  ferryDock:     { name: '轮渡码头',      icon: '🛳', color: '#4dc3ff', group: '特殊', desc: '海岛3.0新增：渔村与军事基地之间的两条轮渡航线，跨海转移新选择' }
};

/* ------------------------- 载具分类（车 马 飞机 船 鹿） ------------------------- */
const VEHICLE_CATS = {
  car:   { name: '车',   icon: '🚗', color: '#5bd1e8' },
  horse: { name: '马',   icon: '🐎', color: '#f0a63e' },
  plane: { name: '飞机', icon: '🚁', color: '#d78cf5' },
  boat:  { name: '船',   icon: '🚤', color: '#45d6e5' },
  deer:  { name: '鹿',   icon: '🦌', color: '#58d68d' }
};

/* ------------------------- 战术角色库 ------------------------- */
const TACTIC_ROLES = {
  '架枪':   { icon: '🎯', color: '#8fa9b8', desc: '占据有利枪位压制敌方移动，为队友推进创造窗口', equip: ['4倍镜及以上', '7.62步枪/连狙'], key: '先占点后开镜，打一轮就换位' },
  '突击':   { icon: '⚔️', color: '#ff4655', desc: '正面推进撕开缺口，需要火力掩护与投掷物铺垫', equip: ['冲锋枪/霰弹枪', '手雷+烟雾'], key: '双人一组，烟雷开路，清角不贪枪' },
  '探点':   { icon: '🔭', color: '#f2d14e', desc: '前出侦察、卡车位与路线，把信息带回队伍', equip: ['高倍镜', '二级以上头盔'], key: '只探不打，报点要报方位+距离+人数' },
  '看屁股': { icon: '🔄', color: '#a78bfa', desc: '守后方与侧翼，防止被绕后偷袭，保证队伍完整性', equip: ['步枪', '地雷/绊线'], key: '每 20 秒扫一次背后，转移时最后走' },
  '自由手': { icon: '🕊',  color: '#58d68d', desc: '自由游走拉枪线、补点、开车与捡空投', equip: ['步枪+连狙', '大量药品'], key: '始终保持在队伍侧翼 50-80 米' }
};

/* ------------------------- 圈形刷新规则（参考数据） -------------------------
 * 说明：和平精英官方从未公开手游的逐圈半径与圈速参数。以下采用：
 *   · 官方攻略口径：信号区共刷新 10 次（首次无信号区 + 9 次缩小）；最终圈锁定 3 分钟，
 *     最后 15 秒为拼药时间；空手跑 100 米约 15-16 秒（≈6.3-6.7 m/s）
 *   · 圈半径：取材 PUBG PC 端实测值（battlegrounds.party / PUBG Wiki），
 *     手游未公开，仅供"圈有多大"的量级参考；荣都为按同曲线估算
 *   · 等待/缩圈秒数与圈外伤害：综合参考值，官方未公开，可在下方直接改
 * ------------------------------------------------------------------------- */
const CIRCLE_META = {
  source: '圈半径取自 PC 端实测（官方未公开手游数值）；圈速为参考值，可在 data-v4.js 的 CIRCLE_RULES 中直接修改',
  official: [
    '信号区共刷新 10 次：首次无信号区 + 9 次缩小',
    '最终信号区锁定 3 分钟，最后 15 秒是拼药时间',
    '空手跑 100 米约 15-16 秒（≈6.3-6.7 m/s），据此估算转移时间',
    '电竞模式（比赛服）物资总量 = 经典模式的 130%'
  ]
};

/* 各圈半径（米），地图 8×8 km */
const CIRCLE_RADIUS_M = {
  island: [1997, 1198, 659, 362, 181, 91, 45, 23],
  desert: [2282, 1484, 742, 371, 185, 93, 46, 23],
  rongdu: [2200, 1320, 725, 400, 200, 100, 50, 25]   // 荣都官方未公开，按同曲线估算
};

const CIRCLE_RULES = {
  ranked: {
    id: 'ranked', name: '排位赛（经典）', icon: '🏅',
    note: '标准排位节奏，圈速平稳，1-3 圈转移压力较小。',
    phases: [
      { phase: 1, wait: 60, shrink: 90, dps: 0.4 },
      { phase: 2, wait: 90, shrink: 60, dps: 0.6 },
      { phase: 3, wait: 90, shrink: 50, dps: 0.8 },
      { phase: 4, wait: 60, shrink: 40, dps: 1.0 },
      { phase: 5, wait: 45, shrink: 30, dps: 3.0 },
      { phase: 6, wait: 40, shrink: 25, dps: 5.0 },
      { phase: 7, wait: 30, shrink: 20, dps: 7.0 },
      { phase: 8, wait: 25, shrink: 15, dps: 9.0 }
    ]
  },
  peak: {
    id: 'peak', name: '巅峰赛', icon: '🏆',
    note: '节奏更快、伤害更高，2 圈开始就要提前占点，忌贪枪。',
    phases: [
      { phase: 1, wait: 50, shrink: 75, dps: 0.5 },
      { phase: 2, wait: 75, shrink: 50, dps: 0.8 },
      { phase: 3, wait: 75, shrink: 40, dps: 1.2 },
      { phase: 4, wait: 50, shrink: 32, dps: 2.0 },
      { phase: 5, wait: 38, shrink: 25, dps: 4.0 },
      { phase: 6, wait: 32, shrink: 20, dps: 6.0 },
      { phase: 7, wait: 26, shrink: 16, dps: 8.0 },
      { phase: 8, wait: 20, shrink: 12, dps: 10.0 }
    ]
  },
  esports: {
    id: 'esports', name: '电竞模式', icon: '🎖',
    note: '电竞/比赛服节奏：物资总量为经典的 130%，缩圈更快、圈外伤害更高；荣都开启召回基站（航班每 150 秒一班，每人仅 1 次被召回机会）；该模式屏蔽紧急呼救器、突击盾牌、自救除颤器、飞索与迫击炮，荣都另屏蔽渣土车与挖掘机。',
    phases: [
      { phase: 1, wait: 45, shrink: 60, dps: 0.8 },
      { phase: 2, wait: 60, shrink: 45, dps: 1.2 },
      { phase: 3, wait: 60, shrink: 35, dps: 2.0 },
      { phase: 4, wait: 45, shrink: 28, dps: 4.0 },
      { phase: 5, wait: 35, shrink: 22, dps: 6.0 },
      { phase: 6, wait: 30, shrink: 18, dps: 8.0 },
      { phase: 7, wait: 24, shrink: 14, dps: 10.0 },
      { phase: 8, wait: 18, shrink: 10, dps: 14.0 }
    ]
  }
};

/* ------------------------- 数据：海岛 Erangel ------------------------- */
const MAP_ISLAND = {
  id: 'island', name: '海岛', en: 'Erangel', icon: '🏝', image: 'assets/map-island.jpg',
  size: '8 × 8 km', playStyle: '综合型，圈形多变，载具与水路都重要',
  summary: '最经典的地图。三个资源核心：P城—学校轴、军事基地、G港—R城轴。中期圈形常往西北或东南切，2 圈开始就要考虑车。',

  pois: [
    { kind: 'major', name: '军事基地', coords: [54.0, 84.3], density: 88, loot: 95, tier: 'S', type: '军事区', note: '全岛最高资源，独木桥与桥头卡点决定生死' },
    { kind: 'major', name: 'P城', coords: [45.0, 56.2], density: 84, loot: 90, tier: 'S', type: '城区', note: '经典刚枪核心，三层楼群密集，房顶视野好' },
    { kind: 'major', name: '研究所', coords: [52.7, 43.3], density: 74, loot: 84, tier: 'A', type: '建筑群', note: '与R城联动，二层楼打点节奏快' },
    { kind: 'major', name: 'R城', coords: [51, 40.2], density: 70, loot: 85, tier: 'A', type: '城区', note: '靠河，转G港与Y城都方便' },
    { kind: 'major', name: 'M城', coords: [72.5, 58.4], density: 72, loot: 85, tier: 'A', type: '城区', note: '南桥卡桥点，加油站载具集中' },
    { kind: 'major', name: 'Y城', coords: [69.9, 30.6], density: 66, loot: 86, tier: 'A', type: '城区', note: '东北大城，楼房高，适合架枪控点' },
    { kind: 'major', name: 'G港', coords: [22.2, 32.3], density: 72, loot: 88, tier: 'A', type: '港口', note: '集装箱+仓库，箱区混战；G港桥四合院结构完整，是职业赛常见的固定点位', pro: 'TC' },
    { kind: 'major', name: 'N港', coords: [77.7, 72.2], density: 62, loot: 82, tier: 'B', type: '港口', note: '军事基地北侧，水路进出方便' },
    { kind: 'major', name: '农场', coords: [61.9, 57.6], density: 54, loot: 74, tier: 'B', type: '野区', note: '散落房区，发育稳定' },
    { kind: 'major', name: '监狱', coords: [76.5, 48.2], density: 58, loot: 82, tier: 'B', type: '建筑群', note: '高墙结构，易守难攻' },
    { kind: 'major', name: '战地医院', coords: [19.6, 42.5], density: 58, loot: 84, tier: 'A', type: '建筑群', note: '西侧高价值点，出装备快' },
    { kind: 'major', name: 'S城', coords: [48.3, 18.6], density: 60, loot: 79, tier: 'B', type: '城区', note: '北岸城区，看住天文台方向' },
    { kind: 'major', name: '靶场', coords: [38.1, 25.2], density: 44, loot: 70, tier: 'C', type: '野区', note: '零星物资，适合绕后偷袭' },
    { kind: 'major', name: '矿场', coords: [22.5, 68.2], density: 44, loot: 70, tier: 'C', type: '野区', note: '西南野区，注意圈形是否切走' },
    { kind: 'major', name: '渔村', coords: [30.4, 70.4], density: 42, loot: 68, tier: 'C', type: '野区', note: '沿海低点，有船；职业赛中常作为沿海发育与转移点', pro: 'JDG' },
    { kind: 'major', name: '核电站', coords: [87.7, 58.7], density: 50, loot: 78, tier: 'B', type: '设施', note: '东岸独立区，房顶与高塔视野好' },
    { kind: 'major', name: 'Z城', coords: [15.0, 17.0], density: 46, loot: 72, tier: 'C', type: '城区', note: '西北角城区，圈切西北时的落点' },
    { kind: 'major', name: '天文台', coords: [69.9, 17.5], density: 55, loot: 80, tier: 'B', type: '设施', note: '北部制高点群，视野覆盖S城与K城' },
    { kind: 'major', name: 'K城', coords: [82.3, 19.8], density: 48, loot: 74, tier: 'C', type: '城区', note: '东北边缘，物资中等，进圈方便' },
    { kind: 'major', name: '山顶废墟', coords: [39.4, 43.7], density: 40, loot: 66, tier: 'C', type: '野区', note: '山顶地形复杂，掩体与反坡多' },
    { kind: 'major', name: '船坞', coords: [44.1, 44.2], density: 46, loot: 72, tier: 'C', type: '港口', note: '中部水岸，快艇刷新点多' },
    { kind: 'major', name: '洋房', coords: [75.5, 39.4], density: 56, loot: 80, tier: 'B', type: '建筑群', note: '洋房 L 房结构完整，是职业赛常见的固定点位', pro: 'ACT' },
    { kind: 'major', name: '防空洞', coords: [71.2, 50.1], density: 58, loot: 80, tier: 'B', type: '设施', note: '地下结构，决赛圈苟分首选' },
    { kind: 'major', name: 'L城', coords: [88.4, 42.4], density: 42, loot: 74, tier: 'C', type: '城区', note: '东岸边缘小城，靠海' },
    { kind: 'major', name: 'G镇', coords: [25.9, 51.1], density: 50, loot: 74, tier: 'B', type: '城区', note: '西部转移枢纽，连接 G港 与 P城 两条主线', pro: 'NV' },
    { kind: 'major', name: 'P港', coords: [25.1, 74.0], density: 40, loot: 72, tier: 'C', type: '港口', note: '西南港口，沿海转移与找船点' }
,
    { kind: 'compound', name: '中南野区房群A', coords: [47.2, 73.1], density: 44, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 12 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '渔村东侧房群', coords: [37.8, 69.3], density: 35, loot: 71, tier: 'C', type: '野区', note: '小房区房群（约 8 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: 'Y城西南侧房群', coords: [66.7, 34.6], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '核电站西侧房群', coords: [82.4, 58.4], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '研究所东侧房群', coords: [57.6, 41.5], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '东南野区房群F', coords: [66.9, 72.1], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '战地医院西北侧房群', coords: [13.7, 37.4], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '战地医院西侧房群', coords: [12.3, 44.1], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中南野区房群I', coords: [56.1, 68.2], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: 'P港西南侧房群', coords: [22.3, 76.9], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中南野区房群K', coords: [62.7, 77.4], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' }  ],

  vehicles: {
    fixed: [
      { type: '吉普车', cat: 'car', count: 2, location: 'M城加油站',      coords: [72.9, 57.0] },
      { type: '吉普车', cat: 'car', count: 1, location: 'P城东加油站',    coords: [47.4, 55.1] },
      { type: '轿车',   cat: 'car', count: 1, location: '学校停车位',      coords: [48.2, 50.1] },
      { type: '皮卡',   cat: 'car', count: 1, location: '农场车棚',        coords: [62.0, 58.3] },
      { type: '皮卡',   cat: 'car', count: 1, location: '监狱院内',        coords: [76.5, 49.4] },
      { type: '蹦蹦',   cat: 'car', count: 2, location: 'R城北侧公路',      coords: [50.5, 40.7] },
      { type: '双人摩托', cat: 'car', count: 1, location: 'Y城街区',       coords: [70.0, 31.7] },
      { type: '快艇',   cat: 'boat', count: 2, location: '军事基地码头',    coords: [57.0, 87.1] },
      { type: '快艇',   cat: 'boat', count: 1, location: 'M城南桥下水域',   coords: [69.9, 63.6] },
      { type: '快艇',   cat: 'boat', count: 2, location: 'Y城水岸',        coords: [66.6, 33.3] }
    ],
    periodic: [
      { type: '吉普车', cat: 'car', location: 'P城中心路口',  coords: [45.2, 56.6], probability: 65 },
      { type: '轿车',   cat: 'car', location: 'G港仓库区',    coords: [22.7, 33.2], probability: 60 },
      { type: '蹦蹦',   cat: 'car', location: '农场周边',     coords: [61.1, 56.7], probability: 70 },
      { type: '双人摩托', cat: 'car', location: '渔村沿海',   coords: [30.6, 71.1], probability: 55 },
      { type: '快艇',   cat: 'boat', location: 'N港泊位',     coords: [78.4, 73.0], probability: 75 },
      { type: '快艇',   cat: 'boat', location: '战地医院西岸', coords: [17.0, 43.5], probability: 50 }
    ],
    special: [
      { type: '舞龙',   cat: 'plane', location: '2026-09-02 新增（4人飞行）', coords: [], probability: 0, note: '金秋龙狮城主题模式专属：低空飞行，腾云可做视线掩护，龙鳞盾随乘员数增强' },
      { type: '醒狮',   cat: 'car',   location: '2026-09-02 新增（双人地面）', coords: [], probability: 0, note: '主题模式专属：爆发加速与二段跳' },
      { type: '鹿车',   cat: 'deer',  location: '2026-09-02 新增（鹿+挂车）', coords: [], probability: 0, note: '冲撞可短时超高速并伤害沿途目标，吹哨可召回' },
      { type: '直升机', cat: 'plane', location: '紧急呼救器召唤（电竞模式屏蔽）', coords: [], probability: 5,  note: '排位/巅峰可用；电竞模式（比赛服）屏蔽紧急呼救器，该模式下不可用' },
      { type: '马',     cat: 'horse', location: '农场—矿场草场',   coords: [46.0, 62.9], probability: 30, note: '静音移动，适合绕后与侦查' },
      { type: '鹿',     cat: 'deer',  location: 'Y城北山林',      coords: [68.0, 27.3], probability: 25, note: '鹿群可骑乘（活动限定），山林随机刷新' }
    ]
  },

  terrains: [
  { id: 'is_fd1', cat: 'ferryDock', name: '渔村轮渡码头', location: '渔村海边', coords: [31.5, 70], risk: '低', tactics: ["找车转移","苟分"], desc: '海岛3.0新增的轮渡起点之一：渔村扩建的栈桥码头，双泊位轮渡船可往返军事基地，比开车过桥快且避开卡桥。', tips: ["轮渡有固定班次间隔，别在栈桥干等","码头开阔无掩体，上下船先封烟"] },
  { id: 'is_fd2', cat: 'ferryDock', name: '军事基地轮渡码头', location: '军事基地南侧', coords: [54, 90.5], risk: '低', tactics: ["找车转移","看屁股"], desc: '海岛3.0新增的轮渡终点：军事基地南侧海岸栈桥码头，跳机场的队伍可坐轮渡快速撤回主岛，绕开两座大桥的卡点。', tips: ["从机场撤离时优先考虑轮渡，桥上最容易被堵","候船时用船体当掩体"] },
    /* ---------- 高点 ---------- */
    { id: 'is_ah1', cat: 'absoluteHigh', name: '军事基地雷达山顶', location: '军事基地', coords: [55.5, 80.6], risk: '中高', landmark: 'radar',
      tactics: ['架枪', '看屁股'], noRescue: true, desc: '海岛最经典的绝对制高点。雷达站山顶，全岛南半部一览无余，圈刷在南侧时是决定性位置。注意：电竞模式（比赛服）屏蔽紧急呼救器，该模式下无法使用。',
      tips: ['只能用紧急呼救器上来，上来前先确认圈往哪切', '山顶掩体少，最多两人上山，其余留山下接应', '下山只能跳伞/滑翔，注意落地位置别被蹲'] },
    { id: 'is_ah2', cat: 'absoluteHigh', name: 'Y城北山最高点', location: 'Y城北', coords: [67.1, 25.8], risk: '中', landmark: 'peak',
      tactics: ['架枪', '探点'], noRescue: true, desc: 'Y城北侧山脊最高处，呼救器可达。视野覆盖 Y城、S城与天文台一线。电竞模式（比赛服）屏蔽紧急呼救器，该模式下不可用。',
      tips: ['圈切东北时价值极高', '山顶风大视野好但没有硬掩体，打完必须换角度', '配合山下队友形成上下交叉火力'] },
    { id: 'is_rh1', cat: 'relativeHigh', name: 'P城东侧山顶', location: 'P城东', coords: [50.7, 52.7], risk: '中', landmark: 'hill',
      tactics: ['架枪', '探点'], desc: '车能开上去的小高地，俯瞰 P城 与学校之间的平原，中期卡位非常好用。',
      tips: ['把车停在背坡，别暴露车影', '可同时压制 P城东口和学校方向', '注意背后矿场方向来人'] },
    { id: 'is_rh2', cat: 'relativeHigh', name: '学校南侧高地', location: '学校南', coords: [49.2, 53.4], risk: '中', landmark: 'hill',
      tactics: ['架枪', '自由手'], desc: '学校与 P城 之间的过渡高地，能看住两条主要转移路线。',
      tips: ['适合 2 圈收枪位', '可观察 M城 方向来车', '低位有反坡可撤'] },
    { id: 'is_rh3', cat: 'relativeHigh', name: '监狱后山', location: '监狱', coords: [84.1, 45.7], risk: '低', landmark: 'hill',
      tactics: ['自由手', '看屁股'], desc: '监狱背后的山体，视野开阔，是东岸少见的稳定高点。',
      tips: ['圈切东岸时提前上山', '后期圈形不利会被围困，注意留车'] },

    /* ---------- 反坡 / 凹坑 ---------- */
    { id: 'is_rs1', cat: 'reverseSlope', name: '学校西侧双反坡', location: '学校西', coords: [45.7, 50.2], risk: '中', landmark: 'slope',
      tactics: ['探点', '自由手'], desc: '两道连续反坡，可完全避开学校楼顶火力接近房区，是低姿态推进的标准示范。',
      tips: ['贴坡走，永远让坡顶在自己与敌人之间', '第一道坡停 5 秒听脚步再上第二道', '被压制时退回坡底换边'] },
    { id: 'is_rs2', cat: 'reverseSlope', name: 'M城南桥北岸反坡', location: 'M城', coords: [70.4, 61.5], risk: '低', landmark: 'slope',
      tactics: ['架枪', '看屁股'], desc: '桥头北岸的缓坡，可以看着桥面同时不被桥上的人看到，卡桥反打的关键地形。',
      tips: ['枪口对桥中段，别只盯桥头', '桥下有水路可退', '被包夹时立刻下水'] },
    { id: 'is_rs3', cat: 'reverseSlope', name: 'R城北长坡', location: 'R城北', coords: [50.1, 38.6], risk: '中', landmark: 'slope',
      tactics: ['突击', '探点'], desc: '连续长坡，可贴着坡线一路推进到 R城 北口，中途几乎没有暴露窗口。',
      tips: ['坡脊上不要停留超过 3 秒', '利用坡顶的灌木做视觉断点'] },
    { id: 'is_pt1', cat: 'pit', name: 'P城东侧大坑', location: 'P城东', coords: [47.9, 57.7], risk: '低', landmark: 'pit',
      tactics: ['苟分', '看屁股'], desc: '自然下凹地形，四周有坡沿遮挡，决赛圈刷在 P城 东南时是极佳的苟分点。',
      tips: ['进坑前先看坡沿有没有人', '坑里视野差，需要队友在坡上给信息', '手雷是坑里最大的威胁，随时准备走'] },
    { id: 'is_pt2', cat: 'pit', name: '农场凹地', location: '农场', coords: [60.8, 56.1], risk: '中', landmark: 'pit',
      tactics: ['探点', '架枪'], desc: '农场旁凹地，可以蹲着观察周边房区，同时只露出头部。',
      tips: ['适合中期苟分过渡', '注意拖拉机/载具从坡顶经过时的声音'] },

    /* ---------- 房型 ---------- */
    { id: 'is_hs1', cat: 'house', name: '三层公寓（P城标型）', location: 'P城 / Y城', coords: [44.4, 56.7], risk: '高', landmark: 'building3',
      tactics: ['架枪', '突击'], desc: '海岛最常见的三层住宅。三楼窗口可控制整条街，但楼梯口是死亡漏斗。',
      tips: ['上楼前先用手雷清二楼拐角', '守楼把沙发/柜子推到楼梯口做掩体', '楼顶视野好但没有掩体，只做短暂观察'] },
    { id: 'is_hs2', cat: 'house', name: '二层独栋（带阳台）', location: '全图通用', coords: [43.2, 54.0], risk: '中', landmark: 'building2',
      tactics: ['探点', '架枪'], desc: '阳台是天然的半掩体射击位，可以站着打、蹲着躲，攻守都很舒服。',
      tips: ['阳台栏杆能挡子弹但会暴露头部', '一楼门窗是唯一入口，注意听脚步'] },
    { id: 'is_hs3', cat: 'house', name: '平房仓库', location: 'G港 / 农场', coords: [23.1, 34.4], risk: '低', landmark: 'warehouse',
      tactics: ['探点', '自由手'], desc: '大跨度平房，物资集中但掩体少，适合快速搜索后立刻转移。',
      tips: ['进门先看两侧死角', '不要在仓库中央停留，贴着墙走'] },
    { id: 'is_tl1', cat: 'toilet', name: 'P城独立厕所', location: 'P城', coords: [45.9, 54.6], risk: '高', landmark: 'toilet',
      tactics: ['苟分'], desc: '单门独立小厕所，决赛圈里是标准的"最后一格"，但一旦被围就没有第二个出口。',
      tips: ['门口放地雷/绊线', '有人靠近时别急着开枪，先听脚步数量', '被手雷逼出时必须立刻冲出去拼枪'] },
    { id: 'is_tl2', cat: 'toilet', name: '学校厕所', location: '学校', coords: [48.8, 51.2], risk: '中', landmark: 'toilet',
      tactics: ['苟分'], desc: '学校外围独立厕所，视野正对学校正门，卡点价值高于苟分价值。',
      tips: ['可以利用它反打学校出来的人', '注意后方 R城 方向'] },
    { id: 'is_tw1', cat: 'tower', name: '军事基地炮楼', location: '军事基地', coords: [54.5, 82.5], risk: '高', landmark: 'tower',
      tactics: ['架枪', '看屁股'], desc: '军事基地内部高台建筑，可俯瞰整个基地跑道与仓库区。',
      tips: ['炮楼是全场焦点，站上去就要做好被集火准备', '打两枪就换窗口', '楼下必须有队友'] },
    { id: 'is_tw2', cat: 'tower', name: '农场瞭望塔', location: '农场', coords: [61.3, 57.1], risk: '中', landmark: 'tower',
      tactics: ['探点', '架枪'], desc: '简易瞭望塔，可以看到农场周边大片平原，中期观察站。',
      tips: ['只做观察不做输出，避免暴露'] },

    /* ---------- 设施 ---------- */
    { id: 'is_gs1', cat: 'gasStation', name: 'M城加油站', location: 'M城', coords: [72.9, 57.2], risk: '中', landmark: 'gas',
      tactics: ['自由手'], desc: '海岛最稳定的找车点之一，固定刷新 2 台吉普，旁边就是南桥。',
      tips: ['落地直接来这儿，拿了车就走', '加油机可以当掩体', '注意从 P城 方向压过来的车'] },
    { id: 'is_gs2', cat: 'gasStation', name: 'P城东加油站', location: 'P城东', coords: [47.2, 55.3], risk: '中', landmark: 'gas',
      tactics: ['自由手', '架枪'], desc: 'P城东侧的补给兼找车点，紧贴公路，转移极快。',
      tips: ['加油站立柱是天然掩体，围绕它绕圈打', '车停到背面再上，别在正面开门'] },
    { id: 'is_bk1', cat: 'bunker', name: '军事基地防空洞', location: '军事基地', coords: [53.0, 83.0], risk: '中', landmark: 'bunker',
      tactics: ['苟分', '突击'], desc: '地下通道结构，决赛圈刷在基地内部时是最安全的容身处。',
      tips: ['洞口只有两个，守住入口就守住一切', '里面很暗，听脚步比看更重要', '被灌雷就顺着通道跑到另一端'] },
    { id: 'is_bk2', cat: 'bunker', name: 'Y城防空洞', location: 'Y城西', coords: [66.6, 31.3], risk: '低', landmark: 'bunker',
      tactics: ['苟分'], desc: 'Y城西侧地下空间，入口隐蔽，后期圈内可稳定苟分。',
      tips: ['提前记住两个出口的方位', '不要在洞口停留'] },
    { id: 'is_pw1', cat: 'powerTower', name: 'P城北电塔', location: 'P城北', coords: [43.7, 51.8], risk: '中', landmark: 'powertower',
      tactics: ['探点', '架枪'], desc: '可攀爬至塔顶，360° 视野覆盖 P城 与学校，是海岛最好的免费观察点之一。',
      tips: ['塔顶没有掩体，只待 10-15 秒', '上下塔时最危险，让队友掩护'] },
    { id: 'is_pw2', cat: 'powerTower', name: '农场高压电塔', location: '农场西', coords: [58.9, 55.7], risk: '中', landmark: 'powertower',
      tactics: ['探点'], desc: '农场西侧电塔，观察 M城—农场 之间的平原走廊。',
      tips: ['适合 3 圈判断进圈方向'] },

    /* ---------- 苟分 ---------- */
    { id: 'is_wp1', cat: 'waterEdge', name: 'M城南桥下', location: 'M城', coords: [69.4, 63.1], risk: '低', landmark: 'water',
      tactics: ['苟分', '看屁股'], desc: '桥下空间大，可以完全避开桥面视线，旁边就有快艇，是后期最好的苟分+撤退组合。',
      tips: ['贴着桥墩蹲，别站在开阔水面', '随时准备上船走水路', '注意桥上有人扔雷'] },
    { id: 'is_wp2', cat: 'waterEdge', name: 'Y城水岸岩石', location: 'Y城', coords: [66.1, 33.8], risk: '低', landmark: 'water',
      tactics: ['苟分'], desc: '岸边岩石群提供硬掩体，圈刷在东北时是难得的低风险点。',
      tips: ['岩石之间可以互相转移', '快艇停靠点在 50 米内'] },
    { id: 'is_wp3', cat: 'waterEdge', name: '军事基地码头', location: '军事基地', coords: [57.0, 87.6], risk: '中', landmark: 'dock',
      tactics: ['自由手'], desc: '码头结构复杂，集装箱、吊机、船坞形成多层掩体，也是快艇集中刷新区。',
      tips: ['集装箱顶可以上，视野好', '撤退路线永远是水'] },
    { id: 'is_hm1', cat: 'hiddenSpot', name: 'Y城北山林', location: 'Y城北', coords: [69.0, 27.8], risk: '低', landmark: 'forest',
      tactics: ['苟分', '探点'], desc: '密集林地，视觉遮挡极强，可以在树后完成整段转移而不被发现。',
      tips: ['树后蹲伏，注意别把身体露在树干两侧', '林中听声辨位比视野更重要'] },
    { id: 'is_hm2', cat: 'hiddenSpot', name: 'P城东山坳', location: 'P城东', coords: [51.6, 55.8], risk: '低', landmark: 'valley',
      tactics: ['苟分'], desc: '两山之间的凹陷地带，从 P城 和学校方向都看不到，是可以"消失"的位置。',
      tips: ['只有从山脊往下看才会发现', '适合决赛圈最后 2 分钟'] },

    /* ---------- 特殊 ---------- */
    { id: 'is_sr1', cat: 'secretRoom', name: '军事基地密室', location: '军事基地', coords: [55.3, 85.5], risk: '低', landmark: 'secret',
      tactics: ['苟分'], desc: '基地地下密室，需要钥匙卡开门，内部有高级物资。',
      tips: ['钥匙卡在基地建筑内随机刷新', '关门后敌人难以进入，但你自己也不好出'] },
    { id: 'is_br1', cat: 'bridge', name: 'M城南桥（主卡桥点）', location: 'M城', coords: [70.9, 62.5], risk: '高', landmark: 'bridge',
      tactics: ['架枪', '探点'], desc: '海岛最著名的卡桥点之一。桥面狭长无掩体，是东岸进圈的必经通道。',
      tips: ['卡桥方：桥头两侧各一人，形成交叉火力', '过桥方：先停车观察，用烟雾铺垫再冲', '永远留一条水路备选'] },
    { id: 'is_br2', cat: 'bridge', name: '军事基地大桥', location: '军事基地', coords: [56.5, 78.7], risk: '高', landmark: 'bridge',
      tactics: ['架枪'], desc: '连接主岛与军事基地的唯一陆路桥，卡桥价值极高，也是圈刷在对岸时最危险的地方。',
      tips: ['桥头两侧的反坡都能卡', '提前 40 秒过桥，绝对不要压圈'] },
    { id: 'is_ex1', cat: 'explosive', name: '军事基地油桶区', location: '军事基地', coords: [53.5, 85.0], risk: '高', landmark: 'explosive',
      tactics: ['突击'], desc: '红色油桶/炸药堆密集区，一发子弹就能引爆，是清角与反清角的双刃剑。',
      tips: ['追人时不要贴着油桶走', '可以把敌人往油桶方向逼，一枪解决'] },
    { id: 'is_ex2', cat: 'explosive', name: 'P城仓库炸药堆', location: 'P城', coords: [45.4, 58.0], risk: '中', landmark: 'explosive',
      tactics: ['突击'], desc: '仓库内的炸药堆，适合做陷阱：引敌人进入后远程引爆。',
      tips: ['提前记住引爆点位置', '自己撤离路线要留 5 米以上'] },
    { id: 'is_lsc1', cat: 'relativeHigh', name: '龙狮城祭坛（9/2 主题模式）', location: '海岛右上角山顶', coords: [74.0, 26.0], risk: '高', landmark: 'peak',
      tactics: ['架枪', '突击'], desc: '2026-09-02 金秋龙狮城主题海岛的主城区，位于海岛右上角山顶；龙狮祭坛可领取载具，属于开局争夺最激烈的点位。',
      tips: ['祭坛载具是前期抢点关键，落地优先拿车', '山顶结构开阔，注意四周高点同时压制', '仅在金秋龙狮城主题模式出现，经典模式无此点'] },
    { id: 'is_lsc2', cat: 'island', name: '争夺龙狮岛（浮空岛）', location: '开局随机停靠城区上空', coords: [60.0, 22.0], risk: '极高', landmark: 'island',
      tactics: ['突击', '探点'], desc: '9/2 新增机制：浮空岛开局随机停靠某个城区上空，可跳伞或通过地面传送阵登岛，岛上的藏宝库会定时开启。',
      tips: ['登岛前先观察浮空岛停在哪个城区，避免和两三队同时上', '藏宝库开启有时间窗，提前 20 秒占住入口', '离岛只能跳伞，注意落点别被山下蹲守'] },
    { id: 'is_is1', cat: 'island', name: '监狱西南小岛', location: '西南海域', coords: [24.4, 53.5], risk: '低', landmark: 'island',
      tactics: ['自由手'], desc: '离岸小岛，前期几乎无人，适合单排发育，但圈形一但切走就必须靠船。',
      tips: ['上岛前先看圈往哪切', '岛上留一艘船', '圈切内陆时提前 1 个圈撤离'] },
    { id: 'is_is2', cat: 'island', name: '军事基地南侧小岛', location: '军事基地南', coords: [56.5, 89.1], risk: '低', landmark: 'island',
      tactics: ['苟分'], desc: '基地南侧的小岛，决赛圈刷在南部海域时价值极高。',
      tips: ['只有船能到，记得留退路', '圈内时是纯苟分点'] }
  ]
};

/* ------------------------- 数据：沙漠 Miramar ------------------------- */
const MAP_DESERT = {
  id: 'desert', name: '沙漠', en: 'Miramar', icon: '🏜', image: 'assets/map-desert.jpg',
  size: '8 × 8 km', playStyle: '山地起伏大，载具决定生死，正面枪线极长',
  summary: '沙漠的精髓是"车 + 高点"。皮卡多—狮城是主战场，圣马丁是中枢。因为掩体少，圈外转移必须提前，反坡是唯一的推进方式。',

  pois: [
    { kind: 'compound', name: '绿洲·北郊湖畔', coords: [12, 22], density: 30, loot: 55, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·青铜城南', coords: [25, 30], density: 34, loot: 57, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·新山城西', coords: [20, 35], density: 38, loot: 59, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·电站西南', coords: [20, 40], density: 30, loot: 61, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·大矿山北', coords: [62, 30], density: 34, loot: 55, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·橙花镇西北', coords: [80, 20], density: 38, loot: 57, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·滨海小镇东', coords: [30, 68], density: 30, loot: 59, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·监狱东北', coords: [32, 76], density: 34, loot: 61, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·西南荒漠', coords: [15, 85], density: 38, loot: 55, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·狮城南郊', coords: [48, 80], density: 30, loot: 57, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·普罗港西', coords: [55, 85], density: 34, loot: 59, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·东南海岸', coords: [88, 75], density: 38, loot: 61, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'compound', name: '绿洲·滨海东岸', coords: [85, 80], density: 30, loot: 55, tier: 'C', type: '绿洲', note: '战场进化新增的沙漠绿洲：绿植+小湖+少量房屋，打野发育点，注意离城区远、记得留载具' },
    { kind: 'major', name: '皮卡多', coords: [47.6, 50.3], density: 86, loot: 92, tier: 'S', type: '城区', note: '沙漠最热城区，拳击馆+高楼群，正面枪线复杂' },
    { kind: 'major', name: '狮城', coords: [58.9, 58.5], density: 74, loot: 86, tier: 'A', type: '城区', note: '东南大城，房型单一但数量多' },
    { kind: 'major', name: '军事基地', coords: [69.0, 12.2], density: 80, loot: 94, tier: 'S', type: '军事区', note: '北部军事区，塔楼是绝对制高点' },
    { kind: 'major', name: '圣马丁', coords: [49.2, 33.1], density: 62, loot: 80, tier: 'A', type: '城区', note: '地图中枢，东西南北都要路过' },
    { kind: 'major', name: '伊波城', coords: [28.8, 32.3], density: 66, loot: 84, tier: 'A', type: '城区', note: '西北城区，楼顶视野好' },
    { kind: 'major', name: '新山城', coords: [31.9, 43.7], density: 58, loot: 79, tier: 'B', type: '城区', note: '西侧中转城，房型密集' },
    { kind: 'major', name: '水厂', coords: [53.1, 24.8], density: 54, loot: 78, tier: 'B', type: '设施', note: '北侧水厂，管道结构掩体多' },
    { kind: 'major', name: '电站', coords: [42.7, 41.0], density: 50, loot: 77, tier: 'B', type: '设施', note: '中部电站，高塔视野好' },
    { kind: 'major', name: '橙花镇', coords: [73.9, 29.9], density: 56, loot: 81, tier: 'B', type: '城区', note: '东北小镇，靠山易守' },
    { kind: 'major', name: '青铜城', coords: [35.2, 14.1], density: 60, loot: 82, tier: 'B', type: '城区', note: '北部城区，半径大搜索慢' },
    { kind: 'major', name: '墓地', coords: [55.7, 42.3], density: 42, loot: 70, tier: 'C', type: '野区', note: '开阔地，掩体是墓碑' },
    { kind: 'major', name: '大矿山', coords: [62.2, 42.9], density: 52, loot: 76, tier: 'B', type: '设施', note: '矿石堆是天然掩体' },
    { kind: 'major', name: '度假村', coords: [56.1, 70.7], density: 62, loot: 83, tier: 'A', type: '城区', note: '南部海边，圈常收在此' },
    { kind: 'major', name: '滨海小镇', coords: [24.9, 66.0], density: 46, loot: 74, tier: 'C', type: '城区', note: '西南靠海，进出都要过桥' },
    { kind: 'major', name: '监狱', coords: [23.2, 77.2], density: 54, loot: 78, tier: 'B', type: '建筑群', note: '独立岛屿，高墙结构' },
    { kind: 'major', name: '普罗港', coords: [71.9, 67.3], density: 58, loot: 80, tier: 'B', type: '港口', note: '东南港口，集装箱+船' }
,
    { kind: 'compound', name: '皮卡多西南侧房群', coords: [40.9, 53.6], density: 46, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 28 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '军事基地东南侧房群', coords: [76.6, 16.0], density: 46, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 18 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '橙花镇南侧房群', coords: [75.3, 34.0], density: 46, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 15 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '西部野区房群D', coords: [18.3, 45.7], density: 42, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 11 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '东北野区房群E', coords: [86.9, 32.9], density: 37, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 9 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '西部野区房群F', coords: [28.2, 54.2], density: 35, loot: 71, tier: 'C', type: '野区', note: '小房区房群（约 8 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '东部野区房群G', coords: [72.9, 51.7], density: 33, loot: 68, tier: 'C', type: '野区', note: '小房区房群（约 7 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '橙花镇西北侧房群', coords: [69.7, 21.7], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '伊波城西侧房群', coords: [23.1, 31.9], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '狮城南侧房群', coords: [58.3, 64.5], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '度假村西北侧房群', coords: [53.8, 65.9], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '滨海小镇南侧房群', coords: [24.9, 71.7], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '水厂东北侧房群', coords: [59.6, 19.2], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '圣马丁东侧房群', coords: [54.3, 33.7], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '伊波城西侧房群', coords: [20.7, 35.5], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '东部野区房群P', coords: [83.3, 58.9], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中南野区房群Q', coords: [37.6, 73.8], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中南野区房群R', coords: [38.9, 79.5], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '东北野区房群S', coords: [85.7, 20.0], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '伊波城北侧房群', coords: [27.0, 25.8], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '橙花镇西南侧房群', coords: [68.1, 32.9], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '滨海小镇西南侧房群', coords: [16.0, 70.2], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' }  ],

  vehicles: {
    fixed: [
      { type: '皮卡',   cat: 'car', count: 2, location: '皮卡多加油站',  coords: [47.4, 51.3] },
      { type: '吉普车', cat: 'car', count: 1, location: '军事基地',      coords: [69.2, 13.0] },
      { type: '双人摩托', cat: 'car', count: 2, location: '圣马丁公路',  coords: [49.2, 32.0] },
      { type: '皮卡',   cat: 'car', count: 1, location: '狮城中心',      coords: [58.9, 59.3] },
      { type: '蹦蹦',   cat: 'car', count: 2, location: '伊波城北',      coords: [28.8, 31.0] },
      { type: '吉普车', cat: 'car', count: 1, location: '度假村停车场',  coords: [56.2, 71.5] },
      { type: '快艇',   cat: 'boat', count: 2, location: '普罗港码头',   coords: [72.4, 68.1] },
      { type: '快艇',   cat: 'boat', count: 1, location: '滨海小镇岸边', coords: [24.3, 67.2] }
    ],
    periodic: [
      { type: '皮卡',   cat: 'car', location: '皮卡多东口',   coords: [48.8, 50.7], probability: 70 },
      { type: '吉普车', cat: 'car', location: '圣马丁北侧',   coords: [48.8, 31.2], probability: 60 },
      { type: '蹦蹦',   cat: 'car', location: '电站周边',     coords: [42.5, 41.9], probability: 55 },
      { type: '双人摩托', cat: 'car', location: '新山城南',   coords: [31.9, 45.0], probability: 60 },
      { type: '快艇',   cat: 'boat', location: '监狱码头',    coords: [23.2, 78.7], probability: 65 }
    ],
    special: [
      { type: '直升机', cat: 'plane', location: '空投/呼救器随机', coords: [], probability: 5, note: '沙漠掩体少，直升机价值更高' },
      { type: '马',     cat: 'horse', location: '青铜城—农场牧场', coords: [38.0, 22.2], probability: 28, note: '沙漠马匹多，静音绕后神器' },
      { type: '鹿',     cat: 'deer',  location: '大矿山林地',     coords: [61.9, 44.2], probability: 15, note: '绿洲附近概率更高' }
    ]
  },

  terrains: [
    { id: 'ds_ah1', cat: 'absoluteHigh', name: '军事基地塔楼顶', location: '军事基地', coords: [68.4, 13.1], risk: '高', landmark: 'radar',
      tactics: ['架枪', '看屁股'], noRescue: true, desc: '呼救器专属点位，360° 视野覆盖整个北部军事区与青铜城方向，是沙漠最强的高点。电竞模式（比赛服）屏蔽紧急呼救器，该模式下不可用。',
      tips: ['只有呼救器能上，注意落点别摔死', '塔顶没有掩体，最多待 15 秒', '圈切北部时这是决定胜负的位置'] },
    { id: 'ds_rh1', cat: 'relativeHigh', name: '圣马丁山顶', location: '圣马丁', coords: [49.3, 29.7], risk: '中', landmark: 'peak',
      tactics: ['架枪', '探点'], desc: '沙漠地图的中枢高地，视野可以同时覆盖水厂、电站与伊波城方向。',
      tips: ['车可以开上去，把车藏背坡', '这是 2-3 圈最重要的信息位', '注意东西两侧的反坡绕后'] },
    { id: 'ds_rh2', cat: 'relativeHigh', name: '大矿山北脊', location: '大矿山', coords: [60.7, 40.8], risk: '中', landmark: 'hill',
      tactics: ['架枪'], desc: '矿区北侧的岩石山脊，硬掩体多，是中部平原上少见的稳定高点。',
      tips: ['岩石之间可转移，不容易被一枪带走', '可压制皮卡多—狮城公路'] },
    { id: 'ds_rh3', cat: 'relativeHigh', name: '度假村后山', location: '度假村', coords: [57.5, 68.7], risk: '低', landmark: 'hill',
      tactics: ['架枪', '自由手'], desc: '南部海岸线后方的高地，圈收在南侧时的收枪位。',
      tips: ['注意海里上来的敌人', '圈往内陆切要立刻转移，这里没有退路'] },
    { id: 'ds_rs1', cat: 'reverseSlope', name: '狮城北坡', location: '狮城', coords: [58.2, 56.3], risk: '中', landmark: 'slope',
      tactics: ['探点', '架枪'], desc: '沙漠最标准的长反坡，可以完全贴着坡线接近狮城北口而不被发现。',
      tips: ['坡线是生死线，绝对不要越过去看风景', '配合队友从正面吸引火力再上'] },
    { id: 'ds_rs2', cat: 'reverseSlope', name: '皮卡多南侧沙丘', location: '皮卡多', coords: [46.8, 52.9], risk: '中', landmark: 'slope',
      tactics: ['探点', '自由手'], desc: '连续的沙丘反坡，是接近皮卡多南口的唯一安全路线。',
      tips: ['沙丘会扬尘，移动时注意暴露', '被压制就退到第二道沙丘'] },
    { id: 'ds_rs3', cat: 'reverseSlope', name: '监狱岛进岛坡', location: '监狱', coords: [23.7, 79.7], risk: '中', landmark: 'slope',
      tactics: ['突击'], desc: '监狱岛北部登陆坡，涨落潮形成天然反坡，适合登岛。',
      tips: ['登岛前先观察高墙上的枪口'] },
    { id: 'ds_pt1', cat: 'pit', name: '墓地周围凹地', location: '墓地', coords: [58.8, 43.3], risk: '低', landmark: 'pit',
      tactics: ['苟分'], desc: '墓葬坑与天然凹地交错，开阔平原上唯一的低位掩体群。',
      tips: ['适合被压制时保命', '注意手雷，这里很密集'] },
    { id: 'ds_pt2', cat: 'pit', name: '小矿山废坑', location: '小矿山', coords: [33.1, 65.9], risk: '低', landmark: 'pit',
      tactics: ['苟分', '探点'], desc: '废弃矿坑，坑深且四面有坡沿，中后期转移的绝佳中转站。',
      tips: ['坑内视野只到坡沿，需要坡上队友报点'] },
    { id: 'ds_hs1', cat: 'house', name: '皮卡多拳击馆', location: '皮卡多', coords: [47.0, 49.9], risk: '高', landmark: 'building3',
      tactics: ['突击', '架枪'], desc: '沙漠最著名的房型。二层看台环绕中央擂台，落地混战的主舞台。',
      tips: ['进门先看二楼看台，那里总有人', '中央擂台是死亡区，只做最后清场', '出口多，注意别被绕后'] },
    { id: 'ds_hs2', cat: 'house', name: '沙漠双层平顶房', location: '全图通用', coords: [58.3, 59.8], risk: '中', landmark: 'building2',
      tactics: ['架枪', '探点'], desc: '平顶可上，落地窗视野好，是沙漠最常见的驻守房型。',
      tips: ['平顶没有掩体，注意远处山头', '利用落地窗打斜角'] },
    { id: 'ds_tl1', cat: 'toilet', name: '圣马丁独立厕所', location: '圣马丁', coords: [48.7, 34.7], risk: '高', landmark: 'toilet',
      tactics: ['苟分'], desc: '路口独立厕所，视野正对圣马丁主路，卡点价值高但极易被围。',
      tips: ['门后蹲伏，别站起来开镜'] },
    { id: 'ds_tw1', cat: 'tower', name: '水厂高塔', location: '水厂', coords: [53.5, 25.8], risk: '高', landmark: 'tower',
      tactics: ['架枪', '探点'], desc: '水厂的高塔结构，可俯瞰北部平原和圣马丁方向。',
      tips: ['塔上很显眼，只做短时观察'] },
    { id: 'ds_gs1', cat: 'gasStation', name: '皮卡多加油站', location: '皮卡多', coords: [47.4, 51.4], risk: '高', landmark: 'gas',
      tactics: ['自由手'], desc: '沙漠最关键的找车点，固定刷 2 台皮卡，旁边就是主干道。',
      tips: ['落地抢车时先看加油机后面的死角', '拿到车直接走，别在城里恋战'] },
    { id: 'ds_bk1', cat: 'bunker', name: '军事基地地道', location: '军事基地', coords: [69.4, 14.1], risk: '中', landmark: 'bunker',
      tactics: ['苟分', '突击'], desc: '基地内部的地下通道，连接多个建筑，决赛圈安全屋。',
      tips: ['记住通道两端出口', '被灌雷就换边'] },
    { id: 'ds_pw1', cat: 'powerTower', name: '电站高压电塔', location: '电站', coords: [41.9, 40.1], risk: '中', landmark: 'powertower',
      tactics: ['探点'], desc: '中部电塔，可观察皮卡多、圣马丁两方向的车辆动向。',
      tips: ['用来判断 2 圈之后哪些队伍在转移'] },
    { id: 'ds_wp1', cat: 'waterEdge', name: '普罗港岸边', location: '普罗港', coords: [72.4, 68.6], risk: '低', landmark: 'dock',
      tactics: ['苟分', '自由手'], desc: '港口岸边集装箱与吊机形成多层掩体，快艇集中，是南部圈的撤退枢纽。',
      tips: ['集装箱顶视野好', '随时可以上船绕海'] },
    { id: 'ds_hm1', cat: 'hiddenSpot', name: '橙花镇后山沟', location: '橙花镇', coords: [73.4, 31.9], risk: '低', landmark: 'valley',
      tactics: ['苟分'], desc: '东北山沟，从城区和公路方向都看不到，适合隐藏转移。',
      tips: ['不要在山脊走出轮廓线'] },
    { id: 'ds_br1', cat: 'bridge', name: '圣马丁大桥', location: '圣马丁', coords: [50.0, 35.6], risk: '高', landmark: 'bridge',
      tactics: ['架枪'], desc: '连接中部与南部的关键桥，卡桥能一夫当关。',
      tips: ['桥头两侧各一人交叉火力', '过桥必须提前，被卡住就只能走水'] },
    { id: 'ds_br2', cat: 'bridge', name: '监狱岛大桥', location: '监狱', coords: [23.2, 74.6], risk: '高', landmark: 'bridge',
      tactics: ['架枪'], desc: '通往监狱岛的唯一陆桥，圈切岛上时的必争之地。',
      tips: ['注意桥下浅滩可涉水绕行'] },
    { id: 'ds_ex1', cat: 'explosive', name: '皮卡多油罐区', location: '皮卡多', coords: [47.9, 49.1], risk: '高', landmark: 'explosive',
      tactics: ['突击'], desc: '城区边缘的油罐堆，引爆可覆盖大片区域。',
      tips: ['不要把它当掩体，被打中会连锁爆炸'] },
    { id: 'ds_sr1', cat: 'secretRoom', name: '军事基地军械库密室', location: '军事基地', coords: [69.7, 13.4], risk: '低', landmark: 'secret',
      tactics: ['苟分', '突击'], desc: '基地建筑地下的军械库密室，需要钥匙卡，内部高价值物资集中，是北部的安全屋。',
      tips: ['钥匙卡在基地建筑内刷新', '进密室前先确认外面没有队伍蹲守', '密室只有一个出入口，被人堵住非常危险'] },
    { id: 'ds_wp2', cat: 'waterEdge', name: '度假村海滩', location: '度假村', coords: [56.5, 72.7], risk: '低', landmark: 'water',
      tactics: ['苟分'], desc: '南部海岸的沙滩与礁石，圈收在最南端时是少有的低风险点位。',
      tips: ['注意海面上来的船', '沙滩没有掩体，必须贴着礁石走'] },
    { id: 'ds_hm2', cat: 'hiddenSpot', name: '大矿山矿洞', location: '大矿山', coords: [61.9, 45.3], risk: '低', landmark: 'valley',
      tactics: ['苟分', '探点'], desc: '废弃矿洞入口，山体遮挡极强，可以在里面等待圈形收缩。',
      tips: ['洞口视野只到正前方，需要队友在山脊给信息', '被灌雷时可以通过矿洞通道换位置'] },
    { id: 'ds_is1', cat: 'island', name: '监狱岛', location: '西南海域', coords: [23.2, 77.2], risk: '低', landmark: 'island',
      tactics: ['自由手'], desc: '独立岛屿结构，只靠一座桥连接，前期极安全，但圈切走就必须抢桥。',
      tips: ['进岛前确认圈形', '上岛后立刻留一台车/一艘船'] }
  ]
};

/* ------------------------- 数据：荣都 Rondo ------------------------- */
const MAP_RONGDU = {
  id: 'rongdu', name: '荣都', en: 'Rondo', icon: '🏙', image: 'assets/map-rongdu.jpg',
  size: '8 × 8 km', playStyle: '水系与城市并存，高楼多、室内战多，桥梁是命脉',
  summary: '荣都以"高楼+水系"为特色。体育场、赛车场是刚枪核心，朝天城与嘉城是物资城。地图内河多，桥与船的价值远超其他地图。',

  pois: [
    { kind: 'major', name: '体育场', coords: [34.2, 30.0], density: 84, loot: 94, tier: 'S', type: '地标', note: '环形看台上下层结构复杂，落地战最激烈，也是职业赛偏爱的落点', pro: 'KONE' },
    { kind: 'major', name: '赛车场', coords: [54.6, 41.5], density: 80, loot: 92, tier: 'S', type: '地标', note: '大型场馆+汽车厂，资源顶级、载具多，职业赛使用率很高', pro: 'RSG/ST' },
    { kind: 'major', name: '朝天城', coords: [22.7, 46.1], density: 68, loot: 84, tier: 'A', type: '城区', note: '西部大城，楼房高、天台视野好，适合控西侧圈', pro: 'STE' },
    { kind: 'major', name: '嘉城', coords: [87.2, 66.8], density: 64, loot: 86, tier: 'A', type: '城区', note: '东部水岸城，靠桥连接、物资丰富，圈切东部时是核心点', pro: 'SR/ST' },
    { kind: 'major', name: '龙城', coords: [61.4, 84.1], density: 58, loot: 82, tier: 'A', type: '城区', note: '南部城区，近码头有水路，圈切南部时是核心点' },
    { kind: 'major', name: '荣江口', coords: [35.7, 81.8], density: 62, loot: 82, tier: 'A', type: '城区', note: '河口城区，桥梁交汇，是南部圈的核心争夺点', pro: 'KSG' },
    { kind: 'major', name: '淮乡', coords: [85.3, 16.1], density: 54, loot: 78, tier: 'B', type: '城区', note: '东北城区，山城结构' },
    { kind: 'major', name: '磨河镇', coords: [71.0, 15.7], density: 56, loot: 79, tier: 'B', type: '城区', note: '北部河镇，靠水易守' },
    { kind: 'major', name: '新工小镇', coords: [60.7, 66.4], density: 56, loot: 78, tier: 'B', type: '城区', note: '中部小镇，转移枢纽，连接工业园与嘉城方向', pro: 'VS' },
    { kind: 'major', name: '工业园', coords: [43.8, 73.7], density: 54, loot: 78, tier: 'B', type: '设施', note: '厂房多、室内战为主，掩体密集适合中期驻守', pro: 'STE/KONE' },
    { kind: 'major', name: '余林镇', coords: [39.9, 51.1], density: 58, loot: 78, tier: 'B', type: '城区', note: '地图正中、四方要道，任何圈形都可能路过', pro: 'NV' },
    { kind: 'major', name: '百里乡', coords: [13.4, 24.6], density: 42, loot: 70, tier: 'C', type: '野区', note: '西北野区，人少发育稳' },
    { kind: 'major', name: '材料厂', coords: [13.1, 60.3], density: 44, loot: 73, tier: 'C', type: '设施', note: '西南厂区，物资中等，适合西部发育与中转', pro: 'TC/KBG' },
    { kind: 'major', name: '桃叶镇', coords: [80.3, 38.0], density: 50, loot: 76, tier: 'B', type: '城区', note: '东部山城，高点视野好' },
    { kind: 'major', name: '荣王府', coords: [71.4, 35.3], density: 54, loot: 80, tier: 'B', type: '地标', note: '大型院落建筑，室内结构复杂，掩体多', pro: 'KBG' },
    { kind: 'major', name: '落马庄', coords: [17.7, 86.4], density: 40, loot: 69, tier: 'C', type: '野区', note: '西南野区，远离主战场' }
,
    { kind: 'compound', name: '磨河镇西北侧房群', coords: [66.0, 9.1], density: 44, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 12 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '工业园东南侧房群', coords: [46.9, 76.3], density: 40, loot: 74, tier: 'C', type: '野区', note: '小房区房群（约 10 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '桃叶镇东侧房群', coords: [86.9, 39.6], density: 35, loot: 71, tier: 'C', type: '野区', note: '小房区房群（约 8 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '龙城南侧房群', coords: [61.0, 90.3], density: 33, loot: 68, tier: 'C', type: '野区', note: '小房区房群（约 7 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中北野区房群E', coords: [56.7, 14.4], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '赛车场东侧房群', coords: [60.3, 41.4], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中部野区房群G', coords: [62.6, 48.8], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '东部野区房群H', coords: [79.7, 54.5], density: 31, loot: 65, tier: 'C', type: '野区', note: '小房区房群（约 6 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中北野区房群I', coords: [44.9, 5.2], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '余林镇西南侧房群', coords: [36.4, 55.9], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '材料厂南侧房群', coords: [12.0, 64.5], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '嘉城东南侧房群', coords: [90.4, 73.5], density: 29, loot: 62, tier: 'C', type: '野区', note: '小房区房群（约 5 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '西北野区房群M', coords: [29.5, 8.9], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '磨河镇西南侧房群', coords: [67.9, 22.9], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '磨河镇南侧房群', coords: [73.4, 24.0], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' },
    { kind: 'compound', name: '中北野区房群P', coords: [49.0, 28.9], density: 26, loot: 58, tier: 'C', type: '野区', note: '小房区房群（约 4 栋建筑），适合野点发育：搜完立刻转下一个房群，注意这里没有载具就不建议久留' }  ],

  vehicles: {
    fixed: [
      { type: '轿车',   cat: 'car', count: 2, location: '赛车场车库',  coords: [54.5, 42.2] },
      { type: '轿车',   cat: 'car', count: 1, location: '体育场停车场', coords: [34.4, 30.5] },
      { type: '吉普车', cat: 'car', count: 1, location: '朝天城车库',  coords: [22.9, 47.1] },
      { type: '蹦蹦',   cat: 'car', count: 2, location: '余林镇路口',  coords: [39.9, 52.1] },
      { type: '拉力赛车', cat: 'car', count: 1, location: '赛车场赛道', coords: [55.2, 41.6] },
      { type: '快艇',   cat: 'boat', count: 3, location: '龙城码头',   coords: [61.4, 86.0] },
      { type: '快艇',   cat: 'boat', count: 2, location: '嘉城水岸',   coords: [86.5, 67.5] },
      { type: '渣土车', cat: 'car', count: 1, location: '工业园工地（电竞模式屏蔽）', coords: [44.0, 74.5] },
      { type: '挖掘机', cat: 'car', count: 1, location: '新工小镇工地（电竞模式屏蔽）', coords: [60.0, 68.5] },
      { type: '快艇',   cat: 'boat', count: 1, location: '荣江口码头', coords: [35.7, 83.0] }
    ],
    periodic: [
      { type: '轿车',   cat: 'car', location: '体育场北门',   coords: [34.2, 28.2], probability: 75 },
      { type: '吉普车', cat: 'car', location: '嘉城主街',     coords: [87.0, 68.0], probability: 60 },
      { type: '蹦蹦',   cat: 'car', location: '工业园厂区',   coords: [43.8, 74.5], probability: 65 },
      { type: '双人摩托', cat: 'car', location: '桃叶镇山路', coords: [80.0, 39.0], probability: 55 },
      { type: '快艇',   cat: 'boat', location: '磨河镇河边', coords: [70.5, 17.5], probability: 60 }
    ],
    special: [
      { type: '直升机', cat: 'plane', location: '空投/呼救器随机', coords: [], probability: 5,  note: '荣都高楼多，直升机可直达楼顶' },
      { type: '马',     cat: 'horse', location: '百里乡—材料厂草场', coords: [14.0, 30.2], probability: 32, note: '荣都马匹刷新率高，林区转移首选' },
      { type: '鹿',     cat: 'deer',  location: '紫竹园—百草坡',   coords: [46.2, 31.3], probability: 28, note: '鹿群常出现在竹林与草坡' }
    ]
  },

  terrains: [
  { id: 'rd_ad1', cat: 'airdropGun', name: '荣江口空投枪点', location: '荣江口', coords: [37.5, 80.5], risk: '低', tactics: ["探点","架枪"], desc: '荣江口的三级交易所区人机背包固定刷空投武器，全图仅有的两个必刷点之一，落地争夺最凶的位置。', tips: ["开局直接冲背包点，晚 30 秒就没","拿枪后立刻转移，别在交易所恋战"] },
  { id: 'rd_ad2', cat: 'airdropGun', name: '荣王府空投枪点', location: '荣王府', coords: [72.6, 35], risk: '低', tactics: ["探点","架枪"], desc: '荣王府的三级交易所区人机背包固定刷空投武器，与荣江口并列为全图两大必刷点。', tips: ["王府建筑群复杂，先清人再开包","空投枪自带红点/高倍，近距离腰射强"] },
  { id: 'rd_bc1', cat: 'beacon', name: '百里乡北召唤基站', location: '百里乡北', coords: [20, 15], risk: '中', tactics: ["看屁股","苟分"], desc: '野外召唤基站，围绕它打「残编收人」战术：远距离淘汰对手后拉队友复活滚雪球。', tips: ["复活约10秒且有音效提示，先封烟","决赛圈前记得撤离，基站不刷物资"] },
  { id: 'rd_bc2', cat: 'beacon', name: '体育场北召唤基站', location: '体育场北', coords: [38, 20], risk: '中', tactics: ["探点"], desc: '体育场城区外围基站，城区战损后快速补员再战。', tips: ["基站常有人蹲，接近前先绕观察","顺路可搜城郊房区"] },
  { id: 'rd_bc3', cat: 'beacon', name: '磨河镇东召唤基站', location: '磨河镇东', coords: [75, 15], risk: '中', tactics: ["看屁股"], desc: '东北城区带基站，与淮乡、磨河镇形成补员三角区。', tips: ["载具直达，复活后立刻上车转移"] },
  { id: 'rd_bc4', cat: 'beacon', name: '桃叶镇东南召唤基站', location: '桃叶镇东南', coords: [95, 28], risk: '中', tactics: ["苟分"], desc: '东海岸基站，圈刷东边时的关键复活位。', tips: ["临海注意背后水上方向来人"] },
  { id: 'rd_bc5', cat: 'beacon', name: '材料厂东召唤基站', location: '材料厂东', coords: [12, 60], risk: '中', tactics: ["苟分"], desc: '西南工业带基站，野区发育流的核心补员点。', tips: ["附近无大城，安全但物资差"] },
  { id: 'rd_bc6', cat: 'beacon', name: '荣江口北召唤基站', location: '荣江口北', coords: [35, 65], risk: '中', tactics: ["探点"], desc: '荣江口与朝天城之间的野区基站，中期转移顺路复活。', tips: ["沿江转移时留意，别在开阔地停留"] },
  { id: 'rd_bc7', cat: 'beacon', name: '龙城西北召唤基站', location: '龙城西北', coords: [58, 62], risk: '中', tactics: ["看屁股"], desc: '南部大城区带基站，龙城战损补员首选。', tips: ["复活后从北坡反打龙城有高打低优势"] },
  { id: 'rd_bc8', cat: 'beacon', name: '嘉城南召唤基站', location: '嘉城南', coords: [88, 80], risk: '中', tactics: ["苟分"], desc: '东南角基站，终圈收东南时的最后补员机会。', tips: ["位置偏僻，一般无争夺"] },
    { id: 'rd_ah1', cat: 'absoluteHigh', name: '体育场穹顶', location: '体育场', coords: [33.8, 28.5], risk: '高', landmark: 'radar',
      tactics: ['架枪', '看屁股'], noRescue: true, desc: '呼救器可达的穹顶结构，俯瞰整个体育场与周边城区，落地战结束后最强的控场位。电竞模式（比赛服）屏蔽紧急呼救器，该模式下不可用。',
      tips: ['穹顶边缘无掩体，注意四周高楼', '落地战还没打完时不要上来，会被四面打'] },
    { id: 'rd_ah2', cat: 'absoluteHigh', name: '嘉城电视塔顶', location: '嘉城', coords: [87.0, 65.0], risk: '高', landmark: 'radar',
      tactics: ['架枪'], noRescue: true, desc: '呼救器专属高点，可看到嘉城、桃叶镇与整条河道。电竞模式（比赛服）屏蔽紧急呼救器，该模式下不可用。',
      tips: ['圈切东部时抢这个点', '下山只能飞，注意落地位置'] },
    { id: 'rd_rh1', cat: 'relativeHigh', name: '朝天城后山', location: '朝天城', coords: [23.0, 42.2], risk: '中', landmark: 'peak',
      tactics: ['架枪', '探点'], desc: '朝天城北侧山体，可以看到城市全貌与西部野区，是荣都西部最重要的信息位。',
      tips: ['车可以绕上去，停隐蔽处', '注意百里乡方向绕后的队伍'] },
    { id: 'rd_rh2', cat: 'relativeHigh', name: '桃叶镇山脊', location: '桃叶镇', coords: [80.5, 35.0], risk: '中', landmark: 'hill',
      tactics: ['架枪'], desc: '东部山脊，视野覆盖嘉城与磨河镇之间的河道走廊。',
      tips: ['适合观察水路转移的队伍'] },
    { id: 'rd_rh3', cat: 'relativeHigh', name: '赛车场看台顶', location: '赛车场', coords: [55.1, 39.8], risk: '高', landmark: 'hill',
      tactics: ['架枪', '探点'], desc: '赛车场看台最高处，可以看到整个场馆与汽车厂，是圈刷中部时的必争点。',
      tips: ['看台上目标明显，速战速决', '下来时走内侧楼梯'] },
    { id: 'rd_rs1', cat: 'reverseSlope', name: '朝天城西林坡', location: '朝天城西', coords: [20.0, 47.6], risk: '低', landmark: 'forest',
      tactics: ['苟分', '探点'], desc: '林地与反坡连续地形，可以从西侧完全隐蔽地接近朝天城。',
      tips: ['林中移动压低姿态', '坡脊不要露轮廓'] },
    { id: 'rd_rs2', cat: 'reverseSlope', name: '荣江口河堤反坡', location: '荣江口', coords: [35.0, 79.5], risk: '中', landmark: 'slope',
      tactics: ['探点', '架枪'], desc: '河堤形成天然反坡，可沿堤接近河口城区，同时避开对岸火力。',
      tips: ['堤上注意对岸高点', '堤下可以走船'] },
    { id: 'rd_rs3', cat: 'reverseSlope', name: '赛车场南坡', location: '赛车场', coords: [54.2, 43.9], risk: '中', landmark: 'slope',
      tactics: ['突击'], desc: '赛道外侧的斜坡，可绕过正面入口从南侧进入场馆。',
      tips: ['配合队友正面拉扯'] },
    { id: 'rd_pt1', cat: 'pit', name: '余林镇采石坑', location: '余林镇', coords: [40.5, 53.1], risk: '低', landmark: 'pit',
      tactics: ['苟分'], desc: '采石场形成的深坑，四面坡沿，地图正中难得的低位掩体。',
      tips: ['坑内注意手雷', '出口只有两条，被堵就危险'] },
    { id: 'rd_pt2', cat: 'pit', name: '新工小镇基坑', location: '新工小镇', coords: [60.0, 68.0], risk: '中', landmark: 'pit',
      tactics: ['苟分', '探点'], desc: '工地基坑，配合周边建筑形成立体掩体网。',
      tips: ['基坑 + 楼顶是很好的上下配合点'] },
    { id: 'rd_hs1', cat: 'house', name: '荣都高层公寓', location: '嘉城 / 朝天城', coords: [86.5, 68.5], risk: '高', landmark: 'building3',
      tactics: ['架枪', '突击'], desc: '荣都特色高层住宅，楼层多、楼梯窄，天台视野极好。',
      tips: ['上楼前先清楼梯拐角，荣都楼梯特别容易埋伏', '天台打完立刻下两层换位', '消防梯是唯一的第二出口'] },
    { id: 'rd_hs2', cat: 'house', name: '赛车场厂房', location: '赛车场', coords: [56.2, 41.9], risk: '高', landmark: 'warehouse',
      tactics: ['突击', '架枪'], desc: '大跨度工业厂房，内部有天车轨道和二层平台，室内立体战。',
      tips: ['进门先看二层平台', '利用天车轨道做视觉遮挡'] },
    { id: 'rd_hs3', cat: 'house', name: '荣王府院落', location: '荣王府', coords: [71.0, 36.1], risk: '中', landmark: 'building2',
      tactics: ['探点', '架枪'], desc: '传统院落建筑，围墙形成天然掩体，院内房间多。',
      tips: ['围墙缺口是主要交火线', '院内视野差，靠听声'] },
    { id: 'rd_tl1', cat: 'toilet', name: '余林镇独立厕所', location: '余林镇', coords: [39.5, 50.1], risk: '高', landmark: 'toilet',
      tactics: ['苟分'], desc: '路口独立厕所，决赛圈里可以守住一格，但出口只有一扇门。',
      tips: ['门口放绊线', '听脚步判断人数再决定开不开枪'] },
    { id: 'rd_tw1', cat: 'tower', name: '工业园水塔', location: '工业园', coords: [43.0, 72.5], risk: '高', landmark: 'tower',
      tactics: ['架枪', '探点'], desc: '工业园水塔，可俯瞰厂区与河道，中部圈的观察点。',
      tips: ['塔上暴露度高，短停快走'] },
    { id: 'rd_gs1', cat: 'gasStation', name: '赛车场加油站', location: '赛车场', coords: [53.7, 42.9], risk: '中', landmark: 'gas',
      tactics: ['自由手'], desc: '紧邻赛车场的补给点，固定刷轿车，是荣都中部最方便的找车点。',
      tips: ['拿了车沿河道走，比走公路安全'] },
    { id: 'rd_bk1', cat: 'bunker', name: '朝天城地下车库', location: '朝天城', coords: [22.0, 48.1], risk: '中', landmark: 'bunker',
      tactics: ['苟分', '突击'], desc: '城区地下停车场，通道多，决赛圈里是很好的转移与规避空间。',
      tips: ['记住出入口方向，别把自己困死'] },
    { id: 'rd_pw1', cat: 'powerTower', name: '磨河镇电塔', location: '磨河镇', coords: [70.5, 14.0], risk: '中', landmark: 'powertower',
      tactics: ['探点'], desc: '北部河道旁电塔，可观察磨河镇与淮乡之间的水路。',
      tips: ['适合判断北部圈的水路转移'] },
    { id: 'rd_wp1', cat: 'waterEdge', name: '龙城码头区', location: '龙城', coords: [61.5, 86.5], risk: '低', landmark: 'dock',
      tactics: ['苟分', '自由手'], desc: '荣都最大的码头，快艇集中刷新，集装箱掩体多，是南部圈的撤退枢纽。',
      tips: ['码头吊机后面可以藏人', '圈切内陆立刻上船走河道'] },
    { id: 'rd_wp2', cat: 'waterEdge', name: '嘉城水岸平台', location: '嘉城', coords: [87.5, 69.0], risk: '低', landmark: 'water',
      tactics: ['苟分'], desc: '嘉城东侧水岸，栏杆与货箱形成掩体，视野可看整条河。',
      tips: ['注意对岸桃叶镇山头', '随时可以上船'] },
    { id: 'rd_hm1', cat: 'hiddenSpot', name: '紫竹园竹林', location: '紫竹园', coords: [46.2, 30.3], risk: '低', landmark: 'forest',
      tactics: ['苟分', '探点'], desc: '大面积竹林，视觉遮挡极强，可以在里面完成整段隐蔽转移。',
      tips: ['竹子会挡子弹也会挡自己视线，保持 3 米间隔'] },
    { id: 'rd_hm2', cat: 'hiddenSpot', name: '百里乡山坳', location: '百里乡', coords: [15.0, 27.1], risk: '低', landmark: 'valley',
      tactics: ['苟分'], desc: '西北山坳，周围没有高价值点，几乎不会有人经过。',
      tips: ['纯苟分点，注意圈形'] },
    { id: 'rd_br1', cat: 'bridge', name: '嘉城大桥', location: '嘉城', coords: [85.5, 70.5], risk: '高', landmark: 'bridge',
      tactics: ['架枪'], desc: '连接嘉城与南岸的主桥，是东部进圈的关键通道。',
      tips: ['桥面长，过桥提前 40 秒', '桥下可以走船绕行'] },
    { id: 'rd_br2', cat: 'bridge', name: '荣江口双桥', location: '荣江口', coords: [35.5, 82.5], risk: '高', landmark: 'bridge',
      tactics: ['架枪', '探点'], desc: '河口的两座并行桥，视野互相覆盖，是荣都最复杂的卡桥地形。',
      tips: ['卡桥要同时看两座桥', '过桥时用一座桥的烟掩护另一座'] },
    { id: 'rd_br3', cat: 'bridge', name: '磨河镇石桥', location: '磨河镇', coords: [70.0, 18.6], risk: '中', landmark: 'bridge',
      tactics: ['架枪'], desc: '北部河镇的石桥，是北部东西向转移的必经点。',
      tips: ['桥面窄，一台车就能堵住'] },
    { id: 'rd_ex1', cat: 'explosive', name: '赛车场油料区', location: '赛车场', coords: [53.1, 40.3], risk: '高', landmark: 'explosive',
      tactics: ['突击'], desc: '赛道旁油料堆放区，引爆可以覆盖维修区一大片。',
      tips: ['在维修区交火时优先考虑引爆'] },
    { id: 'rd_ex2', cat: 'explosive', name: '工业园炸药堆', location: '工业园', coords: [44.5, 74.5], risk: '中', landmark: 'explosive',
      tactics: ['突击'], desc: '厂区内的炸药堆，可以做陷阱也可以用来清角。',
      tips: ['别把它当掩体'] },
    { id: 'rd_sr1', cat: 'secretRoom', name: '荣王府地宫密室', location: '荣王府', coords: [71.5, 34.5], risk: '低', landmark: 'secret',
      tactics: ['苟分', '突击'], desc: '荣王府院落下方的地宫密室，需要钥匙卡开启，内部物资等级高，决赛圈可藏身。',
      tips: ['钥匙卡在荣王府院内固定刷新点附近', '地宫出口少，进之前想好撤离路线'] },
    { id: 'rd_tl2', cat: 'toilet', name: '嘉城公厕', location: '嘉城', coords: [88.0, 68.5], risk: '高', landmark: 'toilet',
      tactics: ['苟分'], desc: '嘉城街区的独立公厕，正对主街，卡点价值高但极易被夹击。',
      tips: ['门口放绊线，避免被摸进来', '听到多人脚步就不要死守'] },
    { id: 'rd_pt3', cat: 'pit', name: '龙城工地基坑', location: '龙城', coords: [60.5, 82.5], risk: '中', landmark: 'pit',
      tactics: ['苟分', '探点'], desc: '龙城南侧工地基坑，配合周边建筑形成隐蔽的转移通道。',
      tips: ['基坑边缘的钢筋是硬掩体', '注意从码头方向绕过来的队伍'] },
    { id: 'rd_is1', cat: 'island', name: '嘉城东小岛', location: '东部海域', coords: [91.0, 68.0], risk: '低', landmark: 'island',
      tactics: ['自由手'], desc: '嘉城东侧离岸小岛，圈收东部时是天然的避风港。',
      tips: ['必须留船', '圈切内陆提前撤离'] },
    { id: 'rd_is2', cat: 'island', name: '龙城南沙洲', location: '南部海域', coords: [63.0, 88.5], risk: '低', landmark: 'island',
      tactics: ['苟分'], desc: '南部沙洲，决赛圈刷在最南端时价值极高。',
      tips: ['沙洲没有掩体，靠人数优势守'] }
  ]
};

const MAP_DATA = { island: MAP_ISLAND, desert: MAP_DESERT, rongdu: MAP_RONGDU };

/* ------------------------- 落地打法（四种思路完全不同） -------------------------
 * 每种打法有自己的"候选筛选 + 打分公式"，不是同一套公式换权重。
 * ------------------------------------------------------------------------- */
const LANDING_STYLES = [
  {
    id: 'urban', name: '城区刚枪', icon: '⚔️', strategy: 'urban', prefer: 'high',
    desc: '短距离内直接落到资源最富裕的大城区，落地就刚枪，靠淘汰和高级物资滚雪球',
    demand: '枪法好、反应快、敢打敢拼',
    rule: '候选＝离航线近的高资源城区；距离越短越好，密度越高越好，物资越高越好'
  },
  {
    id: 'vehicle', name: '找车转移', icon: '🚗', strategy: 'vehicle', prefer: 'medium',
    desc: '沿航线找固定刷车点／刷马点，落地先拿车，再开车前往有一定距离的资源点发育',
    demand: '熟悉载具刷新点、会规划转移路线',
    rule: '先筛航线附近有固定载具的点，再评估"开车能到、又不太近"的资源点'
  },
  {
    id: 'wild', name: '野点发育', icon: '🏡', strategy: 'wild', prefer: 'low',
    desc: '不落大城区，在小房区之间快速轮转：搜完一个房群立刻转下一个，靠数量堆资源',
    demand: '耐心、圈形预判准、不贪枪',
    rule: '只考虑低密度小房区/野点，要求周边还有多个房群可轮转，并且附近能找到载具'
  },
  {
    id: 'flexible', name: '随机应变', icon: '⚡', strategy: 'flexible', prefer: 'balanced',
    desc: '同时按刚枪／找车／野点三种思路算分，取当把最优解，并告诉你这局更接近哪种打法',
    demand: '经验丰富、决策快、能带节奏',
    rule: '取三种打法得分中的最高值作为推荐，并标注它属于哪种思路'
  }
];

/* ------------------------- 圈形规律（内部推算用） -------------------------
 * 由比赛与实战规律总结，用于"下个圈大概率在哪"的估算，界面不展示品牌信息。
 * 核心事实：下一个信号区一定完整地包含在上一个信号区里面（只会收缩，不会跳出）。
 * ------------------------------------------------------------------- */
const CIRCLE_INSIGHTS = {
  mustInside: true,
  rules: [
    '下一个信号区一定完整包含在上一个信号区内，圈心位移 ≤ 上一圈半径 − 下一圈半径',
    '1-4 圈位移最大，5 圈以后基本只在小范围内挪动',
    '圈心倾向于落在有掩体、有物资的地形上（城镇、高地、房群），很少停在纯水面或纯开阔地',
    '决赛圈常出现在城镇、反坡、高地或水边结构附近'
  ],
  /* 预算方向时使用的偏好权重 */
  weights: { loot: 0.5, cover: 0.3, water: -0.5, edge: -0.25 }
};

/* 赛季情报：由 2026 赛季（突围赛/周决赛/季后赛/总决赛）公开跳点与规则统计提炼，
 * 仅作为打分时的轻微加权（强势落点 +少量分），界面不展示。 */
const SEASON_INSIGHTS = {
  source: '2026 赛季公开跳点与比赛服规则统计（非逐局数据库）',
  strongPoints: {
    island: ['G镇', '渔村', '洋房', 'G港', 'P港', '战地医院'],
    desert: [],
    rongdu: ['余林镇', '赛车场', '荣江口', '新工小镇', '嘉城', '工业园', '材料厂', '朝天城', '体育场', '荣王府']
  },
  /* 比赛服节奏：物资更足、圈更紧、载具更关键 */
  pacing: { lootBonus: 1.3, earlyRotate: true, vehicleWeightUp: 1.15 }
};

/* ------------------------- 职业运营手册（PRO_PLAYBOOK）-------------------------
 * 内容提炼自公开资料：2026 PEL 春季赛官方规则、职业比赛复盘（跳点博弈/圈型取舍/
 * 中期转移/决赛圈站位）与主流职业队打法共识。用于游戏模式的"职业运营手册"面板。
 * ------------------------------------------------------------------- */
const PRO_PLAYBOOK = {
  scoring: {
    title: 'PEL 赛制速览（2026 春季赛规则）',
    points: [
      '单场积分 = 排名分 + 淘汰分：每个最终击杀记 1 淘汰分，排名分按最终名次发放',
      '排名分第 1 名 10 分、逐级递减、前 8 名有分——"活到最后"天然比"多杀"值钱',
      '因此职业队普遍稳运营打底：先保排名分，再在安全边际里抓淘汰分',
      '比赛服限制更紧：空投武器、信号枪与多数投掷物关闭，物资与信号圈参数与路人局不同'
    ],
    note: '具体分值以当季官方规则为准'
  },
  stages: [
    {
      key: 'drop', phase: '跳点期', time: '开局 0-2 分钟', goal: '安全落地 + 快速形成战斗力',
      rules: [
        '跳点跟着航线走、不跟习惯走：同一支队伍对主城、学校、野点都有预案',
        '先看邻居再定点：周围有两三队固定跳点，就分踩或换点',
        '分踩标准阵型：一人高点观察、两人进主房区、一人落地先控车',
        '跳点决定运营方向：落圈心保车保人，落圈外先想进圈路线'
      ],
      pro: '职业队宁可跳"次富但独享"的点，也不跳"最富但三家抢"的点'
    },
    {
      key: 'loot', phase: '搜集发育期', time: '开局 2-8 分钟（1-3 圈）', goal: '满编满状态 + 拿到信息',
      rules: [
        '首圈刷出立刻评估三件事：圈边队伍密度、进圈方向、载具余量',
        '物资决定姿态：装备没成型就沿弱侧收信息，成型了才主动卡路口逼对手交火',
        '房区再好也不死守：强扎已被占的圈心房区等于团灭风险',
        '不该打的仗放枪让路，把子弹和投掷物留给决赛圈'
      ],
      pro: '强队的"圈运"不是运气，是提前两三个圈埋下的落位'
    },
    {
      key: 'rotate', phase: '中期转移期', time: '3-5 圈收缩段', goal: '满编占住下一圈的好位置',
      rules: [
        '时机核心：走太早可能撞进满编队，走太晚会被圈内队伍卡死',
        '听信息选路：枪声密度、淘汰播报、载具声——永远选更安静的那条',
        '多绕两百米避开枪线，往往比直插省人',
        '全队同步：车头方向、停车位置、下车顺序，乱一个就减员'
      ],
      pro: '职业转移的目标不是"进圈"，而是"带着人数和信息进圈"'
    },
    {
      key: 'edge', phase: '卡边占位期', time: '5-6 圈', goal: '用位置换淘汰分',
      rules: [
        '圈边 vs 圈心：圈边能收过路队、信息清楚但要防背后；圈心先占位但容易被多方枪线夹',
        '弱侧推进：沿人少的一侧切进去，避免被夹击',
        '能收的残编快速集火，拉锯只会引来第三方',
        '留一辆车：既是移动掩体，也是决赛圈的撞点资本'
      ],
      pro: '卡边收分看似慢，实际上是最稳的"排名分 + 淘汰分"双收'
    },
    {
      key: 'final', phase: '决赛圈', time: '6 圈以后', goal: '先活下来，再赢枪线',
      rules: [
        '站位分散成交叉枪线：正面、侧身、背后各一人，留一人捏投掷物',
        '圈内还有三队以上时不开第一枪，让对手先互耗',
        '必须打时：烟雾封一侧、集火另一侧，快速减员不拉扯',
        '谁先暴露全部站位谁被集火——载具和投掷物都能制造假信息'
      ],
      pro: '决赛圈拼的不是枪法，是把航线、圈型、载具、枪线、投掷物串成一条线的执行力'
    }
  ],
  decisions: [
    { q: '这局跳哪？', a: '航线决定候选、邻居决定取舍：能安全落地 > 资源最富；有预案的队从不绑死一个点' },
    { q: '圈边还是圈心？', a: '装备未成型或信息少 → 贴圈边弱侧；装备成型且有载具 → 提前占圈心房区。死守单一答案都是错的' },
    { q: '现在转移还是再等一圈？', a: '看三个信号：枪声密度（安静=安全）、载具余量（没车必须早走）、下一圈方向（逆向转移要留双倍时间）' },
    { q: '这一架打不打？', a: '职业公式：这一架能换来什么？没有淘汰分收益、不解决位置问题、还会暴露给第三方——三占其二就放走' }
  ]
};

/* ------------------------- 下一圈预测器配置 -------------------------
 * 两层结论：A) 确定性约束——下一圈半径已知且必完整包含于当前圈内，
 * 圆心只能落在"当前圆心 ± (R当前−R下圈)"的圆盘内；
 * B) 启发式估计——游戏在可行域内选点基本随机，但统计上偏向
 * 有物资/有掩体/少水的地形，用蒙特卡洛 + 加权打分给出相对概率。
 * ------------------------------------------------------------------- */
const CIRCLE_PREDICTOR = {
  samples: 600,          // 蒙特卡洛候选圆心数
  bucket: 2.5,           // 候选区聚类网格（地图百分比）
  weights: { water: -0.45, loot: 0.30, cover: 0.15, move: -0.12, momentum: 0.10 },
  note: '虚线圆（可行域）是 100% 成立的数学结论；候选区概率是地形启发式估计，输出"优先搜索区域"而非保证'
};

/* ------------------------- 对局复盘库 & 预测自校准 -------------------------
 * 复盘条目存 localStorage：{ id, mapId, date, circles:{n:{cx,cy,r}} }。
 * 命中率统计与权重校准都"回溯式"进行：对每个已记录的 p 圈，用 p-1 及更早
 * 的圈重跑一次预测，再与实际 p 圈比较（无需在比赛中实时预测）。
 * 校准规则：Δw = η × mean(实际落点的因子值 − Top1区的因子值)，
 * 各因子统一方向（实际比预测更"湿"→ 水罚减轻；实际更穷 → 物资奖减轻）。
 * ------------------------------------------------------------------- */
const REPLAY_STORE = {
  key: 'zd_replays_v1',        // 复盘条目
  wkey: 'zd_weights_v1',       // 校准后的预测权重（覆盖 CIRCLE_PREDICTOR.weights）
  minCalib: 8,                 // 参与校准的最少圈样本数
  eta: 0.05,                   // 校准步长
  clamp: { water: [-0.8, -0.1], loot: [0.05, 0.6], cover: [0, 0.4], move: [-0.5, -0.02], momentum: [0, 0.3] }
};

/* ------------------------- 航线拥堵模拟配置 -------------------------
 * 模型：预期队伍数 ∝ 物资^1.15 × (1+密度) × 打法亲和 × PEL强势点加成 ×
 *       航线可达性（超出打法跳伞距离 = 不可达）；全图按 25 队、约 82% 落
 *       主点位归一化。输出为启发式估算，非精确统计。
 * ------------------------------------------------------------------ */
const CONGESTION_CFG = {
  teams: 25,
  droppingRatio: 0.82,
  range: { urban: 1200, vehicle: 1600, wild: 2000, flexible: 1400 },   // 各打法跳伞可达距离（米）
  strongBoost: 1.4,
  buckets: { packed: 3, hot: 1.5, ok: 0.5 }                            // 预期队数分档
};

/* ------------------------- 工具函数 ------------------------- */
const GeoUtil = {
  // 点到线段最短距离（百分比坐标）
  distToSegment(p, a, b) {
    const [px, py] = p, [x1, y1] = a, [x2, y2] = b;
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? (A * C + B * D) / lenSq : -1;
    param = Math.max(0, Math.min(1, param));
    const xx = x1 + param * C, yy = y1 + param * D;
    return Math.hypot(px - xx, py - yy);
  },
  dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); },
  // 百分比 → 米（以 8km 地图近似，1% ≈ 80m）
  toMeters(pct) { return Math.round(pct * 80); },
  lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
};


/* 挂载到全局，便于控制台调试与二次开发 */
if (typeof window !== 'undefined') {
  window.TERRAIN_CATS = TERRAIN_CATS;
  window.VEHICLE_CATS = VEHICLE_CATS;
  window.TACTIC_ROLES = TACTIC_ROLES;
  window.CIRCLE_RULES = CIRCLE_RULES;
  window.MAP_DATA = MAP_DATA;
  window.LANDING_STYLES = LANDING_STYLES;
  window.CIRCLE_INSIGHTS = CIRCLE_INSIGHTS;
  window.SEASON_INSIGHTS = SEASON_INSIGHTS;
  window.CIRCLE_RADIUS_M = CIRCLE_RADIUS_M;
  window.CIRCLE_META = CIRCLE_META;
  window.PRO_PLAYBOOK = PRO_PLAYBOOK;
  window.CIRCLE_PREDICTOR = CIRCLE_PREDICTOR;
  window.REPLAY_STORE = REPLAY_STORE;
  window.CONGESTION_CFG = CONGESTION_CFG;
  window.GeoUtil = GeoUtil;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TERRAIN_CATS, VEHICLE_CATS, TACTIC_ROLES, CIRCLE_RULES, CIRCLE_RADIUS_M, CIRCLE_META, CIRCLE_INSIGHTS, SEASON_INSIGHTS, PRO_PLAYBOOK, CIRCLE_PREDICTOR, REPLAY_STORE, CONGESTION_CFG, MAP_DATA, LANDING_STYLES, GeoUtil };
}
