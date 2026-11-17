/* Sunniesnow 本地版 —— 曲库外壳 / 导入 / 校准
 * 与游戏同在 game/index.html 内运行（同文档，避免 iOS 子页面音频被拦）
 */
(() => {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ============================ 存储 ============================ */
const LS = {
	offset: 'ssapp.offsetMs',
	jw: 'ssapp.judgementWindows',
	chartOffset: 'ssapp.chartOffsetMs',
	seed: 'ssapp.seeded.v2',
	auto: 'ssapp.auto',
	best: 'ssapp.best',
	profile: 'ssapp.profile',
	speed: 'ssapp.speed',
	tipSpeed: 'ssapp.tipSpeed',
	tipDistance: 'ssapp.tipDistance',
	gameSpeed: 'ssapp.gameSpeed'
};
const lsGet = (k, d) => (localStorage.getItem(k) == null ? d : localStorage.getItem(k));
const lsSet = (k, v) => localStorage.setItem(k, String(v));

/* ============================ 账号层 ============================
   现在纯本地、零网络；但数据结构与调用点都按「以后能接服务器」预留：

   - Profile.get()/patch() 只操作一个版本化对象，字段固定：
     {v, id, name, avatarUrl, provider, updatedAt}
     avatarUrl 现在是 dataURL，将来换成 https 地址也只是换个字符串。
   - Auth 是唯一入口，UI 只认 Auth。当前 provider = 'local'；
     以后加 provider = 'remote' 时，只需实现 signIn/signOut/push/pull 四个方法，
     曲库、成绩、设置都挂在同一套档案里，不需要改界面。
   - id 首次生成后不再变，将来做云同步可作为主键。
   ============================================================== */
const newId = () => 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const Profile = {
	key: LS.profile,
	blank() { return {v: 1, id: newId(), name: '旅人', avatarUrl: '', provider: 'local', updatedAt: Date.now()}; },
	read() {
		let p = null;
		try { p = JSON.parse(lsGet(this.key, 'null')); } catch (e) { p = null; }
		if (!p || typeof p !== 'object') return this.blank();
		const d = this.blank();
		return {
			v: 1,
			id: p.id || d.id,
			name: String(p.name || d.name).slice(0, 12),
			avatarUrl: p.avatarUrl || p.avatar || '',
			provider: p.provider || 'local',
			updatedAt: p.updatedAt || Date.now()
		};
	},
	write(p) { lsSet(this.key, JSON.stringify(p)); return p; },
	patch(fields) {
		const p = Object.assign(this.read(), fields, {v: 1, updatedAt: Date.now()});
		p.name = String(p.name || '旅人').slice(0, 12);
		return this.write(p);
	}
};

/* 账号门面：以后接服务器时，把 mode 切成 'remote' 并实现下面四个方法即可 */
const Auth = {
	mode: 'local',
	isGuest() { return this.mode === 'local'; },
	async signIn() { return Profile.read(); },           // 本地：无登录态，直接返回本机档案
	async signOut() { /* 本地无会话可清 */ },
	async pull() { return {ok: true, source: 'local'}; }, // 拉取远端档案（本地恒成功，无数据）
	async push() { return {ok: true, source: 'local'}; }, // 推送本机档案（本地恒成功，丢弃）
	async sync() { return {ok: true, mode: this.mode}; }
};

let dbPromise = null;
function db() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((res, rej) => {
		const req = indexedDB.open('ssapp', 1);
		req.onupgradeneeded = () => {
			const d = req.result;
			if (!d.objectStoreNames.contains('levels')) {
				d.createObjectStore('levels', {keyPath: 'id', autoIncrement: true});
			}
		};
		req.onsuccess = () => res(req.result);
		req.onerror = () => rej(req.error);
	});
	return dbPromise;
}

async function dbAll() {
	const d = await db();
	return new Promise((res, rej) => {
		const r = d.transaction('levels', 'readonly').objectStore('levels').getAll();
		r.onsuccess = () => res(r.result || []);
		r.onerror = () => rej(r.error);
	});
}
async function dbPut(rec) {
	const d = await db();
	return new Promise((res, rej) => {
		const r = d.transaction('levels', 'readwrite').objectStore('levels').put(rec);
		r.onsuccess = () => res(r.result);
		r.onerror = () => rej(r.error);
	});
}
async function dbDel(id) {
	const d = await db();
	return new Promise((res, rej) => {
		const r = d.transaction('levels', 'readwrite').objectStore('levels').delete(id);
		r.onsuccess = () => res();
		r.onerror = () => rej(r.error);
	});
}

/* ============================ 解析 .ssc ============================ */
const AUDIO_RE = /\.(ogg|mp3|wav|m4a|aac|flac|opus)$/i;
const IMAGE_RE = /\.(png|jpg|jpeg|webp|gif|bmp)$/i;

async function parseSsc(blob) {
	const zip = await JSZip.loadAsync(blob);
	const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
	const charts = [];
	let music = '', cover = null;
	for (const n of names) {
		if (/\.json$/i.test(n)) {
			try {
				const txt = await zip.files[n].async('string');
				const j = JSON.parse(txt);
				if (j && Array.isArray(j.events)) {
					charts.push({
						file: n,
						title: j.title || '',
						artist: j.artist || '',
						difficultyName: j.difficultyName || '',
						difficulty: typeof j.difficulty === 'number' ? j.difficulty : null,
						charter: j.charter || ''
					});
				}
			} catch (e) { /* 非谱面 json，忽略 */ }
		} else if (!music && AUDIO_RE.test(n)) {
			music = n;
		} else if (!cover && IMAGE_RE.test(n)) {
			cover = n;
		}
	}
	charts.sort((a, b) => (a.difficulty ?? 99) - (b.difficulty ?? 99));
	const first = charts[0] || {};
	let coverBlob = null;
	if (cover) {
		try { coverBlob = await zip.files[cover].async('blob'); } catch (e) {}
	}
	return {
		title: first.title || '',
		artist: first.artist || '',
		charter: first.charter || '',
		music,
		charts,
		cover,
		coverBlob
	};
}

/* ============================ 导入 ============================ */
const coverUrls = new Map();

async function importOne(file, preset) {
	if (file.size === 0) throw new Error('空文件');
	const meta = await parseSsc(file);
	if (!meta.charts.length) throw new Error('压缩包里没有找到谱面 json');
	const rec = {
		name: file.name || 'level.ssc',
		size: file.size,
		addedAt: Date.now(),
		preset: !!preset,
		blob: file,
		coverBlob: meta.coverBlob,
		meta: {
			title: meta.title || (file.name || '').replace(/\.ssc$/i, ''),
			artist: meta.artist,
			charter: meta.charter,
			music: meta.music,
			cover: meta.cover || null,
			charts: meta.charts
		}
	};
	await dbPut(rec);
	return rec;
}

async function handleFiles(files) {
	const list = Array.from(files || []);
	if (!list.length) return;
	let ok = 0, fail = [];
	for (const f of list) {
		try { await importOne(f, false); ok++; }
		catch (e) { fail.push(`${f.name}：${e.message || e}`); }
	}
	await refresh();
	if (fail.length) {
		toast(`导入 ${ok} 个成功，${fail.length} 个失败\n${fail.join('\n')}`);
	} else {
		toast(`已导入 ${ok} 个关卡`);
	}
}

/* ============================ 提示 ============================ */
let toastTimer = null;
function toast(text) {
	let el = $('#toast');
	if (!el) {
		el = document.createElement('div');
		el.id = 'toast';
		document.body.appendChild(el);
	}
	el.textContent = text;
	el.classList.toggle('top', $('#app').classList.contains('hidden'));
	el.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ============================ 列表 ============================ */
let levels = [];

function fmtSize(bytes) {
	if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
	if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
	return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function coverUrlFor(rec) {
	if (!rec.coverBlob) return null;
	if (coverUrls.has(rec.id)) return coverUrls.get(rec.id);
	const url = URL.createObjectURL(rec.coverBlob);
	coverUrls.set(rec.id, url);
	return url;
}

/* ============================ 最佳成绩 ============================ */
const RANK_ORDER = 'SABCDE';
function bestAll() {
	try { return JSON.parse(lsGet(LS.best, '{}')) || {}; } catch (e) { return {}; }
}
function bestKey(rec, chartFile) {
	return `${rec.meta.title || rec.name}|${chartFile}`;
}
function bestGet(rec, chartFile) {
	return bestAll()[bestKey(rec, chartFile)] || null;
}
function bestPut(key, data) {
	const all = bestAll();
	all[key] = data;
	lsSet(LS.best, JSON.stringify(all));
}
function betterRank(a, b) {
	const i = RANK_ORDER.indexOf(a), j = RANK_ORDER.indexOf(b);
	if (i < 0) return b || a || '';
	if (j < 0) return a;
	return i <= j ? a : b;
}
function fmtScore(n) {
	return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

let playWatch = null;
let playWatchTimeout = null;
function stopPlayWatch() {
	if (playWatch) { clearInterval(playWatch); playWatch = null; }
	if (playWatchTimeout) { clearTimeout(playWatchTimeout); playWatchTimeout = null; }
}

/* 结算时把成绩记下来：分数取最高，combo 与准确率各取历史最好 */
function watchResult(ctx) {
	stopPlayWatch();
	playWatch = setInterval(() => {
		const g = window.Sunniesnow && window.Sunniesnow.game;
		const lv = g && g.level;
		if (!g || !g.scene || !lv || !lv.notesCount) return;
		if (g.scene.constructor.name !== 'SceneResult') return;
		stopPlayWatch();
		const score = lv.score();
		const combo = lv.maxCombo;
		const acc = lv.accuracy();
		/* AUTO 自动演奏不算真实成绩，只提示不写库 */
		if (ctx.auto) {
			toast('AUTO 模式成绩不计入最佳记录');
			refresh();
			return;
		}
		const old = bestAll()[ctx.key];
		const isBest = !old || score > old.score;
		bestPut(ctx.key, {
			score: Math.max(score, old ? old.score : 0),
			combo: Math.max(combo, old ? old.combo : 0),
			acc: Math.max(acc, old ? old.acc : 0),
			rank: betterRank(lv.rank(), old && old.rank),
			plays: (old ? old.plays : 0) + 1,
			at: Date.now()
		});
		if (old && isBest) toast(`新纪录 ${fmtScore(score)}（原 ${fmtScore(old.score)}）`);
		else if (!old) toast(`首次记录：${fmtScore(score)} · ${lv.rank()}`);
		refresh();
	}, 400);
	playWatchTimeout = setTimeout(stopPlayWatch, 6 * 60 * 1000);
}

const PAGE_SIZE = 16; /* 4 × 4 曲绘宫格 */
let page = 0;
let selectedId = null;

function filteredLevels() {
	const q = $('#search').value.trim().toLowerCase();
	if (!q) return levels.slice();
	return levels.filter(v => `${v.meta.title} ${v.meta.artist} ${v.name}`.toLowerCase().includes(q));
}

function render() {
	const items = filteredLevels();
	const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
	page = Math.max(0, Math.min(page, pages - 1));
	const slice = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	const grid = $('#grid');
	grid.innerHTML = '';
	for (const rec of slice) {
		const cell = document.createElement('div');
		cell.className = 'cover-cell';
		cell.dataset.id = String(rec.id);
		const cu = coverUrlFor(rec);
		const initial = (rec.meta.title || '?').trim().charAt(0) || '?';
		const ranks = (rec.meta.charts || [])
			.map(c => bestGet(rec, c.file))
			.filter(Boolean)
			.map(b => b.rank)
			.sort((x, y) => RANK_ORDER.indexOf(x) - RANK_ORDER.indexOf(y));
		cell.innerHTML = (cu
			? `<img src="${cu}" alt="">`
			: `<span class="ph">${escapeHtml(initial)}</span>`)
			+ (ranks.length ? `<span class="cell-rank">${escapeHtml(ranks[0])}</span>` : '')
			+ `<span class="cell-title">${escapeHtml(rec.meta.title || rec.name)}</span>`;
		cell.addEventListener('click', () => selectRec(rec));
		grid.appendChild(cell);
	}

	$('#empty').classList.toggle('hidden', items.length !== 0);
	$('#page-info').textContent = `${page + 1} / ${pages}`;
	$('#page-prev').disabled = page <= 0;
	$('#page-next').disabled = page >= pages - 1;
	$('#summary').textContent = levels.length
		? `${levels.length} 首 · 共 ${fmtSize(levels.reduce((a, b) => a + b.size, 0))}${items.length !== levels.length ? ` · 命中 ${items.length}` : ''}`
		: '';

	const stillVisible = slice.find(r => String(r.id) === String(selectedId));
	if (stillVisible) selectRec(stillVisible, true);
	else if (slice.length && selectedId == null) selectRec(slice[0], true);
	else {
		$$('.cover-cell').forEach(c => c.classList.toggle('sel', false));
		if (!slice.length) clearDetail();
	}
}

function clearDetail() {
	selectedId = null;
	$('#detail').classList.add('empty');
	$('#detail-cover').style.backgroundImage = '';
	$('#detail-initial').textContent = '♪';
	$('#detail-title').textContent = '没有可显示的曲子';
	$('#detail-sub').textContent = '换个关键词，或点右上角「＋ 导入」添加关卡包';
	$('#detail-chips').innerHTML = '';
	$('#detail-diffs').innerHTML = '';
	$('#detail-delete').classList.add('hidden');
}

function selectRec(rec, keepScroll) {
	selectedId = rec.id;
	$$('.cover-cell').forEach(c => c.classList.toggle('sel', c.dataset.id === String(rec.id)));

	const cu = coverUrlFor(rec);
	const initial = (rec.meta.title || '?').trim().charAt(0) || '?';
	const cover = $('#detail-cover');
	cover.style.backgroundImage = cu ? `url('${cu}')` : '';
	$('#detail-initial').textContent = cu ? '' : initial;

	$('#detail').classList.remove('empty');
	$('#detail-title').textContent = rec.meta.title || rec.name;
	const charter = rec.meta.charter ? ` · 谱面 ${rec.meta.charter}` : '';
	$('#detail-sub').textContent = (rec.meta.artist || '未知曲师') + charter;

	$('#detail-chips').innerHTML = `<span class="badge">${fmtSize(rec.size)}</span>`
		+ (rec.preset ? '<span class="badge">内置</span>' : '')
		+ `<span class="badge">${rec.meta.charts.length} 个难度</span>`;

	const diffs = $('#detail-diffs');
	diffs.innerHTML = '';
	for (const c of rec.meta.charts) {
		const best = bestGet(rec, c.file);
		const btn = document.createElement('button');
		btn.className = 'diff-btn';
		const name = escapeHtml(c.difficultyName || '谱面');
		const num = c.difficulty != null ? `<b>${escapeHtml(c.difficulty)}</b>` : '';
		const score = best ? fmtScore(best.score) : '未游玩';
		const meta = best
			? `<span class="meta">${escapeHtml(best.rank || '-')} · ${(best.acc * 100).toFixed(2)}% · Combo ${best.combo}</span>`
			: '';
		btn.className = 'diff-btn' + (best ? '' : ' none');
		btn.innerHTML = `<span class="dl"><span class="dn">${name}${num}</span><span class="score">${score}</span></span>${meta}`;
		btn.addEventListener('click', () => launch(rec, c));
		diffs.appendChild(btn);
	}
	$('#detail-delete').classList.toggle('hidden', !!rec.preset);

	if (!keepScroll) $('#detail').scrollTop = 0;
}

function escapeHtml(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

async function refresh() {
	levels = (await dbAll()).sort((a, b) => b.addedAt - a.addedAt);
	render();
}

/* ============================ 详情面板 ============================ */
async function deleteSelected() {
	const rec = levels.find(r => String(r.id) === String(selectedId));
	if (!rec || rec.preset) return;
	if (!confirm(`删除「${rec.meta.title || rec.name}」？\n这会从本机移除该关卡包。`)) return;
	await dbDel(rec.id);
	const u = coverUrls.get(rec.id);
	if (u) { URL.revokeObjectURL(u); coverUrls.delete(rec.id); }
	selectedId = null;
	await refresh();
}

/* ============================ 启动游戏 ============================ */
let currentUrl = null;
let readyPromise = null;

function waitGameReady() {
	if (readyPromise) return readyPromise;
	readyPromise = new Promise((res, rej) => {
		let n = 0;
		const timer = setInterval(() => {
			const ok = window.Sunniesnow
				&& window.Sunniesnow.Game
				&& window.Sunniesnow.Settings
				&& window.Sunniesnow.Settings.mainSettings
				&& !document.getElementById('loading');
			if (ok) { clearInterval(timer); res(); return; }
			if (++n > 1500) { clearInterval(timer); rej(new Error('游戏加载超时（已等待 90 秒）')); }
		}, 60);
	});
	return readyPromise;
}

/* 把曲库里的 .ssc 灌进内核自己的「上传」通道，让它按原逻辑解析 zip / 音频 / 谱面 */
async function primeLevel(rec, chart) {
	const input = document.getElementById('level-file-upload');
	const radio = document.getElementById('level-file-upload-radio');
	const musicSel = document.getElementById('music-select');
	const chartSel = document.getElementById('chart-select');
	if (!input || !radio || !musicSel || !chartSel) throw new Error('内核设置页未就绪');

	const dt = new DataTransfer();
	dt.items.add(new File([rec.blob], rec.name || 'level.ssc', { type: 'application/zip' }));
	input.files = dt.files;
	radio.checked = true;
	radio.dispatchEvent(new Event('change', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));

	const deadline = Date.now() + 60000;
	while (Date.now() < deadline) {
		if (musicSel.options.length && chartSel.options.length) break;
		await new Promise(r => setTimeout(r, 100));
	}
	if (!musicSel.options.length || !chartSel.options.length) throw new Error('关卡包解析超时');

	if (rec.meta.music && Array.from(musicSel.options).some(o => o.value === rec.meta.music)) {
		musicSel.value = rec.meta.music;
	}
	if (Array.from(chartSel.options).some(o => o.value === chart.file)) {
		chartSel.value = chart.file;
	}
	musicSel.dispatchEvent(new Event('change', { bubbles: true }));
	chartSel.dispatchEvent(new Event('change', { bubbles: true }));
}

async function resolveBackgroundName(rec) {
	if (rec.meta && rec.meta.cover) return rec.meta.cover;
	try {
		const zip = await JSZip.loadAsync(rec.blob);
		for (const n of Object.keys(zip.files)) {
			if (zip.files[n].dir) continue;
			if (IMAGE_RE.test(n) && !n.includes('/')) return n;
		}
	} catch (e) {}
	return null;
}

async function launch(rec, chart) {
	/* 竖屏不给玩：先提示，横过来再自动开局 */
	if (isPortrait()) {
		pendingLaunch = {rec, chart};
		showRotate(true);
		toast('请先把手机横过来');
		return;
	}
	pendingLaunch = null;
	showRotate(false);
	try {
		if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
	} catch (e) {}

	try {
		if (!(window.Sunniesnow && window.Sunniesnow.Game)) toast('正在加载内核，第一次会慢一点…');
		await waitGameReady();
		await primeLevel(rec, chart);
	} catch (e) {
		toast('启动失败：' + (e.message || e));
		return;
	}
	if (currentUrl) URL.revokeObjectURL(currentUrl);
	currentUrl = URL.createObjectURL(rec.blob);

	/* 暂停交给外壳接管：隐藏内核暂停面板、二次暂停不直接恢复、恢复不倒退 */
	const hp = document.getElementById('hide-pause-ui');
	if (hp) hp.checked = true;
	const rp = document.getElementById('resume-preparation-time');
	if (rp) rp.value = 0;
	const sp = document.getElementById('second-pause-disabled-radio');
	if (sp) sp.checked = true;

	/* 游戏内核的 musicSelect / chartSelect 要的是文件实体（Blob），不是文件名 */
	const offsetMs = Number(lsGet(LS.offset, '0'));
	const chartOffsetMs = Number(lsGet(LS.chartOffset, '0'));
	const jw = lsGet(LS.jw, 'loose');

	const autoOn = lsGet(LS.auto, '0') === '1';
	const bgName = await resolveBackgroundName(rec);
	$('#app').classList.add('hidden');
	$('#auto-badge').classList.toggle('hidden', !autoOn);

	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const cw = Math.max(640, Math.min(2560, Math.round(window.innerWidth * dpr)));
	const ch = Math.max(360, Math.min(1600, Math.round(window.innerHeight * dpr)));

	try {
		window.Sunniesnow.Game.run({
			levelFile: 'upload',
			musicSelect: rec.meta.music,
			chartSelect: chart.file,
			judgementWindows: jw,
			offset: offsetMs / 1000,
			chartOffset: chartOffsetMs / 1000,
			width: cw,
			height: ch,
			background: bgName ? 'from-level' : 'none',
			backgroundFromLevel: bgName || undefined,
			avatar: 'none',
			skin: 'default',
			fx: 'default',
			se: 'default',
			discordPresence: false,
			sscharter: false,
			avoidDownloadingFonts: true,
			fullscreenOnStart: false,
			autoplay: autoOn,
			volumeSe: 1,
			speed: Number(lsGet(LS.speed, '2')),
			tipPointSpeed: Number(lsGet(LS.tipSpeed, '1')),
			tipPointDistance: Number(lsGet(LS.tipDistance, '1')),
			gameSpeed: Number(lsGet(LS.gameSpeed, '1')) || 1,
			hidePauseUi: true,
			secondPause: 'disabled',
			resumePreparationTime: 0,
			debug: false
		});
		watchResult({key: bestKey(rec, chart.file), auto: autoOn});
		startGameWatcher();
	} catch (e) {
		console.error(e);
		toast('启动失败：' + (e.message || e));
		exitGame();
	}
}

function exitGame() {
	stopPlayWatch();
	stopGameWatcher();
	try { window.Sunniesnow.game && window.Sunniesnow.game.terminate(); } catch (e) {}
	setTimeout(() => {
		if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
	}, 400);
	$('#app').classList.remove('hidden');
	$('#auto-badge').classList.add('hidden');
	refresh();
}

/* ============================ 设置 ============================ */
/* 与原版 Sunniesnow 一一对应的数值项（默认值 / 步长 / 下限都照原版来） */
const NUM_SETTINGS = [
	{key: 'speed', ls: LS.speed, def: 2, min: 0, step: 0.1, id: 'speed-input'},
	{key: 'tipSpeed', ls: LS.tipSpeed, def: 1, min: 0, step: 0.1, id: 'tip-speed-input'},
	{key: 'tipDistance', ls: LS.tipDistance, def: 1, step: 0.1, id: 'tip-distance-input'},
	{key: 'gameSpeed', ls: LS.gameSpeed, def: 1, min: 0.1, step: 0.1, id: 'gamespeed-input'}
];

function syncAutoBtn() {
	const on = lsGet(LS.auto, '0') === '1';
	const b = $('#btn-auto');
	if (!b) return;
	b.classList.toggle('on', on);
	b.setAttribute('aria-pressed', on ? 'true' : 'false');
	b.textContent = on ? 'AUTO ON' : 'AUTO';
}

function syncSettingsUI() {
	$('#offset-input').value = lsGet(LS.offset, '0');
	$('#jw-select').value = lsGet(LS.jw, 'loose');
	$('#chartoffset-input').value = lsGet(LS.chartOffset, '0');
	$('#calib-applied').textContent = lsGet(LS.offset, '0');
	NUM_SETTINGS.forEach(def => { $('#' + def.id).value = Number(lsGet(def.ls, def.def)); });
	syncAutoBtn();
}

function bindSettings() {
	$('#btn-settings').addEventListener('click', () => $('#settings-modal').classList.remove('hidden'));
	$('#settings-close').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));

	$('#offset-input').addEventListener('change', e => {
		let v = Math.round(Number(e.target.value) || 0);
		v = Math.max(-300, Math.min(300, v));
		lsSet(LS.offset, v);
		syncSettingsUI();
	});
	$('#chartoffset-input').addEventListener('change', e => {
		let v = Math.round(Number(e.target.value) || 0);
		lsSet(LS.chartOffset, v);
		syncSettingsUI();
	});
	$('#jw-select').addEventListener('change', e => lsSet(LS.jw, e.target.value));

	/* 原版数值项：缩圈速度 / 游标速度 / 游标距离 / 曲速 */
	NUM_SETTINGS.forEach(def => {
		$('#' + def.id).addEventListener('change', e => {
			let v = Number(e.target.value);
			if (!Number.isFinite(v)) v = def.def;
			if (def.min != null) v = Math.max(def.min, v);
			if (def.max != null) v = Math.min(def.max, v);
			v = Math.round(v * 10) / 10;
			lsSet(def.ls, v);
			syncSettingsUI();
		});
	});
	$$('.num-step').forEach(btn => btn.addEventListener('click', () => {
		const def = NUM_SETTINGS.find(d => d.key === btn.dataset.key);
		const input = $('#' + def.id);
		let v = Number(input.value);
		if (!Number.isFinite(v)) v = def.def;
		v += Number(btn.dataset.step);
		if (def.min != null) v = Math.max(def.min, v);
		if (def.max != null) v = Math.min(def.max, v);
		v = Math.round(v * 100) / 100;
		input.value = v;
		lsSet(def.ls, v);
		syncSettingsUI();
	}));

	$$('.stepper .step').forEach(btn => btn.addEventListener('click', () => {
		const cur = Math.round(Number($('#offset-input').value) || 0);
		const next = Math.max(-300, Math.min(300, cur + Number(btn.dataset.step)));
		$('#offset-input').value = next;
		lsSet(LS.offset, next);
		syncSettingsUI();
	}));
}

/* ============================ 手感校准 ============================ */
const calib = {
	actx: null, beats: [], taps: [], running: false,
	period: 0.5,          // 120 BPM
	startAt: 0,
	raf: 0,
	nodes: [],
	flashed: new Set()
};

function calibAudio() {
	if (!calib.actx) {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		calib.actx = new Ctx();
	}
	return calib.actx;
}

function blip(at) {
	const ctx = calib.actx;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.value = 1046.5;
	gain.gain.setValueAtTime(0.0001, at);
	gain.gain.exponentialRampToValueAtTime(0.28, at + 0.004);
	gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
	osc.connect(gain).connect(ctx.destination);
	osc.start(at);
	osc.stop(at + 0.09);
	/* 记下来：停止时要能立刻掐掉已经排进时间轴的节拍 */
	calib.nodes.push({ osc, gain });
	osc.onended = () => {
		try { gain.disconnect(); } catch (e) {}
		const i = calib.nodes.findIndex(n => n.osc === osc);
		if (i >= 0) calib.nodes.splice(i, 1);
	};
}

function calibStart() {
	const ctx = calibAudio();
	if (ctx.state === 'suspended') ctx.resume();
	calib.beats = [];
	calib.taps = [];
	calib.flashed.clear();
	calib.running = true;
	const t0 = ctx.currentTime + 0.35;
	calib.startAt = t0;
	for (let i = 0; i < 60; i++) {
		const at = t0 + i * calib.period;
		calib.beats.push(at);
		blip(at);
	}
	$('#calib-hint').textContent = '跟着节拍点';
	$('#calib-count').textContent = '0 / 10';
	$('#calib-result').textContent = '—';
	calibLoop();
}

function calibLoop() {
	const ctx = calib.actx;
	const pad = $('#calib-pad');
	const now = ctx.currentTime;
	let nextIdx = -1;
	for (let i = 0; i < calib.beats.length; i++) {
		if (calib.beats[i] > now) { nextIdx = i; break; }
	}
	if (nextIdx < 0) return;
	const next = calib.beats[nextIdx];
	if (next - now < 0.06 && !calib.flashed.has(nextIdx)) {
		calib.flashed.add(nextIdx);
		pad.classList.add('beat');
		setTimeout(() => pad.classList.remove('beat'), 120);
	}
	if (calib.running) calib.raf = requestAnimationFrame(calibLoop);
}

function calibStop() {
	calib.running = false;
	cancelAnimationFrame(calib.raf);
	$('#calib-pad').classList.remove('beat');
	/* 把还没响完的节拍全部停掉并断开，否则点“重来/关闭”后音乐还在继续 */
	for (const n of calib.nodes) {
		try { n.osc.stop(0); } catch (e) {}
		try { n.osc.disconnect(); } catch (e) {}
		try { n.gain.disconnect(); } catch (e) {}
	}
	calib.nodes = [];
}

function median(arr) {
	const s = arr.slice().sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function onPadTap(ev) {
	ev.preventDefault();
	if (!calib.running) { calibStart(); return; }
	const ctx = calib.actx;
	const t = ctx.currentTime;
	const pad = $('#calib-pad');
	pad.classList.add('hit');
	setTimeout(() => pad.classList.remove('hit'), 90);

	let best = null;
	for (const b of calib.beats) {
		const d = (t - b) * 1000;
		if (best == null || Math.abs(d) < Math.abs(best)) best = d;
	}
	if (best == null || Math.abs(best) > 300) return;
	calib.taps.push(best);
	const el = $('#calib-result');
	el.textContent = Math.round(median(calib.taps));
	$('#calib-count').textContent = `${calib.taps.length} / 10`;
	if (calib.taps.length >= 10) {
		calibStop();
		const v = Math.round(median(calib.taps));
		$('#calib-hint').textContent = '完成，可点「应用并关闭」';
		el.textContent = v;
		calib.pending = Math.max(-300, Math.min(300, v));
		$('#calib-applied').textContent = calib.pending;
	}
}

function bindCalib() {
	$('#settings-calib').addEventListener('click', () => {
		calibStop();
		calib.taps = [];
		$('#settings-modal').classList.add('hidden');
		$('#calib-modal').classList.remove('hidden');
		$('#calib-hint').textContent = '点一下圆盘开始';
		$('#calib-count').textContent = '';
		$('#calib-result').textContent = '—';
		$('#calib-applied').textContent = lsGet(LS.offset, '0');
		calib.pending = null;
	});
	$('#calib-pad').addEventListener('pointerdown', onPadTap);
	/* 点遮罩或按 Esc 关闭校准窗时也要立刻停声 */
	document.getElementById('calib-modal').addEventListener('click', ev => {
		if (ev.target === ev.currentTarget) { calibStop(); ev.currentTarget.classList.add('hidden'); }
	});
	document.addEventListener('keydown', ev => {
		if (ev.key !== 'Escape') return;
		const m = document.getElementById('calib-modal');
		if (m && !m.classList.contains('hidden')) { calibStop(); m.classList.add('hidden'); }
	});
	document.addEventListener('visibilitychange', () => {
		if (document.hidden && calib.running) calibStop();
	});

	$('#calib-retry').addEventListener('click', () => {
		calibStop();
		calib.taps = [];
		calib.pending = null;
		$('#calib-hint').textContent = '点一下圆盘开始';
		$('#calib-count').textContent = '';
		$('#calib-result').textContent = '—';
	});

	$('#calib-apply').addEventListener('click', () => {
		const v = calib.pending != null ? calib.pending : Number(lsGet(LS.offset, '0'));
		lsSet(LS.offset, Math.round(v));
		syncSettingsUI();
		calibStop();
		$('#calib-modal').classList.add('hidden');
		toast(`已应用偏移 ${Math.round(v)} ms`);
	});
}

/* ============================ 初始化 ============================ */
const UI_HTML = `
<div id="splash">
	<div class="splash-account">
		<div class="splash-account-text">
			<div class="splash-name" id="splash-name">旅人</div>
			<div class="splash-meta" id="splash-meta">本地账号 · 游客</div>
		</div>
		<div class="splash-avatar" id="splash-avatar"></div>
	</div>
	<div class="splash-inner">
		<div class="splash-brand"><span class="splash-mark"></span>Sunniesnow</div>
		<div class="splash-tip">点触屏幕开始</div>
		<button id="splash-edit" class="splash-edit">编辑昵称与头像</button>
		<div class="splash-ver">v3</div>
		<div class="splash-credit">内核 Sunniesnow © UlyssesZhan · AGPL-3.0 · 本 App 仅做本地封装</div>
	</div>
</div>

<div id="profile-modal" class="overlay hidden">
	<div class="panel">
		<h2>个人资料</h2>
		<div class="avatar-row">
			<div class="avatar-preview" id="avatar-preview"></div>
			<div class="avatar-actions">
				<button id="avatar-pick" class="ghost-btn">选择图片</button>
				<button id="avatar-clear" class="ghost-btn">用首字</button>
			</div>
		</div>
		<div class="row">
			<label>昵称</label>
			<input id="profile-name" type="text" maxlength="12" placeholder="最多 12 个字" autocomplete="off">
		</div>
		<div class="panel-actions">
			<button id="profile-cancel" class="ghost-btn">取消</button>
			<button id="profile-save" class="primary-btn">保存</button>
		</div>
	</div>
</div>
<input id="avatar-input" type="file" accept="image/*" class="hidden">

<div id="app">
	<header id="topbar">
		<div id="brand">Sunniesnow</div>
		<div id="searchbar"><input id="search" type="search" placeholder="搜索曲名 / 曲师" autocomplete="off"></div>
		<div id="actions">
			<button id="btn-auto" class="pill-btn" title="自动演奏模式">AUTO</button>
			<button id="btn-import" class="primary-btn">＋ 导入</button>
			<button id="btn-settings" class="icon-btn" title="设置">⚙</button>
			<button id="btn-profile" class="avatar-btn" title="个人资料"><span id="topbar-avatar"></span></button>
		</div>
	</header>
	<main id="library">
		<section id="grid-pane">
			<div id="grid"></div>
			<div id="empty" class="hidden">
				<p>曲库是空的。</p>
				<p class="hint">点右上角「＋ 导入」，从「文件」里选 <code>.ssc</code> 关卡包（可多选）。</p>
			</div>
			<footer id="pager">
				<button id="page-prev" class="icon-btn small" title="上一页">‹</button>
				<span id="page-info">1 / 1</span>
				<button id="page-next" class="icon-btn small" title="下一页">›</button>
				<span id="summary"></span>
			</footer>
		</section>
		<aside id="detail" class="empty">
			<div id="detail-cover"><span id="detail-initial">♪</span></div>
			<div id="detail-body">
				<div id="detail-title">选一首曲子</div>
				<div id="detail-sub">左边曲绘 4×4 宫格，点一首看详情</div>
				<div id="detail-chips"></div>
				<div id="detail-diffs"></div>
				<div id="detail-actions">
					<button id="detail-delete" class="ghost-btn hidden">删除这首</button>
				</div>
			</div>
			<button id="detail-close" class="icon-btn hidden">✕</button>
		</aside>
	</main>
	<input id="file-input" type="file" multiple hidden>
</div>

<div id="auto-badge" class="hidden">AUTO</div>

<div id="rotate-layer" class="hidden">
	<div class="rotate-box">
		<svg viewBox="0 0 48 48" fill="none" stroke="#ebfbff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
			<rect x="14" y="3" width="20" height="42" rx="4"/>
			<path d="M20 39h8"/>
			<path d="M9 24a17 17 0 0 1 3.6-10"/>
			<path d="M6.5 9.5v5.5h5.5"/>
		</svg>
		<p>请横屏游玩</p>
		<span>横过来才会开始，竖屏不做任何操作</span>
	</div>
</div>

<div id="result-hotspot" class="hidden" aria-label="暂停"></div>

<div id="pause-layer" class="hidden">
	<div class="pl-main">
		<div id="pl-count-wrap" class="hidden">
			<span id="pl-count">3</span>
			<span id="pl-count-hint">准备</span>
			<button id="pl-esc" class="pl-ghost">曲库</button>
		</div>
		<div id="pl-btns" class="hidden">
			<button id="pl-resume" class="ss-btn"><span class="ss-diamond"></span><span class="ss-label">继续</span></button>
			<button id="pl-retry" class="ss-btn hidden"><span class="ss-diamond"></span><span class="ss-label">重试</span></button>
			<button id="pl-back" class="ss-btn"><span class="ss-diamond"></span><span class="ss-label">曲库</span></button>
		</div>
	</div>
</div>

<div id="settings-modal" class="overlay hidden">
	<div class="panel settings-panel">
		<h2>设置</h2>
		<div class="settings-grid">
			<div class="set-col">
				<div class="row stack">
					<label>输入偏移 <span class="unit">ms</span></label>
					<div class="stepper">
						<button class="step" data-step="-10">−10</button>
						<button class="step" data-step="-5">−5</button>
						<input id="offset-input" type="number" step="1" min="-300" max="300" value="0">
						<button class="step" data-step="5">+5</button>
						<button class="step" data-step="10">+10</button>
					</div>
				</div>
				<p class="hint">正值＝判定整体后移。拿不准就点「手感校准」测一次。</p>
				<div class="row"><label>手感校准</label><button id="settings-calib" class="ghost-btn">开始向导</button></div>
				<div class="row">
					<label>判定窗口</label>
					<select id="jw-select">
						<option value="loose">loose（宽松）</option>
						<option value="medium">medium（中等）</option>
						<option value="strict">strict（严格）</option>
						<option value="rigorous">rigorous（极严）</option>
					</select>
				</div>
				<div class="row">
					<label>谱面偏移 <span class="unit">ms</span></label>
					<input id="chartoffset-input" type="number" step="10" value="0">
				</div>
				<p class="hint">只有谱面本身做早/做晚才调，一般保持 0。</p>
				<div class="row"><label>个人资料</label><button id="settings-profile" class="ghost-btn">编辑昵称与头像</button></div>
				<div class="row"><label>最佳成绩</label><button id="settings-clear-best" class="ghost-btn danger">清除全部成绩</button></div>
			</div>
			<div class="set-col">
				<div class="row">
					<label>缩圈速度 <span class="unit">×</span></label>
					<div class="stepper">
						<button class="num-step" data-key="speed" data-step="-0.1">−</button>
						<input id="speed-input" type="number" min="0" step="0.1" value="2">
						<button class="num-step" data-key="speed" data-step="0.1">＋</button>
					</div>
				</div>
				<p class="hint">原版「流速 / Speed」，默认 2：调大更紧张，调小更好读谱。</p>
				<div class="row">
					<label>游标飞入速度 <span class="unit">×</span></label>
					<div class="stepper">
						<button class="num-step" data-key="tipSpeed" data-step="-0.1">−</button>
						<input id="tip-speed-input" type="number" min="0" step="0.1" value="1">
						<button class="num-step" data-key="tipSpeed" data-step="0.1">＋</button>
					</div>
				</div>
				<div class="row">
					<label>游标飞入距离 <span class="unit">×</span></label>
					<div class="stepper">
						<button class="num-step" data-key="tipDistance" data-step="-0.1">−</button>
						<input id="tip-distance-input" type="number" step="0.1" value="1">
						<button class="num-step" data-key="tipDistance" data-step="0.1">＋</button>
					</div>
				</div>
				<div class="row">
					<label>曲速 <span class="unit">（音乐）</span></label>
					<div class="stepper">
						<button class="num-step" data-key="gameSpeed" data-step="-0.1">−</button>
						<input id="gamespeed-input" type="number" min="0.1" step="0.1" value="1">
						<button class="num-step" data-key="gameSpeed" data-step="0.1">＋</button>
					</div>
				</div>
				<p class="hint">1.0＝原速，连音乐一起变速（原版 Speed of music）。</p>
			</div>
		</div>
		<div class="panel-actions"><button id="settings-close" class="primary-btn wide">完成</button></div>
		<p class="legal">内核 Sunniesnow © UlyssesZhan（AGPL-3.0），本 App 仅做本地封装与曲库管理。</p>
	</div>
</div>

<div id="calib-modal" class="overlay hidden">
	<div class="panel">
		<h2>手感校准</h2>
		<p class="hint">听到「滴」声就点圆盘，跟着节奏点约 10 次，系统算平均偏差。戴不戴耳机都行，保持一致即可。</p>
		<div id="calib-stage">
			<div id="calib-pad">
				<span id="calib-hint">点一下开始</span>
				<span id="calib-count"></span>
			</div>
		</div>
		<div class="row"><label>测出偏差</label><div class="value-box"><span id="calib-result">—</span><span class="unit">ms</span></div></div>
		<div class="row"><label>本次将应用</label><div class="value-box"><span id="calib-applied">0</span><span class="unit">ms</span></div></div>
		<div class="panel-actions">
			<button id="calib-retry" class="ghost-btn">重新测</button>
			<button id="calib-apply" class="primary-btn">应用并关闭</button>
		</div>
	</div>
</div>
`;

function injectUi() {
	const holder = document.createElement('div');
	holder.innerHTML = UI_HTML;
	while (holder.firstElementChild) document.body.appendChild(holder.firstElementChild);
}

function bindCommon() {
	$('#btn-import').addEventListener('click', () => $('#file-input').click());
	$('#btn-auto').addEventListener('click', () => {
		const on = lsGet(LS.auto, '0') === '1';
		lsSet(LS.auto, on ? '0' : '1');
		syncAutoBtn();
		toast(on ? '已切回手动演奏' : 'AUTO 已开启：进关后自动满分演奏，不需要点屏幕');
	});
	$('#file-input').addEventListener('change', async e => {
		await handleFiles(e.target.files);
		e.target.value = '';
	});
	$('#search').addEventListener('input', () => { page = 0; render(); });
	$('#page-prev').addEventListener('click', () => { if (page > 0) { page--; render(); } });
	$('#page-next').addEventListener('click', () => { page++; render(); });
	$('#detail-delete').addEventListener('click', deleteSelected);
	$('#detail-close').addEventListener('click', () => { clearDetail(); $('#detail').classList.add('collapsed'); });
	bindGameLayers();
	bindProfile();
}

/* ============================ 启动封面 / 个人资料 ============================ */
let profileDraft = null;
let splashDone = false;

function renderAvatarBox(el, p) {
	if (!el) return;
	el.innerHTML = '';
	if (p && p.avatarUrl) {
		const img = document.createElement('img');
		img.src = p.avatarUrl;
		img.alt = '';
		el.appendChild(img);
	} else {
		const s = document.createElement('span');
		s.textContent = ((p && p.name) || '旅人').trim().slice(0, 1) || '旅';
		el.appendChild(s);
	}
}

function syncProfileUI() {
	const p = Profile.read();
	const nameEl = $('#splash-name');
	if (nameEl) nameEl.textContent = p.name;
	const meta = $('#splash-meta');
	if (meta) meta.textContent = Auth.mode === 'remote' ? '账号已连接 · 云端同步' : '本地账号 · 游客';
	renderAvatarBox($('#splash-avatar'), p);
	renderAvatarBox($('#topbar-avatar'), p);
	renderAvatarBox($('#avatar-preview'), profileDraft || p);
}

/* 第一次点屏幕：顺便把音频上下文解锁（iOS 必须在用户手势里做）
   这个上下文一直留着不关，关闭会在控制台报 "AudioContext is closed" */
let unlockedCtx = null;
function unlockAudio() {
	try {
		const C = window.AudioContext || window.webkitAudioContext;
		if (!C) return;
		if (!unlockedCtx) unlockedCtx = new C();
		if (unlockedCtx.state === 'suspended' && unlockedCtx.resume) unlockedCtx.resume();
		const buf = unlockedCtx.createBuffer(1, 1, 22050);
		const src = unlockedCtx.createBufferSource();
		src.buffer = buf;
		src.connect(unlockedCtx.destination);
		src.start(0);
	} catch (e) {}
}

function dismissSplash() {
	if (splashDone) return;
	splashDone = true;
	unlockAudio();
	const el = $('#splash');
	if (!el) return;
	el.classList.add('gone');
	setTimeout(() => el.classList.add('hidden'), 520);
}

function openProfile() {
	profileDraft = Profile.read();
	$('#profile-name').value = profileDraft.name;
	renderAvatarBox($('#avatar-preview'), profileDraft);
	$('#profile-modal').classList.remove('hidden');
	$('#settings-modal').classList.add('hidden');
}

function closeProfile() {
	profileDraft = null;
	$('#profile-modal').classList.add('hidden');
}

function shrinkImage(file, size) {
	return new Promise((res, rej) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			const s = Math.min(size / img.width, size / img.height, 1);
			const c = document.createElement('canvas');
			c.width = Math.max(1, Math.round(img.width * s));
			c.height = Math.max(1, Math.round(img.height * s));
			c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
			URL.revokeObjectURL(url);
			res(c.toDataURL('image/jpeg', 0.86));
		};
		img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('这张图读不出来')); };
		img.src = url;
	});
}

