// --- Game State & Data ---
const GAME_VERSION = "0.2";
const SAVE_KEY = "konbuRpgSaveData_v2"; // Changed key to avoid conflict with old format

// Default Initial State
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
    party: [], // Hired mercs
    maxParty: 3,
    kamuiUpgrades: {
        expBonus: 0,
        goldBonus: 0,
        dropRateBonus: 0,
        statsBonus: 0
    }
});

let state = getInitialState();

// Runtime variables
let isBattling = true;
let battleInterval = null;
let currentEnemy = null;
let selectedItemIndex = null;
let availableMercs = []; // Mercs currently in the tavern

// --- Data Definitions ---

const CLASSES = {
    novice: { name: "見習い", hpMult: 1.0, atkMult: 1.0, defMult: 1.0, desc: "初期職。特徴なし。" },
    warrior: { name: "戦士", hpMult: 1.2, atkMult: 1.2, defMult: 1.0, desc: "HPと攻撃力が高い。" },
    knight: { name: "騎士", hpMult: 1.5, atkMult: 0.8, defMult: 1.5, desc: "HPと防御力が高い。" },
    berserker: { name: "狂戦士", hpMult: 0.8, atkMult: 1.8, defMult: 0.5, desc: "攻撃特化。" },
    thief: { name: "盗賊", hpMult: 1.0, atkMult: 1.1, defMult: 0.8, desc: "ドロップ率が少し高いかも？（未実装）" }
};

const ITEM_TYPES = ['weapon', 'armor', 'accessory'];
const RARITIES = [
    { name: 'コモン', colorClass: 'rarity-common', weight: 60, statMult: 1 },
    { name: 'アンコモン', colorClass: 'rarity-uncommon', weight: 25, statMult: 1.5 },
    { name: 'レア', colorClass: 'rarity-rare', weight: 10, statMult: 2.5 },
    { name: 'エピック', colorClass: 'rarity-epic', weight: 4, statMult: 4 },
    { name: 'レジェンダリー', colorClass: 'rarity-legendary', weight: 1, statMult: 8 }
];

const ENEMY_TYPES = [
    { name: "スライム", hpMult: 0.8, atkMult: 0.8, defMult: 0.5 },
    { name: "ゴブリン", hpMult: 1.0, atkMult: 1.0, defMult: 0.8 },
    { name: "ウルフ", hpMult: 0.9, atkMult: 1.2, defMult: 0.6 },
    { name: "スケルトン", hpMult: 0.8, atkMult: 1.5, defMult: 0.5 },
    { name: "オーク", hpMult: 1.5, atkMult: 1.2, defMult: 1.0 },
    { name: "ガーゴイル", hpMult: 1.5, atkMult: 1.0, defMult: 2.0 },
    { name: "ドラゴン", hpMult: 3.0, atkMult: 2.5, defMult: 2.0 }
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
    for (let r of RARITIES) {
        if (rand <= r.weight) return r;
        rand -= r.weight;
    }
    return RARITIES[0];
}

// --- Save / Load ---
function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

function loadGame() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Merge with initial state to add missing fields from updates
            state = { ...getInitialState(), ...parsed };
            logMessage("データをロードしました。", "system");
        } catch (e) {
            console.error("Save file corrupted");
            state = getInitialState();
        }
    } else {
        logMessage("新しいゲームを開始します。", "system");
    }
    refreshTavern();
    updateAllUI();
}

// --- Core Logic ---

function getHeroTotalStats() {
    const cls = CLASSES[state.hero.classId] || CLASSES.novice;
    const kamuiMult = 1 + (state.kamuiUpgrades.statsBonus * 0.1); // 10% per upgrade

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
    const floorMultiplier = Math.pow(1.1, floor - 1); // Exponential scaling
    const bossMultiplier = isBoss ? 4 : 1;

    let hp = Math.floor(20 * template.hpMult * floorMultiplier * bossMultiplier);
    let atk = Math.floor(5 * template.atkMult * floorMultiplier * bossMultiplier);
    let def = Math.floor(2 * template.defMult * floorMultiplier * bossMultiplier);

    const name = isBoss ? `[ボス] 巨大${template.name}` : template.name;
    return { name, maxHp: hp, hp: hp, atk, def, isBoss };
}

