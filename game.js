const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    transparent: true,
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

const COLS = 10;
const ROWS = 20;
let BLOCK_SIZE;
let OFFSET_X, OFFSET_Y;

let arena = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let player = { pos: { x: 0, y: 0 }, matrix: null };
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let gameStartTime = 0;
let isGameOver = false;
let isPaused = false;
let isChiefMode = false;
let chiefTriggered = false;
let score = 0;

function preload() {}

function create() {
    // 画面サイズに合わせてブロックサイズを調整
    BLOCK_SIZE = Math.min(window.innerWidth / (COLS + 4), window.innerHeight / (ROWS + 6));
    OFFSET_X = (window.innerWidth - COLS * BLOCK_SIZE) / 2;
    OFFSET_Y = 80;

    const graphics = this.add.graphics();
    
    // 境界線（フレーム）の描画
    graphics.lineStyle(4, 0x00f3ff);
    graphics.strokeRect(OFFSET_X - 2, OFFSET_Y - 2, COLS * BLOCK_SIZE + 4, ROWS * BLOCK_SIZE + 4);
    
    // 背景グリッド
    graphics.lineStyle(1, 0x333333);
    for(let i=0; i<=COLS; i++) graphics.lineBetween(OFFSET_X + i*BLOCK_SIZE, OFFSET_Y, OFFSET_X + i*BLOCK_SIZE, OFFSET_Y + ROWS*BLOCK_SIZE);
    for(let j=0; j<=ROWS; j++) graphics.lineBetween(OFFSET_X, OFFSET_Y + j*BLOCK_SIZE, OFFSET_X + COLS*BLOCK_SIZE, OFFSET_Y + j*BLOCK_SIZE);

    this.blocksLayer = this.add.container(0, 0);
    this.scoreDisplay = document.getElementById('score');
    this.bestDisplay = document.getElementById('best');
    this.bestDisplay.innerText = localStorage.getItem('bestScore') || 0;

    // ゲーム開始
    startNewGame();
    setupInput(this);
}

function startNewGame() {
    score = 0;
    isGameOver = false;
    isChiefMode = Math.random() < 0.05; // 5%の確率
    chiefTriggered = false;
    gameStartTime = Date.now();
    arena.forEach(row => row.fill(0));
    resetPlayer();
}

function resetPlayer() {
    const pieces = 'ILJOTSZ';
    const type = pieces[Math.floor(Math.random() * pieces.length)];
    
    if (isChiefMode && chiefTriggered) {
        player.matrix = createChaosPiece();
    } else {
        player.matrix = createPiece(type);
    }
    
    player.pos.y = 0;
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);

    if (collide()) {
        isGameOver = true;
        const best = localStorage.getItem('bestScore') || 0;
        if (score > best) localStorage.setItem('bestScore', score);
        alert("GAME OVER\nSCORE: " + score);
        location.reload();
    }
}

