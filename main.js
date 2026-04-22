// --- Game State & Data ---
const GAME_VERSION = "1.0";
const SAVE_KEY = "konbuRpgSaveData_v10";

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

// --- Class Definitions with Parameters ---

const CLASSES = {
    novice: {
        name: "見習い", hpPerLvl: 5, atkPerLvl: 1, defPerLvl: 0.5,
        atkMult: 1.0, defMult: 1.0, hpMult: 1.0,
        skills: [ { id: 'bash', name: 'バッシュ', unlockLvl: 1, mult: 1.5, cd: 3, desc: '1.5倍ダメージ' }, { id: 'focus', name: '精神集中', unlockLvl: 5, mult: 2.2, cd: 5, desc: '2.2倍ダメージ' } ]
    },
    warrior: {
        name: "戦士", hpPerLvl: 8, atkPerLvl: 2, defPerLvl: 1,
        atkMult: 1.2, defMult: 1.1, hpMult: 1.1,
        skills: [ { id: 'power', name: '強撃', unlockLvl: 1, mult: 2.5, cd: 4, desc: '2.5倍ダメージ' }, { id: 'whirlwind', name: '旋風斬', unlockLvl: 10, mult: 4.0, cd: 8, desc: '4.0倍ダメージ' } ]
    },
    knight: {
        name: "騎士", hpPerLvl: 12, atkPerLvl: 1, defPerLvl: 2,
        atkMult: 1.0, defMult: 1.5, hpMult: 1.3,
        skills: [ { id: 'holy', name: 'ホーリーライト', unlockLvl: 1, mult: 1.2, heal: 0.1, cd: 5, desc: '攻撃＋HP10%回復' }, { id: 'shield', name: 'シールドバッシュ', unlockLvl: 5, mult: 1.8, stun: true, cd: 6, desc: '1.8倍ダメ＋敵遅延' } ]
    },
    berserker: {
        name: "狂戦士", hpPerLvl: 6, atkPerLvl: 3, defPerLvl: 0.2,
        atkMult: 1.8, defMult: 0.5, hpMult: 0.8,
        skills: [ { id: 'blood', name: 'ブラッドラスト', unlockLvl: 1, mult: 4.0, recoil: 0.1, cd: 5, desc: '4倍ダメ（反動10%）' }, { id: 'exec', name: '処刑', unlockLvl: 10, mult: 6.0, recoil: 0.2, cd: 10, desc: '6倍ダメ（反動20%）' } ]
    },
    thief: {
        name: "盗賊", hpPerLvl: 5, atkPerLvl: 1.5, defPerLvl: 0.5,
        atkMult: 1.1, defMult: 0.8, hpMult: 0.9,
        skills: [ { id: 'steal', name: 'ぶんどる', unlockLvl: 1, mult: 1.2, gold: true, cd: 4, desc: '攻撃＋ゴールド' }, { id: 'triple', name: '三連斬', unlockLvl: 5, mult: 3.5, cd: 7, desc: '3.5倍ダメージ' } ]
    }
};

// --- Core ---

function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

