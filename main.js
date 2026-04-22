// --- Game State & Data ---
const GAME_VERSION = "0.6";
const SAVE_KEY = "konbuRpgSaveData_v6";

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
        classLevels: { novice: 1, warrior: 1, knight: 1, berserker: 1, thief: 1 },
        classExp: { novice: 0, warrior: 0, knight: 0, berserker: 0, thief: 0 }
    },
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [],
    maxInventory: 50,
    party: [],
    kamuiUpgrades: { expBonus: 0, goldBonus: 0, dropRateBonus: 0, statsBonus: 0 },
    isAutoMode: false 
});

let state = getInitialState();

// Runtime variables
let battleInterval = null;
let currentEnemy = null;
let selectedItemIndex = null;
let availableMercs = [];
let canProceed = false;
let skillCooldowns = {};

// --- Data Definitions ---

const CLASSES = {
    novice: { name: "見習い", hpPerLvl: 5, atkPerLvl: 1, defPerLvl: 0.5, skills: [ { id: 'bash', name: 'バッシュ', unlockLvl: 1, mult: 1.5, cd: 3, desc: '1.5倍ダメージ' }, { id: 'focus', name: '精神集中', unlockLvl: 5, mult: 2.2, cd: 5, desc: '2.2倍ダメージ' } ] },
    warrior: { name: "戦士", hpPerLvl: 8, atkPerLvl: 2, defPerLvl: 1, skills: [ { id: 'power', name: '強撃', unlockLvl: 1, mult: 2.5, cd: 4, desc: '2.5倍ダメージ' }, { id: 'whirlwind', name: '旋風斬', unlockLvl: 10, mult: 4.0, cd: 8, desc: '4.0倍ダメージ' } ] },
    knight: { name: "騎士", hpPerLvl: 12, atkPerLvl: 1, defPerLvl: 2, skills: [ { id: 'holy', name: 'ホーリーライト', unlockLvl: 1, mult: 1.2, heal: 0.1, cd: 5, desc: '攻撃＋HP10%回復' }, { id: 'shield', name: 'シールドバッシュ', unlockLvl: 5, mult: 1.8, stun: true, cd: 6, desc: '1.8倍ダメ＋敵遅延' } ] },
    berserker: { name: "狂戦士", hpPerLvl: 6, atkPerLvl: 3, defPerLvl: 0.2, skills: [ { id: 'blood', name: 'ブラッドラスト', unlockLvl: 1, mult: 4.0, recoil: 0.1, cd: 5, desc: '4倍ダメ（反動10%）' }, { id: 'exec', name: '処刑', unlockLvl: 10, mult: 6.0, recoil: 0.2, cd: 10, desc: '6倍ダメ（反動20%）' } ] },
    thief: { name: "盗賊", hpPerLvl: 5, atkPerLvl: 1.5, defPerLvl: 0.5, skills: [ { id: 'steal', name: 'ぶんどる', unlockLvl: 1, mult: 1.2, gold: true, cd: 4, desc: '攻撃＋ゴールド' }, { id: 'triple', name: '三連斬', unlockLvl: 5, mult: 3.5, cd: 7, desc: '3.5倍ダメージ' } ] }
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

const RARITIES = [
    { name: 'コモン', colorClass: 'rarity-common', weight: 60, statMult: 1 },
    { name: 'アンコモン', colorClass: 'rarity-uncommon', weight: 25, statMult: 1.5 },
    { name: 'レア', colorClass: 'rarity-rare', weight: 10, statMult: 2.5 },
    { name: 'エピック', colorClass: 'rarity-epic', weight: 4, statMult: 4 },
    { name: 'レジェンダリー', colorClass: 'rarity-legendary', weight: 1, statMult: 8 }
];

// --- Initialization ---

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

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getRandomRarity() {
    const totalWeight = RARITIES.reduce((sum, r) => sum + r.weight, 0);
    let rand = randomInt(1, totalWeight);
    for (let r of RARITIES) { if (rand <= r.weight) return r; rand -= r.weight; }
    return RARITIES[0];
}

// --- Stats ---

function getHeroTotalStats() {
    const kamuiMult = 1 + (state.kamuiUpgrades.statsBonus * 0.1);
    let atk = state.hero.baseAtk * kamuiMult;
    let def = state.hero.baseDef * kamuiMult;
    let maxHp = state.hero.maxHp * kamuiMult;

    for (let cid in state.hero.classLevels) {
        const lvl = state.hero.classLevels[cid];
        const data = CLASSES[cid];
        atk += (lvl - 1) * data.atkPerLvl;
        def += (lvl - 1) * data.defPerLvl;
        maxHp += (lvl - 1) * data.hpPerLvl;
    }

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

function updateHeroHP(amount) {
    state.hero.hp += amount;
    const stats = getHeroTotalStats();
    if (state.hero.hp > stats.maxHp) state.hero.hp = stats.maxHp;
    if (state.hero.hp < 0) state.hero.hp = 0;
    document.getElementById("hero-hp-bar").style.width = `${(state.hero.hp / stats.maxHp) * 100}%`;
    document.getElementById("hero-hp").innerText = Math.floor(state.hero.hp);
}

function updateEnemyHP() {
    if (!currentEnemy) return;
    const percent = Math.max(0, (currentEnemy.hp / currentEnemy.maxHp) * 100);
    document.getElementById("enemy-hp-bar").style.width = `${percent}%`;
    document.getElementById("enemy-hp").innerText = Math.floor(Math.max(0, currentEnemy.hp));
    document.getElementById("enemy-max-hp").innerText = currentEnemy.maxHp;
}

// --- Actions ---

function executeAttack(multiplier = 1, isSkill = false) {
    if (!currentEnemy || canProceed) return;
    const stats = getHeroTotalStats();
    let dmg = Math.max(1, Math.floor((stats.atk - currentEnemy.def) * multiplier) + randomInt(-2, 2));
    currentEnemy.hp -= dmg;
    
    // UI Feedback
    const heroEl = document.querySelector(".hero");
    heroEl.classList.remove("attack-anim-hero");
    void heroEl.offsetWidth;
    heroEl.classList.add("attack-anim-hero");

    logMessage(`${isSkill ? '特技！' : ''}勇者の攻撃！ ${dmg} ダメージ！`);
    updateEnemyHP();

    if (currentEnemy.hp <= 0) {
        onEnemyDefeated();
    } else if (!state.isAutoMode) {
        // Manual mode counterattack
        setTimeout(enemyTurn, 600);
    }
}

function useSkill(skill) {
    if ((skillCooldowns[skill.id] || 0) > 0 || !currentEnemy || canProceed) return;
    
    executeAttack(skill.mult, true);
    const stats = getHeroTotalStats();
    
    if (skill.heal) {
        const h = Math.floor(stats.maxHp * skill.heal);
        updateHeroHP(h);
        logMessage(`HPを ${h} 回復！`, "heal");
    }
    if (skill.recoil) {
        const r = Math.floor(stats.maxHp * skill.recoil);
        updateHeroHP(-r);
        logMessage(`反動で ${r} ダメージ！`, "damage");
    }
    if (skill.gold) {
        const g = 10 + state.floor;
        state.gold += g;
        logMessage(`${g} Gを入手！`, "loot");
        updateHeaderUI();
    }
    
    skillCooldowns[skill.id] = skill.cd;
    closeSkillModal();
    updateBattleControls();
}

function enemyTurn() {
    if (!currentEnemy || currentEnemy.hp <= 0 || canProceed) return;
    const stats = getHeroTotalStats();
    let d = Math.max(1, currentEnemy.atk - stats.def + randomInt(-1, 1));
    updateHeroHP(-d);
    
    const enemyEl = document.querySelector(".enemy");
    enemyEl.classList.remove("attack-anim-enemy");
    void enemyEl.offsetWidth;
    enemyEl.classList.add("attack-anim-enemy");
    
    logMessage(`${currentEnemy.name}の攻撃！ ${d} ダメージ！`, "damage");

    if (state.hero.hp <= 0) {
        logMessage("全滅した... 1階に戻ります。", "danger");
        state.floor = 1; state.hero.hp = getHeroTotalStats().maxHp;
        currentEnemy = null; canProceed = false;
        updateAllUI(); saveGame(); startBattle();
    }
}

function onEnemyDefeated() {
    logMessage(`${currentEnemy.name} を討伐！`, "system");
    let expMulti = 1 + (state.kamuiUpgrades.expBonus * 0.2);
    let goldMulti = 1 + (state.kamuiUpgrades.goldBonus * 0.2);
    let expGained = Math.floor(10 * Math.pow(1.1, state.floor) * expMulti);
    let goldGained = Math.floor(5 * Math.pow(1.1, state.floor) * goldMulti);
    if (currentEnemy.isBoss) { expGained *= 3; goldGained *= 3; }
    
    addExp(expGained);
    state.gold += goldGained;
    if (Math.random() < (0.3 * (1 + state.kamuiUpgrades.dropRateBonus * 0.25)) || currentEnemy.isBoss) generateLoot(state.floor);
    
    updateHeaderUI();
    canProceed = true;
    updateBattleControls();
    saveGame();
}

function addExp(amount) {
    state.hero.exp += amount;
    state.hero.classExp[state.hero.classId] += amount;
    
    while (state.hero.exp >= state.hero.nextExp) {
        state.hero.level++;
        state.hero.exp -= state.hero.nextExp;
        state.hero.nextExp = Math.floor(state.hero.nextExp * 1.5);
        state.hero.baseAtk += 2; state.hero.baseDef += 1; state.hero.maxHp += 10;
        logMessage(`レベルアップ！ Lv.${state.hero.level}`, "system");
    }
    
    const cid = state.hero.classId;
    let nextClassExp = 20 * Math.pow(1.5, state.hero.classLevels[cid] - 1);
    while (state.hero.classExp[cid] >= nextClassExp) {
        state.hero.classExp[cid] -= nextClassExp;
        state.hero.classLevels[cid]++;
        logMessage(`${CLASSES[cid].name}LvUP！ Lv.${state.hero.classLevels[cid]}`, "system");
        nextClassExp = 20 * Math.pow(1.5, state.hero.classLevels[cid] - 1);
    }
    updateStatusUI();
}

// --- Battle Loop ---

function startBattle() {
    if (canProceed) return;
    if (!currentEnemy) {
        currentEnemy = generateEnemy(state.floor);
        document.getElementById("enemy-name").innerText = currentEnemy.name;
        document.getElementById("enemy-sprite").src = "assets/" + currentEnemy.image;
        updateEnemyHP();
        logMessage(`${currentEnemy.name} が現れた！`, "system");
    }
    if (!battleInterval) battleInterval = setInterval(battleTick, 1000);
}

function battleTick() {
    for (let id in skillCooldowns) { if (skillCooldowns[id] > 0) skillCooldowns[id]--; }
    
    if (!currentEnemy || canProceed) {
        updateBattleControls();
        return;
    }

    if (state.isAutoMode) {
        executeAttack();
        const skills = CLASSES[state.hero.classId].skills;
        const curLvl = state.hero.classLevels[state.hero.classId];
        const usable = skills.find(s => s.unlockLvl <= curLvl && (skillCooldowns[s.id] || 0) === 0);
        if (usable) useSkill(usable);
        
        state.party.forEach(m => {
            if (!currentEnemy || currentEnemy.hp <= 0) return;
            let d = Math.max(1, m.atk - (currentEnemy.def*0.5) + randomInt(-1,1));
            currentEnemy.hp -= d;
        });
        updateEnemyHP();
        if (currentEnemy && currentEnemy.hp > 0) setTimeout(enemyTurn, 500);
    } else {
        updateBattleControls();
    }
}

// --- Utils ---

function generateEnemy(floor) {
    const template = ENEMY_TYPES[randomInt(0, ENEMY_TYPES.length - 1)];
    const isBoss = floor % 10 === 0;
    const multi = Math.pow(1.1, floor - 1);
    const bossMulti = isBoss ? 4 : 1;
    const hp = Math.floor(20 * template.hpMult * multi * bossMulti);
    return { name: isBoss ? `[ボス] 巨大${template.name}` : template.name, maxHp: hp, hp: hp, atk: Math.floor(5 * template.atkMult * multi * bossMulti), def: Math.floor(2 * template.defMult * multi * bossMulti), isBoss, image: template.image };
}

function generateLoot(floor) {
    if (state.inventory.length >= state.maxInventory) return;
    const type = ['weapon', 'armor', 'accessory'][randomInt(0, 2)];
    let rarity = getRandomRarity();
    const fl = Math.max(1, floor + randomInt(-2, 2));
    let stat = Math.floor(10 * Math.pow(1.05, fl) * rarity.statMult);
    let item = { id: Date.now() + randomInt(0,999), type, rarity, lvl: fl };
    if (type === 'weapon') { item.name = "の剣"; item.atk = stat; }
    else if (type === 'armor') { item.name = "の鎧"; item.def = stat; }
    else { item.name = "の指輪"; if (Math.random() > 0.5) { item.atk = Math.floor(stat*0.4); item.def = Math.floor(stat*0.4); } else { item.hp = stat * 5; } }
    item.name = `[Lv.${fl}] ${item.name}`;
    item.value = Math.floor(stat * rarity.statMult);
    state.inventory.push(item);
    logMessage(`${item.name} を獲得！`, "loot");
    updateInventoryUI();
}

function refreshTavern() {
    availableMercs = [];
    const fl = Math.max(1, Math.floor(state.floor / 5));
    for (let i=0; i<3; i++) {
        const n = ["アーサー", "ランスロット", "ジャンヌ", "ジークフリート", "ロビン", "マーリン"][randomInt(0, 5)];
        const l = Math.max(1, fl + randomInt(-2, 2));
        availableMercs.push({ id: Date.now()+i, name: n, level: l, atk: 5+(l*3), price: Math.floor(100*Math.pow(1.5, l)) });
    }
}

// --- UI ---

function updateAllUI() {
    updateHeaderUI();
    const sel = document.getElementById("hero-class-select");
    sel.innerHTML = "";
    for (let key in CLASSES) {
        let opt = document.createElement("option"); opt.value = key; opt.innerText = CLASSES[key].name;
        if(state.hero.classId === key) opt.selected = true;
        sel.appendChild(opt);
    }
    updateStatusUI(); updateEquipmentUI(); updateInventoryUI(); updatePartyUI(); updateKamuiUI(); updateBattleControls(); updateEnemyHP();
}

function updateBattleControls() {
    const autoBtn = document.getElementById("btn-toggle-auto");
    const manualCtrl = document.getElementById("manual-controls");
    const proceedCtrl = document.getElementById("proceed-controls");
    autoBtn.innerText = state.isAutoMode ? "AUTO: ON" : "AUTO: OFF";
    state.isAutoMode ? autoBtn.classList.add("active") : autoBtn.classList.remove("active");
    if (canProceed) {
        manualCtrl.classList.add("hidden");
        proceedCtrl.classList.remove("hidden");
    } else {
        proceedCtrl.classList.add("hidden");
        if (!state.isAutoMode) manualCtrl.classList.remove("hidden");
        else manualCtrl.classList.add("hidden");
    }
}

function updateStatusUI() {
    const stats = getHeroTotalStats();
    const cid = state.hero.classId;
    document.getElementById("hero-level").innerHTML = `総合Lv.${state.hero.level} / ${CLASSES[cid].name}Lv.${state.hero.classLevels[cid]}`;
    document.getElementById("hero-exp").innerText = state.hero.exp;
    document.getElementById("hero-next-exp").innerText = state.hero.nextExp;
    document.getElementById("hero-hp").innerText = Math.floor(state.hero.hp);
    document.getElementById("hero-max-hp").innerText = stats.maxHp;
    document.getElementById("hero-atk").innerText = stats.atk;
    document.getElementById("hero-def").innerText = stats.def;
    updateHeroHP(0);
}

function openSkillModal() {
    const list = document.getElementById("skill-list");
    list.innerHTML = "";
    const cid = state.hero.classId;
    const skills = CLASSES[cid].skills;
    const curLvl = state.hero.classLevels[cid];
    skills.forEach(s => {
        const btn = document.createElement("button"); btn.className = "skill-btn";
        const isLocked = s.unlockLvl > curLvl;
        const cd = skillCooldowns[s.id] || 0;
        btn.disabled = isLocked || cd > 0;
        btn.innerHTML = `<strong>${s.name}</strong> ${isLocked ? `(Lv.${s.unlockLvl}解放)` : (cd > 0 ? `(${cd}s)` : "")}<span class="skill-info">${s.desc}</span>`;
        if (!btn.disabled) btn.onclick = () => useSkill(s);
        list.appendChild(btn);
    });
    document.getElementById("skill-modal").classList.remove("hidden");
}
function closeSkillModal() { document.getElementById("skill-modal").classList.add("hidden"); }

function updateHeaderUI() { document.getElementById("current-floor").innerText = state.floor; document.getElementById("gold-amount").innerText = state.gold; document.getElementById("kamui-amount").innerText = state.kamui; }
function updateEquipmentUI() { for (let type of ['weapon', 'armor', 'accessory']) { const el = document.getElementById(`equip-${type}`).querySelector('.slot-item'); const item = state.equipment[type]; if (item) { el.innerText = item.name; el.className = `slot-item ${item.rarity.colorClass}`; } else { el.innerText = "なし"; el.className = "slot-item"; } } }
function updateInventoryUI() { const list = document.getElementById("inventory-list"); list.innerHTML = ""; document.getElementById("inv-count").innerText = state.inventory.length; state.inventory.forEach((item, index) => { const div = document.createElement("div"); div.className = "inv-item"; div.innerHTML = `<div class="item-name ${item.rarity.colorClass}">${item.name}</div>`; div.onclick = () => openItemModal(index); list.appendChild(div); }); }
function updatePartyUI() { document.getElementById("party-count").innerText = state.party.length; const plist = document.getElementById("party-list"); plist.innerHTML = state.party.length === 0 ? "<p class='item-stats'>なし</p>" : ""; state.party.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} Lv.${m.level}</div><button class="btn-sm" onclick="dismissMercenary(${i})">解雇</button>`; plist.appendChild(d); }); const tlist = document.getElementById("tavern-list"); tlist.innerHTML = availableMercs.length === 0 ? "<p class='item-stats'>なし</p>" : ""; availableMercs.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} (${m.price}G)</div><button class="btn-sm" onclick="hireMercenary(${i})">雇用</button>`; tlist.appendChild(d); }); }
function updateKamuiUI() { document.getElementById("kamui-gain-amount").innerText = Math.floor(state.floor / 5); const ulist = document.getElementById("kamui-upgrades"); ulist.innerHTML = `<div class="upgrade-item"><div>経験値+20% (Lv.${state.kamuiUpgrades.expBonus})</div><button class="btn-sm" onclick="buyKamuiUpgrade('expBonus')">強化</button></div><div class="upgrade-item"><div>G+20% (Lv.${state.kamuiUpgrades.goldBonus})</div><button class="btn-sm" onclick="buyKamuiUpgrade('goldBonus')">強化</button></div><div class="upgrade-item"><div>ドロップ+25% (Lv.${state.kamuiUpgrades.dropRateBonus})</div><button class="btn-sm" onclick="buyKamuiUpgrade('dropRateBonus')">強化</button></div><div class="upgrade-item"><div>ステ+10% (Lv.${state.kamuiUpgrades.statsBonus})</div><button class="btn-sm" onclick="buyKamuiUpgrade('statsBonus')">強化</button></div>`; }
function logMessage(m, t = "normal") { const log = document.getElementById("battle-log"); const d = document.createElement("div"); d.className = `log-entry ${t}`; d.innerText = m; log.appendChild(d); if (log.children.length > 30) log.removeChild(log.firstChild); log.scrollTop = log.scrollHeight; }

