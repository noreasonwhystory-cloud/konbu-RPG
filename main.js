// --- Game State & Data ---
const GAME_VERSION = "0.3";
const SAVE_KEY = "konbuRpgSaveData_v3";

const getInitialState = () => ({
    floor: 1,
    gold: 0,
    kamui: 0,
    hero: {
        classId: 'novice',
        level: 1,
        exp: 0,
        nextExp: 10,
        hp: 100,
        maxHp: 100,
        baseAtk: 10,
        baseDef: 5,
    },
    equipment: {
        weapon: null,
        armor: null,
        accessory: null
    },
    inventory: [],
    maxInventory: 50,
    party: [],
    maxParty: 3,
    kamuiUpgrades: {
        expBonus: 0,
        goldBonus: 0,
        dropRateBonus: 0,
        statsBonus: 0
    },
    isAutoMode: true // New
});

let state = getInitialState();

// Runtime variables
let battleInterval = null;
let currentEnemy = null;
let selectedItemIndex = null;
let availableMercs = [];
let skillCooldown = 0; // seconds remaining
let canProceed = false;

// --- Data Definitions ---

const CLASSES = {
    novice: { name: "見習い", hpMult: 1.0, atkMult: 1.0, defMult: 1.0, skillName: "バッシュ", skillDesc: "1.5倍のダメージ" },
    warrior: { name: "戦士", hpMult: 1.2, atkMult: 1.2, defMult: 1.0, skillName: "強撃", skillDesc: "2.5倍のダメージ" },
    knight: { name: "騎士", hpMult: 1.5, atkMult: 0.8, defMult: 1.5, skillName: "ホーリーライト", skillDesc: "攻撃しつつHPを10%回復" },
    berserker: { name: "狂戦士", hpMult: 0.8, atkMult: 1.8, defMult: 0.5, skillName: "ブラッドラスト", skillDesc: "4倍ダメージ（反動10%）" },
    thief: { name: "盗賊", hpMult: 1.0, atkMult: 1.1, defMult: 0.8, skillName: "ぶんどる", skillDesc: "攻撃+ゴールド獲得" }
};

const ENEMY_TYPES = [
    { name: "スライム", hpMult: 0.8, atkMult: 0.8, defMult: 0.5, image: "slime.png" },
    { name: "ゴブリン", hpMult: 1.0, atkMult: 1.0, defMult: 0.8, image: "goblin.png" },
    { name: "ウルフ", hpMult: 0.9, atkMult: 1.2, defMult: 0.6, image: "wolf.png" },
    { name: "スケルトン", hpMult: 0.8, atkMult: 1.5, defMult: 0.5, image: "skeleton.png" },
    { name: "オーク", hpMult: 1.5, atkMult: 1.2, defMult: 1.0, image: "orc.png" },
    { name: "ガーゴイル", hpMult: 1.5, atkMult: 1.0, defMult: 2.0, image: "gargoyle.png" },
    { name: "ドラゴン", hpMult: 3.0, atkMult: 2.5, defMult: 2.0, image: "dragon.png" }
];

const WEAPON_NAMES = ["の剣", "の斧", "の短剣", "の槍", "の杖", "の弓"];
const ARMOR_NAMES = ["の服", "の革鎧", "の鎖帷子", "のプレート", "のローブ"];
const ACC_NAMES = ["の指輪", "の首飾り", "の腕輪", "のお守り"];
const PREFIXES = ["粗悪な", "普通の", "鋭い", "重い", "魔法の", "名工の", "伝説の", "神がかりの"];
const MERCENARY_NAMES = ["アーサー", "ランスロット", "ジャンヌ", "ジークフリート", "ロビン", "マーリン"];

// --- Utilities ---
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getRandomRarity() {
    const totalWeight = RARITIES.reduce((sum, r) => sum + r.weight, 0);
    let rand = randomInt(1, totalWeight);
    for (let r of RARITIES) { if (rand <= r.weight) return r; rand -= r.weight; }
    return RARITIES[0];
}

// --- Save / Load ---
function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
function loadGame() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...getInitialState(), ...parsed };
        } catch (e) { state = getInitialState(); }
    }
    refreshTavern();
    updateAllUI();
}

