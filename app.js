// Isolated browser progress/settings. Never read or erase ENT or another role's keys.
const AYLA_STORAGE_PREFIX = 'ayla_gyno_student_';
const AYLAStorage = Object.freeze({
 getItem:key=>window.localStorage.getItem(AYLA_STORAGE_PREFIX+key),
 setItem:(key,value)=>window.localStorage.setItem(AYLA_STORAGE_PREFIX+key,String(value)),
 removeItem:key=>window.localStorage.removeItem(AYLA_STORAGE_PREFIX+key),
 keys:()=>Object.keys(window.localStorage).filter(key=>key.startsWith(AYLA_STORAGE_PREFIX)).map(key=>key.slice(AYLA_STORAGE_PREFIX.length))
});
window.AYLAStorage=AYLAStorage;
// ============================================================
//  AYLA GYNO MASTER BANK — PRODUCTION OPTIMIZED BUILD v7.0
//  Performance Engineering: Dashboard Cache, Lazy Loading,
//  Virtual Scrolling, Infinite Scrolling, Smart Scroll Loader,
//  In-Memory Search Index, Filter Cache, Web Worker Offload
// ============================================================

window.ENTApp=window.ENTApp||{};
window.ENTApp.state=window.ENTApp.state||{};
window.ENTApp.utils=window.ENTApp.utils||{};

window.ENTApp=window.ENTApp||{};
window.ENTApp.modules=window.ENTApp.modules||{};
window.ENTApp.modules.app=window.ENTApp.modules.app||{};
window.ENTApp=window.ENTApp||{};
window.ENTApp.version='1.0.1';
window.ENTApp.utils=window.ENTApp.utils||{};
// Phase 5 bootstrap
window.ENTApp = window.ENTApp || {};
window.ENTApp.version='1.0.1';


// Dewhurst 9th edition is the sole bundled curriculum. Legacy internal names
// remain compatible with the existing offline package/search modules.
const AYLA_CURRICULUM = window.AYLA_TAXONOMY;
if (!AYLA_CURRICULUM || AYLA_CURRICULUM.bankId !== 'ayla-gyno') throw new Error('The AYLA GYNO classification file is missing. Reload the complete application.');
const ENT_DATA = Object.fromEntries(AYLA_CURRICULUM.subjects.map(s => [s.name, s.chapters.map(c => c.name)]));
const SCOTT_BROWN_TAXONOMY = AYLA_CURRICULUM.subjects.map(subject => {
    const parts = new Map();
    for (const chapter of subject.chapters) {
        if (!parts.has(chapter.part.id)) parts.set(chapter.part.id, {partId:chapter.part.id, part:chapter.part.name, chapters:[]});
        parts.get(chapter.part.id).chapters.push({chapterId:chapter.id, chapterNumber:chapter.number, chapter:chapter.name, topics:chapter.topics.map(t=>t.name)});
    }
    return {subjectId:subject.id, subject:subject.name, pending:false, chapters:null, parts:[...parts.values()]};
});
const CLASSIFICATION_BOOKS = [{bookId:AYLA_CURRICULUM.book.id, book:AYLA_CURRICULUM.book.name, subjects:SCOTT_BROWN_TAXONOMY}];
const LEGACY_CLASSIFICATION_MAP = {};
const ALL_SUBJECTS = [...Object.keys(ENT_DATA), 'Uncategorized'];
const ALL_CHAPTERS = Object.values(ENT_DATA).flat();
const aylaCompare = (a,b) => a.localeCompare(b,'en',{numeric:true,sensitivity:'base'});
function aylaFindBranch(subjectText, chapterText) {
    const key=questionClassificationKey;
    const subject=AYLA_CURRICULUM.subjects.find(s=>[s.name,s.id,s.sourceTitle,s.sourceId].some(v=>key(v)===key(subjectText)));
    const titleKey=v=>key(String(v||'').replace(/^\s*(?:chapter\s*)?\d+[.\s:–-]+/i,''));
    const chapter=subject && subject.chapters.find(c=>key(c.name)===key(chapterText) || titleKey(c.name)===titleKey(chapterText) || String(c.number)===String(chapterText).trim() || key(c.id)===key(chapterText));
    return {subject,chapter};
}
function aylaTopicsFor(subject='all', chapter='all', questions=[]) {
    const topics=new Set(['General']);
    const selected=Array.isArray(subject)?subject:[subject];
    const allSubjects=selected.length===0 || selected.includes('all');
    for(const s of AYLA_CURRICULUM.subjects) {
        if(!allSubjects && !selected.includes(s.name))continue;
        for(const c of s.chapters) if(chapter==='all' || chapter===c.name) for(const t of c.topics)topics.add(t.name);
    }
    for(const q of questions||[])if((allSubjects||selected.includes(q.subject))&&(chapter==='all'||q.chapter===chapter)&&q.topic)topics.add(q.topic);
    return [...topics].sort(aylaCompare);
}
function computeTaxonomy(questions) {
    const bySubject=Object.create(null);
    for(const s of AYLA_CURRICULUM.subjects)bySubject[s.name]=new Set(['General',...s.chapters.map(c=>c.name)]);
    bySubject.Uncategorized=new Set(['General']);
    for(const q of questions||[]){const subject=typeof q.subject==='string'&&q.subject.trim()?q.subject.trim():'Uncategorized';const chapter=typeof q.chapter==='string'&&q.chapter.trim()?q.chapter.trim():'General';if(!bySubject[subject])bySubject[subject]=new Set(['General']);bySubject[subject].add(chapter);}
    const subjects=Object.keys(bySubject).sort(aylaCompare),chaptersBySubject=Object.create(null),topicsBySubject=Object.create(null);
    for(const s of subjects){chaptersBySubject[s]=[...bySubject[s]].sort(aylaCompare);topicsBySubject[s]=Object.create(null);for(const c of chaptersBySubject[s])topicsBySubject[s][c]=aylaTopicsFor(s,c,questions);}
    return {subjects,chaptersBySubject,topicsBySubject,allChapters:[...new Set(subjects.flatMap(s=>chaptersBySubject[s]))].sort(aylaCompare)};
}

// ============================================================
//  OPTIMIZATION LAYER 1: WEB WORKER ENGINE
//  Offloads heavy computation (search indexing, filtering,
//  analytics, duplicate detection) to a background thread.
//  Automatically falls back to main-thread execution if
//  Workers are unavailable, blocked by CSP, or time out.
// ============================================================
const WORKER_CODE = ENTSearch.workerSource() + `
let workerSearchIndex = null;
let workerSearchGeneration = -1;
function buildIndex(payload) {
  workerSearchIndex = ENTSearch.createIndex(payload.questions);
  workerSearchGeneration = payload.generation;
  return { generation: workerSearchGeneration, stats: workerSearchIndex.stats };
}
function search(payload) {
  return { generation: workerSearchGeneration, ids: workerSearchIndex && workerSearchGeneration === payload.generation ? workerSearchIndex.search(payload.query) : [] };
}
function filterQuestions(payload) {
  const index = ENTSearch.createIndex(payload.questions);
  const ids = index.search(payload.searchQuery);
  const byId = new Map(payload.questions.map(q => [q.id, q]));
  let result = ENTSearch.filterQuestions(ids === null ? payload.questions : ids.map(id => byId.get(id)), payload.filters, payload);
  return result;
}
function computeAnalytics(payload) {
  const { questions, performance, bookmarks, examHistory } = payload;
  const total = questions.length;
  const correct = performance.filter(x => x.correct).length;
  const wrong = performance.length - correct;
  const acc = performance.length ? Math.round(correct * 100 / performance.length) : 0;
  const avg = examHistory.length ? Math.round(examHistory.reduce((s, e) => s + (e.percentage || 0), 0) / examHistory.length) : 0;
  const subjectCounts = {};
  questions.forEach(q => { const s = q.subject || 'Uncategorized'; subjectCounts[s] = (subjectCounts[s] || 0) + 1; });
  const weakTopics = {};
  performance.forEach(x => {
    const key = (x.subject || 'Unknown') + ' > ' + (x.chapter || 'Unknown') + ' > ' + (x.topic || 'Unknown');
    if (!weakTopics[key]) weakTopics[key] = { t: 0, c: 0 };
    weakTopics[key].t++;
    if (x.correct) weakTopics[key].c++;
  });
  const weakArr = Object.entries(weakTopics)
    .filter(([k, v]) => v.t >= 2)
    .map(([k, v]) => ({ k, p: Math.round(v.c * 100 / v.t), t: v.t }))
    .sort((a, b) => a.p - b.p)
    .slice(0, 5);
  return { total, bookmarks: bookmarks.length, exams: examHistory.length, correct, wrong, acc, avg, subjectCounts, weakArr };
}

function findDuplicates(qs) {
  const map = new Map();
  const dups = [];
  for (const q of qs) {
    const key = (q.questionText || '').toLowerCase().trim();
    if (map.has(key)) dups.push(q);
    else map.set(key, q.id);
  }
  return dups;
}

self.onmessage = function(e) {
  const { type, payload, id } = e.data;
  try {
    let result;
    switch (type) {
      case 'buildIndex': result = buildIndex(payload); break;
      case 'search': result = search(payload); break;
      case 'filter': result = filterQuestions(payload); break;
      case 'analytics': result = computeAnalytics(payload); break;
      case 'duplicates': result = findDuplicates(payload); break;
      default: throw new Error('Unknown worker task');
    }
    self.postMessage({ id, type, result });
  } catch (error) { self.postMessage({ id, type, error: error.message }); }
};
`;

const WorkerPool = {
  worker: null,
  queue: new Map(),
  msgId: 0,
  enabled: true,

  /** Initialize the worker from an inline blob. Returns true on success. */
  init() {
    if (this.worker || typeof Worker === 'undefined') return false;
    try {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = (e) => {
        const { id, result, error } = e.data;
        const pending = this.queue.get(id);
        if (pending) {
          this.queue.delete(id);
          clearTimeout(pending.timer);
          if (error) pending.reject(new Error(error)); else pending.resolve(result);
        }
      };
      this.worker.onerror = (err) => {
        console.error('Worker fatal error:', err);
        this.enabled = false;
        this.worker = null;
        for (const [id, pending] of this.queue) {
          clearTimeout(pending.timer);
          pending.reject(err);
        }
        this.queue.clear();
      };
      return true;
    } catch (e) {
      console.warn('Worker initialization failed:', e);
      this.enabled = false;
      return false;
    }
  },

  /** Post a task to the worker with automatic fallback. */
  async post(type, payload) {
    if (!this.worker && this.enabled) this.init();
    if (!this.worker || !this.enabled) {
      return this.fallback(type, payload);
    }
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.queue.has(id)) {
          this.queue.delete(id);
          reject(new Error('Worker timeout'));
        }
      }, 15000);
      this.queue.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ type, payload, id }); }
      catch (error) { clearTimeout(timer); this.queue.delete(id); reject(error); }
    }).catch(err => {
      console.warn('Worker task failed, falling back to main thread:', err);
      return this.fallback(type, payload);
    });
  },

  /** Synchronous fallback implementations when Worker is unavailable. */
  fallback(type, payload) {
    switch (type) {
      case 'buildIndex': {
        this._searchQuestions = payload.questions;
        this._searchGeneration = payload.generation;
        this._searchIndex = ENTSearch.createIndex(payload.questions);
        return { generation: payload.generation, stats: this._searchIndex.stats };
      }
      case 'filter': {
        const index = ENTSearch.createIndex(payload.questions);
        const ids = index.search(payload.searchQuery);
        const byId = new Map(payload.questions.map(q => [q.id, q]));
        let result = ENTSearch.filterQuestions(ids === null ? payload.questions : ids.map(id => byId.get(id)), payload.filters, payload);
        return result;
      }
      case 'analytics': {
        const { questions, performance, bookmarks, examHistory } = payload;
        const total = questions.length;
        const correct = performance.filter(x => x.correct).length;
        const wrong = performance.length - correct;
        const acc = performance.length ? Math.round(correct * 100 / performance.length) : 0;
        const avg = examHistory.length ? Math.round(examHistory.reduce((s, e) => s + (e.percentage || 0), 0) / examHistory.length) : 0;
        const subjectCounts = {};
        questions.forEach(q => { const s = q.subject || 'Uncategorized'; subjectCounts[s] = (subjectCounts[s] || 0) + 1; });
        const weakTopics = {};
        performance.forEach(x => {
          const key = (x.subject || 'Unknown') + ' > ' + (x.chapter || 'Unknown') + ' > ' + (x.topic || 'Unknown');
          if (!weakTopics[key]) weakTopics[key] = { t: 0, c: 0 };
          weakTopics[key].t++;
          if (x.correct) weakTopics[key].c++;
        });
        const weakArr = Object.entries(weakTopics)
          .filter(([k, v]) => v.t >= 2)
          .map(([k, v]) => ({ k, p: Math.round(v.c * 100 / v.t), t: v.t }))
          .sort((a, b) => a.p - b.p)
          .slice(0, 5);
        return { total, bookmarks: bookmarks.length, exams: examHistory.length, correct, wrong, acc, avg, subjectCounts, weakArr };
      }
      case 'duplicates': {
        const map = new Map(), dups = [];
        for (const q of payload) {
          const key = (q.questionText || '').toLowerCase().trim();
          if (map.has(key)) dups.push(q);
          else map.set(key, q.id);
        }
        return dups;
      }
      case 'search': {
        if (!this._searchIndex || this._searchGeneration !== payload.generation) {
          this._searchGeneration = payload.generation;
          this._searchIndex = ENTSearch.createIndex(this._searchQuestions || []);
        }
        return { generation: payload.generation, ids: this._searchIndex.search(payload.query) };
      }
      default: return null;
    }
  }
};

// ============================================================
//  OPTIMIZATION LAYER 2: IN-MEMORY SEARCH INDEX
//  Builds an inverted index mapping every word to the set of
//  question IDs containing it. Rebuilt automatically whenever
//  the underlying question cache version changes.
// ============================================================
const GlobalSearchIndex = {
  ready: false, version: -1, generation: 0, buildCount: 0, questions: null, byId: new Map(), _building: null,
  async ensureBuilt(questions) {
    questions = questions || await db.getAllQuestions();
    const version = db._cacheVersion;
    // Bookmarks, notes and answers change the broad cache version, but leave the question array intact.
    if (this.ready && (this.questions === questions || this.version === version)) { this.version = version; return; }
    if (this._building) { await this._building; return this.ensureBuilt(questions); }
    const generation = ++this.generation;
    WorkerPool._searchQuestions = questions;
    this._building = WorkerPool.post('buildIndex', { questions, generation }).then(result => {
      this.questions = questions;
      this.byId = new Map(questions.map(q => [q.id, q]));
      this.version = version;
      this.ready = true;
      this.buildCount++;
      this.stats = result.stats;
    }).finally(() => { this._building = null; });
    await this._building;
  },
  async search(query) {
    const generation = this.generation;
    const result = await WorkerPool.post('search', { query, generation });
    if (generation !== this.generation || result.generation !== generation) return this.search(query);
    return result.ids;
  },
  async findQuestions(query, questions) {
    if (!String(query || '').trim()) return questions;
    await this.ensureBuilt(questions);
    const ids = await this.search(query);
    return ids === null ? questions : ids.map(id => this.byId.get(id)).filter(Boolean);
  }
};

// ============================================================
//  OPTIMIZATION LAYER 3: FILTER CACHE
//  Memoizes filtered result arrays keyed by a hash of the active
//  filters + search query. Automatically invalidated whenever
//  the DB cache version increments (import, edit, delete, restore).
//  LRU eviction keeps memory bounded at 30 entries.
// ============================================================
const QuestionSearchUI = {
  timer: null,
  bind(input) {
    if (!input || input.dataset.searchBound) return;
    input.dataset.searchBound = 'true';
    let composing = false;
    const update = () => {
      AppState.searchQuery = input.value;
      const revision = AppState._questionSearchRevision = (AppState._questionSearchRevision || 0) + 1;
      clearTimeout(this.timer);
      if (composing) return;
      this.timer = setTimeout(async () => {
        if (revision !== AppState._questionSearchRevision || AppState.currentView !== 'questions') return;
        const focused = document.activeElement === input;
        const start = input.selectionStart, end = input.selectionEnd, direction = input.selectionDirection;
        await renderViewSafely('questions');
        if (!focused || revision !== AppState._questionSearchRevision || AppState.currentView !== 'questions') return;
        const current = document.getElementById('questionSearchInput');
        if (current && (!document.activeElement || document.activeElement === document.body || document.activeElement === current)) {
          current.focus();
          current.setSelectionRange(start, end, direction || 'none');
        }
      }, 120);
    };
    input.addEventListener('compositionstart', () => { composing = true; clearTimeout(this.timer); AppState._questionSearchRevision = (AppState._questionSearchRevision || 0) + 1; });
    input.addEventListener('compositionend', () => { composing = false; update(); });
    input.addEventListener('input', update);
  }
};

const FilterCache = {
  _store: new Map(),
  _version: -1,

  get(filters, searchQuery, cacheVersion, factory) {
    if (this._version !== cacheVersion) {
      this._store.clear();
      this._version = cacheVersion;
    }
    const key = JSON.stringify({ f: filters, q: searchQuery });
    if (this._store.has(key)) {
      const hit = this._store.get(key);
      this._store.delete(key); this._store.set(key, hit);
      return hit;
    }
    const result = Promise.resolve().then(factory).catch(error => {
      if (this._store.get(key) === result) this._store.delete(key);
      throw error;
    });
    this._store.set(key, result);
    // LRU eviction: cap at 30 entries
    if (this._store.size > 30) {
      const first = this._store.keys().next().value;
      this._store.delete(first);
    }
    return result;
  },

  clear() {
    this._store.clear();
    this._version = -1;
  }
};

// ============================================================
//  OPTIMIZATION LAYER 4: VIRTUAL & INFINITE SCROLLER
//  Keeps the DOM lightweight by rendering only visible question
//  cards plus a small overscan buffer. Uses absolute-height
//  spacer divs to maintain correct scrollbar proportions for
//  100,000+ item lists. Loads data in chunks of 50 as the user
//  approaches the bottom, with duplicate-load prevention.
// ============================================================
class VirtualScroller {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.items = options.items || [];
    this.renderItem = options.renderItem;        // fn(item, index) => HTML string (single root element)
    this.itemHeight = options.itemHeight || 130; // estimated average row height (px)
    this.buffer = options.buffer || 5;           // overscan rows
    this.pageSize = options.pageSize || 50;      // infinite-scroll chunk size
    this.scrollHandler = this.onScroll.bind(this);
    this._range = [-1, -1];
    this.loadedCount = 0;   // how many items are "unlocked" for rendering
    this.loading = false;   // lock to prevent duplicate loadMore calls
    this._nodes = new Map(); // index -> currently-mounted DOM node; lets unchanged rows survive a range update untouched
    this._rafHandle = null;  // coalesces bursts of scroll events into one update per frame
    this._tmp = document.createElement('div'); // scratch element used only to parse an HTML string into a node
  }

  /** Create DOM structure and attach scroll listener. */
  init() {
    if (!this.container) return;
    this.container.style.position = 'relative';
    this.topSpacer = document.createElement('div');
    this.content = document.createElement('div');
    this.bottomSpacer = document.createElement('div');
    this.loader = document.createElement('div');
    this.loader.style.cssText = 'text-align:center;padding:14px;color:var(--text2);font-size:0.85rem;display:none;';
    this.loader.textContent = 'Loading more...';
    this.container.innerHTML = '';
    this.container.appendChild(this.topSpacer);
    this.container.appendChild(this.content);
    this.container.appendChild(this.bottomSpacer);
    this.container.appendChild(this.loader);
    this.container.addEventListener('scroll', this.scrollHandler, { passive: true });
    this.reset(this.items);
  }

  /** Reset with a new item array (e.g., after filter change). */
  reset(newItems) {
    if (newItems) this.items = newItems;
    this.loadedCount = Math.min(this.pageSize, this.items.length);
    this._range = [-1, -1];
    // The underlying item set changed identity, so old mounted nodes no longer
    // correspond to the same logical rows - clear rather than diff across data sets.
    this._nodes.clear();
    if (this.content) this.content.innerHTML = '';
    if (this.container) this.container.scrollTop = 0;
    this.updateRange();
  }

  /** Scroll handler: coalesces rapid scroll events into one update per animation frame. */
  onScroll() {
    if (this._rafHandle) return;
    this._rafHandle = requestAnimationFrame(() => {
      this._rafHandle = null;
      this.updateRange();
    });
  }

  /** Compute the visible+buffered range, trigger infinite load, and patch the DOM to match. */
  updateRange() {
    if (!this.container) return;
    const st = this.container.scrollTop;
    const vh = this.container.clientHeight;
    const totalLoadedHeight = this.loadedCount * this.itemHeight;

    // Smart Scroll Loader: detect near-bottom and load next chunk
    if (st + vh > totalLoadedHeight - this.itemHeight * 4 && this.loadedCount < this.items.length && !this.loading) {
      this.loadMore();
    }

    const start = Math.max(0, Math.floor(st / this.itemHeight) - this.buffer);
    const end = Math.min(this.loadedCount, Math.ceil((st + vh) / this.itemHeight) + this.buffer);
    if (start === this._range[0] && end === this._range[1]) return;
    this._range = [start, end];

    // Adjust spacers so total scrollable height equals full dataset
    this.topSpacer.style.height = (start * this.itemHeight) + 'px';
    this.bottomSpacer.style.height = (Math.max(0, this.items.length - end) * this.itemHeight) + 'px';

    this.patch(start, end);
  }

  /**
   * Reconcile mounted DOM nodes with the new [start, end) range. Rows that
   * remain in range keep their existing node (no destroy/recreate, no lost
   * layout/paint work for them); only rows entering or leaving are touched.
   */
  patch(start, end) {
    for (const [idx, node] of this._nodes) {
      if (idx < start || idx >= end) {
        node.remove();
        this._nodes.delete(idx);
      }
    }
    let ref = this.content.firstChild;
    for (let i = start; i < end; i++) {
      let node = this._nodes.get(i);
      if (!node) {
        node = this._buildNode(i);
        this._nodes.set(i, node);
      }
      if (node !== ref) {
        this.content.insertBefore(node, ref);
      } else {
        ref = ref.nextSibling;
      }
    }
  }

  _buildNode(index) {
    this._tmp.innerHTML = this.renderItem(this.items[index], index);
    const node = this._tmp.firstElementChild;
    this._tmp.innerHTML = '';
    return node || document.createTextNode('');
  }

  /** Append the next page of items (infinite scroll). */
  loadMore() {
    this.loading = true;
    this.loader.style.display = 'block';
    // Yield to browser to paint the loader, then expand
    requestAnimationFrame(() => {
      setTimeout(() => {
        const oldCount = this.loadedCount;
        this.loadedCount = Math.min(this.loadedCount + this.pageSize, this.items.length);
        if (this.loadedCount > oldCount) {
          this.updateRange();
        }
        this.loading = false;
        this.loader.style.display = 'none';
      }, 30);
    });
  }

  /** Clean up event listeners and mounted nodes. */
  destroy() {
    if (this.container) {
      this.container.removeEventListener('scroll', this.scrollHandler);
    }
    if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }
    this._nodes.clear();
  }
}

