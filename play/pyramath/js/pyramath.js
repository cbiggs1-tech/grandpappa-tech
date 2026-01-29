// pyramath.js - Mental Math Pyramid Trainer
// ===========================================
// Core Mechanic:
// - Capstone displays the CURRENT TARGET value
// - Player selects ANY two unsolved stones from the face (no row/adjacency restriction)
// - If their operation result equals the target → both stones turn gold (.solved)
// - Capstone then updates to a NEW target from remaining possible pairs
// - Face completes when no more valid pairs exist
// - Complete all 4 faces to level up!
// ===========================================

// ============================================
// Operations Configuration
// ============================================
const OPERATIONS = {
    add: {
        symbol: '+',
        name: 'Addition',
        fn: (a, b) => a + b
    },
    subtract: {
        symbol: '−',
        name: 'Subtraction',
        // Always larger - smaller to avoid negatives
        fn: (a, b) => Math.abs(a - b)
    },
    multiply: {
        symbol: '×',
        name: 'Multiplication',
        fn: (a, b) => a * b
    },
    divide: {
        symbol: '÷',
        name: 'Division',
        // Always larger / smaller, floor result
        fn: (a, b) => {
            const dividend = Math.max(a, b);
            const divisor = Math.max(1, Math.min(a, b));
            return Math.floor(dividend / divisor);
        }
    }
};

const FACE_ORDER = ['add', 'subtract', 'multiply', 'divide'];

// Stones per row (capstone at top, base at bottom)
// Fixed at 5 rows: [1, 2, 3, 4, 5] = 15 stones, 7 pairs to solve per face
const ROWS = [1, 2, 3, 4, 5];

// ============================================
// Level Configuration
// Age-appropriate progression for 4th-6th graders (ages 9-12)
// ============================================

function getLevelRanges(level, operation) {
    const levelScaling = {
        add: [
            { min: 1, max: 10 },      // Level 1: 1-10
            { min: 5, max: 25 },      // Level 2: 5-25
            { min: 10, max: 50 },     // Level 3: 10-50
            { min: 20, max: 100 },    // Level 4: 20-100
            { min: 50, max: 200 },    // Level 5: 50-200
        ],
        subtract: [
            { min: 5, max: 20 },      // Level 1: 5-20
            { min: 10, max: 50 },     // Level 2: 10-50
            { min: 20, max: 100 },    // Level 3: 20-100
            { min: 40, max: 200 },    // Level 4: 40-200
            { min: 80, max: 400 },    // Level 5: 80-400
        ],
        multiply: [
            { min: 2, max: 9 },       // Level 1: 2-9 (basic times tables)
            { min: 3, max: 12 },      // Level 2: 3-12
            { min: 4, max: 12 },      // Level 3: 4-12
            { min: 5, max: 15 },      // Level 4: 5-15
            { min: 6, max: 15 },      // Level 5: 6-15
        ],
        divide: [
            // For division, we generate factor pairs
            { minFactor: 2, maxFactor: 6, minQuotient: 2, maxQuotient: 9 },    // L1
            { minFactor: 2, maxFactor: 9, minQuotient: 2, maxQuotient: 12 },   // L2
            { minFactor: 3, maxFactor: 10, minQuotient: 3, maxQuotient: 12 },  // L3
            { minFactor: 4, maxFactor: 12, minQuotient: 4, maxQuotient: 15 },  // L4
            { minFactor: 5, maxFactor: 15, minQuotient: 5, maxQuotient: 18 },  // L5
        ]
    };

    const scales = levelScaling[operation];
    const idx = Math.min(level - 1, scales.length - 1);
    return { ...scales[idx] };
}

// ============================================
// Game State
// ============================================
let currentLevel = 1;
let currentFaceIndex = 0;
let score = 0;
let streak = 0;
let timerInterval = null;
let elapsedSeconds = 0;
let selectedStones = [];
let soundEnabled = true;
let musicEnabled = true;
let completedFaces = new Set();

// Multiplayer state
let isMultiplayer = false;
let currentPlayer = 1;
let player1Score = 0;
let player2Score = 0;

// ============================================
// Audio System (Web Audio API)
// ============================================
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);

        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch (e) {
        console.log('Audio error:', e);
    }
}