function deepMerge(target, source) {
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

function getHeroTotalStats() {
    const currentClass = CLASSES[state.hero.classId];
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

    // Apply class-specific multipliers
    atk *= (currentClass.atkMult || 1.0);
    def *= (currentClass.defMult || 1.0);
    maxHp *= (currentClass.hpMult || 1.0);
    
    // Apply kamui bonus
    atk *= kamuiMult; def *= kamuiMult; maxHp *= kamuiMult;

    for (const key in state.equipment) {
        const i = state.equipment[key];
        if (i) { atk += (i.atk || 0); def += (i.def || 0); maxHp += (i.hp || 0); }
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
    const p = Math.max(0, (currentEnemy.hp / currentEnemy.maxHp) * 100);
    document.getElementById("enemy-hp-bar").style.width = `${p}%`;
    document.getElementById("enemy-hp").innerText = Math.floor(Math.max(0, currentEnemy.hp));
    document.getElementById("enemy-max-hp").innerText = currentEnemy.maxHp;
}

// --- Actions ---

function executeAttack(multiplier = 1, isSkill = false) {
    if (!currentEnemy || canProceed || isActing) return;
    isActing = true; updateBattleControls();
    const stats = getHeroTotalStats();
    let dmg = Math.max(1, Math.floor((stats.atk - currentEnemy.def) * multiplier) + Math.floor(Math.random() * 5) - 2);
    currentEnemy.hp -= dmg;
    const heroEl = document.querySelector(".hero");
    heroEl.classList.remove("attack-anim-hero"); void heroEl.offsetWidth; heroEl.classList.add("attack-anim-hero");
    logMessage(`${isSkill ? '特技！' : ''}勇者の攻撃！ ${dmg}ダメージ`);
    updateEnemyHP();
    if (currentEnemy.hp <= 0) {
        onEnemyDefeated();
    } else {
        state.party.forEach(m => {
            if (!currentEnemy || currentEnemy.hp <= 0) return;
            let d = Math.max(1, m.atk - (currentEnemy.def*0.5) + Math.floor(Math.random()*3)-1);
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
    let d = Math.max(1, currentEnemy.atk - stats.def + Math.floor(Math.random()*3)-1);
    updateHeroHP(-d);
    const enemyEl = document.querySelector(".enemy");
    enemyEl.classList.remove("attack-anim-enemy"); void enemyEl.offsetWidth; enemyEl.classList.add("attack-anim-enemy");
    logMessage(`${currentEnemy.name}の反撃！ ${d}ダメージ`, "damage");
    if (state.hero.hp <= 0) {
        logMessage("敗北した...", "danger"); state.floor = 1; state.hero.hp = getHeroTotalStats().maxHp;
        currentEnemy = null; canProceed = false; isActing = false;
        updateAllUI(); saveGame(); startBattle();
    } else { isActing = false; updateBattleControls(); }
}

function onEnemyDefeated() {
    logMessage(`${currentEnemy.name} を撃破！`, "system");
    let expM = 1 + (state.kamuiUpgrades.expBonus * 0.2);
    let goldM = 1 + (state.kamuiUpgrades.goldBonus * 0.2);
    let expG = Math.floor(10 * Math.pow(1.03, state.floor) * expM);
    let goldG = Math.floor(5 * Math.pow(1.03, state.floor) * goldM);
    if (currentEnemy.isBoss) { expG *= 3; goldG *= 3; }
    state.hero.exp += expG; state.hero.classExp[state.hero.classId] += expG;
    state.gold += goldG; checkLevelUp();
    if (Math.random() < (0.3 * (1 + state.kamuiUpgrades.dropRateBonus * 0.25)) || currentEnemy.isBoss) generateLoot(state.floor);
    canProceed = true; isActing = false;
    updateAllUI(); saveGame();
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
        document.getElementById("enemy-name").innerText = currentEnemy.name;
        document.getElementById("enemy-sprite").src = "assets/" + currentEnemy.image;
        updateEnemyHP(); logMessage(`${currentEnemy.name} (階層.${state.floor}) が出現！`, "system");
    }
    if (!battleInterval) battleInterval = setInterval(battleTick, 1000);
}

function battleTick() {
    for (let id in skillCooldowns) { if (skillCooldowns[id] > 0) skillCooldowns[id]--; }
    
    // Auto-proceed logic for AUTO mode
    if (state.isAutoMode && canProceed) {
        nextFloor();
        return;
    }

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
    const t = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
    const boss = floor % 10 === 0;
    const m = Math.pow(1.03, floor - 1) * (boss ? 5 : 1);
    const hp = Math.floor(30 * t.hpMult * m);
    return { name: boss ? `[BOSS] ${t.name}` : t.name, maxHp: hp, hp, atk: Math.floor(8 * t.atkMult * m), def: Math.floor(3 * t.defMult * m), isBoss: boss, image: t.image };
}

function generateLoot(floor) {
    if (state.inventory.length >= state.maxInventory) return;
    const type = ['weapon', 'armor', 'accessory'][Math.floor(Math.random()*3)];
    let rar = getRandomRarity();
    const fl = Math.max(1, floor + Math.floor(Math.random()*5)-2);
    let stat = Math.floor(10 * Math.pow(1.03, fl) * rar.statMult);
    let i = { id: Date.now() + Math.floor(Math.random()*1000), type, rarity: rar, lvl: fl };
    const p = ["粗悪な", "普通の", "鋭い", "重い", "魔法の", "名工の", "伝説の", "神話の", "虚無の"][Math.floor(Math.random()*9)];
    const ns = { weapon: "の剣", armor: "の鎧", accessory: "の指輪" };
    i.name = `[Lv.${fl}] ${p}${ns[type]}`;
    if (type === 'weapon') i.atk = stat; else if (type === 'armor') i.def = stat;
    else { if (Math.random()>0.5) { i.atk=Math.floor(stat*0.4); i.def=Math.floor(stat*0.4); } else i.hp=stat*5; }
    i.value = Math.floor(stat * rar.statMult);
    state.inventory.push(i); logMessage(`${i.name} を獲得！`, "loot"); updateInventoryUI();
}

function getRandomRarity() {
    const total = [60, 25, 10, 4, 1].reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    if (r < 60) return RARITIES[0]; if (r < 85) return RARITIES[1]; if (r < 95) return RARITIES[2]; if (r < 99) return RARITIES[3]; return RARITIES[4];
}

function refreshTavern() {
    availableMercs = []; const fl = Math.max(1, Math.floor(state.floor / 5));
    for (let i=0; i<3; i++) {
        const n = ["アーサー", "ランスロット", "ジャンヌ", "ジークフリート", "ロビン", "マーリン"][Math.floor(Math.random()*6)];
        const l = Math.max(1, fl + Math.floor(Math.random()*5)-2);
        availableMercs.push({ id: Date.now()+i, name: n, level: l, atk: Math.floor(10 * Math.pow(1.03, l)), price: Math.floor(100*Math.pow(1.5, l)) });
    }
}

// --- UI ---

function updateAllUI() {
    updateHeaderUI();
    const sel = document.getElementById("hero-class-select"); sel.innerHTML = "";
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
        if (!state.isAutoMode) { manualCtrl.classList.remove("hidden"); document.getElementById("btn-attack").disabled = isActing; document.getElementById("btn-open-skills").disabled = isActing; }
        else manualCtrl.classList.add("hidden");
    }
}

function updateStatusUI() {
    const stats = getHeroTotalStats(); const cid = state.hero.classId; const c = CLASSES[cid];
    document.getElementById("hero-level").innerHTML = `総合Lv.${state.hero.level} / ${c.name}Lv.${state.hero.classLevels[cid]}`;
    document.getElementById("hero-hp").innerText = Math.floor(state.hero.hp);
    document.getElementById("hero-max-hp").innerText = stats.maxHp;
    document.getElementById("hero-atk").innerText = stats.atk;
    document.getElementById("hero-def").innerText = stats.def;
    document.getElementById("hero-exp").innerText = state.hero.exp;
    document.getElementById("hero-next-exp").innerText = state.hero.nextExp;
}

function openSkillModal() {
    const list = document.getElementById("skill-list"); list.innerHTML = "";
    const cid = state.hero.classId;
    CLASSES[cid].skills.forEach(s => {
        const btn = document.createElement("button"); btn.className = "skill-btn";
        const locked = s.unlockLvl > state.hero.classLevels[cid];
        const cd = skillCooldowns[s.id] || 0;
        btn.disabled = locked || cd > 0 || isActing;
        btn.innerHTML = `<strong>${s.name}</strong> ${locked ? `(Lv.${s.unlockLvl}解放)` : (cd > 0 ? `(${cd}s)` : "")}<span class="skill-info">${s.desc}</span>`;
        if (!btn.disabled) btn.onclick = () => {
            if (isActing) return;
            useSkill(s);
        };
        list.appendChild(btn);
    });
    document.getElementById("skill-modal").classList.remove("hidden");
}
function closeSkillModal() { document.getElementById("skill-modal").classList.add("hidden"); }

function updateHeaderUI() { document.getElementById("current-floor").innerText = state.floor; document.getElementById("gold-amount").innerText = state.gold; document.getElementById("kamui-amount").innerText = state.kamui; }
function updateEquipmentUI() { for (let type of ['weapon', 'armor', 'accessory']) { const el = document.getElementById(`equip-${type}`).querySelector('.slot-item'); const i = state.equipment[type]; if (i) { el.innerText = i.name; el.className = `slot-item ${i.rarity.colorClass}`; } else { el.innerText = "なし"; el.className = "slot-item"; } } }
function updateInventoryUI() { const list = document.getElementById("inventory-list"); list.innerHTML = ""; document.getElementById("inv-count").innerText = state.inventory.length; state.inventory.forEach((i, idx) => { const d = document.createElement("div"); d.className = "inv-item"; d.innerHTML = `<div class="item-name ${i.rarity.colorClass}">${i.name}</div>`; d.onclick = () => openItemModal(idx); list.appendChild(d); }); }
function updatePartyUI() {
    document.getElementById("party-count").innerText = state.party.length;
    const plist = document.getElementById("party-list"); plist.innerHTML = state.party.length === 0 ? "<p class='item-stats'>なし</p>" : "";
    state.party.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} Lv.${m.level}</div><button class="btn-sm" onclick="window.dismissMercenary(${i})">解雇</button>`; plist.appendChild(d); });
    const tlist = document.getElementById("tavern-list"); tlist.innerHTML = availableMercs.length === 0 ? "<p class='item-stats'>なし</p>" : "";
    availableMercs.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} (${m.price}G)</div><button class="btn-sm" onclick="window.hireMercenary(${i})">雇用</button>`; tlist.appendChild(d); });
    document.getElementById("party-visual-list").innerText = state.party.length > 0 ? `同行: ${state.party.map(m=>m.name).join(", ")}` : "";
}
function updateKamuiUI() {
    document.getElementById("kamui-gain-amount").innerText = Math.floor(state.floor / 5);
    const ulist = document.getElementById("kamui-upgrades"); ulist.innerHTML = `
        <div class="upgrade-item"><div>経験値+20% (Lv.${state.kamuiUpgrades.expBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('expBonus')">強化</button></div>
        <div class="upgrade-item"><div>G+20% (Lv.${state.kamuiUpgrades.goldBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('goldBonus')">強化</button></div>
        <div class="upgrade-item"><div>ドロップ+25% (Lv.${state.kamuiUpgrades.dropRateBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('dropRateBonus')">強化</button></div>
        <div class="upgrade-item"><div>ステ+10% (Lv.${state.kamuiUpgrades.statsBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('statsBonus')">強化</button></div>
    `;
}
function logMessage(m, t = "normal") { const log = document.getElementById("battle-log"); const d = document.createElement("div"); d.className = `log-entry ${t}`; d.innerText = m; log.appendChild(d); if (log.children.length > 30) log.removeChild(log.firstChild); log.scrollTop = log.scrollHeight; }

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
function openItemModal(i) { selectedItemIndex = i; const item = state.inventory[i]; document.getElementById("item-modal").classList.remove("hidden"); document.getElementById("modal-item-name").innerText = item.name; document.getElementById("modal-item-name").className = item.rarity.colorClass; document.getElementById("modal-item-stats").innerHTML = `売却: ${item.value} G`; }

