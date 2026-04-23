// --- Global Error Handler ---
window.onerror = function(msg, url, lineNo, columnNo, error) {
    const log = document.getElementById("battle-log");
    if (log) {
        const d = document.createElement("div"); d.className = "log-entry danger";
        d.innerText = `Error: ${msg} [Line: ${lineNo}]`; log.appendChild(d);
    }
    return false;
};

// --- Game State & Data ---
const GAME_VERSION = "1.3";
const SAVE_KEY = "konbuRpgSaveData_v13";

const ELEMENTS = {
    none: { name: "無", color: "#94a3b8", weakTo: "none" },
    fire: { name: "火", color: "#ef4444", weakTo: "water" },
    water: { name: "水", color: "#3b82f6", weakTo: "wind" },
    wind: { name: "風", color: "#10b981", weakTo: "earth" },
    earth: { name: "土", color: "#f59e0b", weakTo: "fire" }
};

const getInitialState = () => ({
    floor: 1, gold: 0, kamui: 0,
    hero: {
        classId: 'novice', level: 1, exp: 0, nextExp: 10, hp: 100, maxHp: 100, baseAtk: 10, baseDef: 5,
        classLevels: { novice: 1, warrior: 1, knight: 1, berserker: 1, thief: 1, assassin: 1, samurai: 1, hero: 1 },
        classExp: { novice: 0, warrior: 0, knight: 0, berserker: 0, thief: 0, assassin: 0, samurai: 0, hero: 0 }
    },
    equipment: { weapon: null, head: null, body: null, hands: null, feet: null, accessory: null },
    inventory: [], maxInventory: 50,
    party: [],
    kamuiUpgrades: { expBonus: 0, goldBonus: 0, dropRateBonus: 0, statsBonus: 0 },
    currentDungeon: 'normal',
    passivePoints: 0,
    unlockedNodes: ['start'],
    achievements: { 
        kills: {}, totalKills: 0, total_loot: 0, loot_rare: 0, loot_epic: 0, loot_legendary: 0,
        gold_spent: 0, prestige_count: 0, total_boss_kills: 0, refine_count: 0, total_hired: 0,
        konbu_count: 0
    },
    currentTitleId: null,
    isAutoMode: false 
});

let state = getInitialState();

// Runtime variables
let battleInterval = null;
let currentEnemy = null;
let canProceed = false;
let isActing = false;
let skillCooldowns = {};
let availableMercs = [];

// Board variables
let boardOffset = { x: 0, y: 0 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };
let dragMoved = false;

// --- Data Definitions ---

const TITLES = [];
function generateTitles() {
    TITLES.length = 0;
    const add = (id, name, req, bonus, desc) => TITLES.push({ id, name, req, bonus, desc });

    // 1. Monster Slayers (30 titles)
    const monsters = [
        { key: 'スライム', n: 'スライム', stat: 'hp', v: 10 },
        { key: 'ゴブリン', n: 'ゴブリン', stat: 'atk', v: 2 },
        { key: 'ウルフ', n: 'ウルフ', stat: 'avoid', v: 0.005 },
        { key: 'オーク', n: 'オーク', stat: 'def', v: 2 },
        { key: 'ドラゴン', n: 'ドラゴン', stat: 'atkPct', v: 0.01 }
    ];
    const killTiers = [
        { c: 10, p: 'ハンター' }, { c: 50, p: 'キラー' }, { c: 200, p: 'スレイヤー' },
        { c: 500, p: 'マスター' }, { c: 1000, p: '覇者' }, { c: 5000, p: '神' }
    ];
    monsters.forEach(m => {
        killTiers.forEach((t, i) => {
            const bonusVal = (i + 1) * m.v;
            add(`sl_${m.key}_${t.c}`, `${m.n}${t.p}`, { [m.key]: t.c }, { [m.stat]: bonusVal }, `${m.n}${t.c}体討伐: ${m.stat.toUpperCase()}+${m.stat.includes('Pct')||m.stat.includes('avoid')?(bonusVal*100).toFixed(1)+'%':bonusVal}`);
        });
    });

    // 2. Floor Reach (12 titles)
    [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].forEach(f => {
        add(`fl_${f}`, `${f}階の開拓者`, { floor: f }, { hp: f }, `${f}階到達: HP+${f}`);
    });

    // 3. Wealth (6 titles)
    [10000, 100000, 1000000, 10000000, 100000000, 1000000000].forEach((g, i) => {
        add(`gd_${g}`, i<3 ? `小金持ち` : `大富豪`, { gold: g }, { goldPct: 0.05 * (i+1) }, `${g.toLocaleString()}G所持: Gold+${5*(i+1)}%`);
    });

    // 4. Loot & Rarities (15 titles)
    [100, 500, 1000, 5000, 10000].forEach(l => {
        add(`lt_${l}`, `収集家 Lv.${l/100}`, { total_loot: l }, { dropPct: 0.05 * (l/500+1) }, `アイテム${l}個獲得: Drop+${(5*(l/500+1)).toFixed(0)}%`);
    });
    ['rare', 'epic', 'legendary'].forEach(r => {
        [1, 10, 50, 100].forEach(c => {
            add(`lr_${r}_${c}`, `${r.toUpperCase()}マニア`, { [`loot_${r}`]: c }, { atkPct: 0.02 * (c/10+1) }, `${r}品${c}個獲得: ATK+${(2*(c/10+1)).toFixed(0)}%`);
        });
    });

    // 5. Boss Killers (5 titles)
    [1, 10, 50, 100, 500].forEach(c => {
        add(`bk_${c}`, `ジャイアントキリング`, { total_boss_kills: c }, { skillDmg: 0.05 * (Math.log10(c)+1) }, `ボス${c}体討伐: Skill+${(5*(Math.log10(c)+1)).toFixed(0)}%`);
    });

    // 6. Prestige & Kamui (10 titles)
    [1, 5, 10, 20, 50].forEach(c => {
        add(`pr_${c}`, `輪廻の旅人`, { prestige_count: c }, { statsBonus: 0.02 * c }, `転生${c}回: 全ステ+${2*c}%`);
    });
    [10, 100, 1000, 5000, 10000].forEach(c => {
        add(`km_${c}`, `神に愛されし者`, { kamui: c }, { atk: c/10 }, `神威${c}獲得: ATK+${c/10}`);
    });

    // 7. Refine & Konbu (10 titles)
    [10, 50, 100, 500, 1000].forEach(c => {
        add(`rf_${c}`, `鍛冶職人`, { refine_count: c }, { def: c/5 }, `強化${c}回: DEF+${c/5}`);
    });
    [1, 10, 50, 100, 500].forEach(c => {
        add(`kb_${c}`, `昆布マイスター`, { konbu_count: c }, { hpPct: 0.01 * (Math.log10(c+1)*5) }, `魂武${c}獲得: HP+${(Math.log10(c+1)*5).toFixed(1)}%`);
    });

    // 8. Level & Hired (12 titles)
    [10, 50, 100, 200, 500, 1000].forEach(l => {
        add(`lv_${l}`, `熟練の冒険者`, { hero_level: l }, { atk: l, def: l/2 }, `Lv.${l}到達: ATK+${l}/DEF+${l/2}`);
    });
    [1, 10, 50, 100, 500, 1000].forEach(c => {
        add(`hr_${c}`, `指揮官`, { total_hired: c }, { mercAtk: 0.1 * (Math.log10(c+1)*2) }, `計${c}人雇用: 仲間の攻撃力UP`);
    });
}
generateTitles();