function playChord(frequencies, duration, type = 'sine', volume = 0.2) {
    frequencies.forEach((freq, i) => {
        setTimeout(() => playTone(freq, duration, type, volume), i * 80);
    });
}

function playSoundEffect(soundName) {
    if (!soundEnabled) return;

    switch (soundName) {
        case 'correct':
            // Ascending chime: C-E-G
            playChord([523.25, 659.25, 783.99], 0.3, 'sine', 0.25);
            break;
        case 'wrong':
            // Descending buzz
            playTone(200, 0.15, 'sawtooth', 0.2);
            setTimeout(() => playTone(150, 0.15, 'sawtooth', 0.15), 100);
            break;
        case 'rotate':
            // Short whoosh (noise-like)
            playTone(800, 0.08, 'sine', 0.1);
            playTone(600, 0.08, 'sine', 0.1);
            break;
        case 'levelComplete':
            // Fanfare: 3 notes up
            playChord([523.25, 659.25, 783.99], 0.4, 'triangle', 0.3);
            break;
        case 'pyramidComplete':
            // Triumphant: 5 notes
            const notes = [523.25, 659.25, 783.99, 880, 1046.5];
            notes.forEach((freq, i) => {
                setTimeout(() => playTone(freq, 0.3, 'triangle', 0.25), i * 120);
            });
            break;
        case 'select':
            playTone(440, 0.05, 'sine', 0.15);
            break;
    }
}

// ============================================
// High Scores (localStorage)
// ============================================
const HIGHSCORE_KEY = 'pyramath_highscores';

function loadHighScores() {
    try {
        const data = localStorage.getItem(HIGHSCORE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveHighScores(scores) {
    try {
        localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(scores));
    } catch (e) {
        console.log('Could not save high scores:', e);
    }
}

function addHighScore(name, scoreVal, level, time) {
    const scores = loadHighScores();
    scores.push({
        name: name || 'Player',
        score: scoreVal,
        level: level,
        time: time,
        date: new Date().toLocaleDateString()
    });
    // Sort by score descending, keep top 10
    scores.sort((a, b) => b.score - a.score);
    const top10 = scores.slice(0, 10);
    saveHighScores(top10);
    return top10;
}

function isHighScore(scoreVal) {
    const scores = loadHighScores();
    if (scores.length < 10) return true;
    return scoreVal > scores[scores.length - 1].score;
}

// ============================================
// DOM Elements (initialized after DOM ready)
// ============================================
let pyramid, levelValue, scoreValue, timerValue, streakValue;
let operationSymbol, operationName, feedback, statusDisplay;
let newGameBtn, rotateLeftBtn, rotateRightBtn, soundToggleBtn, musicToggleBtn;
let levelCompleteModal, pyramidCompleteModal, levelContinueBtn, playAgainBtn, nextLevelBtn;
let multiplayerToggleBtn, playerTurnDisplay;
let leaderboardBtn, leaderboardModal, leaderboardBody, closeLeaderboardBtn;
let nameInputModal, nameInput, saveScoreBtn;
let faces;

// ============================================
// Utility Functions
// ============================================

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============================================
// Number Generation
// ============================================

function generateNumbersForFace(operation, level = currentLevel) {
    switch (operation) {
        case 'add':
            return generateAdditionNumbers(level);
        case 'subtract':
            return generateSubtractionNumbers(level);
        case 'multiply':
            return generateMultiplicationNumbers(level);
        case 'divide':
            return generateDivisionNumbers(level);
        default:
            return generateAdditionNumbers(level);
    }
}

function generateAdditionNumbers(level) {
    const range = getLevelRanges(level, 'add');
    const grid = [];
    const allNumbers = [];
    for (let i = 0; i < 14; i++) {
        allNumbers.push(randomInt(range.min, range.max));
    }
    shuffleArray(allNumbers);

    let idx = 0;
    for (let row = 1; row <= 4; row++) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            grid[row][col] = allNumbers[idx++];
        }
    }
    grid[0] = [0];
    return grid;
}

