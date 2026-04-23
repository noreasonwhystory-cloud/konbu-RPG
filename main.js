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
    equipment: { weapon: null, armor: null, accessory: null },
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

const TITLES = [
    { id: 'sl_slime_1', name: 'スライムハンター', req: { 'スライム': 10 }, bonus: { atk: 5 }, desc: 'スライム10体: ATK+5' },
    { id: 'sl_slime_2', name: 'スライムキラー', req: { 'スライム': 50 }, bonus: { atk: 20 }, desc: 'スライム50体: ATK+20' },
    { id: 'sl_slime_3', name: 'スライムマスター', req: { 'スライム': 200 }, bonus: { atkPct: 0.05 }, desc: 'スライム200体: ATK+5%' },
    { id: 'fl_10', name: '冒険の始まり', req: { 'floor': 10 }, bonus: { hp: 20 }, desc: '10階到達: HP+20' },
    { id: 'fl_100', name: '熟練の戦士', req: { 'floor': 100 }, bonus: { hpPct: 0.1 }, desc: '100階到達: HP+10%' },
    { id: 'gd_10k', name: '商人の弟子', req: { 'gold': 10000 }, bonus: { goldPct: 0.1 }, desc: '10,000G: Gold+10%' },
    { id: 'cl_100', name: '目利き', req: { 'total_loot': 100 }, bonus: { dropPct: 0.15 }, desc: '100個獲得: Drop+15%' }
];

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