const CLASSES = {
    novice: { name: "見習い", hpPerLvl: 5, atkPerLvl: 1, defPerLvl: 0.5, atkMult: 1.0, defMult: 1.0, hpMult: 1.0, element: 'none', skills: [ { id: 'bash', name: 'バッシュ', unlockLvl: 1, mult: 1.5, cd: 3, desc: '1.5倍ダメ' } ] },
    warrior: { name: "戦士", req: { novice: 10 }, hpPerLvl: 8, atkPerLvl: 2, defPerLvl: 1, atkMult: 1.2, defMult: 1.1, hpMult: 1.1, element: 'fire', skills: [ { id: 'power', name: '強撃', unlockLvl: 1, mult: 2.5, cd: 4, desc: '2.5倍ダメ' } ] },
    knight: { name: "騎士", req: { warrior: 20 }, hpPerLvl: 12, atkPerLvl: 1, defPerLvl: 2, atkMult: 1.0, defMult: 1.5, hpMult: 1.3, element: 'water', skills: [ { id: 'holy', name: 'ホーリー', unlockLvl: 1, mult: 1.2, heal: 0.1, cd: 5, desc: '攻撃＋回復' } ] },
    assassin: { name: "暗殺者", req: { thief: 30 }, hpPerLvl: 6, atkPerLvl: 4, defPerLvl: 0.5, atkMult: 2.0, defMult: 0.7, hpMult: 0.8, element: 'wind', skills: [ { id: 'assassinate', name: '暗殺', unlockLvl: 1, mult: 6.0, cd: 8, desc: '6倍ダメ' } ] },
    hero: { name: "勇者", req: { novice: 50, knight: 30, assassin: 30 }, hpPerLvl: 15, atkPerLvl: 5, defPerLvl: 5, atkMult: 3.0, defMult: 2.0, hpMult: 2.0, element: 'none', skills: [ { id: 'excalibur', name: '聖剣の輝き', unlockLvl: 1, mult: 10.0, cd: 10, desc: '10倍ダメ' } ] }
};

const ENEMY_TYPES = [
    { name: "スライム", hpMult: 0.8, atkMult: 0.8, defMult: 0.5, element: 'water', image: "slime.png" },
    { name: "ゴブリン", hpMult: 1.0, atkMult: 1.0, defMult: 0.8, element: 'earth', image: "goblin.png" },
    { name: "ウルフ", hpMult: 0.9, atkMult: 1.2, defMult: 0.6, element: 'wind', image: "wolf.png" },
    { name: "オーク", hpMult: 1.5, atkMult: 1.2, defMult: 1.0, element: 'fire', image: "orc.png" },
    { name: "ドラゴン", hpMult: 3.0, atkMult: 2.5, defMult: 2.0, element: 'fire', image: "dragon.png" }
];

const RARITIES = [
    { name: 'コモン', colorClass: 'rarity-common', weight: 60, statMult: 1, maxOptions: 1 },
    { name: 'アンコモン', colorClass: 'rarity-uncommon', weight: 25, statMult: 1.5, maxOptions: 2 },
    { name: 'レア', colorClass: 'rarity-rare', weight: 10, statMult: 2.5, maxOptions: 3 },
    { name: 'エピック', colorClass: 'rarity-epic', weight: 4, statMult: 4, maxOptions: 4 },
    { name: 'レジェンダリー', colorClass: 'rarity-legendary', weight: 1, statMult: 8, maxOptions: 4 }
];

const RUNES = [
    { id: 'r_atk', name: '力の魂武', bonus: { atkPct: 0.05 }, color: '#f87171' },
    { id: 'r_def', name: '守の魂武', bonus: { defPct: 0.05 }, color: '#60a5fa' },
    { id: 'r_hp', name: '命の魂武', bonus: { hpPct: 0.05 }, color: '#4ade80' }
];

const WEAPON_TYPES = [
    { id: 'sword', name: '剣', bonus: { crit: 0.1, atkPct: 0.05 }, desc: 'CRI+10%/ATK+5%' },
    { id: 'axe', name: '斧', bonus: { atkPct: 0.25, defPct: -0.2 }, desc: 'ATK+25%/DEF-20%' },
    { id: 'bow', name: '弓', bonus: { avoid: 0.1, atkPct: 0.05 }, desc: 'AVO+10%/ATK+5%' },
    { id: 'staff', name: '杖', bonus: { skillDmg: 0.2, hpPct: 0.1 }, desc: 'Skill+20%/HP+10%' }
];

const PREFIXES = [
    { name: "古びた", bonus: { hp: 5 } },
    { name: "鋭い", bonus: { atk: 10 } },
    { name: "丈夫な", bonus: { def: 5 } },
    { name: "幸運の", bonus: { crit: 0.05 } },
    { name: "疾風の", bonus: { avoid: 0.05 } },
    { name: "名工", bonus: { atkPct: 0.1, defPct: 0.1 } },
    { name: "賢者の", bonus: { skillDmg: 0.15 } },
    { name: "鉄壁の", bonus: { defPct: 0.2 } },
    { name: "必殺の", bonus: { crit: 0.15 } },
    { name: "巨人の", bonus: { hpPct: 0.25 } },
    { name: "残虐な", bonus: { atkPct: 0.2, defPct: -0.1 } },
    { name: "呪いの", bonus: { atkPct: 0.5, hpPct: -0.3 } },
    { name: "光輝く", bonus: { goldPct: 0.5 } },
    { name: "神速の", bonus: { avoid: 0.15 } },
    { name: "深淵の", bonus: { skillDmg: 0.3 } },
    { name: "伝説", bonus: { atkPct: 0.2, hpPct: 0.2, defPct: 0.2 } },
    { name: "神話", bonus: { atkPct: 0.3, hpPct: 0.3, defPct: 0.3 } },
    { name: "至高", bonus: { atkPct: 0.4 } },
    { name: "究極", bonus: { atkPct: 0.5, crit: 0.1 } },
    { name: "英雄の", bonus: { statsBonus: 0.1 } },
    { name: "魔王の", bonus: { atkPct: 0.6, defPct: -0.2 } },
    { name: "聖なる", bonus: { hpPct: 0.4, defPct: 0.2 } },
    { name: "混沌の", bonus: { crit: 0.2, avoid: 0.2 } },
    { name: "ベルセルク", bonus: { atkPct: 1.0, defPct: -0.5, hpPct: -0.2 } }
];


const PASSIVE_NODES = [];
const OPTION_TYPES = [
    { id: 'atk', name: 'ATK+', base: 2 },
    { id: 'def', name: 'DEF+', base: 1 },
    { id: 'hp', name: 'HP+', base: 5 },
    { id: 'atkPct', name: 'ATK%', base: 0.01 },
    { id: 'defPct', name: 'DEF%', base: 0.01 },
    { id: 'hpPct', name: 'HP%', base: 0.02 },
    { id: 'crit', name: 'CRI%', base: 0.005 },
    { id: 'avoid', name: 'AVO%', base: 0.005 },
    { id: 'skillDmg', name: 'SKL%', base: 0.02 }
];

function getOptionValue(typeId, lvl, rarity) {
    const type = OPTION_TYPES.find(t => t.id === typeId);
    const rMult = rarity ? rarity.mult : 1;
    const base = type.base;
    const isPct = typeId.includes('Pct') || ['crit', 'avoid', 'skillDmg'].includes(typeId);
    let val = base * (1 + lvl * 0.1) * (0.5 + Math.random() * rMult);
    return isPct ? parseFloat(val.toFixed(3)) : Math.floor(val);
}
    PASSIVE_NODES.length = 0;
    PASSIVE_NODES.push({ id: 'start', name: '起点', pos: { x: 0, y: 0 }, effect: { atk: 5 }, cost: 0, req: [] });
    
    const branches = 8;
    const maxTiers = 10;
    const types = [
        { name: 'ATK', eff: 'atkPct', val: 0.01 },
        { name: 'DEF', eff: 'defPct', val: 0.01 },
        { name: 'HP',  eff: 'hpPct',  val: 0.02 },
        { name: 'SKL', eff: 'skillDmg', val: 0.02 },
        { name: 'CRI', eff: 'crit', val: 0.005 },
        { name: 'AVO', eff: 'avoid', val: 0.005 }
    ];

    for (let b = 0; b < branches; b++) {
        const angle = (b / branches) * Math.PI * 2;
        for (let t = 1; t <= maxTiers; t++) {
            const id = `node_${b}_${t}`;
            const type = types[(b + t) % types.length];
            const isKeystone = (t === maxTiers);
            
            // Effect scales with distance (tier)
            const scale = t; 
            const effectValue = isKeystone ? type.val * 10 : type.val * scale;
            
            const node = {
                id,
                name: isKeystone ? `極･${type.name}` : `${type.name}+`,
                pos: { x: Math.cos(angle) * t * 100, y: Math.sin(angle) * t * 100 },
                effect: { [type.eff]: effectValue },
                cost: t,
                req: [], // Populated below
                isKeystone,
                desc: `${type.name}を${(effectValue * (type.eff.includes('Pct')||type.eff.includes('crit')||type.eff.includes('avoid')?100:1)).toFixed(1)}${type.eff.includes('Pct')||type.eff.includes('crit')||type.eff.includes('avoid')?'%':''}強化`
            };
            
            // Connect to previous tier in same branch
            if (t === 1) node.req.push('start');
            else node.req.push(`node_${b}_${t-1}`);
            
            // Spider web: Connect to the same tier in the previous branch
            const prevBranch = (b === 0) ? branches - 1 : b - 1;
            node.req.push(`node_${prevBranch}_${t}`);
            
            PASSIVE_NODES.push(node);
        }
    }
}
generateNodes();