function generateSubtractionNumbers(level) {
    const range = getLevelRanges(level, 'subtract');
    const grid = [];
    const allNumbers = [];
    for (let i = 0; i < 14; i++) {
        allNumbers.push(randomInt(range.min, range.max));
    }
    shuffleArray(allNumbers);

    let idx = 0;
    for (let row = 1; row <= 4; row++) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            grid[row][col] = allNumbers[idx++];
        }
    }
    grid[0] = [0];
    return grid;
}

function generateMultiplicationNumbers(level) {
    const range = getLevelRanges(level, 'multiply');
    const grid = [];
    const allNumbers = [];
    for (let i = 0; i < 14; i++) {
        allNumbers.push(randomInt(range.min, range.max));
    }
    shuffleArray(allNumbers);

    let idx = 0;
    for (let row = 1; row <= 4; row++) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            grid[row][col] = allNumbers[idx++];
        }
    }
    grid[0] = [0];
    return grid;
}

function generateDivisionNumbers(level) {
    const range = getLevelRanges(level, 'divide');
    const grid = [];
    const allNumbers = [];
    const usedNumbers = new Set();

    for (let i = 0; i < 14; i++) {
        let num;
        let attempts = 0;
        do {
            const factor1 = randomInt(range.minFactor, range.maxFactor);
            const factor2 = randomInt(range.minQuotient, range.maxQuotient);
            num = factor1 * factor2;
            attempts++;
        } while (usedNumbers.has(num) && attempts < 20);

        usedNumbers.add(num);
        allNumbers.push(num);
    }

    shuffleArray(allNumbers);

    let idx = 0;
    for (let row = 1; row <= 4; row++) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            grid[row][col] = allNumbers[idx++];
        }
    }
    grid[0] = [0];
    return grid;
}

// ============================================
// Face Population
// ============================================

function populateFace(faceElement, operation) {
    faceElement.innerHTML = '';

    const faceBg = document.createElement('div');
    faceBg.className = 'face-bg';
    faceElement.appendChild(faceBg);

    const grid = generateNumbersForFace(operation, currentLevel);

    ROWS.forEach((stoneCount, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'stone-row';
        row.dataset.row = rowIndex;

        for (let col = 0; col < stoneCount; col++) {
            const stone = document.createElement('div');
            stone.className = 'stone';
            stone.dataset.row = rowIndex;
            stone.dataset.col = col;
            stone.dataset.operation = operation;
            stone.dataset.value = grid[rowIndex][col];
            stone.textContent = grid[rowIndex][col];

            if (rowIndex === 0) {
                stone.classList.add('target');
            } else {
                const numStr = String(grid[rowIndex][col]);
                if (numStr.length >= 5) {
                    stone.classList.add('tiny-text');
                } else if (numStr.length >= 4) {
                    stone.classList.add('small-text');
                }
            }

            stone.addEventListener('click', () => handleStoneClick(stone));
            row.appendChild(stone);
        }

        faceElement.appendChild(row);
    });

    setInitialTarget(faceElement, operation);
}

function setInitialTarget(faceElement, operation) {
    const possibleTargets = getAllPossibleResults(faceElement, operation);

    if (possibleTargets.length > 0) {
        let validTargets = possibleTargets;
        const unsolvedStones = faceElement.querySelectorAll('.stone:not(.target)');

        if (operation === 'add') {
            const maxStone = Math.max(...Array.from(unsolvedStones).map(s => parseInt(s.dataset.value)));
            validTargets = possibleTargets.filter(t => t >= maxStone);
            if (validTargets.length === 0) validTargets = possibleTargets;
        }

        // For division, filter out 0 targets (impossible)
        if (operation === 'divide') {
            const nonZero = possibleTargets.filter(t => t > 0);
            const nonTrivial = nonZero.filter(t => t > 1);
            validTargets = nonTrivial.length > 0 ? nonTrivial : (nonZero.length > 0 ? nonZero : possibleTargets);
        }

        const target = validTargets[randomInt(0, validTargets.length - 1)];
        const capstone = faceElement.querySelector('.stone-row[data-row="0"] .stone');
        capstone.dataset.value = target;
        capstone.textContent = target;

        const numStr = String(target);
        capstone.classList.remove('tiny-text', 'small-text');
        if (numStr.length >= 5) {
            capstone.classList.add('tiny-text');
        } else if (numStr.length >= 4) {
            capstone.classList.add('small-text');
        }
    }
}

