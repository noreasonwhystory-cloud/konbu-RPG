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
const GAME_VERSION = "1.2";
const SAVE_KEY = "konbuRpgSaveData_v12";

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
        classLevels: { novice: 1, warrior: 1, knight: 1, berserker: 1, thief: 1 },
        classExp: { novice: 0, warrior: 0, knight: 0, berserker: 0, thief: 0 }
    },
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [], maxInventory: 50,
    party: [],
    kamuiUpgrades: { expBonus: 0, goldBonus: 0, dropRateBonus: 0, statsBonus: 0 },
    achievements: { kills: {}, totalKills: 0 },
    currentTitleId: null,
    isAutoMode: false 
});

let state = getInitialState();

// Runtime variables
let battleInterval = null;
let currentEnemy = null;
let selectedItemIndex = null;
let availableMercs = [];
let canProceed = false;
let isActing = false;
let skillCooldowns = {};

// --- Data Definitions ---

const TITLES = [
    { id: 'novice_slayer', name: 'スライムハンター', req: { 'スライム': 10 }, bonus: { atk: 5 }, desc: 'スライム10体撃破: ATK+5' },
    { id: 'goblin_slayer', name: 'ゴブリンキラー', req: { 'ゴブリン': 20 }, bonus: { def: 10 }, desc: 'ゴブリン20体撃破: DEF+10' },
    { id: 'dragon_slayer', name: 'ドラゴンスレイヤー', req: { 'ドラゴン': 5 }, bonus: { atkPct: 0.1 }, desc: 'ドラゴン5体撃破: ATK+10%' },
    { id: 'collector', name: '収集家', req: { 'total_loot': 50 }, bonus: { goldPct: 0.2 }, desc: 'アイテム50個獲得: ゴールド+20%' }
];

const CLASSES = {
    novice: { name: "見習い", hpPerLvl: 5, atkPerLvl: 1, defPerLvl: 0.5, atkMult: 1.0, defMult: 1.0, hpMult: 1.0, image: "hero.png", skills: [ { id: 'bash', name: 'バッシュ', unlockLvl: 1, mult: 1.5, cd: 3, desc: '1.5倍ダメ' } ] },
    warrior: { name: "戦士", hpPerLvl: 8, atkPerLvl: 2, defPerLvl: 1, atkMult: 1.2, defMult: 1.1, hpMult: 1.1, image: "hero_warrior.png", skills: [ { id: 'power', name: '強撃', unlockLvl: 1, mult: 2.5, cd: 4, desc: '2.5倍ダメ' } ] },
    knight: { name: "騎士", hpPerLvl: 12, atkPerLvl: 1, defPerLvl: 2, atkMult: 1.0, defMult: 1.5, hpMult: 1.3, image: "hero_knight.png", skills: [ { id: 'holy', name: 'ホーリー', unlockLvl: 1, mult: 1.2, heal: 0.1, cd: 5, desc: '攻撃＋回復' } ] },
    berserker: { name: "狂戦士", hpPerLvl: 6, atkPerLvl: 3, defPerLvl: 0.2, atkMult: 1.8, defMult: 0.5, hpMult: 0.8, image: "hero_berserker.png", skills: [ { id: 'blood', name: '血の渇き', unlockLvl: 1, mult: 4.0, recoil: 0.1, cd: 5, desc: '4倍ダメ(反動)' } ] },
    thief: { name: "盗賊", hpPerLvl: 5, atkPerLvl: 1.5, defPerLvl: 0.5, atkMult: 1.1, defMult: 0.8, hpMult: 0.9, image: "hero_thief.png", skills: [ { id: 'steal', name: 'ぶんどる', unlockLvl: 1, mult: 1.2, gold: true, cd: 4, desc: '攻撃＋G' } ] }
};