// --- Core Logic ---

function getHeroTotalStats() {
    const cls = CLASSES[state.hero.classId] || CLASSES.novice;
    const kamuiMult = 1 + (state.kamuiUpgrades.statsBonus * 0.1);
    let atk = state.hero.baseAtk * cls.atkMult * kamuiMult;
    let def = state.hero.baseDef * cls.defMult * kamuiMult;
    let maxHp = state.hero.maxHp * cls.hpMult * kamuiMult;
    for (const key in state.equipment) {
        const item = state.equipment[key];
        if (item) {
            if (item.atk) atk += item.atk;
            if (item.def) def += item.def;
            if (item.hp) maxHp += item.hp;
        }
    }
    return { atk: Math.floor(atk), def: Math.floor(def), maxHp: Math.floor(maxHp) };
}

function generateEnemy(floor) {
    const template = ENEMY_TYPES[randomInt(0, ENEMY_TYPES.length - 1)];
    const isBoss = floor % 10 === 0;
    const floorMultiplier = Math.pow(1.1, floor - 1);
    const bossMultiplier = isBoss ? 4 : 1;
    let hp = Math.floor(20 * template.hpMult * floorMultiplier * bossMultiplier);
    let atk = Math.floor(5 * template.atkMult * floorMultiplier * bossMultiplier);
    let def = Math.floor(2 * template.defMult * floorMultiplier * bossMultiplier);
    const name = isBoss ? `[ボス] 巨大${template.name}` : template.name;
    return { name, maxHp: hp, hp: hp, atk, def, isBoss, image: template.image };
}

function generateLoot(floor) {
    if (state.inventory.length >= state.maxInventory) { logMessage("インベントリがいっぱいです！", "danger"); return; }
    const type = ITEM_TYPES[randomInt(0, ITEM_TYPES.length - 1)];
    let rarity = getRandomRarity();
    const prefix = PREFIXES[randomInt(0, PREFIXES.length - 1)];
    const effectiveLvl = Math.max(1, floor + randomInt(-2, 2));
    let baseStat = Math.floor(10 * Math.pow(1.05, effectiveLvl) * rarity.statMult);
    let item = { id: Date.now() + randomInt(0,999), type, rarity, lvl: effectiveLvl };
    if (type === 'weapon') { item.name = prefix + WEAPON_NAMES[randomInt(0, WEAPON_NAMES.length - 1)]; item.atk = baseStat; }
    else if (type === 'armor') { item.name = prefix + ARMOR_NAMES[randomInt(0, ARMOR_NAMES.length - 1)]; item.def = baseStat; }
    else { item.name = prefix + ACC_NAMES[randomInt(0, ACC_NAMES.length - 1)]; if (Math.random() > 0.5) { item.atk = Math.floor(baseStat*0.5); item.def = Math.floor(baseStat*0.5); } else { item.hp = baseStat * 5; } }
    item.name = `[Lv.${effectiveLvl}] ${item.name}`;
    item.value = Math.floor(baseStat * rarity.statMult);
    state.inventory.push(item);
    logMessage(`${item.name} を入手した！`, "loot");
    updateInventoryUI();
}

function checkLevelUp() {
    let leveledUp = false;
    while (state.hero.exp >= state.hero.nextExp) {
        state.hero.level++;
        state.hero.exp -= state.hero.nextExp;
        state.hero.nextExp = Math.floor(state.hero.nextExp * 1.5);
        state.hero.baseAtk += 2; state.hero.baseDef += 1; state.hero.maxHp += 10;
        leveledUp = true;
    }
    if (leveledUp) {
        state.hero.hp = getHeroTotalStats().maxHp;
        logMessage(`レベルアップ！ Lv.${state.hero.level}`, "system");
        updateStatusUI();
    }
}

function updateHeroHP(amount) {
    state.hero.hp += amount;
    const stats = getHeroTotalStats();
    if (state.hero.hp > stats.maxHp) state.hero.hp = stats.maxHp;
    if (state.hero.hp < 0) state.hero.hp = 0;
    document.getElementById("hero-hp-bar").style.width = `${(state.hero.hp / stats.maxHp) * 100}%`;
    document.getElementById("hero-hp").innerText = state.hero.hp;
}