// ============================================================
//  OPTIMIZATION LAYER 5: LAZY RENDERER
//  Defers heavy DOM insertion and analytics calculations using
//  requestIdleCallback (with requestAnimationFrame fallback) so
//  the main thread stays responsive during initial paint.
// ============================================================
const LazyRenderer = {
  queue: [],
  processing: false,

  schedule(fn, priority = 'idle') {
    this.queue.push({ fn, priority });
    if (!this.processing) this.process();
  },

  process() {
    if (!this.queue.length) { this.processing = false; return; }
    this.processing = true;
    const task = this.queue.shift();
    const run = () => {
      try { task.fn(); } catch (e) { console.error('Lazy render error:', e); }
      if (this.queue.length) this.process();
      else this.processing = false;
    };
    if (task.priority === 'idle' && 'requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 120 });
    } else {
      requestAnimationFrame(run);
    }
  },

  clear() {
    this.queue = [];
    this.processing = false;
  }
};

        // ============================================================
        //  DATABASE  (Enhanced with Cache Invalidation)
        // ============================================================
        function normalizeCorrectAnswer(value) {
            return typeof value === 'string' ? value.trim().toUpperCase() : '';
        }

        function validateQuestionAnswer(question) {
            if (!question || typeof question !== 'object' || Array.isArray(question)) return ['Each row must be a question object.'];
            const errors = [];
            for (const letter of ['A', 'B']) {
                if (typeof question['option' + letter] !== 'string' || !question['option' + letter].trim()) errors.push(`Option ${letter} is required.`);
            }
            const answer = normalizeCorrectAnswer(question.correctAnswer);
            if (!/^[A-E]$/.test(answer)) errors.push('Correct answer must be one letter from A to E.');
            else if (typeof question['option' + answer] !== 'string' || !question['option' + answer].trim()) errors.push(`Correct answer ${answer} has no option text.`);
            return errors;
        }

        function normalizeQuestionAnswer(question) {
            const errors = validateQuestionAnswer(question);
            if (errors.length) throw new Error(errors.join(' '));
            return { ...question, correctAnswer: normalizeCorrectAnswer(question.correctAnswer) };
        }

        function prepareQuestionAnswers(questions) {
            if (!Array.isArray(questions)) throw new Error('Questions must be an array.');
            return questions.map((question, index) => {
                try { return normalizeQuestionAnswer(question); }
                catch (error) { throw new Error(`Question ${index + 1}: ${error.message}`); }
            });
        }

        function bindQuestionAnswerEditor(root, initialAnswer = '') {
            const answer = root.querySelector('#addCorrectAnswer');
            const status = root.querySelector('#questionAnswerStatus');
            if (!answer) return () => {};
            answer.value = normalizeCorrectAnswer(initialAnswer);
            const sync = () => {
                const selected = answer.value;
                for (const letter of ['A', 'B', 'C', 'D', 'E']) {
                    const input = root.querySelector('#addOption' + letter);
                    const option = answer.querySelector(`option[value="${letter}"]`);
                    if (option) option.disabled = !input || !input.value.trim();
                }
                const selectedOption = selected ? answer.querySelector(`option[value="${selected}"]`) : null;
                if (selected && (!selectedOption || selectedOption.disabled)) {
                    answer.value = '';
                    if (status) status.textContent = `Correct answer ${selected} has no option text. Enter the option text, then select the correct answer.`;
                } else if (status) {
                    status.textContent = answer.value ? '' : 'Enter the options, then select the correct answer.';
                }
                answer.setAttribute('aria-invalid', answer.value ? 'false' : 'true');
            };
            for (const letter of ['A', 'B', 'C', 'D', 'E']) {
                const input = root.querySelector('#addOption' + letter);
                if (input) input.addEventListener('input', sync);
            }
            answer.addEventListener('change', sync);
            sync();
            return sync;
        }

        Object.assign(window.ENTApp.utils, { normalizeCorrectAnswer, validateQuestionAnswer, normalizeQuestionAnswer, prepareQuestionAnswers });

        const DB_NAME = 'AYLAGynoQuestionBank_student';
        const DB_VERSION = 8;

        class ENTDatabase {
            constructor() {
                this.db = null;
                // OPTIMIZATION: Expanded cache covers all hot data paths
                this._cache = {
                    questions: null, bookmarks: null, highYield: null,
                    performance: null, examHistory: null, groups: null,
                    books: null, lectures: null, notes: null
                };
                // Cache validity flags — separate from data so we can invalidate cheaply
                this._cacheValid = {
                    questions: false, bookmarks: false, highYield: false,
                    performance: false, examHistory: false, groups: false,
                    books: false, lectures: false, notes: false
                };
                // Monotonic version counter incremented on every write.
                // External systems (FilterCache, SearchIndex) key off this.
                this._cacheVersion = 0;
                this.ready = this.init();
            }

            init() {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(DB_NAME, DB_VERSION);
                    request.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('questions')) {
                            const qStore = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
                            qStore.createIndex('subject', 'subject', { unique: false });
                            qStore.createIndex('chapter', 'chapter', { unique: false });
                            qStore.createIndex('topic', 'topic', { unique: false });
                            qStore.createIndex('subtopic', 'subtopic', { unique: false });
                            qStore.createIndex('group', 'group', { unique: false });
                            qStore.createIndex('book', 'book', { unique: false });
                        }
                        if (!db.objectStoreNames.contains('examHistory')) db.createObjectStore('examHistory', { keyPath: 'id', autoIncrement: true });
                        if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'questionId' });
                        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'questionId' });
                        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
                        if (!db.objectStoreNames.contains('performance')) db.createObjectStore('performance', { keyPath: 'id', autoIncrement: true });
                        if (!db.objectStoreNames.contains('highYield')) db.createObjectStore('highYield', { keyPath: 'questionId' });
                        if (!db.objectStoreNames.contains('lectures')) {
                            const lStore = db.createObjectStore('lectures', { keyPath: 'id', autoIncrement: true });
                            lStore.createIndex('subject', 'subject', { unique: false });
                            lStore.createIndex('chapter', 'chapter', { unique: false });
                            lStore.createIndex('book', 'book', { unique: false });
                        }
                        // --- Update Package System (v8): new content stores ---
                        if (!db.objectStoreNames.contains('flashcards')) {
                            const fStore = db.createObjectStore('flashcards', { keyPath: 'id', autoIncrement: true });
                            fStore.createIndex('subject', 'subject', { unique: false });
                            fStore.createIndex('chapter', 'chapter', { unique: false });
                            fStore.createIndex('uid', 'uid', { unique: false });
                        }
                        if (!db.objectStoreNames.contains('bookMeta')) {
                            const bmStore = db.createObjectStore('bookMeta', { keyPath: 'id', autoIncrement: true });
                            bmStore.createIndex('uid', 'uid', { unique: false });
                        }
                        if (!db.objectStoreNames.contains('assets')) {
                            db.createObjectStore('assets', { keyPath: 'assetKey' });
                        }
                        if (!db.objectStoreNames.contains('backups')) {
                            db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
                        }
                        // 'uid' index on pre-existing content stores, added for devices upgrading from v7 or earlier
                        const tx = e.target.transaction;
                        const qStoreUpgrade = tx.objectStore('questions');
                        if (!qStoreUpgrade.indexNames.contains('uid')) qStoreUpgrade.createIndex('uid', 'uid', { unique: false });
                        const lStoreUpgrade = tx.objectStore('lectures');
                        if (!lStoreUpgrade.indexNames.contains('uid')) lStoreUpgrade.createIndex('uid', 'uid', { unique: false });
                    };
                    request.onsuccess = (e) => {
                        this.db = e.target.result;
                        this.db.onversionchange = () => {
                            this.db.close();
                            alert('A newer version of AYLA GYNO Master Bank is available. Please reload the page.');
                        };
                        resolve();
                    };
                    request.onblocked = () => {
                        console.warn('IndexedDB upgrade blocked by another open tab.');
                    };
                    request.onerror = (e) => reject(e.target.error);
                });
            }

            async ensureReady() { await this.ready; }

            /** Invalidate selected cache keys (or all if null). Bump version. */
            _invalidateCache(keys) {
                this._cacheVersion++;
                if (keys) {
                    keys.forEach(k => this._cacheValid[k] = false);
                } else {
                    Object.keys(this._cacheValid).forEach(k => this._cacheValid[k] = false);
                }
            }

            async addQuestion(q) {
                q = normalizeQuestionAnswer(q);
                normalizeQuestionClassification(q, { infer: false });
                this._invalidateCache(['questions', 'groups', 'books']);
                await this.ensureReady();
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction('questions', 'readwrite');
                    q.dateAdded = new Date().toISOString();
                    q.tags = q.tags || [];
                    if (!q.group) q.group = '';
                    if (!q.book) q.book = '';
                    const req = tx.objectStore('questions').add(q);
                    req.onsuccess = (e) => resolve(e.target.result);
                    req.onerror = (e) => reject(e.target.error);
                    tx.onerror = (e) => reject(tx.error || e.target.error);
                });
            }

            async getAllQuestions() {
                await this.ensureReady();
                if (this._cacheValid.questions && this._cache.questions) return this._cache.questions;
                return new Promise(resolve => {
                    this.db.transaction('questions', 'readonly').objectStore('questions').getAll().onsuccess = (e) => {
                        this._cache.questions = e.target.result;
                        this._cacheValid.questions = true;
                        resolve(e.target.result);
                    };
                });
            }

            async getQuestion(id) {
                await this.ensureReady();
                return new Promise(resolve => {
                    this.db.transaction('questions', 'readonly').objectStore('questions').get(id).onsuccess = (e) => resolve(e.target.result);
                });
            }

            async deleteQuestion(id) {
                this._invalidateCache(['questions', 'bookmarks', 'highYield', 'groups', 'books']);
                await this.ensureReady();
                return new Promise(resolve => {
                    const tx = this.db.transaction(['questions', 'bookmarks', 'notes'], 'readwrite');
                    tx.objectStore('questions').delete(id);
                    tx.objectStore('bookmarks').delete(id);
                    tx.objectStore('notes').delete(id);
                    tx.oncomplete = () => resolve();
                });
            }

            async toggleBookmark(qid) {
                this._invalidateCache(['bookmarks']);
                await this.ensureReady();
                return new Promise(resolve => {
                    const tx = this.db.transaction('bookmarks', 'readwrite');
                    const store = tx.objectStore('bookmarks');
                    const get = store.get(qid);
                    get.onsuccess = () => {
                        if (get.result) { store.delete(qid); resolve(false); }
                        else { store.add({ questionId: qid }); resolve(true); }
                    };
                });
            }

            async isBookmarked(qid) {
                await this.ensureReady();
                return new Promise(resolve => {
                    this.db.transaction('bookmarks', 'readonly').objectStore('bookmarks').get(qid).onsuccess = (e) => resolve(!!e.target.result);
                });
            }

            async getAllBookmarkedIds() {
                await this.ensureReady();
                if (this._cacheValid.bookmarks && this._cache.bookmarks) return this._cache.bookmarks;
                return new Promise(resolve => {
                    this.db.transaction('bookmarks', 'readonly').objectStore('bookmarks').getAll().onsuccess = (e) => {
                        this._cache.bookmarks = e.target.result.map(b => b.questionId);
                        this._cacheValid.bookmarks = true;
                        resolve(this._cache.bookmarks);
                    };
                });
            }

            async saveExamResult(result) {
                this._invalidateCache(['examHistory']);
                try {
                    await this.ensureReady();
                    return new Promise((resolve, reject) => {
                        result.date = new Date().toISOString();
                        const tx = this.db.transaction('examHistory', 'readwrite');
                        tx.objectStore('examHistory').add(result).onsuccess = (e) => resolve(e.target.result);
                        tx.onerror = (e) => resolve(null);
                    });
                } catch(e) { console.error("Error saving exam result", e); }
            }

            async saveExamAttempt({ attemptId, summary, performanceRows }) {
                if (!attemptId || !Array.isArray(performanceRows)) throw new Error('Invalid exam attempt.');
                await this.ensureReady();
                const savedId = await new Promise((resolve, reject) => {
                    let resultId;
                    const tx = this.db.transaction(['examHistory', 'performance'], 'readwrite');
                    tx.oncomplete = () => resolve(resultId);
                    tx.onerror = () => reject(tx.error || new Error('Exam results could not be saved.'));
                    tx.onabort = () => reject(tx.error || new Error('Exam results were not saved.'));
                    const history = tx.objectStore('examHistory');
                    const lookup = history.getAll();
                    lookup.onsuccess = () => {
                        try {
                            const existing = (lookup.result || []).find(row => row.attemptId === attemptId);
                            if (existing) { resultId = existing.id; return; }
                            const insert = history.add({ ...summary, attemptId });
                            insert.onsuccess = () => { resultId = insert.result; };
                            const performance = tx.objectStore('performance');
                            for (const row of performanceRows) performance.add({ ...row, attemptId });
                        } catch (error) {
                            tx.abort();
                            reject(error);
                        }
                    };
                });
                this._invalidateCache(['examHistory', 'performance']);
                return savedId;
            }

            async getExamHistory() {
                await this.ensureReady();
                if (this._cacheValid.examHistory && this._cache.examHistory) return this._cache.examHistory;
                return new Promise(resolve => {
                    this.db.transaction('examHistory', 'readonly').objectStore('examHistory').getAll().onsuccess = (e) => {
                        this._cache.examHistory = (e.target.result || []).reverse();
                        this._cacheValid.examHistory = true;
                        resolve(this._cache.examHistory);
                    };
                });
            }

            async getSetting(key, def = null) {
                await this.ensureReady();
                return new Promise(resolve => {
                    const tx = this.db.transaction('settings', 'readonly');
                    tx.objectStore('settings').get(key).onsuccess = (e) => resolve(e.target.result ? e.target.result.value : def);
                });
            }

            async setSetting(key, value) {
                await this.ensureReady();
                return new Promise(resolve => {
                    this.db.transaction('settings', 'readwrite').objectStore('settings').put({ key, value });
                    resolve();
                });
            }

            // ============================================================
            //  Reconcile supplied metadata against the Dewhurst curriculum
            //  In-place field update only (get -> mutate -> put, same id).
            //  Never deletes or re-adds a question, so bookmarks, notes,
            //  highYield flags and exam/performance history - all keyed by
            //  question id, none of them by subject/chapter - are
            //  completely unaffected.
            //
            //  Idempotent and safe to call on every app start: a question
            //  is only ever touched once (gated on classificationStatus
            //  being unset), so questions imported later still get picked
            //  up on a future run without re-processing anything already
            //  migrated. No answers, explanations, source fields, tags,
            //  topic, or subtopic are read or written here.
            // ============================================================
            // Reconcile exact source metadata once per policy version; preserve row identities.
            async reconcileDewhurstClassification() {
                await this.ensureReady();
                const questions = await this.getAllQuestions();
                const report = { total: questions.length, classified: 0, subjectOnly: 0, unmapped: 0, alreadyDone: 0 };
                const pending = [];
                for (const original of questions) {
                    if (original.classificationPolicyVersion >= 2) { report.alreadyDone++; continue; }
                    const q = { ...original };
                    normalizeQuestionClassification(q);
                    if (CLASSIFICATION_MODE === 'admin') generateTopicSubtopic(q);
                    if (q.subject !== original.subject || q.chapter !== original.chapter) {
                        if (q.legacySubject == null) q.legacySubject = original.subject;
                        if (q.legacyChapter == null) q.legacyChapter = original.chapter;
                    }
                    if (isQuestionClassificationApproved(q)) report.classified++;
                    else if (!isGenericQuestionSubject(q.subject)) report.subjectOnly++;
                    else report.unmapped++;
                    pending.push(q);
                }
                if (!pending.length) return report;
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction('questions', 'readwrite');
                    pending.forEach(q => tx.objectStore('questions').put(q));
                    tx.oncomplete = () => { this._invalidateCache(); resolve(report); };
                    tx.onerror = () => reject(tx.error);
                    tx.onabort = () => reject(tx.error);
                });
            }

            // AUTO-CATEGORIZATION ENABLED BULK IMPORT
            async bulkImport(questions, groupName = '') {
                questions = prepareQuestionAnswers(questions);
                this._invalidateCache(); // full invalidation on bulk import
                await this.ensureReady();
                const existingQuestions = await this.getAllQuestions();
                const existingSet = new Set(
                    existingQuestions.map(e => ((e.questionText||'').replace(/\s+/g,' ').replace(/[^a-z0-9 ]/gi,'').trim().toLowerCase()))
                );
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction('questions', 'readwrite');
                    const store = tx.objectStore('questions');
                    let count = 0;
                    for (const q of questions) {
                        normalizeQuestionClassification(q);
                        generateTopicSubtopic(q);
                        q.dateAdded = q.dateAdded || new Date().toISOString();
                        q.tags = q.tags || [];
                        if (groupName && !q.book) q.book = groupName;
                        if (groupName && !q.group) q.group = groupName;
                        if (!q.group) q.group = '';

                        const normalizedNew = (q.questionText||'').replace(/\s+/g,' ').replace(/[^a-z0-9 ]/gi,'').trim().toLowerCase();
                        let duplicate = false;
                        try {
                            duplicate = existingSet.has(normalizedNew);
                            if (!duplicate) {
                                existingSet.add(normalizedNew);
                                store.add(q);
                                count++;
                            }
                        } catch(err) {
                            store.add(q);
                            count++;
                        }
                    }
                    tx.oncomplete = () => { this._invalidateCache(); resolve(count); };
                    tx.onerror = () => reject(tx.error);
                });
            }

            async deleteQuestionsByGroup(groupName) {
                this._invalidateCache(['questions', 'groups', 'books', 'bookmarks', 'highYield']);
                await this.ensureReady();
                const questions = await this.getAllQuestions();
                const targets = questions.filter(q => (q.group||'') === groupName);
                for (const q of targets) {
                    await this.deleteQuestion(q.id);
                }
                return targets.length;
            }

            async deleteQuestionsByBook(bookName) {
                this._invalidateCache(['questions', 'groups', 'books', 'bookmarks', 'highYield']);
                await this.ensureReady();
                const questions = await this.getAllQuestions();
                const targets = questions.filter(q => (q.book || '') === bookName);
                for (const q of targets) {
                    await this.deleteQuestion(q.id);
                }
                return targets.length;
            }

            async clearAllQuestions() {
                this._invalidateCache();
                await this.ensureReady();
                return new Promise(resolve => {
                    const tx = this.db.transaction(['questions', 'bookmarks', 'notes', 'examHistory','performance','highYield'], 'readwrite');
                    tx.objectStore('questions').clear();
                    tx.objectStore('bookmarks').clear();
                    tx.objectStore('notes').clear();
                    tx.objectStore('examHistory').clear();
                    tx.objectStore('performance').clear();
                    tx.objectStore('highYield').clear();
                    tx.oncomplete = () => resolve();
                });
            }

            async exportAllData() {
                await this.ensureReady();
                const stores = ['questions','examHistory','bookmarks','notes','performance','highYield','lectures','settings','flashcards','bookMeta','assets'].filter(s => this.db.objectStoreNames.contains(s));
                const data = await new Promise((resolve,reject) => {
                    const tx = this.db.transaction(stores,'readonly'), result = {};
                    for (const s of stores) tx.objectStore(s).getAll().onsuccess = e => { result[s] = e.target.result || []; };
                    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
                });
                data.assets = await QuestionImages.serializeAssets(data.assets || []);
                return { bankId: 'ayla-gyno', app: 'AYLA GYNO', version: DB_VERSION, imageBackupVersion: 1, exportedAt: new Date().toISOString(), ...data };
            }

            async clearAndRestore(data) { return this.restoreSnapshotData(data); }

            // Used by the explicit backup/restore flow and package rollback in both editions.
            async restoreSnapshotData(data) {
                await this.ensureReady();
                if (!data || typeof data !== 'object' || !Array.isArray(data.questions)) throw new Error('Invalid backup question data.');
                if (data.bankId !== 'ayla-gyno') throw new Error('This backup belongs to another application. Select an AYLA GYNO backup.');
                const stores = ['questions','examHistory','bookmarks','notes','performance','highYield','lectures','settings','flashcards','bookMeta','assets'].filter(s => this.db.objectStoreNames.contains(s) && (s !== 'settings' || Array.isArray(data.settings)));
                const prepared = {};
                for (const s of stores) { if (data[s] != null && !Array.isArray(data[s])) throw new Error('Invalid backup store: '+s); prepared[s] = (data[s] || []).map(row => typeof row === 'object' && row ? { ...row } : row); }
                prepared.assets = await QuestionImages.deserializeAssets(data.assets || []);
                prepared.bookmarks = (data.bookmarks || []).map(row => typeof row === 'number' ? { questionId: row } : { ...row });
                const assets = new Map(prepared.assets.map(a => [a.assetKey,a]));
                for (const q of prepared.questions) {
                    if (!q || typeof q !== 'object') throw new Error('Invalid backup question.');
                    if (!q.images) continue;
                    await QuestionImages.validateDrafts(q.images);
                    for (const image of QuestionImages.descriptors(q)) {
                        const asset = assets.get(q.uid+'::'+image.path);
                        if (!asset) throw new Error('The backup is missing an attached question image.');
                        await QuestionImages.validateImageBlob(asset.blob,image);
                    }
                }
                await new Promise((resolve,reject) => {
                    const tx = this.db.transaction(stores,'readwrite');
                    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
                    try { for (const s of stores) { const store=tx.objectStore(s); store.clear(); for (const row of prepared[s] || []) store.put(row); } }
                    catch(e) { tx.abort(); reject(e); }
                });
                this._invalidateCache();
            }

            async getAllGroups() {
                await this.ensureReady();
                if (this._cacheValid.groups && this._cache.groups) return this._cache.groups;
                const qs = await this.getAllQuestions();
                const groups = new Set();
                qs.forEach(q => { if (q.group) groups.add(q.group); });
                this._cache.groups = [...groups].sort();
                this._cacheValid.groups = true;
                return this._cache.groups;
            }

            async getAllBooks() {
                await this.ensureReady();
                if (this._cacheValid.books && this._cache.books) return this._cache.books;
                const qs = await this.getAllQuestions();
                const books = new Set();
                qs.forEach(q => { if (q.book) books.add(q.book); });
                this._cache.books = [...books].sort();
                this._cacheValid.books = true;
                return this._cache.books;
            }

            async recordPerformance(r) {
                this._invalidateCache(['performance']);
                await this.ensureReady();
                return new Promise(resolve => {
                    const tx = this.db.transaction('performance','readwrite');
                    tx.objectStore('performance').add(r);
                    tx.oncomplete = () => resolve();
                });
            }

            async getPerformance() {
                await this.ensureReady();
                if (this._cacheValid.performance && this._cache.performance) return this._cache.performance;
                return new Promise(resolve => {
                    this.db.transaction('performance','readonly')
                        .objectStore('performance')
                        .getAll().onsuccess = e => {
                            this._cache.performance = e.target.result || [];
                            this._cacheValid.performance = true;
                            resolve(this._cache.performance);
                        };
                });
            }

            async toggleHighYield(qid) {
                this._invalidateCache(['highYield']);
                await this.ensureReady();
                return new Promise(resolve => {
                    const store = this.db.transaction('highYield','readwrite').objectStore('highYield');
                    const req = store.get(qid);
                    req.onsuccess = () => {
                        if (req.result) { store.delete(qid); resolve(false); }
                        else { store.put({questionId: qid, dateAdded:new Date().toISOString()}); resolve(true); }
                    };
                });
            }

            async getAllHighYieldIds() {
                await this.ensureReady();
                if (this._cacheValid.highYield && this._cache.highYield) return this._cache.highYield;
                return new Promise(resolve => {
                    this.db.transaction('highYield','readonly').objectStore('highYield')
                    .getAll().onsuccess = e => {
                        this._cache.highYield = (e.target.result||[]).map(x=>x.questionId);
                        this._cacheValid.highYield = true;
                        resolve(this._cache.highYield);
                    };
                });
            }

            // --- LECTURES ---
            async addLecture(l) {
                this._invalidateCache(['lectures']);
                await this.ensureReady();
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction('lectures', 'readwrite');
                    l.dateAdded = new Date().toISOString();
                    const req = tx.objectStore('lectures').add(l);
                    req.onsuccess = e => resolve(e.target.result);
                    req.onerror = e => reject(e.target.error);
                });
            }

            async getAllLectures() {
                await this.ensureReady();
                if (this._cacheValid.lectures && this._cache.lectures) return this._cache.lectures;
                return new Promise(resolve => {
                    this.db.transaction('lectures', 'readonly').objectStore('lectures').getAll().onsuccess = e => {
                        this._cache.lectures = e.target.result || [];
                        this._cacheValid.lectures = true;
                        resolve(this._cache.lectures);
                    };
                });
            }

            async getLecture(id) {
                await this.ensureReady();
                return new Promise(resolve => {
                    this.db.transaction('lectures', 'readonly').objectStore('lectures').get(id).onsuccess = e => resolve(e.target.result);
                });
            }

            async deleteLecture(id) {
                this._invalidateCache(['lectures']);
                await this.ensureReady();
                return new Promise(resolve => {
                    this.db.transaction('lectures', 'readwrite').objectStore('lectures').delete(id);
                    resolve();
                });
            }

            async updateLecture(id, data) {
                this._invalidateCache(['lectures']);
                await this.ensureReady();
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction('lectures', 'readwrite');
                    const store = tx.objectStore('lectures');
                    const getReq = store.get(id);
                    getReq.onsuccess = () => {
                        const l = getReq.result;
                        if (!l) { resolve(false); return; }
                        Object.assign(l, data, { updatedAt: new Date().toISOString() });
                        store.put(l);
                        resolve(true);
                    };
                    getReq.onerror = () => reject(getReq.error);
                });
            }
        }

