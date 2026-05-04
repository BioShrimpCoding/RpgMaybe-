                                                                                // --- UTILITIES ---
let currentSeed = null;
let dailyMode = false;
let weeklyMode = false;
let activeCompanion = null;
let lastRunSummary = null;

let reputation = {
    merchant: 0,
    facility: 0,
    dungeon: 0,
    bio: 0,
    void: 0
};

let challengeModifiers = {
    glassCannon: false,
    bountyHunter: false,
    hazardSurge: false,
    eliteThreat: false,
    permadeath: false
};

let pendingRoomEvent = null;
let activeRelics = [];
let relicFlags = { phoenixUsed: false };
let challengeMission = {
    featuredClass: null,
    weights: { distance: 10, credits: 1, kills: 0, bosses: 0, speedBonus: 0 }
};

let printQueue = [];
let isPrinting = false;

function seededRandom() {
    if (!currentSeed) return Math.random();
    //Simple seeded RNG
    let x = Math.sin(currentSeed) * 10000;
    currentSeed += 1;
    return x - Math.floor(x);
}

function getRandom(array) {
    const randomFunc = currentSeed !== null ? seededRandom : Math.random;
    return array[Math.floor(randomFunc() * array.length)];
}

function getDailyChallengeSeed() {
    let today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

// === COLOR SYSTEM ===
const colorSchemes = {
    'terminal-green': { common: '#0f0', uncommon: '#0ff', rare: '#00f', epic: '#f0f', legendary: '#ff0' },
    'cyberpunk': { common: '#fff', uncommon: '#0ff', rare: '#ff0', epic: '#f0f', legendary: '#ff4444' },
    'monochrome': { common: '#aaa', uncommon: '#ccc', rare: '#eee', epic: '#fff', legendary: '#fff' }
};

function applyRarityColor(text, rarity) {
    if (!rarity || !gameSettings.colorScheme) return text;
    let scheme = colorSchemes[gameSettings.colorScheme];
    if (!scheme || !scheme[rarity]) return text;
    return `<span style="color:${scheme[rarity]}">${text}</span>`;
}

// --- GAME STATE VARIABLES ---
let gameState = "BOOTING"; 
let inventory = [{ name: "health potion", rarity: "common" }, { name: "scrap metal", rarity: "common" }]; 
let credits = 0; 
let playerX = 0;
let playerY = 0;
let worldMap = {};

// === GAME SETTINGS ===
let gameSettings = {
    difficulty: 'NORMAL', // EASY, NORMAL, HARD, INSANE
    textSpeed: 25, // ms per character
    colorScheme: 'terminal-green', // terminal-green, cyberpunk, monochrome
    colorblindMode: 'normal', // normal, deuteranopia, protanopia, tritanopia
    showTooltips: true,
    autoSave: true,
    autoPickup: 'off', // off, common, all
    permadeath: false
};

// === DIFFICULTY MULTIPLIERS ===
const difficultyScaling = {
    'EASY': { enemyHP: 0.6, enemyDamage: 0.7, lootBonus: 1.3, xpMultiplier: 0.8 },
    'NORMAL': { enemyHP: 1.0, enemyDamage: 1.0, lootBonus: 1.0, xpMultiplier: 1.0 },
    'HARD': { enemyHP: 1.5, enemyDamage: 1.3, lootBonus: 0.8, xpMultiplier: 1.3 },
    'INSANE': { enemyHP: 2.2, enemyDamage: 1.8, lootBonus: 0.6, xpMultiplier: 1.8 }
};

const coreDistanceRanges = {
    EASY: { min: 70, max: 110 },
    NORMAL: { min: 130, max: 180 },
    HARD: { min: 200, max: 260 },
    INSANE: { min: 280, max: 360 }
};

function generateVictoryCoordinates(difficulty) {
    const range = coreDistanceRanges[difficulty] || coreDistanceRanges.NORMAL;
    const totalDistance = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
    const split = Math.max(1, Math.min(totalDistance - 1, Math.floor(Math.random() * (totalDistance - 1)) + 1));
    const signX = Math.random() < 0.5 ? 1 : -1;
    const signY = Math.random() < 0.5 ? 1 : -1;

    return {
        x: signX * split,
        y: signY * (totalDistance - split),
        distance: totalDistance
    };
}

// === TEMPORARY BUFFS SYSTEM ===
let activeBuffs = {}; // { buffName: { duration, effect, value } }
let combatLog = []; // Track last 50 combat actions 

// Victory coordinates and endgame state (generated at start of PLAYING)
let victoryX = null;
let victoryY = null;
let omegaDefeated = false;
let runStartTime = null;
let bossesEncountered = {}; // Track which bosses have been fought

// Track current save slot for deletion on death
let currentSaveSlot = null;

// Player starts with weak baseline stats, class selection adds to them
let player = {
    level: 1,
    hp: 10, maxHp: 10,
    mp: 5, maxMp: 5,
    baseAttack: 1, attack: 1,
    baseDefense: 0, defense: 0,
    xp: 0, xpNeeded: 20,
    knownRecipes: ["medkit", "rusty club"],
    status: null,
    statusEffects: {},
    equipped: { weapon: null, armor: null, weaponEffect: null, armorEffect: null },
    activeQuests: [],
    skills: [],
    class: null,
    tempDefense: 0,
    skillCooldowns: {},
    guardStance: 0
};

let currentEnemy = null;
let itemEffects = {}; // Maps item names to their special effects
let turretsCooldown = 0; // Tracks how many turns turrets are disabled
let hullBreachTurns = 0; // Turns until hull breach damage

// === STATS TRACKING ===
let gameStats = {
    totalRuns: 0,
    totalKills: 0,
    itemsCrafted: 0,
    distanceTraveled: 0,
    damageDealt: 0,
    damageTaken: 0,
    itemsPickedUp: 0,
    bossesFought: 0,
    bossesDefeated: 0,
    fastestRun: Infinity,
    longestRun: 0,
    bestCombo: 0,
    highestDamageHit: 0,
    secretRoomsFound: 0,
    companionsSummoned: 0,
    hazardsTriggered: 0,
    bossVariantsDefeated: 0,
    autoPickedUp: 0,
    eventsTriggered: 0,
    relicsFound: 0,
    miniBossesDefeated: 0
};

// === LEADERBOARD ===
let leaderboard = {
    topScores: [], // { score, kills, difficulty, runTime }
    topCombo: [],
    topDistance: [],
    maxSize: 10,
    currentRunRecorded: false
};

// === ACHIEVEMENTS ===
let achievements = {
    firstBlood: false,
    fiftyKills: false,
    hundredKills: false,
    distanceRunner: false,
    craftMaster: false,
    omegaSlayer: false,
    nocturnal: false,
    collector: false,
    survivor: false,
    magicUser: false
};

// === COMBAT METRICS ===
let comboCounter = 0; // Current hit combo
let maxCombo = 0; // Highest combo achieved
let lastDamageType = null; // Track for type advantage
let damageTypeMultiplier = 1; // Current damage multiplier based on types

// === DAMAGE TYPES ===
const damageTypes = {
    fire: { color: '🔥', weakness: 'ice', advantage: 'bio' },
    ice: { color: '❄️', weakness: 'fire', advantage: 'none' },
    electric: { color: '⚡', weakness: 'none', advantage: 'mechanical' },
    mechanical: { color: '⚙️', weakness: 'electric', advantage: 'none' },
    bio: { color: '🧬', weakness: 'fire', advantage: 'none' },
    void: { color: '🌑', weakness: 'none', advantage: 'none' }
};

// Assign damage types to weapons
let weaponDamageTypes = {};

// === ENCHANTMENT SYSTEM ===
let enchantments = {
    fire: { level: 0, maxLevel: 3, cost: ['fire crystal', 'flame essence'] },
    ice: { level: 0, maxLevel: 3, cost: ['frost core', 'ice shard'] },
    electric: { level: 0, maxLevel: 3, cost: ['energy cell', 'plasma core'] },
    life: { level: 0, maxLevel: 2, cost: ['blood crystal', 'life root'] },
    void: { level: 0, maxLevel: 2, cost: ['void essence', 'dark matter'] }
};

let enhancedItems = {}; // Maps item names to enhancement level

// === BIOME MECHANICS ===
let currentBiome = 'facility';
let biomeEffects = {
    facility: { damageBonus: 'electric', lootBonus: 0.1 },
    dungeon: { damageBonus: 'fire', lootBonus: 0.05 },
    bio: { damageBonus: 'bio', lootBonus: 0.15 },
    void: { damageBonus: 'void', lootBonus: 0.2 }
};

// === FAST TRAVEL SYSTEM ===
let discoveredPortals = {}; // { biome: true/false }
let unlockedFastTravel = false;
let portalLocations = {
    facility: { x: 0, y: 0, desc: "Central Hub - Starting Point" },
    dungeon: { x: 50, y: 50, desc: "Ancient Crypts" },
    bio: { x: -75, y: 75, desc: "Bio-Mutation Labs" },
    void: { x: 150, y: -150, desc: "Reality Rift" }
};

// === TRADING SYSTEM ===
let merchantInventory = [];
let merchantPrices = {};
let playerCreditsSpent = 0;
let playerItemsSold = 0;

// Initialize merchant inventory with varied goods
function initMerchantInventory() {
    merchantInventory = [
        { name: 'health potion', price: 25, rarity: 'common', stock: 10 },
        { name: 'mana potion', price: 30, rarity: 'common', stock: 8 },
        { name: 'antidote', price: 35, rarity: 'common', stock: 5 },
        { name: 'magic crystal', price: 150, rarity: 'rare', stock: 2 },
        { name: 'energy cell', price: 100, rarity: 'uncommon', stock: 4 },
        { name: 'plasma core', price: 200, rarity: 'rare', stock: 1 },
        { name: 'sealant', price: 50, rarity: 'uncommon', stock: 3 }
    ];
}

// === QUEST CHAIN SYSTEM ===
let questChains = {
    'rescue': {
        id: 'rescue',
        title: 'Rescue Mission',
        stages: [
            { stage: 1, objective: 'Find the security officer', npc: 'Security Officer', requires: null, reward: 50 },
            { stage: 2, objective: 'Recover the access card', npc: 'Access Terminal', requires: 'rescue_1', reward: 100 },
            { stage: 3, objective: 'Reach the evacuation point', npc: 'Exit Hatch', requires: 'rescue_2', reward: 200 }
        ],
        currentStage: 0,
        completed: false
    },
    'corruption': {
        id: 'corruption',
        title: 'Stop the Corruption',
        stages: [
            { stage: 1, objective: 'Investigate bio-anomalies', npc: 'Lab Chief', requires: null, reward: 75 },
            { stage: 2, objective: 'Eliminate infected hosts', npc: 'any', requires: 'corruption_1', reward: 150 },
            { stage: 3, objective: 'Purify the mutation core', npc: 'Core', requires: 'corruption_2', reward: 300 }
        ],
        currentStage: 0,
        completed: false
    },
    'power': {
        id: 'power',
        title: 'Restore Power Systems',
        stages: [
            { stage: 1, objective: 'Find the reactor control', npc: 'Engineer', requires: null, reward: 60 },
            { stage: 2, objective: 'Collect power cells', npc: 'any', requires: 'power_1', reward: 120 },
            { stage: 3, objective: 'Reactivate the main grid', npc: 'Control Panel', requires: 'power_2', reward: 250 }
        ],
        currentStage: 0,
        completed: false
    }
};

let activeQuestChains = []; // Currently active quest chains

// === NEW GAME+ SYSTEM ===
let newGamePlusLevel = 0; // Current NG+ level (0 = fresh start)
let carryoverStats = {
    level: 0,
    baseAttack: 0,
    baseDefense: 0,
    knownRecipes: [],
    achievements: {}
};

function initNewGamePlus() {
    if (newGamePlusLevel > 0) {
        // Carry over stats to new run
        player.level = Math.max(1, Math.floor(carryoverStats.level * 0.75)); // 75% of previous level
        player.baseAttack = carryoverStats.baseAttack;
        player.baseDefense = carryoverStats.baseDefense;
        player.knownRecipes = [...carryoverStats.knownRecipes];
        achievements = JSON.parse(JSON.stringify(carryoverStats.achievements));
        
        // Add difficulty scaling
        let difficultyMultiplier = 1 + (newGamePlusLevel * 0.3); // Each NG+ = 30% harder
        printToTerminal(`🌟 NEW GAME+ LEVEL ${newGamePlusLevel} - Enemies are ${Math.round(difficultyMultiplier * 100)}% stronger!`);
    }
}

function getNGPlusDifficultyMultiplier() {
    return 1 + (newGamePlusLevel * 0.3);
}

// === SEED TRACKING ===
let previousSeeds = []; // Track last 10 seeds 

const relicCatalog = [
    { id: 'wardrum', name: 'War Drum', desc: '+20% attack damage' },
    { id: 'bulwark', name: 'Bulwark Idol', desc: '+2 defense' },
    { id: 'vampcharm', name: 'Vampire Charm', desc: 'Heal 2 HP on hit' },
    { id: 'luckycog', name: 'Lucky Cog', desc: 'Better loot rarity' },
    { id: 'bountychip', name: 'Bounty Chip', desc: '+25% credits from kills' },
    { id: 'mirrorshard', name: 'Mirror Shard', desc: '10% chance to dodge hits' },
    { id: 'stormbattery', name: 'Storm Battery', desc: 'Spells cost 2 less MP (min 1)' },
    { id: 'phoenixash', name: 'Phoenix Ash', desc: 'Survive one lethal hit per run' }
];

const roomMutators = [
    { id: 'no-healing', label: 'No-Healing Zone', desc: 'Healing items and heal spells fail here.' },
    { id: 'arcane-surge', label: 'Arcane Surge', desc: 'Spells deal more damage but cost more MP.' },
    { id: 'fog', label: 'Dense Fog', desc: 'Physical attacks are less accurate. Escape is easier.' },
    { id: 'volatile', label: 'Volatile Chamber', desc: 'Both sides deal more damage.' }
];

function hasRelic(relicId) {
    return activeRelics.some(r => r.id === relicId);
}

function giveRelic(preferredId = null) {
    let pool = relicCatalog.filter(r => !hasRelic(r.id));
    if (pool.length === 0) {
        credits += 75;
        return printToTerminal('🧿 Relic cache was empty. You salvage 75 credits instead.');
    }

    let chosen = preferredId ? pool.find(r => r.id === preferredId) : null;
    if (!chosen) chosen = getRandom(pool);
    activeRelics.push(chosen);
    gameStats.relicsFound++;
    printToTerminal(`🧿 RELIC ACQUIRED: ${chosen.name} - ${chosen.desc}`);
}

function getRelicAttackMultiplier() {
    return hasRelic('wardrum') ? 1.2 : 1;
}

function getRelicDefenseBonus() {
    return hasRelic('bulwark') ? 2 : 0;
}

function getRelicCreditMultiplier() {
    return hasRelic('bountychip') ? 1.25 : 1;
}

function getRelicLootBonus() {
    return hasRelic('luckycog') ? 2 : 0;
}

function getSpellCost(baseCost) {
    if (hasRelic('stormbattery')) return Math.max(1, baseCost - 2);
    return baseCost;
}

function getRoomMutator() {
    let room = worldMap[`${playerX},${playerY}`];
    return room ? room.mutator : null;
}

function getFactionEnemyMultiplier(theme) {
    let score = reputation[theme] || 0;
    if (score >= 10) return 0.9;
    if (score <= -10) return 1.2;
    if (score <= -4) return 1.1;
    return 1;
}

function getFactionLootMultiplier(theme) {
    let score = reputation[theme] || 0;
    if (score >= 10) return 1.2;
    if (score >= 4) return 1.1;
    if (score <= -10) return 0.85;
    return 1;
}

function generateEnemyIntent(enemy) {
    if (!enemy) return null;
    let intents = [
        { id: 'strike', telegraph: 'The enemy studies your movements.', power: 1.0 },
        { id: 'heavy', telegraph: 'The enemy is charging a heavy hit!', power: 1.45 },
        { id: 'poison', telegraph: 'You smell toxin in the air. A poison strike is coming.', power: 0.95 },
        { id: 'guardbreak', telegraph: 'The enemy shifts low, preparing to break defenses.', power: 1.2 }
    ];
    enemy.intent = getRandom(intents);
    enemy.intentShown = false;
    return enemy.intent;
}

function announceEnemyIntent(enemy) {
    if (!enemy || !enemy.intent || enemy.intentShown) return;
    enemy.intentShown = true;
    printToTerminal(`👁️ Enemy Intent: ${enemy.intent.telegraph}`);
}

function tryCreateRoomEvent(room) {
    if (!room || room.enemy || room.isShop || pendingRoomEvent) return;
    if (Math.random() > 0.14) return;

    let eventPool = [
        {
            id: 'supply-cache',
            title: 'Supply Cache',
            text: 'You find a locked cache. [1] Force it open (take damage, better loot) [2] Open carefully (small loot)',
            choices: {
                '1': () => {
                    let dmg = 5 + Math.floor(Math.random() * 5);
                    player.hp -= dmg;
                    addToInventory(getRandom(allMaterials), 'uncommon');
                    addToInventory(getRandom(allMaterials), 'common');
                    printToTerminal(`The cache explodes open. You take ${dmg} damage but recover extra materials.`);
                    if (player.hp <= 0) playerDeath('YOU BLED OUT OPENING A SUPPLY CACHE.');
                },
                '2': () => {
                    addToInventory(getRandom(allMaterials), 'common');
                    printToTerminal('You open the cache safely and recover a useful material.');
                }
            }
        },
        {
            id: 'stray-merchant',
            title: 'Wandering Trader',
            text: 'A stray trader offers a fast deal. [1] Pay 40 credits for a random relic [2] Decline',
            choices: {
                '1': () => {
                    if (credits < 40) return printToTerminal('Not enough credits. The trader leaves.');
                    credits -= 40;
                    giveRelic();
                    adjustReputation('merchant', 1);
                },
                '2': () => {
                    printToTerminal('You pass on the offer and move on.');
                }
            }
        },
        {
            id: 'power-node',
            title: 'Unstable Power Node',
            text: 'A sparking node hums nearby. [1] Drain it (gain MP) [2] Overload it (room hazard removed, gain credits)',
            choices: {
                '1': () => {
                    let gain = 8 + Math.floor(Math.random() * 8);
                    player.mp = Math.min(player.maxMp, player.mp + gain);
                    printToTerminal(`Energy floods your system. +${gain} MP.`);
                },
                '2': () => {
                    room.hazard = null;
                    credits += 30;
                    printToTerminal('You overload the node. The room stabilizes and you salvage 30 credits.');
                }
            }
        }
    ];

    pendingRoomEvent = getRandom(eventPool);
    gameStats.eventsTriggered++;
    printToTerminal(`🎲 EVENT: ${pendingRoomEvent.title}`);
    printToTerminal(pendingRoomEvent.text);
    printToTerminal("Type 'event 1' or 'event 2'.");
}

function resolveRoomEvent(choice) {
    if (!pendingRoomEvent) return printToTerminal('No active event to resolve.');
    let fn = pendingRoomEvent.choices[choice];
    if (!fn) return printToTerminal("Choose a valid event option (e.g., 'event 1').");
    fn();
    pendingRoomEvent = null;
}

function showRelics() {
    if (activeRelics.length === 0) return printToTerminal('No relics yet. Defeat bosses or win event trades to find one.');
    printToTerminal('=== ACTIVE RELICS ===');
    activeRelics.forEach(r => printToTerminal(`${r.name}: ${r.desc}`));
}

function calculateChallengeScore() {
    let runTime = Math.max(1, getRunTimeSeconds());
    let speedBonus = challengeMission.weights.speedBonus > 0 ? Math.floor(challengeMission.weights.speedBonus * (600 / runTime)) : 0;
    return {
        distance: gameStats.distanceTraveled * (challengeMission.weights.distance || 0),
        credits: credits * (challengeMission.weights.credits || 0),
        kills: gameStats.totalKills * (challengeMission.weights.kills || 0),
        bosses: gameStats.bossesDefeated * (challengeMission.weights.bosses || 0),
        speed: speedBonus
    };
}

// ==========================================
// --- PROCEDURAL DATA GENERATION ---
// ==========================================

let weaponStats = {};
let armorStats = {};
let masterRecipes = { 
    "medkit": ["health potion", "scrap metal"],
    "rusty club": ["wood", "scrap metal"],
    "advanced medkit": ["medkit", "plasma core"],
    "mana battery": ["energy cell", "magic crystal"],
    "steel plate": ["steel ingot", "scrap metal"]
};
let allMaterials = ["health potion", "mana potion", "antidote", "rusty key", "keycard", "system map", "sealant", "blood crystal", "mirror crystal", "morphic gel"]; 
let allBlueprints = [];

// Enemy abilities per type
let enemyAbilities = {
    'Cybernetic': { ability: 'scan', dmgBonus: 3 },
    'Elite': { ability: 'bash', dmgBonus: 5 },
    'Nano': { ability: 'swarm', dmgBonus: 2, hits: 2 },
    'Rogue': { ability: 'evade', dodgeChance: 0.15 }
};

// 1. GENERATE 100 WEAPONS with special effects
const prefixes = [
    { name: "rusty", bonus: 0, mat: "scrap metal", effect: null },
    { name: "bone", bonus: 1, mat: "bone", effect: null },
    { name: "iron", bonus: 3, mat: "iron ore", effect: null },
    { name: "steel", bonus: 5, mat: "steel ingot", effect: null },
    { name: "vampire", bonus: 7, mat: "blood crystal", effect: "vampiric" }, // Heals 30% of damage dealt
    { name: "laser", bonus: 7, mat: "laser lens", effect: null },
    { name: "overclocked", bonus: 12, mat: "plasma core", effect: "overclocked" }, // +5 damage but costs 3 MP per attack
    { name: "plasma", bonus: 10, mat: "plasma core", effect: null },
    { name: "crystal", bonus: 12, mat: "magic crystal", effect: null },
    { name: "dragon", bonus: 15, mat: "dragon scale", effect: "dragonborn" }, // +2 attack per level
    { name: "void", bonus: 20, mat: "void essence", effect: "lifesteal" }, // Heals 50% of damage dealt
    { name: "quantum", bonus: 25, mat: "dark matter", effect: "chaos" } // Random damage multiplier (0.5x to 2x)
];

// Armor effect prefixes
const armorEffectPrefixes = [
    { name: "reinforced", bonus: 3, mat: "steel ingot", effect: "armored" }, // +2 defense, -10% evade chance
    { name: "agile", bonus: 2, mat: "leather", effect: "evasive" }, // +20% dodge chance
    { name: "reflective", bonus: 4, mat: "mirror crystal", effect: "reflect" }, // 15% reflect damage back
    { name: "adaptive", bonus: 3, mat: "morphic gel", effect: "adaptive" } // Defense scales with enemy damage
];

const weaponBases = [
    { name: "club", stat: 2, mat: "wood" }, { name: "dagger", stat: 3, mat: "leather" },
    { name: "sword", stat: 4, mat: "iron ore" }, { name: "spear", stat: 5, mat: "wood" },
    { name: "axe", stat: 6, mat: "scrap metal" }, { name: "hammer", stat: 7, mat: "heavy stone" },
    { name: "blaster", stat: 6, mat: "circuit board" }, { name: "rifle", stat: 8, mat: "energy cell" },
    { name: "cannon", stat: 12, mat: "steel piping" }, { name: "staff", stat: 5, mat: "magic wood" }
];

// GENERATE 100 ARMOR PIECES
const armorBases = [
    { name: "rags", stat: 1, mat: "cloth" }, { name: "leather", stat: 2, mat: "leather" },
    { name: "chainmail", stat: 4, mat: "iron ore" }, { name: "plate", stat: 6, mat: "steel ingot" },
    { name: "exosuit", stat: 8, mat: "circuit board" }, { name: "shield", stat: 3, mat: "wood" },
    { name: "helmet", stat: 2, mat: "scrap metal" }, { name: "boots", stat: 1, mat: "leather" },
    { name: "gauntlets", stat: 2, mat: "iron ore" }, { name: "forcefield", stat: 10, mat: "energy cell" }
];

prefixes.forEach(prefix => {
    weaponBases.forEach(base => {
        let wName = `${prefix.name} ${base.name}`;
        weaponStats[wName] = base.stat + prefix.bonus;
        if(prefix.effect) itemEffects[wName] = prefix.effect;
        masterRecipes[wName] = [prefix.mat, base.mat];
        allBlueprints.push(`${wName} blueprint`);
        if(!allMaterials.includes(prefix.mat)) allMaterials.push(prefix.mat);
        if(!allMaterials.includes(base.mat)) allMaterials.push(base.mat);
    });
});

// Add armor with effect prefixes
prefixes.concat(armorEffectPrefixes).forEach(prefix => {
    armorBases.forEach(base => {
        let aName = `${prefix.name} ${base.name}`;
        armorStats[aName] = base.stat + prefix.bonus;
        if(prefix.effect) itemEffects[aName] = prefix.effect;
        masterRecipes[aName] = [prefix.mat, base.mat];
        allBlueprints.push(`${aName} blueprint`);
        if(!allMaterials.includes(prefix.mat)) allMaterials.push(prefix.mat);
        if(!allMaterials.includes(base.mat)) allMaterials.push(base.mat);
    });
});

// 2. GENERATE ENEMIES
const facPrefixes = ["Rogue", "Mutated", "Cybernetic", "Elite", "Corrupted", "Nano", "Holographic", "Mecha", "Bio", "Nuclear"];
const facBases = ["Drone", "Rat", "Hound", "Guard", "Turret", "Cyborg", "Scientist", "Soldier", "Mutant", "Bot"];
let facilityEnemies = [];

facPrefixes.forEach((p, i) => {
    facBases.forEach((b, j) => {
        let diff = i + j + 1; 
        facilityEnemies.push({
            name: `${p} ${b}`, hp: 6 + (diff * 4), attack: 1 + Math.floor(diff / 1.5), xp: diff * 5, credits: diff * 10,
            drops: [allMaterials[(i+j) % allMaterials.length], allBlueprints[(i*j) % allBlueprints.length]]
        });
    });
});

const dunPrefixes = ["Skeleton", "Giant", "Goblin", "Armored", "Undead", "Cursed", "Shadow", "Fire", "Ice", "Demon"];
const dunBases = ["Warrior", "Spider", "Scavenger", "Orc", "Dragon", "Bat", "Slime", "Mimic", "Troll", "Knight"];
let dungeonEnemies = [];

dunPrefixes.forEach((p, i) => {
    dunBases.forEach((b, j) => {
        let diff = i + j + 1; 
        dungeonEnemies.push({
            name: `${p} ${b}`, hp: 8 + (diff * 4), attack: 2 + Math.floor(diff / 1.5), xp: diff * 6, credits: diff * 10,
            drops: [allMaterials[(i+j) % allMaterials.length], allBlueprints[(i*j) % allBlueprints.length]]
        });
    });
});

// === BIOME-SPECIFIC BOSSES ===
const biomeBosses = {
    facility: [
        { name: "Security Sentinel Prime", hp: 120, attack: 15, xp: 500, credits: 300, drops: ["plasma core", "overclocked rifle blueprint"], isBoss: true },
        { name: "Omega Core", hp: 200, attack: 25, xp: 1000, credits: 500, drops: ["void essence", "quantum sword blueprint"], isBoss: true, isOmega: true },
        { name: "Dr. Vex (Corrupted)", hp: 100, attack: 12, xp: 400, credits: 250, drops: ["blood crystal", "bio-hybrid armor blueprint"], isBoss: true }
    ],
    dungeon: [
        { name: "Dread Lord Karthos", hp: 140, attack: 18, xp: 550, credits: 350, drops: ["dragon scale", "ancient blade blueprint"], isBoss: true },
        { name: "The Lich King", hp: 180, attack: 20, xp: 800, credits: 400, drops: ["curse amulet", "undead staff blueprint"], isBoss: true },
        { name: "Abyssal Wyrm", hp: 160, attack: 22, xp: 700, credits: 380, drops: ["dragon scale", "void staff blueprint"], isBoss: true }
    ],
    bio: [
        { name: "Mutation Mother", hp: 150, attack: 16, xp: 600, credits: 320, drops: ["bio cell", "bio-core blueprint"], isBoss: true },
        { name: "The Hive Collective", hp: 130, attack: 14, xp: 500, credits: 280, drops: ["mutant extract", "bio armor blueprint"], isBoss: true }
    ],
    void: [
        { name: "Reality Warper", hp: 200, attack: 28, xp: 1200, credits: 600, drops: ["dark matter", "void helm blueprint"], isBoss: true },
        { name: "Void Leviathan", hp: 220, attack: 30, xp: 1400, credits: 700, drops: ["void essence", "cosmic weapon blueprint"], isBoss: true }
    ]
};

// 3. GENERATE NPCS & QUESTS
const facilityNPCs = [
    { name: "Wounded Scientist", desc: "clutching a bleeding arm.", wants: "health potion", dialog: "Please... the mutants... if you have a health potion, I can give you my passkey.", success: "Thank you! Take this, it's highly classified.", reward: "plasma core", quest: { id: 'ws-1', title: 'Heal the Scientist', requires: 'health potion', reward: 'keycard', status: 'active' } },
    { name: "Rogue Android", desc: "sparking and glitching in the corner.", wants: "energy cell", dialog: "BZZT. POWER LEVELS CRITICAL. REQUIRE ENERGY CELL. WILL TRADE SCHEMATICS.", success: "POWER RESTORED. DOWNLOADING SCHEMATIC TO YOUR HUD.", reward: "laser rifle blueprint", quest: { id: 'ra-1', title: 'Restore Power', requires: 'energy cell', reward: 'laser rifle blueprint', status: 'active' } }
];

const dungeonNPCs = [
    { name: "Trapped Goblin", desc: "stuck inside a rusted cage.", wants: "rusty key", dialog: "Hey you! Tall one! Got a rusty key? I have shiny coins if you let me out!", success: "Freedom! Here is the shiny stuff, as promised!", reward: "100 credits", quest: { id: 'tg-1', title: 'Free the Goblin', requires: 'rusty key', reward: '100 credits', status: 'active' } },
    { name: "Ghostly Knight", desc: "kneeling in eternal pain.", wants: "antidote", dialog: "The venom... it burns even in death. An antidote... please...", success: "The pain fades. I am freed. Take my ancestral knowledge.", reward: "dragon spear blueprint", quest: { id: 'gk-1', title: 'Lay the Knight to Rest', requires: 'antidote', reward: 'dragon spear blueprint', status: 'active' } }
];

// 4. ASSEMBLE ROOMS - PROCEDURAL BIOMES
const roomData = {
    facility: {
        adjectives: ["sterile", "humming", "flickering", "dark", "metallic", "industrial", "neon-lit", "buzzing", "rust-covered", "smoldering", "cold", "electrified"],
        types: ["server room", "laboratory", "corridor", "observation deck", "storage closet", "data vault", "power chamber", "isolation chamber", "processing unit", "containment cell"],
        features: ["a tangle of loose wires.", "a shattered monitor.", "a glowing button.", "blinking status lights.", "humming machinery.", "sparking conduits.", "a defunct robot.", "security cameras watching."],
        loot: allMaterials, enemies: facilityEnemies, npcs: facilityNPCs
    },
    dungeon: {
        adjectives: ["damp", "crumbling", "echoing", "moss-covered", "bone-chilling", "ancient", "cursed", "shadowy", "oppressive", "timeworn", "macabre", "foreboding"],
        types: ["stone cavern", "crypt", "tunnel", "throne room", "prison cell", "ritual chamber", "treasure vault", "burial mound", "temple", "ossuary"],
        features: ["rusted iron shackles.", "a pile of bones.", "a blue torch.", "strange runes on the walls.", "the smell of decay.", "a cursed altar.", "skeleton remains.", "ancient inscriptions."],
        loot: allMaterials, enemies: dungeonEnemies, npcs: dungeonNPCs
    },
    bio: {
        adjectives: ["writhing", "pulsating", "grotesque", "organic", "fleshy", "bioluminescent", "infected", "mutated", "oozing", "alien"],
        types: ["bio-chamber", "growth pod", "mutation lab", "hive nest", "incubation room", "spore chamber", "breeding ground", "infection vector"],
        features: ["strange breathing sounds.", "viscous fluid dripping from walls.", "glowing bio-matter.", "pulsating organic structures.", "unidentified growths.", "veins pulsing with life."],
        loot: allMaterials.concat(["bio cell", "mutant extract"]), enemies: facilityEnemies, npcs: []
    },
    void: {
        adjectives: ["empty", "vast", "silent", "cosmic", "distorted", "reality-warped", "nonexistent", "temporal", "infinite", "unknowable"],
        types: ["void chamber", "dimensional rift", "reality fold", "null space", "dark abyss", "rift between worlds", "probability nexus"],
        features: ["the void stares back at you.", "gravity feels wrong here.", "strange whispers echo.", "colors that don't exist.", "time flows backwards.", "your reflection doesn't match you."],
        loot: allMaterials.concat(["void essence", "dark matter"]), enemies: facilityEnemies, npcs: []
    }
};
// ==========================================

const validDirections = ["north", "south", "east", "west"];

// Command history for input UX
let commandHistory = [];
let historyIndex = -1;

// Inventory helpers (inventory stores objects: {name, rarity})
function inventoryIndexByName(name) {
    for (let i = 0; i < inventory.length; i++) {
        let it = inventory[i];
        let iname = (typeof it === 'string') ? it : it.name;
        if (iname === name) return i;
    }
    return -1;
}

function addToInventory(name, rarity) {
    inventory.push({ name: name, rarity: rarity || 'common' });
}

function removeFromInventoryIndex(idx) {
    if (idx >= 0 && idx < inventory.length) inventory.splice(idx, 1);
}

function inventoryNames() {
    return inventory.map(it => typeof it === 'string' ? it : it.name);
}

// === BUFF SYSTEM UTILITIES ===
function addToCombatLog(action) {
    combatLog.push(action);
    if (combatLog.length > 50) combatLog.shift(); // Keep last 50
}

function applyBuff(buffName, duration, effect, value) {
    activeBuffs[buffName] = { duration, effect, value, turnsLeft: duration };
    printToTerminal(`⭐ You gained buff: ${buffName} (+${value} ${effect}) for ${duration} turns!`);
}

function updateBuffs() {
    for (let buff in activeBuffs) {
        activeBuffs[buff].turnsLeft--;
        if (activeBuffs[buff].turnsLeft <= 0) {
            delete activeBuffs[buff];
        }
    }
}

function getBuffBonus(effectType) {
    let bonus = 0;
    for (let buff in activeBuffs) {
        if (activeBuffs[buff].effect === effectType) {
            bonus += activeBuffs[buff].value;
        }
    }
    return bonus;
}

function showActiveBuffs() {
    if (Object.keys(activeBuffs).length === 0) {
        return printToTerminal("No active buffs.");
    }
    printToTerminal("=== ACTIVE BUFFS ===");
    for (let buff in activeBuffs) {
        let b = activeBuffs[buff];
        printToTerminal(`⭐ ${buff}: +${b.value} ${b.effect} (${b.turnsLeft} turns left)`);
    }
}

// Loot rarity tables
const lootRarity = [
    { name: "common", weight: 60 },
    { name: "uncommon", weight: 25 },
    { name: "rare", weight: 10 },
    { name: "epic", weight: 4 },
    { name: "legendary", weight: 1 }
];

function chooseRarity(distance) {
    // Slightly bump rarer chances with distance
    let biomeLootBonus = Math.round((getFactionLootMultiplier(currentBiome) - 1) * 3);
    let bonus = Math.min(Math.floor(distance / 50), 3) + getRelicLootBonus() + biomeLootBonus; // small bump
    let pool = [];
    lootRarity.forEach(r => {
        let w = Math.max(1, r.weight - (r.name === 'common' ? bonus * 5 : 0) + (r.name === 'rare' ? bonus * 2 : 0));
        for (let i = 0; i < w; i++) pool.push(r.name);
    });
    return getRandom(pool);
}

function generateDrop(enemy) {
    let distance = Math.abs(playerX) + Math.abs(playerY);
    // Prefer enemy's own drops if present
    let item = null;
    let rarity = chooseRarity(distance);
    if (enemy.drops && Math.random() < 0.7) {
        item = getRandom(enemy.drops);
    } else {
        if (rarity === 'common') item = getRandom(allMaterials);
        else if (rarity === 'uncommon') item = getRandom(allMaterials.concat(allBlueprints));
        else if (rarity === 'rare') item = getRandom(allBlueprints.concat(Object.keys(weaponStats)).slice(0, 30));
        else if (rarity === 'epic') item = getRandom(Object.keys(weaponStats).concat(Object.keys(armorStats)).slice(0, 60));
        else item = getRandom(Object.keys(weaponStats).concat(Object.keys(armorStats)));
    }
    return { name: item, rarity: rarity };
}

function generateRoom(previousTheme, directionMoved, x, y) {
    // Biome switching: rare chance to enter new biomes
    let distance = Math.abs(x) + Math.abs(y);
    let biomeChance = Math.min(0.05, distance / 1000);
    let themes = ["facility", "dungeon"];
    if (distance > 50) themes.push("bio");
    if (distance > 150) themes.push("void");
    
    // 5% merchant, or biome shift
    if (Math.random() < 0.05 && (x !== 0 || y !== 0)) {
        return {
            theme: "shop", isShop: true, visited: false,
            desc: "You enter a safe zone. A holographic merchant is standing behind a neon counter.",
            exits: ["north", "south", "east", "west"], item: null, enemy: null, npc: null, resourceNode: null
        };
    }
    if (Math.random() < biomeChance && themes.length > 2) {
        previousTheme = getRandom(themes.filter(t => t !== previousTheme && t !== "shop"));
    }

    let isSecretRoom = false;
    if (Math.random() < 0.015 && (x !== 0 || y !== 0)) {
        isSecretRoom = true;
    }

    let currentTheme = previousTheme === "shop" ? "facility" : previousTheme;
    if (Math.random() > 0.90 && currentTheme !== "void") currentTheme = (currentTheme === "facility") ? "dungeon" : "facility";

    const words = roomData[currentTheme];
    let roomItem = Math.random() < (isSecretRoom ? 0.80 : 0.30) ? getRandom(words.loot) : null;
    
    let maxEnemyIndex = Math.min(Math.floor(distance * 3) + 9, words.enemies.length - 1);
    
    let roomEnemy = null;
    let roomNpc = null;
    let roomHazard = null;

    // 6% chance the room is locked and requires a keycard or rusty key
    let locked = false;
    let requiredKey = null;
    if (Math.random() < 0.06 && !(x === 0 && y === 0)) {
        locked = true;
        requiredKey = Math.random() < 0.6 ? "keycard" : "rusty key";
    }
    
    // 15% chance to spawn an NPC instead of an Enemy
    if (!isSecretRoom && Math.random() < 0.15 && (x !== 0 || y !== 0)) {
        roomNpc = JSON.parse(JSON.stringify(getRandom(words.npcs)));
    } else {
        let factionEnemyPressure = getFactionEnemyMultiplier(currentTheme);
        let spawnChance = clampNumber(0.40 * factionEnemyPressure, 0.25, 0.65);
        if (Math.random() >= spawnChance) {
            roomEnemy = null;
        } else {
        // Boss encounter chance (0.5% base increasing with distance)
        let bossProbability = 0.005 + (distance / 1000) * 0.01; // Max 1.5% at distance 150
        if (challengeModifiers.eliteThreat) bossProbability += 0.01;
        if ((reputation[currentTheme] || 0) <= -8) bossProbability += 0.006;
        
        if (Math.random() < bossProbability && biomeBosses[currentTheme]) {
            // Spawn a boss!
            roomEnemy = JSON.parse(JSON.stringify(getRandom(biomeBosses[currentTheme])));
            roomEnemy.isOmega = roomEnemy.name === "Omega Core";
            bossesEncountered[roomEnemy.name] = true;
            roomEnemy = applyBossVariant(roomEnemy);
            
            // Apply NG+ scaling to bosses
            let ngPlusMultiplier = getNGPlusDifficultyMultiplier();
            roomEnemy.hp = Math.floor(roomEnemy.hp * ngPlusMultiplier);
            roomEnemy.attack = Math.floor(roomEnemy.attack * ngPlusMultiplier);
            roomEnemy.xp = Math.floor(roomEnemy.xp * ngPlusMultiplier);
            roomEnemy.credits = Math.floor(roomEnemy.credits * ngPlusMultiplier);
            roomEnemy.encounterPending = false;
        } else {
            // Regular enemy with difficulty scaling
            let template = JSON.parse(JSON.stringify(getRandom(words.enemies.slice(0, maxEnemyIndex + 1))));
            
            // Apply difficulty scaling
            let diffScale = difficultyScaling[gameSettings.difficulty];
            let distanceScale = 1 + Math.floor(distance / 10) * 0.25 + Math.min(distance / 200, 1);
            let ngPlusMultiplier = getNGPlusDifficultyMultiplier();
            let factionScale = getFactionEnemyMultiplier(currentTheme);
            
            template.hp = Math.max(1, Math.floor(template.hp * distanceScale * diffScale.enemyHP * ngPlusMultiplier * factionScale * (challengeModifiers.eliteThreat ? 1.15 : 1)));
            template.attack = Math.max(1, Math.floor(template.attack * distanceScale * diffScale.enemyDamage * ngPlusMultiplier * factionScale * (challengeModifiers.eliteThreat ? 1.1 : 1)));
            template.xp = Math.max(1, Math.floor(template.xp * distanceScale * diffScale.xpMultiplier * ngPlusMultiplier));
            template.credits = Math.floor(template.credits * distanceScale * ngPlusMultiplier * (challengeModifiers.bountyHunter ? 1.4 : 1));
            
            // Apply elite/legendary/mythic tiers
            roomEnemy = generateEnemyTier(template);

            // Mini-boss challenge room
            if (distance > 40 && Math.random() < 0.08) {
                roomEnemy.isMiniBoss = true;
                roomEnemy.name = `Champion ${roomEnemy.name}`;
                roomEnemy.hp = Math.floor(roomEnemy.hp * 1.5);
                roomEnemy.attack = Math.floor(roomEnemy.attack * 1.25);
                roomEnemy.xp = Math.floor(roomEnemy.xp * 1.6);
                roomEnemy.credits = Math.floor(roomEnemy.credits * 1.8);
                roomEnemy.encounterPending = true;
            }
        }
        }
    }

    if (roomEnemy) {
        generateEnemyIntent(roomEnemy);
    }

    if (!isSecretRoom && Math.random() < (challengeModifiers.hazardSurge ? 0.18 : 0.10)) {
        let hazardTypes = [
            { type: 'radiation', power: challengeModifiers.hazardSurge ? 4 : 2 },
            { type: 'plasma', power: challengeModifiers.hazardSurge ? 3 : 2 },
            { type: 'ice', power: challengeModifiers.hazardSurge ? 3 : 1 },
            { type: 'static', power: challengeModifiers.hazardSurge ? 2 : 1 }
        ];
        roomHazard = getRandom(hazardTypes);
    }

    let exits = ["north", "south", "east", "west"].filter(() => Math.random() > 0.3);
    const op = { north: "south", south: "north", east: "west", west: "east" };
    if (directionMoved && !exits.includes(op[directionMoved])) exits.push(op[directionMoved]);
    if (exits.length === 0) exits = ["north"]; 

    if (isSecretRoom) {
        exits = exits.slice(0, 2);
        if (!roomItem) roomItem = getRandom(words.loot);
    }

    // 20% chance for a resource node (gatherable materials)
    let resourceNode = null;
    if (!isSecretRoom && Math.random() < 0.20 && !(x === 0 && y === 0)) {
        let mat = getRandom(words.loot);
        let amt = 1 + Math.floor(Math.min(Math.abs(x)+Math.abs(y), 20) / 5);
        resourceNode = { material: mat, amount: amt };
    }

    // 8% chance for Hull Breach environmental hazard (3 turn timer)
    let hullBreach = false;
    if (!isSecretRoom && Math.random() < 0.08 && currentTheme === "facility" && !(x === 0 && y === 0)) {
        hullBreach = true;
    }

    // 10% chance for a hackable console (disable turrets for 3 rooms or reveal map)
    let hackableConsole = false;
    if (!isSecretRoom && Math.random() < 0.10 && currentTheme === "facility" && !(x === 0 && y === 0)) {
        hackableConsole = true;
    }

    // 12% chance for turrets if we're in a facility (can be disabled by console)
    let hasTurrets = !isSecretRoom && turretsCooldown <= 0 && Math.random() < 0.12 && currentTheme === "facility" && !roomEnemy;

    let mutator = null;
    if (!isSecretRoom && !roomEnemy?.isBoss && Math.random() < 0.12) {
        mutator = getRandom(roomMutators);
    }

    return { 
        theme: currentTheme, isShop: false, visited: false,
        desc: isSecretRoom ? `You have discovered a hidden chamber lined with impossible geometry and quiet treasure.` : `You are in a ${getRandom(words.adjectives)} ${getRandom(words.types)}. You see ${getRandom(words.features)}`, 
        exits: exits, item: roomItem, enemy: roomEnemy, npc: roomNpc,
        locked: locked, requiredKey: requiredKey, resourceNode: resourceNode,
        hullBreach: hullBreach, hackableConsole: hackableConsole, hasTurrets: hasTurrets,
        secretRoom: isSecretRoom,
        hazard: roomHazard,
        mutator: mutator
    };
}

// --- INITIALIZATION & CORE LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
    const gameScreen = document.getElementById("game-screen");
    const terminalOutput = document.getElementById("terminal-output");
    const playerInput = document.getElementById("player-input");
    gameScreen.classList.remove("hidden");
    playerInput.disabled = true;

    const ACCESS_SIG = [157, 151, 159, 105, 119, 56, 43, 152, 165, 141];
    let accessAttempts = 0;
    let cachedAccessLog = null;
    const ACCESS_LOG_FALLBACK = `Shrimp 1
Bio Shrimp
Command Instructor
4 May 2026

Captain's Log: Head Scientist Notes

    Captain's log, third watch. Bio Shrimp, head
scientist, filing routine status after the overnight
maintenance cycle. Core drift remained quiet, cryo lines
held, and pressure compensation stayed inside tolerance.
Operationally we are stable. Administratively we are not.
Unauthorized retries at the research gate have climbed for
five consecutive shifts, all by users who think a secret is
just a word waiting to be guessed.

    I archived no plain token. I left process artifacts,
the way we do in labs when a formula must survive copying by
tired hands. Bench card K-19 keeps the warm-start rotor
labels in line order. If this page is read by someone who
actually worked turnover, they will already know why warm
state text cannot be trusted at face value.

    The five labels I care about are written in full on
the card and nowhere else in this file: Pulse, Null, Flux,
Helix, Beacon. I only need what remains when each of those
names is reduced to its smallest useful mark.

    Morning procedure has never changed. Nights close with
the same directional wheel bias; mornings normalize before
reading anything that came off an active bank. People who
skip normalization read noise and call it data. People who
normalize first usually stop asking me for hints.

    Chronology follows the same policy. The vault ledger
stores the gross mark and the rollback debit separately,
not as a single calendar value. Gross entry: MMCLXII.
Rollback debit: XX. I trust ledger math because memory has
a talent for rewriting difficult years into easy ones.

    When the gate parser receives the final string, it
expects command-log shape, not prose shape. One separator.
No spaces. Left segment alphabetic. Right segment numeric,
even length, balanced around its midpoint. Any decorative
character beyond that gets rejected before hash compare.

    If this reads unfriendly, good. We are past the point
where friendly is safe. The person who belongs in this room
can reconstruct intent from procedure. The person who cannot
should meet a closed door.

    Supplemental note: rotate the rotor vocabulary at next
audit boundary, but keep assembly habits unchanged so trained
staff can still recover under stress. Never write the final
credential in standing logs, even in so-called internal docs.`;

    function encodeAccessInput(text) {
        return [...text].map((ch, i) => {
            return ((ch.charCodeAt(0) ^ (17 + i * 7)) + 31 + ((i % 5) * 3)) % 256;
        });
    }

    function isValidAccessCode(input) {
        const encoded = encodeAccessInput(input);
        if (encoded.length !== ACCESS_SIG.length) return false;
        return encoded.every((value, idx) => value === ACCESS_SIG[idx]);
    }

    async function printAccessLog() {
        try {
            if (!cachedAccessLog) {
                try {
                    const response = await fetch('access-code-clue.txt', { cache: 'no-store' });
                    if (response.ok) {
                        cachedAccessLog = await response.text();
                    } else {
                        cachedAccessLog = ACCESS_LOG_FALLBACK;
                    }
                } catch (fetchError) {
                    cachedAccessLog = ACCESS_LOG_FALLBACK;
                }
            }

            printToTerminal('--- CAPTAIN LOG ARCHIVE ---', 0);
            printToTerminal(cachedAccessLog, 0);
            printToTerminal('--- END ARCHIVE ---', 0);
        } catch (error) {
            printToTerminal('ACCESS LOG READ ERROR. ARCHIVE CHANNEL CLOSED.');
        }
    }

    const bootLines = [
        "SYSTEM BOOT SEQUENCE INITIATED...",
        "YEAR: 2142 | LOCATION: SECTOR 7 APEX FACILITY",
        "--------------------------------------------------",
        "LORE DATABASE: The megacorp 'OmniCorp' has fallen to a rogue AI. You are a surviving operative trapped deep underground.",
        "Your mission: Survive the mutated bioweapons, escape to the surface, and destroy the Omega Core.",
        "--------------------------------------------------",
        "INITIALIZING NEURAL UPLOAD... PLEASE SELECT YOUR CLASS:",
        "[1] NEOPHYTE STRIKER: 20 HP | 5 MP | +3 Base Attack (Melee Focus)",
        "[2] GLITCHED WEAVER: 12 HP | 20 MP | +1 Base Attack (Magic Focus)",
        "[3] RUSTED SENTINEL: 25 HP | 5 MP | +2 Base Defense (Survival Focus)",
        "[4] SCAVENGER RECRUIT: 15 HP | 10 MP | +2 Base Attack (Starts with Map & 25c)",
        "[5] FAILED EXPERIMENT: 10 HP | 10 MP | +4 Base Attack (High Risk/Reward)",
        "After selecting a class, choose your difficulty. Harder difficulties place the Omega Core farther away.",
        "Type '1', '2', '3', '4', or '5' to select."
    ];

    const bootLine = document.createElement("p");

    const bootDuration = 5000;
    let dotTicker = null;

    function startBootSequence() {
        terminalOutput.textContent = "";
        terminalOutput.appendChild(bootLine);
        playerInput.disabled = true;
        gameState = "BOOTING";

        let bootStart = Date.now();
        renderBootFrame(bootStart);
    }

    const renderBootFrame = (bootStart) => {
        let elapsed = Date.now() - bootStart;
        let dotCount = Math.floor(elapsed / 500) % 4;
        bootLine.textContent = `BOOTING${".".repeat(dotCount)}`;

        if (elapsed < bootDuration) {
            dotTicker = window.setTimeout(() => renderBootFrame(bootStart), 500);
        } else {
            bootLine.textContent = "BOOTING...";
            window.setTimeout(() => {
                if (dotTicker) window.clearTimeout(dotTicker);
                terminalOutput.textContent = "";
                bootLines.forEach(line => printToTerminal(line));
                gameState = "CLASS_SELECT";
                playerInput.disabled = false;
                playerInput.focus();
            }, 150);
        }
    };

    terminalOutput.textContent = "";
    printToTerminal("=== CLASSIFIED PROGRAM ===", 0);
    printToTerminal("ACCESS RESTRICTION: ENTER ACCESS CODE.", 0);
    printToTerminal("Type 'log' to read captain notes.", 0);
    printToTerminal("Type the access code to continue.", 0);
    gameState = "ACCESS_CODE";
    playerInput.disabled = false;
    playerInput.focus();

    function beginRunAfterDifficulty() {
        gameState = "PLAYING";
        runStartTime = Date.now();
        initMerchantInventory();
        initializeQuestChains();
        worldMap["0,0"] = generateRoom("facility", null, 0, 0);
        worldMap["0,0"].enemy = null;
        worldMap["0,0"].npc = null;
        worldMap["0,0"].visited = true;
        updateStats();

        const victoryCoordinates = generateVictoryCoordinates(gameSettings.difficulty);
        victoryX = victoryCoordinates.x;
        victoryY = victoryCoordinates.y;

        printToTerminal(`* Mission coordinate locked to neural HUD. Objective distance estimated: ${victoryCoordinates.distance} sectors.`);
        printToTerminal("\n--- NEURAL LINK ESTABLISHED. GOOD LUCK. ---");
        printToTerminal("Type 'help' for commands. Type 'stats' to see your condition.");
        return executeLook();
    }

    playerInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            const command = playerInput.value.trim().toLowerCase();
            if (command === "") return;
            printToTerminal(`\n> ${command}`, 0); 
            // push to history
            commandHistory.push(command);
            historyIndex = commandHistory.length;
            playerInput.value = "";
            processCommand(command);
        } else if (event.key === 'ArrowUp') {
            if (commandHistory.length === 0) return;
            historyIndex = Math.max(0, historyIndex - 1);
            playerInput.value = commandHistory[historyIndex] || '';
            event.preventDefault();
        } else if (event.key === 'ArrowDown') {
            if (commandHistory.length === 0) return;
            historyIndex = Math.min(commandHistory.length, historyIndex + 1);
            playerInput.value = commandHistory[historyIndex] || '';
            event.preventDefault();
        } else if (event.ctrlKey && event.key === 'r') {
            // Command history search
            event.preventDefault();
            searchCommandHistory();
        }
    });

    function autoCompleteCommand() {
        const partial = playerInput.value.toLowerCase();
        if (partial === '') return;
        
        const commands = ['inventory', 'stats', 'help', 'quests', 'enchantments', 'map', 'save', 'load', 'settings', 'leaderboard', 'buffs', 'achievements', 'recipes', 'relics', 'event', 'challenge', 'intent', 'score'];
        const matches = commands.filter(cmd => cmd.startsWith(partial));
        
        if (matches.length === 1) {
            playerInput.value = matches[0] + ' ';
        } else if (matches.length > 1) {
            printToTerminal(`Suggestions: ${matches.slice(0, 5).join(', ')}`, 0);
        }
    }

    function searchCommandHistory() {
        // Simple search - find commands matching current input
        const partial = playerInput.value.toLowerCase();
        let found = -1;
        
        for (let i = commandHistory.length - 1; i >= 0; i--) {
            if (commandHistory[i].includes(partial)) {
                found = i;
                break;
            }
        }
        
        if (found >= 0) {
            historyIndex = found;
            playerInput.value = commandHistory[found];
        }
    }

    function processCommand(command) {
        if (gameState === "ACCESS_CODE") {
            if (command === 'log') {
                printAccessLog();
                return;
            }

            if (isValidAccessCode(command)) {
                printToTerminal("ACCES GRANTES", 0);
                return window.setTimeout(() => {
                    startBootSequence();
                }, 250);
            }

            accessAttempts += 1;
            return printToTerminal(`ACCESS DENIED. INVALID CODE. ATTEMPTS: ${accessAttempts}`);
        }

        // --- CLASS SELECTION INTERCEPT ---
        if (gameState === "CLASS_SELECT") {
            if (command === "1") {
                player.maxHp = 20; player.hp = 20; player.maxMp = 5; player.mp = 5; player.baseAttack = 3;
                player.class = 'Neophyte Striker';
                printToTerminal(">>> NEOPHYTE STRIKER SELECTED. Combat subroutines loaded.");
            } else if (command === "2") {
                player.maxHp = 12; player.hp = 12; player.maxMp = 20; player.mp = 20; player.baseAttack = 1;
                player.class = 'Glitched Weaver';
                printToTerminal(">>> GLITCHED WEAVER SELECTED. Mana pathways unstable but active.");
            } else if (command === "3") {
                player.maxHp = 25; player.hp = 25; player.maxMp = 5; player.mp = 5; player.baseAttack = 1; player.baseDefense = 2;
                player.class = 'Rusted Sentinel';
                printToTerminal(">>> RUSTED SENTINEL SELECTED. Armor plating engaged.");
            } else if (command === "4") {
                player.maxHp = 15; player.hp = 15; player.maxMp = 10; player.mp = 10; player.baseAttack = 2;
                credits = 25; addToInventory("system map", 'common');
                player.class = 'Scavenger Recruit';
                printToTerminal(">>> SCAVENGER RECRUIT SELECTED. Sensors online. Map acquired.");
            } else if (command === "5") {
                player.maxHp = 10; player.hp = 10; player.maxMp = 10; player.mp = 10; player.baseAttack = 4;
                player.class = 'Failed Experiment';
                printToTerminal(">>> FAILED EXPERIMENT SELECTED. Mutation aggressive. Vitals critical.");
            } else {
                return printToTerminal("Invalid selection. Type '1', '2', '3', '4', or '5'.");
            }

            gameState = "DIFFICULTY_SELECT";
            printToTerminal("Select difficulty: [1] EASY [2] NORMAL [3] HARD [4] INSANE");
            printToTerminal("Difficulty controls enemy strength and how far the Omega Core is from your starting point.");
            return printToTerminal("Type '1', '2', '3', or '4' to continue.");
        }

        if (gameState === "DIFFICULTY_SELECT") {
            if (command === "1") {
                gameSettings.difficulty = "EASY";
            } else if (command === "2") {
                gameSettings.difficulty = "NORMAL";
            } else if (command === "3") {
                gameSettings.difficulty = "HARD";
            } else if (command === "4") {
                gameSettings.difficulty = "INSANE";
            } else {
                return printToTerminal("Invalid selection. Type '1', '2', '3', or '4'.");
            }

            printToTerminal(`>>> DIFFICULTY SET TO ${gameSettings.difficulty}.`);
            return beginRunAfterDifficulty();
        }

        if (player.hp <= 0) {
            if (command === "restart") return restartGame();
            return printToTerminal("YOU ARE DEAD. Type 'restart' to begin a new run, or 'load' to restore a save.");
        }
        
        const words = command.split(" ");
        const action = words[0];
        const target = words.slice(1).join(" "); 

        if (pendingRoomEvent && action !== 'event' && action !== 'help' && action !== 'stats' && action !== 'inventory') {
            return printToTerminal("An event is in progress. Resolve it with 'event 1' or 'event 2'.");
        }

        // GLOBAL COMMANDS
        if (action === "event") return resolveRoomEvent(words[1]);
        if (action === "challenge") return resolveMiniBossChoice(words[1]);
        if (action === "save") return saveGame(words[1] || 'default');
        if (action === "load") return loadGame(words[1] || 'default');
        if (action === "saves") return listSaves();
        if (action === "stats") return showStats();
        if (action === "careerStats") return showGameStats();
        if (action === "achievements") return showAchievements();
        if (action === "reputation") return showReputation();
        if (action === "relics") return showRelics();
        if (action === "intent") return currentEnemy && currentEnemy.intent ? printToTerminal(`Current intent: ${currentEnemy.intent.telegraph}`) : printToTerminal('No hostile intent detected right now.');
        if (action === "inventory") return showInventory();
        if (action === "recipes") return showRecipes();
        if (action === "quests") return showActiveQuests();
        if (action === "skill") return currentEnemy ? handleCombatMode(action, target) : useSkill(target);
        if (action === "summon") return summonCompanion();
        if (action === "compare") return showItemComparison(target);
        if (action === "enchant") return upgradeEnchantment(target || 'fire');
        if (action === "enchantments") return showEnchantmentStatus();
        if (action === "settings") return showSettings();
        if (action === "set") return changeSetting(words[1], words.slice(2).join(" "));
        if (action === "leaderboard" || action === "lb") return showLeaderboard();
        if (action === "buffs") return showActiveBuffs();
        if (action === "combatlog") return showCombatLog();
        if (action === "help") return showHelp();
        if (action === "export" || action === "export-save") return exportSave();
        if (action === "map") return drawMap();
        if (action === "transmute") return processTransmute(target);
        if (action === "cast") return currentEnemy ? handleCombatMode(action, target) : castMagic(target);
        if (action === "use" || action === "heal") return currentEnemy ? handleCombatMode(action, target) : useItem(action === "heal" ? "health potion" : target);

        // APPLY STATUS EFFECTS
        if (player.statusEffects && player.statusEffects.poisoned) {
            let poisonDamage = player.statusEffects.poisoned.power || 2;
            player.hp -= poisonDamage;
            printToTerminal(`⚠️ Poison courses through your veins! You take ${poisonDamage} damage.`);
            if (player.hp <= 0) return playerDeath("THE POISON HAS KILLED YOU. GAME OVER.");
        }

        if (currentEnemy) return handleCombatMode(action, target);
        
        let coord = `${playerX},${playerY}`;
        let room = worldMap[coord];

        // EXPLORATION & WORLD INTERACTION
        if (validDirections.includes(action)) {
            if (!room.exits.includes(action)) return printToTerminal(`No exit to the ${action}.`);
            let tx = playerX, ty = playerY;
            if (action === "north") ty--; if (action === "south") ty++; if (action === "east") tx++; if (action === "west") tx--;
            let tCoord = `${tx},${ty}`;
            if (!worldMap[tCoord]) worldMap[tCoord] = generateRoom(room.theme, action, tx, ty);

            // Check locked rooms before moving
            if (worldMap[tCoord].locked) {
                let req = worldMap[tCoord].requiredKey || "keycard";
                if (inventoryIndexByName(req) === -1) {
                    return printToTerminal(`ACCESS DENIED: Sector locked. You need a '${req}' to enter.`);
                } else {
                    printToTerminal(`You swipe your ${req} and the lock disengages.`);
                    worldMap[tCoord].locked = false; worldMap[tCoord].requiredKey = null;
                }
            }

            // Room exit message
            let exitMsgs = {
                north: "You push through a heavy door and head north...",
                south: "You descend deeper south into the darkness...",
                east: "You edge eastward, staying alert...",
                west: "You traverse westward through the gloom..."
            };
            printToTerminal(exitMsgs[action]);

            playerX = tx; playerY = ty;
            worldMap[tCoord].visited = true;
            gameStats.distanceTraveled += 1; // Track distance traveled 

            // If player reached the victory coordinates, spawn the Omega Core boss
            if (victoryX !== null && victoryY !== null && tx === victoryX && ty === victoryY && !omegaDefeated) {
                worldMap[tCoord].enemy = {
                    name: "THE OMEGA CORE", hp: 1200, attack: 30, xp: 1500, credits: 1000,
                    drops: ["omega chipset", "keycard", "system map"], isOmega: true
                };
                worldMap[tCoord].desc = "You stand in the Heart Chamber. Massive conduits pulse with a dark light. A towering construct dominates the room: THE OMEGA CORE.";
            }
            
            // Decrement hazard cooldowns
            if (turretsCooldown > 0) {
                turretsCooldown--;
                if (turretsCooldown === 0) printToTerminal("🔫 Turret suppression protocol expired.");
            }
            if (hullBreachTurns > 0) {
                hullBreachTurns--;
                if (hullBreachTurns === 0) {
                    printToTerminal("💥 HULL BREACH RUPTURE! Massive decompression!");
                    let dmg = 100;
                    player.hp -= dmg;
                    printToTerminal(`You take ${dmg} catastrophic damage! (HP: ${player.hp})`);
                    if (player.hp <= 0) playerDeath("YOU WERE SUCKED INTO SPACE. GAME OVER.");
                }
            }
            
            executeLook(); 
            tryCreateRoomEvent(worldMap[tCoord]);
            // autosave on movement
            autoSave();
        }
        else if (action === "take" || action === "grab") {
            if (room.item && (target === room.item || target === "all")) {
                gameStats.itemsPickedUp++;
                addToInventory(room.item, room.itemRarity || 'common');
                let comparison = getItemComparison(room.item);
                printToTerminal(`You picked up the ${room.item}. ${comparison}`);
                room.item = null; room.itemRarity = null;
            } else printToTerminal(`You don't see a '${target}' here.`);
        }
        else if (action === "gather") {
            if (room.resourceNode && room.resourceNode.amount > 0) {
                let gathered = Math.min(Math.floor(Math.random() * 5) + 3, room.resourceNode.amount);
                for (let i = 0; i < gathered; i++) {
                    addToInventory(room.resourceNode.material, 'common');
                }
                room.resourceNode.amount -= gathered;
                gameStats.itemsPickedUp += gathered;
                if (room.resourceNode.amount <= 0) {
                    printToTerminal(`You gathered ${gathered} resources! [Node exhausted]`);
                    room.resourceNode = null;
                } else {
                    printToTerminal(`You gathered ${gathered} resources! [${room.resourceNode.amount} remaining]`);
                }
            } else {
                printToTerminal("There are no resources to gather here.");
            }
        }
        else if (action === "talk") {
            if (room.npc) {
                printToTerminal(`${room.npc.name} says: "${room.npc.dialog}"`);
                printToTerminal("Turn-ins can branch: 'give [item] kind|pragmatic|greedy'.");
                adjustReputation(getFactionFromRoom(room), 1);
                if (room.npc.quest && !player.activeQuests.find(q => q.id === room.npc.quest.id)) {
                    player.activeQuests.push(JSON.parse(JSON.stringify(room.npc.quest)));
                    printToTerminal(`*** Quest Added: ${room.npc.quest.title} (requires: ${room.npc.quest.requires})`);
                }
            } else {
                printToTerminal("There is no one here to talk to.");
            }
        }
        else if (action === "give") {
            if (!room.npc) return printToTerminal("There is no one here to give that to.");
            if (!target) return printToTerminal("Give what? (e.g., 'give health potion')");

            let parts = target.split(' ');
            let style = 'kind';
            let styleCandidate = parts[parts.length - 1];
            if (['kind', 'greedy', 'pragmatic'].includes(styleCandidate)) {
                style = styleCandidate;
                parts.pop();
            }
            let itemTarget = parts.join(' ').trim();

            let idx = inventoryIndexByName(itemTarget);
            if (idx === -1) return printToTerminal(`You don't have a '${itemTarget}' in your inventory.`);

            if (room.npc.wants === itemTarget) {
                // Quest Complete!
                removeFromInventoryIndex(idx);
                printToTerminal(`You gave the ${itemTarget} to the ${room.npc.name}.`);
                printToTerminal(`${room.npc.name}: "${room.npc.success}"`);
                
                // Process Reward
                if (room.npc.reward.includes("credits")) {
                    let amount = parseInt(room.npc.reward);
                    if (style === 'greedy') amount = Math.floor(amount * 1.5);
                    if (style === 'pragmatic') amount = Math.floor(amount * 1.2);
                    credits += amount; 
                    printToTerminal(`*** You received ${amount} Credits! ***`);
                } else {
                    addToInventory(room.npc.reward, 'common');
                    if (style === 'greedy') credits += 25;
                    printToTerminal(`*** You received a [${room.npc.reward}]! ***`);
                }
                if (style === 'kind') adjustReputation(getFactionFromRoom(room), 3);
                else if (style === 'pragmatic') adjustReputation(getFactionFromRoom(room), 1);
                else adjustReputation(getFactionFromRoom(room), -2);

                if (style === 'greedy') {
                    printToTerminal('⚠️ Word of your greed spreads. Local trust decreases.');
                }

                // mark related quest complete if present
                let qidx = player.activeQuests.findIndex(q => q.requires === itemTarget && q.status !== 'completed');
                if (qidx !== -1) {
                    player.activeQuests[qidx].status = 'completed';
                    printToTerminal(`*** Quest Complete: ${player.activeQuests[qidx].title} ***`);
                    if (player.activeQuests[qidx].reward) {
                        if (typeof player.activeQuests[qidx].reward === 'number' || (typeof player.activeQuests[qidx].reward === 'string' && player.activeQuests[qidx].reward.match && player.activeQuests[qidx].reward.match(/\d+/))) {
                            let amt = parseInt(player.activeQuests[qidx].reward);
                            credits += amt; printToTerminal(`*** Extra Reward: ${amt} credits ***`);
                        } else {
                            addToInventory(player.activeQuests[qidx].reward, 'common');
                            printToTerminal(`*** Extra Reward: ${player.activeQuests[qidx].reward} ***`);
                        }
                    }
                }

                room.npc = null; // NPC leaves the room
            } else {
                printToTerminal(`The ${room.npc.name} shakes their head. "I don't need that..."`);
            }
        }
        else if (action === "buy") {
            if (!room.isShop) return printToTerminal("You're not in a shop!");
            if (!target) return merchantSell();
            buyItem(target);
        }
        else if (action === "sell") {
            if (!room.isShop) return printToTerminal("You're not in a shop!");
            if (!target) return printToTerminal("Sell what? Type 'sell [item]'");
            sellItem(target);
        }
        else if (action === "craft") processCraft(target);
        else if (action === "use" || action === "heal" || action === "read") useItem(action === "heal" ? "health potion" : target);
        else if (action === "equip") equipItem(target);
        else if (action === "cast") castMagic(target);
        else if (action === "seal") handleSealBreach();
        else if (action === "hack") handleConsoleHack();
        else if (action === "dodge") handleTurretDodge();
        else if (action === "daily") startDailyChallenge();
        else if (action === "weekly") startWeeklyChallenge();
        else if (action === "disassemble") disassembleItem(target);
        else if (action === "seeds") showDailySeeds();
        else if (action === "biomes") showBiomeInfo();
        else if (action === "portal") travelToPortal(target || 'facility');
        else if (action === "portals") showPortals();
        else if (action === "quests") showActiveQuestChains();
        else if (action === "ng+prepare") prepareNewGamePlus();
        else if (action === "ng+start") startNewGamePlus();
        else if (action === "score") {
            let breakdown = calculateChallengeScore();
            let score = breakdown.distance + breakdown.credits + breakdown.kills + breakdown.bosses + breakdown.speed;
            printToTerminal(`📊 Current Challenge Score: ${score}`);
            printToTerminal(`Distance: ${breakdown.distance} | Credits: ${breakdown.credits} | Kills: ${breakdown.kills} | Bosses: ${breakdown.bosses} | Speed: ${breakdown.speed}`);
            if (challengeMission.featuredClass) printToTerminal(`Featured Build: ${challengeMission.featuredClass}`);
        }
        else if (action === "look") executeLook();
        else if (action === "tutorial") showTutorial(target);
        else if (action === "accessibility") showAccessibilityOptions();
        else {
            // Better error messages with suggestions
            let suggestions = [];
            if (action.length > 0) {
                const allCommands = ['north', 'south', 'east', 'west', 'inventory', 'stats', 'help', 'quests', 'attack', 'cast', 'run', 'map', 'save', 'load', 'summon', 'compare', 'transmute', 'weekly', 'daily', 'relics', 'event', 'challenge', 'intent'];
                let similar = allCommands.filter(cmd => {
                    let matches = 0;
                    for (let i = 0; i < Math.min(cmd.length, action.length); i++) {
                        if (cmd[i] === action[i]) matches++;
                    }
                    return matches >= action.length - 1 && matches > 0;
                });
                if (similar.length > 0) {
                    suggestions = similar.slice(0, 3);
                }
            }
            
            if (suggestions.length > 0) {
                printToTerminal(`❌ Unknown command '${action}'. Did you mean: ${suggestions.join(', ')}?`);
            } else {
                printToTerminal(`❌ Unknown command '${action}'. Type 'help' for a list of commands.`);
            }
        }
        
        // Update buff durations after action
        updateBuffs();
    }

    // --- GAME SYSTEMS ---
    function updateStats() {
        player.attack = player.baseAttack + (weaponStats[player.equipped.weapon] || 0);
        player.defense = player.baseDefense + (armorStats[player.equipped.armor] || 0) + getRelicDefenseBonus();
    }

    function showStats() {
        printToTerminal(`LEVEL: ${player.level} | HP: ${player.hp}/${player.maxHp} | MP: ${player.mp}/${player.maxMp} | CREDITS: ${credits}`);
        printToTerminal(`ATTACK: ${player.attack} | DEFENSE: ${player.defense} | XP: ${player.xp}/${player.xpNeeded}`);
        printToTerminal(`WEAPON: ${player.equipped.weapon || "None"} | ARMOR: ${player.equipped.armor || "None"} | STATUS: ${player.status || "Healthy"}`);
        printToTerminal(`COMPANION: ${activeCompanion ? `${activeCompanion.name} (${activeCompanion.turns} turns)` : 'None'} | EFFECTS: ${describeStatusEffects(player) || 'None'}`);
        printToTerminal(`RELICS: ${activeRelics.length} | EVENTS: ${gameStats.eventsTriggered} | RUN SCORE: ${getRunScore()}`);
        if (enhancedItems[player.equipped.weapon]) printToTerminal(`Weapon Enchantments: +${enhancedItems[player.equipped.weapon]} levels`);
    }

    function showGameStats() {
        printToTerminal("=== CAREER STATISTICS ===");
        printToTerminal(`Total Runs: ${gameStats.totalRuns} | Kills: ${gameStats.totalKills} | Distance: ${gameStats.distanceTraveled}`);
        printToTerminal(`Items Crafted: ${gameStats.itemsCrafted} | Items Collected: ${gameStats.itemsPickedUp}`);
        printToTerminal(`Damage Dealt: ${gameStats.damageDealt} | Damage Taken: ${gameStats.damageTaken}`);
        printToTerminal(`Bosses Encountered: ${gameStats.bossesFought} | Bosses Defeated: ${gameStats.bossesDefeated}`);
        printToTerminal(`Mini-Bosses Defeated: ${gameStats.miniBossesDefeated} | Relics Found: ${gameStats.relicsFound}`);
        printToTerminal(`Max Combo: ${gameStats.bestCombo || maxCombo} | Highest Hit: ${gameStats.highestDamageHit || 0}`);
        printToTerminal(`Secret Rooms: ${gameStats.secretRoomsFound || 0} | Companions: ${gameStats.companionsSummoned || 0} | Hazards: ${gameStats.hazardsTriggered || 0}`);
    }

    function showAchievements() {
        printToTerminal("=== ACHIEVEMENTS ===");
        let unlockedCount = 0;
        for (let [key, value] of Object.entries(achievements)) {
            if (value) {
                unlockedCount++;
                printToTerminal(`✅ ${key.replace(/([A-Z])/g, ' $1').toUpperCase()}`);
            }
        }
        printToTerminal(`Total Unlocked: ${unlockedCount}/${Object.keys(achievements).length}`);
    }

    function checkAchievements() {
        if (gameStats.totalKills === 1) achievements.firstBlood = true;
        if (gameStats.totalKills >= 50) achievements.fiftyKills = true;
        if (gameStats.totalKills >= 100) achievements.hundredKills = true;
        if (gameStats.distanceTraveled >= 500) achievements.distanceRunner = true;
        if (gameStats.itemsCrafted >= 20) achievements.craftMaster = true;
        if (omegaDefeated) achievements.omegaSlayer = true;
        if (gameStats.bossesDefeated >= 5) achievements.nocturnal = true;
        if (gameStats.itemsPickedUp >= 100) achievements.collector = true;
        if (player.hp === player.maxHp && gameStats.damageTaken > 0 && gameStats.bossesDefeated > 0) achievements.survivor = true;
        if (player.mp < player.maxMp / 2 && gameStats.damageDealt > gameStats.damageTaken) achievements.magicUser = true;
    }

    function showBiomeInfo() {
        if (!Object.keys(discoveredPortals).length) return printToTerminal("You haven't discovered any other biomes yet. Explore further!");
        printToTerminal("=== DISCOVERED BIOMES ===");
        for (let [biome, discovered] of Object.entries(discoveredPortals)) {
            if (discovered) {
                let effect = biomeEffects[biome] || {};
                printToTerminal(`${biome.toUpperCase()}: Damage +${effect.damageBonus || 'none'} | Loot +${Math.round((effect.lootBonus || 0) * 100)}%`);
            }
        }
    }

    function generateEnemyTier(baseEnemy) {
        // Add random prefixes/titles to enemies based on difficulty
        let tiers = ['', 'Elite ', 'Legendary ', 'Mythic '];
        let tierChance = Math.min(0.3, Math.abs(playerX + playerY) / 500);
        let tier = Math.random() < tierChance ? Math.floor(Math.random() * 3) + 1 : 0;
        
        if (tier === 0) return baseEnemy;
        
        let scaled = JSON.parse(JSON.stringify(baseEnemy));
        let multiplier = 1 + (tier * 0.4); // 1.4x, 1.8x, 2.2x
        scaled.name = tiers[tier] + baseEnemy.name;
        scaled.hp = Math.floor(scaled.hp * multiplier);
        scaled.attack = Math.floor(scaled.attack * multiplier);
        scaled.xp = Math.floor(scaled.xp * multiplier * 1.5);
        scaled.credits = Math.floor(scaled.credits * multiplier);
        return scaled;
    }

    function getItemComparison(newItem) {
        let currentEquipped = null;
        let comparison = "";
        if (weaponStats[newItem]) {
            currentEquipped = player.equipped.weapon;
            if (currentEquipped) {
                let newDmg = weaponStats[newItem] + (player.attack - (weaponStats[currentEquipped] || 0));
                let oldDmg = weaponStats[currentEquipped];
                let diff = newDmg - oldDmg;
                comparison = `[${diff > 0 ? '+' : ''}${diff} ATK vs ${currentEquipped}]`;
            }
        } else if (armorStats[newItem]) {
            currentEquipped = player.equipped.armor;
            if (currentEquipped) {
                let newDef = armorStats[newItem] + (player.defense - (armorStats[currentEquipped] || 0));
                let oldDef = armorStats[currentEquipped];
                let diff = newDef - oldDef;
                comparison = `[${diff > 0 ? '+' : ''}${diff} DEF vs ${currentEquipped}]`;
            }
        }
        return comparison;
    }

    function clampNumber(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getActiveRoom() {
        return worldMap[`${playerX},${playerY}`] || null;
    }

    function getFactionFromRoom(room) {
        if (!room) return 'merchant';
        if (room.isShop) return 'merchant';
        return room.theme || 'merchant';
    }

    function adjustReputation(faction, amount) {
        if (reputation[faction] === undefined) reputation[faction] = 0;
        reputation[faction] = clampNumber(reputation[faction] + amount, -20, 20);
    }

    function getReputationLabel(faction) {
        let score = reputation[faction] || 0;
        if (score >= 10) return 'trusted';
        if (score >= 4) return 'friendly';
        if (score <= -10) return 'hostile';
        if (score <= -4) return 'wary';
        return 'neutral';
    }

    function ensureStatusContainer(target) {
        if (!target.statusEffects) target.statusEffects = {};
    }

    function applyStatusEffect(target, effect, turns, power = 1) {
        if (!target) return;
        ensureStatusContainer(target);
        const existing = target.statusEffects[effect];
        if (!existing || turns > existing.turns || power > existing.power) {
            target.statusEffects[effect] = { turns, power };
        }
    }

    function statusEffectLabel(effect) {
        const labels = {
            burning: 'burns',
            bleeding: 'bleeds',
            poisoned: 'is poisoned',
            frozen: 'is frozen',
            stunned: 'is stunned'
        };
        return labels[effect] || effect;
    }

    function describeStatusEffects(target) {
        if (!target || !target.statusEffects) return "";
        const effectList = Object.entries(target.statusEffects).map(([effect, data]) => `${effect}(${data.turns})`);
        return effectList.join(', ');
    }

    function tickStatusEffects(target, targetName) {
        if (!target || !target.statusEffects) return { skipped: false, dead: false };

        let skipped = false;
        for (let effect of Object.keys({ ...target.statusEffects })) {
            let data = target.statusEffects[effect];

            if (['burning', 'bleeding', 'poisoned'].includes(effect)) {
                let damage = Math.max(1, data.power);
                target.hp -= damage;
                if (target === currentEnemy) {
                    gameStats.damageDealt += damage;
                    printToTerminal(`🔥 ${targetName} ${statusEffectLabel(effect)} for ${damage} damage.`);
                } else {
                    gameStats.damageTaken += damage;
                    printToTerminal(`⚠️ You ${statusEffectLabel(effect)} for ${damage} damage.`);
                }
            } else if (effect === 'stunned') {
                skipped = true;
                if (target === currentEnemy) {
                    printToTerminal(`💫 ${targetName} is stunned and loses a turn!`);
                } else {
                    printToTerminal(`💫 You are stunned and struggle to act.`);
                }
            } else if (effect === 'frozen') {
                if (target === currentEnemy) {
                    printToTerminal(`🧊 ${targetName} is frozen and its next attack will be weaker.`);
                } else {
                    printToTerminal(`🧊 Your limbs are frozen; your movements feel sluggish.`);
                }
            }

            data.turns -= 1;
            if (data.turns <= 0) {
                delete target.statusEffects[effect];
            }
        }

        if (target === player && Object.keys(target.statusEffects).length === 0) {
            player.status = null;
        }

        return { skipped, dead: target.hp <= 0 };
    }

    function applyCombatStartEffects(room) {
        if (room && room.hazard && !room.hazardApplied) {
            room.hazardApplied = true;
            applyRoomHazard(room);
        }

        let playerSkipped = !!(player.statusEffects && player.statusEffects.stunned);
        let enemySkipped = !!(currentEnemy && currentEnemy.statusEffects && currentEnemy.statusEffects.stunned);

        let playerStatus = tickStatusEffects(player, 'You');
        if (playerStatus.dead) {
            playerDeath('YOUR STATUS EFFECTS FINISH YOU OFF. GAME OVER.');
            return { blocked: true, playerSkipped: false, enemySkipped: false };
        }

        if (currentEnemy) {
            let enemyStatus = tickStatusEffects(currentEnemy, currentEnemy.name);
            if (enemyStatus.dead) {
                checkEnemyDeath();
                return { blocked: true, playerSkipped: false, enemySkipped: false };
            }
        }

        return { blocked: false, playerSkipped, enemySkipped };
    }

    function applyRoomHazard(room) {
        if (!room || !room.hazard) return;
        gameStats.hazardsTriggered++;

        if (room.hazard.type === 'radiation') {
            let playerDamage = Math.max(1, room.hazard.power - 1);
            let enemyDamage = currentEnemy ? Math.max(1, room.hazard.power - 2) : 0;
            player.hp -= playerDamage;
            gameStats.damageTaken += playerDamage;
            printToTerminal(`☢️ Radiation floods the room. You take ${playerDamage} damage.`);
            if (currentEnemy && enemyDamage > 0) {
                currentEnemy.hp -= enemyDamage;
                gameStats.damageDealt += enemyDamage;
                printToTerminal(`☢️ The radiation also scorches ${currentEnemy.name} for ${enemyDamage} damage.`);
            }
            if (Math.random() < 0.5) applyStatusEffect(player, 'poisoned', 2, 1);
        } else if (room.hazard.type === 'plasma') {
            printToTerminal('🔥 Plasma vents pulse through the floor. Fire damage is amplified here.');
            if (currentEnemy) applyStatusEffect(currentEnemy, 'burning', 1, 1);
        } else if (room.hazard.type === 'ice') {
            printToTerminal('🧊 Freezing airflow makes the room unstable. Attacks feel slower.');
            if (currentEnemy) applyStatusEffect(currentEnemy, 'frozen', 1, 1);
        } else if (room.hazard.type === 'static') {
            printToTerminal('⚡ Static arcs across the chamber. One careless strike can stun you.');
            if (currentEnemy) applyStatusEffect(currentEnemy, 'stunned', 1, 1);
        }
    }

    function getCompanionTemplate() {
        const companionByClass = {
            'Neophyte Striker': { name: 'Combat Drone', damage: 3, turns: 2, cost: 4, effect: 'burning' },
            'Glitched Weaver': { name: 'Glitch Familiar', damage: 2, turns: 3, cost: 5, effect: 'burning' },
            'Rusted Sentinel': { name: 'Shield Bot', damage: 2, turns: 3, cost: 3, effect: 'stunned' },
            'Scavenger Recruit': { name: 'Scrap Rat', damage: 2, turns: 2, cost: 3, effect: 'bleeding' },
            'Failed Experiment': { name: 'Mutant Clone', damage: 4, turns: 2, cost: 5, effect: 'burning' }
        };

        return companionByClass[player.class] || null;
    }

    function summonCompanion() {
        if (!currentEnemy) return printToTerminal('You can only summon a companion in combat.');
        if (activeCompanion) return printToTerminal(`Your ${activeCompanion.name} is already fighting beside you.`);

        let template = getCompanionTemplate();
        if (!template) return printToTerminal('Your class cannot summon a companion yet.');
        if (player.mp < template.cost) return printToTerminal(`Not enough MP. Summoning costs ${template.cost} MP.`);

        player.mp -= template.cost;
        activeCompanion = { ...template };
        gameStats.companionsSummoned++;
        printToTerminal(`🤝 ${activeCompanion.name} joins the fight for ${activeCompanion.turns} turns!`);
    }

    function processCompanionAttack() {
        if (!activeCompanion || !currentEnemy) return;

        let damage = activeCompanion.damage + Math.floor(player.level / 3);
        currentEnemy.hp -= damage;
        gameStats.damageDealt += damage;
        printToTerminal(`🤝 ${activeCompanion.name} strikes for ${damage} damage!`);

        if (activeCompanion.effect === 'burning') {
            applyStatusEffect(currentEnemy, 'burning', 2, 2);
        } else if (activeCompanion.effect === 'bleeding') {
            applyStatusEffect(currentEnemy, 'bleeding', 2, 2);
        } else if (activeCompanion.effect === 'stunned') {
            applyStatusEffect(currentEnemy, 'stunned', 1, 1);
        }

        activeCompanion.turns -= 1;
        if (activeCompanion.turns <= 0) {
            printToTerminal(`🤝 ${activeCompanion.name} disengages and vanishes.`);
            activeCompanion = null;
        }
    }

    function applyBossVariant(boss) {
        if (!boss || !boss.isBoss) return boss;

        const variants = [
            { name: 'Enraged', hp: 1.1, attack: 1.1, xp: 1.05, credits: 1.05, effect: 'burning' },
            { name: 'Ancient', hp: 1.2, attack: 1.0, xp: 1.15, credits: 1.1, effect: 'frozen' },
            { name: 'Vampiric', hp: 1.1, attack: 1.1, xp: 1.1, credits: 1.15, effect: 'bleeding' },
            { name: 'Apex', hp: 1.25, attack: 1.2, xp: 1.2, credits: 1.2, effect: 'stunned' }
        ];
        let variant = getRandom(variants);
        boss.baseName = boss.name;
        boss.variant = variant.name.toLowerCase();
        boss.variantEffect = variant.effect;
        boss.name = `${variant.name} ${boss.name}`;
        boss.hp = Math.floor(boss.hp * variant.hp);
        boss.attack = Math.floor(boss.attack * variant.attack);
        boss.xp = Math.floor(boss.xp * variant.xp);
        boss.credits = Math.floor(boss.credits * variant.credits);
        return boss;
    }

    function getTransmutationRecipe(ingredients) {
        const recipeBook = {
            'energy cell + scrap metal': { result: 'plasma core', rarity: 'rare' },
            'antidote + health potion': { result: 'stabilizer', rarity: 'uncommon' },
            'blood crystal + morphic gel': { result: 'bio-hybrid core', rarity: 'rare' },
            'dark matter + void essence': { result: 'reality shard', rarity: 'legendary' },
            'keycard + rusty key': { result: 'master access key', rarity: 'epic' }
        };

        let normalized = ingredients.map(item => item.trim().toLowerCase()).sort().join(' + ');
        return recipeBook[normalized] || null;
    }

    function showItemComparison(itemName) {
        if (!itemName) return printToTerminal("Compare what? Type 'compare [item]'.");
        let comparison = getItemComparison(itemName);
        if (!comparison) return printToTerminal(`No direct comparison available for '${itemName}'.`);
        printToTerminal(`${itemName}: ${comparison}`);
    }

    function getRunScore() {
        return gameStats.totalKills * 10 + credits + (gameStats.bossesDefeated * 50);
    }

    function getRunTimeSeconds() {
        return runStartTime ? Math.floor((Date.now() - runStartTime) / 1000) : 0;
    }

    function showReputation() {
        printToTerminal("=== REPUTATION ===");
        Object.entries(reputation).forEach(([faction, score]) => {
            let enemyMult = getFactionEnemyMultiplier(faction);
            let lootMult = getFactionLootMultiplier(faction);
            printToTerminal(`${faction.toUpperCase()}: ${score} (${getReputationLabel(faction)}) | Enemy x${enemyMult.toFixed(2)} | Loot x${lootMult.toFixed(2)}`);
        });
    }

    function resolveMiniBossChoice(choice) {
        let room = getActiveRoom();
        if (!room || !room.enemy || !room.enemy.isMiniBoss || !room.enemy.encounterPending) {
            return printToTerminal('No mini-boss challenge choice is pending.');
        }

        if (!['1', '2', '3'].includes(choice)) {
            return printToTerminal("Choose: 'challenge 1', 'challenge 2', or 'challenge 3'.");
        }

        if (choice === '1') {
            room.enemy.hp = Math.floor(room.enemy.hp * 1.35);
            room.enemy.attack = Math.floor(room.enemy.attack * 1.15);
            room.enemy.xp = Math.floor(room.enemy.xp * 1.5);
            room.enemy.credits = Math.floor(room.enemy.credits * 1.5);
            room.enemy.relicDropChance = 0.45;
            printToTerminal('☠️ Blood Wager accepted: tougher enemy, much higher rewards, high relic chance.');
        } else if (choice === '2') {
            room.enemy.xp = Math.floor(room.enemy.xp * 1.3);
            room.enemy.credits = Math.floor(room.enemy.credits * 1.35);
            room.enemy.relicDropChance = 0.35;
            if (!room.hazard) {
                room.hazard = getRandom([
                    { type: 'radiation', power: 3 },
                    { type: 'plasma', power: 3 },
                    { type: 'static', power: 2 }
                ]);
            }
            printToTerminal('⚡ Chaotic Arena selected: hazards intensify, rewards rise.');
        } else {
            room.enemy.hp = Math.floor(room.enemy.hp * 0.85);
            room.enemy.attack = Math.floor(room.enemy.attack * 0.9);
            room.enemy.xp = Math.floor(room.enemy.xp * 0.75);
            room.enemy.credits = Math.floor(room.enemy.credits * 0.75);
            room.enemy.relicDropChance = 0.1;
            printToTerminal('🛡️ Safe Approach selected: easier fight, smaller rewards.');
        }

        room.enemy.encounterPending = false;
        generateEnemyIntent(room.enemy);
        announceEnemyIntent(room.enemy);
    }

    function processTransmute(target) {
        if (!target) return printToTerminal("Transmute what? Use 'transmute item1 + item2'.");

        let ingredients = target.split(/\s*\+\s*|\s+and\s+/i).map(part => part.trim()).filter(Boolean);
        if (ingredients.length < 2) return printToTerminal("You need two ingredients. Example: transmute scrap metal + energy cell");

        let recipe = getTransmutationRecipe(ingredients);
        if (!recipe) return printToTerminal(`Nothing happens. Those ingredients do not resonate together.`);

        let missing = ingredients.filter(item => inventoryIndexByName(item) === -1);
        if (missing.length > 0) return printToTerminal(`Missing ingredients: ${missing.join(', ')}`);

        ingredients.forEach(item => removeFromInventoryIndex(inventoryIndexByName(item)));
        addToInventory(recipe.result, recipe.rarity);
        gameStats.itemsCrafted++;
        printToTerminal(`✨ Transmutation succeeded! You created [${recipe.result}] (${recipe.rarity}).`);
    }

    function buildRunSummary(outcome) {
        let distance = Math.abs(playerX) + Math.abs(playerY);
        let runTime = getRunTimeSeconds();
        let score = getRunScore();

        return {
            outcome,
            score,
            distance,
            runTime,
            bestCombo: gameStats.bestCombo || maxCombo,
            highestDamageHit: gameStats.highestDamageHit || 0,
            secretsFound: gameStats.secretRoomsFound || 0,
            companionsSummoned: gameStats.companionsSummoned || 0,
            hazardsTriggered: gameStats.hazardsTriggered || 0,
            modifierText: Object.entries(challengeModifiers).filter(([, value]) => value).map(([key]) => key).join(', ') || 'none'
        };
    }

    function showRunSummary(outcome) {
        lastRunSummary = buildRunSummary(outcome);
        printToTerminal('=== RUN SUMMARY ===');
        printToTerminal(`Outcome: ${lastRunSummary.outcome}`);
        printToTerminal(`Score: ${lastRunSummary.score} | Kills: ${gameStats.totalKills} | Distance: ${lastRunSummary.distance}`);
        printToTerminal(`Run Time: ${Math.floor(lastRunSummary.runTime / 60)}m${lastRunSummary.runTime % 60}s | Best Combo: ${lastRunSummary.bestCombo}`);
        printToTerminal(`Highest Hit: ${lastRunSummary.highestDamageHit} | Secrets: ${lastRunSummary.secretsFound} | Companions: ${lastRunSummary.companionsSummoned}`);
        printToTerminal(`Hazards Triggered: ${lastRunSummary.hazardsTriggered} | Modifiers: ${lastRunSummary.modifierText}`);
    }

    function applyDamageType(weaponName) {
        if (weaponName.includes('fire') || weaponName.includes('laser')) return 'fire';
        if (weaponName.includes('plasma')) return 'electric';
        if (weaponName.includes('cryo') || weaponName.includes('ice')) return 'ice';
        if (weaponName.includes('dragon')) return 'fire';
        if (weaponName.includes('void') || weaponName.includes('quantum')) return 'void';
        return 'mechanical';
    }

    function getEnchantmentBonus(item, baseDamage) {
        let bonus = 0;
        let enhancement = enhancedItems[item] || 0;
        if (enhancement > 0) bonus = enhancement * 3; // Each enchantment level = +3 damage
        return baseDamage + bonus;
    }

    function showEnchantmentStatus() {
        printToTerminal("=== ENCHANTMENTS (Type 'enchant [type]' to upgrade) ===");
        for (let [ench, data] of Object.entries(enchantments)) {
            let bar = '█'.repeat(data.level) + '░'.repeat(data.maxLevel - data.level);
            printToTerminal(`${ench}: [${bar}] Lvl ${data.level}/${data.maxLevel}`);
        }
    }

    function upgradeEnchantment(enchType) {
        if (!enchantments[enchType]) return printToTerminal("Unknown enchantment type.");
        let ench = enchantments[enchType];
        if (ench.level >= ench.maxLevel) return printToTerminal(`${enchType} is already maxed!`);
        if (!ench.cost.every(c => inventoryIndexByName(c) !== -1)) {
            return printToTerminal(`Missing materials. Need: ${ench.cost.join(' + ')}`);
        }
        ench.cost.forEach(c => removeFromInventoryIndex(inventoryIndexByName(c)));
        ench.level++;
        if (player.equipped.weapon) enhancedItems[player.equipped.weapon] = (enhancedItems[player.equipped.weapon] || 0) + 1;
        printToTerminal(`✨ ${enchType} upgraded to level ${ench.level}!`);
    }

    // ===== FAST TRAVEL SYSTEM =====
    function travelToPortal(biomeName) {
        if (!discoveredPortals[biomeName]) return printToTerminal(`You haven't discovered ${biomeName} yet. Explore to find it!`);
        let portal = portalLocations[biomeName];
        if (!portal) return printToTerminal("Portal not found!");
        
        printToTerminal(`✨ Opening dimensional portal to ${biomeName.toUpperCase()}...`);
        playerX = portal.x;
        playerY = portal.y;
        worldMap[`${playerX},${playerY}`] = worldMap[`${playerX},${playerY}`] || generateRoom(biomeName, null, playerX, playerY);
        executeLook();
    }

    function showPortals() {
        if (!Object.keys(discoveredPortals).length) return printToTerminal("No portals discovered. Travel further to unlock fast travel!");
        printToTerminal("=== DISCOVERED PORTALS ===");
        for (let [biome, discovered] of Object.entries(discoveredPortals)) {
            if (discovered) {
                let portal = portalLocations[biome];
                printToTerminal(`${biome.toUpperCase()}: ${portal.desc} | Type 'portal ${biome}'`);
            }
        }
    }

    // ===== ENHANCED TRADING SYSTEM =====
    function merchantSell() {
        printToTerminal("=== MERCHANT SHOP ===");
        if (merchantInventory.length === 0) {
            printToTerminal("Merchant is restocking. Come back later!");
            return;
        }
        let repLabel = getReputationLabel('merchant');
        merchantInventory.forEach((item, idx) => {
            let priceModifier = 1 - clampNumber((reputation.merchant || 0) * 0.02, -0.2, 0.2);
            let adjustedPrice = Math.max(1, Math.floor(item.price * priceModifier));
            printToTerminal(`[${idx+1}] ${item.name} - ${adjustedPrice} credits (Stock: ${item.stock}) [${item.rarity}]`);
        });
        printToTerminal(`Your Credits: ${credits} | Items Sold: ${playerItemsSold} | Merchant Reputation: ${repLabel}`);
        printToTerminal("Type 'buy [number]' to purchase (e.g., 'buy 1')");
    }

    function buyItem(itemIndex) {
        itemIndex = parseInt(itemIndex) - 1;
        if (itemIndex < 0 || itemIndex >= merchantInventory.length) return printToTerminal("Invalid item number.");
        
        let item = merchantInventory[itemIndex];
        if (item.stock <= 0) return printToTerminal(`${item.name} is out of stock!`);
        let priceModifier = 1 - clampNumber((reputation.merchant || 0) * 0.02, -0.2, 0.2);
        let adjustedPrice = Math.max(1, Math.floor(item.price * priceModifier));
        if (credits < adjustedPrice) return printToTerminal(`Not enough credits! Need ${adjustedPrice}, have ${credits}.`);
        
        credits -= adjustedPrice;
        item.stock--;
        addToInventory(item.name, item.rarity);
        playerCreditsSpent += adjustedPrice;
        
        printToTerminal(`✅ Bought ${item.name} for ${adjustedPrice} credits!`);
        gameStats.itemsPickedUp++;
        adjustReputation('merchant', 1);
    }

    function sellItem(itemName) {
        let idx = inventoryIndexByName(itemName);
        if (idx === -1) return printToTerminal(`You don't have a '${itemName}'.`);
        
        // Base price is 60% of crafting value
        let craftValue = masterRecipes[itemName]?.length || 1;
        let salePrice = Math.max(5, Math.floor(craftValue * 10 * (1 + clampNumber((reputation.merchant || 0) * 0.01, -0.15, 0.15))));
        
        removeFromInventoryIndex(idx);
        credits += salePrice;
        playerItemsSold++;
        printToTerminal(`✅ Sold ${itemName} for ${salePrice} credits!`);
        adjustReputation('merchant', 1);
    }

    // ===== QUEST CHAIN SYSTEM =====
    function initializeQuestChains() {
        // Start with the first quest available to all
        if (activeQuestChains.length === 0) {
            activeQuestChains.push(JSON.parse(JSON.stringify(questChains.rescue)));
        }
    }

    function progressQuestChain(chainId, npcName) {
        let chain = activeQuestChains.find(q => q.id === chainId);
        if (!chain) return printToTerminal("Quest not found or not active.");
        
        let nextStage = chain.stages[chain.currentStage];
        if (!nextStage) {
            chain.completed = true;
            printToTerminal(`✅ Quest Chain Complete: ${chain.title}! Check your stats.`);
            return;
        }
        
        // Check if next stage requirement is met
        if (nextStage.requires && !nextStage.requires.endsWith('_completed')) {
            return printToTerminal(`Complete the previous objective first.`);
        }
        
        // Check if we're talking to the right NPC
        let room = worldMap[`${playerX},${playerY}`];
        if (nextStage.npc !== "any" && nextStage.npc !== "Control Panel" && (!room.npc || room.npc.name !== nextStage.npc)) {
            return printToTerminal(`You need to talk to ${nextStage.npc}.`);
        }
        
        // Progress to next stage
        chain.currentStage++;
        credits += nextStage.reward;
        printToTerminal(`⭐ Objective Complete: ${nextStage.objective}`);
        printToTerminal(`Reward: ${nextStage.reward} credits`);
        
        // Check if quest chain is complete
        if (chain.currentStage >= chain.stages.length) {
            chain.completed = true;
            printToTerminal(`✅ Quest Chain Complete: ${chain.title}!`);
            gameStats.itemsCrafted += 1; // Track as meta-achievement
        }
    }

    function showActiveQuestChains() {
        if (activeQuestChains.length === 0) {
            printToTerminal("No active quest chains. Explore and talk to NPCs!");
            return;
        }
        printToTerminal("=== ACTIVE QUEST CHAINS ===");
        activeQuestChains.forEach(chain => {
            let stage = chain.stages[chain.currentStage];
            if (stage && !chain.completed) {
                printToTerminal(`${chain.title}: Stage ${chain.currentStage + 1}/${chain.stages.length}`);
                printToTerminal(`  Objective: ${stage.objective}`);
            } else if (chain.completed) {
                printToTerminal(`${chain.title}: ✅ COMPLETED`);
            }
        });
    }

    // ===== NEW GAME+ SYSTEM =====
    function prepareNewGamePlus() {
        if (!omegaDefeated) return printToTerminal("Finish the game first! Defeat the Omega Core and escape.");
        
        // Save current stats for carryover
        carryoverStats = {
            level: player.level,
            baseAttack: player.baseAttack,
            baseDefense: player.baseDefense,
            knownRecipes: [...player.knownRecipes],
            achievements: JSON.parse(JSON.stringify(achievements))
        };
        
        newGamePlusLevel++;
        printToTerminal(`✅ Ready for New Game+ Level ${newGamePlusLevel}!`);
        printToTerminal(`Enemies will be ${Math.round((1 + newGamePlusLevel * 0.3) * 100)}% stronger.`);
        printToTerminal(`Type 'ng+start' to begin with your bonuses.`);
    }

    function startNewGamePlus() {
        if (newGamePlusLevel === 0) return printToTerminal("Complete the game and type 'ng+prepare' first.");
        
        // Reset game but keep carryover bonuses
        inventory = [{ name: "health potion", rarity: 'common' }, { name: "scrap metal", rarity: 'common' }];
        credits = 0;
        playerX = 0; playerY = 0; worldMap = {};
        victoryX = null; victoryY = null; omegaDefeated = false;
        currentSaveSlot = null;
        comboCounter = 0;
        currentBiome = 'facility';
        currentSeed = null;
        dailyMode = false;
        weeklyMode = false;
        activeCompanion = null;
        challengeModifiers = { glassCannon: false, bountyHunter: false, hazardSurge: false, eliteThreat: false, permadeath: false };
        reputation = { merchant: 0, facility: 0, dungeon: 0, bio: 0, void: 0 };
        gameStats.totalRuns++;
        
        player = {
            level: Math.max(1, Math.floor(carryoverStats.level * 0.75)),
            hp: 10, maxHp: 10,
            mp: 5, maxMp: 5,
            baseAttack: carryoverStats.baseAttack || 1,
            attack: carryoverStats.baseAttack || 1,
            baseDefense: carryoverStats.baseDefense || 0,
            defense: carryoverStats.baseDefense || 0,
            xp: 0, xpNeeded: Math.floor(20 * Math.pow(1.5, newGamePlusLevel - 1)),
            knownRecipes: [...carryoverStats.knownRecipes],
            status: null,
            statusEffects: {},
            equipped: { weapon: null, armor: null, weaponEffect: null, armorEffect: null },
            guardStance: 0
        };
        
        achievements = JSON.parse(JSON.stringify(carryoverStats.achievements));
        activeRelics = [];
        relicFlags = { phoenixUsed: false };
        pendingRoomEvent = null;
        challengeMission = {
            featuredClass: null,
            weights: { distance: 10, credits: 1, kills: 0, bosses: 0, speedBonus: 0 }
        };
        currentEnemy = null; gameState = "CLASS_SELECT";
        leaderboard.currentRunRecorded = false;
        
        printToTerminal(`\n🌟 === NEW GAME+ LEVEL ${newGamePlusLevel} ===`);
        printToTerminal(`Enemies are ${Math.round((1 + newGamePlusLevel * 0.3) * 100)}% stronger!`);
        printToTerminal(`Choose your class to begin:`);
        printToTerminal("[1] NEOPHYTE STRIKER: 20 HP | 5 MP | +3 Base Attack");
        printToTerminal("[2] GLITCHED WEAVER: 12 HP | 20 MP | +1 Base Attack");
        printToTerminal("[3] RUSTED SENTINEL: 25 HP | 5 MP | +2 Base Defense");
        printToTerminal("[4] SCAVENGER RECRUIT: 15 HP | 10 MP | +2 Base Attack");
        printToTerminal("[5] FAILED EXPERIMENT: 10 HP | 10 MP | +4 Base Attack");
        updateStats();
    }

    function showInventory() {
        if (inventory.length === 0) return printToTerminal("Pockets are empty.");
        let out = inventory.map(it => {
            if (typeof it === 'string') return it;
            return `${it.name}${it.rarity ? ' [' + it.rarity + ']' : ''}`;
        }).join(", ");
        printToTerminal(`Inventory: ${out}`);
    }

    function showRecipes() {
        printToTerminal("--- KNOWN RECIPES ---");
        player.knownRecipes.forEach(r => printToTerminal(`[${r}]: requires ${masterRecipes[r].join(" + ")}`));
    }

    function saveGame(slot = 'default') {
        const saveData = { inventory, credits, playerX, playerY, worldMap, player, gameState, victoryX, victoryY, omegaDefeated, gameStats, achievements, enhancedItems, enchantments, discoveredPortals, maxCombo, previousSeeds, activeQuestChains, newGamePlusLevel, carryoverStats, playerCreditsSpent, playerItemsSold, gameSettings, dailyMode, weeklyMode, challengeModifiers, reputation, activeCompanion, lastRunSummary, currentEnemy, activeRelics, relicFlags, pendingRoomEvent, challengeMission, leaderboardCurrentRunRecorded: leaderboard.currentRunRecorded };
        localStorage.setItem("terminalRPG_save_" + slot, JSON.stringify(saveData));
        printToTerminal(`✅ GAME SAVED SUCCESSFULLY (Slot: ${slot}).`);
    }

    function showActiveQuests() {
        if (!player.activeQuests || player.activeQuests.length === 0) return printToTerminal("No active quests.");
        printToTerminal("--- ACTIVE QUESTS ---");
        player.activeQuests.forEach(q => printToTerminal(`${q.title}: requires [${q.requires}] - status: ${q.status || 'active'}`));
    }

    function useSkill(name, suppressEnemyRetaliation = false) {
        if (!name) return printToTerminal("Use which skill? Type 'skill [name]'.");
        name = name.toLowerCase();
        if (!player.class) return printToTerminal("You have no class skills yet.");
        if (!currentEnemy) return printToTerminal("Skills can currently be used only in combat.");

        if (player.class === 'Neophyte Striker') {
            if (name === 'power strike') {
                let dmg = player.attack + 5 + Math.floor(Math.random()*3);
                currentEnemy.hp -= dmg;
                printToTerminal(`💥 Power Strike deals ${dmg} damage!`);
                checkEnemyDeath();
                if (currentEnemy && !suppressEnemyRetaliation) enemyAttack();
                return;
            }
        }
        if (player.class === 'Glitched Weaver') {
            if (name === 'arcane burst') {
                if (player.mp < 8) return printToTerminal('Not enough MP (8)');
                player.mp -= 8; currentEnemy.hp -= 25;
                printToTerminal('⚡ Arcane Burst hits for 25 damage!'); checkEnemyDeath(); if (currentEnemy && !suppressEnemyRetaliation) enemyAttack(); return;
            }
        }
        if (player.class === 'Rusted Sentinel') {
            if (name === 'shield wall') {
                player.tempDefense = (player.tempDefense || 0) + 3;
                printToTerminal('🛡️ Shield Wall: defense increased for the next hit.'); enemyAttack(); return;
            }
        }
        if (player.class === 'Scavenger Recruit') {
            if (name === 'quick hack') {
                let steal = Math.floor(Math.random() * 10) + 5;
                credits += steal; currentEnemy.hp -= 5;
                printToTerminal(`🔧 Quick Hack: stole ${steal} credits and damaged the enemy for 5.`); checkEnemyDeath(); if (currentEnemy && !suppressEnemyRetaliation) enemyAttack(); return;
            }
        }
        if (player.class === 'Failed Experiment') {
            if (name === 'berserk') {
                let dmg = 30 + Math.floor(Math.random()*10);
                player.hp = Math.max(1, player.hp - 5);
                currentEnemy.hp -= dmg;
                printToTerminal(`🔥 Berserk deals ${dmg} damage but costs 5 HP.`); checkEnemyDeath(); if (currentEnemy && !suppressEnemyRetaliation) enemyAttack(); return;
            }
        }
        printToTerminal('Unknown or unusable skill.');
    }

    function showSettings() {
        printToTerminal("=== GAME SETTINGS ===");
        printToTerminal(`Difficulty: ${gameSettings.difficulty}`);
        printToTerminal(`Text Speed: ${gameSettings.textSpeed}ms`);
        printToTerminal(`Color Scheme: ${gameSettings.colorScheme}`);
        printToTerminal(`Tooltips: ${gameSettings.showTooltips ? 'ON' : 'OFF'}`);
        printToTerminal(`Auto-Save: ${gameSettings.autoSave ? 'ON' : 'OFF'}`);
        printToTerminal(`Auto-Pickup: ${gameSettings.autoPickup}`);
        printToTerminal(`Permadeath: ${gameSettings.permadeath ? 'ON' : 'OFF'}`);
        printToTerminal("\nType 'set [key] [value]' to change settings");
        printToTerminal("Available: difficulty (EASY/NORMAL/HARD/INSANE), textSpeed (1-200), colorScheme (terminal-green/cyberpunk/monochrome), autoPickup (off/common/all), permadeath (on/off)");
    }

    function changeSetting(key, value) {
        if (!key) return printToTerminal("Usage: set [key] [value]");
        
        if (key === 'difficulty') {
            if (['EASY', 'NORMAL', 'HARD', 'INSANE'].includes(value.toUpperCase())) {
                gameSettings.difficulty = value.toUpperCase();
                printToTerminal(`✓ Difficulty set to ${value.toUpperCase()}`);
            } else {
                printToTerminal("Options: EASY, NORMAL, HARD, INSANE");
            }
        } else if (key === 'textSpeed') {
            let speed = parseInt(value);
            if (speed >= 1 && speed <= 200) {
                gameSettings.textSpeed = speed;
                printToTerminal(`✓ Text speed set to ${speed}ms`);
            } else {
                printToTerminal("Range: 1-200");
            }
        } else if (key === 'colorScheme') {
            if (Object.keys(colorSchemes).includes(value)) {
                gameSettings.colorScheme = value;
                printToTerminal(`✓ Color scheme set to ${value}`);
            } else {
                printToTerminal(`Options: ${Object.keys(colorSchemes).join(', ')}`);
            }
        } else if (key === 'tooltips') {
            gameSettings.showTooltips = value.toLowerCase() === 'on';
            printToTerminal(`✓ Tooltips ${gameSettings.showTooltips ? 'ON' : 'OFF'}`);
        } else if (key === 'autoPickup') {
            let option = value.toLowerCase();
            if (['off', 'common', 'all'].includes(option)) {
                gameSettings.autoPickup = option;
                printToTerminal(`✓ Auto-pickup set to ${option}`);
            } else {
                printToTerminal("Options: off, common, all");
            }
        } else if (key === 'permadeath') {
            gameSettings.permadeath = value.toLowerCase() === 'on';
            printToTerminal(`✓ Permadeath ${gameSettings.permadeath ? 'ON' : 'OFF'}`);
        } else {
            printToTerminal("Unknown setting. Type 'settings' for help.");
        }
    }

    function showLeaderboard() {
        printToTerminal("=== LEADERBOARD ===");
        
        // Update leaderboard with current run if finished
        if (omegaDefeated && !leaderboard.currentRunRecorded) {
            let runTime = getRunTimeSeconds();
            let score = getRunScore();
            leaderboard.topScores.push({ score, kills: gameStats.totalKills, difficulty: gameSettings.difficulty, runTime });
            leaderboard.topScores.sort((a, b) => b.score - a.score);
            leaderboard.topScores = leaderboard.topScores.slice(0, leaderboard.maxSize);
            leaderboard.currentRunRecorded = true;
        }
        
        if (leaderboard.topScores.length === 0) {
            return printToTerminal("No scores recorded yet. Complete a run!");
        }
        
        printToTerminal("--- TOP SCORES ---");
        leaderboard.topScores.forEach((entry, idx) => {
            let runTime = entry.runTime ? `${Math.floor(entry.runTime / 60)}m${entry.runTime % 60}s` : '?';
            printToTerminal(`${idx + 1}. Score: ${entry.score} | Kills: ${entry.kills} | ${entry.difficulty} | Time: ${runTime}`);
        });
    }

    function showCombatLog() {
        if (combatLog.length === 0) {
            return printToTerminal("No combat history yet.");
        }
        printToTerminal("=== LAST COMBAT ACTIONS ===");
        combatLog.slice(-15).forEach(action => printToTerminal(action));
    }

    function showHelp() {
        let isInRoom = !!worldMap[`${playerX},${playerY}`];
        
        printToTerminal("=== GLOBAL COMMANDS ===");
        printToTerminal("📊 STATS: stats (S), careerStats, achievements, buffs, combatlog, reputation, relics");
        printToTerminal("⚙️  SETTINGS: settings, set [key] [value], help (?), tutorial, compare [item]");
        printToTerminal("💾 SAVE/LOAD: save [slot], load [slot], saves, export-save");
        printToTerminal("🏆 META: leaderboard (LB), ng+prepare, ng+start, daily, weekly, score");
        printToTerminal("🗺️  WORLD: map (M), biomes, seeds, summon, transmute [a] + [b], event [1/2], challenge [1/2/3], intent");
        
        printToTerminal("");
        printToTerminal("=== CONTEXT-AWARE HELP ===");
        
        if (isInRoom) {
            let room = worldMap[`${playerX},${playerY}`];
            
            if (room && room.exits) {
                let validExits = room.exits.filter(e => validDirections.includes(e));
                if (validExits.length > 0) {
                    printToTerminal(`📍 MOVEMENT: ${validExits.join(", ")} | look | map`);
                }
            }
            
            if (room && room.npc) {
                printToTerminal(`🤝 NPC HERE: talk | give [item]`);
            }
            
            if (room && room.item) {
                printToTerminal(`📦 ITEM HERE: take ${room.item}`);
            }
            
            if (room && room.resourceNode && room.resourceNode.amount > 0) {
                printToTerminal(`💎 RESOURCES: gather (${room.resourceNode.amount} remaining)`);
            }

            if (room && room.secretRoom) {
                printToTerminal("🕵️ SECRET ROOM: explore, compare, take");
            }

            if (room && room.hazard) {
                printToTerminal(`☢️ HAZARD: ${room.hazard.type}`);
            }
            
            if (currentEnemy) {
                printToTerminal(`⚔️  IN COMBAT: attack | cast [spell] | run | use [item] | summon | guard | intent`);
            }
            
            if (room && room.isShop) {
                printToTerminal(`🏪 SHOP: buy | sell [item] | merchant`);
            }
            
            if (room && room.hackableConsole) {
                printToTerminal(`💻 CONSOLE: hack`);
            }
            
            if (room && room.hasTurrets) {
                printToTerminal(`🔫 TURRETS: dodge`);
            }
            
            printToTerminal("");
            printToTerminal("💡 Tip: Type 'help' when in a room for context-specific commands!");
        } else {
            printToTerminal("(You're not in a room yet. Navigate with north/south/east/west)");
        }

        if (pendingRoomEvent) {
            printToTerminal("🎲 Event active: resolve with 'event 1' or 'event 2'.");
        }
    }

    function exportSave() {
        let saveData = {
            player: player,
            worldMap: worldMap,
            gameStats: gameStats,
            achievements: achievements,
            inventory: inventory,
            credits: credits,
            gameSettings: gameSettings,
            reputation: reputation,
            difficulty: gameSettings.difficulty,
            timestamp: new Date().toISOString()
        };
        
        let dataStr = JSON.stringify(saveData, null, 2);
        let blob = new Blob([dataStr], { type: 'application/json' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = `rpg-save-${player.class}-${Date.now()}.json`;
        a.click();
        
        printToTerminal("✓ Save exported to file!");
    }

    function playerDeath(message) {
        gameState = "DEAD";
        
        // Show dramatic death screen
        printToTerminal("", 0);
        printToTerminal("█████████████████████████████████████████████████", 0);
        printToTerminal("█░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█", 0);
        printToTerminal("█  ▄▀▀▀▀▄  ▄▀▀▀▀▄  ▄▀▀▄ ▄▀▀▄  ▄▀▀▀▀▀▄  █", 0);
        printToTerminal("█  █      ▀     ▀█ █   █    █ █       █ █", 0);
        printToTerminal("█  █              █ █▄▄▄█    █ █       █ █", 0);
        printToTerminal("█  █              █ █      ▄▄█ █       █ █", 0);
        printToTerminal("█   ▀▄▄▄▄▄▄▄▄▄▄▄▀█  ▀▀▀▀  ▀▀ ▀ ▀▀▀▀▀▀█ █", 0);
        printToTerminal("█░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█", 0);
        printToTerminal("█████████████████████████████████████████████████", 0);
        printToTerminal("", 0);
        printToTerminal(message);
        
        // Show final stats
        let distance = Math.abs(playerX) + Math.abs(playerY);
        let runTime = getRunTimeSeconds();
        let score = getRunScore();
        
        printToTerminal("");
        printToTerminal("=== FINAL STATS ===");
        printToTerminal(`Score: ${score} | Kills: ${gameStats.totalKills} | Distance: ${distance}`);
        printToTerminal(`Bosses Slain: ${gameStats.bossesDefeated} | Run Time: ${Math.floor(runTime / 60)}m${runTime % 60}s`);
        printToTerminal(`Damage Dealt: ${gameStats.damageDealt} | Damage Taken: ${gameStats.damageTaken}`);
        printToTerminal(`Max Combo: ${maxCombo}`);
        showRunSummary('DEFEAT');
        
        // Clean up save if it exists
        if (currentSaveSlot) {
            localStorage.removeItem("terminalRPG_save_" + currentSaveSlot);
            printToTerminal(`💀 SAVE FILE DELETED: [${currentSaveSlot}]`);
        }

        if (gameSettings.permadeath || challengeModifiers.permadeath) {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('terminalRPG_save_')) {
                    localStorage.removeItem(key);
                }
            });
            printToTerminal('☠️ Permadeath wiped all save slots.');
        }
        
        printToTerminal("");
        printToTerminal("Type 'restart' to begin a new run.");
    }

    function restartGame() {
        inventory = [{ name: "health potion", rarity: 'common' }, { name: "scrap metal", rarity: 'common' }];
        credits = 0;
        playerX = 0; playerY = 0; worldMap = {};
        victoryX = null; victoryY = null; omegaDefeated = false;
        currentSaveSlot = null;
        comboCounter = 0;
        currentBiome = 'facility';
        currentSeed = null;
        dailyMode = false;
        weeklyMode = false;
        activeCompanion = null;
        challengeModifiers = { glassCannon: false, bountyHunter: false, hazardSurge: false, eliteThreat: false, permadeath: false };
        reputation = { merchant: 0, facility: 0, dungeon: 0, bio: 0, void: 0 };
        gameStats.totalRuns++; // Track new run
        activeQuestChains = []; // Reset quest chains
        
        player = {
            level: 1,
            hp: 10, maxHp: 10,
            mp: 5, maxMp: 5,
            baseAttack: 1, attack: 1,
            baseDefense: 0, defense: 0,
            xp: 0, xpNeeded: 20,
            knownRecipes: ["medkit", "rusty club"],
            status: null,
            statusEffects: {},
            equipped: { weapon: null, armor: null, weaponEffect: null, armorEffect: null },
            guardStance: 0
        };

        activeRelics = [];
        relicFlags = { phoenixUsed: false };
        pendingRoomEvent = null;
        challengeMission = {
            featuredClass: null,
            weights: { distance: 10, credits: 1, kills: 0, bosses: 0, speedBonus: 0 }
        };
        
        // Apply NG+ bonuses if applicable
        if (newGamePlusLevel > 0) {
            initNewGamePlus();
        }
        
        // Initialize systems
        initMerchantInventory();
        initializeQuestChains();
        
        currentEnemy = null; gameState = "CLASS_SELECT";
        leaderboard.currentRunRecorded = false;
        printToTerminal("\n--- RESTARTING SIMULATION ---");
        if (newGamePlusLevel > 0) {
            printToTerminal(`🌟 NEW GAME+ LEVEL ${newGamePlusLevel}`);
        }
        printToTerminal("Please select your class:");
        printToTerminal("[1] NEOPHYTE STRIKER: 20 HP | 5 MP | +3 Base Attack (Melee Focus)");
        printToTerminal("[2] GLITCHED WEAVER: 12 HP | 20 MP | +1 Base Attack (Magic Focus)");
        printToTerminal("[3] RUSTED SENTINEL: 25 HP | 5 MP | +2 Base Defense (Survival Focus)");
        printToTerminal("[4] SCAVENGER RECRUIT: 15 HP | 10 MP | +2 Base Attack (Starts with Map & 25c)");
        printToTerminal("[5] FAILED EXPERIMENT: 10 HP | 10 MP | +4 Base Attack (High Risk/Reward)");
        updateStats();
    }

    function loadGame(slot = 'default') {
        const saved = localStorage.getItem("terminalRPG_save_" + slot);
        if (!saved) return printToTerminal(`No save file found for slot: ${slot}.`);
        let data = JSON.parse(saved);
        inventory = data.inventory; credits = data.credits; playerX = data.playerX; playerY = data.playerY;
        worldMap = data.worldMap; player = data.player; gameState = data.gameState; currentEnemy = data.currentEnemy || null; 
        victoryX = data.victoryX || victoryX;
        victoryY = data.victoryY || victoryY;
        omegaDefeated = data.omegaDefeated || false;
        gameStats = data.gameStats || gameStats;
        achievements = data.achievements || achievements;
        enhancedItems = data.enhancedItems || enhancedItems;
        enchantments = data.enchantments || enchantments;
        discoveredPortals = data.discoveredPortals || discoveredPortals;
        maxCombo = data.maxCombo || 0;
        previousSeeds = data.previousSeeds || [];
        activeQuestChains = data.activeQuestChains || [];
        newGamePlusLevel = data.newGamePlusLevel || 0;
        carryoverStats = data.carryoverStats || carryoverStats;
        playerCreditsSpent = data.playerCreditsSpent || 0;
        playerItemsSold = data.playerItemsSold || 0;
        gameSettings = data.gameSettings || gameSettings;
        dailyMode = data.dailyMode || false;
        weeklyMode = data.weeklyMode || false;
        challengeModifiers = data.challengeModifiers || challengeModifiers;
        reputation = data.reputation || reputation;
        activeCompanion = data.activeCompanion || null;
        lastRunSummary = data.lastRunSummary || null;
        activeRelics = data.activeRelics || [];
        relicFlags = data.relicFlags || { phoenixUsed: false };
        pendingRoomEvent = data.pendingRoomEvent || null;
        challengeMission = data.challengeMission || challengeMission;
        challengeMission.weights = challengeMission.weights || { distance: 10, credits: 1, kills: 0, bosses: 0, speedBonus: 0 };
        leaderboard.currentRunRecorded = !!data.leaderboardCurrentRunRecorded;
        gameSettings.autoPickup = gameSettings.autoPickup || 'off';
        gameSettings.permadeath = !!gameSettings.permadeath;
        challengeModifiers = Object.assign({ glassCannon: false, bountyHunter: false, hazardSurge: false, eliteThreat: false, permadeath: false }, challengeModifiers);
        reputation = Object.assign({ merchant: 0, facility: 0, dungeon: 0, bio: 0, void: 0 }, reputation);
        player.statusEffects = player.statusEffects || {};
        player.guardStance = player.guardStance || 0;
        player.equipped = player.equipped || { weapon: null, armor: null, weaponEffect: null, armorEffect: null };
        if (currentEnemy) {
            worldMap[`${playerX},${playerY}`] = worldMap[`${playerX},${playerY}`] || {};
            worldMap[`${playerX},${playerY}`].enemy = currentEnemy;
            if (!currentEnemy.intent) generateEnemyIntent(currentEnemy);
        }
        currentSaveSlot = slot;
        updateStats();
        printToTerminal(`✅ GAME LOADED SUCCESSFULLY (Slot: ${slot}).`);
        if(gameState === "PLAYING" && !currentEnemy) executeLook();
    }

    function autoSave() {
        currentSaveSlot = 'autosave';
        saveGame('autosave');
        printToTerminal('Autosaved.');
    }

    function listSaves() {
        const keys = Object.keys(localStorage);
        const saves = keys.filter(k => k.startsWith('terminalRPG_save_')).map(k => k.replace('terminalRPG_save_', ''));
        if (saves.length === 0) return printToTerminal('No saves found.');
        printToTerminal('--- SAVED GAMES ---');
        saves.forEach(s => printToTerminal(s));
    }

    function castMagic(spell, suppressEnemyRetaliation = false) {
        let mutator = getRoomMutator();
        let healCost = getSpellCost(mutator && mutator.id === 'arcane-surge' ? 12 : 10);
        let fireballCost = getSpellCost(mutator && mutator.id === 'arcane-surge' ? 12 : 10);

        if (spell === "heal") {
            if (mutator && mutator.id === 'no-healing') return printToTerminal('The room rejects healing magic!');
            if (player.mp < healCost) return printToTerminal(`Not enough MP! (Costs ${healCost})`);
            player.mp -= healCost; player.hp = Math.min(player.maxHp, player.hp + 25);
            printToTerminal("✨ You cast Heal! HP restored.");
            if(currentEnemy && !suppressEnemyRetaliation) enemyAttack();
        } 
        else if (spell === "fireball") {
            if (!currentEnemy) return printToTerminal("You can only cast fireball in combat!");
            if (player.mp < fireballCost) return printToTerminal(`Not enough MP! (Costs ${fireballCost})`);
            player.mp -= fireballCost;
            let dmg = mutator && mutator.id === 'arcane-surge' ? 30 : 20;
            currentEnemy.hp -= dmg;
            printToTerminal(`🔥 You hurl a fireball for ${dmg} damage!`);
            applyStatusEffect(currentEnemy, 'burning', 2, 2);
            checkEnemyDeath();
            if (currentEnemy && !suppressEnemyRetaliation) enemyAttack();
        } else {
            printToTerminal(`Unknown spell. You know: 'heal', 'fireball' (Current cost ${healCost}/${fireballCost} MP).`);
        }
    }

    function getEffectTooltip(effect) {
        const tooltips = {
            vampiric: "Heals 30% of damage dealt",
            lifesteal: "Heals 50% of damage dealt",
            overclocked: "+5 damage but costs 3 MP per attack",
            dragonborn: "+2 damage per level",
            chaos: "Random damage multiplier (0.5x to 2x)",
            evasive: "20% chance to dodge incoming attacks",
            reflect: "15% chance to reflect 50% damage back",
            adaptive: "Defense scales with enemy damage",
            armored: "Increased defense value",
            null: "No special effect"
        };
        return tooltips[effect] || "Unknown effect";
    }

    function equipItem(itemName) {
        let idx = inventoryIndexByName(itemName);
        if (idx === -1) return printToTerminal(`You don't have a '${itemName}'.`);
        let it = inventory[idx]; if (typeof it === 'string') it = { name: it, rarity: 'common' };

        if (weaponStats[itemName]) {
            if (player.equipped.weapon) addToInventory(player.equipped.weapon, player.equipped.weaponRarity);
            player.equipped.weapon = itemName;
            player.equipped.weaponRarity = it.rarity || 'common';
            player.equipped.weaponEffect = itemEffects[itemName] || null;
            removeFromInventoryIndex(idx);
            let baseDamage = weaponStats[itemName];
            let enhancement = enhancedItems[itemName] ? ` [+${enhancedItems[itemName] * 3} from enchants]` : '';
            let effectText = player.equipped.weaponEffect ? ` [${player.equipped.weaponEffect}: ${getEffectTooltip(player.equipped.weaponEffect)}]` : '';
            printToTerminal(`You equipped the ${itemName}. DMG: ${baseDamage}${enhancement}${effectText}`);
        } else if (armorStats[itemName]) {
            if (player.equipped.armor) addToInventory(player.equipped.armor, player.equipped.armorRarity);
            player.equipped.armor = itemName;
            player.equipped.armorRarity = it.rarity || 'common';
            player.equipped.armorEffect = itemEffects[itemName] || null;
            removeFromInventoryIndex(idx);
            let baseDef = armorStats[itemName];
            let effectText = player.equipped.armorEffect ? ` [${player.equipped.armorEffect}: ${getEffectTooltip(player.equipped.armorEffect)}]` : '';
            printToTerminal(`You wore the ${itemName}. DEF: ${baseDef}${effectText}`);
        } else {
            printToTerminal("You can't equip that. Use 'use' for consumables.");
            return;
        }
        updateStats();
    }

    function useItem(itemName, suppressEnemyRetaliation = false) {
        let idx = inventoryIndexByName(itemName);
        if (idx === -1) return printToTerminal(`You don't have a '${itemName}'.`);
        let entry = inventory[idx]; if (typeof entry === 'string') entry = { name: entry, rarity: 'common' };
        let mutator = getRoomMutator();

        if (itemName === "system map") {
            drawMap();
            return; 
        }

        if (itemName.endsWith("blueprint")) {
            let rName = itemName.replace(" blueprint", "");
            if (player.knownRecipes.includes(rName)) return printToTerminal(`You already know how to craft a ${rName}.`);
            removeFromInventoryIndex(idx); player.knownRecipes.push(rName);
            printToTerminal(`*** You studied the blueprint! You can now craft: [${rName}] ***`);
            return;
        }

        if (itemName === "health potion") {
            if (mutator && mutator.id === 'no-healing') return printToTerminal('The room suppresses healing items.');
            removeFromInventoryIndex(idx); player.hp = Math.min(player.maxHp, player.hp + 15); 
            printToTerminal(`Drank health potion. HP up!`);
        } else if (itemName === "mana potion") {
            removeFromInventoryIndex(idx); player.mp = Math.min(player.maxMp, player.mp + 15); 
            printToTerminal(`Drank mana potion. MP up!`);
        } else if (itemName === "medkit") {
            if (mutator && mutator.id === 'no-healing') return printToTerminal('The room suppresses healing items.');
            removeFromInventoryIndex(idx); player.hp = Math.min(player.maxHp, player.hp + 30); 
            printToTerminal(`Used medkit. Huge HP heal!`);
        } else if (itemName === "antidote") {
            removeFromInventoryIndex(idx); player.status = null;
            if (player.statusEffects) delete player.statusEffects.poisoned;
            if (player.statusEffects && Object.keys(player.statusEffects).length === 0) player.status = null;
            printToTerminal(`Drank antidote. You are cured of ailments!`);
        } else {
            printToTerminal(`Try 'equip ${itemName}' if it's gear.`);
            return;
        }
        if(currentEnemy && !suppressEnemyRetaliation) enemyAttack(); 
    }

    function drawMap() {
        printToTerminal("Booting mapping software...");
        let minX = 0, maxX = 0, minY = 0, maxY = 0;

        for (let coord in worldMap) {
            if (worldMap[coord].visited) {
                let [x, y] = coord.split(',').map(Number);
                if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }

        let mapOutput = "\n--- SYSTEM MAP ---\nLegend: [@] You  [#] Explored  [$] Shop  [!] NPC\n\n";

        for (let y = maxY; y >= minY; y--) {
            let rowString = "";
            for (let x = minX; x <= maxX; x++) {
                let coord = `${x},${y}`;
                if (x === playerX && y === playerY) {
                    rowString += "[@]"; 
                } else if (worldMap[coord] && worldMap[coord].visited) {
                    if (worldMap[coord].isShop) rowString += "[$]"; 
                    else if (worldMap[coord].npc) rowString += "[!]";
                    else rowString += "[#]"; 
                } else {
                    rowString += "   "; 
                }
            }
            mapOutput += rowString + "\n";
        }
        mapOutput += "------------------\n";
        let distanceToVictory = Math.abs(victoryX - playerX) + Math.abs(victoryY - playerY);
        mapOutput += `📍 OBJECTIVE DISTANCE: ${distanceToVictory} sectors\n`;
        printToTerminal(mapOutput);
    }

    function processCraft(target) {
        if (!target) return printToTerminal("Craft what? Type 'recipes'.");
        if (player.knownRecipes.includes(target) && masterRecipes[target]) {
            let reqs = masterRecipes[target];
            // check materials by name
            let hasAll = true;
            let removeIdxs = [];
            for (let r of reqs) {
                let idx = inventoryIndexByName(r);
                if (idx > -1) removeIdxs.push(idx); else { hasAll = false; break; }
            }
            if (hasAll) {
                // remove by descending index
                removeIdxs.sort((a,b)=>b-a).forEach(i=>removeFromInventoryIndex(i));
                addToInventory(target, 'common');
                gameStats.itemsCrafted++;
                // Chance to unlock new recipe when crafting
                if (Math.random() < 0.1 && allBlueprints.length > 0) {
                    let newRecipe = allBlueprints[Math.floor(Math.random() * allBlueprints.length)].replace(' blueprint', '');
                    if (!player.knownRecipes.includes(newRecipe)) {
                        player.knownRecipes.push(newRecipe);
                        printToTerminal(`🎓 [NEW RECIPE DISCOVERED]: ${newRecipe}`);
                    }
                }
                printToTerminal(`*CLANG* You crafted a [${target}]!`);
            } else printToTerminal(`Missing materials: ${reqs.join(", ")}`);
        } else printToTerminal(`You don't know how to craft that.`);
    }

    function handleCombatMode(action, target) {
        let room = getActiveRoom();
        let combatStart = applyCombatStartEffects(room);
        if (combatStart.blocked) return;

        if (currentEnemy && currentEnemy.encounterPending) {
            return printToTerminal("Mini-boss challenge pending. Choose with 'challenge 1', 'challenge 2', or 'challenge 3'.");
        }

        announceEnemyIntent(currentEnemy);

        if (combatStart.playerSkipped) {
            printToTerminal("💫 You are stunned and lose your action.");
            if (currentEnemy && !combatStart.enemySkipped) enemyAttack();
            return;
        }

        if (action === "attack") {
            let mutator = getRoomMutator();
            let dmg = Math.floor(Math.random() * player.attack) + 1;
            if (challengeModifiers.glassCannon) dmg = Math.floor(dmg * 1.2);
            let critChance = Math.min(0.25, 0.1 + player.level * 0.01);
            
            // Apply combo multiplier (each hit in combo = +5% damage up to +50%)
            let comboMultiplier = 1 + (Math.min(comboCounter, 10) * 0.05);
            dmg = Math.floor(dmg * comboMultiplier);
            comboCounter++;
            if (comboCounter > maxCombo) maxCombo = comboCounter;
            
            // Apply enchantment bonus
            if (player.equipped.weapon && enhancedItems[player.equipped.weapon]) {
                dmg += enhancedItems[player.equipped.weapon] * 3;
            }

            dmg = Math.floor(dmg * getRelicAttackMultiplier());
            if (mutator && mutator.id === 'fog') dmg = Math.floor(dmg * 0.85);
            if (mutator && mutator.id === 'volatile') dmg = Math.floor(dmg * 1.25);
            
            // Apply damage type
            let damageType = applyDamageType(player.equipped.weapon || "basemelee");
            lastDamageType = damageType;
            
            let isCrit = Math.random() < critChance;
            if (isCrit) {
                dmg *= 2;
                addToCombatLog(`[CRIT] ${player.class} deals ${dmg} damage to ${currentEnemy.name}!`);
                printToTerminal(`⚔️ CRITICAL HIT! You strike the ${currentEnemy.name} for ${dmg} damage! [${damageType}] [Combo: ${comboCounter}x]`);
            } else {
                addToCombatLog(`${player.class} deals ${dmg} damage to ${currentEnemy.name}. [Combo: ${comboCounter}x]`);
                printToTerminal(`⚔️ You strike the ${currentEnemy.name} for ${dmg} damage! [${damageType}] [Combo: ${comboCounter}x]`);
            }
            
            // Apply weapon effects
            let weaponEffect = player.equipped.weaponEffect;
            if (weaponEffect === "vampiric") {
                let heal = Math.floor(dmg * 0.3);
                player.hp = Math.min(player.maxHp, player.hp + heal);
                addToCombatLog(`Vampiric strike heals ${heal} HP`);
                printToTerminal(`💉 Vampiric strike! You heal ${heal} HP.`);
            } else if (weaponEffect === "lifesteal") {
                let heal = Math.floor(dmg * 0.5);
                player.hp = Math.min(player.maxHp, player.hp + heal);
                addToCombatLog(`Lifesteal drains ${heal} HP`);
                printToTerminal(`💗 Lifesteal! You drain ${heal} HP from your enemy.`);
            } else if (weaponEffect === "overclocked") {
                dmg += 5;
                if (player.mp >= 3) player.mp -= 3;
                else return printToTerminal("Overclocked weapon needs 3 MP to use!");
                printToTerminal(`⚡ Overclocked damage! Total: ${dmg}.`);
            } else if (weaponEffect === "dragonborn") {
                dmg += player.level * 2;
                printToTerminal(`🐉 Dragonborn power! Damage scales with level: ${dmg}.`);
            } else if (weaponEffect === "chaos") {
                let multiplier = 0.5 + Math.random() * 1.5;
                dmg = Math.floor(dmg * multiplier);
                printToTerminal(`🌀 CHAOS! Unstable damage multiplier: ${multiplier.toFixed(2)}x = ${dmg}`);
            }

            if (damageType === 'fire') {
                applyStatusEffect(currentEnemy, 'burning', 2, 2);
            } else if (damageType === 'ice') {
                applyStatusEffect(currentEnemy, 'frozen', 1, 1);
            } else if (damageType === 'electric') {
                applyStatusEffect(currentEnemy, 'stunned', 1, 1);
            }

            if (hasRelic('vampcharm')) {
                player.hp = Math.min(player.maxHp, player.hp + 2);
                printToTerminal('🩸 Vampire Charm restores 2 HP.');
            }
            
            gameStats.damageDealt += dmg;
            gameStats.highestDamageHit = Math.max(gameStats.highestDamageHit || 0, dmg);
            currentEnemy.hp -= dmg;
            if (activeCompanion && currentEnemy.hp > 0) {
                processCompanionAttack();
            }
            gameStats.bestCombo = Math.max(gameStats.bestCombo || 0, comboCounter);
            checkEnemyDeath();
            if (currentEnemy && !combatStart.enemySkipped) enemyAttack();
        } 
        else if (action === "skill") useSkill(target, combatStart.enemySkipped);
        else if (action === "cast") castMagic(target, combatStart.enemySkipped);
        else if (action === "use" || action === "heal") useItem(action === "heal" ? "health potion" : target, combatStart.enemySkipped);
        else if (action === "guard") {
            player.guardStance = 1;
            printToTerminal('🛡️ You brace for impact. Next enemy attack will be reduced.');
            if (!combatStart.enemySkipped) enemyAttack();
        }
        else if (action === "run") {
            let mutator = getRoomMutator();
            let escapeChance = mutator && mutator.id === 'fog' ? 0.75 : 0.6;
            comboCounter = 0; // Reset combo on flee attempt
            if (Math.random() < escapeChance) {
                printToTerminal("You dodge past the enemy and catch your breath!");
                currentEnemy = null; 
            } else {
                printToTerminal("The enemy blocks your escape!");
                if (!combatStart.enemySkipped) enemyAttack();
            }
        }
        else printToTerminal(`COMBAT MODE! Commands: attack, cast [spell], run, use [item], summon, guard, intent.`);
    }

    function checkEnemyDeath() {
        if (currentEnemy.hp <= 0) {
            printToTerminal(`*** You defeated the ${currentEnemy.name}! ***`);
            gameStats.totalKills++;
            gameStats.bossesFought += (currentEnemy.isOmega ? 1 : 0);
            gameStats.bossesDefeated += (currentEnemy.isOmega ? 1 : 0);
            if (currentEnemy.isMiniBoss) gameStats.miniBossesDefeated++;
            if (currentEnemy.isBoss && currentEnemy.variant) {
                gameStats.bossVariantsDefeated++;
            }
            
            let creditReward = Math.floor(currentEnemy.credits * getRelicCreditMultiplier());
            credits += creditReward;
            printToTerminal(`Picked up ${creditReward} credits. (Total: ${credits})`);
            
            player.xp += currentEnemy.xp;
            printToTerminal(`You gained ${currentEnemy.xp} XP. [Combo: ${comboCounter}x +${Math.min(comboCounter, 10) * 5}% damage]`);
            comboCounter = 0; // Reset combo after enemy defeat
            checkLevelUp();
            checkAchievements();
            
            let dropped = generateDrop(currentEnemy);
            worldMap[`${playerX},${playerY}`].item = dropped.name;
            worldMap[`${playerX},${playerY}`].itemRarity = dropped.rarity;
            let comparison = getItemComparison(dropped.name);
            printToTerminal(`The enemy dropped a [${dropped.name}] (${dropped.rarity})! ${comparison} Type 'take ${dropped.name}'.`);

            let relicChance = currentEnemy.relicDropChance || (currentEnemy.isBoss ? 0.22 : 0.06);
            if (Math.random() < relicChance) {
                giveRelic();
            }
            
            // Special handling: if this was the Omega Core, trigger finale
            if (currentEnemy.isOmega || (currentEnemy.name && currentEnemy.name.toUpperCase().includes("OMEGA"))) {
                omegaDefeated = true;
                printToTerminal("\n--- GRAND FINALE SEQUENCE INITIATED ---");
                printToTerminal("You have destroyed the AI core. Sirens wail as emergency protocols begin.");
                printToTerminal("A maintenance elevator opens; you make your escape from Sector 7. CONGRATULATIONS, OPERATOR.");
                printToTerminal("*** GAME COMPLETE: AI DESTROYED & ESCAPE CONFIRMED ***");
                showRunSummary('VICTORY');
                gameState = "WON";
            }

            currentEnemy = null; worldMap[`${playerX},${playerY}`].enemy = null; 
        }
    }

    function enemyAttack() {
        if (currentEnemy.statusEffects && currentEnemy.statusEffects.stunned) {
            tickStatusEffects(currentEnemy, currentEnemy.name);
            return;
        }

        let mutator = getRoomMutator();
        let intent = currentEnemy.intent || generateEnemyIntent(currentEnemy);
        let rawDmg = Math.floor(Math.random() * currentEnemy.attack) + 1;
        let defenseReduction = player.defense;
        let isHeavyAttack = Math.random() < 0.15;
        let enemyPrefix = currentEnemy.name.split(' ')[0];
        let ability = enemyAbilities[enemyPrefix];

        if (intent && intent.id === 'heavy') {
            rawDmg = Math.floor(rawDmg * intent.power);
            isHeavyAttack = true;
        } else if (intent && intent.id === 'guardbreak') {
            defenseReduction = Math.floor(defenseReduction * 0.6);
            printToTerminal('🪓 Guardbreak stance! Your defenses are partially bypassed.');
        }
        
        // Check if enemy has an evasion ability
        if (ability && ability.dodgeChance && Math.random() < ability.dodgeChance) {
            addToCombatLog(`${currentEnemy.name} evaded!`);
            printToTerminal(`🌫️ The ${currentEnemy.name} evaded your attack!`);
            return;
        }
        
        // Apply ability bonuses
        if (ability && ability.dmgBonus) rawDmg += ability.dmgBonus;

        if (currentEnemy.statusEffects && currentEnemy.statusEffects.frozen) {
            rawDmg = Math.max(1, Math.floor(rawDmg * 0.75));
            printToTerminal(`🧊 ${currentEnemy.name} shivers under freezing effects.`);
        }
        
        if (isHeavyAttack) {
            defenseReduction = Math.floor(player.defense / 2);
            addToCombatLog(`[HEAVY] ${currentEnemy.name} attacks! (Raw: ${rawDmg})`);
            printToTerminal(`💥 The ${currentEnemy.name} launches a HEAVY ATTACK!`);
        }
        
        // Apply armor effects
        let armorEffect = player.equipped.armorEffect;
        if (armorEffect === "evasive" && Math.random() < 0.2) {
            addToCombatLog(`You evaded with armor!`);
            printToTerminal(`🎯 Your agile armor helps you dodge the attack!`);
            return;
        } else if (armorEffect === "adaptive") {
            defenseReduction = Math.floor(defenseReduction + rawDmg * 0.3);
            printToTerminal(`🔄 Your adaptive armor hardens! Defense boost applied.`);
        }
        
        let actualDmg = Math.max(1, rawDmg - defenseReduction);
        if (challengeModifiers.glassCannon) actualDmg = Math.floor(actualDmg * 1.15);
        if (mutator && mutator.id === 'volatile') actualDmg = Math.floor(actualDmg * 1.25);
        if (player.guardStance > 0) {
            actualDmg = Math.floor(actualDmg * 0.45);
            player.guardStance = 0;
            printToTerminal('🛡️ Guard stance absorbs most of the impact.');
        }

        if (hasRelic('mirrorshard') && Math.random() < 0.10) {
            printToTerminal('🪞 Mirror Shard bends the blow away. You dodge completely!');
            generateEnemyIntent(currentEnemy);
            return;
        }

        player.hp -= actualDmg;
        gameStats.damageTaken += actualDmg;
        comboCounter = 0; // Reset combo when hit
        addToCombatLog(`${currentEnemy.name} deals ${actualDmg} damage`);
        printToTerminal(`The ${currentEnemy.name} hits you for ${actualDmg} damage! (Absorbed ${rawDmg - actualDmg}) (HP: ${player.hp})`);
        
        // Reflective armor returns damage
        if (armorEffect === "reflect" && Math.random() < 0.15) {
            let reflectDmg = Math.floor(actualDmg * 0.5);
            currentEnemy.hp -= reflectDmg;
            addToCombatLog(`Reflected ${reflectDmg} damage back!`);
            printToTerminal(`💫 Your reflective armor bounces ${reflectDmg} damage back!`);
        }
        
        let poisonChance = intent && intent.id === 'poison' ? 0.4 : 0.1;
        if (Math.random() < poisonChance && player.status !== "poisoned") {
            player.status = "poisoned";
            applyStatusEffect(player, 'poisoned', 3, 2);
            addToCombatLog(`You were poisoned!`);
            printToTerminal("🤢 The enemy's attack POISONED you! Use an antidote!");
        }
        if (player.hp <= 0) {
            if (hasRelic('phoenixash') && !relicFlags.phoenixUsed) {
                relicFlags.phoenixUsed = true;
                player.hp = 1;
                printToTerminal('🔥 Phoenix Ash ignites. You survive a lethal hit with 1 HP!');
            } else {
                playerDeath("YOUR VISION FADES TO BLACK. GAME OVER.");
            }
        }

        generateEnemyIntent(currentEnemy);
    }

    function checkLevelUp() {
        if (player.xp >= player.xpNeeded) {
            player.level++; player.maxHp += 5; player.hp = player.maxHp; 
            player.maxMp += 5; player.mp = player.maxMp;
            player.baseAttack += 1; player.baseDefense += 1; updateStats();
            player.xp -= player.xpNeeded; player.xpNeeded = Math.floor(player.xpNeeded * 1.5);
            // Unlock new recipes at certain levels
            if (player.level % 5 === 0 && allBlueprints.length > 0) {
                let newRecipe = allBlueprints[Math.floor(Math.random() * allBlueprints.length)].replace(' blueprint', '');
                if (!player.knownRecipes.includes(newRecipe)) {
                    player.knownRecipes.push(newRecipe);
                    printToTerminal(`🎓 [MILESTONE]: New recipe unlocked: ${newRecipe}`);
                }
            }
            printToTerminal(`!!! LEVEL UP !!! You are now Level ${player.level}. Stats increased!`);
        }
    }

    function executeLook() {
        let room = worldMap[`${playerX},${playerY}`];
        // Update current biome based on theme
        if (room.theme && ['facility', 'dungeon', 'bio', 'void'].includes(room.theme)) {
            if (currentBiome !== room.theme) {
                currentBiome = room.theme;
                discoveredPortals[room.theme] = true;
                printToTerminal(`🌍 [BIOME CHANGE: ${room.theme.toUpperCase()}]`);
            }
        }
        if (room.secretRoom && !room.secretCounted) {
            room.secretCounted = true;
            gameStats.secretRoomsFound++;
            printToTerminal("🕵️ You found a secret chamber.");
        }
        printToTerminal(room.desc);
        if (room.isShop) printToTerminal("Type 'buy [item]' or 'sell [item]'.");
        if (room.resourceNode) printToTerminal(`💎 There is a resource node here with ${room.resourceNode.amount}x [${room.resourceNode.material}]. Type 'gather' to collect.`);
        if (room.hazard) printToTerminal(`☢️ Room hazard detected: ${room.hazard.type}`);
        if (room.mutator) printToTerminal(`🌀 Room Mutator: ${room.mutator.label} - ${room.mutator.desc}`);
        
        if (room.hullBreach) {
            printToTerminal(`⚠️ EMERGENCY: HULL BREACH DETECTED! You have 3 turns to move to another room or use 'seal' with a Sealant item!`);
            hullBreachTurns = 3;
        }
        if (room.hackableConsole) {
            printToTerminal(`💻 You spot a hackable terminal console. Use 'hack' to attempt access (high/medium/easy difficulty based on chance).`);
        }
        if (room.hasTurrets) {
            printToTerminal(`🔫 DANGER: Automated turrets are active in this room! Type 'dodge' to take cover (50% success).`);
        }
        
        printToTerminal(`Exits: ${room.exits.join(", ")}`);
        
        // Show distance if player has a system map
        if (inventoryIndexByName("system map") > -1) {
            let distanceToVictory = Math.abs(victoryX - playerX) + Math.abs(victoryY - playerY);
            printToTerminal(`📍 [MAP] Objective distance: ${distanceToVictory} sectors`);
        }
        
        if (room.item) printToTerminal(`🎁 There is a [${room.item}] resting here.`);
        if (room.npc) printToTerminal(`🗣️ There is a ${room.npc.name} here, ${room.npc.desc} Type 'talk' to interact.`);
        
        if (room.enemy) {
            currentEnemy = room.enemy; 
            printToTerminal(`⚠️ WARNING: A ${currentEnemy.name} with HP: ${currentEnemy.hp} attacks! !!!`);
            if (currentEnemy.isMiniBoss && currentEnemy.encounterPending) {
                printToTerminal("🏟️ MINI-BOSS CHALLENGE: Choose your terms before combat.");
                printToTerminal("[1] Blood Wager: harder fight, massive rewards");
                printToTerminal("[2] Chaotic Arena: adds hazards, high rewards");
                printToTerminal("[3] Safe Approach: easier fight, lower rewards");
                printToTerminal("Type 'challenge 1', 'challenge 2', or 'challenge 3'.");
            } else {
                announceEnemyIntent(currentEnemy);
            }
        }
    }

    function showContextualHelp() {
        let room = worldMap[`${playerX},${playerY}`];
        let commands = {
            navigation: [],
            interaction: [],
            combat: [],
            inventory: [],
            progression: [],
            system: ["stats", "help", "settings", "map", "quests", "compare [item]", "reputation", "relics", "score"]
        };
        
        // NAVIGATION - only show available directions
        if (room && room.exits) {
            room.exits.forEach(exit => {
                if (validDirections.includes(exit)) {
                    commands.navigation.push(exit);
                }
            });
        }
        commands.navigation.push("look");
        
        // INTERACTION - context based on room contents
        if (room && room.npc) {
            commands.interaction.push("talk", "give [item]");
        }
        
        if (room && room.item) {
            commands.interaction.push(`take ${room.item}`);
        }
        
        if (room && room.resourceNode && room.resourceNode.amount > 0) {
            commands.interaction.push(`gather (${room.resourceNode.amount} left)`);
        }

        if (room && room.secretRoom) {
            commands.interaction.push("take", "compare [item]");
        }
        
        if (room && room.isShop) {
            commands.interaction.push("buy", "sell [item]", "merchant");
        }
        
        if (room && room.hackableConsole) {
            commands.interaction.push("hack");
        }
        
        if (room && room.hasTurrets) {
            commands.interaction.push("dodge");
        }
        
        // COMBAT
        if (currentEnemy) {
            commands.combat.push("attack", "cast [spell]", "run", "use [item]", "summon", "guard", "intent");
        } else {
            commands.combat.push("attack", "cast [spell]");
        }
        
        // INVENTORY
        commands.inventory.push("inventory", "craft [item]", "recipes", "equip [weapon]", "use [item]", "transmute [a] + [b]");
        
        // PROGRESSION
        commands.progression.push("enchantments", "enchant [type]", "achievements", "disassemble [item]");
        
        // Display
        printToTerminal("=== CONTEXT-AWARE COMMANDS ===");
        
        if (commands.navigation.length > 0) {
            printToTerminal(`📍 MOVEMENT: ${commands.navigation.join(", ")}`);
        }
        
        if (commands.interaction.length > 0) {
            printToTerminal(`🤝 INTERACTION: ${commands.interaction.join(", ")}`);
        }
        
        if (commands.combat.length > 0) {
            printToTerminal(`⚔️  COMBAT: ${commands.combat.join(", ")}`);
        }
        
        if (commands.inventory.length > 0) {
            printToTerminal(`🎒 INVENTORY: ${commands.inventory.join(", ")}`);
        }
        
        if (commands.progression.length > 0) {
            printToTerminal(`📈 PROGRESSION: ${commands.progression.join(", ")}`);
        }
        
        if (commands.system.length > 0) {
            printToTerminal(`⚙️  SYSTEM: ${commands.system.join(", ")}`);
        }
        
        printToTerminal("Type 'help' for full global command list.");
    }

    function printToTerminal(text, speed = 25) {
        const fullText = (typeof text === 'string') ? text : String(text);
        printQueue.push({ text: fullText, speed: speed });
        
        if (!isPrinting) {
            processPrintQueue();
        }
    }
    
    function processPrintQueue() {
        if (printQueue.length === 0) {
            isPrinting = false;
            playerInput.focus();
            return;
        }
        
        isPrinting = true;
        const { text, speed } = printQueue.shift();
        const lines = text.split('\n');
        let lineIndex = 0;
        
        // Limit terminal lines to 500
        while (terminalOutput.childNodes.length > 500) {
            terminalOutput.removeChild(terminalOutput.firstChild);
        }
        
        function typeNextLine() {
            if (lineIndex >= lines.length) {
                playerInput.scrollIntoView();
                // Process next item in queue after delay
                setTimeout(processPrintQueue, 150);
                return;
            }
            
            const p = document.createElement("p");
            const line = lines[lineIndex];
            let charIndex = 0;
            p.textContent = "";
            terminalOutput.appendChild(p);
            
            // Type out this line character by character
            const typeInterval = setInterval(() => {
                if (charIndex < line.length) {
                    p.textContent += line[charIndex];
                    charIndex++;
                    playerInput.scrollIntoView();
                } else {
                    clearInterval(typeInterval);
                    lineIndex++;
                    // Small delay before next line in same message
                    setTimeout(typeNextLine, 150);
                }
            }, speed);
        }
        
        typeNextLine();
    }

    function handleSealBreach() {
        let room = worldMap[`${playerX},${playerY}`];
        if (!room.hullBreach) return printToTerminal("⚠️ No hull breach detected in this room. Use 'help' to see available commands.");
        let idx = inventoryIndexByName("sealant");
        if (idx === -1) return printToTerminal("You don't have a Sealant!");
        removeFromInventoryIndex(idx);
        room.hullBreach = false;
        hullBreachTurns = 0;
        printToTerminal("🔧 You seal the breach! The room stabilizes. Crisis averted.");
    }

    function handleTurretDodge() {
        let room = worldMap[`${playerX},${playerY}`];
        if (!room.hasTurrets) return printToTerminal("❌ No turrets detected in this room. Use 'help' to see available commands.");
        
        let success = Math.random() < 0.5;
        if (success) {
            printToTerminal(`✅ You dive behind cover! You dodge the turret fire!`);
            room.hasTurrets = false;
        } else {
            printToTerminal(`❌ You couldn't dodge in time! Taking fire!`);
            let dmg = 10 + Math.floor(Math.random() * 15);
            player.hp -= dmg;
            gameStats.damageTaken += dmg;
            printToTerminal(`⚡ Turret fire deals ${dmg} damage! (HP: ${player.hp})`);
            if (player.hp <= 0) playerDeath("YOU WERE SHREDDED BY TURRET FIRE. GAME OVER.");
        }
    }

    function handleConsoleHack() {
        let room = worldMap[`${playerX},${playerY}`];
        if (!room.hackableConsole) return printToTerminal("❌ No hackable console found here. Use 'help' to see available commands.");
        room.hackableConsole = false;
        
        let difficulty = Math.random();
        let success = false;
        let msg = "";
        if (difficulty < 0.3) {
            msg = "EASY: ";
            success = Math.random() < 0.8;
        } else if (difficulty < 0.7) {
            msg = "MEDIUM: ";
            success = Math.random() < 0.5;
        } else {
            msg = "HARD: ";
            success = Math.random() < 0.25;
        }
        
        if (success) {
            turretsCooldown = 3;
            printToTerminal(`✅ ${msg}HACK SUCCESSFUL! Turrets disabled for the next 3 rooms. Local map revealed!`);
            printToTerminal("📍 Area revealed: 5x5 map grid around your position.");
            drawMap();
        } else {
            printToTerminal(`❌ ${msg}HACK FAILED! Alarm triggered...`);
            printToTerminal("🚨 Automated defense systems activated!");
            if (Math.random() < 0.5) {
                let dmg = 15 + Math.floor(Math.random() * 10);
                player.hp -= dmg;
                printToTerminal(`⚡ You take ${dmg} damage from electrical backlash! (HP: ${player.hp})`);
                if (player.hp <= 0) playerDeath("YOU WERE FRIED BY THE CONSOLE. GAME OVER.");
            }
        }
    }

    function startDailyChallenge() {
        if (gameState !== "PLAYING") return printToTerminal("Start a new game first!");
        let seed = getDailyChallengeSeed();
        currentSeed = seed;
        dailyMode = true;
        weeklyMode = false;
        challengeModifiers = {
            glassCannon: seed % 2 === 0,
            bountyHunter: seed % 3 === 0,
            hazardSurge: false,
            eliteThreat: false,
            permadeath: false
        };
        let featuredClasses = ['Neophyte Striker', 'Glitched Weaver', 'Rusted Sentinel', 'Scavenger Recruit', 'Failed Experiment'];
        challengeMission = {
            featuredClass: featuredClasses[seed % featuredClasses.length],
            weights: { distance: 10, credits: 1, kills: 2, bosses: 40, speedBonus: 80 }
        };
        // Track seed in history
        if (!previousSeeds.includes(seed)) {
            previousSeeds.unshift(seed);
            if (previousSeeds.length > 10) previousSeeds.pop();
        }
        printToTerminal(`🏆 DAILY CHALLENGE MODE ACTIVATED!`);
        printToTerminal(`SEED: ${seed} (Same seed for all players today!)`);
        printToTerminal(`MODIFIERS: ${Object.entries(challengeModifiers).filter(([, value]) => value).map(([key]) => key).join(', ') || 'none'}`);
        printToTerminal(`FEATURED BUILD: ${challengeMission.featuredClass}`);
        printToTerminal(`Scoring: distance*10 + credits*1 + kills*2 + bosses*40 + speed bonus.`);
        printToTerminal(`Use 'score' anytime to see detailed breakdown.`);
    }

    function startWeeklyChallenge() {
        if (gameState !== "PLAYING") return printToTerminal("Start a new game first!");
        let today = new Date();
        let year = today.getFullYear();
        let week = Math.ceil((((today - new Date(year, 0, 1)) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7);
        let seed = year * 100 + week;
        currentSeed = seed;
        dailyMode = false;
        weeklyMode = true;
        challengeModifiers = {
            glassCannon: true,
            bountyHunter: true,
            hazardSurge: week % 2 === 0,
            eliteThreat: true,
            permadeath: true
        };
        let featuredClasses = ['Neophyte Striker', 'Glitched Weaver', 'Rusted Sentinel', 'Scavenger Recruit', 'Failed Experiment'];
        challengeMission = {
            featuredClass: featuredClasses[week % featuredClasses.length],
            weights: { distance: 8, credits: 1, kills: 4, bosses: 75, speedBonus: 140 }
        };
        printToTerminal(`🏁 WEEKLY CHALLENGE MODE ACTIVATED!`);
        printToTerminal(`SEED: ${seed}`);
        printToTerminal(`MODIFIERS: ${Object.entries(challengeModifiers).filter(([, value]) => value).map(([key]) => key).join(', ')}`);
        printToTerminal(`FEATURED BUILD: ${challengeMission.featuredClass}`);
        printToTerminal(`Scoring: distance*8 + credits*1 + kills*4 + bosses*75 + major speed bonus.`);
        printToTerminal(`Weekly runs are harsher but more rewarding.`);
    }

    function showDailySeeds() {
        if (previousSeeds.length === 0) return printToTerminal("No recorded seeds yet.");
        printToTerminal("=== PREVIOUS CHALLENGE SEEDS ===");
        previousSeeds.forEach((seed, i) => printToTerminal(`${i+1}. Seed: ${seed}`));
    }

    function disassembleItem(itemName) {
        let idx = inventoryIndexByName(itemName);
        if (idx === -1) return printToTerminal(`You don't have a '${itemName}'.`);
        let recipe = masterRecipes[itemName];
        if (!recipe) return printToTerminal(`That item can't be disassembled.`);
        removeFromInventoryIndex(idx);
        recipe.forEach(mat => addToInventory(mat, 'common'));
        printToTerminal(`✨ You disassembled the ${itemName} into: ${recipe.join(', ')}`);
    }

    function showTutorial(mode = "simple") {
        if (mode === "full") {
            printToTerminal("\n=== SECTOR 7 FULL GUIDE ===");
            printToTerminal("Use 'tutorial' for quick start.");
            printToTerminal("MOVEMENT: north/south/east/west explore. 'look' shows room details.");
            printToTerminal("ITEMS: 'take [item]' picks up. 'use [item]' consumes. 'equip [weapon/armor]' gains stats.");
            printToTerminal("INVENTORY: 'inventory' lists items. Rarity: common, uncommon, rare, epic, legendary.");
            printToTerminal("CRAFTING: 'recipes' shows known. 'craft [item]' combines materials. Blueprints unlock new recipes.");
            printToTerminal("COMBAT: 'attack', 'cast [spell]', 'use [item]', 'skill [name]', 'run'.");
            printToTerminal("COMBAT READS: Use 'intent' and 'guard' to counter telegraphed enemy turns.");
            printToTerminal("MAGIC: 'cast heal' (restores HP), 'cast fireball' (damages). Both cost 10 MP.");
            printToTerminal("CLASSES: 5 class types with unique skills (Power Strike, Arcane Burst, Shield Wall, Quick Hack, Berserk).");
            printToTerminal("EQUIPMENT: Weapon/armor effects (Vampiric, Lifesteal, Evasive, Reflective, Overclocked, Adaptive, etc).");
            printToTerminal("HAZARDS: Hull Breach (use 'seal'), Turrets (use 'dodge'), Consoles (use 'hack').");
            printToTerminal("QUESTS: 'talk' to NPCs, 'give [item]' to complete. Earn rewards.");
            printToTerminal("BRANCHES: Turn-ins can be 'kind', 'pragmatic', or 'greedy' for different outcomes.");
            printToTerminal("SHOPS: 'buy/sell [item]' at safe zones. Prices scale with distance.");
            printToTerminal("RELICS: Rare run-defining bonuses. Check with 'relics'.");
            printToTerminal("EVENTS & MINI-BOSSES: Use 'event [1/2]' and 'challenge [1/2/3]'.");
            printToTerminal("MAP: Use system map to view explored areas.");
            printToTerminal("SAVE: 'save [slot]', 'load [slot]', 'saves'. Death deletes current save.");
            printToTerminal("DAILY: 'daily' for seeded run (same seed for all players that day).");
            printToTerminal("GOAL: Reach the Omega Core boss at distance > [100,100].");
            printToTerminal("STATUS: Poison drains HP. Use antidote to cure.");
            return;
        }

        printToTerminal("\n=== QUICK START ===");
        printToTerminal("Go [north/south/east/west]. Pick up items with 'take [item]'. Fight with 'attack'.");
        printToTerminal("Check inventory, heal, save, and explore. Use 'help' anytime for available commands.");
        printToTerminal("Type 'tutorial full' for the complete guide.");
    }

    function showAccessibilityOptions() {
        printToTerminal("\n=== ACCESSIBILITY & VISUAL OPTIONS ===");
        printToTerminal("CURRENT: Terminal-based ASCII interface. All game info available via text commands.");
        printToTerminal("TEXT SIZE: Adjust your browser's zoom (Ctrl/Cmd +/-) to increase terminal text size.");
        printToTerminal("SCREEN READER: Game is compatible with screen readers. All descriptions are text-based.");
        printToTerminal("COLOR-BLIND MODE: Game uses symbols and emoji cues, not just colors. ✅ Supports all types.");
        printToTerminal("FAST MODE: (Accessibility tip) Use arrow keys for command history; type less with 'north', 's', etc.");
        printToTerminal("AUDIO: This version has no sound. (Future: Optional audio alerts for low HP / boss warnings)");
        printToTerminal("CONTROLS: Fully keyboard-based. No mouse required for gameplay.");
        printToTerminal("REMAPPABLE KEYS: Currently fixed; submit feedback for custom key bindings in future updates.");
        printToTerminal("\nTIPS FOR PLAY:");
        printToTerminal("  - Use 'stats' frequently to monitor health/mana.");
        printToTerminal("  - 'inventory' and 'recipes' display all critical info as plain text.");
        printToTerminal("  - 'help' lists all available commands.");
        printToTerminal("  - Terminal automatically scrolls; use this feature for reading long outputs.");
        printToTerminal("\n(Type 'help' to return to command list.)");
    }
});