function bindProfile() {
	const splash = $('#splash');
	splash.addEventListener('click', dismissSplash);
	$('#splash-edit').addEventListener('click', ev => { ev.stopPropagation(); openProfile(); });

	$('#avatar-pick').addEventListener('click', () => $('#avatar-input').click());
	$('#avatar-input').addEventListener('change', async ev => {
		const f = ev.target.files && ev.target.files[0];
		ev.target.value = '';
		if (!f) return;
		try {
			const url = await shrinkImage(f, 192);
			profileDraft = Object.assign(profileDraft || Profile.read(), {avatarUrl: url});
			renderAvatarBox($('#avatar-preview'), profileDraft);
		} catch (e) { toast(e.message || '图片读取失败'); }
	});
	$('#avatar-clear').addEventListener('click', () => {
		profileDraft = Object.assign(profileDraft || Profile.read(), {avatarUrl: ''});
		renderAvatarBox($('#avatar-preview'), profileDraft);
	});
	$('#profile-save').addEventListener('click', () => {
		const name = ($('#profile-name').value || '').trim().slice(0, 12) || '旅人';
		const p = Profile.patch({name, avatarUrl: (profileDraft && profileDraft.avatarUrl) || ''});
		profileDraft = null;
		syncProfileUI();
		$('#profile-modal').classList.add('hidden');
		toast(`资料已保存：${p.name}`);
	});
	$('#profile-cancel').addEventListener('click', closeProfile);
	document.getElementById('settings-clear-best').addEventListener('click', () => {
		if (!confirm('清除所有曲目的最佳成绩？此操作不可撤销。')) return;
		try { localStorage.removeItem(LS.best); } catch (e) {}
		refresh();
		toast('最佳成绩已清除');
	});
	document.getElementById('settings-profile').addEventListener('click', openProfile);
	$('#btn-profile').addEventListener('click', openProfile);
	$('#profile-modal').addEventListener('click', ev => {
		if (ev.target === $('#profile-modal')) closeProfile();
	});

	/* 自测时可用 ?skipSplash=1 直接跳过封面 */
	if (new URLSearchParams(location.search).get('skipSplash') === '1') dismissSplash();
}

