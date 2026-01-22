const config = {
    type: Phaser.AUTO,
    width: 300,
    height: 500,
    parent: 'game-container',
    backgroundColor: '#000000',
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24;
const OFFSET_X = 30;
const OFFSET_Y = 10;

let arena = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let player = { pos: { x: 0, y: 0 }, matrix: null };
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let isChiefMode = true; // テスト用に100%
let chiefTriggered = false;
let gameActive = false;
let sceneRef;

const COLORS = [null, 0xff0055, 0x00ffcc, 0xffff00, 0xff8800, 0x0088ff, 0xaa00ff, 0x00ff00];
const SHAPES = 'ILJOTSZ';

function preload() {}

function create() {
    sceneRef = this;
    this.blocksLayer = this.add.container(OFFSET_X, OFFSET_Y);
    
    // UI
    this.scoreText = this.add.text(10, 10, 'SCORE: 0', { fontSize: '18px', fill: '#0ff' });
    this.bestText = this.add.text(190, 10, 'BEST: ' + (localStorage.getItem('tetBest') || 0), { fontSize: '18px', fill: '#555' });

    // 初期化ボタン代わりのテキスト
    let startTxt = this.add.text(150, 250, 'TAP TO START', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5).setInteractive();
    startTxt.on('pointerdown', () => {
        startTxt.destroy();
        gameActive = true;
        this.startTime = this.time.now;
        resetPlayer();
    });

    // 入力イベント紐付け
    setupControls();
}

function update(time, delta) {
    if (!gameActive) return;

    // 速度上昇 (5秒ごと)
    let elapsed = (time - this.startTime) / 1000;
    dropInterval = Math.max(100, 1000 - Math.floor(elapsed / 5) * 150);

    // 部長モード発動チェック (7秒後)
    if (isChiefMode && !chiefTriggered && elapsed > 7) {
        triggerChief();
    }

    dropCounter += delta;
    if (dropCounter > dropInterval) {
        dropPlayer();
        dropCounter = 0;
    }

    draw();
}

function triggerChief() {
    chiefTriggered = true;
    gameActive = false;

    // 1.5秒の明滅グリッチ
    sceneRef.cameras.main.shake(1500, 0.02);
    let flash = sceneRef.time.addEvent({
        delay: 100,
        repeat: 15,
        callback: () => { sceneRef.blocksLayer.visible = !sceneRef.blocksLayer.visible; }
    });

    sceneRef.time.delayedCall(1600, () => {
        arena.forEach(row => row.fill(0)); // 盤面リセット
        sceneRef.blocksLayer.visible = true;
        
        // 1秒待って「腹括れや！！」
        sceneRef.time.delayedCall(1000, () => {
            let txt = sceneRef.add.text(150, 250, '腹括れや！！', {
                fontSize: '60px', fill: '#f00', fontStyle: 'bold', stroke: '#fff', strokeThickness: 5
            }).setOrigin(0.5).setScale(5).setAlpha(0);

            sceneRef.tweens.add({
                targets: txt,
                scale: 1,
                alpha: 1,
                duration: 400,
                ease: 'Expo.easeIn',
                onComplete: () => {
                    sceneRef.cameras.main.shake(500, 0.05);
                    sceneRef.time.delayedCall(1500, () => {
                        txt.destroy();
                        gameActive = true;
                        resetPlayer();
                    });
                }
            });
        });
    });
}

// --- ゲームロジック省略パーツ (要件を満たすよう実装) ---
function createPiece(type) {
    if (type === 'I') return [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]];
    if (type === 'L') return [[0,2,0],[0,2,0],[0,2,2]];
    if (type === 'J') return [[0,3,0],[0,3,0],[3,3,0]];
    if (type === 'O') return [[4,4],[4,4]];
    if (type === 'T') return [[0,5,0],[5,5,5],[0,0,0]];
    if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
    if (type === 'Z') return [[7,7,0],[0,7,7],[0,0,0]];
}

function createChaosPiece() {
    const list = [
        [[1,1,1,1,1,1]], 
        [[1,1,1],[1,1,1],[1,1,1]], 
        [[1,0,1],[1,1,1],[1,0,1]]
    ];
    let p = list[Math.floor(Math.random()*list.length)];
    let c = Math.floor(Math.random()*7)+1;
    return p.map(r => r.map(v => v?c:0));
}

function resetPlayer() {
    player.matrix = chiefTriggered ? createChaosPiece() : createPiece(SHAPES[Math.floor(Math.random()*SHAPES.length)]);
    player.pos.y = 0;
    player.pos.x = Math.floor(COLS/2) - Math.floor(player.matrix[0].length/2);
    if(collide()) {
        gameActive = false;
        alert("GAME OVER");
        location.reload();
    }
}

function dropPlayer() {
    player.pos.y++;
    if(collide()) {
        player.pos.y--;
        merge();
        clearLines();
        resetPlayer();
    }
}

function collide() {
    for (let y = 0; y < player.matrix.length; ++y) {
        for (let x = 0; x < player.matrix[y].length; ++x) {
            if (player.matrix[y][x] !== 0 && (arena[y + player.pos.y] && arena[y + player.pos.y][x + player.pos.x]) !== 0) return true;
        }
    }
    return false;
}

function merge() {
    player.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if(v!==0) arena[y+player.pos.y][x+player.pos.x] = v;
        });
    });
}

function clearLines() {
    outer: for (let y = ROWS - 1; y >= 0; y--) {
        if (!arena[y].includes(0)) {
            arena.splice(y, 1);
            arena.unshift(new Array(COLS).fill(0));
            y++;
            // 消去エフェクト(簡易)
            sceneRef.cameras.main.flash(100, 0, 255, 255);
        }
    }
}

function draw() {
    sceneRef.blocksLayer.removeAll(true);
    // Draw Arena
    arena.forEach((row, y) => {
        row.forEach((v, x) => {
            if(v!==0) drawBlock(x, y, v);
        });
    });
    // Draw Player
    player.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if(v!==0) drawBlock(x + player.pos.x, y + player.pos.y, v);
        });
    });
}

function drawBlock(x, y, v) {
    let b = sceneRef.add.rectangle(x*BLOCK_SIZE, y*BLOCK_SIZE, BLOCK_SIZE-2, BLOCK_SIZE-2, COLORS[v]).setOrigin(0);
    // ネオン風グロー
    b.setStrokeStyle(2, 0xffffff, 0.8);
    sceneRef.blocksLayer.add(b);
}

function setupControls() {
    const bind = (id, fn) => document.getElementById(id).addEventListener('touchstart', (e) => { e.preventDefault(); fn(); });
    bind('btn-left', () => { player.pos.x--; if(collide()) player.pos.x++; });
    bind('btn-right', () => { player.pos.x++; if(collide()) player.pos.x--; });
    bind('btn-down', () => dropPlayer());
    bind('btn-rotate', () => {
        let old = player.matrix;
        player.matrix = player.matrix[0].map((_, i) => player.matrix.map(row => row[i]).reverse());
        if(collide()) player.matrix = old;
    });
}
