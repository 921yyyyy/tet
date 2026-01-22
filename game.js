const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
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
let gameStartTime = 0;
let isChiefMode = false;
let chiefTriggered = false;
let isPaused = false;
let score = 0;

function preload() {}

function create() {
    // 画面サイズに基づき動的にレイアウトを計算
    BLOCK_SIZE = Math.min(window.innerWidth / (COLS + 2), (window.innerHeight * 0.6) / ROWS);
    OFFSET_X = (window.innerWidth - COLS * BLOCK_SIZE) / 2;
    OFFSET_Y = 80;

    const g = this.add.graphics();
    // サイバーパンクな枠線
    g.lineStyle(3, 0x00f3ff, 1);
    g.strokeRect(OFFSET_X, OFFSET_Y, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);
    
    // 背景グリッド
    g.lineStyle(1, 0x00f3ff, 0.1);
    for(let i=0; i<=COLS; i++) g.lineBetween(OFFSET_X + i*BLOCK_SIZE, OFFSET_Y, OFFSET_X + i*BLOCK_SIZE, OFFSET_Y + ROWS*BLOCK_SIZE);
    for(let j=0; j<=ROWS; j++) g.lineBetween(OFFSET_X, OFFSET_Y + j*BLOCK_SIZE, OFFSET_X + COLS*BLOCK_SIZE, OFFSET_Y + j*BLOCK_SIZE);

    this.blocksLayer = this.add.container(0, 0);
    document.getElementById('best').innerText = localStorage.getItem('bestScore') || 0;

    initGame();
    setupControls();
}

function initGame() {
    isChiefMode = Math.random() < 0.05; // 5% 抽選
    gameStartTime = Date.now();
    resetPlayer();
}

function createPiece(type) {
    const pieces = {
        'I': [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
        'L': [[0,2,0],[0,2,0],[0,2,2]],
        'J': [[0,3,0],[0,3,0],[3,3,0]],
        'O': [[4,4],[4,4]],
        'T': [[0,5,0],[5,5,5],[0,0,0]],
        'S': [[0,6,6],[6,6,0],[0,0,0]],
        'Z': [[7,7,0],[0,7,7],[0,0,0]]
    };
    return pieces[type];
}

function createChaosPiece() {
    const chaos = [
        [[1,1,1,1,1,1,1,1]], // 超ロング
        [[2,2,2,2],[2,2,2,2],[2,2,2,2],[2,2,2,2]], // 超巨大4x4
        [[3,3,3],[0,3,0],[3,3,3]], // H型
        [[4,0,4],[0,4,0],[4,0,4]], // X型
        [[5,5,5,5,5],[5,0,0,0,5]] // 超重量U字
    ];
    return chaos[Math.floor(Math.random() * chaos.length)];
}

function resetPlayer() {
    const types = 'ILJOTSZ';
    player.matrix = (isChiefMode && chiefTriggered) 
        ? createChaosPiece() 
        : createPiece(types[Math.floor(Math.random() * types.length)]);
    
    player.pos.y = 0;
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);

    if (collide()) {
        alert("GAME OVER! Score: " + score);
        location.reload();
    }
}

function update(time, delta) {
    if (isPaused) return;

    const elapsed = (Date.now() - gameStartTime) / 1000;
    dropInterval = Math.max(100, 1000 - Math.floor(elapsed / 5) * 100);

    // 部長モード発動（7秒後）
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
    scene.cameras.main.shake(1500, 0.03);

    // 明滅
    let flash = scene.time.addEvent({
        delay: 100, repeat: 14,
        callback: () => { scene.blocksLayer.alpha = scene.blocksLayer.alpha === 0 ? 1 : 0; }
    });

    scene.time.delayedCall(1600, () => {
        arena.forEach(row => row.fill(0));
        scene.blocksLayer.alpha = 1;
        
        scene.time.delayedCall(1000, () => {
            let t = scene.add.text(window.innerWidth/2, window.innerHeight/2, '腹括れや！！', {
                fontSize: '60px', color: '#ff0000', fontStyle: 'bold', stroke: '#fff', strokeThickness: 4
            }).setOrigin(0.5).setScale(0);

            scene.tweens.add({
                targets: t, scale: 1.2, duration: 300, ease: 'Back.easeOut',
                onComplete: () => {
                    scene.cameras.main.shake(400, 0.05);
                    scene.time.delayedCall(2000, () => {
                        t.destroy();
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
        sweep();
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

function sweep() {
    let lines = 0;
    outer: for (let y = arena.length - 1; y >= 0; y--) {
        if (!arena[y].includes(0)) {
            arena.splice(y, 1);
            arena.unshift(new Array(COLS).fill(0));
            y++;
            lines++;
        }
    }
    if (lines > 0) {
        score += lines * 100;
        document.getElementById('score').innerText = score;
        const best = localStorage.getItem('bestScore') || 0;
        if (score > best) localStorage.setItem('bestScore', score);
    }
}

function draw(scene) {
    scene.blocksLayer.removeAll(true);
    const colors = [null, 0xff0055, 0x00ffcc, 0xffff00, 0xff8800, 0x0088ff, 0xaa00ff, 0x00ff00];

    const render = (mat, offset) => {
        mat.forEach((row, y) => {
            row.forEach((v, x) => {
                if (v !== 0) {
                    let rect = scene.add.rectangle(
                        OFFSET_X + (x + offset.x) * BLOCK_SIZE + 1,
                        OFFSET_Y + (y + offset.y) * BLOCK_SIZE + 1,
                        BLOCK_SIZE - 2, BLOCK_SIZE - 2, colors[v]
                    ).setOrigin(0);
                    rect.setStrokeStyle(1, 0xffffff, 0.4);
                    scene.blocksLayer.add(rect);
                }
            });
        });
    };
    render(arena, {x:0, y:0});
    render(player.matrix, player.pos);
}

function setupControls() {
    const bind = (id, fn) => {
        const b = document.getElementById(id);
        b.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); });
    };
    bind('btn-left', () => { player.pos.x--; if(collide()) player.pos.x++; });
    bind('btn-right', () => { player.pos.x++; if(collide()) player.pos.x--; });
    bind('btn-down', () => dropPlayer());
    bind('btn-rotate', () => {
        const m = player.matrix;
        player.matrix = player.matrix[0].map((_, i) => player.matrix.map(row => row[i]).reverse());
        if(collide()) player.matrix = m;
    });
}
