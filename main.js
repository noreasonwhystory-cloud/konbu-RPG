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
        classLevels: { novice: 1, warrior: 1, knight: 1, berserker: 1, thief: 1, assassin: 1, samurai: 1, hero: 1 },
        classExp: { novice: 0, warrior: 0, knight: 0, berserker: 0, thief: 0, assassin: 0, samurai: 0, hero: 0 }
    },
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [], maxInventory: 50,
    party: [],
    kamuiUpgrades: { expBonus: 0, goldBonus: 0, dropRateBonus: 0, statsBonus: 0 },
    achievements: { 
        kills: {}, totalKills: 0, total_loot: 0, loot_rare: 0, loot_epic: 0, loot_legendary: 0,
        gold_spent: 0, prestige_count: 0, total_boss_kills: 0, refine_count: 0, total_hired: 0
    },
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
    // --- Slayer Series (13 Enemies * 3 Tiers = 39) ---
    { id: 'sl_slime_1', name: 'スライムハンター', req: { 'スライム': 10 }, bonus: { atk: 5 }, desc: 'スライム10体: ATK+5' },
    { id: 'sl_slime_2', name: 'スライムキラー', req: { 'スライム': 50 }, bonus: { atk: 20 }, desc: 'スライム50体: ATK+20' },
    { id: 'sl_slime_3', name: 'スライムマスター', req: { 'スライム': 200 }, bonus: { atkPct: 0.05 }, desc: 'スライム200体: ATK+5%' },
    { id: 'sl_goblin_1', name: 'ゴブリンキラー', req: { 'ゴブリン': 10 }, bonus: { def: 5 }, desc: 'ゴブリン10体: DEF+5' },
    { id: 'sl_goblin_2', name: 'ゴブリンブレイカー', req: { 'ゴブリン': 50 }, bonus: { def: 20 }, desc: 'ゴブリン50体: DEF+20' },
    { id: 'sl_goblin_3', name: 'ゴブリンロード', req: { 'ゴブリン': 200 }, bonus: { defPct: 0.05 }, desc: 'ゴブリン200体: DEF+5%' },
    { id: 'sl_wolf_1', name: 'ウルフハンター', req: { 'ウルフ': 10 }, bonus: { atk: 8 }, desc: 'ウルフ10体: ATK+8' },
    { id: 'sl_wolf_2', name: '疾風の狩人', req: { 'ウルフ': 50 }, bonus: { atk: 30 }, desc: 'ウルフ50体: ATK+30' },
    { id: 'sl_wolf_3', name: '神狼の友', req: { 'ウルフ': 200 }, bonus: { atkPct: 0.08 }, desc: 'ウルフ200体: ATK+8%' },
    { id: 'sl_skeleton_1', name: '骨砕き', req: { 'スケルトン': 10 }, bonus: { atk: 10 }, desc: '骸骨10体: ATK+10' },
    { id: 'sl_skeleton_2', name: '不死を狩る者', req: { 'スケルトン': 50 }, bonus: { atk: 40 }, desc: '骸骨50体: ATK+40' },
    { id: 'sl_skeleton_3', name: 'デスマスター', req: { 'スケルトン': 200 }, bonus: { atkPct: 0.1 }, desc: '骸骨200体: ATK+10%' },
    { id: 'sl_orc_1', name: 'オークキラー', req: { 'オーク': 10 }, bonus: { def: 15 }, desc: 'オーク10体: DEF+15' },
    { id: 'sl_orc_2', name: '猪突猛進', req: { 'オーク': 50 }, bonus: { def: 50 }, desc: 'オーク50体: DEF+50' },
    { id: 'sl_orc_3', name: '破壊の化身', req: { 'オーク': 200 }, bonus: { defPct: 0.12 }, desc: 'オーク200体: DEF+12%' },
    { id: 'sl_gargoyle_1', name: '石像壊し', req: { 'ガーゴイル': 10 }, bonus: { def: 20 }, desc: 'ガーゴイル10体: DEF+20' },
    { id: 'sl_gargoyle_2', name: '不落の守護者', req: { 'ガーゴイル': 50 }, bonus: { def: 80 }, desc: 'ガーゴイル50体: DEF+80' },
    { id: 'sl_gargoyle_3', name: '金剛不壊', req: { 'ガーゴイル': 200 }, bonus: { defPct: 0.15 }, desc: 'ガーゴイル200体: DEF+15%' },
    { id: 'sl_zombie_1', name: 'ゾンビハンター', req: { 'ゾンビ': 10 }, bonus: { hp: 50 }, desc: 'ゾンビ10体: HP+50' },
    { id: 'sl_zombie_2', name: '腐敗を絶つ者', req: { 'ゾンビ': 50 }, bonus: { hp: 200 }, desc: 'ゾンビ50体: HP+200' },
    { id: 'sl_zombie_3', name: '不老不死', req: { 'ゾンビ': 200 }, bonus: { hpPct: 0.1 }, desc: 'ゾンビ200体: HP+10%' },
    { id: 'sl_ghost_1', name: '霊感持ち', req: { 'ゴースト': 10 }, bonus: { def: 10 }, desc: '幽霊10体: DEF+10' },
    { id: 'sl_ghost_2', name: 'エクソシスト', req: { 'ゴースト': 50 }, bonus: { def: 40 }, desc: '幽霊50体: DEF+40' },
    { id: 'sl_ghost_3', name: '虚無を見つめる者', req: { 'ゴースト': 200 }, bonus: { defPct: 0.1 }, desc: '幽霊200体: DEF+10%' },
    { id: 'sl_golem_1', name: '石の心', req: { 'ゴーレム': 10 }, bonus: { def: 30 }, desc: 'ゴーレム10体: DEF+30' },
    { id: 'sl_golem_2', name: '鉄壁の戦士', req: { 'ゴーレム': 50 }, bonus: { def: 100 }, desc: 'ゴーレム50体: DEF+100' },
    { id: 'sl_golem_3', name: '岩壁の覇者', req: { 'ゴーレム': 200 }, bonus: { defPct: 0.2 }, desc: 'ゴーレム200体: DEF+20%' },
    { id: 'sl_vampire_1', name: '吸血鬼の天敵', req: { 'ヴァンパイア': 10 }, bonus: { atk: 30 }, desc: '吸血鬼10体: ATK+30' },
    { id: 'sl_vampire_2', name: '月下の狩人', req: { 'ヴァンパイア': 50 }, bonus: { atk: 120 }, desc: '吸血鬼50体: ATK+120' },
    { id: 'sl_vampire_3', name: '真祖を継ぐ者', req: { 'ヴァンパイア': 200 }, bonus: { atkPct: 0.15 }, desc: '吸血鬼200体: ATK+15%' },
    { id: 'sl_demon_1', name: '悪魔払い', req: { 'デーモン': 10 }, bonus: { atk: 50 }, desc: '悪魔10体: ATK+50' },
    { id: 'sl_demon_2', name: '地獄の番犬', req: { 'デーモン': 50 }, bonus: { atk: 200 }, desc: '悪魔50体: ATK+200' },
    { id: 'sl_demon_3', name: '魔界の王', req: { 'デーモン': 200 }, bonus: { atkPct: 0.25 }, desc: '悪魔200体: ATK+25%' },
    { id: 'sl_dragon_1', name: '竜騎士候補', req: { 'ドラゴン': 1 }, bonus: { atk: 50 }, desc: '竜1体: ATK+50' },
    { id: 'sl_dragon_2', name: 'ドラゴンスレイヤー', req: { 'ドラゴン': 10 }, bonus: { atkPct: 0.2 }, desc: '竜10体: ATK+20%' },
    { id: 'sl_dragon_3', name: '竜神', req: { 'ドラゴン': 50 }, bonus: { atkPct: 0.5 }, desc: '竜50体: ATK+50%' },
    { id: 'sl_rare_1', name: '幸運の持ち主', req: { 'メタルこんぶ': 1 }, bonus: { goldPct: 0.1 }, desc: 'メタル1体: Gold+10%' },
    { id: 'sl_rare_2', name: 'メタルハンター', req: { 'メタルこんぶ': 5 }, bonus: { goldPct: 0.3 }, desc: 'メタル5体: Gold+30%' },
    { id: 'sl_rare_3', name: '黄金の導き', req: { 'メタルこんぶ': 20 }, bonus: { goldPct: 1.0 }, desc: 'メタル20体: Gold+100%' },

    // --- Floor Series (10) ---
    { id: 'fl_10', name: '冒険の始まり', req: { 'floor': 10 }, bonus: { hp: 20 }, desc: '10階到達: HP+20' },
    { id: 'fl_50', name: '中堅冒険者', req: { 'floor': 50 }, bonus: { hp: 100 }, desc: '50階到達: HP+100' },
    { id: 'fl_100', name: '熟練の戦士', req: { 'floor': 100 }, bonus: { hpPct: 0.1 }, desc: '100階到達: HP+10%' },
    { id: 'fl_200', name: '英雄の領域', req: { 'floor': 200 }, bonus: { atkPct: 0.1, defPct: 0.1 }, desc: '200階到達: ATK/DEF+10%' },
    { id: 'fl_500', name: '伝説の帰還', req: { 'floor': 500 }, bonus: { atkPct: 0.2, defPct: 0.2, hpPct: 0.2 }, desc: '500階到達: 全+20%' },
    { id: 'fl_1000', name: '神話の完結', req: { 'floor': 1000 }, bonus: { atkPct: 1.0, defPct: 1.0, hpPct: 1.0 }, desc: '1000階到達: 全+100%' },
    { id: 'fl_pre_1', name: '一歩先へ', req: { 'floor': 5 }, bonus: { atk: 2 }, desc: '5階到達: ATK+2' },
    { id: 'fl_pre_2', name: '地下探索者', req: { 'floor': 25 }, bonus: { def: 10 }, desc: '25階到達: DEF+10' },
    { id: 'fl_pre_3', name: '迷宮の覇者', req: { 'floor': 75 }, bonus: { atk: 50 }, desc: '75階到達: ATK+50' },
    { id: 'fl_pre_4', name: '奈落の底を知る者', req: { 'floor': 300 }, bonus: { hp: 1000 }, desc: '300階到達: HP+1000' },

    // --- Gold Series (10) ---
    { id: 'gd_1k', name: '小金持ち', req: { 'gold': 1000 }, bonus: { goldPct: 0.05 }, desc: '1,000G: Gold+5%' },
    { id: 'gd_10k', name: '商人の弟子', req: { 'gold': 10000 }, bonus: { goldPct: 0.1 }, desc: '10,000G: Gold+10%' },
    { id: 'gd_100k', name: '資産家', req: { 'gold': 100000 }, bonus: { goldPct: 0.2 }, desc: '100,000G: Gold+20%' },
    { id: 'gd_1m', name: '大富豪', req: { 'gold': 1000000 }, bonus: { goldPct: 0.5 }, desc: '1,000,000G: Gold+50%' },
    { id: 'gd_10m', name: '世界の支配者', req: { 'gold': 10000000 }, bonus: { goldPct: 1.0 }, desc: '10,000,000G: Gold+100%' },
    { id: 'gd_acc_1', name: '浪費家', req: { 'gold_spent': 5000 }, bonus: { atk: 10 }, desc: '5,000G消費: ATK+10' },
    { id: 'gd_acc_2', name: '太っ腹', req: { 'gold_spent': 50000 }, bonus: { atk: 100 }, desc: '50,000G消費: ATK+100' },
    { id: 'gd_acc_3', name: '国家予算', req: { 'gold_spent': 500000 }, bonus: { atkPct: 0.2 }, desc: '500,000G消費: ATK+20%' },
    { id: 'gd_acc_4', name: '経済の守護神', req: { 'gold_spent': 5000000 }, bonus: { atkPct: 0.5 }, desc: '5,000,000G消費: ATK+50%' },
    { id: 'gd_save_1', name: '貯金生活', req: { 'gold': 500 }, bonus: { def: 2 }, desc: '500G所持: DEF+2' },

    // --- Collector Series (10) ---
    { id: 'cl_10', name: '新米コレクター', req: { 'total_loot': 10 }, bonus: { dropPct: 0.05 }, desc: '10個獲得: Drop+5%' },
    { id: 'cl_50', name: '収集家', req: { 'total_loot': 50 }, bonus: { dropPct: 0.1 }, desc: '50個獲得: Drop+10%' },
    { id: 'cl_100', name: '目利き', req: { 'total_loot': 100 }, bonus: { dropPct: 0.15 }, desc: '100個獲得: Drop+15%' },
    { id: 'cl_500', name: 'トレジャーハンター', req: { 'total_loot': 500 }, bonus: { dropPct: 0.3 }, desc: '500個獲得: Drop+30%' },
    { id: 'cl_1000', name: '遺物の王', req: { 'total_loot': 1000 }, bonus: { dropPct: 0.5 }, desc: '1000個獲得: Drop+50%' },
    { id: 'cl_rar_1', name: 'レア好き', req: { 'loot_rare': 5 }, bonus: { atk: 20 }, desc: 'レア5個: ATK+20' },
    { id: 'cl_rar_2', name: 'エピックマニア', req: { 'loot_epic': 3 }, bonus: { atkPct: 0.1 }, desc: 'エピック3個: ATK+10%' },
    { id: 'cl_rar_3', name: '神の目を持つ者', req: { 'loot_legendary': 1 }, bonus: { atkPct: 0.3 }, desc: '伝説1個: ATK+30%' },
    { id: 'cl_inv_1', name: '整理整頓', req: { 'total_loot': 20 }, bonus: { def: 5 }, desc: '20個獲得: DEF+5' },
    { id: 'cl_inv_2', name: '倉庫番', req: { 'total_loot': 200 }, bonus: { hp: 500 }, desc: '200個獲得: HP+500' },

    // --- Kamui Series (10) ---
    { id: 'km_1', name: '転生の芽生え', req: { 'kamui': 1 }, bonus: { atk: 10, def: 10 }, desc: '神威1: ATK/DEF+10' },
    { id: 'km_10', name: '繰り返す命', req: { 'kamui': 10 }, bonus: { atkPct: 0.1, defPct: 0.1 }, desc: '神威10: ATK/DEF+10%' },
    { id: 'km_50', name: '理を外れる者', req: { 'kamui': 50 }, bonus: { atkPct: 0.3, defPct: 0.3 }, desc: '神威50: ATK/DEF+30%' },
    { id: 'km_100', name: '不滅の神威', req: { 'kamui': 100 }, bonus: { atkPct: 1.0, defPct: 1.0 }, desc: '神威100: ATK/DEF+100%' },
    { id: 'km_pre_1', name: '初めての別れ', req: { 'prestige_count': 1 }, bonus: { expPct: 0.1 }, desc: '転生1回: EXP+10%' },
    { id: 'km_pre_2', name: '転生の旅人', req: { 'prestige_count': 5 }, bonus: { expPct: 0.3 }, desc: '転生5回: EXP+30%' },
    { id: 'km_pre_3', name: '輪廻転生', req: { 'prestige_count': 20 }, bonus: { expPct: 1.0 }, desc: '転生20回: EXP+100%' },
    { id: 'km_pre_4', name: '解脱', req: { 'prestige_count': 100 }, bonus: { expPct: 5.0 }, desc: '転生100回: EXP+500%' },
    { id: 'km_val_1', name: '徳を積む者', req: { 'kamui': 5 }, bonus: { hp: 100 }, desc: '神威5: HP+100' },
    { id: 'km_val_2', name: '聖者', req: { 'kamui': 30 }, bonus: { hpPct: 0.5 }, desc: '神威30: HP+50%' },

    // --- Training Series (10) ---
    { id: 'tr_lvl_50', name: '努力家', req: { 'hero_level': 50 }, bonus: { atk: 25, def: 25 }, desc: 'Lv50: ATK/DEF+25' },
    { id: 'tr_lvl_100', name: '限界を超えし者', req: { 'hero_level': 100 }, bonus: { atkPct: 0.2 }, desc: 'Lv100: ATK+20%' },
    { id: 'tr_lvl_200', name: '超越者', req: { 'hero_level': 200 }, bonus: { atkPct: 0.5, defPct: 0.5 }, desc: 'Lv200: ATK/DEF+50%' },
    { id: 'tr_sk_1', name: '技能の卵', req: { 'class_level_sum': 10 }, bonus: { atk: 10 }, desc: 'クラス合計Lv10: ATK+10' },
    { id: 'tr_sk_2', name: '万能選手', req: { 'class_level_sum': 50 }, bonus: { atkPct: 0.1, defPct: 0.1 }, desc: 'クラス合計Lv50: 全10%' },
    { id: 'tr_sk_3', name: '大賢者', req: { 'class_level_sum': 200 }, bonus: { atkPct: 0.5, defPct: 0.5, hpPct: 0.5 }, desc: 'クラス合計Lv200: 全50%' },
    { id: 'tr_ref_1', name: '武器職人の友人', req: { 'refine_count': 5 }, bonus: { atk: 15 }, desc: '強化5回: ATK+15' },
    { id: 'tr_ref_2', name: '鍛冶屋の旦那', req: { 'refine_count': 25 }, bonus: { atk: 100 }, desc: '強化25回: ATK+100' },
    { id: 'tr_ref_3', name: '伝説の鍛冶師', req: { 'refine_count': 100 }, bonus: { atkPct: 0.5 }, desc: '強化100回: ATK+50%' },
    { id: 'tr_ref_4', name: '神の槌を持つ者', req: { 'refine_count': 500 }, bonus: { atkPct: 2.0 }, desc: '強化500回: ATK+200%' },

    // --- Social/Merc Series (11) ---
    { id: 'so_merc_1', name: '孤独じゃない', req: { 'party_size': 1 }, bonus: { hp: 50 }, desc: '仲間1人: HP+50' },
    { id: 'so_merc_2', name: 'リーダーの資質', req: { 'party_size': 3 }, bonus: { atk: 30, def: 30 }, desc: '仲間3人: ATK/DEF+30' },
    { id: 'so_hire_1', name: '人たらし', req: { 'total_hired': 5 }, bonus: { goldPct: 0.05 }, desc: '雇用5回: Gold+5%' },
    { id: 'so_hire_2', name: '傭兵王', req: { 'total_hired': 20 }, bonus: { goldPct: 0.2 }, desc: '雇用20回: Gold+20%' },
    { id: 'so_hire_3', name: '千両役者', req: { 'total_hired': 100 }, bonus: { goldPct: 0.5 }, desc: '雇用100回: Gold+50%' },
    { id: 'so_time_1', name: '駆け出しの旅', req: { 'total_kills': 100 }, bonus: { expPct: 0.05 }, desc: '100体撃破: EXP+5%' },
    { id: 'so_time_2', name: 'ベテラン冒険者', req: { 'total_kills': 1000 }, bonus: { expPct: 0.15 }, desc: '1000体撃破: EXP+15%' },
    { id: 'so_time_3', name: '不眠不休', req: { 'total_kills': 10000 }, bonus: { expPct: 0.5 }, desc: '10000体撃破: EXP+50%' },
    { id: 'so_time_4', name: '時の支配者', req: { 'total_kills': 100000 }, bonus: { expPct: 2.0 }, desc: '100000体撃破: EXP+200%' },
    { id: 'so_boss_1', name: '強敵への挑戦', req: { 'total_boss_kills': 10 }, bonus: { atk: 50 }, desc: 'ボス10体: ATK+50' },
    { id: 'so_boss_2', name: '覇王を討つ者', req: { 'total_boss_kills': 100 }, bonus: { atkPct: 0.5 }, desc: 'ボス100体: ATK+50%' }
];