function createPiece(type) {
    const matrices = {
        'I': [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
        'L': [[0,2,0],[0,2,0],[0,2,2]],
        'J': [[0,3,0],[0,3,0],[3,3,0]],
        'O': [[4,4],[4,4]],
        'T': [[0,5,0],[5,5,5],[0,0,0]],
        'S': [[0,6,6],[6,6,0],[0,0,0]],
        'Z': [[7,7,0],[0,7,7],[0,0,0]]
    };
    return matrices[type];
}

function createChaosPiece() {
    const chaos = [
        [[1,1,1,1,1,1,1]], // 超ロング
        [[2,2,2],[2,2,2],[2,2,2]], // 3x3 巨大
        [[3,0,3],[3,3,3],[3,0,3]], // H型
        [[4,4,4,4],[4,0,0,4],[4,4,4,4]], // 巨大フレーム
        [[5,5],[5,5],[5,5],[5,5],[5,5]] // 超縦長
    ];
    return chaos[Math.floor(Math.random() * chaos.length)];
}

function update(time, delta) {
    if (isGameOver || isPaused) return;

    const elapsed = (Date.now() - gameStartTime) / 1000;
    
    // 5秒ごとに速度アップ
    dropInterval = Math.max(100, 1000 - Math.floor(elapsed / 5) * 100);

    // 部長モード発動
    if (isChiefMode && !chiefTriggered && elapsed > 7) {
        triggerChief(this);
    }

    dropCounter += delta;
    if (dropCounter > dropInterval) {
        dropPlayer();
        dropCounter = 0;
    }
    draw(this);
}

function triggerChief(scene) {
    chiefTriggered = true;
    isPaused = true;
    
    // 明滅演出
    scene.cameras.main.shake(1500, 0.02);
    let blink = scene.time.addEvent({
        delay: 150, repeat: 10,
        callback: () => { scene.blocksLayer.setAlpha(scene.blocksLayer.alpha === 0 ? 1 : 0); }
    });

    scene.time.delayedCall(1600, () => {
        arena.forEach(row => row.fill(0));
        scene.blocksLayer.setAlpha(1);
        
        scene.time.delayedCall(1000, () => {
            const chiefText = scene.add.text(window.innerWidth/2, window.innerHeight/2, '腹括れや！！', {
                fontSize: '64px', color: '#ff0000', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 6
            }).setOrigin(0.5).setScale(0);

            scene.tweens.add({
                targets: chiefText,
                scale: 1.2,
                duration: 400,
                ease: 'Back.easeOut',
                onComplete: () => {
                    scene.cameras.main.shake(500, 0.04);
                    scene.time.delayedCall(2000, () => {
                        chiefText.destroy();
                        isPaused = false;
                        resetPlayer();
                    });
                }
            });
        });
    });
}

function dropPlayer() {
    player.pos.y++;
    if (collide()) {
        player.pos.y--;
        merge();
        arenaSweep();
        resetPlayer();
    }
}

function collide() {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
        }
    }
    return false;
}

function merge() {
    player.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if (v !== 0) arena[y + player.pos.y][x + player.pos.x] = v;
        });
    });
}

function arenaSweep() {
    let lines = 0;
    outer: for (let y = arena.length - 1; y >= 0; y--) {
        for (let x = 0; x < arena[y].length; x++) {
            if (arena[y][x] === 0) continue outer;
        }
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        y++;
        lines++;
    }
    if (lines > 0) {
        score += lines * 100;
        document.getElementById('score').innerText = score;
    }
}

function draw(scene) {
    scene.blocksLayer.removeAll(true);
    const colors = [null, 0xff0055, 0x00ffcc, 0xffff00, 0xff8800, 0x0088ff, 0xaa00ff, 0x00ff00];

    arena.forEach((row, y) => {
        row.forEach((v, x) => {
            if (v !== 0) drawRect(scene, x, y, colors[v]);
        });
    });

    player.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if (v !== 0) drawRect(scene, x + player.pos.x, y + player.pos.y, colors[v]);
        });
    });
}

function drawRect(scene, x, y, color) {
    const rect = scene.add.rectangle(
        OFFSET_X + x * BLOCK_SIZE + 1,
        OFFSET_Y + y * BLOCK_SIZE + 1,
        BLOCK_SIZE - 2,
        BLOCK_SIZE - 2,
        color
    ).setOrigin(0);
    rect.setStrokeStyle(2, 0xffffff, 0.5);
    scene.blocksLayer.add(rect);
}

function setupInput(scene) {
    const bind = (id, fn) => {
        const btn = document.getElementById(id);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); });
    };

    bind('btn-left', () => { player.pos.x--; if(collide()) player.pos.x++; });
    bind('btn-right', () => { player.pos.x++; if(collide()) player.pos.x--; });
    bind('btn-down', () => dropPlayer());
    bind('btn-rotate', () => {
        const oldMatrix = player.matrix;
        player.matrix = player.matrix[0].map((_, i) => player.matrix.map(row => row[i]).reverse());
        if (collide()) player.matrix = oldMatrix;
    });
}