/**
 * Get all possible results from pairing unsolved stones
 * CRITICAL FIX: Use the same operation function for all operations
 * This ensures division pairs match what checkSelectedPair accepts
 */
function getAllPossibleResults(faceElement, operation) {
    const unsolvedStones = faceElement.querySelectorAll('.stone:not(.solved):not(.target)');
    const results = new Set();
    const opFn = OPERATIONS[operation].fn;

    const stones = Array.from(unsolvedStones);
    for (let i = 0; i < stones.length; i++) {
        for (let j = i + 1; j < stones.length; j++) {
            const a = parseInt(stones[i].dataset.value);
            const b = parseInt(stones[j].dataset.value);
            // Use the same operation function for consistency
            const result = opFn(a, b);
            results.add(result);
        }
    }

    return Array.from(results);
}

function findPairsForTarget(faceElement, operation, target) {
    const unsolvedStones = faceElement.querySelectorAll('.stone:not(.solved):not(.target)');
    const pairs = [];
    const opFn = OPERATIONS[operation].fn;

    const stones = Array.from(unsolvedStones);
    for (let i = 0; i < stones.length; i++) {
        for (let j = i + 1; j < stones.length; j++) {
            const a = parseInt(stones[i].dataset.value);
            const b = parseInt(stones[j].dataset.value);
            const result = opFn(a, b);

            if (result === target) {
                pairs.push([stones[i], stones[j], a, b]);
            }
        }
    }

    return pairs;
}

// ============================================
// Game Initialization
// ============================================

const MAX_LEVEL = 5;

function initPyramid(keepScore = false) {
    currentFaceIndex = 0;
    if (!keepScore) {
        score = 0;
        player1Score = 0;
        player2Score = 0;
    }
    streak = 0;
    selectedStones = [];
    elapsedSeconds = 0;
    completedFaces = new Set();
    currentPlayer = 1;

    updateLevelDisplay();
    updateScoreDisplay();
    updateStreakDisplay();
    updateTimerDisplay();
    updateOperationDisplay();
    updatePlayerTurnDisplay();
    clearFeedback();

    Object.keys(faces).forEach(operation => {
        populateFace(faces[operation], operation);
    });

    rotatePyramidTo(0);
    startTimer();

    const levelName = getLevelName(currentLevel);
    setStatus(`Level ${currentLevel} (${levelName}) - Find two stones that equal the target!`);
}

function getLevelName(level) {
    const names = ['Warm-up', '4th Grade', '5th Grade', '6th Grade', 'Math Master'];
    return names[Math.min(level - 1, names.length - 1)];
}

function startNewGame() {
    currentLevel = 1;
    initPyramid(false);
}

function advanceToNextLevel() {
    if (currentLevel >= MAX_LEVEL) {
        setFeedback(`You've mastered Level ${MAX_LEVEL}! Play again for a higher score!`, false);
        initPyramid(true);
        return;
    }

    currentLevel++;
    const levelBonus = 100 * currentLevel;
    score += levelBonus;
    if (isMultiplayer) {
        if (currentPlayer === 1) player1Score += levelBonus;
        else player2Score += levelBonus;
    }
    initPyramid(true);

    if (currentLevel === MAX_LEVEL) {
        setFeedback(`Level Up! Welcome to Level ${currentLevel} - FINAL LEVEL! (+${levelBonus} bonus)`, false);
    } else {
        setFeedback(`Level Up! Welcome to Level ${currentLevel}! (+${levelBonus} bonus)`, false);
    }

    if (levelValue) {
        levelValue.classList.add('level-up-animation');
        setTimeout(() => levelValue.classList.remove('level-up-animation'), 1000);
    }
}

// ============================================
// Stone Selection & Pair Checking
// ============================================