// --- Core ---

function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else { target[key] = source[key]; }
    }
    return target;
}
function loadGame() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) { 
        try { 
            state = deepMerge(getInitialState(), JSON.parse(saved)); 
            // Migration for old armor slot
            if (state.equipment.armor) {
                state.equipment.body = state.equipment.armor;
                delete state.equipment.armor;
            }
        } catch (e) { state = getInitialState(); } 
    }
    refreshTavern(); updateAllUI();
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getElementMult(atkElem, defElem) {
    if (!atkElem || !defElem || atkElem === 'none' || defElem === 'none') return 1.0;
    if (ELEMENTS[atkElem] && ELEMENTS[atkElem].weakTo === defElem) return 0.5;
    if (ELEMENTS[defElem] && ELEMENTS[defElem].weakTo === atkElem) return 1.5;
    return 1.0;
}

function getHeroTotalStats() {
    const currentClass = CLASSES[state.hero.classId] || CLASSES.novice;
    const kamuiMult = 1 + (state.kamuiUpgrades.statsBonus * 0.1);
    let atk = state.hero.baseAtk; let def = state.hero.baseDef; let maxHp = state.hero.maxHp;
    let crit = 0.05; let avoid = 0.05; let skillDmgMult = 1.0;
    
    // Class Levels
    for (let cid in state.hero.classLevels) {
        const lvl = state.hero.classLevels[cid]; const data = CLASSES[cid];
        if (data) { atk += (lvl - 1) * data.atkPerLvl; def += (lvl - 1) * data.defPerLvl; maxHp += (lvl - 1) * data.hpPerLvl; }
    }
    // Title
    if (state.currentTitleId) {
        const t = TITLES.find(tx => tx.id === state.currentTitleId);
        if (t && t.bonus) { 
            if (t.bonus.atk) atk += t.bonus.atk; 
            if (t.bonus.atkPct) atk *= (1 + t.bonus.atkPct); 
            if (t.bonus.def) def += t.bonus.def;
            if (t.bonus.defPct) def *= (1 + t.bonus.defPct);
            if (t.bonus.hp) maxHp += t.bonus.hp;
            if (t.bonus.hpPct) maxHp *= (1 + t.bonus.hpPct);
            if (t.bonus.statsBonus) { atk *= (1+t.bonus.statsBonus); def *= (1+t.bonus.statsBonus); maxHp *= (1+t.bonus.statsBonus); }
        }
    }
    atk *= currentClass.atkMult * kamuiMult; def *= currentClass.defMult * kamuiMult; maxHp *= currentClass.hpMult * kamuiMult;

    let setCounts = {};
    for (const key in state.equipment) {
        const i = state.equipment[key];
        if (i) { 
            if (i.atk) atk += i.atk; if (i.def) def += i.def; if (i.hp) maxHp += i.hp;
            if (key === 'weapon' && i.weaponType) {
                const m = WEAPON_TYPES.find(w => w.id === i.weaponType);
                if (m && m.bonus) { if (m.bonus.atkPct) atk *= (1+m.bonus.atkPct); if (m.bonus.crit) crit += m.bonus.crit; if (m.bonus.avoid) avoid += m.bonus.avoid; if (m.bonus.skillDmg) skillDmgMult += m.bonus.skillDmg; }
            }
            // Prefix Bonus
            if (i.prefixData && i.prefixData.bonus) {
                const b = i.prefixData.bonus;
                if (b.atk) atk += b.atk; if (b.atkPct) atk *= (1 + b.atkPct);
                if (b.def) def += b.def; if (b.defPct) def *= (1 + b.defPct);
                if (b.hp) maxHp += b.hp; if (b.hpPct) maxHp *= (1 + b.hpPct);
                if (b.crit) crit += b.crit; if (b.avoid) avoid += b.avoid;
                if (b.skillDmg) skillDmgMult += b.skillDmg;
                if (b.statsBonus) { atk *= (1+b.statsBonus); def *= (1+b.statsBonus); maxHp *= (1+b.statsBonus); }
            }
            // Options (all 4 slots)
            (i.options || []).forEach(o => { 
                if (o.id === 'atk') atk += o.val;
                if (o.id === 'def') def += o.val;
                if (o.id === 'hp') maxHp += o.val;
                if (o.id === 'atkPct') atk *= (1 + o.val);
                if (o.id === 'defPct') def *= (1 + o.val);
                if (o.id === 'hpPct') maxHp *= (1 + o.val);
                if (o.id === 'crit') crit += o.val;
                if (o.id === 'avoid') avoid += o.val;
                if (o.id === 'skillDmg') skillDmgMult += o.val;
            });
            (i.sockets || []).forEach(sid => { const r = RUNES.find(rx => rx.id === sid); if (r && r.bonus.atkPct) atk *= (1+r.bonus.atkPct); });
            if (i.prefix) setCounts[i.prefix] = (setCounts[i.prefix] || 0) + 1;
            if (i.rarity) rarCounts[i.rarity.name] = (rarCounts[i.rarity.name] || 0) + 1;
        }
    }
    // Prefix Set Bonuses
    for (let p in setCounts) { 
        const c = setCounts[p];
        let b = 0;
        if (c >= 6) b = 0.60; else if (c >= 5) b = 0.35; else if (c >= 4) b = 0.20; else if (c >= 3) b = 0.12; else if (c >= 2) b = 0.05;
        if (b > 0) { atk *= (1 + b); def *= (1 + b); maxHp *= (1 + b); }
    }
    // Rarity Set Bonuses
    let goldBonus = 1, dropBonus = 1;
    for (let r in rarCounts) {
        const c = rarCounts[r];
        if (c >= 6) { atk *= 1.2; def *= 1.2; maxHp *= 1.2; goldBonus += 0.5; dropBonus += 0.5; }
        else if (c >= 3) { goldBonus += 0.2; dropBonus += 0.2; }
    }

    state.unlockedNodes.forEach(nid => {
        const n = PASSIVE_NODES.find(nx => nx.id === nid);
        if (n && n.effect) {
            if (n.effect.atk) atk += n.effect.atk;
            if (n.effect.atkPct) atk *= (1 + n.effect.atkPct);
            if (n.effect.def) def += n.effect.def;
            if (n.effect.defPct) def *= (1 + n.effect.defPct);
            if (n.effect.hp) maxHp += n.effect.hp;
            if (n.effect.hpPct) maxHp *= (1 + n.effect.hpPct);
            if (n.effect.crit) crit += n.effect.crit;
            if (n.effect.avoid) avoid += n.effect.avoid;
            if (n.effect.skillDmg) skillDmgMult += n.effect.skillDmg;
        }
    });

    return { 
        atk: Math.floor(atk), def: Math.floor(def), maxHp: Math.floor(maxHp), 
        crit: Math.min(0.8, crit), avoid: Math.min(0.8, avoid), skillDmg: skillDmgMult,
        goldMult: (1 + (state.kamuiUpgrades.goldBonus || 0) * 0.1) * goldBonus, 
        dropMult: (1 + (state.kamuiUpgrades.dropRateBonus || 0) * 0.1) * dropBonus,
        expMult: (1 + (state.kamuiUpgrades.expBonus || 0) * 0.1)
    };
}

function updateHeroHP(amount) {
    const stats = getHeroTotalStats();
    state.hero.hp = Math.min(stats.maxHp, (state.hero.hp || stats.maxHp) + (amount || 0));
    if (isNaN(state.hero.hp)) state.hero.hp = stats.maxHp;
    const p = Math.max(0, (state.hero.hp / stats.maxHp) * 100);
    const bar = document.getElementById("hero-hp-bar"); if (bar) bar.style.width = `${p}%`;
    const hpEl = document.getElementById("hero-hp"); if (hpEl) hpEl.innerText = Math.floor(state.hero.hp);
}