function hireMercenary(i) { if (state.party.length >= 3) return; const m = availableMercs[i]; if (state.gold >= m.price) { state.gold -= m.price; state.party.push({...m}); availableMercs.splice(i, 1); updateAllUI(); saveGame(); } }
function dismissMercenary(i) { if (confirm("解雇しますか?")) { state.party.splice(i, 1); updatePartyUI(); saveGame(); } }
function buyKamuiUpgrade(t) { const c = t === 'statsBonus' ? 3 : (t === 'dropRateBonus' ? 2 : 1); if (state.kamui >= c) { state.kamui -= c; state.kamuiUpgrades[t]++; updateAllUI(); saveGame(); } }
function doPrestige() { const g = Math.floor(state.floor / 5); if (g < 2) return; if (confirm("転生しますか?")) { state.kamui += g; state.floor = 1; state.hero.level = 1; state.hero.exp = 0; state.hero.nextExp = 10; state.hero.baseAtk = 10; state.hero.baseDef = 5; state.hero.maxHp = 100; state.party = []; state.hero.hp = getHeroTotalStats().maxHp; currentEnemy = null; canProceed = false; updateAllUI(); saveGame(); startBattle(); } }
function openItemModal(i) { selectedItemIndex = i; const item = state.inventory[i]; document.getElementById("item-modal").classList.remove("hidden"); document.getElementById("modal-item-name").innerText = item.name; document.getElementById("modal-item-name").className = item.rarity.colorClass; document.getElementById("modal-item-stats").innerHTML = `売却: ${item.value} G`; }