function generateLoot(floor) {
    if (state.inventory.length >= state.maxInventory) {
        logMessage("インベントリがいっぱいでアイテムを拾えなかった！", "danger");
        return;
    }

    const type = ITEM_TYPES[randomInt(0, ITEM_TYPES.length - 1)];
    let rarity = getRandomRarity();
    
    // Kamui bonus to rarity weight logic could go here, for simplicity just bump stats
    const prefix = PREFIXES[randomInt(0, PREFIXES.length - 1)];
    const itemLevel = floor + randomInt(-2, 2);
    const effectiveLvl = Math.max(1, itemLevel);
    
    let baseStat = Math.floor(10 * Math.pow(1.05, effectiveLvl) * rarity.statMult);
    let name = "";
    let item = { id: Date.now() + randomInt(0,999), type, rarity, lvl: effectiveLvl };

    if (type === 'weapon') {
        name = prefix + WEAPON_NAMES[randomInt(0, WEAPON_NAMES.length - 1)];
        item.atk = baseStat;
    } else if (type === 'armor') {
        name = prefix + ARMOR_NAMES[randomInt(0, ARMOR_NAMES.length - 1)];
        item.def = baseStat;
    } else {
        name = prefix + ACC_NAMES[randomInt(0, ACC_NAMES.length - 1)];
        // Accessories give both or HP
        if (Math.random() > 0.5) { item.atk = Math.floor(baseStat*0.5); item.def = Math.floor(baseStat*0.5); }
        else { item.hp = baseStat * 5; }
    }

    item.name = `[Lv.${effectiveLvl}] ${name}`;
    item.value = Math.floor(baseStat * rarity.statMult);

    state.inventory.push(item);
    logMessage(`${item.name} をドロップした！`, "loot");
    updateInventoryUI();
}

function checkLevelUp() {
    let leveledUp = false;
    while (state.hero.exp >= state.hero.nextExp) {
        state.hero.level++;
        state.hero.exp -= state.hero.nextExp;
        state.hero.nextExp = Math.floor(state.hero.nextExp * 1.5);
        state.hero.baseAtk += 2;
        state.hero.baseDef += 1;
        state.hero.maxHp += 10;
        leveledUp = true;
    }
    if (leveledUp) {
        const stats = getHeroTotalStats();
        state.hero.hp = stats.maxHp;
        logMessage(`レベルアップ！ Lv.${state.hero.level}になった！`, "system");
        updateStatusUI();
    }
}

function updateHeroHP(amount) {
    state.hero.hp += amount;
    const stats = getHeroTotalStats();
    if (state.hero.hp > stats.maxHp) state.hero.hp = stats.maxHp;
    if (state.hero.hp < 0) state.hero.hp = 0;
    
    const pct = (state.hero.hp / stats.maxHp) * 100;
    document.getElementById("hero-hp-bar").style.width = `${pct}%`;
    document.getElementById("hero-hp").innerText = state.hero.hp;
}

function updateEnemyHP() {
    if (!currentEnemy) return;
    const pct = (currentEnemy.hp / currentEnemy.maxHp) * 100;
    document.getElementById("enemy-hp-bar").style.width = `${pct}%`;
}

// --- Tavern & Mercenaries ---
function refreshTavern() {
    availableMercs = [];
    const floorLvl = Math.max(1, Math.floor(state.floor / 5));
    for (let i=0; i<3; i++) {
        const name = MERCENARY_NAMES[randomInt(0, MERCENARY_NAMES.length-1)];
        const lvl = Math.max(1, floorLvl + randomInt(-2, 2));
        const price = 100 * Math.pow(1.5, lvl);
        availableMercs.push({
            id: Date.now() + i,
            name: `${name}`,
            level: lvl,
            atk: 5 + (lvl * 3),
            price: Math.floor(price)
        });
    }
    updatePartyUI();
}

function hireMercenary(index) {
    if (state.party.length >= state.maxParty) {
        alert("パーティーが満員です。"); return;
    }
    const merc = availableMercs[index];
    if (state.gold >= merc.price) {
        state.gold -= merc.price;
        state.party.push({ ...merc });
        availableMercs.splice(index, 1);
        logMessage(`${merc.name} を雇用した！`, "system");
        updateHeaderUI();
        updatePartyUI();
        saveGame();
    } else {
        alert("ゴールドが足りません。");
    }
}

function dismissMercenary(index) {
    const merc = state.party[index];
    if (confirm(`${merc.name} を解雇しますか？`)) {
        state.party.splice(index, 1);
        logMessage(`${merc.name} を解雇した。`, "system");
        updatePartyUI();
        saveGame();
    }
}