function updateEnemyHP() {
    if (!currentEnemy) return;
    document.getElementById("enemy-hp-bar").style.width = `${(currentEnemy.hp / currentEnemy.maxHp) * 100}%`;
}

// --- Battle Actions ---

function heroAttack(multiplier = 1) {
    if (!currentEnemy || canProceed) return;
    const stats = getHeroTotalStats();
    let dmg = Math.max(1, Math.floor((stats.atk - currentEnemy.def) * multiplier) + randomInt(-2, 2));
    currentEnemy.hp -= dmg;
    
    // Animation
    const heroEl = document.querySelector(".hero");
    heroEl.classList.remove("attack-anim-hero");
    void heroEl.offsetWidth;
    heroEl.classList.add("attack-anim-hero");

    logMessage(`${multiplier > 1 ? '必殺！' : ''}勇者の攻撃！ ${currentEnemy.name}に ${dmg} のダメージ！`);
    updateEnemyHP();

    if (currentEnemy.hp <= 0) {
        onEnemyDefeated();
    }
}

function heroSkill() {
    if (skillCooldown > 0 || !currentEnemy || canProceed) return;
    const cls = state.hero.classId;
    const stats = getHeroTotalStats();
    
    if (cls === 'novice') heroAttack(1.5);
    else if (cls === 'warrior') heroAttack(2.5);
    else if (cls === 'knight') {
        heroAttack(1.2);
        updateHeroHP(Math.floor(stats.maxHp * 0.1));
        logMessage("聖なる光でHPが回復！", "heal");
    } else if (cls === 'berserker') {
        heroAttack(4.0);
        updateHeroHP(-Math.floor(stats.maxHp * 0.1));
        logMessage("狂気により体力を消耗！", "damage");
    } else if (cls === 'thief') {
        heroAttack(1.2);
        let bonus = 10 + state.floor;
        state.gold += bonus;
        logMessage(`${bonus} Gを盗み出した！`, "loot");
        updateHeaderUI();
    }
    
    skillCooldown = 5; // 5 seconds cooldown
    updateBattleControls();
}

function onEnemyDefeated() {
    logMessage(`${currentEnemy.name} を倒した！`, "system");
    let expMulti = 1 + (state.kamuiUpgrades.expBonus * 0.2);
    let goldMulti = 1 + (state.kamuiUpgrades.goldBonus * 0.2);
    let expGained = Math.floor(10 * Math.pow(1.1, state.floor) * expMulti);
    let goldGained = Math.floor(5 * Math.pow(1.1, state.floor) * goldMulti);
    if (currentEnemy.isBoss) { expGained *= 3; goldGained *= 3; }
    state.hero.exp += expGained;
    state.gold += goldGained;
    logMessage(`${expGained} EXP / ${goldGained} G 獲得`);
    if (Math.random() < (0.3 * (1 + state.kamuiUpgrades.dropRateBonus * 0.25)) || currentEnemy.isBoss) generateLoot(state.floor);
    checkLevelUp();
    updateHeaderUI();
    
    canProceed = true;
    updateBattleControls();
    saveGame();
}

function proceedToNext() {
    if (!canProceed) return;
    state.floor++;
    currentEnemy = null;
    canProceed = false;
    updateHeroHP(Math.floor(getHeroTotalStats().maxHp * 0.1));
    if (state.floor % 5 === 0) refreshTavern();
    updateHeaderUI();
    updateBattleControls();
    startBattle();
}

// --- Battle Loop ---
function startBattle() {
    if (canProceed) return;
    if (!currentEnemy) {
        currentEnemy = generateEnemy(state.floor);
        document.getElementById("enemy-name").innerText = currentEnemy.name;
        document.getElementById("enemy-hp-bar").style.width = "100%";
        document.getElementById("enemy-sprite").src = "assets/" + currentEnemy.image;
        logMessage(`${currentEnemy.name} が現れた！`, "system");
    }
    if (!battleInterval) battleInterval = setInterval(battleTick, 1000);
}