const CLASSES = {
    novice: { name: "見習い", hpPerLvl: 5, atkPerLvl: 1, defPerLvl: 0.5, atkMult: 1.0, defMult: 1.0, hpMult: 1.0, image: "hero.png", skills: [ { id: 'bash', name: 'バッシュ', unlockLvl: 1, mult: 1.5, cd: 3, desc: '1.5倍ダメ' } ] },
    warrior: { name: "戦士", req: { novice: 10 }, hpPerLvl: 8, atkPerLvl: 2, defPerLvl: 1, atkMult: 1.2, defMult: 1.1, hpMult: 1.1, image: "hero_warrior.png", skills: [ { id: 'power', name: '強撃', unlockLvl: 1, mult: 2.5, cd: 4, desc: '2.5倍ダメ' } ] },
    thief: { name: "盗賊", req: { novice: 10 }, hpPerLvl: 5, atkPerLvl: 1.5, defPerLvl: 0.5, atkMult: 1.1, defMult: 0.8, hpMult: 0.9, image: "hero_thief.png", skills: [ { id: 'steal', name: 'ぶんどる', unlockLvl: 1, mult: 1.2, gold: true, cd: 4, desc: '攻撃＋G' } ] },
    knight: { name: "騎士", req: { warrior: 20 }, hpPerLvl: 12, atkPerLvl: 1, defPerLvl: 2, atkMult: 1.0, defMult: 1.5, hpMult: 1.3, image: "hero_knight.png", skills: [ { id: 'holy', name: 'ホーリー', unlockLvl: 1, mult: 1.2, heal: 0.1, cd: 5, desc: '攻撃＋回復' } ] },
    berserker: { name: "狂戦士", req: { warrior: 20 }, hpPerLvl: 6, atkPerLvl: 3, defPerLvl: 0.2, atkMult: 1.8, defMult: 0.5, hpMult: 0.8, image: "hero_berserker.png", skills: [ { id: 'blood', name: '血の渇き', unlockLvl: 1, mult: 4.0, recoil: 0.1, cd: 5, desc: '4倍ダメ(反動)' } ] },
    assassin: { name: "暗殺者", req: { thief: 30 }, hpPerLvl: 6, atkPerLvl: 4, defPerLvl: 0.5, atkMult: 2.0, defMult: 0.7, hpMult: 0.8, image: "hero_thief.png", skills: [ { id: 'assassinate', name: '暗殺', unlockLvl: 1, mult: 6.0, cd: 8, desc: '6倍ダメ' } ] },
    samurai: { name: "侍", req: { knight: 30 }, hpPerLvl: 10, atkPerLvl: 5, defPerLvl: 1, atkMult: 2.5, defMult: 1.0, hpMult: 1.0, image: "hero_warrior.png", skills: [ { id: 'slash', name: '一閃', unlockLvl: 1, mult: 3.5, cd: 4, desc: '3.5倍ダメ' } ] },
    hero: { name: "勇者", req: { novice: 50, knight: 30, assassin: 30 }, hpPerLvl: 15, atkPerLvl: 5, defPerLvl: 5, atkMult: 3.0, defMult: 2.0, hpMult: 2.0, image: "hero.png", skills: [ { id: 'excalibur', name: '聖剣の輝き', unlockLvl: 1, mult: 10.0, cd: 10, desc: '10倍ダメ' } ] }
};