function logMessage(msg, type = "normal") {
    const log = document.getElementById("battle-log"); if (!log) return;
    const d = document.createElement("div"); d.className = `log-entry ${type}`;
    d.innerText = msg; log.appendChild(d); log.scrollTop = log.scrollHeight;
    while (log.children.length > 50) log.removeChild(log.firstChild);
}

// --- Actions ---

function executeAttack(multiplier = 1, isSkill = false) {
    if (!currentEnemy || canProceed || isActing) return;
    isActing = true; updateBattleControls();
    const stats = getHeroTotalStats();
    let isCrit = Math.random() < stats.crit;
    let baseDmg = isCrit ? stats.atk * 2 : stats.atk;
    const heroClass = CLASSES[state.hero.classId] || CLASSES.novice;
    const heroElem = (state.equipment.weapon && state.equipment.weapon.element !== 'none') 
                     ? state.equipment.weapon.element 
                     : (heroClass.element || 'none');
    const eMult = getElementMult(heroElem, currentEnemy.element);
    let dmg = Math.max(1, Math.floor((baseDmg * eMult - currentEnemy.def) * multiplier) + randomInt(-2, 2));
    currentEnemy.hp -= dmg;
    
    const heroEl = document.querySelector(".hero"); if (heroEl) { heroEl.classList.remove("attack-anim-hero"); void heroEl.offsetWidth; heroEl.classList.add("attack-anim-hero"); }
    logMessage(`${isSkill ? '特技！' : ''}${isCrit ? '[CRI] ' : ''}勇者の攻撃！ ${dmg}ダメージ`);

    if (state.unlockedNodes.includes('keystone_meteor') && Math.random() < 0.05) {
        const mDmg = stats.atk * 5; currentEnemy.hp -= mDmg; logMessage(`メテオ！ ${mDmg}ダメージ`, "loot");
    }
    updateEnemyHP();
    if (currentEnemy.hp <= 0) onEnemyDefeated();
    else {
        state.party.forEach(m => { if (currentEnemy && currentEnemy.hp > 0) { let d = Math.max(1, m.atk - currentEnemy.def*0.5); currentEnemy.hp -= d; logMessage(`${m.name}の追撃！ ${d}ダメージ`, "merc"); } });
        updateEnemyHP();
        if (currentEnemy.hp <= 0) onEnemyDefeated();
        else setTimeout(enemyTurn, 600);
    }
}

function enemyTurn() {
    if (!currentEnemy || currentEnemy.hp <= 0 || canProceed) { isActing = false; updateBattleControls(); return; }
    const stats = getHeroTotalStats();
    if (Math.random() < stats.avoid) { logMessage("回避！"); isActing = false; updateBattleControls(); return; }
    const heroClass = CLASSES[state.hero.classId] || CLASSES.novice;
    const defenseElem = (state.equipment.body && state.equipment.body.element !== 'none') 
                        ? state.equipment.body.element 
                        : (heroClass.element || 'none');
    const eMult = getElementMult(currentEnemy.element, defenseElem);
    let d = Math.max(1, Math.floor(currentEnemy.atk * eMult - stats.def*0.5) + randomInt(-2, 2));
    state.hero.hp -= d; updateHeroHP(0); logMessage(`${currentEnemy.name}の攻撃！ ${d}ダメージ`, "danger");
    if (state.hero.hp <= 0) { logMessage("敗北...", "danger"); state.floor = 1; state.hero.hp = getHeroTotalStats().maxHp; currentEnemy = null; canProceed = false; isActing = false; startBattle(); }
    else { isActing = false; updateBattleControls(); }
}

function onEnemyDefeated() {
    isActing = false;
    canProceed = true; logMessage(`${currentEnemy.name} 撃破！`, "system");
    const baseName = currentEnemy.name.replace("[BOSS] ", "").replace("[レア] ", "");
    state.achievements.kills[baseName] = (state.achievements.kills[baseName] || 0) + 1; state.achievements.totalKills++;
    let expG = Math.floor(10 * Math.pow(1.03, state.floor)); let goldG = Math.floor(5 * Math.pow(1.03, state.floor));
    if (currentEnemy.isBoss) { expG *= 3; goldG *= 3; state.achievements.total_boss_kills++; }
    state.hero.exp += expG; state.hero.classExp[state.hero.classId] += expG; state.gold += goldG;
    checkLevelUp();
    if (state.currentDungeon === 'rune') { if (Math.random() < 0.4 || currentEnemy.isBoss) generateRune(); }
    else { if (Math.random() < 0.3 || currentEnemy.isBoss) generateLoot(state.floor); }
    updateAllUI(); saveGame();
}

function checkLevelUp() {
    while (state.hero.exp >= state.hero.nextExp) { state.hero.level++; state.hero.exp -= state.hero.nextExp; state.hero.nextExp = Math.floor(state.hero.nextExp * 1.5); state.passivePoints++; logMessage(`LvUP！ ポイント獲得！`, "system"); }
    const cid = state.hero.classId; let nCE = 20 * Math.pow(1.3, (state.hero.classLevels[cid] || 1) - 1);
    while (state.hero.classExp[cid] >= nCE) { state.hero.classExp[cid] -= nCE; state.hero.classLevels[cid]++; logMessage(`${CLASSES[cid].name}LvUP！`, "system"); nCE = 20 * Math.pow(1.3, state.hero.classLevels[cid] - 1); }
}

function generateLoot(fl) {
    if (state.inventory.length >= state.maxInventory) return;
    const type = ['weapon', 'armor', 'accessory'][randomInt(0, 2)];
    
    // Weighted Rarity Selection
    const roll = randomInt(1, 100);
    let rar = RARITIES[0];
    let cumulative = 0;
    for (const r of RARITIES) {
        cumulative += r.weight;
        if (roll <= cumulative) { rar = r; break; }
    }

    const prefObj = PREFIXES[randomInt(0, PREFIXES.length - 1)];
    const hasElem = Math.random() < 0.2; // 20% chance for elemental gear
    const elemKeys = Object.keys(ELEMENTS).filter(k => k !== 'none');
    const item = { 
        id: Date.now(), type, rarity: rar, lvl: fl, prefix: prefObj.name, prefixData: prefObj,
        name: `${rar.name}装備`, 
        options: [], sockets: [], socketCount: randomInt(0, 3), 
        element: hasElem ? elemKeys[randomInt(0, elemKeys.length - 1)] : 'none', 
        value: fl * 10 
    };
    for (let i = 0; i < 4; i++) {
        const type = OPTION_TYPES[randomInt(0, OPTION_TYPES.length - 1)];
        item.options.push({ id: type.id, name: type.name, val: getOptionValue(type.id, fl, rar) });
    }
    if (type === 'weapon') { 
        const w = WEAPON_TYPES[randomInt(0, 3)]; 
        item.weaponType = w.id; 
        item.name = w.name; 
        item.atk = fl * 5; 
    }
    else if (type === 'armor') { 
        const subs = [
            { id: 'head', n: ["兜", "帽子", "サークレット"][randomInt(0, 2)] },
            { id: 'body', n: ["鎧", "法衣", "軽装甲"][randomInt(0, 2)] },
            { id: 'hands', n: ["手袋", "篭手", "バングル"][randomInt(0, 2)] },
            { id: 'feet', n: ["靴", "具足", "レギンス"][randomInt(0, 2)] }
        ];
        const s = subs[randomInt(0, 3)];
        item.armorType = s.id;
        item.name = s.n;
        item.def = fl * 2; 
    } 
    else { 
        item.name = ["指輪", "首飾り", "耳飾り", "腕輪"][randomInt(0, 3)];
        item.hp = fl * 10; 
    }
    for(let s=0; s<item.socketCount; s++) item.sockets.push(null);
    if (rar.name === 'レア') state.achievements.loot_rare = (state.achievements.loot_rare || 0) + 1;
    if (rar.name === 'エピック') state.achievements.loot_epic = (state.achievements.loot_epic || 0) + 1;
    if (rar.name === 'レジェンダリー') state.achievements.loot_legendary = (state.achievements.loot_legendary || 0) + 1;
    state.inventory.push(item); state.achievements.total_loot++;
}
function generateRune() {
    if (state.inventory.length >= state.maxInventory) return;
    const r = RUNES[randomInt(0, RUNES.length - 1)]; 
    const prefObj = PREFIXES[randomInt(0, PREFIXES.length - 1)];
    state.inventory.push({...r, type: 'rune', prefix: prefObj.name, prefixData: prefObj, value: 100}); 
    state.achievements.konbu_count++;
}