function battleTick() {
    if (!currentEnemy || canProceed) return;

    // Cooldown management
    if (skillCooldown > 0) {
        skillCooldown--;
        updateBattleControls();
    }

    // Auto actions
    if (state.isAutoMode) {
        heroAttack();
        if (skillCooldown === 0) heroSkill();
    }

    if (!currentEnemy || currentEnemy.hp <= 0) return;

    // Mercs always auto attack
    state.party.forEach(merc => {
        if (!currentEnemy || currentEnemy.hp <= 0) return;
        let d = Math.max(1, merc.atk - (currentEnemy.def * 0.5) + randomInt(-1, 1));
        currentEnemy.hp -= d;
        logMessage(`${merc.name}の攻撃！ ${d}ダメ`, "merc");
    });
    updateEnemyHP();

    if (!currentEnemy || currentEnemy.hp <= 0) return;

    // Enemy attacks
    setTimeout(() => {
        if (!currentEnemy || currentEnemy.hp <= 0 || canProceed) return;
        const stats = getHeroTotalStats();
        let d = Math.max(1, currentEnemy.atk - stats.def + randomInt(-1, 1));
        updateHeroHP(-d);
        const enemyEl = document.querySelector(".enemy");
        enemyEl.classList.remove("attack-anim-enemy");
        void enemyEl.offsetWidth;
        enemyEl.classList.add("attack-anim-enemy");
        logMessage(`${currentEnemy.name}の攻撃！ ${d}ダメージを受けた！`, "damage");

        if (state.hero.hp <= 0) {
            logMessage("敗北... 1階に戻ります。", "danger");
            state.floor = 1;
            state.hero.hp = getHeroTotalStats().maxHp;
            currentEnemy = null;
            canProceed = false;
            updateAllUI();
            saveGame();
        }
    }, 500);
}

// --- UI Updaters ---
function updateAllUI() {
    updateHeaderUI();
    const sel = document.getElementById("hero-class-select");
    sel.innerHTML = "";
    for (let key in CLASSES) {
        let opt = document.createElement("option"); opt.value = key; opt.innerText = CLASSES[key].name;
        if(state.hero.classId === key) opt.selected = true;
        sel.appendChild(opt);
    }
    updateStatusUI(); updateEquipmentUI(); updateInventoryUI(); updatePartyUI(); updateKamuiUI();
    updateBattleControls();
}

function updateBattleControls() {
    const autoBtn = document.getElementById("btn-toggle-auto");
    const manualCtrl = document.getElementById("manual-controls");
    const proceedCtrl = document.getElementById("proceed-controls");
    const skillBtn = document.getElementById("btn-skill");
    
    autoBtn.innerText = state.isAutoMode ? "AUTO: ON" : "AUTO: OFF";
    if (state.isAutoMode) autoBtn.classList.add("active"); else autoBtn.classList.remove("active");

    if (canProceed) {
        manualCtrl.classList.add("hidden");
        proceedCtrl.classList.remove("hidden");
    } else {
        proceedCtrl.classList.add("hidden");
        if (!state.isAutoMode) manualCtrl.classList.remove("hidden");
        else manualCtrl.classList.add("hidden");
    }

    const cls = CLASSES[state.hero.classId];
    skillBtn.innerText = skillCooldown > 0 ? `${cls.skillName} (${skillCooldown})` : cls.skillName;
    skillBtn.disabled = skillCooldown > 0;
}