function handleStoneClick(stone) {
    const operation = stone.dataset.operation;
    const currentOperation = FACE_ORDER[currentFaceIndex];

    if (operation !== currentOperation) return;

    if (stone.classList.contains('solved')) {
        setFeedback('That stone is already used!', true);
        return;
    }

    if (stone.classList.contains('target')) {
        const val = stone.dataset.value;
        setFeedback(`Target: ${val} — Find two stones that make this!`, false);
        return;
    }

    if (stone.classList.contains('selected')) {
        stone.classList.remove('selected');
        selectedStones = selectedStones.filter(s => s !== stone);
        clearFeedback();
    } else {
        if (selectedStones.length >= 2) {
            const oldest = selectedStones.shift();
            oldest.classList.remove('selected');
        }

        stone.classList.add('selected');
        selectedStones.push(stone);
        playSoundEffect('select');

        if (selectedStones.length === 2) {
            checkSelectedPair();
        } else {
            const val = stone.dataset.value;
            setFeedback(`Selected ${val}. Pick another stone!`, false);
        }
    }
}

function checkSelectedPair() {
    const [stoneA, stoneB] = selectedStones;
    const valA = parseInt(stoneA.dataset.value);
    const valB = parseInt(stoneB.dataset.value);
    const operation = FACE_ORDER[currentFaceIndex];
    const opData = OPERATIONS[operation];
    const faceElement = faces[operation];

    const capstone = faceElement.querySelector('.stone-row[data-row="0"] .stone');
    const target = parseInt(capstone.dataset.value);

    const result = opData.fn(valA, valB);

    if (result === target) {
        handleCorrectPair(stoneA, stoneB, valA, valB, result, operation, opData);
    } else {
        handleWrongPair(valA, valB, result, target, opData);
    }
}

function handleCorrectPair(stoneA, stoneB, valA, valB, result, operation, opData) {
    solveStone(stoneA);
    solveStone(stoneB);

    const basePoints = 10 + (streak * 5);
    const points = basePoints * currentLevel;
    score += points;

    if (isMultiplayer) {
        if (currentPlayer === 1) player1Score += points;
        else player2Score += points;
    }

    streak++;

    updateScoreDisplay();
    updateStreakDisplay();

    if (currentLevel > 1) {
        setFeedback(`✓ ${valA} ${opData.symbol} ${valB} = ${result}! (+${points} = ${basePoints}×L${currentLevel})`, false);
    } else {
        setFeedback(`✓ ${valA} ${opData.symbol} ${valB} = ${result}! (+${points})`, false);
    }
    playSoundEffect('correct');

    clearSelection();

    // Switch player on correct answer in multiplayer
    if (isMultiplayer) {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updatePlayerTurnDisplay();
    }

    updateCapstoneToNewTarget(operation);
}

function handleWrongPair(valA, valB, result, target, opData) {
    streak = 0;
    updateStreakDisplay();

    setFeedback(`✗ ${valA} ${opData.symbol} ${valB} = ${result}, not ${target}. Try again!`, true);
    shakeStones(selectedStones);
    playSoundEffect('wrong');

    // No turn switch on wrong answer in multiplayer
    clearSelection();
}

function updateCapstoneToNewTarget(operation) {
    const faceElement = faces[operation];
    const possibleTargets = getAllPossibleResults(faceElement, operation);
    const capstone = faceElement.querySelector('.stone-row[data-row="0"] .stone');

    if (possibleTargets.length === 0) {
        capstone.classList.add('solved');
        capstone.textContent = '✓';
        handleFaceComplete(operation);
    } else {
        let validTargets = possibleTargets;

        // For division, filter out 0 targets
        if (operation === 'divide') {
            const nonZero = possibleTargets.filter(t => t > 0);
            const nonTrivial = nonZero.filter(t => t > 1);
            validTargets = nonTrivial.length > 0 ? nonTrivial : (nonZero.length > 0 ? nonZero : possibleTargets);
        }

        if (operation === 'add') {
            const unsolvedStones = faceElement.querySelectorAll('.stone:not(.solved):not(.target)');
            const maxStone = Math.max(...Array.from(unsolvedStones).map(s => parseInt(s.dataset.value)));
            const sensibleTargets = possibleTargets.filter(t => t >= maxStone);
            if (sensibleTargets.length > 0) validTargets = sensibleTargets;
        }

        const newTarget = validTargets[randomInt(0, validTargets.length - 1)];
        capstone.dataset.value = newTarget;
        capstone.textContent = newTarget;

        const numStr = String(newTarget);
        capstone.classList.remove('tiny-text', 'small-text');
        if (numStr.length >= 5) {
            capstone.classList.add('tiny-text');
        } else if (numStr.length >= 4) {
            capstone.classList.add('small-text');
        }

        capstone.classList.add('target-changed');
        setTimeout(() => capstone.classList.remove('target-changed'), 500);

        setStatus(`New target: ${newTarget}! Find a matching pair.`);
    }
}