const ENEMY_TYPES = [
    { name: "スライム", hpMult: 0.8, atkMult: 0.8, defMult: 0.5, element: 'water', image: "slime.png" },
    { name: "ゴブリン", hpMult: 1.0, atkMult: 1.0, defMult: 0.8, element: 'earth', image: "goblin.png" },
    { name: "ウルフ", hpMult: 0.9, atkMult: 1.2, defMult: 0.6, element: 'wind', image: "wolf.png" },
    { name: "スケルトン", hpMult: 0.8, atkMult: 1.5, defMult: 0.5, element: 'none', image: "skeleton.png" },
    { name: "オーク", hpMult: 1.5, atkMult: 1.2, defMult: 1.0, element: 'fire', image: "orc.png" },
    { name: "ガーゴイル", hpMult: 1.5, atkMult: 1.0, defMult: 2.0, element: 'earth', image: "gargoyle.png" },
    { name: "ドラゴン", hpMult: 3.0, atkMult: 2.5, defMult: 2.0, element: 'fire', image: "dragon.png" }
];

const RARITIES = [
    { name: 'コモン', colorClass: 'rarity-common', weight: 60, statMult: 1 },
    { name: 'アンコモン', colorClass: 'rarity-uncommon', weight: 25, statMult: 1.5 },
    { name: 'レア', colorClass: 'rarity-rare', weight: 10, statMult: 2.5 },
    { name: 'エピック', colorClass: 'rarity-epic', weight: 4, statMult: 4 },
    { name: 'レジェンダリー', colorClass: 'rarity-legendary', weight: 1, statMult: 8 }
];

// --- Core ---

function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

function loadGame() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = deepMerge(getInitialState(), parsed);
        } catch (e) { state = getInitialState(); }
    }
    refreshTavern(); updateAllUI();
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getElementMult(atkElem, defElem) {
    if (atkElem === 'none' || defElem === 'none') return 1.0;
    if (ELEMENTS[atkElem].weakTo === defElem) return 0.5; // Atk is weak to Def
    if (ELEMENTS[defElem].weakTo === atkElem) return 1.5; // Atk is strong against Def
    return 1.0;
}

function getHeroTotalStats() {
    const currentClass = CLASSES[state.hero.classId] || CLASSES.novice;
    const kamuiMult = 1 + (state.kamuiUpgrades.statsBonus * 0.1);
    
    let atk = state.hero.baseAtk;
    let def = state.hero.baseDef;
    let maxHp = state.hero.maxHp;

    if (state.hero.classLevels) {
        for (let cid in state.hero.classLevels) {
            const lvl = state.hero.classLevels[cid];
            const data = CLASSES[cid];
            if (data) {
                atk += (lvl - 1) * data.atkPerLvl;
                def += (lvl - 1) * data.defPerLvl;
                maxHp += (lvl - 1) * data.hpPerLvl;
            }
        }
    }

    // Apply Title Bonus
    if (state.currentTitleId) {
        const title = TITLES.find(t => t.id === state.currentTitleId);
        if (title && title.bonus) {
            if (title.bonus.atk) atk += title.bonus.atk;
            if (title.bonus.def) def += title.bonus.def;
            if (title.bonus.atkPct) atk *= (1 + title.bonus.atkPct);
        }
    }

    // Apply class multipliers
    atk *= currentClass.atkMult; def *= currentClass.defMult; maxHp *= currentClass.hpMult;
    // Apply kamui
    atk *= kamuiMult; def *= kamuiMult; maxHp *= kamuiMult;

    let setCounts = {};
    for (const key in state.equipment) {
        const i = state.equipment[key];
        if (i) { 
            atk += (i.atk || 0); def += (i.def || 0); maxHp += (i.hp || 0); 
            if (i.prefix) setCounts[i.prefix] = (setCounts[i.prefix] || 0) + 1;
        }
    }

    // Set Bonus: 3 pieces of same prefix
    for (let p in setCounts) {
        if (setCounts[p] >= 3) { atk *= 1.2; def *= 1.2; maxHp *= 1.2; }
    }

    return { atk: Math.floor(atk), def: Math.floor(def), maxHp: Math.floor(maxHp) };
}

function updateHeroHP(amount) {
    state.hero.hp += amount;
    const stats = getHeroTotalStats();
    if (state.hero.hp > stats.maxHp) state.hero.hp = stats.maxHp;
    if (state.hero.hp < 0) state.hero.hp = 0;
    const bar = document.getElementById("hero-hp-bar");
    if (bar) bar.style.width = `${(state.hero.hp / stats.maxHp) * 100}%`;
    const text = document.getElementById("hero-hp");
    if (text) text.innerText = Math.floor(state.hero.hp);
}