const db = new ENTDatabase();

        // RBAC: Wrap destructive DB operations
        (function() {
            const wrapAdmin = (fn, name) => {
                return async function(...args) {
                    if (!RBAC.isAdmin()) {
                        showToast('Admin access required.', 'error');
                        if (name === 'bulkImport') return 0;
                        if (name === 'addQuestion') return null;
                        return;
                    }
                    return fn.apply(this, args);
                };
            };
            db.bulkImport = wrapAdmin(db.bulkImport, 'bulkImport');
            db.addQuestion = wrapAdmin(db.addQuestion, 'addQuestion');
            db.deleteQuestion = wrapAdmin(db.deleteQuestion, 'deleteQuestion');
            db.clearAllQuestions = wrapAdmin(db.clearAllQuestions, 'clearAllQuestions');
            db.clearAndRestore = wrapAdmin(db.clearAndRestore, 'clearAndRestore');
            db.deleteQuestionsByGroup = wrapAdmin(db.deleteQuestionsByGroup, 'deleteQuestionsByGroup');
            db.deleteQuestionsByBook = wrapAdmin(db.deleteQuestionsByBook, 'deleteQuestionsByBook');
            db.addLecture = wrapAdmin(db.addLecture, 'addLecture');
            db.deleteLecture = wrapAdmin(db.deleteLecture, 'deleteLecture');
            db.updateLecture = wrapAdmin(db.updateLecture, 'updateLecture');
        })();

// STEP 6 TAXONOMY ENGINE
const ENT_TAXONOMY = {};

// Scientific reference metadata is separate from the question's book/group bucket.
function questionReferenceText(value) {
    if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function getQuestionReference(question) {
    const q = question && typeof question === 'object' && !Array.isArray(question) ? question : {};
    const text = value => {
        if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        return '';
    };
    const has = field => Object.prototype.hasOwnProperty.call(q, field);
    const legacy = q.reference && typeof q.reference === 'object' && !Array.isArray(q.reference) ? q.reference : {};
    const firstText = values => {
        for (const value of values) {
            const candidate = text(value);
            if (candidate) return candidate;
        }
        return '';
    };
    // An explicitly empty canonical field is an intentional clearing, not a request for fallback.
    const name = has('referenceName') ? text(q.referenceName)
        : firstText([typeof q.reference === 'string' || typeof q.reference === 'number' ? q.reference : '', legacy.name, legacy.book, legacy.title]);
    const edition = has('referenceEdition') ? text(q.referenceEdition)
        : firstText([legacy.edition, q.edition]);
    const page = has('referencePage') ? text(q.referencePage)
        : firstText([legacy.page, legacy.pageNumber, q.pageNumber, q.page]);
    return { name, edition, page, complete: !!(name && edition && page), hasAny: !!(name || edition || page) };
}

function hasCompleteQuestionReference(question) {
    return getQuestionReference(question).complete;
}

function normalizeQuestionReferenceMetadata(question) {
    if (!question || typeof question !== 'object' || Array.isArray(question)) return question;
    const supplied = ['referenceName', 'referenceEdition', 'referencePage', 'reference']
        .some(field => Object.prototype.hasOwnProperty.call(question, field));
    if (!supplied) return question;
    // A supplied citation replaces the whole citation snapshot, so no older component leaks through a merge.
    const reference = getQuestionReference(question);
    question.referenceName = reference.name;
    question.referenceEdition = reference.edition;
    question.referencePage = reference.page;
    return question;
}

function questionReferenceEscape(value) {
    return questionReferenceText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderQuestionReference(question, { admin = false } = {}) {
    const reference = getQuestionReference(question);
    if (!reference.hasAny && !admin) return '';
    const parts = [];
    if (reference.name) parts.push(`<span class="question-reference-name">${questionReferenceEscape(reference.name)}</span>`);
    if (reference.edition) parts.push(`<span class="question-reference-edition">Edition: ${questionReferenceEscape(reference.edition)}</span>`);
    if (reference.page) parts.push(`<span class="question-reference-page">Page: ${questionReferenceEscape(reference.page)}</span>`);
    const missing = admin && !reference.complete
        ? '<span class="badge badge-warning" style="margin-inline-start:8px;">Reference incomplete</span>' : '';
    return `<div class="question-reference" style="margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;overflow-wrap:anywhere;">
        <strong>Reference</strong>${missing}
        <div style="display:flex;gap:6px 12px;flex-wrap:wrap;margin-top:5px;">${parts.length ? parts.join('') : '<span>Reference not documented.</span>'}</div>
    </div>`;
}

function renderQuestionBookLocation(question) {
    const book = questionReferenceText(question && question.book);
    return book ? `<div class="question-book-location" style="margin-top:10px;font-size:0.75rem;color:var(--text2);">Book / group: ${questionReferenceEscape(book)}</div>` : '';
}

// Question images are immutable local raster assets, separate from question text.
const QuestionImages = (() => {
    const LIMITS = Object.freeze({ inputBytes: 20 * 1024 * 1024, outputBytes: 2 * 1024 * 1024, pixels: 20000000, side: 2048, perRole: 4 });
    const roles = new Set(['question', 'explanation']);
    const ownedUrls = new Map();
    let editor = null, viewer = null, opening = false, closingHistory = false, observerQueued = false;
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    function safePath(path) {
        return typeof path === 'string' && path.length <= 180 && /^(?:images\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:png|jpe?g|webp)$/i.test(path) && !path.includes('..');
    }
    function descriptors(q) {
        if (!q || !Array.isArray(q.images)) return [];
        return q.images.map(img => typeof img === 'string' ? { path: img, role: 'question' } : img)
            .filter(img => img && typeof img === 'object' && safePath(img.path) && (!img.role || roles.has(img.role)))
            .map(img => ({ ...img, role: img.role || 'question', caption: typeof img.caption === 'string' ? img.caption.slice(0, 500) : '' }));
    }
    async function rasterMime(blob) {
        if (!(blob instanceof Blob) || !blob.size || blob.size > 5 * 1024 * 1024) throw Error('Invalid image size.');
        const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
        if (b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v)) return 'image/png';
        if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
        if (b.length >= 12 && String.fromCharCode(...b.slice(0,4)) === 'RIFF' && String.fromCharCode(...b.slice(8,12)) === 'WEBP') return 'image/webp';
        throw Error('Choose a PNG, JPEG or WebP image.');
    }
    async function decode(blob) {
        const url = URL.createObjectURL(blob);
        try {
            const image = new Image();
            await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(Error('This image could not be opened.')); image.src = url; });
            if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > LIMITS.pixels) throw Error('Image dimensions exceed 20 million pixels.');
            return image;
        } finally { URL.revokeObjectURL(url); }
    }
    async function prepareFile(file, role = 'question') {
        if (!roles.has(role)) throw Error('Invalid image location.');
        if (!(file instanceof Blob) || !file.size || file.size > LIMITS.inputBytes) throw Error('Choose an image smaller than 20 MB.');
        // Sniff before decoding. Larger originals are accepted only for compression here.
        await rasterMime(file.size <= 5 * 1024 * 1024 ? file : file.slice(0,16));
        if (file.type && !['image/png','image/jpeg','image/webp'].includes(file.type.toLowerCase())) throw Error('Choose a PNG, JPEG or WebP image.');
        const image = await decode(file);
        let scale = Math.min(1, LIMITS.side / Math.max(image.naturalWidth,image.naturalHeight));
        const canvas = document.createElement('canvas');
        let blob;
        for (let attempt=0; attempt<5; attempt++) {
            canvas.width = Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
            const ctx=canvas.getContext('2d');
            if (!ctx) throw Error('Image processing is not available in this browser.');
            ctx.drawImage(image,0,0,canvas.width,canvas.height);
            blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9-attempt*.07));
            if (blob && blob.size <= LIMITS.outputBytes) break;
            scale *= .8;
        }
        if (!blob || blob.size > LIMITS.outputBytes) throw Error('This image is too large after compression. Choose a smaller image.');
        const mime=await rasterMime(blob), ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[mime];
        return { descriptor: { path:'images/'+uid()+'.'+ext, role, caption:'', mime, width:canvas.width, height:canvas.height, size:blob.size }, blob };
    }
    async function validateImageBlob(blob,descriptor={}) {
        const mime=await rasterMime(blob), image=await decode(blob);
        if(descriptor.mime && descriptor.mime!==mime)throw Error('Image type does not match its metadata.');
        if(descriptor.width && descriptor.width!==image.naturalWidth)throw Error('Image width does not match its metadata.');
        if(descriptor.height && descriptor.height!==image.naturalHeight)throw Error('Image height does not match its metadata.');
        return {mime,width:image.naturalWidth,height:image.naturalHeight};
    }
    async function readAsset(questionUid,path) {
        if (!questionUid || !safePath(path)) return null;
        await db.ensureReady();
        return new Promise((resolve,reject) => {
            const request=db.db.transaction('assets','readonly').objectStore('assets').get(questionUid+'::'+path);
            request.onsuccess=()=>resolve(request.result || null); request.onerror=()=>reject(request.error);
        });
    }
    function render(q,role='question') {
        const images=descriptors(q).filter(img=>img.role===role);
        if (!images.length) return '';
        return `<div class="question-images" data-image-role="${role}" aria-label="${role==='question'?'Question images':'Explanation images'}">${images.map((img,i)=>
            `<figure class="question-image"><button type="button" class="question-image-open" aria-label="Enlarge ${role} image ${i+1}" disabled><span class="question-image-message">Loading image…</span><img data-image-uid="${esc(q.uid || '')}" data-image-path="${esc(img.path)}" alt="${esc(img.caption || (role==='question'?'Question':'Explanation')+' image '+(i+1))}" hidden decoding="async"></button><figcaption>${esc(img.caption || (role==='question'?'Question':'Explanation')+' image '+(i+1))}<span class="image-enlarge-hint"> · Tap to enlarge</span></figcaption></figure>`
        ).join('')}</div>`;
    }
    function releaseNode(node) { const url=ownedUrls.get(node); if(url){URL.revokeObjectURL(url);ownedUrls.delete(node);} }
    async function hydrate(root=document) {
        const nodes=[...root.querySelectorAll('img[data-image-path]:not([data-image-loading])')];
        await Promise.all(nodes.map(async image=>{
            image.dataset.imageLoading='true';
            const button=image.closest('.question-image-open'), message=button && button.querySelector('.question-image-message');
            try {
                const record=await readAsset(image.dataset.imageUid,image.dataset.imagePath);
                if (!record || !(record.blob instanceof Blob)) throw Error('Image not available on this device.');
                const mime=await rasterMime(record.blob);
                if(!image.isConnected) return;
                const url=URL.createObjectURL(record.blob.type===mime?record.blob:record.blob.slice(0,record.blob.size,mime));
                ownedUrls.set(image,url);
                image.onload=()=>{ if(!image.isConnected){releaseNode(image);return;} image.hidden=false; if(message)message.hidden=true; if(button)button.disabled=false; };
                image.onerror=()=>{releaseNode(image);if(message)message.textContent='Image could not be displayed.';};
                image.src=url;
            } catch(e) { if(message)message.textContent='Image unavailable. Re-import its update package.'; }
        }));
    }
    function closeViewer(fromPop=false) {
        if(!viewer) return;
        const old=viewer; viewer=null;
        if(old.onResize)window.removeEventListener('resize',old.onResize);
        old.root.remove(); URL.revokeObjectURL(old.url); document.body.style.overflow=old.overflow;
        if(old.focus && old.focus.isConnected) old.focus.focus({preventScroll:true});
        if(!fromPop && history.state && history.state.questionImageViewer) {closingHistory=true;history.back();}
    }
    async function openViewer(button) {
        if(viewer || opening || closingHistory || button.disabled) return;
        opening=true;
        try {
        const thumbnail=button.querySelector('img');
        const record=await readAsset(thumbnail.dataset.imageUid,thumbnail.dataset.imagePath);
        if(!record || !button.isConnected) return;
        const mime=await rasterMime(record.blob);
        if(viewer || !button.isConnected) return;
        const url=URL.createObjectURL(record.blob.slice(0,record.blob.size,mime));
        const root=document.createElement('div');
        root.id='questionImageViewer'; root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label','Image viewer');
        root.innerHTML=`<div class="image-viewer-toolbar"><span>Image</span><div><button type="button" class="btn btn-sm btn-outline" data-image-zoom="out" aria-label="Zoom out">${uiIcon("zoom-out")}</button><button type="button" class="btn btn-sm btn-outline" data-image-zoom="reset">Fit</button><button type="button" class="btn btn-sm btn-outline" data-image-zoom="in" aria-label="Zoom in">${uiIcon("zoom-in")}</button><button type="button" class="btn btn-sm btn-primary" id="closeQuestionImageViewer" aria-label="Close image viewer">${uiIcon("close")} Close</button></div></div><div class="image-viewer-scroll" tabindex="0"><img alt=""></div><div class="image-viewer-caption"></div>`;
        root.querySelector('img').alt=thumbnail.alt; root.querySelector('.image-viewer-caption').textContent=thumbnail.alt;
        const state={root,url,focus:button,overflow:document.body.style.overflow,scale:1,base:0};
        viewer=state; document.body.style.overflow='hidden'; document.body.appendChild(root);
        const img=root.querySelector('img'), scroll=root.querySelector('.image-viewer-scroll');
        const fit=()=>{state.base=Math.max(1,Math.min(img.naturalWidth,scroll.clientWidth-24,(scroll.clientHeight-24)*img.naturalWidth/img.naturalHeight));img.style.width=Math.round(state.base*state.scale)+'px';};
        state.onResize=fit;window.addEventListener('resize',fit);
        img.onload=fit; img.src=url;
        root.querySelector('#closeQuestionImageViewer').onclick=()=>closeViewer();
        root.querySelectorAll('[data-image-zoom]').forEach(b=>b.onclick=()=>{state.scale=b.dataset.imageZoom==='reset'?1:Math.max(1,Math.min(4,state.scale+(b.dataset.imageZoom==='in'?.5:-.5)));fit();});
        root.addEventListener('keydown',e=>{
            if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeViewer();}
            if(e.key==='Tab'){
                const focusable=[...root.querySelectorAll('button,[tabindex="0"]')], first=focusable[0],last=focusable.at(-1);
                if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
                else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
            }
        });
        history.pushState({...history.state,questionImageViewer:true},'',location.href);
        root.querySelector('#closeQuestionImageViewer').focus();
        } finally { opening=false; }
    }
    function mountEditor(question,root) {
        if(editor)editor.destroy();
        const entries=descriptors(question || {}).map(descriptor=>({descriptor:{...descriptor},blob:null,url:null}));
        const state={root,entries,pending:0,destroyed:false,generation:0,marker:root.querySelector('#imageEditor')};
        const active=()=>!state.destroyed && root.isConnected && document.getElementById('modalContent')===root && !document.getElementById('modalOverlay').classList.contains('hidden') && root.querySelector('#imageEditor')===state.marker;
        function destroy(){state.destroyed=true;state.generation++;for(const e of entries){if(e.url)URL.revokeObjectURL(e.url);e.url=null;}if(editor===api)editor=null;}
        function status(text,error=false){const area=root.querySelector('#imageEditorStatus');if(area){area.textContent=text;area.classList.toggle('image-editor-error',error);}}
        function draw(){
            if(!active())return;
            for(const role of roles){
                const area=root.querySelector(`[data-image-previews="${role}"]`); area.innerHTML='';
                for(const entry of entries.filter(e=>e.descriptor.role===role)){
                    const card=document.createElement('div');card.className='image-editor-card';card.dataset.imageRole=role;
                    const img=document.createElement('img');img.alt=entry.descriptor.caption || 'Attached image';
                    if(entry.url)img.src=entry.url;
                    else readAsset(question && question.uid,entry.descriptor.path).then(async rec=>{if(!rec || !active() || !card.isConnected)return;await rasterMime(rec.blob);if(!active()||!card.isConnected)return;entry.url=URL.createObjectURL(rec.blob);img.src=entry.url;}).catch(()=>{img.alt='Image unavailable';});
                    const label=document.createElement('label');label.textContent='Caption / description';
                    const caption=document.createElement('input');caption.type='text';caption.maxLength=500;caption.value=entry.descriptor.caption || '';caption.setAttribute('aria-label','Image caption');caption.oninput=()=>entry.descriptor.caption=caption.value;
                    const remove=document.createElement('button');remove.type='button';remove.className='btn btn-sm btn-danger';remove.dataset.imageRemove=entry.descriptor.path;remove.textContent='Remove image';remove.onclick=()=>{const i=entries.indexOf(entry);if(i>=0)entries.splice(i,1);if(entry.url)URL.revokeObjectURL(entry.url);entry.url=null;draw();};
                    card.append(img,label,caption,remove);area.appendChild(card);
                }
            }
            const save=root.querySelector('#saveQuestionBtn');if(save)save.disabled=state.pending>0;
            root.querySelectorAll('#addQuestionImages,#addExplanationImages').forEach(input=>input.disabled=state.pending>0);
        }
        async function attach(input,role){
            const files=[...input.files];input.value='';
            if(!active()||!files.length||state.pending)return;
            if(entries.filter(e=>e.descriptor.role===role).length+files.length>LIMITS.perRole){status('Add up to 4 images for the question and 4 for its explanation.',true);return;}
            const generation=state.generation;state.pending++;draw();status('Preparing images…');
            try{
                const prepared=[];
                for(const file of files){prepared.push(await prepareFile(file,role));if(!active()||state.generation!==generation)return;}
                for(const item of prepared)entries.push({...item,url:URL.createObjectURL(item.blob)});
                status('Images ready. They will be saved with this question.');
            }catch(e){if(active())status(e.message || 'Image could not be prepared.',true);}
            finally{state.pending--;if(active())draw();}
        }
        const api={entries,get busy(){return state.pending>0;},active,images:()=>entries.map(e=>({...e.descriptor})),assets:()=>entries.filter(e=>e.blob).map(e=>({path:e.descriptor.path,blob:e.blob})),destroy};
        editor=api;
        root.querySelector('#addQuestionImages').onchange=e=>attach(e.target,'question');
        root.querySelector('#addExplanationImages').onchange=e=>attach(e.target,'explanation');
        draw();return api;
    }
    function editorMarkup(){return `<fieldset id="imageEditor" class="image-editor"><legend>Images</legend><p>PNG, JPEG or WebP · up to 4 images per section. Images are resized for offline use.</p><label for="addQuestionImages">Question images — shown while answering</label><input id="addQuestionImages" type="file" accept="image/png,image/jpeg,image/webp" multiple><div class="image-editor-previews" data-image-previews="question"></div><label for="addExplanationImages">Explanation images — shown after revealing the answer</label><input id="addExplanationImages" type="file" accept="image/png,image/jpeg,image/webp" multiple><div class="image-editor-previews" data-image-previews="explanation"></div><p id="imageEditorStatus" role="status" aria-live="polite"></p></fieldset>`;}
    async function validateDrafts(images,assets=[]) {
        if(!Array.isArray(images) || images.length>8 || descriptors({images}).length!==images.length)throw Error('Invalid question image metadata.');
        for(const role of roles)if(descriptors({images}).filter(x=>x.role===role).length>LIMITS.perRole)throw Error('Too many images in one section.');
        const paths=new Set();for(const img of images){const path=typeof img==='string'?img:img.path;if(paths.has(path))throw Error('Repeated image path.');paths.add(path);}
        const assetPaths=new Set();
        for(const a of assets){if(!a||!paths.has(a.path)||!(a.blob instanceof Blob)||assetPaths.has(a.path))throw Error('Invalid image attachment.');assetPaths.add(a.path);await validateImageBlob(a.blob,descriptors({images}).find(img=>img.path===a.path));}
    }
    async function validateReferences(questionUid,images,assets=[]) {
        const additions=new Map(assets.map(a=>[a.path,a.blob]));
        for(const image of descriptors({images})){
            const existing=await readAsset(questionUid,image.path), fresh=additions.get(image.path);
            if(!fresh && (!existing || !(existing.blob instanceof Blob)))throw Error('An attached image is missing. Remove it or re-import its update package.');
            if(fresh && existing && existing.blob instanceof Blob){
                const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).join(',');
                if(await digest(fresh)!==await digest(existing.blob))throw Error('A replacement image must use a new image path.');
            }
            if(!fresh)await validateImageBlob(existing.blob,image);
        }
    }
    async function serializeAssets(rows){
        return Promise.all(rows.map(async rec=>{
            if(!(rec.blob instanceof Blob)){
                if(rec.blobDataUrl)return {...rec};
                throw Error('An image asset could not be backed up.');
            }
            const blobDataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(rec.blob);});
            const out={...rec,blobDataUrl};delete out.blob;return out;
        }));
    }
    async function deserializeAssets(rows){
        if(!Array.isArray(rows))throw Error('Invalid backup assets.');
        return Promise.all(rows.map(async rec=>{
            if(!rec||typeof rec.assetKey!=='string')throw Error('Invalid backup asset key.');
            if(rec.blob instanceof Blob)return {...rec};
            if(typeof rec.blobDataUrl!=='string')throw Error('Missing image bytes in backup.');
            const m=/^data:([a-zA-Z0-9.+/-]*);base64,([a-zA-Z0-9+/=\s]*)$/.exec(rec.blobDataUrl);
            if(!m)throw Error('Invalid backup image data.');
            let raw;try{raw=atob(m[2]);}catch{throw Error('Invalid backup image data.');}
            const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)), out={...rec,blob:new Blob([bytes],{type:m[1]||'application/octet-stream'})};delete out.blobDataUrl;return out;
        }));
    }
    function initialize(){
        document.addEventListener('click',e=>{const button=e.target.closest('.question-image-open');if(button&&!button.disabled)openViewer(button).catch(()=>showToast('Image could not be opened.','error'));});
        window.addEventListener('popstate',e=>{if(closingHistory){closingHistory=false;e.stopImmediatePropagation();return;}if(viewer){closeViewer(true);e.stopImmediatePropagation();}},true);
        new MutationObserver(records=>{
            if(editor&&!editor.active())editor.destroy();
            for(const [node] of ownedUrls)if(!node.isConnected)releaseNode(node);
            if(!records.some(r=>r.type==='childList'&&r.addedNodes.length)||observerQueued)return;
            observerQueued=true;queueMicrotask(()=>{observerQueued=false;hydrate().catch(()=>{});});
        }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
        window.addEventListener('pagehide',e=>{if(e.persisted)return;for(const [node]of ownedUrls)releaseNode(node);if(editor)editor.destroy();if(viewer)closeViewer(true);});
    }
    initialize();
    return {LIMITS,newUid:uid,safePath,descriptors,rasterMime,validateImageBlob,prepareFile,readAsset,render,hydrate,mountEditor,editorMarkup,validateDrafts,validateReferences,serializeAssets,deserializeAssets,closeViewer,get editor(){return editor;}};
})();