/* ============================ 横屏 / 暂停 / 缓冲 ============================ */
const isPortrait = () => window.innerHeight > window.innerWidth + 8;
let pendingLaunch = null;
let gameWatcher = null, plPhase = 'idle', sceneRef = null, armed = false, cdTimer = null;

const ssGame = () => window.Sunniesnow && window.Sunniesnow.game;
const ssMusic = () => window.Sunniesnow && window.Sunniesnow.Music;
const DIAG = new URLSearchParams(location.search).get('diag') === '1';
const plLog = what => { if (DIAG) { (window.__sslog = window.__sslog || []).push([Math.round(performance.now()), what, plPhase]); } };

function showRotate(on) {
	$('#rotate-layer').classList.toggle('hidden', !on);
	if (on) $('#pause-layer').classList.add('hidden');
}

function hidePauseLayer() {
	if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
	$('#pause-layer').classList.add('hidden');
	plPhase = 'idle';
	plLog('hide');
}

/* 3 秒缓冲倒数：3 → 2 → 1 → GO */
function plCount(label, done) {
	if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
	plPhase = 'count';
	plLog('count:' + label);
	$('#pause-layer').classList.remove('hidden');
	$('#pl-btns').classList.add('hidden');
	$('#pl-count-wrap').classList.remove('hidden');
	$('#pl-count-hint').textContent = label;
	/* 「曲库」小胶囊只在开局准备倒数的卡死退路里出现，继续游玩的倒数不显示 */
	$('#pl-esc').classList.toggle('hidden', label !== '准备');
	const num = $('#pl-count');
	num.textContent = '3';
	num.classList.remove('go');
	let n = 3;
	cdTimer = setInterval(() => {
		n -= 1;
		if (n > 0) { num.textContent = String(n); return; }
		clearInterval(cdTimer); cdTimer = null;
		num.textContent = 'GO';
		num.classList.add('go');
		setTimeout(() => {
			hidePauseLayer();
			try { done && done(); } catch (e) { console.error(e); }
		}, 420);
	}, 900);
}