// --- Kamui (Prestige) ---
function calcKamuiGain() {
    if (state.floor < 10) return 0;
    return Math.floor(state.floor / 5);
}

function doPrestige() {
    const gain = calcKamuiGain();
    if (gain <= 0) {
        alert("転生するには10階以上に到達する必要があります。"); return;
    }
    if (confirm(`現在の進行度をリセットし、神威の欠片を ${gain} 個獲得しますか？\n(装備、ゴールド、神威強化は引き継がれます)`)) {
        state.kamui += gain;
        // Reset progress
        state.floor = 1;
        state.hero.level = 1;
        state.hero.exp = 0;
        state.hero.nextExp = 10;
        state.hero.baseAtk = 10;
        state.hero.baseDef = 5;
        state.hero.maxHp = 100;
        state.party = []; // Mercs leave
        
        const stats = getHeroTotalStats();
        state.hero.hp = stats.maxHp;
        
        currentEnemy = null;
        logMessage(`転生し、神威の欠片を ${gain} 個獲得しました！`, "system");
        updateAllUI();
        saveGame();
        
        if(isBattling) { stopBattle(); startBattle(); }
    }
}

function buyKamuiUpgrade(type) {
    const costs = { expBonus: 1, goldBonus: 1, dropRateBonus: 2, statsBonus: 3 };
    const cost = costs[type];
    if (state.kamui >= cost) {
        state.kamui -= cost;
        state.kamuiUpgrades[type]++;
        updateHeaderUI();
        updateKamuiUI();
        updateStatusUI(); // For stats bonus
        saveGame();
    } else {
        alert("神威の欠片が足りません。");
    }
}

// --- Battle Loop ---
function startBattle() {
    if (!currentEnemy) {
        currentEnemy = generateEnemy(state.floor);
        document.getElementById("enemy-name").innerText = currentEnemy.name;
        document.getElementById("enemy-hp-bar").style.width = "100%";
        logMessage(`${currentEnemy.name} が現れた！`, "system");
    }
    if (!battleInterval) battleInterval = setInterval(battleTick, 1000);
    const btn = document.getElementById("btn-toggle-battle");
    btn.innerText = "自動戦闘中";
    btn.classList.add("active");
    isBattling = true;
}

function stopBattle() {
    if (battleInterval) { clearInterval(battleInterval); battleInterval = null; }
    const btn = document.getElementById("btn-toggle-battle");
    btn.innerText = "戦闘停止中";
    btn.classList.remove("active");
    isBattling = false;
}

function battleTick() {
    if (!currentEnemy) return;
    const stats = getHeroTotalStats();

    // Hero attacks
    let heroDmg = Math.max(1, stats.atk - currentEnemy.def + randomInt(-2, 2));
    currentEnemy.hp -= heroDmg;
    logMessage(`勇者の攻撃！ ${currentEnemy.name}に ${heroDmg} のダメージ！`);

    // Mercs attack
    state.party.forEach(merc => {
        if (currentEnemy.hp <= 0) return;
        let mercDmg = Math.max(1, merc.atk - (currentEnemy.def * 0.5) + randomInt(-1, 1));
        currentEnemy.hp -= mercDmg;
        logMessage(`${merc.name}の攻撃！ ${mercDmg} のダメージ！`, "merc");
    });

    updateEnemyHP();

    if (currentEnemy.hp <= 0) {
        logMessage(`${currentEnemy.name} を倒した！`, "system");
        
        let expMulti = 1 + (state.kamuiUpgrades.expBonus * 0.2); // 20% per upgrade
        let goldMulti = 1 + (state.kamuiUpgrades.goldBonus * 0.2);

        let expGained = Math.floor(10 * Math.pow(1.1, state.floor) * expMulti);
        let goldGained = Math.floor(5 * Math.pow(1.1, state.floor) * goldMulti);
        
        if (currentEnemy.isBoss) { expGained *= 3; goldGained *= 3; }

        state.hero.exp += expGained;
        state.gold += goldGained;
        
        logMessage(`${expGained} EXP と ${goldGained} G を獲得！`);
        
        let baseDrop = 0.3;
        let dropMulti = 1 + (state.kamuiUpgrades.dropRateBonus * 0.25);
        if (Math.random() < (baseDrop * dropMulti) || currentEnemy.isBoss) {
            generateLoot(state.floor);
        }

        checkLevelUp();
        state.floor++;
        currentEnemy = null;
        updateHeroHP(Math.floor(stats.maxHp * 0.1)); // heal 10%
        
        if(state.floor % 5 === 0) refreshTavern(); // refresh shop occasionally
        
        updateStatusUI();
        updateHeaderUI();
        updateKamuiUI(); // update gain preview
        saveGame();
        return;
    }

    // Enemy attacks
    setTimeout(() => {
        if (!isBattling || !currentEnemy) return;
        let enemyDmg = Math.max(1, currentEnemy.atk - stats.def + randomInt(-1, 1));
        updateHeroHP(-enemyDmg);
        logMessage(`${currentEnemy.name}の攻撃！ 勇者は ${enemyDmg} のダメージを受けた！`, "damage");

        if (state.hero.hp <= 0) {
            logMessage("勇者は倒れてしまった... 1階に戻されます。", "danger");
            state.floor = 1;
            const s = getHeroTotalStats();
            state.hero.hp = s.maxHp;
            currentEnemy = null;
            updateStatusUI();
            updateHeaderUI();
            updateKamuiUI();
            saveGame();
        }
    }, 500);
}