// --- UI ---

function updateAllUI() {
    updateClassSelectorUI();
    document.getElementById("current-floor").innerText = state.floor;
    document.getElementById("gold-amount").innerText = state.gold;
    document.getElementById("kamui-amount").innerText = state.kamui;
    updateStatusUI(); updateEquipmentUI(); updateInventoryUI(); updatePartyUI(); updateKamuiUI(); updateBattleControls(); updateEnemyHP();
    drawPassiveBoard();
}

function updateClassSelectorUI() {
    const sel = document.getElementById("hero-class-select"); if (!sel) return;
    const unlocked = Object.keys(CLASSES).filter(cid => {
        const c = CLASSES[cid]; if (!c.req) return true;
        return Object.keys(c.req).every(reqId => (state.hero.classLevels[reqId] || 1) >= c.req[reqId]);
    });
    if (sel.children.length === unlocked.length && sel.children.length > 0) return;
    sel.innerHTML = "";
    unlocked.forEach(cid => {
        const opt = document.createElement("option"); opt.value = cid; opt.innerText = CLASSES[cid].name;
        opt.selected = (state.hero.classId === cid); sel.appendChild(opt);
    });
}

function updateStatusUI() {
    const stats = getHeroTotalStats(); const c = CLASSES[state.hero.classId];
    document.getElementById("hero-level").innerText = `総合Lv.${state.hero.level} / ${c.name}Lv.${state.hero.classLevels[state.hero.classId]}`;
    document.getElementById("hero-hp").innerText = Math.floor(state.hero.hp);
    document.getElementById("hero-max-hp").innerText = stats.maxHp;
    document.getElementById("hero-atk").innerText = stats.atk;
    document.getElementById("hero-def").innerText = stats.def;
    document.getElementById("hero-avoid").innerText = (stats.avoid * 100).toFixed(1) + "%";
    
    // Set Bonus Display
    const setListEl = document.getElementById("set-bonus-list");
    if (setListEl) {
        let setHtml = "";
        const sCounts = {}, rCounts = {};
        for(let k in state.equipment) {
            const i = state.equipment[k];
            if(i) {
                if(i.prefix) sCounts[i.prefix] = (sCounts[i.prefix] || 0) + 1;
                if(i.rarity) rCounts[i.rarity.name] = (rCounts[i.rarity.name] || 0) + 1;
            }
        }
        for(let p in sCounts) {
            const c = sCounts[p];
            if(c >= 2) {
                let b = (c>=6?60 : c>=5?35 : c>=4?20 : c>=3?12 : 5);
                setHtml += `<div style="color:var(--success-color)">${p}セット(${c}): 全ステ+${b}%</div>`;
            }
        }
        for(let r in rCounts) {
            const c = rCounts[r];
            if(c >= 3) {
                let gb = (c>=6?50:20);
                setHtml += `<div style="color:var(--accent-color)">${r}セット(${c}): Gold/Drop+${gb}%${c>=6?'/全ステ+20%':''}</div>`;
            }
        }
        setListEl.innerHTML = setHtml || "なし";
    }
    


    const heroClass = CLASSES[state.hero.classId] || CLASSES.novice;
    const atkEl = (state.equipment.weapon && state.equipment.weapon.element !== 'none') ? state.equipment.weapon.element : heroClass.element;
    const defEl = (state.equipment.armor && state.equipment.armor.element !== 'none') ? state.equipment.armor.element : heroClass.element;
    
    const atkElemInfo = ELEMENTS[atkEl || 'none'];
    const defElemInfo = ELEMENTS[defEl || 'none'];
    
    const statusBox = document.querySelector("#tab-status .status-card");
    if (statusBox) {
        let elemDiv = document.getElementById("hero-elements-display");
        if (!elemDiv) {
            elemDiv = document.createElement("div"); elemDiv.id = "hero-elements-display"; elemDiv.className = "mt-1";
            statusBox.appendChild(elemDiv);
        }
        elemDiv.innerHTML = `<div style="font-size:0.7rem; color:var(--text-muted)">属性: <span style="color:${atkElemInfo.color}">攻:${atkElemInfo.name}</span> / <span style="color:${defElemInfo.color}">防:${defElemInfo.name}</span></div>`;
    }
    
    const tList = document.getElementById("title-list"); if (tList) {
        tList.innerHTML = ""; 
        TITLES.forEach(t => {
            const unlocked = Object.keys(t.req).every(k => {
                const val = (state.achievements[k] !== undefined) ? state.achievements[k] :
                            (state.achievements.kills[k] !== undefined) ? state.achievements.kills[k] :
                            (state[k] !== undefined) ? state[k] : 
                            (k === 'hero_level') ? state.hero.level : 0;
                return val >= t.req[k];
            });
            if (!unlocked && TITLES.indexOf(t) > 20 && !state.currentTitleId === t.id) return; // Hide many locked titles to avoid clutter
            const d = document.createElement("div"); d.className = `status-card mt-1 ${unlocked?'':'locked'}`;
            d.innerHTML = `<div><strong>${t.name}</strong><br><small>${t.desc}</small></div>`;
            if (unlocked) { 
                const b = document.createElement("button"); b.className="btn-sm mt-1"; 
                b.innerText = state.currentTitleId === t.id ? "装備中" : "装備"; 
                b.onclick=()=>{state.currentTitleId=t.id; updateAllUI(); saveGame();}; d.appendChild(b); 
            }
            tList.appendChild(d);
        });
    }
}

function updateBattleControls() {
    const auto = document.getElementById("btn-toggle-auto"); auto.innerText = state.isAutoMode ? "AUTO: ON" : "AUTO: OFF";
    auto.className = state.isAutoMode ? "btn active" : "btn";
    document.getElementById("manual-controls").classList.toggle("hidden", canProceed || state.isAutoMode);
    document.getElementById("proceed-controls").classList.toggle("hidden", !canProceed);
}

function updateEnemyHP() {
    if (!currentEnemy) return;
    if (isNaN(currentEnemy.hp)) currentEnemy.hp = 0;
    const p = Math.max(0, (currentEnemy.hp / currentEnemy.maxHp) * 100);
    const bar = document.getElementById("enemy-hp-bar"); if (bar) bar.style.width = `${p}%`;
    
    const nameEl = document.getElementById("enemy-name");
    nameEl.innerText = currentEnemy.name;
    const elemInfo = ELEMENTS[currentEnemy.element || 'none'];
    nameEl.style.color = elemInfo.color;
    
    const img = document.getElementById("enemy-sprite");
    if (img) img.src = `assets/${currentEnemy.image || 'slime.png'}`;
}

function updateInventoryUI() {
    const list = document.getElementById("inventory-list"); list.innerHTML = "";
    document.getElementById("inv-count").innerText = state.inventory.length;
    state.inventory.forEach((i, idx) => {
        const d = document.createElement("div"); d.className = `inv-item ${i.rarity ? i.rarity.colorClass : ""}`;
        
        // Ensure prefix exists (migration for older items)
        if (!i.prefix) i.prefix = PREFIXES[randomInt(0, 2)];
        
        // Clean up legacy [Lv.X] from name
        let cleanName = (i.name || "装備").replace(/^\[Lv\.\d+\]\s*/, "");

        const fullName = `${i.prefix}の${cleanName}`;
        const displayLabel = i.type === 'rune' ? cleanName : `+${i.lvl||1}\n${fullName}`;
        
        d.innerText = displayLabel;
        d.style.fontSize = "0.5rem";
        d.style.lineHeight = "1.1";
        d.style.display = "flex";
        d.style.flexDirection = "column";
        d.style.justifyContent = "center";
        d.style.whiteSpace = "pre-wrap";
        d.title = fullName;
        if (i.isLocked) {
            const lock = document.createElement("div"); lock.className = "lock-indicator"; lock.innerText = "🔒";
            d.appendChild(lock);
        }
        d.onclick = () => openItemModal(idx, false);
        list.appendChild(d);
    });
}

