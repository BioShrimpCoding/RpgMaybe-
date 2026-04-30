// --- UTILITIES ---
function getRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
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
    equipped: { weapon: null, armor: null },
    activeQuests: [],
    skills: [],
    class: null,
    tempDefense: 0,
    skillCooldowns: {}
};

let currentEnemy = null; 

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
let allMaterials = ["health potion", "mana potion", "antidote", "rusty key", "keycard", "system map"]; 
let allBlueprints = [];

// Enemy abilities per type
let enemyAbilities = {
    'Cybernetic': { ability: 'scan', dmgBonus: 3 },
    'Elite': { ability: 'bash', dmgBonus: 5 },
    'Nano': { ability: 'swarm', dmgBonus: 2, hits: 2 },
    'Rogue': { ability: 'evade', dodgeChance: 0.15 }
};

// 1. GENERATE 100 WEAPONS
const prefixes = [
    { name: "rusty", bonus: 0, mat: "scrap metal" }, { name: "bone", bonus: 1, mat: "bone" },
    { name: "iron", bonus: 3, mat: "iron ore" }, { name: "steel", bonus: 5, mat: "steel ingot" },
    { name: "laser", bonus: 7, mat: "laser lens" }, { name: "plasma", bonus: 10, mat: "plasma core" },
    { name: "crystal", bonus: 12, mat: "magic crystal" }, { name: "dragon", bonus: 15, mat: "dragon scale" },
    { name: "void", bonus: 20, mat: "void essence" }, { name: "quantum", bonus: 25, mat: "dark matter" }
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
        masterRecipes[wName] = [prefix.mat, base.mat];
        allBlueprints.push(`${wName} blueprint`);
        if(!allMaterials.includes(prefix.mat)) allMaterials.push(prefix.mat);
        if(!allMaterials.includes(base.mat)) allMaterials.push(base.mat);
    });
    armorBases.forEach(base => {
        let aName = `${prefix.name} ${base.name}`;
        armorStats[aName] = base.stat + prefix.bonus;
        masterRecipes[aName] = [prefix.mat, base.mat];
        allBlueprints.push(`${aName} blueprint`);
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
        roomEnemy = template;
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

    return { 
        theme: currentTheme, isShop: false, visited: false,
        desc: `You are in a ${getRandom(words.adjectives)} ${getRandom(words.types)}. You see ${getRandom(words.features)}`, 
        exits: exits, item: roomItem, enemy: roomEnemy, npc: roomNpc,
        locked: locked, requiredKey: requiredKey, resourceNode: resourceNode
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
        if (action === "inventory") return showInventory();
        if (action === "recipes") return showRecipes();
        if (action === "quests") return showActiveQuests();
        if (action === "skill") return useSkill(target);

        // APPLY STATUS EFFECTS
        if (player.status === "poisoned") {
            player.hp -= 2;
            printToTerminal("⚠️ Poison courses through your veins! You take 2 damage.");
            if (player.hp <= 0) return printToTerminal("THE POISON HAS KILLED YOU. GAME OVER.");
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

            // If player reached the victory coordinates, spawn the Omega Core boss
            if (victoryX !== null && victoryY !== null && tx === victoryX && ty === victoryY && !omegaDefeated) {
                worldMap[tCoord].enemy = {
                    name: "THE OMEGA CORE", hp: 1200, attack: 30, xp: 1500, credits: 1000,
                    drops: ["omega chipset", "keycard", "system map"], isOmega: true
                };
                worldMap[tCoord].desc = "You stand in the Heart Chamber. Massive conduits pulse with a dark light. A towering construct dominates the room: THE OMEGA CORE.";
            }

            printToTerminal(`You walk ${action}.`);
            executeLook(); 
            // autosave on movement
            autoSave();
        }
        else if (action === "take" || action === "grab") {
            if (room.item && (target === room.item || target === "all")) {
                addToInventory(room.item, room.itemRarity || 'common');
                printToTerminal(`You picked up the ${room.item}.`);
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
        else if (action === "buy" && room.isShop) {
            const shopItems = { "health potion": 20, "mana potion": 20, "antidote": 15, "system map": 50, "scrap metal": 10 };
            if (!target || !shopItems[target]) return printToTerminal("Buy what? Available: health potion (20c), mana potion (20c), antidote (15c), system map (50c), scrap metal (10c).");
            let basePrice = shopItems[target];
            let distance = Math.abs(playerX) + Math.abs(playerY);
            let dynamicPrice = Math.max(1, Math.floor(basePrice * (1 + distance * 0.01) * (1 + (Math.random() - 0.5) * 0.2)));
            if (credits >= dynamicPrice) {
                credits -= dynamicPrice; addToInventory(target, 'common'); printToTerminal(`Bought ${target} for ${dynamicPrice}c. (Credits: ${credits})`);
            } else printToTerminal(`Not enough credits! (Price: ${dynamicPrice}c)`);
        }
        else if (action === "sell" && room.isShop) {
            let idx = inventoryIndexByName(target);
            if (idx === -1) return printToTerminal("You don't have that to sell.");
            removeFromInventoryIndex(idx); credits += 10; 
            printToTerminal(`Sold ${target} for 10 credits. (Credits: ${credits})`);
        }
        else if (action === "craft") processCraft(target);
        else if (action === "use" || action === "heal" || action === "read") useItem(action === "heal" ? "health potion" : target);
        else if (action === "equip") equipItem(target);
        else if (action === "cast") castMagic(target);
        else if (action === "help") printToTerminal("COMMANDS: north/south/east/west, look, inventory, stats, recipes, craft [item], use [item], equip [weapon/armor], cast [spell], talk, give [item], save, load, help, tutorial, quests, skill [name], gather, accessibility" + (room.isShop ? ", buy [item], sell [item]" : ""));
        else if (action === "look") executeLook();
        else if (action === "tutorial") showTutorial();
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
        const saveData = { inventory, credits, playerX, playerY, worldMap, player, gameState, victoryX, victoryY, omegaDefeated };
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

    function restartGame() {
        inventory = [{ name: "health potion", rarity: 'common' }, { name: "scrap metal", rarity: 'common' }];
        credits = 0;
        playerX = 0; playerY = 0; worldMap = {};
        victoryX = null; victoryY = null; omegaDefeated = false;
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
        currentEnemy = null; gameState = "CLASS_SELECT";
        printToTerminal("\n--- RESTARTING SIMULATION ---");
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
        updateStats();
        printToTerminal(`✅ GAME LOADED SUCCESSFULLY (Slot: ${slot}).`);
        if(gameState === "PLAYING") executeLook();
    }

    function autoSave() {
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

    function equipItem(itemName) {
        let idx = inventoryIndexByName(itemName);
        if (idx === -1) return printToTerminal(`You don't have a '${itemName}'.`);
        let it = inventory[idx]; if (typeof it === 'string') it = { name: it, rarity: 'common' };

        if (weaponStats[itemName]) {
            if (player.equipped.weapon) addToInventory(player.equipped.weapon, player.equipped.weaponRarity);
            player.equipped.weapon = itemName;
            player.equipped.weaponRarity = it.rarity || 'common';
            removeFromInventoryIndex(idx);
            printToTerminal(`You equipped the ${itemName}.`);
        } else if (armorStats[itemName]) {
            if (player.equipped.armor) addToInventory(player.equipped.armor, player.equipped.armorRarity);
            player.equipped.armor = itemName;
            player.equipped.armorRarity = it.rarity || 'common';
            removeFromInventoryIndex(idx);
            printToTerminal(`You wore the ${itemName}.`);
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
                printToTerminal(`*CLANG* You crafted a [${target}]!`);
            } else printToTerminal(`Missing materials: ${reqs.join(", ")}`);
        } else printToTerminal(`You don't know how to craft that.`);
    }

    function handleCombatMode(action, target) {
        if (action === "attack") {
            let dmg = Math.floor(Math.random() * player.attack) + 1;
            let critChance = Math.min(0.25, 0.1 + player.level * 0.01);
            if (Math.random() < critChance) {
                dmg *= 2;
                printToTerminal(`⚔️ CRITICAL HIT! You strike the ${currentEnemy.name} for ${dmg} damage!`);
            } else {
                printToTerminal(`⚔️ You strike the ${currentEnemy.name} for ${dmg} damage!`);
            }
            currentEnemy.hp -= dmg;
            checkEnemyDeath();
        } 
        else if (action === "cast") castMagic(target);
        else if (action === "use" || action === "heal") useItem(action === "heal" ? "health potion" : target);
        else if (action === "run") {
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
            credits += currentEnemy.credits;
            printToTerminal(`Picked up ${currentEnemy.credits} credits. (Total: ${credits})`);
            
            player.xp += currentEnemy.xp;
            printToTerminal(`You gained ${currentEnemy.xp} XP.`);
            checkLevelUp();
            
            let dropped = generateDrop(currentEnemy);
            worldMap[`${playerX},${playerY}`].item = dropped.name;
            worldMap[`${playerX},${playerY}`].itemRarity = dropped.rarity;
            printToTerminal(`The enemy dropped a [${dropped.name}] (${dropped.rarity})! Type 'take ${dropped.name}'.`);
            
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
        let actualDmg = Math.max(1, rawDmg - defenseReduction);
        player.hp -= actualDmg;
        printToTerminal(`The ${currentEnemy.name} hits you for ${actualDmg} damage! (Absorbed ${rawDmg - actualDmg}) (HP: ${player.hp})`);
        
        if (Math.random() < 0.1 && player.status !== "poisoned") {
            player.status = "poisoned";
            printToTerminal("🤢 The enemy's attack POISONED you! Use an antidote!");
        }
        if (player.hp <= 0) printToTerminal("YOUR VISION FADES TO BLACK. GAME OVER.");
    }

    function checkLevelUp() {
        if (player.xp >= player.xpNeeded) {
            player.level++; player.maxHp += 5; player.hp = player.maxHp; 
            player.maxMp += 5; player.mp = player.maxMp;
            player.baseAttack += 1; player.baseDefense += 1; updateStats();
            player.xp -= player.xpNeeded; player.xpNeeded = Math.floor(player.xpNeeded * 1.5); 
            printToTerminal(`!!! LEVEL UP !!! You are now Level ${player.level}. Stats increased!`);
        }
    }

    function executeLook() {
        let room = worldMap[`${playerX},${playerY}`];
        printToTerminal(room.desc);
        if (room.isShop) printToTerminal("Type 'buy [item]' or 'sell [item]'.");
        if (room.resourceNode) printToTerminal(`💎 There is a resource node here with ${room.resourceNode.amount}x [${room.resourceNode.material}]. Type 'gather' to collect.`);
        printToTerminal(`Exits: ${room.exits.join(", ")}`);
        
        if (room.item) printToTerminal(`🎁 There is a [${room.item}] resting here.`);
        if (room.npc) printToTerminal(`🗣️ There is a ${room.npc.name} here, ${room.npc.desc} Type 'talk' to interact.`);
        
        if (room.enemy) {
            currentEnemy = room.enemy; 
            printToTerminal(`⚠️ WARNING: A ${currentEnemy.name} with HP: ${currentEnemy.hp} attacks! !!!`);
        }
    }

    function printToTerminal(text) {
        const p = document.createElement("p");
        if (typeof text === 'string') p.textContent = text; else p.textContent = String(text);
        terminalOutput.appendChild(p);
        // limit terminal lines to 500
        while (terminalOutput.childNodes.length > 500) terminalOutput.removeChild(terminalOutput.firstChild);
        playerInput.scrollIntoView();
    }

    function showTutorial() {
        printToTerminal("\n=== SECTOR 7 SURVIVAL TUTORIAL ===");
        printToTerminal("MOVEMENT: north/south/east/west to explore the infinite facility.");
        printToTerminal("ITEMS: 'take [item]' or 'take all' to pick up loot. 'use [item]' to consume.");
        printToTerminal("INVENTORY: 'inventory' to see your items. Items have rarity tiers [common/uncommon/rare/epic/legendary].");
        printToTerminal("EQUIPMENT: 'equip [weapon/armor]' to boost attack/defense stats.");
        printToTerminal("COMBAT: Face enemies in turn-based battles. Commands: 'attack', 'cast [spell]', 'use [item]', 'run'.");
        printToTerminal("MAGIC: 'cast heal' or 'cast fireball' (10 MP each). Use 'cast' to see available spells.");
        printToTerminal("SKILLS: Each class has unique abilities. Use 'skill [name]' in combat (e.g., 'skill power strike').");
        printToTerminal("CRAFTING: 'recipes' to see known recipes. 'craft [item]' if you have materials.");
        printToTerminal("RESOURCES: 'gather' in rooms with resource nodes to collect materials.");
        printToTerminal("QUESTS: Talk to NPCs ('talk'), accept quests, and 'give [item]' to complete them.");
        printToTerminal("SHOPS: Buy/sell at safe zones ('buy/sell [item]'). Prices scale with distance.");
        printToTerminal("SAVING: 'save' or 'save [slot]' to persist progress. 'load [slot]' to resume. 'saves' to see slots.");
        printToTerminal("VICTORY: Reach coordinates > [100,100] to find the final boss: THE OMEGA CORE.");
        printToTerminal("LEVELING: Defeat enemies to gain XP. Level up for better stats. Status 'poisoned' drains HP—use antidote!");
        printToTerminal("\n(Type 'help' for command list or 'stats' for your current condition.)");
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