// --- UI Updaters ---
function updateAllUI() {
    updateHeaderUI();
    
    // Class Select options
    const sel = document.getElementById("hero-class-select");
    sel.innerHTML = "";
    for (let key in CLASSES) {
        let opt = document.createElement("option");
        opt.value = key; opt.innerText = CLASSES[key].name;
        if(state.hero.classId === key) opt.selected = true;
        sel.appendChild(opt);
    }
    
    updateStatusUI();
    updateEquipmentUI();
    updateInventoryUI();
    updatePartyUI();
    updateKamuiUI();
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
    for (let type of ITEM_TYPES) {
        const el = document.getElementById(`equip-${type}`).querySelector('.slot-item');
        const item = state.equipment[type];
        if (item) {
            el.innerText = item.name;
            el.className = `slot-item ${item.rarity.colorClass}`;
        } else {
            el.innerText = "なし";
            el.className = "slot-item";
        }
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
        div.innerHTML = `
            <div class="item-name ${item.rarity.colorClass}">${item.name}</div>
            <div class="item-stats">${statText.join(" ")}</div>
        `;
        div.onclick = () => openItemModal(index);
        list.appendChild(div);
    });
}

function updatePartyUI() {
    document.getElementById("party-count").innerText = state.party.length;
    
    // Hired List
    const plist = document.getElementById("party-list");
    plist.innerHTML = state.party.length === 0 ? "<p class='item-stats'>現在傭兵はいません。</p>" : "";
    state.party.forEach((m, i) => {
        const div = document.createElement("div");
        div.className = "merc-item";
        div.innerHTML = `<div class="merc-info"><div class="merc-name">${m.name} Lv.${m.level}</div><div class="merc-stats">ATK: ${m.atk}</div></div><button class="btn-sm" onclick="dismissMercenary(${i})">解雇</button>`;
        plist.appendChild(div);
    });

    // Tavern List
    const tlist = document.getElementById("tavern-list");
    tlist.innerHTML = availableMercs.length === 0 ? "<p class='item-stats'>現在酒場に傭兵はいません。</p>" : "";
    availableMercs.forEach((m, i) => {
        const div = document.createElement("div");
        div.className = "merc-item";
        div.innerHTML = `<div class="merc-info"><div class="merc-name">${m.name} Lv.${m.level}</div><div class="merc-stats">ATK: ${m.atk} | ${m.price}G</div></div><button class="btn-sm" onclick="hireMercenary(${i})">雇用</button>`;
        tlist.appendChild(div);
    });
    
    // Visual party in battle panel
    document.getElementById("party-visual-list").innerText = state.party.length > 0 ? `同行: ${state.party.map(m=>m.name).join(", ")}` : "";
}