function updateHeaderUI() {
    document.getElementById("current-floor").innerText = state.floor;
    document.getElementById("gold-amount").innerText = state.gold;
    document.getElementById("kamui-amount").innerText = state.kamui;
}
function updateStatusUI() {
    const stats = getHeroTotalStats();
    document.getElementById("hero-level").innerText = state.hero.level;
    document.getElementById("hero-exp").innerText = state.hero.exp;
    document.getElementById("hero-next-exp").innerText = state.hero.nextExp;
    document.getElementById("hero-hp").innerText = state.hero.hp;
    document.getElementById("hero-max-hp").innerText = stats.maxHp;
    document.getElementById("hero-atk").innerText = stats.atk;
    document.getElementById("hero-def").innerText = stats.def;
    updateHeroHP(0);
}
function updateEquipmentUI() {
    for (let type of ['weapon', 'armor', 'accessory']) {
        const el = document.getElementById(`equip-${type}`).querySelector('.slot-item');
        const item = state.equipment[type];
        if (item) { el.innerText = item.name; el.className = `slot-item ${item.rarity.colorClass}`; }
        else { el.innerText = "なし"; el.className = "slot-item"; }
    }
    updateStatusUI();
}
function updateInventoryUI() {
    const list = document.getElementById("inventory-list");
    list.innerHTML = "";
    document.getElementById("inv-count").innerText = state.inventory.length;
    state.inventory.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "inv-item";
        let statText = [];
        if(item.atk) statText.push(`ATK+${item.atk}`);
        if(item.def) statText.push(`DEF+${item.def}`);
        if(item.hp) statText.push(`HP+${item.hp}`);
        div.innerHTML = `<div class="item-name ${item.rarity.colorClass}">${item.name}</div><div class="item-stats">${statText.join(" ")}</div>`;
        div.onclick = () => openItemModal(index);
        list.appendChild(div);
    });
}
function updatePartyUI() {
    document.getElementById("party-count").innerText = state.party.length;
    const plist = document.getElementById("party-list");
    plist.innerHTML = state.party.length === 0 ? "<p class='item-stats'>傭兵なし</p>" : "";
    state.party.forEach((m, i) => {
        const div = document.createElement("div"); div.className = "merc-item";
        div.innerHTML = `<div class="merc-info"><div class="merc-name">${m.name} Lv.${m.level}</div></div><button class="btn-sm" onclick="dismissMercenary(${i})">解雇</button>`;
        plist.appendChild(div);
    });
    const tlist = document.getElementById("tavern-list");
    tlist.innerHTML = availableMercs.length === 0 ? "<p class='item-stats'>酒場に誰もいない</p>" : "";
    availableMercs.forEach((m, i) => {
        const div = document.createElement("div"); div.className = "merc-item";
        div.innerHTML = `<div class="merc-info"><div class="merc-name">${m.name} Lv.${m.level}</div><div class="merc-stats">${m.price}G</div></div><button class="btn-sm" onclick="hireMercenary(${i})">雇用</button>`;
        tlist.appendChild(div);
    });
    document.getElementById("party-visual-list").innerText = state.party.length > 0 ? `同行: ${state.party.map(m=>m.name).join(", ")}` : "";
}
function updateKamuiUI() {
    document.getElementById("kamui-gain-amount").innerText = Math.floor(state.floor / 5);
    const ulist = document.getElementById("kamui-upgrades");
    ulist.innerHTML = `
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">経験値+20% (Lv.${state.kamuiUpgrades.expBonus})</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('expBonus')">強化</button></div>
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">ゴールド+20% (Lv.${state.kamuiUpgrades.goldBonus})</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('goldBonus')">強化</button></div>
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">ドロップ+25% (Lv.${state.kamuiUpgrades.dropRateBonus})</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('dropRateBonus')">強化</button></div>
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">ステータス+10% (Lv.${state.kamuiUpgrades.statsBonus})</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('statsBonus')">強化</button></div>
    `;
}
function logMessage(msg, type = "normal") {
    const log = document.getElementById("battle-log");
    const div = document.createElement("div"); div.className = `log-entry ${type}`; div.innerText = msg;
    log.appendChild(div);
    if (log.children.length > 30) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
}