const ENEMY_TYPES = [
    { name: "スライム", hpMult: 0.8, atkMult: 0.8, defMult: 0.5, element: 'water', image: "slime.png" },
    { name: "ゴブリン", hpMult: 1.0, atkMult: 1.0, defMult: 0.8, element: 'earth', image: "goblin.png" },
    { name: "ウルフ", hpMult: 0.9, atkMult: 1.2, defMult: 0.6, element: 'wind', image: "wolf.png" },
    { name: "スケルトン", hpMult: 0.8, atkMult: 1.5, defMult: 0.5, element: 'none', image: "skeleton.png" },
    { name: "オーク", hpMult: 1.5, atkMult: 1.2, defMult: 1.0, element: 'fire', image: "orc.png" },
    { name: "ガーゴイル", hpMult: 1.5, atkMult: 1.0, defMult: 2.0, element: 'earth', image: "gargoyle.png" },
    { name: "ドラゴン", hpMult: 3.0, atkMult: 2.5, defMult: 2.0, element: 'fire', image: "dragon.png" },
    { name: "ゾンビ", hpMult: 1.2, atkMult: 1.0, defMult: 0.3, element: 'earth', image: "zombie.png" },
    { name: "ゴースト", hpMult: 0.6, atkMult: 1.2, defMult: 3.0, element: 'wind', image: "ghost.png" },
    { name: "ゴーレム", hpMult: 2.5, atkMult: 1.5, defMult: 2.5, element: 'earth', image: "golem.png" },
    { name: "ヴァンパイア", hpMult: 1.5, atkMult: 2.0, defMult: 1.2, element: 'water', image: "vampire.png" },
    { name: "デーモン", hpMult: 2.0, atkMult: 2.5, defMult: 1.5, element: 'fire', image: "demon.png" },
    { name: "キマイラ", hpMult: 3.5, atkMult: 3.0, defMult: 1.5, element: 'none', image: "chimera.png" }
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
    if (currentEnemy.isBoss) { expG *= 3; goldG *= 3; state.achievements.total_boss_kills++; }
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
    
    const itemPool = {
        weapon: ["剣", "斧", "槍", "弓", "杖", "短剣", "大剣", "メイス"],
        armor: ["鎧", "ローブ", "プレートメイル", "レザーアーマー", "盾", "兜"],
        accessory: ["指輪", "アミュレット", "ベルト", "耳飾り", "腕輪"]
    };

    const type = ['weapon', 'armor', 'accessory'][randomInt(0, 2)];
    const baseName = itemPool[type][randomInt(0, itemPool[type].length - 1)];
    let rar = getRandomRarity();
    const fl = Math.max(1, floor + randomInt(-2, 2));
    
    // Quality Prefixes based on Rarity
    const qualityMap = {
      'コモン': ["ボロボロの", "普通の", "手入れされた", "ありふれた"],
      'アンコモン': ["上質な", "鋭い", "頑丈な", "磨かれた"],
      'レア': ["名工の", "魔力が宿る", "輝く", "歴戦の"],
      'エピック': ["英雄の", "幻想的な", "龍鱗の", "聖なる"],
      'レジェンダリー': ["至高の", "神話の", "虚無の", "天上の"]
    };
    const prefixes = qualityMap[rar.name];
    const p = prefixes[randomInt(0, prefixes.length - 1)];

    let baseVal = 10 * Math.pow(1.03, fl) * rar.statMult;
    const varMult = 0.9 + (Math.random() * 0.2);
    let finalVal = Math.floor(baseVal * varMult);
    
    const elemKeys = Object.keys(ELEMENTS);
    const elem = elemKeys[randomInt(0, elemKeys.length - 1)];

    let i = { id: Date.now() + randomInt(0,999), type, rarity: rar, lvl: fl, prefix: p, element: elem, name: `[Lv.${fl}] ${p}${baseName}` };
    
    if (type === 'weapon') i.atk = finalVal;
    else if (type === 'armor') i.def = finalVal;
    else { 
        if (Math.random() > 0.5) { i.atk = Math.floor(finalVal*0.4); i.def = Math.floor(finalVal*0.4); } 
        else i.hp = finalVal*5; 
    }
    
    i.value = Math.floor(finalVal * rar.statMult * 0.5);
    state.inventory.push(i); 
    state.achievements.total_loot++;
    if (rar.name === 'レア') state.achievements.loot_rare++;
    if (rar.name === 'エピック') state.achievements.loot_epic++;
    if (rar.name === 'レジェンダリー') state.achievements.loot_legendary++;
    logMessage(`${i.name} 獲得！`, "loot"); 
    updateInventoryUI();
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
    updateClassSelectorUI();
    updateHeaderUI(); updateStatusUI(); updateEquipmentUI(); updateInventoryUI(); updatePartyUI(); updateKamuiUI(); updateBattleControls(); updateEnemyHP();
    // Update Hero Sprite
    const heroSprite = document.getElementById("hero-sprite");
    if (heroSprite) heroSprite.src = "assets/" + (CLASSES[state.hero.classId]?.image || "hero.png");
}