function solveStone(stone) {
    stone.classList.remove('selected');
    stone.classList.add('solved');
    stone.classList.add('just-solved');
    setTimeout(() => stone.classList.remove('just-solved'), 600);
}

function shakeStones(stones) {
    stones.forEach(stone => {
        stone.classList.add('shake');
        setTimeout(() => stone.classList.remove('shake'), 500);
    });
}

function clearSelection() {
    selectedStones.forEach(stone => stone.classList.remove('selected'));
    selectedStones = [];
}

// ============================================
// Face & Pyramid Completion
// ============================================

function handleFaceComplete(operation) {
    completedFaces.add(operation);

    const faceBonus = 50 * currentLevel;
    score += faceBonus;
    if (isMultiplayer) {
        if (currentPlayer === 1) player1Score += faceBonus;
        else player2Score += faceBonus;
    }
    updateScoreDisplay();

    if (completedFaces.size === 4) {
        stopTimer();
        playSoundEffect('pyramidComplete');
        setTimeout(() => showPyramidCompleteModal(), 800);
    } else {
        playSoundEffect('levelComplete');
        showLevelCompleteModal(operation);
    }
}

// ============================================
// Rotation Functions
// ============================================

function rotatePyramidTo(faceIndex) {
    currentFaceIndex = ((faceIndex % 4) + 4) % 4;

    Object.values(faces).forEach(face => {
        face.classList.remove('active');
    });

    const operation = FACE_ORDER[currentFaceIndex];
    faces[operation].classList.add('active');

    updateOperationDisplay();
    clearSelection();
    clearFeedback();
    playSoundEffect('rotate');

    if (completedFaces.has(operation)) {
        setStatus('✓ This face is complete! Rotate to continue.');
    } else {
        const faceElement = faces[operation];
        const capstone = faceElement.querySelector('.stone-row[data-row="0"] .stone');
        const target = capstone ? capstone.dataset.value : '?';
        setStatus(`Target: ${target} — Find two stones that make this!`);
    }
}

function rotateLeft() {
    rotatePyramidTo(currentFaceIndex - 1);
}

function rotateRight() {
    rotatePyramidTo(currentFaceIndex + 1);
}

// ============================================
// Display Updates
// ============================================

function updateLevelDisplay() {
    if (levelValue) levelValue.textContent = currentLevel;
}

function updateScoreDisplay() {
    if (isMultiplayer) {
        if (scoreValue) scoreValue.textContent = `P1:${player1Score} P2:${player2Score}`;
    } else {
        if (scoreValue) scoreValue.textContent = score;
    }
}

function updateStreakDisplay() {
    if (streakValue) streakValue.textContent = streak;
}