function updateEnemyHP() {
    if (!currentEnemy) return;
    const p = Math.max(0, (currentEnemy.hp / currentEnemy.maxHp) * 100);
    const bar = document.getElementById("enemy-hp-bar");
    if (bar) bar.style.width = `${p}%`;
    const curText = document.getElementById("enemy-hp");
    if (curText) curText.innerText = Math.floor(Math.max(0, currentEnemy.hp));
    const maxText = document.getElementById("enemy-max-hp");
    if (maxText) maxText.innerText = currentEnemy.maxHp;
}

// --- Actions ---

function executeAttack(multiplier = 1, isSkill = false) {
    if (!currentEnemy || canProceed || isActing) return;
    isActing = true; updateBattleControls();
    const stats = getHeroTotalStats();
    
    // Element Bonus
    const heroElem = state.equipment.weapon ? state.equipment.weapon.element : 'none';
    const eMult = getElementMult(heroElem, currentEnemy.element);
    
    let dmg = Math.max(1, Math.floor((stats.atk * eMult - currentEnemy.def) * multiplier) + randomInt(-2, 2));
    currentEnemy.hp -= dmg;
    
    const heroEl = document.querySelector(".hero");
    if (heroEl) { heroEl.classList.remove("attack-anim-hero"); void heroEl.offsetWidth; heroEl.classList.add("attack-anim-hero"); }
    
    logMessage(`${isSkill ? '特技！' : ''}勇者の攻撃！ ${dmg}ダメージ` + (eMult > 1 ? " (弱点!)" : (eMult < 1 ? " (耐性...)" : "")));
    updateEnemyHP();

    if (currentEnemy.hp <= 0) {
        onEnemyDefeated();
    } else {
        state.party.forEach(m => {
            if (!currentEnemy || currentEnemy.hp <= 0) return;
            let d = Math.max(1, m.atk - (currentEnemy.def*0.5) + randomInt(-1, 1));
            currentEnemy.hp -= d; logMessage(`${m.name}の追撃！ ${d}ダメージ`, "merc");
        });
        updateEnemyHP();
        if (currentEnemy.hp <= 0) onEnemyDefeated();
        else if (!state.isAutoMode) setTimeout(enemyTurn, 600);
    }
}

function enemyTurn() {
    if (!currentEnemy || currentEnemy.hp <= 0 || canProceed) { isActing = false; updateBattleControls(); return; }
    const stats = getHeroTotalStats();
    
    // Enemy Element Bonus
    const heroElem = state.equipment.armor ? state.equipment.armor.element : 'none';
    const eMult = getElementMult(currentEnemy.element, heroElem);
    
    let d = Math.max(1, Math.floor(currentEnemy.atk * eMult - stats.def) + randomInt(-1, 1));
    updateHeroHP(-d);
    
    const enemyEl = document.querySelector(".enemy");
    if (enemyEl) { enemyEl.classList.remove("attack-anim-enemy"); void enemyEl.offsetWidth; enemyEl.classList.add("attack-anim-enemy"); }
    
    logMessage(`${currentEnemy.name}の反撃！ ${d}ダメージ` + (eMult > 1 ? " (弱点!)" : ""));
    
    if (state.hero.hp <= 0) {
        logMessage("敗北...", "danger"); state.floor = 1; state.hero.hp = getHeroTotalStats().maxHp;
        currentEnemy = null; canProceed = false; isActing = false;
        updateAllUI(); saveGame(); startBattle();
    } else { isActing = false; updateBattleControls(); }
}