// Events
document.querySelectorAll(".tab-btn").forEach(b => b.onclick = () => { document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active")); document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active")); b.classList.add("active"); document.getElementById(b.dataset.target).classList.add("active"); });
document.getElementById("btn-toggle-auto").onclick = () => { state.isAutoMode = !state.isAutoMode; updateBattleControls(); saveGame(); };
document.getElementById("btn-attack").onclick = () => executeAttack();
document.getElementById("btn-open-skills").onclick = () => openSkillModal();
document.getElementById("btn-close-skill-modal").onclick = () => closeSkillModal();
document.getElementById("btn-next-floor").onclick = () => { state.floor++; currentEnemy = null; canProceed = false; updateHeroHP(Math.floor(getHeroTotalStats().maxHp * 0.1)); if (state.floor % 5 === 0) refreshTavern(); updateAllUI(); startBattle(); };
document.getElementById("btn-retreat").onclick = () => { state.floor = 1; currentEnemy = null; canProceed = false; state.hero.hp = getHeroTotalStats().maxHp; updateAllUI(); saveGame(); startBattle(); };
document.getElementById("btn-sell-all").onclick = () => { let g = 0; let n = []; state.inventory.forEach(i => { if (i.rarity.name === 'コモン' || i.rarity.name === 'アンコモン') g += i.value; else n.push(i); }); if (g > 0) { state.inventory = n; state.gold += g; updateAllUI(); saveGame(); } };
document.getElementById("btn-close-modal").onclick = () => document.getElementById("item-modal").classList.add("hidden");
document.getElementById("btn-equip-item").onclick = () => { const i = state.inventory[selectedItemIndex]; if (state.equipment[i.type]) state.inventory.push(state.equipment[i.type]); state.equipment[i.type] = i; state.inventory.splice(selectedItemIndex, 1); document.getElementById("item-modal").classList.add("hidden"); updateAllUI(); saveGame(); };
document.getElementById("btn-sell-item").onclick = () => { state.gold += state.inventory[selectedItemIndex].value; state.inventory.splice(selectedItemIndex, 1); document.getElementById("item-modal").classList.add("hidden"); updateAllUI(); saveGame(); };
document.getElementById("hero-class-select").onchange = (e) => { state.hero.classId = e.target.value; updateStatusUI(); saveGame(); };

window.hireMercenary = hireMercenary; window.dismissMercenary = dismissMercenary; window.buyKamuiUpgrade = buyKamuiUpgrade;
loadGame();
startBattle();