function updateKamuiUI() {
    document.getElementById("kamui-gain-amount").innerText = calcKamuiGain();
    
    const ulist = document.getElementById("kamui-upgrades");
    ulist.innerHTML = `
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">経験値アップ (Lv.${state.kamuiUpgrades.expBonus})</div><div class="merc-stats">取得EXP +20% | コスト: 1</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('expBonus')">強化</button></div>
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">ゴールドアップ (Lv.${state.kamuiUpgrades.goldBonus})</div><div class="merc-stats">取得G +20% | コスト: 1</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('goldBonus')">強化</button></div>
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">ドロップ率アップ (Lv.${state.kamuiUpgrades.dropRateBonus})</div><div class="merc-stats">ドロップ率 +25% | コスト: 2</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('dropRateBonus')">強化</button></div>
        <div class="upgrade-item"><div class="merc-info"><div class="merc-name">基礎ステータス (Lv.${state.kamuiUpgrades.statsBonus})</div><div class="merc-stats">全ステータス +10% | コスト: 3</div></div><button class="btn-sm" onclick="buyKamuiUpgrade('statsBonus')">強化</button></div>
    `;
}

function logMessage(msg, type = "normal") {
    const logContainer = document.getElementById("battle-log");
    const div = document.createElement("div");
    div.className = `log-entry ${type}`;
    div.innerText = msg;
    logContainer.appendChild(div);
    if (logContainer.children.length > 30) logContainer.removeChild(logContainer.firstChild);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// --- Interactions ---
function toggleBattle() {
    if (isBattling) stopBattle(); else startBattle();
}
function retreat() {
    state.floor = 1; currentEnemy = null; logMessage("1階に撤退しました。", "system");
    state.hero.hp = getHeroTotalStats().maxHp;
    updateStatusUI(); updateHeaderUI();
    if (isBattling) { stopBattle(); startBattle(); }
    saveGame();
}
function sellLowRarity() {
    let goldGained = 0; let newInv = [];
    state.inventory.forEach(item => {
        if (item.rarity.name === 'コモン' || item.rarity.name === 'アンコモン') goldGained += item.value;
        else newInv.push(item);
    });
    if (goldGained > 0) {
        state.inventory = newInv; state.gold += goldGained;
        logMessage(`低レア装備を一括売却し、${goldGained} G を得た。`, "system");
        updateHeaderUI(); updateInventoryUI(); saveGame();
    }
}
function openItemModal(index) {
    selectedItemIndex = index; const item = state.inventory[index];
    document.getElementById("item-modal").classList.remove("hidden");
    document.getElementById("modal-item-name").innerText = item.name;
    document.getElementById("modal-item-name").className = item.rarity.colorClass;
    let stats = [];
    if (item.atk) stats.push(`ATK: +${item.atk}`);
    if (item.def) stats.push(`DEF: +${item.def}`);
    if (item.hp) stats.push(`HP: +${item.hp}`);
    stats.push(`売却: ${item.value} G`);
    document.getElementById("modal-item-stats").innerHTML = stats.join('<br>');
}
function closeItemModal() { document.getElementById("item-modal").classList.add("hidden"); selectedItemIndex = null; }
function equipSelectedItem() {
    if (selectedItemIndex === null) return;
    const item = state.inventory[selectedItemIndex];
    if (state.equipment[item.type]) state.inventory.push(state.equipment[item.type]);
    state.equipment[item.type] = item;
    state.inventory.splice(selectedItemIndex, 1);
    logMessage(`${item.name} を装備した。`, "system");
    closeItemModal(); updateEquipmentUI(); updateInventoryUI(); saveGame();
}
function sellSelectedItem() {
    if (selectedItemIndex === null) return;
    const item = state.inventory[selectedItemIndex];
    state.gold += item.value;
    state.inventory.splice(selectedItemIndex, 1);
    closeItemModal(); updateHeaderUI(); updateInventoryUI(); saveGame();
}

// Tab Logic
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.target).classList.add("active");
    });
});

// Event Listeners
document.getElementById("btn-toggle-battle").addEventListener("click", toggleBattle);
document.getElementById("btn-retreat").addEventListener("click", retreat);
document.getElementById("btn-sell-all").addEventListener("click", sellLowRarity);
document.getElementById("btn-close-modal").addEventListener("click", closeItemModal);
document.getElementById("btn-equip-item").addEventListener("click", equipSelectedItem);
document.getElementById("btn-sell-item").addEventListener("click", sellSelectedItem);
document.getElementById("btn-prestige").addEventListener("click", doPrestige);
document.getElementById("hero-class-select").addEventListener("change", (e) => {
    state.hero.classId = e.target.value;
    updateStatusUI(); saveGame();
});

// Globals for inline HTML onclicks
window.hireMercenary = hireMercenary;
window.dismissMercenary = dismissMercenary;
window.buyKamuiUpgrade = buyKamuiUpgrade;

// Start
setInterval(saveGame, 10000);
loadGame();
startBattle();