// --- Interactions ---
function refreshTavern() {
    availableMercs = [];
    const floorLvl = Math.max(1, Math.floor(state.floor / 5));
    for (let i=0; i<3; i++) {
        const name = MERCENARY_NAMES[randomInt(0, MERCENARY_NAMES.length-1)];
        const lvl = Math.max(1, floorLvl + randomInt(-2, 2));
        availableMercs.push({ id: Date.now()+i, name, level: lvl, atk: 5+(lvl*3), price: Math.floor(100*Math.pow(1.5, lvl)) });
    }
}
function hireMercenary(index) {
    if (state.party.length >= state.maxParty) return;
    const m = availableMercs[index];
    if (state.gold >= m.price) { state.gold -= m.price; state.party.push({...m}); availableMercs.splice(index, 1); updateAllUI(); saveGame(); }
}
function dismissMercenary(index) { if (confirm("解雇しますか？")) { state.party.splice(index, 1); updatePartyUI(); saveGame(); } }
function buyKamuiUpgrade(type) {
    const cost = type === 'statsBonus' ? 3 : (type === 'dropRateBonus' ? 2 : 1);
    if (state.kamui >= cost) { state.kamui -= cost; state.kamuiUpgrades[type]++; updateAllUI(); saveGame(); }
}
function doPrestige() {
    const gain = Math.floor(state.floor / 5);
    if (gain < 2) { alert("もっと進んでから転生しましょう(10F以上)"); return; }
    if (confirm(`転生して ${gain} 神威 を得ますか？`)) {
        state.kamui += gain; state.floor = 1; state.hero.level = 1; state.hero.exp = 0; state.hero.nextExp = 10;
        state.hero.baseAtk = 10; state.hero.baseDef = 5; state.hero.maxHp = 100; state.party = [];
        state.hero.hp = getHeroTotalStats().maxHp; currentEnemy = null; canProceed = false;
        updateAllUI(); saveGame(); startBattle();
    }
}

// Tab Switching
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active"); document.getElementById(btn.dataset.target).classList.add("active");
    });
});

// Event Listeners
document.getElementById("btn-toggle-auto").addEventListener("click", () => {
    state.isAutoMode = !state.isAutoMode;
    updateBattleControls();
    saveGame();
});
document.getElementById("btn-attack").addEventListener("click", () => heroAttack());
document.getElementById("btn-skill").addEventListener("click", () => heroSkill());
document.getElementById("btn-next-floor").addEventListener("click", proceedToNext);
document.getElementById("btn-retreat").addEventListener("click", () => {
    state.floor = 1; currentEnemy = null; canProceed = false;
    state.hero.hp = getHeroTotalStats().maxHp; updateAllUI(); saveGame(); startBattle();
});
document.getElementById("btn-sell-all").addEventListener("click", () => {
    let g = 0; let n = [];
    state.inventory.forEach(item => { if (item.rarity.name === 'コモン' || item.rarity.name === 'アンコモン') g += item.value; else n.push(item); });
    if (g > 0) { state.inventory = n; state.gold += g; updateAllUI(); saveGame(); }
});
document.getElementById("btn-close-modal").addEventListener("click", () => document.getElementById("item-modal").classList.add("hidden"));
document.getElementById("btn-equip-item").addEventListener("click", () => {
    const item = state.inventory[selectedItemIndex];
    if (state.equipment[item.type]) state.inventory.push(state.equipment[item.type]);
    state.equipment[item.type] = item; state.inventory.splice(selectedItemIndex, 1);
    document.getElementById("item-modal").classList.add("hidden"); updateAllUI(); saveGame();
});
document.getElementById("btn-sell-item").addEventListener("click", () => {
    state.gold += state.inventory[selectedItemIndex].value; state.inventory.splice(selectedItemIndex, 1);
    document.getElementById("item-modal").classList.add("hidden"); updateAllUI(); saveGame();
});
document.getElementById("hero-class-select").addEventListener("change", (e) => { state.hero.classId = e.target.value; updateStatusUI(); saveGame(); });

function openItemModal(index) {
    selectedItemIndex = index; const item = state.inventory[index];
    const m = document.getElementById("item-modal");
    m.classList.remove("hidden");
    document.getElementById("modal-item-name").innerText = item.name;
    document.getElementById("modal-item-name").className = item.rarity.colorClass;
    document.getElementById("modal-item-stats").innerHTML = `売却: ${item.value} G`;
}

// Globals
window.hireMercenary = hireMercenary; window.dismissMercenary = dismissMercenary; window.buyKamuiUpgrade = buyKamuiUpgrade;

// Start
setInterval(saveGame, 10000);
loadGame();
startBattle();
