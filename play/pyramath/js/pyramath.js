// pyramath.js - Mental Math Pyramid Trainer
// ===========================================
// Core Mechanic:
// - Capstone displays the CURRENT TARGET value
// - Player selects ANY two unsolved stones from the face (no row/adjacency restriction)
// - If their operation result equals the target → both stones turn gold (.solved)
// - Capstone then updates to a NEW target from remaining possible pairs
// - Face completes when no more valid pairs exist
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
        // Always larger / smaller, ensure integer result
        fn: (a, b) => {
            const dividend = Math.max(a, b);
            const divisor = Math.max(1, Math.min(a, b));
            return Math.floor(dividend / divisor);
        }
    }
};

const FACE_ORDER = ['add', 'subtract', 'multiply', 'divide'];

// Stones per row (capstone at top, base at bottom)
// DIFFICULTY SCALING: Add more rows for harder levels
// Easy: [1, 2, 3, 4, 5] = 15 stones, 7 pairs to solve
// Medium: [1, 2, 3, 4, 5, 6] = 21 stones, 10 pairs to solve
// Hard: [1, 2, 3, 4, 5, 6, 7] = 28 stones, 13 pairs to solve
const ROWS = [1, 2, 3, 4, 5];

// ============================================
// Game State
// ============================================
let currentFaceIndex = 0;
let score = 0;
let streak = 0;
let timerInterval = null;
let elapsedSeconds = 0;
let selectedStones = [];
let soundEnabled = true;
let musicEnabled = true;
let completedFaces = new Set();

// ============================================
// DOM Elements
// ============================================
const pyramid = document.getElementById('pyramid');
const scoreValue = document.getElementById('score-value');
const timerValue = document.getElementById('timer-value');
const streakValue = document.getElementById('streak-value');
const operationSymbol = document.getElementById('operation-symbol');
const operationName = document.getElementById('operation-name');
const feedback = document.getElementById('feedback');
const status = document.getElementById('status');

const newGameBtn = document.getElementById('new-game-btn');
const rotateLeftBtn = document.getElementById('rotate-left-btn');
const rotateRightBtn = document.getElementById('rotate-right-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const musicToggleBtn = document.getElementById('music-toggle-btn');

const levelCompleteModal = document.getElementById('level-complete-modal');
const pyramidCompleteModal = document.getElementById('pyramid-complete-modal');
const levelContinueBtn = document.getElementById('level-continue-btn');
const playAgainBtn = document.getElementById('play-again-btn');

const faces = {
    add: document.querySelector('.face-front'),
    subtract: document.querySelector('.face-right'),
    multiply: document.querySelector('.face-back'),
    divide: document.querySelector('.face-left')
};

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
// Generates values for all stones on a face
// Future: Adjust ranges here for difficulty levels
// ============================================

function generateNumbersForFace(operation) {
    // Generate pool of numbers based on operation
    // These become the selectable stones (rows 1-4, excluding capstone row 0)

    switch (operation) {
        case 'add':
            return generateAdditionNumbers();
        case 'subtract':
            return generateSubtractionNumbers();
        case 'multiply':
            return generateMultiplicationNumbers();
        case 'divide':
            return generateDivisionNumbers();
        default:
            return generateAdditionNumbers();
    }
}

function generateAdditionNumbers() {
    // Generate numbers where pairs sum to reasonable targets
    // DIFFICULTY SCALING: Adjust these ranges for harder levels
    // Easy: 2-12, Medium: 5-25, Hard: 10-50
    const minVal = 2;
    const maxVal = 12;
    const grid = [];

    grid[4] = [];
    for (let i = 0; i < 5; i++) {
        grid[4][i] = randomInt(minVal, maxVal);
    }

    // Build upward (these become reference values, capstone will be dynamic)
    for (let row = 3; row >= 0; row--) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            grid[row][col] = grid[row + 1][col] + grid[row + 1][col + 1];
        }
    }

    return grid;
}

function generateSubtractionNumbers() {
    // Generate numbers where pairs have positive differences
    // DIFFICULTY SCALING: Adjust ranges for harder levels
    // Easy: 5-20, Medium: 10-50, Hard: 20-100
    const minVal = 5;
    const maxVal = 20;
    const grid = [];

    grid[4] = [];
    for (let i = 0; i < 5; i++) {
        grid[4][i] = randomInt(minVal, maxVal);
    }

    for (let row = 3; row >= 0; row--) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            // Use absolute difference
            grid[row][col] = Math.abs(grid[row + 1][col] - grid[row + 1][col + 1]);
        }
    }

    return grid;
}