function updateEquipmentUI() {
    ['weapon', 'head', 'body', 'hands', 'feet', 'accessory'].forEach(type => {
        const i = state.equipment[type]; const el = document.getElementById(`equip-${type}`);
        if (!el) return;
        if (i) { 
            const fullName = `${i.prefix}の${i.name} +${i.lvl}`;
            el.querySelector('.slot-item').innerText = fullName; 
            el.querySelector('.slot-item').className = `slot-item val ${i.rarity.colorClass}`; 
        }
        else { el.querySelector('.slot-item').innerText = "なし"; el.querySelector('.slot-item').className = "slot-item val"; }
        el.onclick = () => { if (i) openItemModal(type, true); };
    });
}

function updatePartyUI() {
    const l = document.getElementById("party-list"); l.innerHTML = "";
    state.party.forEach((m, i) => { const d = document.createElement("div"); d.className = "stat-item mt-1"; d.innerHTML = `<span>${m.name} Lv.${m.level}</span><button class="btn-sm" onclick="window.dismissMercenary(${i})">解雇</button>`; l.appendChild(d); });
    const t = document.getElementById("tavern-list"); t.innerHTML = "";
    availableMercs.forEach((m, i) => { const d = document.createElement("div"); d.className = "stat-item mt-1"; d.innerHTML = `<span>${m.name} (${m.price}G)</span><button class="btn-sm" onclick="window.hireMercenary(${i})">雇用</button>`; t.appendChild(d); });
}

function updateKamuiUI() {
    document.getElementById("kamui-gain-amount").innerText = Math.floor(state.floor / 5);
    const u = document.getElementById("kamui-upgrades"); u.innerHTML = "";
    ['expBonus', 'goldBonus', 'dropRateBonus', 'statsBonus'].forEach(k => {
        const d = document.createElement("div"); d.className = "stat-item mt-1";
        d.innerHTML = `<span>${k} Lv.${state.kamuiUpgrades[k]}</span><button class="btn-sm" onclick="window.buyKamuiUpgrade('${k}')">強化</button>`;
        u.appendChild(d);
    });
}

// --- Canvas Board ---

function drawPassiveBoard() {
    const canvas = document.getElementById("passive-canvas"); if (!canvas) return;
    const container = canvas.parentElement;
    if (container.clientWidth === 0 || container.clientHeight === 0) return; // Skip if hidden
    if (canvas.width !== container.clientWidth) canvas.width = container.clientWidth;
    if (canvas.height !== container.clientHeight) canvas.height = container.clientHeight;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    const cx = canvas.width/2 + boardOffset.x;
    const cy = canvas.height/2 + boardOffset.y;
    ctx.translate(cx, cy);
    
    // Viewport culling bounds (in local space)
    const minX = -cx - 50; const maxX = canvas.width - cx + 50;
    const minY = -cy - 50; const maxY = canvas.height - cy + 50;
    
    // Create map for O(1) lookups if not exists
    if (!window.PASSIVE_NODES_MAP) {
        window.PASSIVE_NODES_MAP = {};
        PASSIVE_NODES.forEach(n => window.PASSIVE_NODES_MAP[n.id] = n);
    }
    
    // Draw Lines
    ctx.lineWidth = 2;
    PASSIVE_NODES.forEach(n => {
        // Simple bounding box cull for lines (if both points are offscreen, rough cull)
        // For simplicity, we just check if the node itself is somewhat near screen
        if (n.pos.x < minX - 200 || n.pos.x > maxX + 200 || n.pos.y < minY - 200 || n.pos.y > maxY + 200) return;
        
        const unlocked = state.unlockedNodes.includes(n.id);
        n.req.forEach(rid => {
            const r = window.PASSIVE_NODES_MAP[rid];
            if (r) {
                ctx.beginPath(); ctx.moveTo(n.pos.x, n.pos.y); ctx.lineTo(r.pos.x, r.pos.y);
                ctx.strokeStyle = (unlocked && state.unlockedNodes.includes(rid)) ? "#fbbf24" : "rgba(255,255,255,0.05)";
                ctx.stroke();
            }
        });
    });
    
    // Draw Nodes
    PASSIVE_NODES.forEach(n => {
        if (n.pos.x < minX || n.pos.x > maxX || n.pos.y < minY || n.pos.y > maxY) return;
        
        const unlocked = state.unlockedNodes.includes(n.id);
        const canUnlock = state.passivePoints >= n.cost && (n.req.length === 0 || n.req.some(rid => state.unlockedNodes.includes(rid)));
        
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, n.isKeystone ? 12 : 8, 0, Math.PI*2);
        ctx.fillStyle = unlocked ? "#fbbf24" : (canUnlock ? "#3b82f6" : "#1e293b");
        ctx.fill();
        if (canUnlock && !unlocked) { ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke(); }
        
        if (unlocked || canUnlock || n.isKeystone) {
            ctx.fillStyle = "white"; ctx.font = "10px Outfit"; ctx.textAlign = "center";
            ctx.fillText(n.name, n.pos.x, n.pos.y + (n.isKeystone ? 25 : 20));
        }
    });
    ctx.restore();
    document.getElementById("passive-points-count").innerText = state.passivePoints;
}

function handleBoardClick(x, y) {
    const canvas = document.getElementById("passive-canvas");
    const rect = canvas.getBoundingClientRect();
    const worldX = (x - rect.left) - canvas.width/2 - boardOffset.x;
    const worldY = (y - rect.top) - canvas.height/2 - boardOffset.y;
    
    const clickedNode = PASSIVE_NODES.find(n => {
        const dx = n.pos.x - worldX; const dy = n.pos.y - worldY;
        return Math.sqrt(dx*dx + dy*dy) < 20;
    });
    
    if (clickedNode) {
        const unlocked = state.unlockedNodes.includes(clickedNode.id);
        const canUnlock = state.passivePoints >= clickedNode.cost && (clickedNode.req.length === 0 || clickedNode.req.some(rid => state.unlockedNodes.includes(rid)));
        if (canUnlock && !unlocked) {
            state.passivePoints -= clickedNode.cost; state.unlockedNodes.push(clickedNode.id);
            logMessage(`${clickedNode.name} 解放！`); updateAllUI(); saveGame();
        } else if (unlocked) {
            logMessage(`${clickedNode.name}: ${clickedNode.desc || '解放済み'}`);
        }
    }
}

// --- Modals ---

let selectedItemSource = null;
function openSkillModal() {
    const list = document.getElementById("skill-list"); if (!list) return; list.innerHTML = "";
    const cid = state.hero.classId;
    CLASSES[cid].skills.forEach(s => {
        const btn = document.createElement("button"); btn.className = "btn btn-gold w-100 mt-05";
        const locked = s.unlockLvl > (state.hero.classLevels[cid] || 1);
        const cd = skillCooldowns[s.id] || 0;
        btn.disabled = locked || cd > 0 || isActing;
        btn.innerHTML = `<div><strong>${s.name}</strong> ${locked ? `(Lv.${s.unlockLvl}解放)` : (cd > 0 ? `(${cd}s)` : "")}</div><div style="font-size:0.7rem">${s.desc}</div>`;
        if (!btn.disabled) btn.onclick = () => { useSkill(s); };
        list.appendChild(btn);
    });
    document.getElementById("skill-modal").classList.remove("hidden");
}
function closeSkillModal() { document.getElementById("skill-modal").classList.add("hidden"); }

function useSkill(skill) {
    if ((skillCooldowns[skill.id] || 0) > 0 || !currentEnemy || canProceed || isActing) return;
    const stats = getHeroTotalStats();
    executeAttack(skill.mult || 1, true);
    if (skill.heal) updateHeroHP(Math.floor(stats.maxHp * skill.heal));
    skillCooldowns[skill.id] = skill.cd; closeSkillModal();
}