/* 暂停菜单：继续 / 曲库；结算页给 重试 / 曲库 */
function plMenu(kind) {
	if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
	plPhase = kind === 'result' ? 'result' : 'menu';
	plLog('menu:' + kind);
	$('#pause-layer').classList.remove('hidden');
	$('#pl-count-wrap').classList.add('hidden');
	$('#pl-btns').classList.remove('hidden');
	$('#pl-resume').classList.toggle('hidden', kind === 'result');
	$('#pl-retry').classList.toggle('hidden', kind !== 'result');
	$('#pl-back').classList.remove('hidden');
}

function bindGameLayers() {
	$('#pl-resume').addEventListener('click', () => {
		if (plPhase === 'count') return;
		plCount('继续', () => { const g = ssGame(); if (g) g.resume(); });
	});
	$('#pl-retry').addEventListener('click', () => {
		hidePauseLayer();
		armed = false; sceneRef = null;
		const g = ssGame();
		if (g) g.retry();
	});
	$('#pl-back').addEventListener('click', exitGame);
	$('#pl-esc').addEventListener('click', exitGame);
	/* 结算页：点左上角热区才亮出菜单；再点遮罩空白处收起 */
	$('#result-hotspot').addEventListener('click', () => plMenu('result'));
	$('#pause-layer').addEventListener('click', ev => {
		if (ev.target === $('#pause-layer') && plPhase === 'result') hidePauseLayer();
	});
	window.addEventListener('resize', onViewportChange);
	window.addEventListener('orientationchange', () => setTimeout(onViewportChange, 120));
}