const CLASSIFICATION_MODE = 'student';
// Classification policy v2: the admin approves suggestions; students only consume metadata.
function questionClassificationKey(value) {
    return String(value == null ? '' : value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function isGenericQuestionSubject(value) {
    return ['', 'ayla', 'ayla gyno', 'obgyn', 'ob gyn', 'general', 'unknown', 'unclassified', 'uncategorized', 'uncategorised',
        'all', 'all subjects', 'obstetrics and gynaecology', 'obstetrics and gynecology',
        'عام', 'العام', 'غير مصنف', 'غير مصنفة', 'غير محدد', 'غير محددة', 'كل التخصصات'].includes(questionClassificationKey(value));
}
function isGenericQuestionChapter(value) {
    return isGenericQuestionSubject(value) || ['all chapters', 'كل الفصول', 'الفصل العام'].includes(questionClassificationKey(value));
}
function isQuestionClassificationApproved(q) {
    return !!q && !isGenericQuestionSubject(q.subject) && !isGenericQuestionChapter(q.chapter)
        && q.classificationApproved === true && q.classificationStatus === 'classified'
        && q.needsReview !== true && q.classificationInferred !== true;
}
// JSON's flat labels are authoritative. Reading/importing a question must never
// replace them using question text, aliases, nested labels or stale stable IDs.
function normalizeQuestionClassification(q, { approve = false } = {}) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return q;
    const clean=value=>typeof value==='string'?value.trim():'';
    const nested=q.classification&&typeof q.classification==='object'&&!Array.isArray(q.classification)?q.classification:null;
    if(nested)for(const field of ['classificationInferred','classificationApproved','classificationSource','classificationStatus','needsReview'])if(q[field]==null&&nested[field]!=null)q[field]=nested[field];
    q.subject=clean(q.subject)||'Uncategorized';q.chapter=clean(q.chapter)||'General';q.topic=clean(q.topic)||'General';q.subtopic=clean(q.subtopic);
    const {subject,chapter}=aylaFindBranch(q.subject,q.chapter);
    if(subject)q.subject=subject.name;
    if(chapter)q.chapter=chapter.name;
    const sourceTopic=chapter&&chapter.topics.find(t=>questionClassificationKey(t.name)===questionClassificationKey(q.topic));
    if(sourceTopic)q.topic=sourceTopic.name;
    q.subjectId=subject?subject.id:null;q.chapterId=chapter?chapter.id:null;q.chapterNumber=chapter?chapter.number:null;q.partId=chapter?chapter.part.id:null;
    const unresolved=!subject||!chapter||(q.topic!=='General'&&!sourceTopic);
    const manuallyApproved=CLASSIFICATION_MODE==='admin'&&approve===true&&!unresolved;
    const inferred=q.classificationInferred===true||['inferred','automatic','auto','suggested'].includes(q.classificationSource);
    const pending=inferred||q.classificationApproved===false||q.needsReview===true||q.classificationStatus==='needs_review';
    q.classificationInferred=manuallyApproved?false:inferred;q.needsReview=unresolved||(!manuallyApproved&&pending);q.classificationApproved=!q.needsReview;q.classificationStatus=q.needsReview?'needs_review':'classified';
    q.classificationSource=manuallyApproved?'manual':q.classificationInferred?'inferred':clean(q.classificationSource)||(q.needsReview?'unresolved':'metadata');
    q.classificationPolicyVersion=2;q.classificationRepairVersion=1;
    if(nested){q.classification={...nested};for(const field of ['subject','chapter','topic','subtopic','subjectId','chapterId','chapterNumber','partId','classificationInferred','classificationApproved','classificationStatus','classificationSource','classificationPolicyVersion','classificationRepairVersion','needsReview'])q.classification[field]=q[field];}
    return q;
}

// Reclassification uses supplied metadata and exact source aliases only.
// It never guesses a diagnosis, subject, topic, or subtopic from question prose.
function suggestQuestionClassification(q, options={}) { return normalizeQuestionClassification(q,options); }
function classifyQuestionAdvanced(q) { return normalizeQuestionClassification(q); }
function generateTopicSubtopic(q) { return normalizeQuestionClassification(q); }

// STEP 8 HIERARCHY ANALYTICS ENGINE
async function buildHierarchyStats(){
 const qs=await db.getAllQuestions();
 const tree={};
 qs.forEach(q=>{
   const s=q.subject||'Uncategorized';
   const c=q.chapter||'General';
   const t=q.topic||'General';
   const st=q.subtopic||'General';
   tree[s]??={};
   tree[s][c]??={};
   tree[s][c][t]??={};
   tree[s][c][t][st]=(tree[s][c][t][st]||0)+1;
 });
 return tree;
}

async function getQuestionsNeedingReview(){
 const qs=await db.getAllQuestions();
 return qs.filter(q=>q.needsReview);
}

// STEP 9 HIERARCHY MANAGEMENT UI

// STEP 10 ADVANCED ANALYTICS + DUPLICATE MANAGER
async function scanDuplicateQuestions(){
 const qs=await db.getAllQuestions();
 const map={}, dup=[];
 qs.forEach(q=>{
   const key=(q.questionText||'').toLowerCase().trim();
   if(map[key]) dup.push(q);
   else map[key]=1;
 });
 return dup;
}

async function generateSubjectAnalytics(){
 const qs=await db.getAllQuestions();
 const stats={};
 qs.forEach(q=>{
   const s=q.subject||'Unknown';
   stats[s]=(stats[s]||0)+1;
 });
 return stats;
}

// STEP 11 DASHBOARD + AI RECOMMENDATIONS
async function buildTopicHeatmap(){
 const qs=await db.getAllQuestions();
 const map={};
 qs.forEach(q=>{
   const k=q.topic||'General';
   map[k]=(map[k]||0)+1;
 });
 return map;
}

async function generateWeakAreaRecommendations(){
 const perf=await db.getPerformance();
 const result=[];
 perf.filter(x=>!x.correct).slice(0,20).forEach(x=>{
   result.push(`${x.subject||'Unknown'} > ${x.chapter||'Unknown'}`);
 });
 return [...new Set(result)];
}

// STEP 12 INTERACTIVE MANAGEMENT + READINESS ENGINE

async function renderBoardReadinessDashboard(){
 const perf=await db.getPerformance();
 const correct=perf.filter(x=>x.correct).length;
 const score=perf.length?Math.round(correct*100/perf.length):0;
 return `<div class="readiness-card"><h3>${uiIcon("target")} Board Readiness</h3><p>${score}% Ready</p></div>`;
}

// STEP 13 ADVANCED AI + EXAM CENTER

// STEP 14 PRODUCTION AI ENGINE

async function adaptiveExamEngine(){
 const perf=await db.getPerformance();
 return perf.filter(x=>!x.correct).length;
}

async function performanceForecastEngine(){
 const perf=await db.getPerformance();
 const acc=perf.length?Math.round((perf.filter(x=>x.correct).length*100)/perf.length):0;
 return `Projected Board Score: ${Math.min(acc+10,100)}%`;
}

// STEP 15 ENTERPRISE RELEASE ENGINE
async function fullBoardExamSimulator(){
 return {
   exams:['Iraqi Board','Arab Board','Mock Exam'],
   status:'enterprise-ready'
 };
}

async function smartQuestionSelector(){
 const perf=await db.getPerformance();
 return perf.filter(x=>!x.correct).slice(0,20);
}

// STEP 16 FINAL PROFESSIONAL BUILD

async function optimizeFor100kQuestions(){
 return {
   virtualization:true,
   indexedSearch:true,
   cacheEnabled:true
 };
}

// STEP 17 ULTIMATE PRODUCTION VERSION v5.0

async function iraqiBoardMockExam(){
 return {
   questions:150,
   timer:true,
   blueprint:'Obstetrics & Gynaecology Practice'
 };
}

// STEP 18 FINAL GOOGLE PLAY RELEASE v6.0
const PLAY_STORE_CONFIG={
 version:'6.0',
 release:'production',
 offline:true,
 pwa:true,
 installable:true
};

// STEP 19 NATIVE ANDROID WRAPPER + APK BUILDER
const ANDROID_BUILD_CONFIG={
 version:'7.0',
 target:'android',
 apk:true,
 aab:true,
 playStore:true
};

/* ===== Reclassification Engine v1 ===== */
async function updateQuestionClassification(questionId, subject, chapter, topic, subtopic, requireAdminCheck = true){
    if (CLASSIFICATION_MODE !== 'admin' || !RBAC.requireAdmin()) return false;
    await db.ensureReady();
    return new Promise((resolve,reject)=>{
        const tx = db.db.transaction('questions','readwrite');
        const store = tx.objectStore('questions');
        let updated = false;
        const getReq = store.get(questionId);
        getReq.onsuccess = ()=>{
            const q = getReq.result;
            if(!q) return;
            if (typeof subject === 'string') q.subject = subject;
            if (typeof chapter === 'string') q.chapter = chapter;
            if (typeof topic === 'string') q.topic = topic;
            if (typeof subtopic === 'string') q.subtopic = subtopic;

            // A human's new labels supersede stable IDs from the previous classification.
            q.subjectId = q.chapterId = q.chapterNumber = q.partId = null;
            normalizeQuestionClassification(q, { readNested: false, infer: false, approve: true });

            q.updatedAt = new Date().toISOString();
            store.put(q);
            updated = true;
        };
        getReq.onerror = ()=>reject(getReq.error);
        tx.oncomplete = () => { if (updated) db._invalidateCache(); resolve(updated); };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}


        // ============================================================
        //  APP STATE
        // ============================================================
        const AppState = {
            currentView: 'dashboard', darkMode: false,
            examInProgress: false, examShowResults: false,
            examQuestions: [], examAnswers: {}, examTimer: null,
            examTimeRemaining: 0, examStartTime: null, examEndsAt: null, examSuspended: false, examResultsPendingReview: false,
            examAttemptId: null, examSubmittedAt: null, _examSavePromise: null, _examSaveError: false,
            studyFilter: { book:'all', subject: 'all', chapter: 'all', topic: 'all', subtopic:'all', group: 'all', mode: 'practice', lectureId: null },
            questionFilters: { subject:'all', chapter:'all', topic:'all', difficulty:'all', special:'all' },
            searchQuery: '', lastExamResults: null,
            studyQuestions: null, studyIndex: 0, studyAnswers: {}, studyRevealed: {}, _examSaved:false,
            // OPTIMIZATION: hold references for virtual scroller and filtered sets
            _questionScroller: null,
            _lastFilteredQuestions: [],
            _lastFilterMeta: {}
        };
        // ============================================================
        //  RBAC — ROLE-BASED ACCESS CONTROL
        // ============================================================
        const RBAC = {
            role: 'student',
            init() {},
            isAdmin() { return false; },
            isStudent() { return true; },
            requireAdmin() { showToast('Admin access required.', 'error'); return false; },
            toggle() {}
        };

        function applyRoleVisibility() {
            const importNav = document.querySelector('.nav-item[data-view="import"]');
            if (importNav) importNav.style.display = RBAC.isAdmin() ? 'flex' : 'none';
            const adminNav = document.querySelector('.nav-item[data-view="admin"]');
            if (adminNav) adminNav.style.display = RBAC.isAdmin() ? 'flex' : 'none';
            const adminBtn = document.getElementById('btnAdminMode');
            if (adminBtn) {
                adminBtn.innerHTML = RBAC.isAdmin() ? (uiIcon("unlock")) : (uiIcon("lock"));
                adminBtn.title = RBAC.isAdmin() ? 'Admin Mode (click to logout)' : 'Admin Login';
            }
        }

        // ============================================================
        //  SESSION AUTO-SAVE / AUTO-RESTORE
        // ============================================================
        const SESSION_STORAGE_KEY = 'entMasterBank_session_v1';
        const SESSION_SCHEMA_VERSION = 1;
        const VALID_VIEWS = ['dashboard', 'study', 'exam', 'questions', 'import', 'mistakes', 'highyield', 'admin'];

        let _saveSessionTimer = null;
        function saveSession() {
            if (_saveSessionTimer) clearTimeout(_saveSessionTimer);
            _saveSessionTimer = setTimeout(() => {
                _saveSessionTimer = null;
                _doSaveSession();
            }, 120);
        }
        function _doSaveSession() {
            try {
                if (AppState.examInProgress && Number.isFinite(AppState.examEndsAt)) {
                    AppState.examTimeRemaining = Math.max(0, Math.ceil((AppState.examEndsAt - Date.now()) / 1000));
                }
                const snapshot = {
                    __v: SESSION_SCHEMA_VERSION,
                    savedAt: Date.now(),
                    currentView: AppState.currentView,
                    darkMode: AppState.darkMode,
                    examInProgress: AppState.examInProgress,
                    examShowResults: AppState.examShowResults,
                    examQuestions: AppState.examQuestions,
                    examAnswers: AppState.examAnswers,
                    examTimeRemaining: AppState.examTimeRemaining,
                    examEndsAt: AppState.examEndsAt,
                    examSuspended: AppState.examSuspended,
                    examStartTime: AppState.examStartTime,
                    examAttemptId: AppState.examAttemptId,
                    examSubmittedAt: AppState.examSubmittedAt,
                    examResultsPendingReview: AppState.examResultsPendingReview,
                    _examSaveError: AppState._examSaveError,
                    _examSaved: AppState._examSaved,
                    lastExamResults: AppState.lastExamResults,
                    studyFilter: AppState.studyFilter,
                    questionFilters: AppState.questionFilters,
                    searchQuery: AppState.searchQuery,
                    studyQuestions: AppState.studyQuestions,
                    studyIndex: AppState.studyIndex,
                    studyAnswers: AppState.studyAnswers,
                    studyRevealed: AppState.studyRevealed,
                };
                AYLAStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
                return true;
            } catch (e) {
                console.warn('Session autosave failed:', e);
                return false;
            }
        }

        function clearSession() {
            try { AYLAStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) {}
        }

        function restoreSession() {
            let snapshot;
            try {
                const raw = AYLAStorage.getItem(SESSION_STORAGE_KEY);
                if (!raw) return false;
                snapshot = JSON.parse(raw);
            } catch (e) {
                console.warn('Saved session was corrupted; starting fresh.', e);
                clearSession();
                return false;
            }
            if (!snapshot || typeof snapshot !== 'object' || snapshot.__v !== SESSION_SCHEMA_VERSION) {
                return false;
            }
            try {
                AppState.currentView = VALID_VIEWS.includes(snapshot.currentView) ? snapshot.currentView : 'dashboard';
                AppState.darkMode = !!snapshot.darkMode;

                if (snapshot.studyFilter && typeof snapshot.studyFilter === 'object') {
                    Object.assign(AppState.studyFilter, snapshot.studyFilter);
                }
                if (snapshot.questionFilters && typeof snapshot.questionFilters === 'object') {
                    Object.assign(AppState.questionFilters, snapshot.questionFilters);
                }
                AppState.searchQuery = typeof snapshot.searchQuery === 'string' ? snapshot.searchQuery : '';

                AppState.examQuestions = Array.isArray(snapshot.examQuestions) ? snapshot.examQuestions : [];
                AppState.examAnswers = (snapshot.examAnswers && typeof snapshot.examAnswers === 'object') ? snapshot.examAnswers : {};
                AppState.examTimeRemaining = Number.isFinite(snapshot.examTimeRemaining) ? Math.max(0, snapshot.examTimeRemaining) : 0;
                AppState.examStartTime = snapshot.examStartTime || null;
                AppState.examAttemptId = typeof snapshot.examAttemptId === 'string' ? snapshot.examAttemptId : null;
                AppState.examSubmittedAt = Number.isFinite(snapshot.examSubmittedAt) && snapshot.examSubmittedAt > 0 ? snapshot.examSubmittedAt : null;
                AppState._examSaveError = !!snapshot._examSaveError;
                AppState.examResultsPendingReview = !!snapshot.examResultsPendingReview;
                AppState._examSavePromise = null;
                AppState._examSaved = !!snapshot._examSaved;
                AppState.lastExamResults = Array.isArray(snapshot.lastExamResults) ? snapshot.lastExamResults : null;
                AppState.examInProgress = !!snapshot.examInProgress && AppState.examQuestions.length > 0;
                AppState.examEndsAt = Number.isFinite(snapshot.examEndsAt) && snapshot.examEndsAt > 0 ? snapshot.examEndsAt : null;
                if (AppState.examInProgress && AppState.examEndsAt === null && AppState.examTimeRemaining > 0) {
                    const savedAt = Number.isFinite(snapshot.savedAt) ? snapshot.savedAt : Date.now();
                    AppState.examEndsAt = savedAt + AppState.examTimeRemaining * 1000;
                }
                AppState.examSuspended = AppState.examInProgress;
                if (AppState.examInProgress && AppState.examEndsAt !== null) {
                    AppState.examTimeRemaining = Math.max(0, Math.ceil((AppState.examEndsAt - Date.now()) / 1000));
                }
                AppState.examShowResults = !!snapshot.examShowResults && Array.isArray(AppState.lastExamResults);

                if (Array.isArray(snapshot.studyQuestions) && snapshot.studyQuestions.length > 0 &&
                    Number.isInteger(snapshot.studyIndex) && snapshot.studyIndex >= 0 &&
                    snapshot.studyIndex < snapshot.studyQuestions.length) {
                    AppState.studyQuestions = snapshot.studyQuestions;
                    AppState.studyIndex = snapshot.studyIndex;
                    AppState.studyAnswers = (snapshot.studyAnswers && typeof snapshot.studyAnswers === 'object') ? snapshot.studyAnswers : {};
                    AppState.studyRevealed = (snapshot.studyRevealed && typeof snapshot.studyRevealed === 'object') ? snapshot.studyRevealed : {};
                }
                return true;
            } catch (e) {
                console.warn('Failed to apply saved session; starting fresh.', e);
                return false;
            }
        }

        function checkExamDeadline() {
            if (!AppState.examInProgress || !Number.isFinite(AppState.examEndsAt)) return false;
            AppState.examTimeRemaining = Math.max(0, Math.ceil((AppState.examEndsAt - Date.now()) / 1000));
            for (const selector of ['#examTimerDisplay', '#examSuspendedTimerDisplay']) {
                const display = $(selector);
                if (display) {
                    display.textContent = formatTime(AppState.examTimeRemaining);
                    if (selector === '#examTimerDisplay') display.className = 'timer-display' + (AppState.examTimeRemaining < 120 ? ' timer-warning' : '') + (AppState.examTimeRemaining < 60 ? ' timer-danger' : '');
                }
            }
            if (AppState.examTimeRemaining > 0) return false;
            if (AppState.examTimer) { clearInterval(AppState.examTimer); AppState.examTimer = null; }
            closeExamLeaveDialog();
            showToast('Time up! Submitting...', 'warning');
            submitExam({ showResults: !AppState.examSuspended, timedOut: true });
            return true;
        }

        function startExamTimer() {
            if (AppState.examTimer) { clearInterval(AppState.examTimer); AppState.examTimer = null; }
            if (!AppState.examInProgress) return;
            if (!Number.isFinite(AppState.examEndsAt)) {
                if (!(AppState.examTimeRemaining > 0)) return;
                AppState.examEndsAt = Date.now() + AppState.examTimeRemaining * 1000;
            }
            if (checkExamDeadline()) return;
            _doSaveSession();
            AppState.examTimer = setInterval(() => {
                if (!checkExamDeadline()) saveSession();
            }, 1000);
        }

        function handleExamPageHide() { _doSaveSession(); }

        function handleExamVisibilityChange() {
            if (!document.hidden && AppState.examInProgress) startExamTimer();
            _doSaveSession();
        }

        function cleanupLegacyStorage() {
            try {
                ['ENT_AUTO_BACKUP', 'ent_exam_progress', 'ent_exam_session', 'ent_last_interaction',
                 'ent_runtime_state', 'ent_answers', 'wrongQuestions', 'bookmarks', 'ent_last_question',
                 'entStats'].forEach(k => AYLAStorage.removeItem(k));
                AYLAStorage.keys().forEach(k => {
                    if (k.startsWith('reclass_') || k.startsWith('reclassified_')) AYLAStorage.removeItem(k);
                });
            } catch (e) { }
        }

        // ============================================================
        //  DOM HELPERS
        // ============================================================
        function $(sel) { return document.querySelector(sel); }
        function $$(sel) { return document.querySelectorAll(sel); }

        function escapeHTML(str) {
            return String(str == null ? '' : str).replace(/[&<>"']/g, char => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[char]);
        }

        function safeInlineQuestionId(value) {
            const id = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
            return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : 0;
        }

        function highlightText(text, query) {
            text = String(text == null ? '' : text);
            query = String(query == null ? '' : query);
            if (!query || !text) return escapeHTML(text);
            const pattern = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            if (!pattern.test(text) && typeof ENTSearch !== 'undefined') {
                let position = 0, html = '';
                for (const [start, end] of ENTSearch.matchRanges(text, query)) {
                    html += escapeHTML(text.slice(position, start)) + '<span class="highlight">' + escapeHTML(text.slice(start, end)) + '</span>';
                    position = end;
                }
                return html + escapeHTML(text.slice(position));
            }
            return text.split(pattern).map((part, index) => index % 2
                ? `<span class="highlight">${escapeHTML(part)}</span>`
                : escapeHTML(part)).join('');
        }

        function formatTime(sec) {
            const m = Math.floor(sec / 60), s = sec % 60;
            return `${m}:${s.toString().padStart(2,'0')}`;
        }

        function showToast(msg, type = 'info') {
            const container = $('#toastContainer');
            const toast = document.createElement('div');
            toast.textContent = msg;
            const bg = type === 'success' ? '#216849' : type === 'error' ? '#b42f42' : type === 'warning' ? '#81540b' : '#3b2030';
            toast.style.cssText = `background:${bg};color:#fff;padding:10px 20px;border-radius:20px;margin-bottom:8px;font-weight:600;animation:toastIn 0.3s ease, toastOut 0.3s ease 2.2s forwards;`;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 2600);
        }

        function closeModal() {
            window.__questionImageFormRequest = (window.__questionImageFormRequest || 0) + 1;
            if (history.state && history.state.modal) {
                history.back(); // popstate handler hides the overlay
            } else {
                $('#modalOverlay').classList.add('hidden');
            }
        }

        // ============================================================
        //  NAVIGATION
        // ============================================================
        // True only while we're reacting to a browser/hardware back-button
        // press, so navigateTo() knows not to push another history entry
        // for a navigation the user didn't just initiate.
        let isPopNavigation = false;
        let _examLeaveRequest = null;

        function closeExamLeaveDialog() {
            const request = _examLeaveRequest;
            if (!request) return;
            _examLeaveRequest = null;
            request.dialog.remove();
            if (request.focusBefore?.isConnected) request.focusBefore.focus();
        }

        function showExamLeaveDialog(targetView) {
            if (_examLeaveRequest) { _examLeaveRequest.targetView = targetView; return false; }
            const dialog = document.createElement('dialog');
            dialog.id = 'examLeaveDialog';
            dialog.setAttribute('aria-labelledby', 'examLeaveTitle');
            dialog.style.cssText = 'max-width:460px;width:calc(100% - 32px);margin:auto;padding:24px;border:1px solid var(--border);border-radius:18px;background:var(--bg,#fff);color:var(--text,#172b3a);box-shadow:0 16px 60px #0005;';
            dialog.innerHTML = `<h2 id="examLeaveTitle" style="margin-bottom:12px;">Leave the exam?</h2>
                <p style="margin-bottom:18px;">Your answers will be kept. The timer keeps running for timed exams, including while the app is closed.</p>
                <div style="display:grid;gap:10px;">
                  <button type="button" class="btn btn-primary btn-block" id="btnExamStay">Continue Exam</button>
                  <button type="button" class="btn btn-outline btn-block" id="btnExamSaveExit">Save &amp; Exit</button>
                  <button type="button" class="btn btn-danger btn-block" id="btnExamFinish">End Exam &amp; Submit</button>
                </div>`;
            _examLeaveRequest = { targetView, dialog, focusBefore: document.activeElement };
            document.body.appendChild(dialog);
            dialog.querySelector('#btnExamStay').addEventListener('click', () => chooseExamLeaveAction('stay'));
            dialog.querySelector('#btnExamSaveExit').addEventListener('click', () => chooseExamLeaveAction('save-exit'));
            dialog.querySelector('#btnExamFinish').addEventListener('click', () => chooseExamLeaveAction('finish'));
            dialog.addEventListener('cancel', event => { event.preventDefault(); chooseExamLeaveAction('stay'); });
            dialog.addEventListener('click', event => { if (event.target === dialog) chooseExamLeaveAction('stay'); });
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
            dialog.querySelector('#btnExamStay').focus();
            return false;
        }

        async function chooseExamLeaveAction(action) {
            const request = _examLeaveRequest;
            if (!request || !AppState.examInProgress) { closeExamLeaveDialog(); return false; }
            if (checkExamDeadline()) return false;
            if (action === 'stay') { closeExamLeaveDialog(); return true; }
            if (action === 'save-exit') {
                const previousView = AppState.currentView;
                AppState.examSuspended = true;
                AppState.currentView = request.targetView;
                if (!_doSaveSession()) {
                    AppState.examSuspended = false;
                    AppState.currentView = previousView;
                    showToast('Progress could not be saved. Keep the exam open and try again.', 'error');
                    return false;
                }
                closeExamLeaveDialog();
                await performNavigation(request.targetView);
                return true;
            }
            if (action === 'finish') {
                closeExamLeaveDialog();
                await submitExam({ showResults: true });
                return true;
            }
            return false;
        }

        function performNavigation(view) {
            window.__questionImageFormRequest = (window.__questionImageFormRequest || 0) + 1;
            AppState.currentView = view;
            $$('.nav-item').forEach(n => n.classList.remove('active'));
            const nav = $(`.nav-item[data-view="${view}"]`);
            if (nav) nav.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (!isPopNavigation && (history.state?.view !== view || history.state?.modal)) {
                history.pushState({ view }, '', location.href);
            }
            _doSaveSession();
            return renderViewSafely(view);
        }

        function resumeExam() {
            if (!AppState.examInProgress || !AppState.examQuestions.length) return false;
            closeExamLeaveDialog();
            AppState.examSuspended = false;
            startExamTimer();
            if (!AppState.examInProgress) return false;
            _doSaveSession();
            return performNavigation('exam');
        }

        async function navigateTo(view) {
            if (AppState.examInProgress && view === 'exam') return resumeExam();
            if (view === 'exam' && AppState.examResultsPendingReview) return viewExamResults();
            if (AppState.examInProgress && !AppState.examSuspended && view !== 'exam') {
                if (checkExamDeadline()) return false;
                return showExamLeaveDialog(view);
            }
            AppState.examShowResults = false;
            return performNavigation(view);
        }

        async function handlePopState(event) {
            const overlay = $('#modalOverlay');
            const state = event.state || {};
            if (_examLeaveRequest) {
                closeExamLeaveDialog();
                history.pushState({ view: AppState.currentView }, '', location.href);
                return;
            }
            if (overlay && !overlay.classList.contains('hidden') && !state.modal) {
                overlay.classList.add('hidden');
                return;
            }
            if (AppState.examInProgress && !AppState.examSuspended && state.view !== 'exam') {
                history.pushState({ view: 'exam' }, '', location.href);
                return navigateTo(state.view || 'dashboard');
            }
            isPopNavigation = true;
            try { await navigateTo(state.view || 'dashboard'); }
            finally { isPopNavigation = false; }
        }

        function viewExamResults() {
            if (!Array.isArray(AppState.lastExamResults) || !AppState.lastExamResults.length) return false;
            AppState.examResultsPendingReview = false;
            AppState.examShowResults = true;
            _doSaveSession();
            return performNavigation('exam');
        }

        function renderSavedExamBanner() {
            if (!AppState.examInProgress && AppState.examResultsPendingReview && AppState.lastExamResults?.length) {
                const message = AppState._examSaveError ? 'Results could not be saved. Open the results to retry saving.' : 'The exam has finished. Your results are ready.';
                return `<div class="card" aria-label="Completed exam"><h3>Exam Completed</h3><p style="margin:10px 0;">${message}</p><button class="btn btn-primary btn-block" id="btnViewExamResults">View Results</button></div>`;
            }
            if (!AppState.examInProgress || !AppState.examSuspended) return '';
            const time = Number.isFinite(AppState.examEndsAt)
                ? `Time remaining: <span id="examSuspendedTimerDisplay">${formatTime(AppState.examTimeRemaining)}</span>. The timer keeps running.`
                : 'This exam has no time limit.';
            return `<div class="card" aria-label="Saved exam"><h3>Saved Exam</h3><p style="margin:10px 0;">Your answers are saved. ${time}</p><button class="btn btn-primary btn-block" id="btnResumeExam">Resume Exam</button></div>`;
        }

        // ============================================================
        //  RENDER ENGINE
        // ============================================================
        let _viewRenderSequence = 0;
        async function renderViewSafely(view) {
            if (AppState.examInProgress && !AppState.examSuspended && view !== 'exam') return navigateTo(view);
            if (AppState.examInProgress && AppState.examSuspended && view === 'exam') return resumeExam();
            AppState.currentView = view;
            const sequence = ++_viewRenderSequence;
            const questionInputRevision = AppState._questionSearchRevision || 0;
            const main = $('#mainContent');
            if (!main) return;
            let html;
            try {
                switch (view) {
                    case 'dashboard': html = await renderDashboard(); break;
                    case 'study': html = await renderStudy(); break;
                    case 'exam':
                        if (AppState.examInProgress) html = await renderExamInProgress();
                        else if (AppState.examShowResults) html = renderExamResults();
                        else html = await renderExamSetup();
                        break;
                    case 'questions': html = await renderQuestionList(); break;
                    case 'mistakes': html = await renderMistakes(); break;
                    case 'highyield': html = await renderHighYield(); break;
                    case 'settings': html = await renderSettings(); break;
                    default: html = '<div class="card">Unknown view</div>';
                }
            } catch (e) {
                console.error('Render error:', e);
                html = `<div class="card text-center"><p style="color:var(--danger);">Error: ${escapeHTML(e.message)}</p></div>`;
            }
            if (sequence !== _viewRenderSequence || (view === 'questions' && questionInputRevision !== (AppState._questionSearchRevision || 0))) return;
            if (AppState.examInProgress && !AppState.examSuspended && view !== 'exam') return navigateTo(view);
            main.innerHTML = html;
            const examBanner = view !== 'exam' ? renderSavedExamBanner() : '';
            if (examBanner) main.insertAdjacentHTML('afterbegin', examBanner);
            attachEventListeners();
            saveSession();
        }

        // ============================================================
        //  RENDER FUNCTIONS  (Optimized)
        // ============================================================

        /**
         * DASHBOARD — Optimized path:
         * 1. Fetches all hot data via cached DB getters (single IndexedDB read).
         * 2. Renders the static skeleton immediately so the UI paints fast.
         * 3. Offloads heavy analytics (weak topics, subject breakdown) to the
         *    Web Worker, then injects results lazily via requestIdleCallback.
         */
        
        // ============================================================
        //  STUDENT MODE ENHANCEMENTS
        // ============================================================
        const STREAK_KEY = 'ent_study_streak';
        const DAILY_GOAL_KEY = 'ent_daily_goal';
        const DAILY_PROGRESS_KEY = 'ent_daily_progress';
        const LAST_STUDY_DATE_KEY = 'ent_last_study_date';
        const DEFAULT_STREAK_INFO = Object.freeze({
            streak: 0,
            bestStreak: 0,
            totalStudyDays: 0,
            lastDate: null,
            studiedToday: false
        });

        function toNonNegativeInteger(value, fallback = 0) {
            const parsed = Number.parseInt(value, 10);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
        }

        function parseDailyProgress(raw) {
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
                return Object.fromEntries(
                    Object.entries(parsed).map(([date, count]) => [date, toNonNegativeInteger(count)])
                );
            } catch (e) {
                return {};
            }
        }

        function getBestStreak(progress = {}) {
            const studyDates = Object.entries(progress ?? {})
                .filter(([date, count]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && toNonNegativeInteger(count) > 0)
                .map(([date]) => date)
                .sort();
            let bestStreak = 0;
            let currentRun = 0;
            let previousDay = null;
            studyDates.forEach(date => {
                const day = Date.parse(`${date}T00:00:00Z`);
                currentRun = previousDay !== null && day - previousDay === 86400000 ? currentRun + 1 : 1;
                bestStreak = Math.max(bestStreak, currentRun);
                previousDay = day;
            });
            return bestStreak;
        }

        async function getDailyProgressMap() {
            try {
                return parseDailyProgress(await db.getSetting(DAILY_PROGRESS_KEY, '{}'));
            } catch (e) {
                return {};
            }
        }

        async function getStudyStreak() {
            try {
                const [raw, lastRaw, progress] = await Promise.all([
                    db.getSetting(STREAK_KEY, '0'),
                    db.getSetting(LAST_STUDY_DATE_KEY, ''),
                    getDailyProgressMap()
                ]);
                const storedStreak = toNonNegativeInteger(raw);
                const totalStudyDays = Object.values(progress ?? {}).filter(count => toNonNegativeInteger(count) > 0).length;
                const bestStreak = Math.max(storedStreak, getBestStreak(progress));
                const lastDate = lastRaw ? new Date(lastRaw) : null;
                const today = new Date(); today.setHours(0,0,0,0);
                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                if (!lastDate || Number.isNaN(lastDate.getTime())) {
                    return { ...DEFAULT_STREAK_INFO, bestStreak, totalStudyDays };
                }
                const last = new Date(lastDate); last.setHours(0,0,0,0);
                if (+last === +today) return { streak: storedStreak, bestStreak, totalStudyDays, lastDate: lastRaw, studiedToday: true };
                if (+last === +yesterday) return { streak: storedStreak, bestStreak, totalStudyDays, lastDate: lastRaw, studiedToday: false };
                return { streak: 0, bestStreak, totalStudyDays, lastDate: lastRaw, studiedToday: false };
            } catch (e) { return { ...DEFAULT_STREAK_INFO }; }
        }

        async function recordStudyActivity() {
            const today = new Date().toISOString().slice(0, 10);
            const { streak, studiedToday } = await getStudyStreak();
            if (!studiedToday) {
                const newStreak = streak + 1;
                await db.setSetting(STREAK_KEY, String(newStreak));
                await db.setSetting(LAST_STUDY_DATE_KEY, today);
            }
            // Daily progress
            const progress = await getDailyProgressMap();
            progress[today] = (progress[today] || 0) + 1;
            await db.setSetting(DAILY_PROGRESS_KEY, JSON.stringify(progress));
        }

        async function getDailyGoal() {
            try {
                const raw = await db.getSetting(DAILY_GOAL_KEY, '20');
                return Math.max(1, toNonNegativeInteger(raw, 20));
            } catch (e) {
                return 20;
            }
        }

        async function setDailyGoal(goal) {
            await db.setSetting(DAILY_GOAL_KEY, String(goal));
        }

        async function getDailyProgress() {
            const today = new Date().toISOString().slice(0, 10);
            const progress = await getDailyProgressMap();
            return toNonNegativeInteger(progress?.[today]);
        }

        async function getWeeklyProgress() {
            const progress = await getDailyProgressMap();
            const result = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                result.push({ date: key, count: toNonNegativeInteger(progress?.[key]), day: d.toLocaleDateString('en-US', { weekday: 'long' }) });
            }
            return result;
        }

        async function generateSmartRevision() {
            const [questions, perf, bmIds, hyIds] = await Promise.all([
                db.getAllQuestions(), db.getPerformance(),
                db.getAllBookmarkedIds(), db.getAllHighYieldIds()
            ]);
            const latest = {};
            perf.forEach(x => {
                if (!latest[x.questionId] || new Date(x.timestamp) > new Date(latest[x.questionId].timestamp)) {
                    latest[x.questionId] = { correct: x.correct, timestamp: x.timestamp };
                }
            });
            const wrongIds = Object.keys(latest).filter(k => latest[k].correct === false).map(Number);
            const missed = questions.filter(q => wrongIds.includes(q.id));
            const highYield = questions.filter(q => hyIds.includes(q.id));
            const bookmarked = questions.filter(q => bmIds.includes(q.id));

            const pool = [];
            // Priority: missed > high yield > bookmarked > random
            missed.forEach(q => pool.push({ q, weight: 10 }));
            highYield.forEach(q => { if (!pool.find(p => p.q.id === q.id)) pool.push({ q, weight: 5 }); });
            bookmarked.forEach(q => { if (!pool.find(p => p.q.id === q.id)) pool.push({ q, weight: 3 }); });

            // Fill up to 20 with random weak-topic questions if pool is small
            if (pool.length < 20) {
                const weakTopics = {};
                perf.filter(x => !x.correct).forEach(x => {
                    const key = x.subject || 'Unknown';
                    weakTopics[key] = (weakTopics[key] || 0) + 1;
                });
                const weakSubjects = Object.entries(weakTopics).sort((a, b) => b[1] - a[1]).map(([k]) => k);
                const candidates = questions.filter(q => weakSubjects.includes(q.subject) && !pool.find(p => p.q.id === q.id));
                candidates.sort(() => Math.random() - 0.5).slice(0, 20 - pool.length).forEach(q => pool.push({ q, weight: 2 }));
            }

            // Sample by weight without replacement, so every draw makes progress.
            const remaining = pool.slice();
            const selected = [];
            while (selected.length < 20 && remaining.length > 0) {
                const totalWeight = remaining.reduce((sum, entry) => sum + entry.weight, 0);
                let draw = Math.random() * totalWeight;
                let index = remaining.length - 1;
                for (let i = 0; i < remaining.length; i++) {
                    draw -= remaining[i].weight;
                    if (draw < 0) { index = i; break; }
                }
                selected.push(remaining.splice(index, 1)[0].q);
            }
            return selected;
        }

        async function startAdaptiveExam() {
            const questions = await db.getAllQuestions();
            if (questions.length === 0) { showToast('No questions available.', 'warning'); return; }
            const perf = await db.getPerformance();
            const latest = {};
            perf.forEach(x => {
                if (!latest[x.questionId] || new Date(x.timestamp) > new Date(latest[x.questionId].timestamp)) {
                    latest[x.questionId] = x;
                }
            });
            // Score each question: lower accuracy = higher priority
            const scored = questions.map(q => {
                const rec = latest[q.id];
                let score = 0.5;
                if (rec) {
                    score = rec.correct ? 0.3 : 0.9;
                    if (q.difficulty === 'Hard') score += 0.1;
                    if (q.difficulty === 'Easy') score -= 0.1;
                }
                return { q, score: Math.max(0, Math.min(1, score)) };
            });
            scored.sort((a, b) => b.score - a.score);
            const selected = scored.slice(0, Math.min(20, scored.length)).map(s => s.q);
            if (!resetExamAttempt()) return;
            AppState.examQuestions = selected;
            AppState.examAnswers = { currentIndex: 0 };
            AppState.examInProgress = true;
            AppState.examShowResults = false;
            AppState.lastExamResults = null;
            AppState.examStartTime = Date.now();
            AppState.examTimeRemaining = 0;
            resumeExam();
        }

        async function startSmartRevision() {
            const selected = await generateSmartRevision();
            if (selected.length === 0) { showToast('No revision questions available. Start studying first!', 'warning'); return; }
            AppState.studyQuestions = selected;
            AppState.studyIndex = 0;
            AppState.studyAnswers = {};
            AppState.studyRevealed = {};
            navigateTo('study');
            setTimeout(() => renderStudyQuestion(), 100);
        }

        async function continueStudying() {
            if (AppState.studyQuestions && AppState.studyIndex < AppState.studyQuestions.length) {
                navigateTo('study');
                setTimeout(() => renderStudyQuestion(), 100);
            } else {
                showToast('No active study session. Start a new one!', 'info');
            }
        }

async function renderDashboard() {
            let streakInfo = { ...DEFAULT_STREAK_INFO };
            let dailyProgress = 0;
            let dailyGoal = 20;
            let weeklyProgress = [];
            const canContinue = Boolean(
                AppState.studyQuestions?.length &&
                (AppState.studyIndex ?? 0) < AppState.studyQuestions.length
            );

            // Parallel cached reads — no blocking sequential DB calls
            const [questions, bookmarks, history, perf, loadedStreakInfo, loadedDailyGoal, progressByDate] = await Promise.all([
                db.getAllQuestions(),
                db.getAllBookmarkedIds(),
                db.getExamHistory(),
                db.getPerformance(),
                getStudyStreak(),
                getDailyGoal(),
                getDailyProgressMap()
            ]);

            streakInfo = { ...DEFAULT_STREAK_INFO, ...(loadedStreakInfo ?? {}) };
            dailyGoal = Math.max(1, toNonNegativeInteger(loadedDailyGoal, 20));
            const today = new Date().toISOString().slice(0, 10);
            dailyProgress = toNonNegativeInteger(progressByDate?.[today]);
            weeklyProgress = Array.from({ length: 7 }, (_, index) => {
                const date = new Date();
                date.setUTCDate(date.getUTCDate() - (6 - index));
                const dateKey = date.toISOString().slice(0, 10);
                return {
                    day: date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
                    count: toNonNegativeInteger(progressByDate?.[dateKey])
                };
            });
            const dailyProgressPercent = Math.min(100, Math.round((dailyProgress / dailyGoal) * 100));

            const total = questions.length;
            const correct = perf.filter(x => x.correct).length;
            const wrong = perf.length - correct;
            const acc = perf.length ? Math.round(correct * 100 / perf.length) : 0;
            const avg = history.length ? Math.round(history.reduce((s, e) => s + (e.percentage || 0), 0) / history.length) : 0;

            // Render skeleton immediately
            let html = `
            <div class="card"><div class="card-header">${uiIcon("dashboard")} Dashboard</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">
                <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Questions</div></div>
                <div class="stat-card"><div class="stat-value">${bookmarks.length}</div><div class="stat-label">Bookmarked</div></div>
                <div class="stat-card"><div class="stat-value">${history.length}</div><div class="stat-label">Exams</div></div>
                <div class="stat-card"><div class="stat-value">${correct}</div><div class="stat-label">Correct</div></div>
                <div class="stat-card"><div class="stat-value">${wrong}</div><div class="stat-label">Wrong</div></div>
                <div class="stat-card"><div class="stat-value">${acc}%</div><div class="stat-label">Accuracy</div></div>
                <div class="stat-card"><div class="stat-value">${avg}%</div><div class="stat-label">Avg Accuracy</div></div>
              </div>
            </div>
            <div class="card"><div class="card-header">${uiIcon("flame")} Study Streak & Daily Goal</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:10px;">
                <div class="stat-card"><div class="stat-value">${streakInfo?.streak ?? 0}</div><div class="stat-label">Current Streak</div></div>
                <div class="stat-card"><div class="stat-value">${streakInfo?.bestStreak ?? 0}</div><div class="stat-label">Best Streak</div></div>
                <div class="stat-card"><div class="stat-value">${streakInfo?.totalStudyDays ?? 0}</div><div class="stat-label">Total Study Days</div></div>
                <div class="stat-card"><div class="stat-value">${dailyProgress}</div><div class="stat-label">Today</div></div>
                <div class="stat-card"><div class="stat-value">${dailyGoal}</div><div class="stat-label">Daily Goal</div></div>
                <div class="stat-card"><div class="stat-value">${dailyProgressPercent}%</div><div class="stat-label">Progress</div></div>
              </div>
              <div style="margin-bottom:10px;">
                <div class="progress-bar"><div class="progress-fill" style="width:${dailyProgressPercent}%"></div></div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-sm btn-primary" id="btnSetDailyGoal">${uiIcon("target")} Set Daily Goal</button>
                <button class="btn btn-sm btn-success" id="btnContinueStudy" ${canContinue ? '' : 'disabled'}>${uiIcon("play")} Continue Studying</button>
                <button class="btn btn-sm btn-accent" id="btnSmartRevision">${uiIcon("brain")} Smart Revision</button>
                <button class="btn btn-sm btn-warning" id="btnAdaptiveQuiz">${uiIcon("target")} Adaptive Quiz</button>
              </div>
            </div>

            <div class="card"><div class="card-header">${uiIcon("calendar")} Weekly Activity</div>
              <div style="display:flex;gap:6px;align-items:flex-end;justify-content:space-between;height:80px;padding:10px 0;">
                ${weeklyProgress.map(d => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                  <div style="width:100%;background:linear-gradient(180deg,var(--primary),var(--accent));border-radius:4px;opacity:0.8;transition:height 0.3s;height:${Math.min(60, (d.count / Math.max(dailyGoal, 1)) * 60)}px;"></div>
                  <div style="font-size:clamp(0.45rem,1.7vw,0.65rem);color:var(--text-muted);font-weight:600;white-space:nowrap;">${d.day}</div>
                  <div style="font-size:0.6rem;color:var(--text2);">${d.count}</div>
                </div>`).join('')}
              </div>
            </div>

            <div class="card"><div class="card-header">${uiIcon("library")} By Subject</div>
              <div id="dashboardSubjects"><div class="empty-state">Loading subject breakdown...</div></div>
            </div>
            <div class="card"><div class="card-header">${uiIcon("target")} Weak Topics</div>
              <div id="dashboardWeakTopics"><div class="empty-state">Loading analytics...</div></div>
            </div>
            <div class="card">
              <div class="card-header">${uiIcon("x")} Missed Questions Bank</div>
              <div style="font-size:13px">Review your incorrect answers in one place.</div>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                <span class="badge badge-danger">${wrong} Missed</span>
                <button class="btn btn-sm btn-danger" data-nav="mistakes">Review Mistakes</button>
              </div>
            </div>
            <div class="card">
              <div class="card-header">${uiIcon("star-filled")} High Yield Questions</div>
              <div style="font-size:13px">Mark important board and exam questions.</div>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                <span class="badge badge-warning" id="hyBadge">${(await db.getAllHighYieldIds()).length} High Yield</span>
                <button class="btn btn-sm btn-accent" data-nav="highyield">Review High Yield</button>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              <button class="btn btn-primary btn-sm" data-nav="study">${uiIcon("study")} Study</button>
              <button class='btn btn-success btn-sm' id='btnAdaptiveStudy'>${uiIcon("brain")} Adaptive Study</button>
              <button class='btn btn-accent btn-sm' onclick='startAdaptiveExam()'>${uiIcon("target")} Adaptive Exam</button>
              <button class="btn btn-accent btn-sm" data-nav="exam">${uiIcon("exam")} Exam</button>
            </div>
            <div class="card">
              <div class="card-header">${uiIcon("chart")} Subject Performance Analytics</div>
              <div id="subjectAnalyticsContainer">
                <small>Accuracy by Subject will be calculated automatically from performance history.</small>
              </div>
            </div>`;

            // LAZY LOAD: offload heavy analytics to Web Worker, then paint results
            LazyRenderer.schedule(async () => {
                try {
                    const analytics = await WorkerPool.post('analytics', {
                        questions, performance: perf, bookmarks, examHistory: history
                    });
                    // Subject breakdown
                    const subjectEntries = Object.entries(analytics.subjectCounts).sort((a, b) => b[1] - a[1]);
                    const subjHtml = subjectEntries.length
                        ? subjectEntries.map(([s,c])=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);"><span>${escapeHTML(s)}</span><span class="badge badge-primary">${c}</span></div>`).join('')
                        : '<div class="empty-state">No questions yet.</div>';
                    const subjContainer = $('#dashboardSubjects');
                    if (subjContainer) subjContainer.innerHTML = subjHtml;

                    // Weak topics
                    const weakHtml = analytics.weakArr.length
                        ? analytics.weakArr.map(x=>`<div style="display:flex;justify-content:space-between;padding:6px 0"><span>${escapeHTML(x.k)}</span><span class="badge badge-danger">${x.p}%</span></div>`).join('')
                        : `<div class="empty-state">Solve more questions to generate weak-topic analytics.</div>`;
                    const weakContainer = $('#dashboardWeakTopics');
                    if (weakContainer) weakContainer.innerHTML = weakHtml;
                } catch (e) {
                    console.error('Dashboard analytics error:', e);
                }
            }, 'idle');

            return html;
        }

        async function renderStudy() {
            const sf = AppState.studyFilter;

            if (sf.mode === 'lectures') {
                return await renderLectureBrowser();
            }
            if (sf.mode === 'lectureReader' && sf.lectureId) {
                return await renderLectureReader(sf.lectureId);
            }

            const questions = await db.getAllQuestions();
            const books = await db.getAllBooks();
            let filtered = questions;
            if (sf.subject !== 'all') filtered = filtered.filter(q => (q.subject || 'Uncategorized') === sf.subject);
            if (sf.chapter !== 'all') filtered = filtered.filter(q => (q.chapter || 'General') === sf.chapter);
            if (sf.topic !== 'all') filtered = filtered.filter(q => (q.topic || 'General') === sf.topic);
            if (sf.subtopic !== 'all') filtered = filtered.filter(q => ((q.subtopic || 'General') === sf.subtopic));
            if (sf.book !== 'all') filtered = filtered.filter(q => (q.book || '') === sf.book);
            if (sf.mode === 'bookmarked') { const bIds = await db.getAllBookmarkedIds(); filtered = filtered.filter(q => bIds.includes(q.id)); }
            if (sf.mode === 'highyield') { const hyIds = await db.getAllHighYieldIds(); filtered = filtered.filter(q => hyIds.includes(q.id)); }

            const taxonomy = computeTaxonomy(questions);
            const subjectOpts = '<option value="all">All</option>' + taxonomy.subjects.map(s => `<option value="${escapeHTML(s)}" ${sf.subject===s?'selected':''}>${escapeHTML(s)}</option>`).join('');
            let chapterList = taxonomy.allChapters;
            if (sf.subject !== 'all' && taxonomy.chaptersBySubject[sf.subject]) chapterList = taxonomy.chaptersBySubject[sf.subject];
            const chapterOpts = '<option value="all">All</option>' + chapterList.map(c => `<option value="${escapeHTML(c)}" ${sf.chapter===c?'selected':''}>${escapeHTML(c)}</option>`).join('');

            const topicSet = new Set(aylaTopicsFor(sf.subject, sf.chapter, questions));
            filtered.forEach(q => { topicSet.add(q.topic || 'General'); });
            const topicOpts = '<option value="all">All</option>' + [...topicSet].sort().map(t => `<option value="${escapeHTML(t)}" ${sf.topic===t?'selected':''}>${escapeHTML(t)}</option>`).join('');
            const bookOpts = '<option value="all">All Books</option>' + books.map(g => `<option value="${escapeHTML(g)}" ${sf.book===g?'selected':''}>${escapeHTML(g)}</option>`).join('');

            const subtopicSet = new Set(['General']);
            filtered.forEach(q => { subtopicSet.add(q.subtopic || 'General'); });
            const subtopicOpts = '<option value="all">All</option>' + [...subtopicSet].sort().map(st => `<option value="${escapeHTML(st)}" ${sf.subtopic===st?'selected':''}>${escapeHTML(st)}</option>`).join('');

            return `
            <div class="card">
              <div class="card-header">${uiIcon("study")} Study Mode</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="btn btn-sm ${sf.mode==='practice'?'btn-primary':'btn-outline'}" data-study-mode="practice">Practice</button>
                <button class="btn btn-sm ${sf.mode==='bookmarked'?'btn-primary':'btn-outline'}" data-study-mode="bookmarked">${uiIcon("bookmark")} Bookmarked</button>
                <button class="btn btn-sm ${sf.mode==='highyield'?'btn-primary':'btn-outline'}" data-study-mode="highyield">${uiIcon("flame")} High Yield</button>
                <button class="btn btn-sm ${sf.mode==='lectures'?'btn-primary':'btn-outline'}" data-study-mode="lectures">${uiIcon("library")} Lectures</button>
              </div>
              <div class="form-row">
                <div><label>Subject</label><select id="studySubject">${subjectOpts}</select></div>
                <div><label>Chapter</label><select id="studyChapter">${chapterOpts}</select></div>
                <div><label>Topic</label><select id="studyTopic">${topicOpts}</select></div>
                <div><label>Subtopic</label><select id="studySubtopic">${subtopicOpts}</select></div>
                <div><label>Book</label><select id="studyBook">${bookOpts}</select></div>
              </div>
              <p style="font-size:0.85rem;color:var(--text2);">${filtered.length} questions match</p>
              <button class="btn btn-primary btn-block" id="btnStartStudy">${uiIcon("play")} Start Studying</button>
            </div>
            <div id="studyArea"></div>`;
        }

        async function renderLectureBrowser() {
            const lectures = await db.getAllLectures();
            const taxonomy = computeTaxonomy([...(await db.getAllQuestions()), ...lectures]);
            const sf = AppState.studyFilter;
            let filtered = lectures;
            if (sf.subject !== 'all') filtered = filtered.filter(l => (l.subject || 'Uncategorized') === sf.subject);
            if (sf.chapter !== 'all') filtered = filtered.filter(l => (l.chapter || 'General') === sf.chapter);

            const subjectOpts = '<option value="all">All</option>' + taxonomy.subjects.map(s => `<option value="${escapeHTML(s)}" ${sf.subject===s?'selected':''}>${escapeHTML(s)}</option>`).join('');

            // Chapter options: only chapters that actually have lectures, scoped to the
            // current subject filter so the list stays short and relevant.
            const chapterSource = sf.subject !== 'all' ? lectures.filter(l => (l.subject || 'Uncategorized') === sf.subject) : lectures;
            const chapterSet = new Set(['General']);
            chapterSource.forEach(l => { chapterSet.add(l.chapter || 'General'); });
            const chapterOpts = '<option value="all">All Chapters</option>' + [...chapterSet].sort().map(c => `<option value="${escapeHTML(c)}" ${sf.chapter===c?'selected':''}>${escapeHTML(c)}</option>`).join('');

            return `
            <div class="card">
              <div class="card-header">${uiIcon("library")} Lectures</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="btn btn-sm btn-outline" data-study-mode="practice">${uiIcon("arrow-left")} Back to Study</button>
                ${RBAC.isAdmin() ? `<button class="btn btn-sm btn-primary" id="btnAddLecture">${uiIcon("plus")} Add Lecture</button>` : ''}
              </div>
              <div class="form-row">
                <div><label>Subject</label><select id="lectureSubjectFilter">${subjectOpts}</select></div>
                <div><label>Chapter</label><select id="lectureChapterFilter">${chapterOpts}</select></div>
              </div>
              <p style="font-size:0.85rem;color:var(--text2);">${filtered.length} lectures</p>
            </div>
            ${filtered.length === 0 ? '<div class="empty-state">No lectures yet. Add your first lecture above.</div>' :
              filtered.map(l => `
                <div class="card lecture-card" data-lid="${escapeHTML(l.id)}" style="cursor:pointer;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                      <div style="font-weight:700;font-size:1.05rem;margin-bottom:6px;">${escapeHTML(l.title || 'Untitled')}</div>
                      <div class="flex-wrap">
                        <span class="badge badge-primary">${escapeHTML(l.subject || 'Uncategorized')}</span>
                        <span class="badge badge-accent">${escapeHTML(l.chapter || 'General')}</span>
                        ${l.book ? `<span class="badge badge-group">${escapeHTML(l.book)}</span>` : ''}
                      </div>
                    </div>
                    <button class="btn btn-sm btn-outline lecture-exam-btn" data-lid="${escapeHTML(l.id)}" style="white-space:nowrap;">${uiIcon("exam")} Exam</button>
                  </div>
                  <div style="margin-top:10px;font-size:0.82rem;color:var(--text2);line-height:1.5;max-height:60px;overflow:hidden;position:relative;">
                    ${escapeHTML((l.content || '').substring(0, 180))}${(l.content || '').length > 180 ? '…' : ''}
                  </div>
                </div>
              `).join('')}`;
        }

        async function renderLectureReader(lectureId) {
            const l = await db.getLecture(lectureId);
            if (!l) return ("<div class=\"card text-center\"><h3>Lecture not found</h3><button class=\"btn btn-outline\" data-study-mode=\"lectures\">" + uiIcon("arrow-left") + " Back</button></div>");
            const allQuestions = await db.getAllQuestions();
            const attachedCount = allQuestions.filter(q => q.lectureId === l.id).length;
            const chapterCount = allQuestions.filter(q => (q.subject||'') === (l.subject||'') && (q.chapter||'') === (l.chapter||'')).length;
            return `
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
                <div>
                  <div class="card-header" style="margin-bottom:4px;">${escapeHTML(l.title || 'Untitled')}</div>
                  <div class="flex-wrap">
                    <span class="badge badge-primary">${escapeHTML(l.subject || 'Uncategorized')}</span>
                    <span class="badge badge-accent">${escapeHTML(l.chapter || 'General')}</span>
                    ${l.book ? `<span class="badge badge-group">${escapeHTML(l.book)}</span>` : ''}
                    ${l.page ? `<span class="badge badge-warning">${uiIcon("file")} Page ${escapeHTML(String(l.page))}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button class="btn btn-sm btn-outline" data-study-mode="lectures">${uiIcon("arrow-left")} Back</button>
                  ${RBAC.isAdmin() ? `<button class="btn btn-sm btn-danger" id="btnDeleteLecture" data-lid="${escapeHTML(l.id)}">${uiIcon("trash")} Delete</button>` : ''}
                </div>
              </div>
            </div>
            <div class="card" style="line-height:1.8;font-size:0.95rem;white-space:pre-wrap;">${escapeHTML(l.content || 'No content.')}</div>
            <div class="card">
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                <button class="btn btn-accent" id="btnExamLectureAttached" data-lid="${escapeHTML(l.id)}">${uiIcon("exam")} Exam: This Lecture's MCQs (${attachedCount})</button>
                <button class="btn btn-primary" id="btnExamChapterAllBooks" data-subj="${escapeHTML(l.subject||'')}" data-chap="${escapeHTML(l.chapter||'')}">${uiIcon("library")} Exam: All MCQs, This Chapter (${chapterCount})</button>
              </div>
            </div>`;
        }

        async function renderExamSetup() {
            const books = await db.getAllBooks();
            const taxonomy = computeTaxonomy(await db.getAllQuestions());
            return `
            <div class="card">
              <div class="card-header">${uiIcon("exam")} Exam Setup</div>
              <div style="margin-bottom:12px">
                <label>${uiIcon("folder")} Book</label>
                <select id="examBook">
                  <option value="all">All Books</option>
                  ${books.map(g=>`<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('')}
                </select>
              </div>
              <div style="margin-bottom:12px">
                <label>${uiIcon("library")} Subject</label>
                <select id="examSubject">
                  <option value="all">All Subjects</option>
                  ${taxonomy.subjects.map(s=>`<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('')}
                </select>
              </div>
              <div style="margin-bottom:12px">
                <label>${uiIcon("study")} Chapter</label>
                <select id="examChapter">
                  <option value="all">All Chapters</option>
                  ${taxonomy.allChapters.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
                </select>
              </div>
              <div class="form-row">
                <div><label>Questions</label><select id="examCount"><option>10</option><option selected>20</option><option>30</option><option>50</option></select></div>
                <div><label>Timer</label><select id="examTimerMinutes"><option value="0">None</option><option selected value="30">30</option><option value="60">60</option></select></div>
                <div><label>Difficulty</label><select id="examDifficulty"><option value="all">All</option><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
              </div>
              <button class="btn btn-accent btn-block mt-2" id="btnStartExam">${uiIcon("rocket")} Start Exam</button>
            </div>`;
        }

        async function renderExamInProgress() {
            const idx = AppState.examAnswers.currentIndex || 0;
            const total = AppState.examQuestions.length;
            const q = AppState.examQuestions[idx];
            if (!q) { AppState.examInProgress = false; return renderExamResults(); }
            const sel = AppState.examAnswers[q.id] || '';
            const timerHtml = AppState.examTimeRemaining > 0 ? `<div class="timer-display" id="examTimerDisplay">${formatTime(AppState.examTimeRemaining)}</div>` : '';
            const bmIds=await db.getAllBookmarkedIds();
            const bmCount=bmIds.length;
            const isBm=bmIds.includes(q.id);
            return `
            <div class="card">
              <div style="display:flex;justify-content:space-between;"><span class="badge badge-primary">Q ${idx+1}/${total}</span><span class="badge badge-accent">${uiIcon("star-filled")} ${bmCount}</span>${timerHtml}</div>
              <div class="progress-bar"><div class="progress-fill" style="width:${((idx+1)/total)*100}%"></div></div>
            </div>
            <div class="question-block">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div class="question-text" style="flex:1;">${idx+1}. ${escapeHTML(q.questionText)}</div><button class="btn btn-sm btn-outline bookmark-btn" data-qid="${escapeHTML(q.id)}" title="Bookmark" aria-label="Toggle bookmark">${isBm?(uiIcon("bookmark-filled")):(uiIcon("bookmark"))}</button></div>
              ${QuestionImages.render(q, 'question')}
              ${['A','B','C','D','E'].map(l=> q[`option${l}`] ? `<button class="option-btn ${sel===l?'selected':''}" data-option="${l}" aria-pressed="${sel===l}"><span class="option-label">${l}.</span> <span class="option-content" dir="auto">${escapeHTML(q[`option${l}`])}</span></button>` : '').join('')}
              ${renderQuestionBookLocation(q)}
            </div>
            <div class="exam-actions">
              <button class="btn btn-outline btn-sm" id="btnPrevQ" ${idx===0?'disabled':''}>${uiIcon("chevron-left")} Prev</button>
              <button class="btn btn-danger btn-sm" id="btnEndExam">${uiIcon("stop")} End</button>
              <button class="btn btn-primary btn-sm" id="btnNextQ">${idx<total-1?("Next " + uiIcon("play")):("Submit " + uiIcon("check"))}</button>
            </div>`;
        }

        function renderExamResults() {
            const results = AppState.lastExamResults || [];
            const total = results.length;
            const score = results.filter(r => r.correct).length;
            const pct = total ? Math.round((score / total) * 100) : 0;
            const elapsed = AppState.examStartTime ? Math.max(0, Math.round(((AppState.examSubmittedAt || Date.now()) - AppState.examStartTime) / 1000)) : 0;
            return `
            <div class="card text-center" style="padding-top: 30px; padding-bottom: 30px;">
              <div style="font-size:4rem; margin-bottom: 10px;">${pct>=70?(uiIcon("trophy")):(uiIcon("library"))}</div>
              <h2>Exam Complete</h2>
              ${AppState._examSaveError ? '<p role="alert" style="color:var(--danger);">Results could not be saved. Keep this session and retry.</p><button class="btn btn-primary btn-block" id="btnRetryExamSave">Retry Save</button>' : ''}
              <div class="stat-value" style="font-size: 3rem; margin: 15px 0;">${pct}%</div>
              <p style="font-size: 1.1rem; color: var(--text2); margin-bottom: 25px;">${score} out of ${total} correct<br>Time taken: ${formatTime(elapsed)}</p>
              <button class="btn btn-primary btn-block" id="btnReviewExam" style="margin-bottom: 10px; font-size: 1.1rem; padding: 14px;">${uiIcon("search")} Review Answers & Explanations</button>
              <button class="btn btn-outline btn-block" data-nav="dashboard">${uiIcon("dashboard")} Go to Dashboard</button>
            </div>`;
        }

        // --- FULLY REDESIGNED REVIEW SYSTEM ---
        function reviewExamResults() {
            if (!AppState.lastExamResults) return;
            const html = AppState.lastExamResults.map((r, i) => {
                const optionsHtml = ['A','B','C','D','E'].map(l => {
                    if (!r[`option${l}`]) return '';
                    let btnClass = '';
                    let labelStatus = '';
                    if (l === r.correctAnswer) {
                        btnClass = 'correct';
                        labelStatus = ("<span style=\"float:right; font-weight:bold;\">" + uiIcon("check") + " Correct Answer</span>");
                    } else if (l === r.userAnswer && !r.correct) {
                        btnClass = 'wrong';
                        labelStatus = ("<span style=\"float:right; font-weight:bold;\">" + uiIcon("x") + " Your Answer</span>");
                    }
                    return `<div class="option-btn ${btnClass}" style="cursor:default;">
                                <span class="option-label">${l}.</span> <span class="option-content" dir="auto">${escapeHTML(r[`option${l}`])}</span>
                                ${labelStatus}
                            </div>`;
                }).join('');
                const explanationHtml = r.explanation ?
                    `<div class="explanation-box" style="margin-top: 15px;">
                        <strong>Explanation:</strong><br/>${escapeHTML(r.explanation)}
                    </div>` : '';
                return `
                <div class="question-block">
                    <div class="question-text">
                        ${i+1}. ${escapeHTML(r.questionText)}
                        <span class="badge ${r.correct ? 'badge-success' : 'badge-danger'}" style="margin-left: 8px;">
                            ${r.correct ? (uiIcon("check") + " Correct") : (uiIcon("x") + " Incorrect")}
                        </span>
                    </div>
                    ${QuestionImages.render(r, 'question')}
                    ${optionsHtml}
                    ${explanationHtml}
                    ${QuestionImages.render(r, 'explanation')}
                    ${renderQuestionReference(r)}
                </div>`;
            }).join('');
            $('#mainContent').innerHTML = `
                <div class="card">
                    <div class="card-header">${uiIcon("search")} Exam Review</div>
                    <p style="color:var(--text2);font-size:0.9rem;">Review your performance below. Correct answers are highlighted in green, and your incorrect selections are highlighted in red.</p>
                </div>
                ${html}
                <div style="margin-bottom: 30px;">
                    <button class="btn btn-primary btn-block" data-nav="exam">${uiIcon("exam")} Start New Exam</button>
                </div>
            `;
            attachEventListeners();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        /**
         * QUESTION LIST — Optimized path:
         * 1. Ensures search index is built (fast in-memory lookup).
         * 2. Uses FilterCache keyed by filter hash + DB cache version.
         * 3. Falls back to Web Worker for heavy filtering if available.
         * 4. Renders a virtual-scroll container instead of inline HTML for
         *    all questions, supporting 100k+ items with only ~15 DOM nodes.
         * 5. Infinite scroll loads 50 items at a time; smart loader prevents
         *    duplicate fetches and resets correctly on filter change.
         */
        async function renderQuestionList() {
            // Capture input before any await so a later keystroke cannot be overwritten by this render.
            const sq = String(AppState.searchQuery || '').trim();
            const request = AppState._questionRenderRequest = (AppState._questionRenderRequest || 0) + 1;
            const qf = { ...(AppState.questionFilters || { subject:'all', chapter:'all', topic:'all', difficulty:'all', special:'all' }) };
            const cacheVersion = db._cacheVersion;
            const [questions, bmIds, hyIds, performanceRows] = await Promise.all([
                db.getAllQuestions(), db.getAllBookmarkedIds(), db.getAllHighYieldIds(), db.getPerformance()
            ]);
            const latest = new Map();
            for (const row of performanceRows) {
                const previous = latest.get(row.questionId);
                if (!previous || (Date.parse(row.timestamp) || 0) >= (Date.parse(previous.timestamp) || 0)) latest.set(row.questionId, row);
            }
            const missedIds = [...latest].filter(([, row]) => row.correct === false).map(([id]) => id);
            const filtered = await FilterCache.get(qf, sq ? (ENTSearch.normalize(sq) || '\u0000') : '', cacheVersion, async () => {
                const ranked = await GlobalSearchIndex.findQuestions(sq, questions);
                let result = ENTSearch.filterQuestions(ranked, qf, { bmIds, hyIds, missedIds });
                return result;
            });
            // Only the render that still owns this input may publish virtual-scroller state.
            if (request !== AppState._questionRenderRequest || sq !== String(AppState.searchQuery || '').trim() || JSON.stringify(qf) !== JSON.stringify(AppState.questionFilters || qf)) return '';
            window.__bmIds = bmIds; window.__hyIds = hyIds; window.__missedIds = missedIds;
            AppState._lastFilteredQuestions = filtered;
            AppState._lastFilterMeta = { bmIds, hyIds, missedIds };

            // Topic filter options from full question set (not filtered)
            const topicsSet = new Set(aylaTopicsFor(qf.subject, qf.chapter, questions));
            questions.forEach(q => topicsSet.add(q.topic || 'General'));
            const topicOpts = '<option value="all">All</option>' + [...topicsSet].sort().map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');

            return `
            <div class="card">
              <div class="card-header">${uiIcon("questions")} Questions (${filtered.length})</div>
              <div class="search-field">${uiIcon("search")}<input type="text" id="questionSearchInput" placeholder="Search questions, options, topics, books or references..." value="${escapeHTML(AppState.searchQuery)}"></div>
              <div class="form-row">
                <div><select id="questionSubjectFilter"><option value="all">All Subjects</option></select></div>
                <div><select id="questionChapterFilter"><option value="all">All Chapters</option></select></div>
                <div><select id="questionTopicFilter">${topicOpts}</select></div>
              </div>
              <div class="form-row">
                <div><select id="questionDifficultyFilter"><option value="all">All Difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                <button class="btn btn-sm btn-outline" data-qfilter="all">All</button>
                <button class="btn btn-sm btn-outline" data-qfilter="bookmarked">${uiIcon("bookmark")} Bookmarked</button>
                <button class="btn btn-sm btn-outline" data-qfilter="highyield">${uiIcon("flame")} High Yield</button>
                <button class="btn btn-sm btn-outline" data-qfilter="missed">${uiIcon("x")} Missed</button>
              </div>
              ${RBAC.isAdmin() ? `<button class="btn btn-sm btn-primary" id="btnAddQuestion">${uiIcon("plus")} Add</button>` : ''}
            </div>
            <!-- Virtual Scroll Container -->
            <div id="questionListContainer" style="max-height:75vh;overflow:auto;position:relative;border-radius:12px;">
              <div id="questionListContent"></div>
            </div>
            <div id="questionListLoader" style="text-align:center;padding:14px;color:var(--text2);font-size:0.85rem;display:none;">Loading more...</div>
            ${filtered.length>50?'<p style="color:var(--text2);padding:8px;">Showing items dynamically. Scroll to load more.</p>':''}
            ${filtered.length===0?'<div class="empty-state"><h3>No questions found</h3><p>Add or import questions to get started.</p></div>':''}`;
        }

        /**
         * Render a single question block for the virtual scroller.
         * Kept as a pure function so it can be called thousands of times
         * without closure leaks.
         */
        function renderQuestionBlock(q, index, meta) {
            const { bmIds } = meta || {};
            const isBm = bmIds ? bmIds.includes(q.id) : false;
            return `
            <div class="question-block" data-qid="${escapeHTML(q.id)}">
              <div style="display:flex;justify-content:space-between;">
                <strong>${highlightText(q.questionText?.substring(0,100), AppState.searchQuery)}</strong>
                <button class="btn-icon btn-sm bookmark-btn" data-qid="${escapeHTML(q.id)}" aria-label="Toggle bookmark">${isBm?(uiIcon("bookmark-filled")):(uiIcon("bookmark"))}</button>
              </div>
              <div class="flex-wrap">
                <span class="badge badge-primary">${escapeHTML(q.subject||'Uncategorized')}</span>
                <span class="badge badge-accent">${escapeHTML(q.chapter||'General')}</span>
                ${q.group ? `<span class="badge badge-group">${escapeHTML(q.group)}</span>` : ''}
              </div>
              <button class="btn btn-sm btn-outline view-q-btn" data-qid="${escapeHTML(q.id)}">${uiIcon("eye")} View</button>
            </div>`;
        }

        async function renderMistakes() {
            const perf = await db.getPerformance();
            const latest = {};
            perf.forEach(x => {
                const key = x.questionId;
                if (!latest[key] || new Date(x.timestamp) > new Date(latest[key].timestamp)) {
                    latest[key] = { correct: x.correct, timestamp: x.timestamp };
                }
            });
            const wrongIds = Object.keys(latest)
                .filter(id => latest[id].correct === false)
                .map(id => Number(id));
            const questions = await db.getAllQuestions();
            const missed = questions.filter(q => wrongIds.includes(q.id));

            return `
            <div class="card">
              <div class="card-header">${uiIcon("x")} Missed Questions Bank</div>
              <p>${missed.length} missed questions</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-danger" id="btnExamFromMistakes">${uiIcon("exam")} Exam From Mistakes</button>
              <button class="btn btn-outline" data-nav="dashboard">${uiIcon("arrow-left")} Dashboard</button>
              </div>
            </div>
            ${missed.map(q=>`
              <div class="question-block">
                <div class="question-text">${escapeHTML(q.questionText || '')}</div>
                ${QuestionImages.render(q, 'question')}
                <span class="badge badge-danger">${escapeHTML(q.subject || 'Uncategorized')}</span>
                 <div style="margin-top:8px"><strong>Correct Answer:</strong> ${escapeHTML(q.correctAnswer||'-')}</div>
                 <div style="margin-top:4px"><strong>Explanation:</strong> ${escapeHTML(q.explanation||'No explanation')}</div>
                 ${QuestionImages.render(q, 'explanation')}
                 ${renderQuestionReference(q)}
                 <div style="margin-top:8px;display:flex;gap:8px">
                    <button class="btn btn-sm btn-primary retry-question" data-qid="${escapeHTML(q.id)}">${uiIcon("refresh")} Retry</button>
                    <button class="btn btn-sm btn-accent add-hy" data-qid="${escapeHTML(q.id)}">${uiIcon("star-filled")} High Yield</button>
                 </div>
              </div>
            `).join('') || '<div class="empty-state">No missed questions.</div>'}`;
        }

        async function renderHighYield() {
            const hyIds = await db.getAllHighYieldIds();
            const allQuestions = await db.getAllQuestions();
            const hyQuestions = allQuestions.filter(q => hyIds.includes(q.id));

            return `
            <div class="card">
              <div class="card-header">${uiIcon("star-filled")} High Yield Questions</div>
              <p>${hyQuestions.length} high‑yield questions</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-outline" data-nav="dashboard">${uiIcon("arrow-left")} Dashboard</button>
              </div>
            </div>
            ${hyQuestions.length === 0 ? '<div class="empty-state">No high‑yield questions marked yet.</div>' :
              hyQuestions.map(q => `
                <div class="question-block">
                  <div class="question-text">${escapeHTML(q.questionText)}</div>
                  <div class="flex-wrap">
                    <span class="badge badge-primary">${escapeHTML(q.subject || 'Uncategorized')}</span>
                    <span class="badge badge-accent">${escapeHTML(q.chapter || 'General')}</span>
                  </div>
                  <div style="margin-top:8px;display:flex;gap:8px">
                    <button class="btn btn-sm btn-danger remove-hy" data-qid="${escapeHTML(q.id)}">${uiIcon("star-filled")} Remove High Yield</button>
                    <button class="btn btn-sm btn-outline view-q-btn" data-qid="${escapeHTML(q.id)}">${uiIcon("eye")} View</button>
                  </div>
                </div>
              `).join('')}
            `;
        }

        async function renderStudyQuestion() {
            if (!AppState.studyQuestions || AppState.studyIndex >= AppState.studyQuestions.length) {
                $('#studyArea').innerHTML = '<div class="card text-center"><h3>Session Complete!</h3><button class="btn btn-primary" data-nav="study">New Session</button></div>';
                saveSession();
                return;
            }
            const q = AppState.studyQuestions[AppState.studyIndex];
            const isBm = await db.isBookmarked(q.id);
            const reveal = AppState.studyRevealed[q.id];
            let html = `
            <div class="card">
              <div style="display:flex;justify-content:space-between;"><span class="badge badge-primary">${AppState.studyIndex+1}/${AppState.studyQuestions.length}</span><button class="btn-icon btn-sm" id="studyBookmark" aria-label="Toggle bookmark" data-qid="${escapeHTML(q.id)}">${isBm?(uiIcon("bookmark-filled")):(uiIcon("bookmark"))}</button><button class="btn-icon btn-sm" id="studyHighYield" aria-label="Toggle high yield" data-qid="${escapeHTML(q.id)}">${uiIcon("flame")}</button></div>
              <div class="progress-bar"><div class="progress-fill" style="width:${((AppState.studyIndex+1)/AppState.studyQuestions.length)*100}%"></div></div>
            </div>
            <div class="question-block">
              <div class="question-text">${AppState.studyIndex+1}. ${escapeHTML(q.questionText)}</div>
              ${QuestionImages.render(q, 'question')}
              ${['A','B','C','D','E'].map(l=> q[`option${l}`] ? `<button class="option-btn ${AppState.studyAnswers[q.id]===l?'selected':''} ${reveal?(l===q.correctAnswer?'correct':(AppState.studyAnswers[q.id]===l?'wrong':'')):''}" data-study-opt="${l}" ${reveal?'disabled':''}><span class="option-label">${l}.</span> <span class="option-content" dir="auto">${escapeHTML(q[`option${l}`])}</span></button>` : '').join('')}
              ${reveal ? `<div class="explanation-box"><strong>${uiIcon("check")} ${escapeHTML(q.correctAnswer)}</strong>: ${escapeHTML(q.explanation||'No explanation provided.')}</div>` : ''}
              ${reveal ? renderQuestionReference(q) : ''}
              ${reveal ? QuestionImages.render(q, 'explanation') : ''}
              ${renderQuestionBookLocation(q)}
            </div>
            <div class="study-actions">
              <button class="btn btn-outline btn-sm" id="btnStudyPrev" aria-label="Previous question" ${AppState.studyIndex===0?'disabled':''}>${uiIcon("chevron-left")}</button>
              ${!reveal?`<button class="btn btn-accent btn-sm" id="btnReveal">${uiIcon("eye")} Reveal</button>`:''}
              <button class="btn btn-primary btn-sm" id="btnStudyNext" aria-label="Next question">${uiIcon("play")}</button>
            </div>`;
            $('#studyArea').innerHTML = html;
            attachStudyListeners(q);
            saveSession();
        }

        function attachStudyListeners(q) {
            const bookmarkBtn = $('#studyBookmark');
            if (bookmarkBtn) {
                bookmarkBtn.addEventListener('click', async function() {
                    const id = parseInt(this.dataset.qid);
                    const bm = await db.toggleBookmark(id);
                    this.innerHTML = bm ? (uiIcon("bookmark-filled")) : (uiIcon("bookmark"));
                    saveSession();
                });
            }
            const hyBtn = $('#studyHighYield');
            if (hyBtn) {
                hyBtn.addEventListener('click', async function() {
                    const id = parseInt(this.dataset.qid);
                    const isHy = await db.toggleHighYield(id);
                    this.innerHTML = isHy ? (uiIcon("flame")) : (uiIcon("star"));
                    showToast(isHy ? 'Added to High Yield' : 'Removed from High Yield', 'success');
                    saveSession();
                });
            }
            $$('[data-study-opt]').forEach(b => {
                b.addEventListener('click', async function() {
                    const selected = this.dataset.studyOpt;
                    AppState.studyAnswers[q.id] = selected;
                    AppState.studyRevealed[q.id] = true;
                    try {
                        await db.recordPerformance({
                            questionId: q.id,
                            subject: q.subject || 'Unknown',
                            chapter: q.chapter || 'Unknown',
                            topic: q.topic || 'Unknown',
                            correct: selected === q.correctAnswer,
                            timestamp: new Date().toISOString()
                        });
                        await recordStudyActivity();
                    } catch(e) {
                        console.error('Performance tracking error', e);
                    }
                    renderStudyQuestion();
                });
            });
            const revealBtn = $('#btnReveal');
            if (revealBtn) revealBtn.addEventListener('click', () => { AppState.studyRevealed[q.id] = true; renderStudyQuestion(); });
            const nextBtn = $('#btnStudyNext');
            if (nextBtn) nextBtn.addEventListener('click', () => { AppState.studyIndex++; renderStudyQuestion(); });
            const prevBtn = $('#btnStudyPrev');
            if (prevBtn) prevBtn.addEventListener('click', () => { AppState.studyIndex = Math.max(0, AppState.studyIndex - 1); renderStudyQuestion(); });
        }

        function createExamAttemptId() {
            return 'exam-' + (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
        }

        function resetExamAttempt() {
            if (AppState.examInProgress && AppState.examQuestions.length) {
                showToast('Resume or finish your saved exam before starting another.', 'warning');
                resumeExam();
                return false;
            }
            if (AppState.examAttemptId && AppState.examSubmittedAt && !AppState._examSaved && AppState.lastExamResults?.length) {
                AppState.examShowResults = true;
                showToast('Save the previous exam results before starting another exam.', 'warning');
                renderViewSafely('exam');
                return false;
            }
            AppState.examAttemptId = createExamAttemptId();
            AppState.examSubmittedAt = null;
            AppState.examEndsAt = null;
            AppState.examSuspended = false;
            AppState.examResultsPendingReview = false;
            AppState._examSaved = false;
            AppState._examSavePromise = null;
            AppState._examSaveError = false;
            return true;
        }

        function persistExamAttempt() {
            const results = AppState.lastExamResults;
            if (AppState._examSaved || !Array.isArray(results) || results.length === 0) return Promise.resolve(null);
            if (AppState._examSavePromise) return AppState._examSavePromise;
            if (!AppState.examAttemptId) AppState.examAttemptId = createExamAttemptId();
            if (!AppState.examSubmittedAt) AppState.examSubmittedAt = Date.now();
            const attemptId = AppState.examAttemptId;
            const submittedAt = AppState.examSubmittedAt;
            const timestamp = new Date(submittedAt).toISOString();
            const score = results.filter(row => row.correct).length;
            const elapsed = AppState.examStartTime ? Math.max(0, Math.round((submittedAt - AppState.examStartTime) / 1000)) : 0;
            const summary = { score, total: results.length, percentage: Math.round(score * 100 / results.length), elapsed, date: timestamp };
            const performanceRows = results.map(row => ({
                questionId: row.id, questionUid: row.uid || null,
                subject: row.subject || 'Unknown', chapter: row.chapter || 'Unknown', topic: row.topic || 'Unknown',
                userAnswer: row.userAnswer || '', correctAnswer: row.correctAnswer || '',
                answered: !!row.userAnswer, correct: row.correct === true, timestamp, source: 'exam'
            }));
            AppState._examSaveError = false;
            // Save the attempt ID and immutable submission before the database commit.
            _doSaveSession();
            const pending = Promise.resolve()
                .then(() => db.saveExamAttempt({ attemptId, summary, performanceRows }))
                .then(savedId => {
                    if (AppState.examAttemptId === attemptId) {
                        AppState._examSaved = true;
                        AppState._examSaveError = false;
                        _doSaveSession();
                    }
                    return savedId;
                })
                .catch(error => {
                    if (AppState.examAttemptId === attemptId) {
                        AppState._examSaved = false;
                        AppState._examSaveError = true;
                        _doSaveSession();
                    }
                    throw error;
                })
                .finally(() => { if (AppState._examSavePromise === pending) AppState._examSavePromise = null; });
            AppState._examSavePromise = pending;
            return pending;
        }

        async function submitExam({ showResults = !AppState.examSuspended, timedOut = false } = {}) {
            if (!AppState.examQuestions.length) return;
            closeExamLeaveDialog();
            if (AppState.examTimer) { clearInterval(AppState.examTimer); AppState.examTimer = null; }
            if (!AppState.examSubmittedAt || !Array.isArray(AppState.lastExamResults)) {
                const answers = AppState.examAnswers;
                AppState.lastExamResults = AppState.examQuestions.map(q => ({
                    ...q,
                    userAnswer: answers[q.id] || '',
                    correct: !!answers[q.id] && answers[q.id] === q.correctAnswer
                }));
                const deadlineReached = Number.isFinite(AppState.examEndsAt) && Date.now() >= AppState.examEndsAt;
                AppState.examSubmittedAt = (timedOut || deadlineReached) && Number.isFinite(AppState.examEndsAt) ? Math.min(Date.now(), AppState.examEndsAt) : Date.now();
            }
            AppState.examInProgress = false;
            AppState.examSuspended = false;
            AppState.examShowResults = showResults;
            AppState.examResultsPendingReview = !showResults;
            const submittedResults = AppState.lastExamResults;
            try {
                await persistExamAttempt();
            } catch (error) {
                console.error('Exam results were not saved:', error);
                showToast('Exam results were not saved. Use Retry Save below.', 'error');
            }
            if (AppState.lastExamResults === submittedResults) {
                if (showResults && AppState.examShowResults) await performNavigation('exam');
                else if (!AppState.examInProgress) await renderViewSafely(AppState.currentView);
            }
        }

        // ============================================================
        //  MODALS
        // ============================================================
        function showQuestionModal(q) {
            window.__questionImageFormRequest = (window.__questionImageFormRequest || 0) + 1;
            const html = q ? `
            <h3>Question</h3>
            <div class="question-block">
              <div class="question-text">${escapeHTML(q.questionText)}</div>
              ${QuestionImages.render(q, 'question')}
              ${['A','B','C','D','E'].map(l=> q[`option${l}`]?`<div class="option-btn ${l===q.correctAnswer?'correct':''}"><span class="option-label">${l}.</span> <span class="option-content" dir="auto">${escapeHTML(q[`option${l}`])}</span></div>`:'').join('')}
              ${q.explanation ? `<div class="explanation-box">${escapeHTML(q.explanation)}</div>` : ''}
              ${QuestionImages.render(q, 'explanation')}
              ${renderQuestionReference(q)}
              <div class="flex-wrap" style="margin-top:10px;">
                <span class="badge badge-primary">${escapeHTML(q.subject||'Uncategorized')}</span>
                <span class="badge badge-accent">${escapeHTML(q.chapter||'General')}</span>
                ${q.group ? `<span class="badge badge-group">${escapeHTML(q.group)}</span>` : ''}
              </div>
            </div>
            <button class="btn btn-outline btn-block" onclick="closeModal()">Close</button>` : '<h3>Question not found</h3><button class="btn btn-outline btn-block" onclick="closeModal()">Close</button>';
            const overlay = $('#modalOverlay'); const content = $('#modalContent');
            content.innerHTML = html; overlay.classList.remove('hidden');
            overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
        }

        async function startExamFromLecture(l) {
            let questions = await db.getAllQuestions();
            if (l.subject) questions = questions.filter(q => (q.subject || '') === l.subject);
            if (l.chapter) questions = questions.filter(q => (q.chapter || '') === l.chapter);
            if (l.book) questions = questions.filter(q => (q.book || '') === l.book);
            if (questions.length === 0) { showToast('No questions match this lecture.', 'warning'); return; }
            if (!resetExamAttempt()) return;
            AppState.examQuestions = [...questions].sort(() => Math.random() - 0.5).slice(0, Math.min(20, questions.length));
            AppState.examAnswers = { currentIndex: 0 };
            AppState.examInProgress = true;
            AppState.examShowResults = false; AppState.lastExamResults = null;
            AppState.examTimeRemaining = 0; AppState.examStartTime = Date.now();
            resumeExam();
        }

        async function startExamFromLectureAttached(lectureId) {
            const allQuestions = await db.getAllQuestions();
            const questions = allQuestions.filter(q => q.lectureId === lectureId);
            if (questions.length === 0) { showToast('No MCQs are attached to this lecture yet. Add them from "Add Lecture" with the MCQ JSON field.', 'warning'); return; }
            if (!resetExamAttempt()) return;
            AppState.examQuestions = [...questions].sort(() => Math.random() - 0.5).slice(0, Math.min(20, questions.length));
            AppState.examAnswers = { currentIndex: 0 };
            AppState.examInProgress = true;
            AppState.examShowResults = false; AppState.lastExamResults = null;
            AppState.examTimeRemaining = 0; AppState.examStartTime = Date.now();
            resumeExam();
        }

        async function startExamFromChapterAllBooks(l) {
            let questions = await db.getAllQuestions();
            if (l.subject) questions = questions.filter(q => (q.subject || '') === l.subject);
            if (l.chapter) questions = questions.filter(q => (q.chapter || '') === l.chapter);
            if (questions.length === 0) { showToast('No questions found for this chapter yet.', 'warning'); return; }
            if (!resetExamAttempt()) return;
            AppState.examQuestions = [...questions].sort(() => Math.random() - 0.5).slice(0, Math.min(20, questions.length));
            AppState.examAnswers = { currentIndex: 0 };
            AppState.examInProgress = true;
            AppState.examShowResults = false; AppState.lastExamResults = null;
            AppState.examTimeRemaining = 0; AppState.examStartTime = Date.now();
            resumeExam();
        }

        function attachEventListeners() {
            const completedExamButton = $('#btnViewExamResults');
            if (completedExamButton) completedExamButton.addEventListener('click', viewExamResults);
            const resumeExamButton = $('#btnResumeExam');
            if (resumeExamButton) resumeExamButton.addEventListener('click', resumeExam);
            $$('[data-nav]').forEach(btn => { btn.addEventListener('click', function() { const view = this.dataset.nav; if (view) navigateTo(view); }); });

            // Exam subject/chapter
            const examSubject = $('#examSubject');
            if (examSubject) {
                examSubject.addEventListener('change', async function() {
                    const subject = this.value;
                    const taxonomy = computeTaxonomy(await db.getAllQuestions());
                    if ($('#examSubject') !== this || this.value !== subject) return;
                    const chapters = subject === 'all' ? taxonomy.allChapters : taxonomy.chaptersBySubject[subject] || ['General'];
                    const chSel = $('#examChapter');
                    if (chSel) {
                        chSel.innerHTML = '<option value="all">All</option>' + chapters.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
                        chSel.value = 'all'; chSel.dispatchEvent(new Event('change'));
                    }
                });
                setTimeout(() => examSubject.dispatchEvent(new Event('change')), 10);
            }

            // Study filters
            const studySubject = $('#studySubject');
            if (studySubject) studySubject.addEventListener('change', function() { AppState.studyFilter.subject = this.value; AppState.studyFilter.chapter = 'all'; AppState.studyFilter.topic = 'all'; AppState.studyFilter.subtopic = 'all'; navigateTo('study'); });
            const studyChapter = $('#studyChapter');
            if (studyChapter) studyChapter.addEventListener('change', function() { AppState.studyFilter.chapter = this.value; AppState.studyFilter.topic = 'all'; AppState.studyFilter.subtopic = 'all'; navigateTo('study'); });
            const studyTopic = $('#studyTopic');
            if (studyTopic) studyTopic.addEventListener('change', function() { AppState.studyFilter.topic = this.value; AppState.studyFilter.subtopic = 'all'; navigateTo('study'); });
            const studySubtopic = $('#studySubtopic');
            if (studySubtopic) studySubtopic.addEventListener('change', function() { AppState.studyFilter.subtopic = this.value; navigateTo('study'); });
            const studyBook = $('#studyBook');
            if (studyBook) studyBook.addEventListener('change', function() { AppState.studyFilter.book = this.value; navigateTo('study'); });

            // Study mode buttons
            $$('[data-study-mode]').forEach(btn => { btn.addEventListener('click', function() { AppState.studyFilter.mode = this.dataset.studyMode; if(this.dataset.studyMode !== 'lectureReader') AppState.studyFilter.lectureId = null; navigateTo('study'); }); });

            // --- LECTURE LISTENERS ---
            $$('.lecture-card').forEach(card => {
                card.addEventListener('click', function(e) {
                    if (e.target.closest('.lecture-exam-btn')) return;
                    AppState.studyFilter.lectureId = parseInt(this.dataset.lid);
                    AppState.studyFilter.mode = 'lectureReader';
                    renderViewSafely('study');
                });
            });
            $$('.lecture-exam-btn').forEach(btn => {
                btn.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const lid = parseInt(this.dataset.lid);
                    const l = await db.getLecture(lid);
                    if (!l) return;
                    await startExamFromLecture(l);
                });
            });
            const btnAddLecture = $('#btnAddLecture');
            if (btnAddLecture) btnAddLecture.addEventListener('click', () => showAddLectureModal());
            const btnDeleteLecture = $('#btnDeleteLecture');
            if (btnDeleteLecture) {
                btnDeleteLecture.addEventListener('click', async function() {
                    const lid = parseInt(this.dataset.lid);
                    if (!confirm('Delete this lecture?')) return;
                    await db.deleteLecture(lid);
                    showToast('Lecture deleted', 'success');
                    AppState.studyFilter.mode = 'lectures';
                    AppState.studyFilter.lectureId = null;
                    renderViewSafely('study');
                });
            }
            const btnExamLectureAttached = $('#btnExamLectureAttached');
            if (btnExamLectureAttached) {
                btnExamLectureAttached.addEventListener('click', async function() {
                    const lid = parseInt(this.dataset.lid);
                    await startExamFromLectureAttached(lid);
                });
            }
            const btnExamChapterAllBooks = $('#btnExamChapterAllBooks');
            if (btnExamChapterAllBooks) {
                btnExamChapterAllBooks.addEventListener('click', async function() {
                    const l = { subject: this.dataset.subj, chapter: this.dataset.chap };
                    await startExamFromChapterAllBooks(l);
                });
            }
            const lectureSubject = $('#lectureSubjectFilter');
            if (lectureSubject) lectureSubject.addEventListener('change', function() { AppState.studyFilter.subject = this.value; AppState.studyFilter.chapter = 'all'; renderViewSafely('study'); });
            const lectureChapter = $('#lectureChapterFilter');
            if (lectureChapter) lectureChapter.addEventListener('change', function() { AppState.studyFilter.chapter = this.value; renderViewSafely('study'); });

            // Start study
            const startStudy = $('#btnStartStudy');
            if (startStudy) {
                startStudy.addEventListener('click', async function() {
                    const questions = await db.getAllQuestions(); const sf = AppState.studyFilter;
                    let filtered = questions;
                    if (sf.subject !== 'all') filtered = filtered.filter(q => (q.subject || 'Uncategorized') === sf.subject);
                    if (sf.chapter !== 'all') filtered = filtered.filter(q => (q.chapter || 'General') === sf.chapter);
                    if (sf.topic !== 'all') filtered = filtered.filter(q => (q.topic || 'General') === sf.topic);
                    if (sf.subtopic !== 'all') filtered = filtered.filter(q => ((q.subtopic || 'General') === sf.subtopic));
                    if (sf.book !== 'all') filtered = filtered.filter(q => (q.book || '') === sf.book);
                    if (sf.mode === 'bookmarked') { const bIds = await db.getAllBookmarkedIds(); filtered = filtered.filter(q => bIds.includes(q.id)); }
                    if (sf.mode === 'highyield') { const hyIds = await db.getAllHighYieldIds(); filtered = filtered.filter(q => hyIds.includes(q.id)); }
                    if (filtered.length === 0) { showToast('No questions match filters.', 'warning'); return; }
                    AppState.studyQuestions = [...filtered].sort(() => Math.random() - 0.5);
                    AppState.studyIndex = 0; AppState.studyAnswers = {}; AppState.studyRevealed = {};
                    renderStudyQuestion();
                });
            }

            // Question list filters
            const qf = AppState.questionFilters;
            const qSubject = $('#questionSubjectFilter');
            const qChapter = $('#questionChapterFilter');
            if (qSubject || qChapter) {
                (async () => {
                    const taxonomy = computeTaxonomy(await db.getAllQuestions());
                    if (qSubject) {
                        qSubject.innerHTML = '<option value="all">All Subjects</option>' + taxonomy.subjects.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('');
                        qSubject.value = qf.subject;
                    }
                    if (qChapter) {
                        let chapters = taxonomy.allChapters;
                        if (qf.subject !== 'all' && taxonomy.chaptersBySubject[qf.subject]) chapters = taxonomy.chaptersBySubject[qf.subject];
                        qChapter.innerHTML = '<option value="all">All Chapters</option>' + chapters.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
                        qChapter.value = qf.chapter;
                    }
                })();
            }
            if (qSubject) {
                qSubject.addEventListener('change', function() {
                    AppState.questionFilters.subject = this.value;
                    AppState.questionFilters.chapter = 'all';
                    renderViewSafely('questions');
                });
            }
            if (qChapter) {
                qChapter.addEventListener('change', function() {
                    AppState.questionFilters.chapter = this.value;
                    renderViewSafely('questions');
                });
            }
            const qTopic = $('#questionTopicFilter');
            if (qTopic) {
                qTopic.value = qf.topic;
                qTopic.addEventListener('change', function() {
                    AppState.questionFilters.topic = this.value;
                    renderViewSafely('questions');
                });
            }
            const qDiff = $('#questionDifficultyFilter');
            if (qDiff) {
                qDiff.value = qf.difficulty;
                qDiff.addEventListener('change', function() {
                    AppState.questionFilters.difficulty = this.value;
                    renderViewSafely('questions');
                });
            }
            $$('[data-qfilter]').forEach(btn => {
                btn.addEventListener('click', function() {
                    const special = this.dataset.qfilter;
                    AppState.questionFilters.special = special;
                    renderViewSafely('questions');
                });
            });

            // Start exam
            const startExam = $('#btnStartExam');
            if (startExam) {
                startExam.addEventListener('click', async function() {
                    try {
                        const selectedSubjects = ($('#examSubject')?.value && $('#examSubject').value!=='all') ? [$('#examSubject').value] : [];
                        const selectedChapters = ($('#examChapter')?.value && $('#examChapter').value!=='all') ? [$('#examChapter').value] : [];
                        const selectedGroups = ($('#examBook')?.value && $('#examBook').value!=='all') ? [$('#examBook').value] : [];
                        const count = parseInt($('#examCount')?.value || 20); const timerMin = parseInt($('#examTimerMinutes')?.value || 0);
                        const difficulty = $('#examDifficulty')?.value || 'all';
                        let questions = await db.getAllQuestions();
                        if (selectedSubjects.length) questions = questions.filter(q => selectedSubjects.includes(q.subject || 'Uncategorized'));
                        if (selectedChapters.length) questions = questions.filter(q => selectedChapters.includes(q.chapter || 'General'));
                        if (selectedGroups.length) questions = questions.filter(q => selectedGroups.includes(q.group || ''));
                        if (difficulty !== 'all') questions = questions.filter(q => q.difficulty === difficulty);
                        if (questions.length === 0) { showToast('No questions available.', 'warning'); return; }
                        if (!resetExamAttempt()) return;
                        AppState.examQuestions = [...questions].sort(() => Math.random() - 0.5).slice(0, Math.min(count, questions.length));
                        AppState.examAnswers = { currentIndex: 0 };
                        AppState.examInProgress = true;
                        AppState.examShowResults = false; AppState.lastExamResults = null;
                        AppState.examTimeRemaining = timerMin * 60; AppState.examStartTime = Date.now();
                        resumeExam();
                    } catch (e) { showToast('Error: ' + e.message, 'error'); }
                });
            }

            const nextQ = $('#btnNextQ');
            if (nextQ) {
                nextQ.addEventListener('click', function() {
                    const idx = AppState.examAnswers.currentIndex || 0;
                    if (checkExamDeadline()) return;
                    if (idx < AppState.examQuestions.length - 1) { AppState.examAnswers.currentIndex = idx + 1; _doSaveSession(); renderViewSafely('exam'); }
                    else { submitExam(); }
                });
            }
            const prevQ = $('#btnPrevQ');
            if (prevQ) prevQ.addEventListener('click', function() { if (checkExamDeadline()) return; const idx = AppState.examAnswers.currentIndex || 0; if (idx > 0) { AppState.examAnswers.currentIndex = idx - 1; _doSaveSession(); renderViewSafely('exam'); } });
            const endExam = $('#btnEndExam');
            if (endExam) endExam.addEventListener('click', function() { if (confirm('End exam and submit?')) submitExam(); });

            const retryExamSave = $('#btnRetryExamSave');
            if (retryExamSave) retryExamSave.addEventListener('click', async function() {
                this.disabled = true;
                try { await persistExamAttempt(); showToast('Exam results saved.', 'success'); }
                catch (error) { showToast('Results could not be saved. Please retry.', 'error'); }
                if (AppState.examShowResults) await renderViewSafely('exam');
                else await renderViewSafely(AppState.currentView);
            });

            const reviewExam = $('#btnReviewExam');
            if (reviewExam) reviewExam.addEventListener('click', reviewExamResults);

            $$('.option-btn[data-option]').forEach(btn => {
                btn.addEventListener('click', function() {
                    if (checkExamDeadline()) return;
                    const idx = AppState.examAnswers.currentIndex || 0; const q = AppState.examQuestions[idx];
                    if (q) AppState.examAnswers[q.id] = this.dataset.option;
                    _doSaveSession();
                    renderViewSafely('exam');
                });
            });

            $$('.bookmark-btn').forEach(b => { if (b.closest('#questionListContainer')) return; b.addEventListener('click', async function(e) { e.stopPropagation(); const id = parseInt(this.dataset.qid); await db.toggleBookmark(id); renderViewSafely(AppState.currentView); }); });
            $$('.view-q-btn').forEach(b => { if (b.closest('#questionListContainer')) return; b.addEventListener('click', async function() { const q = await db.getQuestion(parseInt(this.dataset.qid)); if (q) showQuestionModal(q); }); });

            // The virtualized question list mounts/unmounts .question-block nodes as the user
            // scrolls (see VirtualScroller), so per-node listeners bound only at initial render
            // would silently do nothing for anything scrolled into view afterward. One delegated
            // listener on the stable container covers every row regardless of when it was mounted.
            const qListContainerForDelegation = $('#questionListContainer');
            if (qListContainerForDelegation) {
                qListContainerForDelegation.addEventListener('click', async function(e) {
                    const bmBtn = e.target.closest('.bookmark-btn');
                    if (bmBtn) {
                        e.stopPropagation();
                        const id = parseInt(bmBtn.dataset.qid);
                        await db.toggleBookmark(id);
                        renderViewSafely(AppState.currentView);
                        return;
                    }
                    const viewBtn = e.target.closest('.view-q-btn');
                    if (viewBtn) {
                        const q = await db.getQuestion(parseInt(viewBtn.dataset.qid));
                        if (q) showQuestionModal(q);
                    }
                });
            }
            const addQ = $('#btnAddQuestion'); if (addQ) addQ.addEventListener('click', function() { showAddQuestionModal(null); });
            const clearAll = $('#btnClearAll'); if (clearAll) clearAll.addEventListener('click', clearAllHandler);
            const importBtn = $('#btnImport'); if (importBtn) importBtn.addEventListener('click', window.handleImport);
            const sampleBtn = $('#btnLoadSample'); if (sampleBtn) sampleBtn.addEventListener('click', loadSamples);
            const exportBtn = $('#btnExport'); if (exportBtn) exportBtn.addEventListener('click', handleExport);
            const restoreBtn = $('#btnRestore'); if (restoreBtn) restoreBtn.addEventListener('click', function() { $('#restoreFile').click(); });
            const restoreFile = $('#restoreFile'); if (restoreFile) restoreFile.addEventListener('change', handleRestore);

            const importFile = $('#importFile');
            if (importFile) importFile.addEventListener('change', function(e) { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = ev => $('#importData').value = ev.target.result; r.readAsText(file); });

            populateDeleteBookDropdown();
            const delGroupBtn = $('#btnDeleteGroup');
            if (delGroupBtn) delGroupBtn.addEventListener('click', async () => {
                const groupName = ($('#deleteGroupName')?.value || '').trim();
                if (!groupName) { alert('Enter book/group name'); return; }
                if (!confirm(`Delete all questions from "${groupName}" only?`)) return;
                const deleted = await db.deleteQuestionsByGroup(groupName);
                showToast(`${deleted} questions deleted from ${groupName}`, 'success');
                renderViewSafely('import');
            });

            // Update state immediately; debounce only the expensive rendering work.
            QuestionSearchUI.bind($('#questionSearchInput'));

            // --- Admin Dashboard Listeners ---
            const btnAdminAddQ = $('#btnAdminAddQ');
            if (btnAdminAddQ) btnAdminAddQ.addEventListener('click', () => showAddQuestionModal(null));

            const btnAdminBulkImport = $('#btnAdminBulkImport');
            if (btnAdminBulkImport) btnAdminBulkImport.addEventListener('click', () => { navigateTo('import'); });

            const btnAdminBulkEdit = $('#btnAdminBulkEdit');
            if (btnAdminBulkEdit) btnAdminBulkEdit.addEventListener('click', adminBulkEdit);

            const btnAdminMergeDups = $('#btnAdminMergeDups');
            if (btnAdminMergeDups) btnAdminMergeDups.addEventListener('click', adminMergeDuplicates);

            const btnAdminReclassify = $('#btnAdminReclassify');
            if (btnAdminReclassify) btnAdminReclassify.addEventListener('click', adminBulkReclassify);

            const btnAdminClearAll = $('#btnAdminClearAll');
            if (btnAdminClearAll) btnAdminClearAll.addEventListener('click', clearAllHandler);

            // Admin question search
            const adminQSearch = $('#adminQSearch');
            if (adminQSearch) {
                adminQSearch.addEventListener('input', debounce(async function() {
                    const query = this.value;
                    const results = await adminSearchQuestions(query);
                    if (document.getElementById('adminQSearch') !== this || this.value !== query) return;
                    await adminRenderQuestionList(results);
                    // Re-attach edit/delete listeners after re-render
                    $$('.admin-edit-q').forEach(b => b.addEventListener('click', function() { adminEditQuestion(parseInt(this.dataset.qid)); }));
                    $$('.admin-del-q').forEach(b => b.addEventListener('click', function() { adminDeleteQuestion(parseInt(this.dataset.qid)); }));
                }, 200));
            }

            // Admin edit/delete buttons (initial render)
            $$('.admin-edit-q').forEach(b => b.addEventListener('click', function() { adminEditQuestion(parseInt(this.dataset.qid)); }));
            $$('.admin-del-q').forEach(b => b.addEventListener('click', function() { adminDeleteQuestion(parseInt(this.dataset.qid)); }));

            // --- End Admin Dashboard Listeners ---

            // --- Student Dashboard Listeners ---
            const btnSetDailyGoal = $('#btnSetDailyGoal');
            if (btnSetDailyGoal) {
                btnSetDailyGoal.addEventListener('click', async () => {
                    const current = await getDailyGoal();
                    const val = prompt('Set your daily question goal:', current);
                    if (val !== null) {
                        const n = parseInt(val, 10);
                        if (n > 0 && n <= 500) {
                            await setDailyGoal(n);
                            showToast(`Daily goal set to ${n} questions.`, 'success');
                            navigateTo('dashboard');
                        } else {
                            showToast('Please enter a number between 1 and 500.', 'warning');
                        }
                    }
                });
            }

            const btnContinueStudy = $('#btnContinueStudy');
            if (btnContinueStudy) {
                btnContinueStudy.addEventListener('click', continueStudying);
            }

            const btnSmartRevision = $('#btnSmartRevision');
            if (btnSmartRevision) {
                btnSmartRevision.addEventListener('click', startSmartRevision);
            }

            const btnAdaptiveQuiz = $('#btnAdaptiveQuiz');
            if (btnAdaptiveQuiz) {
                btnAdaptiveQuiz.addEventListener('click', startAdaptiveExam);
            }
            // --- End Student Dashboard Listeners ---

            // OPTIMIZATION: Initialize Virtual Scroller for question list
            const qContainer = $('#questionListContainer');
            if (AppState._questionScroller) {
                AppState._questionScroller.destroy();
                AppState._questionScroller = null;
            }
            if (qContainer && AppState._lastFilteredQuestions && AppState._lastFilteredQuestions.length > 0) {
                AppState._questionScroller = new VirtualScroller(qContainer, {
                    items: AppState._lastFilteredQuestions,
                    itemHeight: 190, // measured actual rendered height is ~155-216px; was 130 (up to 41% low), which made the scroller over-render extra items per scroll step
                    buffer: 4,
                    pageSize: 50,
                    renderItem: (q, i) => renderQuestionBlock(q, i, AppState._lastFilterMeta)
                });
                AppState._questionScroller.init();
            }

            // Update Package System (Settings view) — defined in update-package.js
            if (typeof attachSettingsListeners === 'function') attachSettingsListeners();
        }

        /** Simple debounce utility for search input */
        function debounce(fn, ms) {
            let t;
            return function(...args) {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), ms);
            };
        }

        // ============================================================
        //  Update Package System — see update-package.js
        //  (Prior prototype here — password-encrypted .ent files signed
        //  with a keypair embedded in this same client-side bundle — has
        //  been retired. That approach couldn't keep a signing key secret
        //  from students since everyone loads the same app.js, so it gave
        //  the appearance of security more than the substance of it. The
        //  new system is upfront: a real SHA-256 checksum for accidental
        //  corruption, and a clearly-labeled signature placeholder.)
        // ============================================================
        document.getElementById('btnDarkMode').addEventListener('click', () => { AppState.darkMode = !AppState.darkMode; document.body.classList.toggle('dark-mode', AppState.darkMode); document.getElementById('btnDarkMode').innerHTML = AppState.darkMode ? (uiIcon("sun")) : (uiIcon("moon")); saveSession(); });
        document.getElementById('btnSearch').addEventListener('click', () => { navigateTo('questions'); setTimeout(() => { const inp = $('#questionSearchInput'); if (inp) inp.focus(); }, 150); });
        document.getElementById('btnSettings').addEventListener('click', () => navigateTo('settings'));

        // ============================================================
        //  SECURE PASSWORD PROTECTED ACTIONS
        // ============================================================

        window.clearAllHandler = async function() {
            if (!RBAC.requireAdmin()) { return; }
            const groups = await db.getAllGroups();
            const modal = $('#modalOverlay');
            const content = $('#modalContent');
            const groupOptions = groups.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
            content.innerHTML = `
                <h3>${uiIcon("trash")} Clear Data</h3>
                <div style="margin-bottom:15px;">
                    <label>Delete entire Group:</label>
                    <select id="clearGroupSelect" style="margin-bottom:10px;">
                        ${groupOptions.length > 0 ? groupOptions : '<option>No groups found</option>'}
                    </select>
                    <button class="btn btn-danger" onclick="executeClearGroup()">Delete Selected Group</button>
                </div>
                <hr>
                <button class="btn btn-danger" onclick="executeClear('questions')">Delete ALL Questions</button>
                <button class="btn btn-danger" onclick="executeClear('all')">WIPE EVERYTHING</button>
                <button class="btn btn-outline btn-block mt-2" onclick="closeModal()">Cancel</button>
            `;
            modal.classList.remove('hidden');
        };

        window.executeClearGroup = async function() {
            const groupToClear = $('#clearGroupSelect').value;
            if (!confirm(`Are you sure you want to delete the entire group: "${groupToClear}"?`)) return;
            const qs = await db.getAllQuestions();
            const tx = db.db.transaction('questions', 'readwrite');
            const store = tx.objectStore('questions');
            qs.forEach(q => { if (q.group === groupToClear) store.delete(q.id); });
            tx.oncomplete = () => { closeModal(); showToast(`Group deleted.`, 'success'); navigateTo('dashboard'); };
        };

        window.executeClear = async function(type) {
            if (!confirm("Are you sure? This action cannot be undone.")) return;
            const tx = db.db.transaction(['questions', 'examHistory', 'bookmarks', 'notes', 'performance', 'highYield'], 'readwrite');
            if (type === 'questions') tx.objectStore('questions').clear();
            if (type === 'all') {
                tx.objectStore('questions').clear();
                tx.objectStore('examHistory').clear(); tx.objectStore('performance').clear(); tx.objectStore('highYield').clear();
                tx.objectStore('bookmarks').clear();
                tx.objectStore('notes').clear();
            }
            tx.oncomplete = () => { closeModal(); showToast('Data cleared.', 'success'); navigateTo('dashboard'); };
        };

        (async function init() {
            await db.ready;
            cleanupLegacyStorage();
            try {
                const migrationReport = await db.reconcileDewhurstClassification();
                if (migrationReport.classified || migrationReport.subjectOnly || migrationReport.unmapped) {
                    console.log('Dewhurst classification reconciliation:', migrationReport);
                }
            } catch (e) {
                console.error('Classification migration failed:', e);
            }
            RBAC.init();
            applyRoleVisibility();
            const adminBtn = document.getElementById('btnAdminMode');
            if (adminBtn) adminBtn.addEventListener('click', () => RBAC.toggle());
            $$('.nav-item').forEach(item => { item.addEventListener('click', function() { const view = this.dataset.view; if (view) navigateTo(view); }); });

            // Back-button support: respond to browser/hardware back instead of
            // letting it exit the PWA. A separate observer pushes a history
            // entry whenever the shared modal overlay opens (regardless of
            // which function opened it), so back also closes dialogs first.
            window.addEventListener('popstate', handlePopState);
            window.addEventListener('pagehide', handleExamPageHide);
            window.addEventListener('pageshow', handleExamVisibilityChange);
            document.addEventListener('visibilitychange', handleExamVisibilityChange);
            const modalOverlayEl = document.getElementById('modalOverlay');
            if (modalOverlayEl && window.MutationObserver) {
                new MutationObserver(() => {
                    const isOpen = !modalOverlayEl.classList.contains('hidden');
                    if (isOpen && !(history.state && history.state.modal)) {
                        history.pushState({ view: AppState.currentView, modal: true }, '', location.href);
                    }
                }).observe(modalOverlayEl, { attributes: true, attributeFilter: ['class'] });
            }

            const restored = restoreSession();
            if (restored && AppState.examAttemptId && AppState.examSubmittedAt && !AppState._examSaved && AppState.lastExamResults?.length) {
                try { await persistExamAttempt(); }
                catch (error) { showToast('Pending exam results could not be saved. They remain in this session.', 'error'); }
            }
            if (restored) {
                // Startup must always land on Dashboard, regardless of which view was
                // open when the session was last saved. Everything else restored above
                // (exam progress/timer, study progress, filters, dark mode) is left as
                // restored — only the initial screen is overridden here.
                AppState.currentView = 'dashboard';
                document.body.classList.toggle('dark-mode', AppState.darkMode);
                document.getElementById('btnDarkMode').innerHTML = AppState.darkMode ? (uiIcon("sun")) : (uiIcon("moon"));
                $$('.nav-item').forEach(n => n.classList.remove('active'));
                const navBtn = $(`.nav-item[data-view="${AppState.currentView}"]`);
                if (navBtn) navBtn.classList.add('active');
                if (AppState.examInProgress) startExamTimer();
                history.replaceState({ view: AppState.currentView }, '', location.href);
                await renderViewSafely(AppState.currentView);
                if (AppState.currentView === 'study' && AppState.studyQuestions && AppState.studyIndex < AppState.studyQuestions.length) {
                    renderStudyQuestion();
                }
            } else {
                try {
                    const legacyDark = await db.getSetting('darkMode', false);
                    if (legacyDark) {
                        AppState.darkMode = true;
                        document.body.classList.add('dark-mode');
                        document.getElementById('btnDarkMode').innerHTML = (uiIcon("sun"));
                    }
                } catch (e) {}
                history.replaceState({ view: 'dashboard' }, '', location.href);
                isPopNavigation = true; // this is the app's first screen - replace, don't push
                navigateTo('dashboard');
                isPopNavigation = false;
            }
        })();

        // ============================================================
        //  PASSWORD PROTECTION FOR SENSITIVE ACTIONS
        // ============================================================
        const originalImport = window.handleImport;
        window.handleImport = async function() {
            if (!RBAC.requireAdmin()) {
                return;
            }
            const format = $('#importFormat').value; const raw = $('#importData').value; const groupName = $('#importGroup').value.trim();
            try {
                let questions = [];
                if (format === 'json') questions = JSON.parse(raw);
                else if (format === 'csv') questions = parseCSV(raw);
                if (!Array.isArray(questions) || questions.length === 0) throw new Error('No valid questions');
                if (!validateImportedQuestionsStrict(questions)) {
                    throw new Error('Invalid question structure: each question must have questionText and correctAnswer');
                }
                const count = await db.bulkImport(questions, groupName);
                showToast(`Imported ${count} questions!`, 'success');
                navigateTo('dashboard');
            } catch (e) { showToast('Import error: ' + e.message, 'error'); }
        };

        window.clearAllHandler = async function() {
            if (!RBAC.requireAdmin()) {
                return;
            }
            if (confirm('⚠️ WARNING: This will delete EVERYTHING. Are you sure?')) {
                await db.clearAllQuestions();
                showToast('All data cleared.', 'success');
                navigateTo('dashboard');
            }
        };

        window.generateWeakTopicAnalytics = async function(){
            const perf = await db.getPerformance();
            const stats = {};
            perf.forEach(r=>{
                const key = `${r.subject||'Unknown'}|||${r.chapter||'Unknown'}|||${r.topic||'Unknown'}`;
                if(!stats[key]) stats[key]={total:0,correct:0,subject:r.subject||'Unknown',chapter:r.chapter||'Unknown',topic:r.topic||'Unknown'};
                stats[key].total++;
                if(r.correct) stats[key].correct++;
            });
            return Object.values(stats)
                .map(x=>({...x,accuracy:Math.round((x.correct*100)/x.total)}))
                .sort((a,b)=>a.accuracy-b.accuracy);
        };

        async function populateDeleteBookDropdown(){
            const sel=document.getElementById('deleteGroupName');
            if(!sel) return;
            const groups=await db.getAllGroups();
            sel.innerHTML='<option value="">Select Book</option>'+groups.map(g=>`<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
        }

        document.addEventListener('click', async (e)=>{
            if(e.target.id==='btnExamFromMistakes'){
                const perf=await db.getPerformance();
                const latest={}; perf.forEach(x=>latest[x.questionId]=x.correct);
                const wrongIds=Object.keys(latest).filter(k=>latest[k]===false).map(Number);
                const qs=(await db.getAllQuestions()).filter(q=>wrongIds.includes(q.id));
                if (!resetExamAttempt()) return;
                AppState.examQuestions=qs;
                AppState.examAnswers={currentIndex:0};
                AppState.examInProgress=true;
                AppState.examShowResults=false; AppState.lastExamResults=null;
                AppState.examStartTime=Date.now();
                AppState.examTimeRemaining=0;
                resumeExam();
            }
            if(e.target.classList.contains('add-hy')){
                await db.toggleHighYield(Number(e.target.dataset.qid));
                showToast('Added to High Yield','success');
                renderViewSafely('mistakes');
            }
            if(e.target.classList.contains('retry-question')){
                const qid=Number(e.target.dataset.qid);
                const q=await db.getQuestion(qid);
                if(!q) return;
                AppState.studyQuestions=[q];
                AppState.studyIndex=0;
                AppState.studyAnswers={};
                AppState.studyRevealed={};
                await navigateTo('study');
                renderStudyQuestion();
            }
            if(e.target.classList.contains('remove-hy')){
                const qid=Number(e.target.dataset.qid);
                await db.toggleHighYield(qid);
                showToast('Removed from High Yield', 'success');
                renderViewSafely('highyield');
            }
        });

        function updateAvailableQuestionsInfo(){
            try{
                const info=document.getElementById('availableQuestionsInfo');
                if(!info || !window.db) return;
                db.getAllQuestions().then(qs=>{
                    const subjSel=document.getElementById('examSubject');
                    const grpSel=document.getElementById('examBook');
                    let filtered=[...qs];
                    const subjects=subjSel?[...subjSel.selectedOptions].map(x=>x.value).filter(v=>v!=='all'):[];
                    const groups=grpSel?[...grpSel.selectedOptions].map(x=>x.value).filter(v=>v!=='all'):[];
                    if(subjects.length) filtered=filtered.filter(q=>subjects.includes(q.subject || 'Uncategorized'));
                    if(groups.length) filtered=filtered.filter(q=>groups.includes(q.group));
                    info.textContent='Available Questions: '+filtered.length;
                });
            }catch(e){}
        }
        document.addEventListener('change',e=>{
            if(e.target && (e.target.id==='examSubject' || e.target.id==='examBook')){
                updateAvailableQuestionsInfo();
            }
        });

        async function populateExamChapters(){
            const subj=document.getElementById('examSubject');
            const chap=document.getElementById('examChapter');
            if(!subj||!chap) return;
            const taxonomy = computeTaxonomy(await db.getAllQuestions());
            const selected=[...subj.selectedOptions].map(o=>o.value).filter(v=>v!=='all');
            let chapters=[];
            if(selected.length===0){ chapters=taxonomy.allChapters; }
            else{
                selected.forEach(s=>{ if(taxonomy.chaptersBySubject[s]) chapters.push(...taxonomy.chaptersBySubject[s]); });
            }
            chap.innerHTML='<option value="all">All</option>'+
                [...new Set(chapters)].sort((a,b)=>a.localeCompare(b)).map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
        }

        document.addEventListener('change',function(e){
            if(e.target && e.target.id==='examSubject'){
                populateExamChapters();
                if(typeof updateAvailableQuestionsInfo==='function') updateAvailableQuestionsInfo();
            }
        });

        document.addEventListener('change',function(e){
            if(e.target && (e.target.id==='examChapter' || e.target.id==='examTopic')){
                if(typeof updateAvailableQuestionsInfo==='function') updateAvailableQuestionsInfo();
            }
        });

        async function populateExamTopics(){
            const chapter=document.getElementById('examChapter');
            const topic=document.getElementById('examTopic');
            if(!chapter || !topic) return;
            const qs=await db.getAllQuestions();
            let filtered=qs;
            if(chapter.value!=='all'){
                filtered=filtered.filter(q=>(q.chapter||'General')===chapter.value);
            }
            const selectedSubjects=[...(document.getElementById('examSubject')?.selectedOptions||[])].map(o=>o.value);
            const topics=aylaTopicsFor(selectedSubjects,chapter.value,qs);
            topic.innerHTML='<option value="all">All</option>'+topics.map(t=>`<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
        }

        async function updateExamCounters(){
            const info=document.getElementById('availableQuestionsInfo');
            if(!info) return;
            const qs=await db.getAllQuestions();
            info.innerHTML='Total Questions: '+qs.length;
        }

        document.addEventListener('change',async function(e){
            if(e.target && e.target.id==='examChapter'){
                await populateExamTopics();
            }
        });

        document.addEventListener('DOMContentLoaded',function(){
            setTimeout(()=>{
                if(typeof populateExamChapters==='function') populateExamChapters();
                if(typeof updateExamCounters==='function') updateExamCounters();
            },500);
        });

                window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.classifyQuestionAdvanced=classifyQuestionAdvanced;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.getQuestionsNeedingReview=getQuestionsNeedingReview;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.scanDuplicateQuestions=scanDuplicateQuestions;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.adaptiveExamEngine=adaptiveExamEngine;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.fullBoardExamSimulator=fullBoardExamSimulator;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.smartQuestionSelector=smartQuestionSelector;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.optimizeFor100kQuestions=optimizeFor100kQuestions;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.iraqiBoardMockExam=iraqiBoardMockExam;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.updateQuestionClassification=updateQuestionClassification;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.renderExamSetup=renderExamSetup;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.renderExamInProgress=renderExamInProgress;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.renderExamResults=renderExamResults;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.reviewExamResults=reviewExamResults;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.renderQuestionList=renderQuestionList;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.renderStudyQuestion=renderStudyQuestion;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.submitExam=submitExam;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.showQuestionModal=showQuestionModal;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.updateAvailableQuestionsInfo=updateAvailableQuestionsInfo;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.populateExamChapters=populateExamChapters;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.populateExamTopics=populateExamTopics;
        window.ENTApp.quiz=window.ENTApp.quiz||{}; window.ENTApp.quiz.updateExamCounters=updateExamCounters;
                (function(){
            if(!window.ENTApp)return;
            const names=['startQuiz','loadQuestions','renderQuestion','checkAnswer','nextQuestion','previousQuestion'];
            names.forEach(n=>{ if(typeof window[n]==='function'){window.ENTApp.modules.app[n]=window[n];}});
        })();