// Events
document.querySelectorAll(".tab-btn").forEach(b => b.onclick = () => { document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active")); document.querySelectorAll(".tab-content").forEach(x => x.classList.remove("active")); b.classList.add("active"); document.getElementById(b.dataset.target).classList.add("active"); });
document.getElementById("btn-toggle-auto").onclick = () => { state.isAutoMode = !state.isAutoMode; updateBattleControls(); saveGame(); };
document.getElementById("btn-attack").onclick = () => executeAttack();
document.getElementById("btn-open-skills").onclick = () => openSkillModal();
document.getElementById("btn-close-skill-modal").onclick = () => closeSkillModal();
document.getElementById("btn-next-floor").onclick = nextFloor;
document.getElementById("btn-retreat").onclick = () => { state.floor = 1; currentEnemy = null; canProceed = false; isActing = false; state.hero.hp = getHeroTotalStats().maxHp; updateAllUI(); saveGame(); startBattle(); };
document.getElementById("btn-sell-all").onclick = () => { let g = 0; let n = []; state.inventory.forEach(i => { if (i.rarity.name === 'コモン' || i.rarity.name === 'アンコモン') g += i.value; else n.push(i); }); if (g > 0) { state.inventory = n; state.gold += g; updateAllUI(); saveGame(); } };
document.getElementById("btn-close-modal").onclick = () => document.getElementById("item-modal").classList.add("hidden");
document.getElementById("btn-equip-item").onclick = () => { const i = state.inventory[selectedItemIndex]; if (state.equipment[i.type]) state.inventory.push(state.equipment[i.type]); state.equipment[i.type] = i; state.inventory.splice(selectedItemIndex, 1); document.getElementById("item-modal").classList.add("hidden"); updateAllUI(); saveGame(); };
document.getElementById("btn-sell-item").onclick = () => { state.gold += state.inventory[selectedItemIndex].value; state.inventory.splice(selectedItemIndex, 1); document.getElementById("item-modal").classList.add("hidden"); updateAllUI(); saveGame(); };
document.getElementById("hero-class-select").onchange = (e) => { state.hero.classId = e.target.value; updateAllUI(); saveGame(); };
document.getElementById("btn-prestige").onclick = doPrestige;

window.hireMercenary = hireMercenary; window.dismissMercenary = dismissMercenary; window.buyKamuiUpgrade = buyKamuiUpgrade;
loadGame(); startBattle();