function onViewportChange() {
	if (!isPortrait()) {
		showRotate(false);
		if (pendingLaunch) {
			const p = pendingLaunch;
			pendingLaunch = null;
			launch(p.rec, p.chart);
		}
	} else if (pendingLaunch) {
		showRotate(true);
	}
}

function startGameWatcher() {
	stopGameWatcher();
	sceneRef = null; armed = false; plPhase = 'idle';
	gameWatcher = setInterval(gameTick, 120);
}

function stopGameWatcher() {
	if (gameWatcher) { clearInterval(gameWatcher); gameWatcher = null; }
	if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
	sceneRef = null; armed = false; plPhase = 'idle';
	$('#pause-layer') && $('#pause-layer').classList.add('hidden');
	$('#rotate-layer') && $('#rotate-layer').classList.add('hidden');
	$('#result-hotspot') && $('#result-hotspot').classList.add('hidden');
}

function gameTick() {
	const g = ssGame();
	if (!g) return;
	const M = ssMusic();
	const sc = g.scene;
	if (!sc) return;

	/* 竖屏一律不玩：冻住音乐，盖提示 */
	if (isPortrait()) {
		if (plPhase !== 'rotate') {
			if (plPhase === 'count') { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }
			if (M && !M.pausing && M.duration) { try { g.pause(); } catch (e) {} }
			plPhase = 'rotate';
			showRotate(true);
		}
		return;
	}
	if (plPhase === 'rotate') {
		showRotate(false);
		if (M && M.pausing && !g.level?.finished) {
			plCount('继续', () => { try { g.resume(); } catch (e) {} });
		} else {
			plPhase = 'idle';
		}
		return;
	}

	const name = sc.constructor.name;

	if (name === 'SceneResult') {
		armed = false;
		sceneRef = sc;
		/* 结算页默认只显示内核原生界面；左上角留一块透明热区，点了才亮出「重试 / 曲库」 */
		if (plPhase === 'result') {
			$('#result-hotspot').classList.add('hidden');
		} else {
			if (plPhase !== 'idle') hidePauseLayer();
			$('#result-hotspot').classList.remove('hidden');
		}
		return;
	}
	$('#result-hotspot').classList.add('hidden');
	if (name !== 'SceneGame' || !g.level) return;

	if (sc !== sceneRef) { sceneRef = sc; armed = true; plPhase = 'idle'; plLog('newscene'); }

	/* 开局缓冲：音乐刚起来就冻住，倒完 3 秒才真正开始 */
	if (armed) {
		if (!M || M.pausing || !M.audio || !(M.duration > 0)) return;
		if (g.level.finished) return;
		armed = false;
		try { g.pause(); } catch (e) {}
		plCount('准备', () => { try { g.resume(); } catch (e) {} });
		return;
	}

	/* 冻结中的状态：只在玩家自己点暂停时弹菜单 */
	if (M && M.pausing) {
		if (!g.level.finished && plPhase !== 'count' && plPhase !== 'menu') plMenu('pause');
	} else if (plPhase === 'menu') {
		hidePauseLayer();
	}
}