function openItemModal(val, isEquipped) {
    selectedItemSource = { val, isEquipped };
    const item = isEquipped ? state.equipment[val] : state.inventory[val];
    if (!item) return;
    document.getElementById("item-modal").classList.remove("hidden");
    document.getElementById("modal-item-name").innerText = `${item.prefix}の${item.name} ${item.type !== 'rune' ? '+' + (item.lvl || 1) : ''}`;
    document.getElementById("modal-item-name").className = item.rarity ? item.rarity.colorClass : "";
    const itemElem = ELEMENTS[item.element || 'none'];
    let prefDesc = "";
    if (item.prefixData && item.prefixData.bonus) {
        prefDesc = `<div style="font-size:0.7rem; color:var(--success-color)">接頭辞ボーナス: ${item.prefix}[${Object.keys(item.prefixData.bonus).join('/')}]</div>`;
    }
    document.getElementById("modal-item-stats").innerHTML = `Lv.${item.lvl||1} <span style="color:${itemElem.color}">[${itemElem.name}]</span><br>ATK: ${item.atk||0} DEF: ${item.def||0} HP: ${item.hp||0}${prefDesc}`;
    
    document.getElementById("btn-equip-item").classList.toggle("hidden", isEquipped || item.type === 'rune');
    const lockBtn = document.getElementById("btn-lock-item");
    if (lockBtn) {
        lockBtn.innerText = item.isLocked ? "🔒 ロック解除" : "🔓 ロックする";
        lockBtn.classList.toggle("hidden", item.type === 'rune');
    }
    const refineBtn = document.getElementById("btn-refine-item");
    if (refineBtn) {
        refineBtn.classList.toggle("hidden", item.type === 'rune');
        refineBtn.innerText = `強化する (${(item.lvl || 1) * 100}G)`;
    }
    const optBox = document.getElementById("modal-item-options");
    if (optBox) {
        optBox.innerHTML = "<h4>オプション (4枠)</h4>";
        (item.options || []).forEach((o, i) => {
            const div = document.createElement("div"); div.className = "stat-item mt-1";
            const isPct = o.id.includes('Pct') || ['crit', 'avoid', 'skillDmg'].includes(o.id);
            const displayVal = isPct ? (o.val * 100).toFixed(1) + '%' : o.val;
            const cost = Math.floor(100 * (item.lvl || 1) * (item.rarity ? item.rarity.mult : 1));
            div.innerHTML = `<span style="font-size:0.8rem">${o.name}: ${displayVal}</span>`;
            const btn = document.createElement("button"); btn.className = "btn-sm"; btn.innerText = `${cost}G`;
            btn.onclick = () => window.rerollOption(val, isEquipped, i);
            div.appendChild(btn); optBox.appendChild(div);
        });
    }
    
    const socks = document.getElementById("modal-item-sockets"); socks.innerHTML = "";
    if (item.socketCount > 0) {
        socks.innerHTML = "<h4>ソケット:</h4>";
        for (let sIdx = 0; sIdx < item.socketCount; sIdx++) {
            const sId = item.sockets ? item.sockets[sIdx] : null;
            const d = document.createElement("div"); d.className = "stat-item mt-1";
            if (sId) {
                const rune = RUNES.find(r => r.id === sId);
                d.innerHTML = `<span>${rune ? rune.name : '不明'}</span><button class="btn-sm" onclick="window.removeRune('${val}', ${isEquipped}, ${sIdx})">外す</button>`;
            } else {
                d.innerHTML = `<span>空きソケット</span><button class="btn-sm" onclick="window.openRuneSelect('${val}', ${isEquipped}, ${sIdx})">装着</button>`;
            }
            socks.appendChild(d);
        }
    }

    // Comparison logic
    const compEl = document.getElementById("modal-item-compare"); compEl.innerHTML = "";
    if (!isEquipped && item.type !== 'rune') {
        const cur = state.equipment[item.type];
        if (cur) {
            const diffAtk = (item.atk || 0) - (cur.atk || 0);
            const diffDef = (item.def || 0) - (cur.def || 0);
            const diffHp = (item.hp || 0) - (cur.hp || 0);
            compEl.innerHTML = `
                <div class="status-card" style="border-style: dashed; border-color: var(--text-muted)">
                    <h4 style="font-size:0.7rem">現在の装備と比較:</h4>
                    <div class="stat-grid" style="font-size:0.7rem">
                        <div>ATK: ${diffAtk >= 0 ? '<span class="val-up">+' + diffAtk + '</span>' : '<span class="val-down">' + diffAtk + '</span>'}</div>
                        <div>DEF: ${diffDef >= 0 ? '<span class="val-up">+' + diffDef + '</span>' : '<span class="val-down">' + diffDef + '</span>'}</div>
                        <div>HP: ${diffHp >= 0 ? '<span class="val-up">+' + diffHp + '</span>' : '<span class="val-down">' + diffHp + '</span>'}</div>
                    </div>
                </div>`;
        }
    }
}
function closeItemModal() { document.getElementById("item-modal").classList.add("hidden"); }

function exportSaveCode() {
    const code = btoa(encodeURIComponent(JSON.stringify(state)));
    const el = document.createElement('textarea'); el.value = code; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    alert("セーブコードをクリップボードにコピーしました。");
}
function importSaveCode() {
    const code = prompt("セーブコードを入力してください:");
    if (!code) return;
    try {
        const decoded = JSON.parse(decodeURIComponent(atob(code)));
        if (decoded && decoded.hero) {
            localStorage.setItem(SAVE_KEY, JSON.stringify(decoded));
            location.reload();
        } else { alert("無効なセーブコードです。"); }
    } catch(e) { alert("セーブコードの読み込みに失敗しました。"); }
}

// --- Utils ---

function refreshTavern() {
    availableMercs = []; const fl = Math.max(1, Math.floor(state.floor / 5));
    for (let i=0; i<3; i++) {
        const n = ["アーサー", "ランスロット", "ジャンヌ"][randomInt(0, 2)];
        availableMercs.push({ id: Date.now()+i, name: n, level: fl, atk: Math.floor(10 * Math.pow(1.03, fl)), price: Math.floor(100*Math.pow(1.5, fl)) });
    }
}

function startBattle() {
    if (canProceed) return;
    if (!currentEnemy) {
        const t = ENEMY_TYPES[randomInt(0, ENEMY_TYPES.length - 1)]; 
        const m = Math.pow(1.03, state.floor - 1);
        const elemKeys = Object.keys(ELEMENTS);
        const randElem = elemKeys[randomInt(0, elemKeys.length - 1)];
        
        currentEnemy = { 
            ...t, 
            maxHp: Math.floor(30 * t.hpMult * m), 
            hp: Math.floor(30 * t.hpMult * m), 
            atk: Math.floor(8 * t.atkMult * m), 
            def: Math.floor(3 * t.defMult * m), 
            isBoss: state.floor % 10 === 0,
            element: randElem
        };
    }
    if (!battleInterval) battleInterval = setInterval(() => { if (state.isAutoMode && canProceed) nextFloor(); if (state.isAutoMode && !isActing && !canProceed) executeAttack(); }, 1000);
    updateAllUI();
}

function nextFloor() { state.floor++; currentEnemy = null; canProceed = false; isActing = false; updateHeroHP(getHeroTotalStats().maxHp * 0.1); if(state.floor%5===0) refreshTavern(); startBattle(); }

// --- Global Functions ---
window.hireMercenary = (i) => { const m = availableMercs[i]; if (state.gold >= m.price && state.party.length < 3) { state.gold -= m.price; state.party.push(m); availableMercs.splice(i, 1); state.achievements.total_hired = (state.achievements.total_hired || 0) + 1; updateAllUI(); saveGame(); } };
window.dismissMercenary = (i) => { state.party.splice(i, 1); updateAllUI(); saveGame(); };
window.buyKamuiUpgrade = (k) => { if (state.kamui >= 1) { state.kamui -= 1; state.kamuiUpgrades[k]++; updateAllUI(); saveGame(); } };
window.rerollOption = (val, isEquipped, idx) => { 
    const item = isEquipped ? state.equipment[val] : state.inventory[val]; 
    if (!item) return;
    const cost = Math.floor(100 * (item.lvl || 1) * (item.rarity ? item.rarity.mult : 1));
    if (state.gold >= cost) { 
        state.gold -= cost; 
        const type = OPTION_TYPES[randomInt(0, OPTION_TYPES.length - 1)];
        item.options[idx] = { id: type.id, name: type.name, val: getOptionValue(type.id, item.lvl, item.rarity) };
        updateAllUI(); openItemModal(val, isEquipped); saveGame(); 
    } else {
        alert("ゴールドが足りません！");
    }
};

