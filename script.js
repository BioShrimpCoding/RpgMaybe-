// --- UTILITIES ---
let currentSeed = null;
let dailyMode = false;

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

// --- GAME STATE VARIABLES ---
let gameState = "BOOTING"; 
let inventory = [{ name: "health potion", rarity: "common" }, { name: "scrap metal", rarity: "common" }]; 
let credits = 0; 
let playerX = 0;
let playerY = 0;
let worldMap = {}; 

// Victory coordinates and endgame state (generated at start of PLAYING)
let victoryX = null;
let victoryY = null;
let omegaDefeated = false;

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
    equipped: { weapon: null, armor: null, weaponEffect: null, armorEffect: null },
    activeQuests: [],
    skills: [],
    class: null,
    tempDefense: 0,
    skillCooldowns: {}
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
    bossesDefeated: 0
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

// === SEED TRACKING ===
let previousSeeds = []; // Track last 10 seeds 

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
        adjectives: ["sterile", "humming", "flickering", "dark", "metallic", "industrial", "neon-lit", "buzzing"],
        types: ["server room", "laboratory", "corridor", "observation deck", "storage closet", "data vault", "power chamber"],
        features: ["a tangle of loose wires.", "a shattered monitor.", "a glowing button.", "blinking status lights.", "humming machinery."],
        loot: allMaterials, enemies: facilityEnemies, npcs: facilityNPCs
    },
    dungeon: {
        adjectives: ["damp", "crumbling", "echoing", "moss-covered", "bone-chilling", "ancient", "cursed", "shadowy"],
        types: ["stone cavern", "crypt", "tunnel", "throne room", "prison cell", "ritual chamber", "treasure vault"],
        features: ["rusted iron shackles.", "a pile of bones.", "a blue torch.", "strange runes on the walls.", "the smell of decay."],
        loot: allMaterials, enemies: dungeonEnemies, npcs: dungeonNPCs
    },
    bio: {
        adjectives: ["writhing", "pulsating", "grotesque", "organic", "fleshy", "bioluminescent"],
        types: ["bio-chamber", "growth pod", "mutation lab", "hive nest", "incubation room", "spore chamber"],
        features: ["strange breathing sounds.", "viscous fluid dripping from walls.", "glowing bio-matter.", "pulsating organic structures."],
        loot: allMaterials.concat(["bio cell", "mutant extract"]), enemies: facilityEnemies, npcs: []
    },
    void: {
        adjectives: ["empty", "vast", "silent", "cosmic", "distorted", "reality-warped"],
        types: ["void chamber", "dimensional rift", "reality fold", "null space", "dark abyss"],
        features: ["the void stares back at you.", "gravity feels wrong here.", "strange whispers echo.", "colors that don't exist."],
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
    let bonus = Math.min(Math.floor(distance / 50), 3); // small bump
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

    let currentTheme = previousTheme === "shop" ? "facility" : previousTheme;
    if (Math.random() > 0.90 && currentTheme !== "void") currentTheme = (currentTheme === "facility") ? "dungeon" : "facility";

    const words = roomData[currentTheme];
    let roomItem = Math.random() < 0.30 ? getRandom(words.loot) : null;
    
    let maxEnemyIndex = Math.min(Math.floor(distance * 3) + 9, words.enemies.length - 1);
    
    let roomEnemy = null;
    let roomNpc = null;

    // 6% chance the room is locked and requires a keycard or rusty key
    let locked = false;
    let requiredKey = null;
    if (Math.random() < 0.06 && !(x === 0 && y === 0)) {
        locked = true;
        requiredKey = Math.random() < 0.6 ? "keycard" : "rusty key";
    }
    
    // 15% chance to spawn an NPC instead of an Enemy
    if (Math.random() < 0.15 && (x !== 0 || y !== 0)) {
        roomNpc = JSON.parse(JSON.stringify(getRandom(words.npcs)));
    } else if (Math.random() < 0.40) {
        // Choose an enemy but scale its difficulty by distance from origin
        let template = JSON.parse(JSON.stringify(getRandom(words.enemies.slice(0, maxEnemyIndex + 1))));
        // Scale multiplier grows with distance (more dangerous the further out you go)
        let scale = 1 + Math.floor(distance / 10) * 0.25 + Math.min(distance / 200, 1);
        template.hp = Math.max(1, Math.floor(template.hp * scale));
        template.attack = Math.max(1, Math.floor(template.attack * scale));
        template.xp = Math.max(1, Math.floor(template.xp * scale));
        // Apply elite/legendary/mythic tiers with random chance based on distance
        roomEnemy = generateEnemyTier(template);
    }

    let exits = ["north", "south", "east", "west"].filter(() => Math.random() > 0.3);
    const op = { north: "south", south: "north", east: "west", west: "east" };
    if (directionMoved && !exits.includes(op[directionMoved])) exits.push(op[directionMoved]);
    if (exits.length === 0) exits = ["north"]; 

    // 20% chance for a resource node (gatherable materials)
    let resourceNode = null;
    if (Math.random() < 0.20 && !(x === 0 && y === 0)) {
        let mat = getRandom(words.loot);
        let amt = 1 + Math.floor(Math.min(Math.abs(x)+Math.abs(y), 20) / 5);
        resourceNode = { material: mat, amount: amt };
    }

    // 8% chance for Hull Breach environmental hazard (3 turn timer)
    let hullBreach = false;
    if (Math.random() < 0.08 && currentTheme === "facility" && !(x === 0 && y === 0)) {
        hullBreach = true;
    }

    // 10% chance for a hackable console (disable turrets for 3 rooms or reveal map)
    let hackableConsole = false;
    if (Math.random() < 0.10 && currentTheme === "facility" && !(x === 0 && y === 0)) {
        hackableConsole = true;
    }

    // 12% chance for turrets if we're in a facility (can be disabled by console)
    let hasTurrets = turretsCooldown <= 0 && Math.random() < 0.12 && currentTheme === "facility" && !roomEnemy;

    return { 
        theme: currentTheme, isShop: false, visited: false,
        desc: `You are in a ${getRandom(words.adjectives)} ${getRandom(words.types)}. You see ${getRandom(words.features)}`, 
        exits: exits, item: roomItem, enemy: roomEnemy, npc: roomNpc,
        locked: locked, requiredKey: requiredKey, resourceNode: resourceNode,
        hullBreach: hullBreach, hackableConsole: hackableConsole, hasTurrets: hasTurrets
    };
}