function generateMultiplicationNumbers() {
    // Small numbers to keep products manageable
    // DIFFICULTY SCALING: Adjust ranges for harder levels
    // Easy: 2-9, Medium: 3-12, Hard: 5-15
    const minVal = 2;
    const maxVal = 9;
    const grid = [];

    grid[4] = [];
    for (let i = 0; i < 5; i++) {
        grid[4][i] = randomInt(minVal, maxVal);
    }

    for (let row = 3; row >= 0; row--) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            grid[row][col] = grid[row + 1][col] * grid[row + 1][col + 1];
        }
    }

    return grid;
}

function generateDivisionNumbers() {
    // Generate numbers that divide cleanly (no fractions, no zeros)
    // Strategy: Generate quotient × divisor pairs
    // DIFFICULTY SCALING: Adjust ranges for harder levels
    // Easy: divisor 2-6, quotient 2-8 → products 4-48
    // Medium: divisor 2-9, quotient 3-12 → products 6-108
    // Hard: divisor 3-12, quotient 4-15 → products 12-180
    const minDivisor = 2;
    const maxDivisor = 6;
    const minQuotient = 2;
    const maxQuotient = 8;
    const grid = [];

    // Bottom row: products of small factors (ensures clean division possible)
    grid[4] = [];
    for (let i = 0; i < 5; i++) {
        // Generate as divisor × quotient to ensure clean division
        const divisor = randomInt(minDivisor, maxDivisor);
        const quotient = randomInt(minQuotient, maxQuotient);
        grid[4][i] = divisor * quotient; // Always ≥ 4, never 0
    }

    // Build upward using division (larger / smaller)
    for (let row = 3; row >= 0; row--) {
        grid[row] = [];
        for (let col = 0; col <= row; col++) {
            const a = grid[row + 1][col];
            const b = grid[row + 1][col + 1];
            const dividend = Math.max(a, b);
            const divisor = Math.max(1, Math.min(a, b));
            grid[row][col] = Math.floor(dividend / divisor);
            // Ensure no zeros
            if (grid[row][col] === 0) grid[row][col] = 1;
        }
    }

    return grid;
}

// ============================================
// Face Population
// Creates DOM stones and sets initial target
// ============================================

function populateFace(faceElement, operation) {
    faceElement.innerHTML = '';

    // Re-add the pyramid background for this face
    const faceBg = document.createElement('div');
    faceBg.className = 'face-bg';
    faceElement.appendChild(faceBg);

    const grid = generateNumbersForFace(operation);

    // Create all rows and stones
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

            // Capstone (row 0) is the target display
            if (rowIndex === 0) {
                stone.classList.add('target');
            }

            stone.addEventListener('click', () => handleStoneClick(stone));
            row.appendChild(stone);
        }

        faceElement.appendChild(row);
    });

    // Set initial target from possible pairs
    setInitialTarget(faceElement, operation);
}

/**
 * Set the initial capstone target based on possible pairs
 */
function setInitialTarget(faceElement, operation) {
    const possibleTargets = getAllPossibleResults(faceElement, operation);

    if (possibleTargets.length > 0) {
        // Pick a random target from possible results
        const target = possibleTargets[randomInt(0, possibleTargets.length - 1)];
        const capstone = faceElement.querySelector('.stone-row[data-row="0"] .stone');
        capstone.dataset.value = target;
        capstone.textContent = target;
    }
}

/**
 * Get all possible results from pairing unsolved stones
 */
function getAllPossibleResults(faceElement, operation) {
    const unsolvedStones = faceElement.querySelectorAll('.stone:not(.solved):not(.target)');
    const results = new Set();
    const opFn = OPERATIONS[operation].fn;

    // Check all possible pairs
    const stones = Array.from(unsolvedStones);
    for (let i = 0; i < stones.length; i++) {
        for (let j = i + 1; j < stones.length; j++) {
            const a = parseInt(stones[i].dataset.value);
            const b = parseInt(stones[j].dataset.value);
            const result = opFn(a, b);

            // For division, only include integer results
            if (operation === 'divide') {
                const dividend = Math.max(a, b);
                const divisor = Math.max(1, Math.min(a, b));
                if (dividend % divisor === 0) {
                    results.add(result);
                }
            } else {
                results.add(result);
            }
        }
    }

    return Array.from(results);
}

/**
 * Find all pairs that produce a specific target value
 */
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