function onEnemyDefeated() {
    logMessage(`${currentEnemy.name} 撃破！`, "system");
    
    // Track Achievements
    const baseName = currentEnemy.name.replace("[BOSS] ", "").replace("[レア] ", "");
    state.achievements.kills[baseName] = (state.achievements.kills[baseName] || 0) + 1;
    state.achievements.totalKills++;
    
    let expM = 1 + (state.kamuiUpgrades.expBonus * 0.2);
    let goldM = 1 + (state.kamuiUpgrades.goldBonus * 0.2);
    if (state.currentTitleId === 'collector') goldM += 0.2;

    let expG = Math.floor(10 * Math.pow(1.03, state.floor) * expM);
    let goldG = Math.floor(5 * Math.pow(1.03, state.floor) * goldM);
    if (currentEnemy.isBoss) { expG *= 3; goldG *= 3; }
    if (currentEnemy.isRare) { expG *= 10; goldG *= 10; }

    state.hero.exp += expG; state.hero.classExp[state.hero.classId] += expG;
    state.gold += goldG; checkLevelUp();
    
    let dropChance = 0.3 * (1 + state.kamuiUpgrades.dropRateBonus * 0.25);
    if (Math.random() < dropChance || currentEnemy.isBoss || currentEnemy.isRare) generateLoot(state.floor);
    
    canProceed = true; isActing = false; updateAllUI(); saveGame();
}

function checkLevelUp() {
    while (state.hero.exp >= state.hero.nextExp) {
        state.hero.level++; state.hero.exp -= state.hero.nextExp; state.hero.nextExp = Math.floor(state.hero.nextExp * 1.5);
        state.hero.baseAtk += 2; state.hero.baseDef += 1; state.hero.maxHp += 10;
        logMessage(`総合レベルUP！ Lv.${state.hero.level}`, "system");
    }
    const cid = state.hero.classId;
    let nCE = 20 * Math.pow(1.3, state.hero.classLevels[cid] - 1);
    while (state.hero.classExp[cid] >= nCE) {
        state.hero.classExp[cid] -= nCE; state.hero.classLevels[cid]++;
        logMessage(`${CLASSES[cid].name}レベルUP！ Lv.${state.hero.classLevels[cid]}`, "system");
        nCE = 20 * Math.pow(1.3, state.hero.classLevels[cid] - 1);
    }
}

// --- Battle Loop ---

function startBattle() {
    if (canProceed) return;
    if (!currentEnemy) {
        currentEnemy = generateEnemy(state.floor);
        const n = document.getElementById("enemy-name"); if(n) n.innerText = currentEnemy.name;
        const s = document.getElementById("enemy-sprite"); if(s) s.src = "assets/" + currentEnemy.image;
        updateEnemyHP(); logMessage(`${currentEnemy.name} (階層.${state.floor}) 出現！`, currentEnemy.isRare ? "loot" : "system");
    }
    if (!battleInterval) battleInterval = setInterval(battleTick, 1000);
}

function battleTick() {
    for (let id in skillCooldowns) { if (skillCooldowns[id] > 0) skillCooldowns[id]--; }
    if (state.isAutoMode && canProceed) { nextFloor(); return; }
    if (canProceed) { updateBattleControls(); return; }
    if (state.isAutoMode && !isActing) {
        executeAttack();
        const cid = state.hero.classId;
        const usable = CLASSES[cid].skills.find(s => s.unlockLvl <= state.hero.classLevels[cid] && (skillCooldowns[s.id] || 0) === 0);
        if (usable) useSkill(usable);
        if (currentEnemy && currentEnemy.hp > 0) setTimeout(enemyTurn, 500);
    } else { updateBattleControls(); }
}

function nextFloor() {
    state.floor++; currentEnemy = null; canProceed = false; isActing = false;
    updateHeroHP(Math.floor(getHeroTotalStats().maxHp * 0.1));
    if (state.floor % 5 === 0) refreshTavern();
    updateAllUI(); startBattle();
}

// --- Utils ---

function generateEnemy(floor) {
    const isRare = Math.random() < 0.05;
    const t = isRare ? { name: "メタルこんぶ", hpMult: 0.1, atkMult: 0.1, defMult: 5.0, element: 'none', image: "slime.png" } : ENEMY_TYPES[randomInt(0, ENEMY_TYPES.length - 1)];
    const boss = floor % 10 === 0 && !isRare;
    const m = Math.pow(1.03, floor - 1) * (boss ? 5 : 1) * (isRare ? 2 : 1);
    const hp = Math.floor(30 * t.hpMult * m);
    return { name: (boss ? "[BOSS] " : (isRare ? "[レア] " : "")) + t.name, maxHp: hp, hp, atk: Math.floor(8 * t.atkMult * m), def: Math.floor(3 * t.defMult * m), isBoss: boss, isRare, element: t.element, image: t.image };
}