let selectedSocket = null;
window.removeRune = (val, isEquipped, sIdx) => {
    const item = isEquipped ? state.equipment[val] : state.inventory[val];
    const rId = item.sockets[sIdx];
    const rune = RUNES.find(r => r.id === rId);
    if (rune) state.inventory.push({...rune, type: 'rune'});
    item.sockets[sIdx] = null;
    updateAllUI(); openItemModal(val, isEquipped); saveGame();
};
window.openRuneSelect = (val, isEquipped, sIdx) => {
    selectedSocket = { val, isEquipped, sIdx };
    const list = document.getElementById("rune-select-list"); list.innerHTML = "";
    state.inventory.forEach((i, idx) => {
        if (i.type === 'rune') {
            const d = document.createElement("div"); d.className = "stat-item mt-1";
            d.innerHTML = `<span>${i.name}</span><button class="btn-sm" onclick="window.equipRune(${idx})">装着</button>`;
            list.appendChild(d);
        }
    });
    document.getElementById("rune-modal").classList.remove("hidden");
};
window.equipRune = (invIdx) => {
    if (!selectedSocket) return;
    const item = selectedSocket.isEquipped ? state.equipment[selectedSocket.val] : state.inventory[selectedSocket.val];
    const rune = state.inventory[invIdx];
    if (!item.sockets) item.sockets = [];
    item.sockets[selectedSocket.sIdx] = rune.id;
    state.inventory.splice(invIdx, 1);
    document.getElementById("rune-modal").classList.add("hidden");
    updateAllUI(); openItemModal(selectedSocket.val, selectedSocket.isEquipped); saveGame();
};
// --- Helpers ---
const $ = id => document.getElementById(id);
const setClick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

function switchDungeon(type) {
    if (state.currentDungeon === type) return;
    state.currentDungeon = type;
    $("btn-dungeon-normal").classList.toggle("active", type === 'normal');
    $("btn-dungeon-rune").classList.toggle("active", type === 'rune');
    state.floor = 1; currentEnemy = null; updateAllUI(); startBattle(); saveGame();
}

function sellFiltered(filterFn, label) {
    let sold = 0, gain = 0;
    state.inventory = state.inventory.filter(i => {
        if (!i.isLocked && filterFn(i)) { gain += i.value; sold++; return false; }
        return true;
    });
    if (sold > 0) { state.gold += gain; updateAllUI(); saveGame(); alert(`${label}${sold}個売却し、${gain}G獲得しました。`); }
    else { alert(`売却できる${label}装備がありません。`); }
}

function handlePrestige() {
    if (state.floor < 10) { alert("10階以降で転生可能です"); return; }
    if (!confirm("本当に転生しますか？神威ポイントを獲得し、進行階層とゴールドがリセットされます（装備品は維持されます）。")) return;
    state.kamui += Math.floor(state.floor / 5);
    state.achievements.prestige_count = (state.achievements.prestige_count || 0) + 1;
    state.floor = 1; state.gold = 0;
    currentEnemy = null; updateAllUI(); startBattle(); saveGame();
}

function handleEquipItem() {
    if (!selectedItemSource || selectedItemSource.isEquipped) return;
    const idx = selectedItemSource.val;
    const item = state.inventory[idx];
    const slot = (item.type === 'armor') ? item.armorType : item.type;
    if (state.equipment[slot]) state.inventory.push(state.equipment[slot]);
    state.equipment[slot] = item;
    state.inventory.splice(idx, 1);
    closeItemModal(); updateAllUI(); saveGame();
}

function handleRefineItem() {
    if (!selectedItemSource) return;
    const { val, isEquipped } = selectedItemSource;
    const item = isEquipped ? state.equipment[val] : state.inventory[val];
    if (!item || item.type === 'rune') return;
    const cost = (item.lvl || 1) * 100;
    if (state.gold < cost) { alert("お金が足りません！"); return; }
    state.gold -= cost; item.lvl = (item.lvl || 1) + 1;
    ['atk', 'def', 'hp'].forEach(s => { if (item[s]) item[s] = Math.floor(item[s] * 1.1) + 1; });
    item.value = Math.floor(item.value * 1.5);
    updateAllUI(); openItemModal(val, isEquipped); saveGame();
}

function handleSellItem() {
    if (!selectedItemSource || selectedItemSource.isEquipped) return;
    const idx = selectedItemSource.val;
    const item = state.inventory[idx];
    if (item.isLocked) { alert("このアイテムはロックされています。"); return; }
    state.gold += item.value;
    state.inventory.splice(idx, 1);
    closeItemModal(); updateAllUI(); saveGame();
}

function handleLockItem() {
    if (!selectedItemSource) return;
    const { val, isEquipped } = selectedItemSource;
    const item = isEquipped ? state.equipment[val] : state.inventory[val];
    if (!item) return;
    item.isLocked = !item.isLocked;
    updateAllUI(); openItemModal(val, isEquipped); saveGame();
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
    loadGame();

    // Tab switching
    document.querySelectorAll(".tab-btn").forEach(b => b.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
        b.classList.add("active"); $(b.dataset.target).classList.add("active");
        if (b.dataset.target === 'tab-star') setTimeout(drawPassiveBoard, 50);
    });

    // Canvas drag (mouse)
    const canvas = $("passive-canvas");
    canvas.onmousedown = e => { isDragging = true; lastMousePos = { x: e.clientX, y: e.clientY }; dragMoved = false; };
    window.onmousemove = e => {
        if (!isDragging) return;
        const dx = e.clientX - lastMousePos.x, dy = e.clientY - lastMousePos.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true;
        boardOffset.x += dx; boardOffset.y += dy;
        lastMousePos = { x: e.clientX, y: e.clientY };
        drawPassiveBoard();
    };
    window.onmouseup = e => { if (!dragMoved && isDragging) handleBoardClick(e.clientX, e.clientY); isDragging = false; };

    // Canvas drag (touch)
    canvas.ontouchstart = e => { isDragging = true; lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; dragMoved = false; };
    canvas.ontouchmove = e => {
        if (!isDragging) return;
        const dx = e.touches[0].clientX - lastMousePos.x, dy = e.touches[0].clientY - lastMousePos.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true;
        boardOffset.x += dx; boardOffset.y += dy;
        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        drawPassiveBoard(); e.preventDefault();
    };
    canvas.ontouchend = () => { if (!dragMoved && isDragging) handleBoardClick(lastMousePos.x, lastMousePos.y); isDragging = false; };

    // Button bindings (declarative)
    const buttons = {
        "btn-attack":            executeAttack,
        "btn-toggle-auto":       () => { state.isAutoMode = !state.isAutoMode; updateBattleControls(); },
        "btn-open-skills":       openSkillModal,
        "btn-close-skill-modal": closeSkillModal,
        "btn-next-floor":        nextFloor,
        "btn-close-modal":       closeItemModal,
        "btn-close-rune-modal":  () => $("rune-modal").classList.add("hidden"),
        "btn-save-game":         () => { saveGame(); alert("セーブしました"); },
        "btn-reset-game":        () => { if (confirm("本当にデータを初期化しますか？")) { localStorage.removeItem(SAVE_KEY); location.reload(); } },
        "btn-export-code":       exportSaveCode,
        "btn-import-code":       importSaveCode,
        "btn-dungeon-normal":    () => switchDungeon('normal'),
        "btn-dungeon-rune":      () => switchDungeon('rune'),
        "btn-retreat":           () => { if (state.floor > 1) { state.floor--; currentEnemy = null; startBattle(); } },
        "btn-prestige":          handlePrestige,
        "btn-equip-item":        handleEquipItem,
        "btn-refine-item":       handleRefineItem,
        "btn-sell-item":         handleSellItem,
        "btn-lock-item":         handleLockItem,
        "btn-sell-weaker":       () => {
            const totalStats = i => (i.atk||0) + (i.def||0) + (i.hp||0);
            sellFiltered(i => i.type !== 'rune' && state.equipment[i.type] && totalStats(i) < totalStats(state.equipment[i.type]), "");
        },
        "btn-sell-all":          () => sellFiltered(i => i.type !== 'rune' && i.rarity && i.rarity.name === 'コモン', "コモン"),
    };
    for (const [id, fn] of Object.entries(buttons)) setClick(id, fn);

    const classSelect = $("hero-class-select");
    if (classSelect) classSelect.onchange = e => { state.hero.classId = e.target.value; updateAllUI(); saveGame(); };

    startBattle();
});