function initPyramid() {
    currentFaceIndex = 0;
    score = 0;
    streak = 0;
    selectedStones = [];
    elapsedSeconds = 0;
    completedFaces = new Set();

    updateScoreDisplay();
    updateStreakDisplay();
    updateTimerDisplay();
    updateOperationDisplay();
    clearFeedback();

    // Populate all faces with numbers
    Object.keys(faces).forEach(operation => {
        populateFace(faces[operation], operation);
    });

    rotatePyramidTo(0);
    startTimer();
    setStatus('Find two stones that equal the target at the top!');
}

// ============================================
// Stone Selection & Pair Checking
// ============================================

/**
 * Handle stone click - no row restriction, any two unsolved stones
 */
function handleStoneClick(stone) {
    const operation = stone.dataset.operation;
    const currentOperation = FACE_ORDER[currentFaceIndex];

    // Ignore clicks on wrong face
    if (operation !== currentOperation) return;

    // Ignore clicks on solved stones
    if (stone.classList.contains('solved')) {
        setFeedback('That stone is already used!', true);
        return;
    }

    // Ignore clicks on the target capstone
    if (stone.classList.contains('target')) {
        const val = stone.dataset.value;
        setFeedback(`Target: ${val} — Find two stones that make this!`, false);
        return;
    }

    // Toggle selection
    if (stone.classList.contains('selected')) {
        stone.classList.remove('selected');
        selectedStones = selectedStones.filter(s => s !== stone);
        clearFeedback();
    } else {
        // Auto-deselect oldest if already have 2
        if (selectedStones.length >= 2) {
            const oldest = selectedStones.shift();
            oldest.classList.remove('selected');
        }

        stone.classList.add('selected');
        selectedStones.push(stone);

        if (selectedStones.length === 2) {
            checkSelectedPair();
        } else {
            const val = stone.dataset.value;
            setFeedback(`Selected ${val}. Pick another stone!`, false);
        }
    }
}

/**
 * Check if the two selected stones produce the target
 */
function checkSelectedPair() {
    const [stoneA, stoneB] = selectedStones;
    const valA = parseInt(stoneA.dataset.value);
    const valB = parseInt(stoneB.dataset.value);
    const operation = FACE_ORDER[currentFaceIndex];
    const opData = OPERATIONS[operation];
    const faceElement = faces[operation];

    // Get current target
    const capstone = faceElement.querySelector('.stone-row[data-row="0"] .stone');
    const target = parseInt(capstone.dataset.value);

    // Calculate result
    const result = opData.fn(valA, valB);

    // For division, check if it's clean
    if (operation === 'divide') {
        const dividend = Math.max(valA, valB);
        const divisor = Math.max(1, Math.min(valA, valB));
        if (dividend % divisor !== 0) {
            setFeedback(`${dividend} ${opData.symbol} ${divisor} doesn't divide evenly!`, true);
            streak = 0;
            updateStreakDisplay();
            shakeStones(selectedStones);
            clearSelection();
            return;
        }
    }

    // Check if result matches target
    if (result === target) {
        // SUCCESS!
        handleCorrectPair(stoneA, stoneB, valA, valB, result, operation, opData);
    } else {
        // Wrong pair
        handleWrongPair(valA, valB, result, target, opData);
    }
}

/**
 * Handle a correct pair match
 */
function handleCorrectPair(stoneA, stoneB, valA, valB, result, operation, opData) {
    // Mark both stones as solved
    solveStone(stoneA);
    solveStone(stoneB);

    // Calculate points: base 10 + streak bonus
    // Future difficulty: increase base points for harder levels
    const points = 10 + (streak * 5);
    score += points;
    streak++;

    updateScoreDisplay();
    updateStreakDisplay();

    // Show success feedback
    setFeedback(`✓ ${valA} ${opData.symbol} ${valB} = ${result}! (+${points})`, false);
    playSound('correct');

    clearSelection();

    // Update to new target or complete face
    updateCapstoneToNewTarget(operation);
}

/**
 * Handle a wrong pair attempt
 */
function handleWrongPair(valA, valB, result, target, opData) {
    streak = 0;
    updateStreakDisplay();

    setFeedback(`✗ ${valA} ${opData.symbol} ${valB} = ${result}, not ${target}. Try again!`, true);
    shakeStones(selectedStones);
    playSound('wrong');

    clearSelection();
}

/**
 * Update the capstone to a new target from remaining pairs
 * If no pairs left, face is complete
 */