function generateLoot(floor) {
    if (state.inventory.length >= state.maxInventory) return;
    const type = ['weapon', 'armor', 'accessory'][randomInt(0, 2)];
    let rar = getRandomRarity();
    const fl = Math.max(1, floor + randomInt(-2, 2));
    let baseVal = 10 * Math.pow(1.03, fl) * rar.statMult;
    const varMult = 0.9 + (Math.random() * 0.2);
    let finalVal = Math.floor(baseVal * varMult);
    
    const prefixes = ["粗悪な", "普通の", "鋭い", "重い", "魔法の", "名工の", "伝説の", "神話の", "虚無の"];
    const p = prefixes[randomInt(0, prefixes.length - 1)];
    const names = { weapon: "の剣", armor: "の鎧", accessory: "の指輪" };
    
    // Random Element
    const elemKeys = Object.keys(ELEMENTS);
    const elem = elemKeys[randomInt(0, elemKeys.length - 1)];

    let i = { id: Date.now() + randomInt(0,999), type, rarity: rar, lvl: fl, prefix: p, element: elem, name: `[Lv.${fl}] ${p}${names[type]}` };
    if (type === 'weapon') i.atk = finalVal;
    else if (type === 'armor') i.def = finalVal;
    else { if (Math.random() > 0.5) { i.atk = Math.floor(finalVal*0.4); i.def = Math.floor(finalVal*0.4); } else i.hp = finalVal*5; }
    
    i.value = Math.floor(finalVal * rar.statMult * 0.5);
    state.inventory.push(i); logMessage(`${i.name} 獲得！`, "loot"); updateInventoryUI();
}

function getRandomRarity() {
    const r = Math.random() * 100;
    if (r < 60) return RARITIES[0]; if (r < 85) return RARITIES[1]; if (r < 95) return RARITIES[2]; if (r < 99) return RARITIES[3]; return RARITIES[4];
}

function refreshTavern() {
    availableMercs = []; const fl = Math.max(1, Math.floor(state.floor / 5));
    for (let i=0; i<3; i++) {
        const n = ["アーサー", "ランスロット", "ジャンヌ", "ジークフリート", "ロビン", "マーリン"][randomInt(0, 5)];
        const l = Math.max(1, fl + randomInt(-2, 2));
        availableMercs.push({ id: Date.now()+i, name: n, level: l, atk: Math.floor(10 * Math.pow(1.03, l)), price: Math.floor(100*Math.pow(1.5, l)) });
    }
}

// --- UI ---

function updateAllUI() {
    updateHeaderUI(); updateStatusUI(); updateEquipmentUI(); updateInventoryUI(); updatePartyUI(); updateKamuiUI(); updateBattleControls(); updateEnemyHP();
    // Update Hero Sprite
    const heroSprite = document.getElementById("hero-sprite");
    if (heroSprite) heroSprite.src = "assets/" + (CLASSES[state.hero.classId]?.image || "hero.png");
}

function updateBattleControls() {
    const autoBtn = document.getElementById("btn-toggle-auto");
    const manualCtrl = document.getElementById("manual-controls");
    const proceedCtrl = document.getElementById("proceed-controls");
    if (!autoBtn || !manualCtrl || !proceedCtrl) return;
    autoBtn.innerText = state.isAutoMode ? "AUTO: ON" : "AUTO: OFF";
    state.isAutoMode ? autoBtn.classList.add("active") : autoBtn.classList.remove("active");
    if (canProceed) { manualCtrl.classList.add("hidden"); proceedCtrl.classList.remove("hidden"); }
    else { proceedCtrl.classList.add("hidden"); if (!state.isAutoMode) { manualCtrl.classList.remove("hidden"); const a=document.getElementById("btn-attack"); if(a) a.disabled=isActing; const s=document.getElementById("btn-open-skills"); if(s) s.disabled=isActing; } else manualCtrl.classList.add("hidden"); }
}