function updateTimerDisplay() {
    if (timerValue) {
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        timerValue.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

function updateOperationDisplay() {
    const operation = FACE_ORDER[currentFaceIndex];
    const opData = OPERATIONS[operation];
    if (operationSymbol) operationSymbol.textContent = opData.symbol;
    if (operationName) operationName.textContent = opData.name;
}

function updatePlayerTurnDisplay() {
    if (playerTurnDisplay) {
        if (isMultiplayer) {
            playerTurnDisplay.textContent = `Player ${currentPlayer}'s Turn`;
            playerTurnDisplay.style.display = 'block';
            playerTurnDisplay.className = `player-turn player${currentPlayer}`;
        } else {
            playerTurnDisplay.style.display = 'none';
        }
    }
}

function setFeedback(message, isError = false) {
    if (feedback) {
        feedback.textContent = message;
        feedback.style.color = isError ? '#C44' : '#3D2914';
    }
}

function clearFeedback() {
    if (feedback) feedback.textContent = '';
}

function setStatus(message) {
    if (statusDisplay) statusDisplay.textContent = message;
}

// ============================================
// Timer Functions
// ============================================

function startTimer() {
    stopTimer();
    elapsedSeconds = 0;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        elapsedSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ============================================
// Modal Functions
// ============================================

function showLevelCompleteModal(operation) {
    const faceBonus = 50 * currentLevel;
    const completedOp = document.getElementById('completed-operation');
    const bonusEl = document.getElementById('level-bonus');
    if (completedOp) completedOp.textContent = OPERATIONS[operation].name;
    if (bonusEl) bonusEl.textContent = `+${faceBonus}`;
    if (levelCompleteModal) levelCompleteModal.classList.add('active');
}

function hideLevelCompleteModal() {
    if (levelCompleteModal) levelCompleteModal.classList.remove('active');
}

function showPyramidCompleteModal() {
    const finalScoreEl = document.getElementById('final-score');
    const finalTimeEl = document.getElementById('final-time');
    const levelUpMsg = document.getElementById('level-up-message');

    if (isMultiplayer) {
        if (finalScoreEl) {
            const winner = player1Score > player2Score ? 'Player 1' :
                          player2Score > player1Score ? 'Player 2' : 'Tie';
            finalScoreEl.textContent = `P1: ${player1Score} | P2: ${player2Score} (${winner} wins!)`;
        }
    } else {
        if (finalScoreEl) finalScoreEl.textContent = score;
    }

    if (finalTimeEl && timerValue) finalTimeEl.textContent = timerValue.textContent;

    if (levelUpMsg) {
        if (currentLevel >= MAX_LEVEL) {
            levelUpMsg.textContent = `You've mastered all levels!`;
        } else {
            const nextLevel = currentLevel + 1;
            const nextLevelName = getLevelName(nextLevel);
            levelUpMsg.textContent = `Level Up! Ready for Level ${nextLevel} (${nextLevelName})?`;
        }
    }

    // Check for high score (single player only)
    if (!isMultiplayer && isHighScore(score)) {
        showNameInputModal();
    } else {
        if (pyramidCompleteModal) pyramidCompleteModal.classList.add('active');
    }
}

function hidePyramidCompleteModal() {
    if (pyramidCompleteModal) pyramidCompleteModal.classList.remove('active');
}

function showNameInputModal() {
    if (nameInputModal) {
        nameInputModal.classList.add('active');
        if (nameInput) {
            nameInput.value = '';
            nameInput.focus();
        }
    }
}

function hideNameInputModal() {
    if (nameInputModal) nameInputModal.classList.remove('active');
}

function showLeaderboardModal() {
    const scores = loadHighScores();
    if (leaderboardBody) {
        if (scores.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="5">No high scores yet!</td></tr>';
        } else {
            leaderboardBody.innerHTML = scores.map((s, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${s.name}</td>
                    <td>${s.score}</td>
                    <td>L${s.level}</td>
                    <td>${formatTime(s.time)}</td>
                </tr>
            `).join('');
        }
    }
    if (leaderboardModal) leaderboardModal.classList.add('active');
}

function hideLeaderboardModal() {
    if (leaderboardModal) leaderboardModal.classList.remove('active');
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ============================================
// Multiplayer Toggle
// ============================================

function toggleMultiplayer() {
    isMultiplayer = !isMultiplayer;
    if (multiplayerToggleBtn) {
        multiplayerToggleBtn.textContent = isMultiplayer ? '2P: ON' : '2P: OFF';
        multiplayerToggleBtn.classList.toggle('active', isMultiplayer);
    }
    updatePlayerTurnDisplay();
    updateScoreDisplay();

    // Restart game when toggling multiplayer
    startNewGame();
}

// ============================================
// Sound Functions
// ============================================

function toggleSound() {
    soundEnabled = !soundEnabled;
    if (soundToggleBtn) {
        soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
        soundToggleBtn.classList.toggle('muted', !soundEnabled);
    }
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    if (musicToggleBtn) {
        musicToggleBtn.textContent = musicEnabled ? '🎵' : '🎵';
        musicToggleBtn.classList.toggle('muted', !musicEnabled);
    }
}

function playSound(soundName) {
    playSoundEffect(soundName);
}

// ============================================
// Initialize DOM Elements and Event Listeners
// ============================================

function initDOMElements() {
    pyramid = document.getElementById('pyramid');
    levelValue = document.getElementById('level-value');
    scoreValue = document.getElementById('score-value');
    timerValue = document.getElementById('timer-value');
    streakValue = document.getElementById('streak-value');
    operationSymbol = document.getElementById('operation-symbol');
    operationName = document.getElementById('operation-name');
    feedback = document.getElementById('feedback');
    statusDisplay = document.getElementById('status');

    newGameBtn = document.getElementById('new-game-btn');
    rotateLeftBtn = document.getElementById('rotate-left-btn');
    rotateRightBtn = document.getElementById('rotate-right-btn');
    soundToggleBtn = document.getElementById('sound-toggle-btn');
    musicToggleBtn = document.getElementById('music-toggle-btn');
    multiplayerToggleBtn = document.getElementById('multiplayer-toggle-btn');
    playerTurnDisplay = document.getElementById('player-turn-display');

    levelCompleteModal = document.getElementById('level-complete-modal');
    pyramidCompleteModal = document.getElementById('pyramid-complete-modal');
    levelContinueBtn = document.getElementById('level-continue-btn');
    playAgainBtn = document.getElementById('play-again-btn');
    nextLevelBtn = document.getElementById('next-level-btn');

    leaderboardBtn = document.getElementById('leaderboard-btn');
    leaderboardModal = document.getElementById('leaderboard-modal');
    leaderboardBody = document.getElementById('leaderboard-body');
    closeLeaderboardBtn = document.getElementById('close-leaderboard-btn');

    nameInputModal = document.getElementById('name-input-modal');
    nameInput = document.getElementById('player-name-input');
    saveScoreBtn = document.getElementById('save-score-btn');

    faces = {
        add: document.querySelector('.face-front'),
        subtract: document.querySelector('.face-right'),
        multiply: document.querySelector('.face-back'),
        divide: document.querySelector('.face-left')
    };
}

function initEventListeners() {
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            hideLevelCompleteModal();
            hidePyramidCompleteModal();
            startNewGame();
        });
    }

    if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', rotateLeft);
    if (rotateRightBtn) rotateRightBtn.addEventListener('click', rotateRight);

    if (soundToggleBtn) soundToggleBtn.addEventListener('click', toggleSound);
    if (musicToggleBtn) musicToggleBtn.addEventListener('click', toggleMusic);
    if (multiplayerToggleBtn) multiplayerToggleBtn.addEventListener('click', toggleMultiplayer);

    if (levelContinueBtn) {
        levelContinueBtn.addEventListener('click', () => {
            hideLevelCompleteModal();
            rotateRight();
        });
    }

    if (nextLevelBtn) {
        nextLevelBtn.addEventListener('click', () => {
            hidePyramidCompleteModal();
            advanceToNextLevel();
        });
    }

    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            hidePyramidCompleteModal();
            startNewGame();
        });
    }

    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', showLeaderboardModal);
    }

    if (closeLeaderboardBtn) {
        closeLeaderboardBtn.addEventListener('click', hideLeaderboardModal);
    }

    if (saveScoreBtn) {
        saveScoreBtn.addEventListener('click', () => {
            const name = nameInput ? nameInput.value.trim() || 'Player' : 'Player';
            addHighScore(name, score, currentLevel, elapsedSeconds);
            hideNameInputModal();
            if (pyramidCompleteModal) pyramidCompleteModal.classList.add('active');
        });
    }

    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveScoreBtn.click();
            }
        });
    }

    // Click outside modal to close
    if (leaderboardModal) {
        leaderboardModal.addEventListener('click', (e) => {
            if (e.target === leaderboardModal) hideLeaderboardModal();
        });
    }

    const levelBox = document.querySelector('.level-box');
    if (levelBox) {
        levelBox.style.cursor = 'pointer';
        levelBox.addEventListener('click', () => {
            advanceToNextLevel();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'l' || e.key === 'L') {
            advanceToNextLevel();
            return;
        }
        switch (e.key) {
            case 'ArrowLeft':
                rotateLeft();
                break;
            case 'ArrowRight':
                rotateRight();
                break;
            case 'Escape':
                clearSelection();
                clearFeedback();
                hideLeaderboardModal();
                break;
        }
    });
}

// ============================================
// Initialize on Page Load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initDOMElements();
    initEventListeners();
    initPyramid();
});