function updateCapstoneToNewTarget(operation) {
    const faceElement = faces[operation];
    const possibleTargets = getAllPossibleResults(faceElement, operation);
    const capstone = faceElement.querySelector('.stone-row[data-row="0"] .stone');

    if (possibleTargets.length === 0) {
        // No more pairs possible - face complete!
        capstone.classList.add('solved');
        capstone.textContent = '✓';
        handleFaceComplete(operation);
    } else {
        // Pick a new random target
        const newTarget = possibleTargets[randomInt(0, possibleTargets.length - 1)];
        capstone.dataset.value = newTarget;
        capstone.textContent = newTarget;

        // Brief highlight to show target changed
        capstone.classList.add('target-changed');
        setTimeout(() => capstone.classList.remove('target-changed'), 500);

        setStatus(`New target: ${newTarget}! Find a matching pair.`);
    }
}

/**
 * Mark a stone as solved
 */
function solveStone(stone) {
    stone.classList.remove('selected');
    stone.classList.add('solved');
    stone.classList.add('just-solved');
    setTimeout(() => stone.classList.remove('just-solved'), 600);
}

/**
 * Shake stones for wrong answer feedback
 */
function shakeStones(stones) {
    stones.forEach(stone => {
        stone.classList.add('shake');
        setTimeout(() => stone.classList.remove('shake'), 500);
    });
}

/**
 * Clear selection state
 */
function clearSelection() {
    selectedStones.forEach(stone => stone.classList.remove('selected'));
    selectedStones = [];
}

// ============================================
// Face & Pyramid Completion
// ============================================

function handleFaceComplete(operation) {
    completedFaces.add(operation);

    // Bonus points for completing a face
    const faceBonus = 50;
    score += faceBonus;
    updateScoreDisplay();

    if (completedFaces.size === 4) {
        // All faces complete - pyramid complete!
        stopTimer();
        playSound('pyramidComplete');
        setTimeout(() => showPyramidCompleteModal(), 800);
    } else {
        playSound('levelComplete');
        showLevelCompleteModal(operation);
    }
}

// ============================================
// Rotation Functions
// ============================================

function rotatePyramidTo(faceIndex) {
    currentFaceIndex = ((faceIndex % 4) + 4) % 4;

    // Remove active class from all faces
    Object.values(faces).forEach(face => {
        face.classList.remove('active');
    });

    // Add active class to current face
    const operation = FACE_ORDER[currentFaceIndex];
    faces[operation].classList.add('active');

    updateOperationDisplay();
    clearSelection();
    clearFeedback();

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

function updateScoreDisplay() {
    scoreValue.textContent = score;
}

function updateStreakDisplay() {
    streakValue.textContent = streak;
}

function updateTimerDisplay() {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    timerValue.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateOperationDisplay() {
    const operation = FACE_ORDER[currentFaceIndex];
    const opData = OPERATIONS[operation];
    operationSymbol.textContent = opData.symbol;
    operationName.textContent = opData.name;
}

function setFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.style.color = isError ? '#C44' : '#3D2914';
}

function clearFeedback() {
    feedback.textContent = '';
}

function setStatus(message) {
    status.textContent = message;
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
    document.getElementById('completed-operation').textContent = OPERATIONS[operation].name;
    document.getElementById('level-bonus').textContent = '+50';
    levelCompleteModal.classList.add('active');
}

function hideLevelCompleteModal() {
    levelCompleteModal.classList.remove('active');
}

function showPyramidCompleteModal() {
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-time').textContent = timerValue.textContent;
    pyramidCompleteModal.classList.add('active');
}

function hidePyramidCompleteModal() {
    pyramidCompleteModal.classList.remove('active');
}

// ============================================
// Sound Functions (Placeholders)
// ============================================

function toggleSound() {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggleBtn.classList.toggle('muted', !soundEnabled);
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    musicToggleBtn.textContent = musicEnabled ? '🎵' : '🎵';
    musicToggleBtn.classList.toggle('muted', !musicEnabled);
}

function playSound(soundName) {
    if (!soundEnabled) return;
    console.log('Play sound:', soundName);
}

// ============================================
// Event Listeners
// ============================================

newGameBtn.addEventListener('click', () => {
    hideLevelCompleteModal();
    hidePyramidCompleteModal();
    initPyramid();
});

rotateLeftBtn.addEventListener('click', rotateLeft);
rotateRightBtn.addEventListener('click', rotateRight);

soundToggleBtn.addEventListener('click', toggleSound);
musicToggleBtn.addEventListener('click', toggleMusic);

levelContinueBtn.addEventListener('click', () => {
    hideLevelCompleteModal();
    rotateRight();
});

playAgainBtn.addEventListener('click', () => {
    hidePyramidCompleteModal();
    initPyramid();
});

document.addEventListener('keydown', (e) => {
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
            break;
    }
});

// ============================================
// Initialize on Page Load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initPyramid();
});