function updateStatusUI() {
    const stats = getHeroTotalStats(); const cid = state.hero.classId; const c = CLASSES[cid] || CLASSES.novice;
    const lvlEl = document.getElementById("hero-level");
    const title = TITLES.find(t => t.id === state.currentTitleId)?.name || "なし";
    if (lvlEl) lvlEl.innerHTML = `総合Lv.${state.hero.level} / ${c.name}Lv.${state.hero.classLevels[cid]}<br><small>称号: ${title}</small>`;
    document.getElementById("hero-hp").innerText = Math.floor(state.hero.hp);
    document.getElementById("hero-max-hp").innerText = stats.maxHp;
    document.getElementById("hero-atk").innerText = stats.atk;
    document.getElementById("hero-def").innerText = stats.def;
    
    // Update Title Select
    const tList = document.getElementById("title-list");
    if (tList) {
        tList.innerHTML = "";
        TITLES.forEach(t => {
            const unlocked = Object.keys(t.req).every(k => (state.achievements.kills[k] || 0) >= t.req[k]) || (t.id === 'collector' && state.achievements.totalKills >= t.req['total_loot']);
            const div = document.createElement("div");
            div.className = `title-item ${unlocked ? 'unlocked' : 'locked'}`;
            div.innerHTML = `<div><strong>${t.name}</strong><br><small>${t.desc}</small></div>`;
            if (unlocked) {
                const btn = document.createElement("button"); btn.className = "btn-sm";
                btn.innerText = state.currentTitleId === t.id ? "装備中" : "装備";
                btn.onclick = () => { state.currentTitleId = t.id; updateAllUI(); saveGame(); };
                div.appendChild(btn);
            }
            tList.appendChild(div);
        });
    }
}

function openSkillModal() {
    const list = document.getElementById("skill-list"); if (!list) return; list.innerHTML = "";
    const cid = state.hero.classId;
    CLASSES[cid].skills.forEach(s => {
        const btn = document.createElement("button"); btn.className = "skill-btn";
        const locked = s.unlockLvl > state.hero.classLevels[cid];
        const cd = skillCooldowns[s.id] || 0;
        btn.disabled = locked || cd > 0 || isActing;
        btn.innerHTML = `<strong>${s.name}</strong> ${locked ? `(Lv.${s.unlockLvl}解放)` : (cd > 0 ? `(${cd}s)` : "")}<span class="skill-info">${s.desc}</span>`;
        if (!btn.disabled) btn.onclick = () => { if (isActing) return; useSkill(s); };
        list.appendChild(btn);
    });
    const mod = document.getElementById("skill-modal"); if (mod) mod.classList.remove("hidden");
}
function closeSkillModal() { const mod = document.getElementById("skill-modal"); if (mod) mod.classList.add("hidden"); }

function updateHeaderUI() { document.getElementById("current-floor").innerText = state.floor; document.getElementById("gold-amount").innerText = state.gold; document.getElementById("kamui-amount").innerText = state.kamui; }
function updateEquipmentUI() { for (let type of ['weapon', 'armor', 'accessory']) { const el = document.getElementById(`equip-${type}`); if(!el) continue; const s = el.querySelector('.slot-item'); const i = state.equipment[type]; if (i) { s.innerText = `${i.name} (${ELEMENTS[i.element]?.name || ""})`; s.className = `slot-item ${i.rarity.colorClass}`; } else { s.innerText = "なし"; s.className = "slot-item"; } } }
function updateInventoryUI() { const list = document.getElementById("inventory-list"); if(!list) return; list.innerHTML = ""; document.getElementById("inv-count").innerText = state.inventory.length; state.inventory.forEach((i, idx) => { const d = document.createElement("div"); d.className = "inv-item"; d.innerHTML = `<div class="item-name ${i.rarity.colorClass}">${i.name}</div>`; d.onclick = () => openItemModal(idx); list.appendChild(d); }); }
function updatePartyUI() {
    const plist = document.getElementById("party-list"); if(!plist) return; plist.innerHTML = state.party.length === 0 ? "<p class='item-stats'>なし</p>" : "";
    state.party.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} Lv.${m.level}</div><button class="btn-sm" onclick="window.dismissMercenary(${i})">解雇</button>`; plist.appendChild(d); });
    const tlist = document.getElementById("tavern-list"); if(tlist) { tlist.innerHTML = availableMercs.length === 0 ? "<p class='item-stats'>なし</p>" : ""; availableMercs.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} (${m.price}G)</div><button class="btn-sm" onclick="window.hireMercenary(${i})">雇用</button>`; tlist.appendChild(d); }); }
}
function updateKamuiUI() {
    const ulist = document.getElementById("kamui-upgrades"); if(!ulist) return; ulist.innerHTML = `
        <div class="upgrade-item"><div>経験値+20% (Lv.${state.kamuiUpgrades.expBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('expBonus')">強化</button></div>
        <div class="upgrade-item"><div>G+20% (Lv.${state.kamuiUpgrades.goldBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('goldBonus')">強化</button></div>
        <div class="upgrade-item"><div>ドロップ+25% (Lv.${state.kamuiUpgrades.dropRateBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('dropRateBonus')">強化</button></div>
        <div class="upgrade-item"><div>ステ+10% (Lv.${state.kamuiUpgrades.statsBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('statsBonus')">強化</button></div>
    `;
}