async function seedSample() {
	if (lsGet(LS.seed, '') === '1') return;
	if ((await dbAll()).length) { lsSet(LS.seed, '1'); return; }
	try {
		const r = await fetch('/levels/sunniesnow-sample.ssc');
		if (!r.ok) return;
		const blob = await r.blob();
		const file = new File([blob], 'sunniesnow-sample.ssc', {type: 'application/zip'});
		await importOne(file, true);
		lsSet(LS.seed, '1');
	} catch (e) { console.warn('内置示例曲导入失败', e); }
}

/* 老记录没有曲绘（早期内置包不带封面）时，从随包资源补一张 */
async function repairPresetCover() {
	const preset = (await dbAll()).find(r => r.preset);
	if (!preset || preset.coverBlob) return false;
	try {
		const r = await fetch('/levels/sunniesnow-sample.ssc', {cache: 'no-cache'});
		if (!r.ok) return false;
		const meta = await parseSsc(await r.blob());
		if (!meta.coverBlob) return false;
		preset.coverBlob = meta.coverBlob;
		await dbPut(preset);
		return true;
	} catch (e) { console.warn('补曲绘失败', e); return false; }
}

async function init() {
	if (!window.JSZip) { toast('缺少解压组件，无法导入关卡'); }
	injectUi();
	bindCommon();
	bindSettings();
	bindCalib();
	syncSettingsUI();
	syncProfileUI();
	await seedSample();
	await repairPresetCover();
	await refresh();
	/* 等内核就绪（仅提示用，不阻塞界面） */
	waitGameReady().catch(() => {});
}