function updateClassSelectorUI() {
    const sel = document.getElementById("hero-class-select");
    if (!sel) return;
    
    // Get unlocked jobs
    const unlocked = Object.keys(CLASSES).filter(cid => {
        const c = CLASSES[cid];
        if (!c.req) return true;
        return Object.keys(c.req).every(reqId => (state.hero.classLevels[reqId] || 1) >= c.req[reqId]);
    });

    // Only rebuild if count changed or empty
    if (sel.children.length === unlocked.length && sel.children.length > 0) return;

    sel.innerHTML = "";
    unlocked.forEach(cid => {
        const opt = document.createElement("option");
        opt.value = cid;
        opt.innerText = CLASSES[cid].name;
        opt.selected = (state.hero.classId === cid);
        sel.appendChild(opt);
    });
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
    
    // Calculate Title/Achievement requirements for "now" (ones that depend on current state, not historical)
    const checkReq = (t) => {
        return Object.keys(t.req).every(k => {
            if (k === 'floor') return state.floor >= t.req[k];
            if (k === 'gold') return state.gold >= t.req[k];
            if (k === 'kamui') return state.kamui >= t.req[k];
            if (k === 'hero_level') return state.hero.level >= t.req[k];
            if (k === 'party_size') return state.party.length >= t.req[k];
            if (k === 'class_level_sum') return Object.values(state.hero.classLevels).reduce((a,b)=>a+b, 0) >= t.req[k];
            return (state.achievements[k] || state.achievements.kills[k] || 0) >= t.req[k];
        });
    };

    // Update Title Select
    const tList = document.getElementById("title-list");
    if (tList) {
        tList.innerHTML = "";
        TITLES.forEach(t => {
            const unlocked = checkReq(t);
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
function updateEquipmentUI() { 
    for (let type of ['weapon', 'armor', 'accessory']) { 
        const el = document.getElementById(`equip-${type}`); 
        if(!el) continue; 
        const s = el.querySelector('.slot-item'); 
        const i = state.equipment[type]; 
        if (i) { 
            s.innerText = `${i.name} (${ELEMENTS[i.element]?.name || ""})`; 
            s.className = `slot-item ${i.rarity.colorClass}`; 
            el.onclick = () => openItemModal(type, true); // Open modal for equipped item
        } else { 
            s.innerText = "なし"; 
            s.className = "slot-item"; 
            el.onclick = null;
        } 
    } 
}

function updateInventoryUI() { const list = document.getElementById("inventory-list"); if(!list) return; list.innerHTML = ""; document.getElementById("inv-count").innerText = state.inventory.length; state.inventory.forEach((i, idx) => { const d = document.createElement("div"); d.className = "inv-item"; d.innerHTML = `<div class="item-name ${i.rarity.colorClass}">${i.name}</div>`; d.onclick = () => openItemModal(idx, false); list.appendChild(d); }); }

let selectedItemSource = null; // { typeOrIndex: index, isEquipped: bool }

function openItemModal(val, isEquipped = false) {
    selectedItemSource = { val, isEquipped };
    const item = isEquipped ? state.equipment[val] : state.inventory[val];
    if (!item) return;

    const mod = document.getElementById("item-modal"); if (mod) mod.classList.remove("hidden");
    const name = document.getElementById("modal-item-name"); if (name) { name.innerText = item.name; name.className = item.rarity.colorClass; }
    
    const currentEquip = state.equipment[item.type];
    const st = document.getElementById("modal-item-stats");
    let sT = `Lv.${item.lvl} / 属性: ${ELEMENTS[item.element]?.name || "無"}<br>`;
    if (item.atk) sT += `ATK: ${item.atk} `; if (item.def) sT += `DEF: ${item.def} `; if (item.hp) sT += `HP: ${item.hp} `;
    if (st) st.innerHTML = sT;

    const compEl = document.getElementById("modal-item-compare");
    if (compEl) {
        if (isEquipped) {
            compEl.innerHTML = "<div class='compare-up'>装備中</div>";
        } else if (!currentEquip) {
            compEl.innerHTML = "<div class='compare-up'>新規装備</div>";
        } else {
            let ds = []; ['atk', 'def', 'hp'].forEach(k => {
                let d = (item[k]||0)-(currentEquip[k]||0); if(d!==0) ds.push(`${k.toUpperCase()}: <span class="${d>0?'compare-up':'compare-down'}">${d>0?'+':''}${d}</span>`);
            });
            compEl.innerHTML = ds.length>0 ? `比較:<br>${ds.join("<br>")}` : "性能差なし";
        }
    }
    
    // Equip/Unequip Button
    const eqBtn = document.getElementById("btn-equip-item");
    if (eqBtn) {
        eqBtn.innerText = isEquipped ? "外す" : "装備する";
        eqBtn.onclick = () => {
            if (isEquipped) {
                // Unequip: check capacity
                if (state.inventory.length >= state.maxInventory) { alert("インベントリがいっぱいです！"); return; }
                state.inventory.push(state.equipment[val]);
                state.equipment[val] = null;
            } else {
                // Equip
                if (state.equipment[item.type]) state.inventory.push(state.equipment[item.type]);
                state.equipment[item.type] = item;
                state.inventory.splice(val, 1);
            }
            closeItemModal(); updateAllUI(); saveGame();
        };
    }

    // Sell Button logic
    const sellBtn = document.getElementById("btn-sell-item");
    if (sellBtn) {
        sellBtn.disabled = isEquipped; // Cannot sell equipped items directly
        sellBtn.onclick = () => {
            if (!isEquipped) {
                state.gold += item.value;
                state.inventory.splice(val, 1);
                closeItemModal(); updateAllUI(); saveGame();
            }
        };
    }
    
    // Refining
    const refineBtn = document.getElementById("btn-refine-item");
    if (refineBtn) {
        const cost = Math.floor(100 * Math.pow(1.2, item.lvl));
        refineBtn.innerText = `強化する (${cost}G)`;
        refineBtn.onclick = () => {
            if (state.gold >= cost) {
                state.gold -= cost; state.achievements.gold_spent += cost; item.lvl++;
                state.achievements.refine_count++;
                if (item.atk) item.atk = Math.floor(item.atk * 1.1);
                if (item.def) item.def = Math.floor(item.def * 1.1);
                if (item.hp) item.hp = Math.floor(item.hp * 1.1);
                item.name = item.name.replace(/\[Lv\.\d+\]/, `[Lv.${item.lvl}]`);
                saveGame(); openItemModal(val, isEquipped); updateAllUI();
            } else alert("ゴールドが足りません！");
        };
    }
}

function closeItemModal() {
    const mod = document.getElementById("item-modal");
    if (mod) mod.classList.add("hidden");
}

function updatePartyUI() {
    const plist = document.getElementById("party-list"); if(!plist) return; plist.innerHTML = state.party.length === 0 ? "<p class='item-stats'>なし</p>" : "";
    state.party.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} Lv.${m.level}</div><button class="btn-sm" onclick="window.dismissMercenary(${i})">解雇</button>`; plist.appendChild(d); });
    const tlist = document.getElementById("tavern-list"); if(tlist) { tlist.innerHTML = availableMercs.length === 0 ? "<p class='item-stats'>なし</p>" : ""; availableMercs.forEach((m, i) => { const d = document.createElement("div"); d.className = "merc-item"; d.innerHTML = `<div>${m.name} (${m.price}G)</div><button class="btn-sm" onclick="window.hireMercenary(${i})">雇用</button>`; tlist.appendChild(d); }); }
}

function updateKamuiUI() {
    const gainEl = document.getElementById("kamui-gain-amount");
    if (gainEl) {
        const g = Math.floor(state.floor / 5);
        gainEl.innerText = g;
    }

    const ulist = document.getElementById("kamui-upgrades"); if(!ulist) return; ulist.innerHTML = `
        <div class="upgrade-item"><div>経験値+20% (Lv.${state.kamuiUpgrades.expBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('expBonus')">強化</button></div>
        <div class="upgrade-item"><div>G+20% (Lv.${state.kamuiUpgrades.goldBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('goldBonus')">強化</button></div>
        <div class="upgrade-item"><div>ドロップ+25% (Lv.${state.kamuiUpgrades.dropRateBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('dropRateBonus')">強化</button></div>
        <div class="upgrade-item"><div>ステ+10% (Lv.${state.kamuiUpgrades.statsBonus})</div><button class="btn-sm" onclick="window.buyKamuiUpgrade('statsBonus')">強化</button></div>
    `;
}

function logMessage(m, t = "normal") {
    const log = document.getElementById("battle-log");
    if (!log) return;
    const d = document.createElement("div");
    d.className = `log-entry ${t}`;
    d.innerText = m;
    log.appendChild(d);
    if (log.children.length > 30) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
}

function hireMercenary(i) { if (state.party.length >= 3) return; const m = availableMercs[i]; if (state.gold >= m.price) { state.gold -= m.price; state.achievements.gold_spent += m.price; state.achievements.total_hired++; state.party.push({...m}); availableMercs.splice(i, 1); updateAllUI(); saveGame(); } }
function dismissMercenary(i) { if (confirm("解雇しますか?")) { state.party.splice(i, 1); updatePartyUI(); saveGame(); } }
function buyKamuiUpgrade(t) { const c = t === 'statsBonus' ? 3 : (t === 'dropRateBonus' ? 2 : 1); if (state.kamui >= c) { state.kamui -= c; state.kamuiUpgrades[t]++; updateAllUI(); saveGame(); } }
function doPrestige() {
    const g = Math.floor(state.floor / 5); if (g < 2) { alert("10階以上進む必要があります！"); return; }
    if (confirm(`${g} 神威を得て転生しますか？`)) {
        state.kamui += g; state.achievements.prestige_count++; state.floor = 1; state.hero.level = 1; state.hero.exp = 0; state.hero.nextExp = 10;
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

function sellWeakerItems() {
    let goldGained = 0;
    let itemsToKeep = [];
    state.inventory.forEach(item => {
        const current = state.equipment[item.type];
        if (!current) {
            itemsToKeep.push(item);
            return;
        }
        
        let isWeaker = false;
        if (item.type === 'weapon') {
            if ((item.atk || 0) < (current.atk || 0)) isWeaker = true;
        } else if (item.type === 'armor') {
            if ((item.def || 0) < (current.def || 0)) isWeaker = true;
        } else {
            // Accessory: compare sum of stats
            const itemSum = (item.atk || 0) + (item.def || 0) + (item.hp || 0) / 5;
            const currentSum = (current.atk || 0) + (current.def || 0) + (current.hp || 0) / 5;
            if (itemSum < currentSum) isWeaker = true;
        }

        if (isWeaker) {
            goldGained += item.value;
        } else {
            itemsToKeep.push(item);
        }
    });

    if (goldGained > 0) {
        state.inventory = itemsToKeep;
        state.gold += goldGained;
        logMessage(`弱い装備を売却し ${goldGained} G獲得！`, "system");
        updateAllUI();
        saveGame();
    } else {
        alert("売却できる弱い装備はありません。");
    }
}

function exportSaveCode() {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    const area = document.getElementById("save-code-area");
    if (area) {
        area.value = code;
        area.select();
        document.execCommand("copy");
        alert("セーブコードをクリップボードにコピーしました！\nこのコードをメモ帳などに保存してください。");
    }
}

function importSaveCode() {
    const code = document.getElementById("save-code-area").value.trim();
    if (!code) { alert("コードを入力してください。"); return; }
    try {
        const decoded = JSON.parse(decodeURIComponent(escape(atob(code))));
        if (confirm("データを上書きして読み込みますか？")) {
            state = deepMerge(getInitialState(), decoded);
            saveGame(); updateAllUI();
            alert("データを読み込みました！");
        }
    } catch (e) {
        alert("無効なセーブコードです。");
    }
}

function resetGame() {
    if (confirm("全てのデータを削除して最初からやり直しますか？\nこの操作は取り消せません。")) {
        localStorage.removeItem(SAVE_KEY);
        location.reload();
    }
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
    const sellW=document.getElementById("btn-sell-weaker"); if(sellW) sellW.onclick = sellWeakerItems;
    const sellA=document.getElementById("btn-sell-all"); if(sellA) sellA.onclick = () => { let g = 0; let n = []; state.inventory.forEach(i => { if (i.rarity.name === 'コモン') g += i.value; else n.push(i); }); if (g > 0) { state.inventory = n; state.gold += g; updateAllUI(); saveGame(); } };
    const clM=document.getElementById("btn-close-modal"); if(clM) clM.onclick = () => { const m=document.getElementById("item-modal"); if(m) m.classList.add("hidden"); };
    const eqI=document.getElementById("btn-equip-item"); if(eqI) eqI.onclick = () => { const i = state.inventory[selectedItemIndex]; if (state.equipment[i.type]) state.inventory.push(state.equipment[i.type]); state.equipment[i.type] = i; state.inventory.splice(selectedItemIndex, 1); const m=document.getElementById("item-modal"); if(m) m.classList.add("hidden"); updateAllUI(); saveGame(); };
    const slI=document.getElementById("btn-sell-item"); if(slI) slI.onclick = () => { state.gold += state.inventory[selectedItemIndex].value; state.inventory.splice(selectedItemIndex, 1); const m=document.getElementById("item-modal"); if(m) m.classList.add("hidden"); updateAllUI(); saveGame(); };
    const cSel=document.getElementById("hero-class-select"); if(cSel) cSel.onchange = (e) => { state.hero.classId = e.target.value; updateAllUI(); saveGame(); };
    const prst=document.getElementById("btn-prestige"); if(prst) prst.onclick = doPrestige;
    
    // System events
    const expCode=document.getElementById("btn-export-code"); if(expCode) expCode.onclick = exportSaveCode;
    const impCode=document.getElementById("btn-import-code"); if(impCode) impCode.onclick = importSaveCode;
    const rstG=document.getElementById("btn-reset-game"); if(rstG) rstG.onclick = resetGame;

    loadGame(); startBattle();
});

window.hireMercenary = hireMercenary; window.dismissMercenary = dismissMercenary; window.buyKamuiUpgrade = buyKamuiUpgrade;