function openItemModal(i) {
    selectedItemIndex = i; const item = state.inventory[i];
    const mod = document.getElementById("item-modal"); if (mod) mod.classList.remove("hidden");
    const name = document.getElementById("modal-item-name"); if (name) { name.innerText = item.name; name.className = item.rarity.colorClass; }
    
    const current = state.equipment[item.type];
    const st = document.getElementById("modal-item-stats");
    let sT = `Lv.${item.lvl} / 属性: ${ELEMENTS[item.element]?.name || "無"}<br>`;
    if (item.atk) sT += `ATK: ${item.atk} `; if (item.def) sT += `DEF: ${item.def} `; if (item.hp) sT += `HP: ${item.hp} `;
    if (st) st.innerHTML = sT;

    const compEl = document.getElementById("modal-item-compare");
    if (compEl) {
        if (!current) compEl.innerHTML = "<div class='compare-up'>新規装備</div>";
        else {
            let ds = []; ['atk', 'def', 'hp'].forEach(k => {
                let d = (item[k]||0)-(current[k]||0); if(d!==0) ds.push(`${k.toUpperCase()}: <span class="${d>0?'compare-up':'compare-down'}">${d>0?'+':''}${d}</span>`);
            });
            compEl.innerHTML = ds.length>0 ? `比較:<br>${ds.join("<br>")}` : "性能差なし";
        }
    }
    
    // Refining
    const refineBtn = document.getElementById("btn-refine-item");
    if (refineBtn) {
        const cost = Math.floor(100 * Math.pow(1.2, item.lvl));
        refineBtn.innerText = `強化する (${cost}G)`;
        refineBtn.onclick = () => {
            if (state.gold >= cost) {
                state.gold -= cost; item.lvl++;
                if (item.atk) item.atk = Math.floor(item.atk * 1.1);
                if (item.def) item.def = Math.floor(item.def * 1.1);
                if (item.hp) item.hp = Math.floor(item.hp * 1.1);
                item.name = item.name.replace(/\[Lv\.\d+\]/, `[Lv.${item.lvl}]`);
                saveGame(); openItemModal(selectedItemIndex); updateAllUI();
            } else alert("ゴールドが足りません！");
        };
    }
}