// --- INITIALIZATION & CORE LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
    const introScreen = document.getElementById("intro-screen");
    const gameScreen = document.getElementById("game-screen");
    const terminalOutput = document.getElementById("terminal-output");
    const playerInput = document.getElementById("player-input");
    const character = document.getElementById("character");

    setTimeout(() => {
        character.textContent = "🧑‍💻"; character.classList.add("typing-anim"); 
        document.querySelector(".loading-text").textContent = "Entering access codes..."; 
    }, 3000);

    setTimeout(() => {
        introScreen.classList.add("hidden"); gameScreen.classList.remove("hidden");
        
        printToTerminal("SYSTEM BOOT SEQUENCE INITIATED...");
        printToTerminal("YEAR: 2142 | LOCATION: SECTOR 7 APEX FACILITY");
        printToTerminal("--------------------------------------------------");
        printToTerminal("LORE DATABASE: The megacorp 'OmniCorp' has fallen to a rogue AI. You are a surviving operative trapped deep underground.");
        printToTerminal("Your mission: Survive the mutated bioweapons, escape to the surface, and destroy the Omega Core.");
        printToTerminal("--------------------------------------------------");
        printToTerminal("INITIALIZING NEURAL UPLOAD... PLEASE SELECT YOUR CLASS:");
        printToTerminal("[1] NEOPHYTE STRIKER: 20 HP | 5 MP | +3 Base Attack (Melee Focus)");
        printToTerminal("[2] GLITCHED WEAVER: 12 HP | 20 MP | +1 Base Attack (Magic Focus)");
        printToTerminal("[3] RUSTED SENTINEL: 25 HP | 5 MP | +2 Base Defense (Survival Focus)");
        printToTerminal("[4] SCAVENGER RECRUIT: 15 HP | 10 MP | +2 Base Attack (Starts with Map & 25c)");
        printToTerminal("[5] FAILED EXPERIMENT: 10 HP | 10 MP | +4 Base Attack (High Risk/Reward)");
        printToTerminal("Type '1', '2', '3', '4', or '5' to select.");
        
        gameState = "CLASS_SELECT";
        playerInput.focus(); 
    }, 5500);

    playerInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            const command = playerInput.value.trim().toLowerCase();
            if (command === "") return;
            printToTerminal(`\n> ${command}`, "input"); 
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
        }
    });

    function processCommand(command) {
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
            
            gameState = "PLAYING";
            initMerchantInventory();
            initializeQuestChains();
            worldMap["0,0"] = generateRoom("facility", null, 0, 0);
            worldMap["0,0"].enemy = null; 
            worldMap["0,0"].npc = null;
            worldMap["0,0"].visited = true;
            updateStats();
            // Generate a distant victory coordinate (both coordinates absolute >= 101)
            const signX = Math.random() < 0.5 ? 1 : -1;
            const signY = Math.random() < 0.5 ? 1 : -1;
            victoryX = signX * (101 + Math.floor(Math.random() * 100));
            victoryY = signY * (101 + Math.floor(Math.random() * 100));
            printToTerminal(`* Mission coordinate locked to neural HUD. Objective distance estimated: ${Math.abs(victoryX)+Math.abs(victoryY)} sectors.`);
            
            printToTerminal("\n--- NEURAL LINK ESTABLISHED. GOOD LUCK. ---");
            printToTerminal("Type 'help' for commands. Type 'stats' to see your condition.");
            return executeLook();
        }

        if (player.hp <= 0) {
            if (command === "restart") return restartGame();
            return printToTerminal("YOU ARE DEAD. Type 'restart' to begin a new run, or 'load' to restore a save.");
        }
        
        const words = command.split(" ");
        const action = words[0];
        const target = words.slice(1).join(" "); 

        // GLOBAL COMMANDS
        if (action === "save") return saveGame(words[1] || 'default');
        if (action === "load") return loadGame(words[1] || 'default');
        if (action === "saves") return listSaves();
        if (action === "stats") return showStats();
        if (action === "careerStats") return showGameStats();
        if (action === "achievements") return showAchievements();
        if (action === "inventory") return showInventory();
        if (action === "recipes") return showRecipes();
        if (action === "quests") return showActiveQuests();
        if (action === "skill") return useSkill(target);
        if (action === "enchant") return upgradeEnchantment(target || 'fire');
        if (action === "enchantments") return showEnchantmentStatus();

        // APPLY STATUS EFFECTS
        if (player.status === "poisoned") {
            player.hp -= 2;
            printToTerminal("⚠️ Poison courses through your veins! You take 2 damage.");
            if (player.hp <= 0) return playerDeath("THE POISON HAS KILLED YOU. GAME OVER.");
        }

        if (currentEnemy) return handleCombatMode(action, target);
        
        let coord = `${playerX},${playerY}`;
        let room = worldMap[coord];

        // EXPLORATION & WORLD INTERACTION
        if (validDirections.includes(action)) {
            if (!room.exits.includes(action)) return printToTerminal(`No exit to the ${action}.`);
            let tx = playerX, ty = playerY;
            if (action === "north") ty++; if (action === "south") ty--; if (action === "east") tx++; if (action === "west") tx--;
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

            printToTerminal(`You walk ${action}.`);
            
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
            if (room.resourceNode) {
                let gathered = Math.floor(Math.random() * 5) + 3;
                addToInventory('scrap metal', 'common');
                printToTerminal(`You gathered ${gathered} resources!`);
            } else {
                printToTerminal("There are no resources to gather here.");
            }
        }
        else if (action === "talk") {
            if (room.npc) {
                printToTerminal(`${room.npc.name} says: "${room.npc.dialog}"`);
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
            
            let idx = inventoryIndexByName(target);
            if (idx === -1) return printToTerminal(`You don't have a '${target}' in your inventory.`);
            
            if (room.npc.wants === target) {
                // Quest Complete!
                removeFromInventoryIndex(idx);
                printToTerminal(`You gave the ${target} to the ${room.npc.name}.`);
                printToTerminal(`${room.npc.name}: "${room.npc.success}"`);
                
                // Process Reward
                if (room.npc.reward.includes("credits")) {
                    let amount = parseInt(room.npc.reward); 
                    credits += amount; 
                    printToTerminal(`*** You received ${amount} Credits! ***`);
                } else {
                    addToInventory(room.npc.reward, 'common');
                    printToTerminal(`*** You received a [${room.npc.reward}]! ***`);
                }
                // mark related quest complete if present
                let qidx = player.activeQuests.findIndex(q => q.requires === target && q.status !== 'completed');
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
        else if (action === "disassemble") disassembleItem(target);
        else if (action === "seeds") showDailySeeds();
        else if (action === "biomes") showBiomeInfo();
        else if (action === "portal") travelToPortal(target || 'facility');
        else if (action === "portals") showPortals();
        else if (action === "quests") showActiveQuestChains();
        else if (action === "ng+prepare") prepareNewGamePlus();
        else if (action === "ng+start") startNewGamePlus();
        else if (action === "score") {
            let score = dailyMode ? (gameStats.distanceTraveled * 10) + credits : gameStats.damageDealt;
            printToTerminal(`📊 Current Score: ${score} (Distance: ${gameStats.distanceTraveled}, Credits: ${credits})`);
        }
        else if (action === "help") showContextualHelp();
        else if (action === "look") executeLook();
        else if (action === "tutorial") showTutorial(target);
        else if (action === "accessibility") showAccessibilityOptions();
        else printToTerminal(`Command not recognized.`);
    }

    // --- GAME SYSTEMS ---
    function updateStats() {
        player.attack = player.baseAttack + (weaponStats[player.equipped.weapon] || 0);
        player.defense = player.baseDefense + (armorStats[player.equipped.armor] || 0);
    }

    function showStats() {
        printToTerminal(`LEVEL: ${player.level} | HP: ${player.hp}/${player.maxHp} | MP: ${player.mp}/${player.maxMp} | CREDITS: ${credits}`);
        printToTerminal(`ATTACK: ${player.attack} | DEFENSE: ${player.defense} | XP: ${player.xp}/${player.xpNeeded}`);
        printToTerminal(`WEAPON: ${player.equipped.weapon || "None"} | ARMOR: ${player.equipped.armor || "None"} | STATUS: ${player.status || "Healthy"}`);
        if (enhancedItems[player.equipped.weapon]) printToTerminal(`Weapon Enchantments: +${enhancedItems[player.equipped.weapon]} levels`);
    }

    function showGameStats() {
        printToTerminal("=== CAREER STATISTICS ===");
        printToTerminal(`Total Runs: ${gameStats.totalRuns} | Kills: ${gameStats.totalKills} | Distance: ${gameStats.distanceTraveled}`);
        printToTerminal(`Items Crafted: ${gameStats.itemsCrafted} | Items Collected: ${gameStats.itemsPickedUp}`);
        printToTerminal(`Damage Dealt: ${gameStats.damageDealt} | Damage Taken: ${gameStats.damageTaken}`);
        printToTerminal(`Bosses Encountered: ${gameStats.bossesFought} | Bosses Defeated: ${gameStats.bossesDefeated}`);
        printToTerminal(`Max Combo: ${maxCombo}`);
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
        if (comboCounter >= 5) achievements.firstBlood = true; // Achieved a 5-hit combo
        if (maxCombo >= 20) achievements.craftMaster = true; // Epic 20-hit combo
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
        merchantInventory.forEach((item, idx) => {
            printToTerminal(`[${idx+1}] ${item.name} - ${item.price} credits (Stock: ${item.stock}) [${item.rarity}]`);
        });
        printToTerminal(`Your Credits: ${credits} | Items Sold: ${playerItemsSold}`);
        printToTerminal("Type 'buy [number]' to purchase (e.g., 'buy 1')");
    }

    function buyItem(itemIndex) {
        itemIndex = parseInt(itemIndex) - 1;
        if (itemIndex < 0 || itemIndex >= merchantInventory.length) return printToTerminal("Invalid item number.");
        
        let item = merchantInventory[itemIndex];
        if (item.stock <= 0) return printToTerminal(`${item.name} is out of stock!`);
        if (credits < item.price) return printToTerminal(`Not enough credits! Need ${item.price}, have ${credits}.`);
        
        credits -= item.price;
        item.stock--;
        addToInventory(item.name, item.rarity);
        playerCreditsSpent += item.price;
        
        printToTerminal(`✅ Bought ${item.name} for ${item.price} credits!`);
        gameStats.itemsPickedUp++;
    }

    function sellItem(itemName) {
        let idx = inventoryIndexByName(itemName);
        if (idx === -1) return printToTerminal(`You don't have a '${itemName}'.`);
        
        // Base price is 60% of crafting value
        let craftValue = masterRecipes[itemName]?.length || 1;
        let salePrice = Math.max(5, Math.floor(craftValue * 10));
        
        removeFromInventoryIndex(idx);
        credits += salePrice;
        playerItemsSold++;
        printToTerminal(`✅ Sold ${itemName} for ${salePrice} credits!`);
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
        if (gameState !== "WON" && !omegaDefeated) return printToTerminal("Finish the game first!");
        
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
        printToTerminal(`Start a new game to apply bonuses and face increased difficulty.`);
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
            equipped: { weapon: null, armor: null }
        };
        
        achievements = JSON.parse(JSON.stringify(carryoverStats.achievements));
        currentEnemy = null; gameState = "CLASS_SELECT";
        
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
        const saveData = { inventory, credits, playerX, playerY, worldMap, player, gameState, victoryX, victoryY, omegaDefeated, gameStats, achievements, enhancedItems, enchantments, discoveredPortals, maxCombo, previousSeeds, activeQuestChains, newGamePlusLevel, carryoverStats, playerCreditsSpent, playerItemsSold };
        localStorage.setItem("terminalRPG_save_" + slot, JSON.stringify(saveData));
        printToTerminal(`✅ GAME SAVED SUCCESSFULLY (Slot: ${slot}).`);
    }

    function showActiveQuests() {
        if (!player.activeQuests || player.activeQuests.length === 0) return printToTerminal("No active quests.");
        printToTerminal("--- ACTIVE QUESTS ---");
        player.activeQuests.forEach(q => printToTerminal(`${q.title}: requires [${q.requires}] - status: ${q.status || 'active'}`));
    }

    function useSkill(name) {
        if (!name) return printToTerminal("Use which skill? Type 'skill [name]'.");
        name = name.toLowerCase();
        if (!player.class) return printToTerminal("You have no class skills yet.");
        if (!currentEnemy) return printToTerminal("Skills can currently be used only in combat.");

        if (player.class === 'Neophyte Striker') {
            if (name === 'power strike') {
                let dmg = player.attack + 5 + Math.floor(Math.random()*3);
                currentEnemy.hp -= dmg;
                printToTerminal(`💥 Power Strike deals ${dmg} damage!`);
                checkEnemyDeath(); return;
            }
        }
        if (player.class === 'Glitched Weaver') {
            if (name === 'arcane burst') {
                if (player.mp < 8) return printToTerminal('Not enough MP (8)');
                player.mp -= 8; currentEnemy.hp -= 25;
                printToTerminal('⚡ Arcane Burst hits for 25 damage!'); checkEnemyDeath(); return;
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
                printToTerminal(`🔧 Quick Hack: stole ${steal} credits and damaged the enemy for 5.`); checkEnemyDeath(); return;
            }
        }
        if (player.class === 'Failed Experiment') {
            if (name === 'berserk') {
                let dmg = 30 + Math.floor(Math.random()*10);
                player.hp = Math.max(1, player.hp - 5);
                currentEnemy.hp -= dmg;
                printToTerminal(`🔥 Berserk deals ${dmg} damage but costs 5 HP.`); checkEnemyDeath(); return;
            }
        }
        printToTerminal('Unknown or unusable skill.');
    }

    function playerDeath(message) {
        if (currentSaveSlot) {
            localStorage.removeItem("terminalRPG_save_" + currentSaveSlot);
            printToTerminal(`💀 SAVE FILE DELETED: [${currentSaveSlot}]`);
        }
        printToTerminal(message);
    }

    function restartGame() {
        inventory = [{ name: "health potion", rarity: 'common' }, { name: "scrap metal", rarity: 'common' }];
        credits = 0;
        playerX = 0; playerY = 0; worldMap = {};
        victoryX = null; victoryY = null; omegaDefeated = false;
        currentSaveSlot = null;
        comboCounter = 0;
        currentBiome = 'facility';
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
            equipped: { weapon: null, armor: null }
        };
        
        // Apply NG+ bonuses if applicable
        if (newGamePlusLevel > 0) {
            initNewGamePlus();
        }
        
        // Initialize systems
        initMerchantInventory();
        initializeQuestChains();
        
        currentEnemy = null; gameState = "CLASS_SELECT";
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
        worldMap = data.worldMap; player = data.player; gameState = data.gameState; currentEnemy = null; 
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
        currentSaveSlot = slot;
        updateStats();
        printToTerminal(`✅ GAME LOADED SUCCESSFULLY (Slot: ${slot}).`);
        if(gameState === "PLAYING") executeLook();
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

    function castMagic(spell) {
        if (spell === "heal") {
            if (player.mp < 10) return printToTerminal("Not enough MP! (Costs 10)");
            player.mp -= 10; player.hp = Math.min(player.maxHp, player.hp + 25);
            printToTerminal("✨ You cast Heal! HP restored.");
            if(currentEnemy) enemyAttack();
        } 
        else if (spell === "fireball") {
            if (!currentEnemy) return printToTerminal("You can only cast fireball in combat!");
            if (player.mp < 10) return printToTerminal("Not enough MP! (Costs 10)");
            player.mp -= 10; currentEnemy.hp -= 20;
            printToTerminal("🔥 You hurl a fireball for 20 damage!");
            checkEnemyDeath();
        } else {
            printToTerminal("Unknown spell. You know: 'heal', 'fireball' (Both cost 10 MP).");
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

    function useItem(itemName) {
        let idx = inventoryIndexByName(itemName);
        if (idx === -1) return printToTerminal(`You don't have a '${itemName}'.`);
        let entry = inventory[idx]; if (typeof entry === 'string') entry = { name: entry, rarity: 'common' };

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
            removeFromInventoryIndex(idx); player.hp = Math.min(player.maxHp, player.hp + 15); 
            printToTerminal(`Drank health potion. HP up!`);
        } else if (itemName === "mana potion") {
            removeFromInventoryIndex(idx); player.mp = Math.min(player.maxMp, player.mp + 15); 
            printToTerminal(`Drank mana potion. MP up!`);
        } else if (itemName === "medkit") {
            removeFromInventoryIndex(idx); player.hp = Math.min(player.maxHp, player.hp + 30); 
            printToTerminal(`Used medkit. Huge HP heal!`);
        } else if (itemName === "antidote") {
            removeFromInventoryIndex(idx); player.status = null;
            printToTerminal(`Drank antidote. You are cured of ailments!`);
        } else {
            printToTerminal(`Try 'equip ${itemName}' if it's gear.`);
            return;
        }
        if(currentEnemy) enemyAttack(); 
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
        if (action === "attack") {
            let dmg = Math.floor(Math.random() * player.attack) + 1;
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
            
            // Apply damage type
            let damageType = applyDamageType(player.equipped.weapon || "basemelee");
            lastDamageType = damageType;
            
            if (Math.random() < critChance) {
                dmg *= 2;
                printToTerminal(`⚔️ CRITICAL HIT! You strike the ${currentEnemy.name} for ${dmg} damage! [${damageType}] [Combo: ${comboCounter}x]`);
            } else {
                printToTerminal(`⚔️ You strike the ${currentEnemy.name} for ${dmg} damage! [${damageType}] [Combo: ${comboCounter}x]`);
            }
            
            // Apply weapon effects
            let weaponEffect = player.equipped.weaponEffect;
            if (weaponEffect === "vampiric") {
                let heal = Math.floor(dmg * 0.3);
                player.hp = Math.min(player.maxHp, player.hp + heal);
                printToTerminal(`💉 Vampiric strike! You heal ${heal} HP.`);
            } else if (weaponEffect === "lifesteal") {
                let heal = Math.floor(dmg * 0.5);
                player.hp = Math.min(player.maxHp, player.hp + heal);
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
            
            gameStats.damageDealt += dmg;
            currentEnemy.hp -= dmg;
            checkEnemyDeath();
        } 
        else if (action === "cast") castMagic(target);
        else if (action === "use" || action === "heal") useItem(action === "heal" ? "health potion" : target);
        else if (action === "run") {
            comboCounter = 0; // Reset combo on flee attempt
            if (Math.random() > 0.4) {
                printToTerminal("You dodge past the enemy and catch your breath!");
                currentEnemy = null; 
            } else {
                printToTerminal("The enemy blocks your escape!");
                enemyAttack();
            }
        }
        else printToTerminal(`COMBAT MODE! Commands: attack, cast [spell], run, use [item].`);
    }

    function checkEnemyDeath() {
        if (currentEnemy.hp <= 0) {
            printToTerminal(`*** You defeated the ${currentEnemy.name}! ***`);
            gameStats.totalKills++;
            gameStats.bossesFought += (currentEnemy.isOmega ? 1 : 0);
            gameStats.bossesDefeated += (currentEnemy.isOmega ? 1 : 0);
            
            credits += currentEnemy.credits;
            printToTerminal(`Picked up ${currentEnemy.credits} credits. (Total: ${credits})`);
            
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
            
            // Special handling: if this was the Omega Core, trigger finale
            if (currentEnemy.isOmega || (currentEnemy.name && currentEnemy.name.toUpperCase().includes("OMEGA"))) {
                omegaDefeated = true;
                printToTerminal("\n--- GRAND FINALE SEQUENCE INITIATED ---");
                printToTerminal("You have destroyed the AI core. Sirens wail as emergency protocols begin.");
                printToTerminal("A maintenance elevator opens; you make your escape from Sector 7. CONGRATULATIONS, OPERATOR.");
                printToTerminal("*** GAME COMPLETE: AI DESTROYED & ESCAPE CONFIRMED ***");
                gameState = "WON";
            }

            currentEnemy = null; worldMap[`${playerX},${playerY}`].enemy = null; 
        } else {
            enemyAttack();
        }
    }

    function enemyAttack() {
        let rawDmg = Math.floor(Math.random() * currentEnemy.attack) + 1;
        let defenseReduction = player.defense;
        let isHeavyAttack = Math.random() < 0.15;
        let enemyPrefix = currentEnemy.name.split(' ')[0];
        let ability = enemyAbilities[enemyPrefix];
        
        // Check if enemy has an evasion ability
        if (ability && ability.dodgeChance && Math.random() < ability.dodgeChance) {
            printToTerminal(`🌫️ The ${currentEnemy.name} evaded your attack!`);
            return;
        }
        
        // Apply ability bonuses
        if (ability && ability.dmgBonus) rawDmg += ability.dmgBonus;
        
        if (isHeavyAttack) {
            defenseReduction = Math.floor(player.defense / 2);
            printToTerminal(`💥 The ${currentEnemy.name} launches a HEAVY ATTACK!`);
        }
        
        // Apply armor effects
        let armorEffect = player.equipped.armorEffect;
        if (armorEffect === "evasive" && Math.random() < 0.2) {
            printToTerminal(`🎯 Your agile armor helps you dodge the attack!`);
            return;
        } else if (armorEffect === "adaptive") {
            defenseReduction = Math.floor(defenseReduction + rawDmg * 0.3);
            printToTerminal(`🔄 Your adaptive armor hardens! Defense boost applied.`);
        }
        
        let actualDmg = Math.max(1, rawDmg - defenseReduction);
        player.hp -= actualDmg;
        gameStats.damageTaken += actualDmg;
        comboCounter = 0; // Reset combo when hit
        printToTerminal(`The ${currentEnemy.name} hits you for ${actualDmg} damage! (Absorbed ${rawDmg - actualDmg}) (HP: ${player.hp})`);
        
        // Reflective armor returns damage
        if (armorEffect === "reflect" && Math.random() < 0.15) {
            let reflectDmg = Math.floor(actualDmg * 0.5);
            currentEnemy.hp -= reflectDmg;
            printToTerminal(`💫 Your reflective armor bounces ${reflectDmg} damage back!`);
        }
        
        if (Math.random() < 0.1 && player.status !== "poisoned") {
            player.status = "poisoned";
            printToTerminal("🤢 The enemy's attack POISONED you! Use an antidote!");
        }
        if (player.hp <= 0) playerDeath("YOUR VISION FADES TO BLACK. GAME OVER.");
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
        printToTerminal(room.desc);
        if (room.isShop) printToTerminal("Type 'buy [item]' or 'sell [item]'.");
        if (room.resourceNode) printToTerminal(`💎 There is a resource node here with ${room.resourceNode.amount}x [${room.resourceNode.material}]. Type 'gather' to collect.`);
        
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
        
        if (room.item) printToTerminal(`🎁 There is a [${room.item}] resting here.`);
        if (room.npc) printToTerminal(`🗣️ There is a ${room.npc.name} here, ${room.npc.desc} Type 'talk' to interact.`);
        
        if (room.enemy) {
            currentEnemy = room.enemy; 
            printToTerminal(`⚠️ WARNING: A ${currentEnemy.name} with HP: ${currentEnemy.hp} attacks! !!!`);
        }
    }

    function showContextualHelp() {
        let room = worldMap[`${playerX},${playerY}`];
        printToTerminal("=== AVAILABLE COMMANDS ===");
        printToTerminal("NAVIGATION: north, south, east, west, look, portal [biome], portals");
        printToTerminal("INVENTORY: inventory, stats, recipes, craft [item], use [item], equip [weapon/armor]");
        printToTerminal("INTERACTION: talk, give [item], take [item], gather");
        printToTerminal("COMMERCE: buy, sell [item]");
        printToTerminal("COMBAT: attack, cast [spell], run, skill [name]");
        printToTerminal("PROGRESSION: quests, enchantments, enchant [type], disassemble [item]");
        printToTerminal("TRACKING: careerStats, achievements, score, seeds, biomes");
        printToTerminal("GAME: save [slot], load [slot], saves, daily, ng+prepare, ng+start, tutorial");
        
        let contextCommands = [];
        if (room.isShop) contextCommands.push("buy [#]", "sell [item]");
        if (room.hullBreach) contextCommands.push("seal (hull repair)");
        if (room.hackableConsole) contextCommands.push("hack (console)");
        if (room.hasTurrets) contextCommands.push("dodge (turrets)");
        if (Object.keys(discoveredPortals).length > 0) contextCommands.push("portal [biome]");
        
        if (contextCommands.length > 0) {
            printToTerminal("ROOM-SPECIFIC: " + contextCommands.join(", "));
        }
        printToTerminal("(Type 'help' anytime to see this list)");
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
        // Track seed in history
        if (!previousSeeds.includes(seed)) {
            previousSeeds.unshift(seed);
            if (previousSeeds.length > 10) previousSeeds.pop();
        }
        printToTerminal(`🏆 DAILY CHALLENGE MODE ACTIVATED!`);
        printToTerminal(`SEED: ${seed} (Same seed for all players today!)`);
        printToTerminal(`Compete for highest distance traveled or most credits earned before death.`);
        printToTerminal(`Your score will be: (distance * 10) + credits`);
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
            printToTerminal("MAGIC: 'cast heal' (restores HP), 'cast fireball' (damages). Both cost 10 MP.");
            printToTerminal("CLASSES: 5 class types with unique skills (Power Strike, Arcane Burst, Shield Wall, Quick Hack, Berserk).");
            printToTerminal("EQUIPMENT: Weapon/armor effects (Vampiric, Lifesteal, Evasive, Reflective, Overclocked, Adaptive, etc).");
            printToTerminal("HAZARDS: Hull Breach (use 'seal'), Turrets (use 'dodge'), Consoles (use 'hack').");
            printToTerminal("QUESTS: 'talk' to NPCs, 'give [item]' to complete. Earn rewards.");
            printToTerminal("SHOPS: 'buy/sell [item]' at safe zones. Prices scale with distance.");
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