/* 诊断（仅 ?diag=1 时启用，便于本地自测） */
if (new URLSearchParams(location.search).get('diag') === '1') {
	setInterval(() => {
		try {
			const g = window.Sunniesnow && window.Sunniesnow.game;
			if (!g) { document.body.dataset.diag = 'no-game'; return; }
			const lv = g.level;
			document.body.dataset.diag = JSON.stringify({
				scene: g.scene && g.scene.constructor.name,
				autoplay: !!(g.settings && g.settings.autoplay),
				musicTime: window.Sunniesnow.Music ? Math.round((window.Sunniesnow.Music.currentTime || 0) * 100) / 100 : null,
				musicPlaying: !!(window.Sunniesnow.Music && !window.Sunniesnow.Music.pausing),
				tickerCount: g.app && g.app.ticker ? g.app.ticker.count : null,
				plPhase,
				judgements: lv && lv.judgementCounts ? lv.judgementCounts : (lv && lv.judgements ? lv.judgements : null)
			});
		} catch (e) { document.body.dataset.diag = 'ERR ' + e.message; }
	}, 300);
	/* 自测钩子：只用于本机调试分页/选中，不影响正常使用 */
	window.__ssapp = {
		fill: arr => { levels = arr; page = 0; selectedId = null; render(); },
		state: () => ({ page, selectedId, count: levels.length }),
		all: () => levels,
		prime: (rec, chart) => primeLevel(rec, chart),
		dismissSplash,
		profile: () => Profile.read(),
		setProfile: fields => { const p = Profile.patch(fields); syncProfileUI(); return p; },
		auth: () => ({mode: Auth.mode, guest: Auth.isGuest()}),
		calib: () => ({running: calib.running, nodes: calib.nodes.length, taps: calib.taps.length})
	};
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

})();