const PASSIVE_NODES = [];
function generateNodes() {
    PASSIVE_NODES.push({ id: 'start', name: '起点', pos: { x: 0, y: 0 }, effect: { atk: 5 }, cost: 0, req: [] });
    const branches = 8; const nodesPerBranch = 124;
    const types = [
        { name: '力', eff: 'atkPct', val: 0.01 }, { name: '守', eff: 'defPct', val: 0.01 },
        { name: '命', eff: 'hpPct', val: 0.02 }, { name: '技', eff: 'skillDmg', val: 0.02 },
        { name: '極', eff: 'crit', val: 0.005 }, { name: '避', eff: 'avoid', val: 0.005 }
    ];
    for (let b = 0; b < branches; b++) {
        let prevId = 'start'; const angle = (b / branches) * Math.PI * 2;
        for (let n = 1; n <= nodesPerBranch; n++) {
            const id = `node_${b}_${n}`; const type = types[(b + n) % types.length]; const isKeystone = n % 25 === 0;
            const node = {
                id, name: isKeystone ? '大星' : type.name,
                pos: { x: Math.cos(angle) * n * 120, y: Math.sin(angle) * n * 120 },
                effect: { [type.eff]: isKeystone ? type.val * 5 : type.val },
                cost: isKeystone ? n : Math.floor(n / 10) + 1,
                req: [prevId], isKeystone, desc: isKeystone ? `強力な${type.name}の加護` : `${type.name}アップ`
            };
            if (isKeystone && b === 0 && n === 25) { node.id = 'keystone_meteor'; node.name = '流星'; node.effect = { meteor: true }; }
            PASSIVE_NODES.push(node); prevId = id;
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
    if (saved) { try { state = deepMerge(getInitialState(), JSON.parse(saved)); } catch (e) { state = getInitialState(); } }
    refreshTavern(); updateAllUI();
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getElementMult(atkElem, defElem) {
    if (atkElem === 'none' || defElem === 'none') return 1.0;
    if (ELEMENTS[atkElem].weakTo === defElem) return 0.5;
    if (ELEMENTS[defElem].weakTo === atkElem) return 1.5;
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
        if (t && t.bonus) { if (t.bonus.atk) atk += t.bonus.atk; if (t.bonus.atkPct) atk *= (1 + t.bonus.atkPct); }
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
            (i.options || []).forEach(o => { if (o.type === 'atkPct') atk *= (1 + o.val); if (o.type === 'atk') atk += o.val; });
            (i.sockets || []).forEach(sid => { const r = RUNES.find(rx => rx.id === sid); if (r && r.bonus.atkPct) atk *= (1+r.bonus.atkPct); });
            if (i.prefix) setCounts[i.prefix] = (setCounts[i.prefix] || 0) + 1;
        }
    }
    state.unlockedNodes.forEach(nid => {
        const n = PASSIVE_NODES.find(nx => nx.id === nid);
        if (n && n.effect) {
            if (n.effect.atkPct) atk *= (1 + n.effect.atkPct); if (n.effect.crit) crit += n.effect.crit; if (n.effect.avoid) avoid += n.effect.avoid; if (n.effect.skillDmg) skillDmgMult += n.effect.skillDmg;
        }
    });
    for (let p in setCounts) { if (setCounts[p] >= 3) atk *= 1.2; }
    return { atk: Math.floor(atk), def: Math.floor(def), maxHp: Math.floor(maxHp), crit: Math.min(0.8, crit), avoid: Math.min(0.8, avoid), skillDmg: skillDmgMult };
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
    const heroElem = state.equipment.weapon ? state.equipment.weapon.element : 'none';
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
    const eMult = getElementMult(currentEnemy.element, state.equipment.armor ? state.equipment.armor.element : 'none');
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
    const rar = RARITIES[randomInt(0, 4)];
    const item = { id: Date.now(), type, rarity: rar, lvl: fl, name: `[Lv.${fl}] ${rar.name}装備`, options: [], sockets: [], socketCount: randomInt(0, 3), element: 'none', value: fl * 10 };
    if (type === 'weapon') { const w = WEAPON_TYPES[randomInt(0, 3)]; item.weaponType = w.id; item.name = `[Lv.${fl}] ${w.name}`; item.atk = fl * 5; }
    else if (type === 'armor') { item.def = fl * 2; } else { item.hp = fl * 10; }
    for(let s=0; s<item.socketCount; s++) item.sockets.push(null);
    state.inventory.push(item); state.achievements.total_loot++;
}
function generateRune() {
    if (state.inventory.length >= state.maxInventory) return;
    const r = RUNES[randomInt(0, 2)]; state.inventory.push({...r, type: 'rune', value: 100}); state.achievements.konbu_count++;
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
    document.getElementById("hero-crit").innerText = (stats.crit * 100).toFixed(1) + "%";
    document.getElementById("hero-avoid").innerText = (stats.avoid * 100).toFixed(1) + "%";
    
    const tList = document.getElementById("title-list"); if (tList) {
        tList.innerHTML = ""; TITLES.forEach(t => {
            const unlocked = Object.keys(t.req).every(k => (state.achievements[k] || state.achievements.kills[k] || state[k] || 0) >= t.req[k]);
            const d = document.createElement("div"); d.className = `status-card mt-1 ${unlocked?'':'locked'}`;
            d.innerHTML = `<div><strong>${t.name}</strong><br><small>${t.desc}</small></div>`;
            if (unlocked) { const b = document.createElement("button"); b.className="btn-sm mt-1"; b.innerText = state.currentTitleId === t.id ? "装備中" : "装備"; b.onclick=()=>{state.currentTitleId=t.id; updateAllUI();}; d.appendChild(b); }
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
    document.getElementById("enemy-name").innerText = currentEnemy.name;
    const img = document.getElementById("enemy-sprite");
    if (img) img.src = `assets/${currentEnemy.image || 'slime.png'}`;
}

function updateInventoryUI() {
    const list = document.getElementById("inventory-list"); list.innerHTML = "";
    document.getElementById("inv-count").innerText = state.inventory.length;
    state.inventory.forEach((i, idx) => {
        const d = document.createElement("div"); d.className = `inv-item ${i.rarity ? i.rarity.colorClass : ""}`;
        d.innerText = i.name.split(" ").pop(); // Show type like "剣" or "装備"
        d.onclick = () => openItemModal(idx, false);
        list.appendChild(d);
    });
}

function updateEquipmentUI() {
    ['weapon', 'armor', 'accessory'].forEach(type => {
        const i = state.equipment[type]; const el = document.getElementById(`equip-${type}`);
        if (i) { el.querySelector('.slot-item').innerText = i.name; el.querySelector('.slot-item').className = `slot-item val ${i.rarity.colorClass}`; }
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
    const ctx = canvas.getContext("2d");
    const container = canvas.parentElement;
    canvas.width = container.clientWidth; canvas.height = container.clientHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width/2 + boardOffset.x, canvas.height/2 + boardOffset.y);
    
    // Draw Lines
    ctx.lineWidth = 2;
    PASSIVE_NODES.forEach(n => {
        const unlocked = state.unlockedNodes.includes(n.id);
        n.req.forEach(rid => {
            const r = PASSIVE_NODES.find(nx => nx.id === rid);
            if (r) {
                ctx.beginPath(); ctx.moveTo(n.pos.x, n.pos.y); ctx.lineTo(r.pos.x, r.pos.y);
                ctx.strokeStyle = (unlocked && state.unlockedNodes.includes(rid)) ? "#fbbf24" : "rgba(255,255,255,0.05)";
                ctx.stroke();
            }
        });
    });
    
    // Draw Nodes
    PASSIVE_NODES.forEach(n => {
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
    document.getElementById("modal-item-name").innerText = item.name;
    document.getElementById("modal-item-stats").innerHTML = `Lv.${item.lvl}<br>ATK: ${item.atk||0} DEF: ${item.def||0} HP: ${item.hp||0}`;
    const opts = document.getElementById("modal-item-options"); opts.innerHTML = "";
    (item.options || []).forEach((o, idx) => {
        const d = document.createElement("div"); d.className = "stat-item mt-1";
        d.innerHTML = `<span>${o.type}: ${o.val}</span><button class="btn-sm" onclick="window.rerollOption('${val}', ${isEquipped}, ${idx})">再抽選</button>`;
        opts.appendChild(d);
    });
}
function closeItemModal() { document.getElementById("item-modal").classList.add("hidden"); }

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
        const t = ENEMY_TYPES[randomInt(0, ENEMY_TYPES.length - 1)]; const m = Math.pow(1.03, state.floor - 1);
        currentEnemy = { ...t, maxHp: Math.floor(30 * t.hpMult * m), hp: Math.floor(30 * t.hpMult * m), atk: Math.floor(8 * t.atkMult * m), def: Math.floor(3 * t.defMult * m), isBoss: state.floor%10===0 };
    }
    if (!battleInterval) battleInterval = setInterval(() => { if (state.isAutoMode && canProceed) nextFloor(); if (state.isAutoMode && !isActing && !canProceed) executeAttack(); }, 1000);
    updateAllUI();
}

function nextFloor() { state.floor++; currentEnemy = null; canProceed = false; isActing = false; updateHeroHP(getHeroTotalStats().maxHp * 0.1); if(state.floor%5===0) refreshTavern(); startBattle(); }

// --- Global Functions ---
window.hireMercenary = (i) => { const m = availableMercs[i]; if (state.gold >= m.price && state.party.length < 3) { state.gold -= m.price; state.party.push(m); availableMercs.splice(i, 1); updateAllUI(); saveGame(); } };
window.dismissMercenary = (i) => { state.party.splice(i, 1); updateAllUI(); saveGame(); };
window.buyKamuiUpgrade = (k) => { if (state.kamui >= 1) { state.kamui -= 1; state.kamuiUpgrades[k]++; updateAllUI(); saveGame(); } };
window.rerollOption = (val, isEquipped, idx) => { const item = isEquipped ? state.equipment[val] : state.inventory[val]; if (state.gold >= 100) { state.gold -= 100; item.options[idx].val = randomInt(1, 10); updateAllUI(); openItemModal(val, isEquipped); saveGame(); } };

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
    loadGame();
    // Tab switching
    document.querySelectorAll(".tab-btn").forEach(b => b.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active"));
        b.classList.add("active"); document.getElementById(b.dataset.target).classList.add("active");
        if (b.dataset.target === 'tab-star') setTimeout(drawPassiveBoard, 50);
    });
    
    // Canvas interaction
    const canvas = document.getElementById("passive-canvas");
    canvas.onmousedown = (e) => { isDragging = true; lastMousePos = { x: e.clientX, y: e.clientY }; dragMoved = false; };
    window.onmousemove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMousePos.x; const dy = e.clientY - lastMousePos.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true;
        boardOffset.x += dx; boardOffset.y += dy; lastMousePos = { x: e.clientX, y: e.clientY };
        drawPassiveBoard();
    };
    window.onmouseup = (e) => { if (!dragMoved && isDragging) handleBoardClick(e.clientX, e.clientY); isDragging = false; };
    
    // Touch interaction
    canvas.ontouchstart = (e) => { isDragging = true; lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; dragMoved = false; };
    canvas.ontouchmove = (e) => {
        if (!isDragging) return;
        const dx = e.touches[0].clientX - lastMousePos.x; const dy = e.touches[0].clientY - lastMousePos.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true;
        boardOffset.x += dx; boardOffset.y += dy; lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        drawPassiveBoard(); e.preventDefault();
    };
    canvas.ontouchend = (e) => { if (!dragMoved && isDragging) handleBoardClick(lastMousePos.x, lastMousePos.y); isDragging = false; };

    document.getElementById("btn-attack").onclick = () => executeAttack();
    document.getElementById("btn-toggle-auto").onclick = () => { state.isAutoMode = !state.isAutoMode; updateBattleControls(); };
    document.getElementById("btn-open-skills").onclick = openSkillModal;
    document.getElementById("btn-close-skill-modal").onclick = closeSkillModal;
    document.getElementById("btn-next-floor").onclick = nextFloor;
    document.getElementById("btn-close-modal").onclick = closeItemModal;
    document.getElementById("hero-class-select").onchange = (e) => { state.hero.classId = e.target.value; updateAllUI(); saveGame(); };
    
    document.getElementById("btn-equip-item").onclick = () => {
        if (!selectedItemSource) return;
        const { val, isEquipped } = selectedItemSource; if (isEquipped) return;
        const item = state.inventory[val]; if (state.equipment[item.type]) state.inventory.push(state.equipment[item.type]);
        state.equipment[item.type] = item; state.inventory.splice(val, 1); closeItemModal(); updateAllUI(); saveGame();
    };
    document.getElementById("btn-sell-item").onclick = () => {
        if (!selectedItemSource) return;
        const { val, isEquipped } = selectedItemSource; if (isEquipped) return;
        state.gold += state.inventory[val].value; state.inventory.splice(val, 1); closeItemModal(); updateAllUI(); saveGame();
    };
    
    startBattle();
});