function hireMercenary(i) { if (state.party.length >= 3) return; const m = availableMercs[i]; if (state.gold >= m.price) { state.gold -= m.price; state.party.push({...m}); availableMercs.splice(i, 1); updateAllUI(); saveGame(); } }
function dismissMercenary(i) { if (confirm("解雇しますか?")) { state.party.splice(i, 1); updatePartyUI(); saveGame(); } }
function buyKamuiUpgrade(t) { const c = t === 'statsBonus' ? 3 : (t === 'dropRateBonus' ? 2 : 1); if (state.kamui >= c) { state.kamui -= c; state.kamuiUpgrades[t]++; updateAllUI(); saveGame(); } }
function doPrestige() {
    const g = Math.floor(state.floor / 5); if (g < 2) { alert("10階以上進む必要があります！"); return; }
    if (confirm(`${g} 神威を得て転生しますか？`)) {
        state.kamui += g; state.floor = 1; state.hero.level = 1; state.hero.exp = 0; state.hero.nextExp = 10;
        state.hero.baseAtk = 10; state.hero.baseDef = 5; state.hero.maxHp = 100; state.party = [];
        state.hero.hp = getHeroTotalStats().maxHp; currentEnemy = null; canProceed = false; isActing = false;
        updateAllUI(); saveGame(); startBattle();
    }
}
function useSkill(skill) {
    if ((skillCooldowns[skill.id] || 0) > 0 || !currentEnemy || canProceed || isActing) return;
    executeAttack(skill.mult, true);
    const stats = getHeroTotalStats();
    if (skill.heal) { let h = Math.floor(stats.maxHp * skill.heal); updateHeroHP(h); logMessage(`HP回復 ${h}`, "heal"); }
    if (skill.recoil) { let r = Math.floor(stats.maxHp * skill.recoil); updateHeroHP(-r); logMessage(`反動 ${r}`, "damage"); }
    if (skill.gold) { let g = 10 + state.floor; state.gold += g; logMessage(`${g} G入手！`, "loot"); updateHeaderUI(); }
    skillCooldowns[skill.id] = skill.cd; closeSkillModal();
}

// Events
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.onclick = () => { document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active")); document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active")); b.classList.add("active"); const t=document.getElementById(b.dataset.target); if(t) t.classList.add("active"); });
    const autoBtn=document.getElementById("btn-toggle-auto"); if(autoBtn) autoBtn.onclick = () => { state.isAutoMode = !state.isAutoMode; updateBattleControls(); saveGame(); };
    const atkBtn=document.getElementById("btn-attack"); if(atkBtn) atkBtn.onclick = () => executeAttack();
    const skBtn=document.getElementById("btn-open-skills"); if(skBtn) skBtn.onclick = () => openSkillModal();
    const clSk=document.getElementById("btn-close-skill-modal"); if(clSk) clSk.onclick = () => closeSkillModal();
    const nxtF=document.getElementById("btn-next-floor"); if(nxtF) nxtF.onclick = nextFloor;
    const rtr=document.getElementById("btn-retreat"); if(rtr) rtr.onclick = () => { state.floor = 1; currentEnemy = null; canProceed = false; isActing = false; state.hero.hp = getHeroTotalStats().maxHp; updateAllUI(); saveGame(); startBattle(); };
    const sellA=document.getElementById("btn-sell-all"); if(sellA) sellA.onclick = () => { let g = 0; let n = []; state.inventory.forEach(i => { if (i.rarity.name === 'コモン' || i.rarity.name === 'アンコモン') g += i.value; else n.push(i); }); if (g > 0) { state.inventory = n; state.gold += g; updateAllUI(); saveGame(); } };
    const clM=document.getElementById("btn-close-modal"); if(clM) clM.onclick = () => { const m=document.getElementById("item-modal"); if(m) m.classList.add("hidden"); };
    const eqI=document.getElementById("btn-equip-item"); if(eqI) eqI.onclick = () => { const i = state.inventory[selectedItemIndex]; if (state.equipment[i.type]) state.inventory.push(state.equipment[i.type]); state.equipment[i.type] = i; state.inventory.splice(selectedItemIndex, 1); const m=document.getElementById("item-modal"); if(m) m.classList.add("hidden"); updateAllUI(); saveGame(); };
    const slI=document.getElementById("btn-sell-item"); if(slI) slI.onclick = () => { state.gold += state.inventory[selectedItemIndex].value; state.inventory.splice(selectedItemIndex, 1); const m=document.getElementById("item-modal"); if(m) m.classList.add("hidden"); updateAllUI(); saveGame(); };
    const cSel=document.getElementById("hero-class-select"); if(cSel) cSel.onchange = (e) => { state.hero.classId = e.target.value; updateAllUI(); saveGame(); };
    const prst=document.getElementById("btn-prestige"); if(prst) prst.onclick = doPrestige;
    loadGame(); startBattle();
});

window.hireMercenary = hireMercenary; window.dismissMercenary = dismissMercenary; window.buyKamuiUpgrade = buyKamuiUpgrade;
