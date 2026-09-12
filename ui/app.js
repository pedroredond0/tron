function escapeHtml(text) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }

  function showToast(message, type = 'info') {
    let toastContainer = document.getElementById('tronToastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'tronToastContainer';
      toastContainer.className = 'fixed bottom-8 right-8 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const bgClass = type === 'error' ? 'bg-rose-900/90 border-rose-700 text-rose-100' :
                    type === 'success' ? 'bg-emerald-900/90 border-emerald-700 text-emerald-100' :
                    'bg-gnome-surface/95 border-gnome-border text-gnome-text shadow-2xl';

    toast.className = `px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs flex items-center gap-2.5 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${bgClass}`;
    
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span class="flex-1 font-medium">${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }


// tronExplorer - Frontend Controller
(function() {
  // Tauri IPC helper
  const invoke = window.__TAURI__?.core?.invoke || (async () => {
    console.warn("Tauri invoke no disponible en navegador independiente");
    return null;
  });

  const listen = window.__TAURI__?.event?.listen || (async () => {
    return () => {};
  });

  // Platform detection for Mac-friendly shortcuts (Cmd instead of Ctrl)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function isModKey(e) {
    return isMac ? e.metaKey : e.ctrlKey;
  }
  function adaptShortcutsForMac() {
    if (!isMac) return;
    try {
      document.documentElement.classList.add('is-mac');
      const mb = document.getElementById('menuBar');
      if (mb) mb.style.display = 'none';

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.includes('Ctrl')) {
          node.nodeValue = node.nodeValue.replace(/Ctrl\s*\+\s*/g, 'Cmd + ').replace(/Ctrl\+/g, 'Cmd+');
        }
      }
      document.querySelectorAll('[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && t.includes('Ctrl')) {
          el.setAttribute('title', t.replace(/Ctrl\s*\+\s*/g, 'Cmd + ').replace(/Ctrl\+/g, 'Cmd+'));
        }
      });
      document.querySelectorAll('[placeholder]').forEach(el => {
        const p = el.getAttribute('placeholder');
        if (p && p.includes('Ctrl')) {
          el.setAttribute('placeholder', p.replace(/Ctrl\s*\+\s*/g, 'Cmd + ').replace(/Ctrl\+/g, 'Cmd+'));
        }
      });
    } catch (err) {
      console.warn('adaptShortcutsForMac error:', err);
    }
  }

  // Helper to create tab state
  let nextTabId = 1;
  function createTabState(dir = '') {
    return {
      id: 'tab_' + (nextTabId++),
      name: dir ? getDirBaseName(dir) : 'Inicio',
      currentDirectory: dir,
      items: [],
      filteredItems: [],
      selectedIndex: -1,
      selectionAnchor: -1,
      selectedItems: new Set(),
      history: [],
      historyIndex: -1,
      sortField: 'name',
      sortAsc: true,
      searchQuery: '',
      isSearchingRecursive: false,
      activeSherlockFilter: null,
      sherlockResults: null,
      searchItems: null,
      freeSpaceBytes: null,
      totalSpaceBytes: null,
      scrollTop: 0,
      expandedDirs: new Map() // dirPath -> child items array
    };
  }

  // Isolated Dual Panel Architecture with Independent Tabs
  function createPanelState(defaultDir = '') {
    return {
      tabs: [ createTabState(defaultDir) ],
      activeTab: 0,
      get currentTab() {
        if (!this.tabs || this.tabs.length === 0) {
          this.tabs = [ createTabState() ];
          this.activeTab = 0;
        }
        if (this.activeTab < 0 || this.activeTab >= this.tabs.length) {
          this.activeTab = Math.max(0, this.tabs.length - 1);
        }
        return this.tabs[this.activeTab];
      },
      get currentDirectory() { return this.currentTab.currentDirectory || ''; },
      set currentDirectory(v) {
        this.currentTab.currentDirectory = v;
        this.currentTab.name = v ? getDirBaseName(v) : 'Inicio';
        renderTabs();
      },
      get items() { return this.currentTab.items || []; },
      set items(v) { this.currentTab.items = v; },
      get filteredItems() { return this.currentTab.filteredItems || []; },
      set filteredItems(v) { this.currentTab.filteredItems = v; },
      get selectedIndex() { return this.currentTab.selectedIndex; },
      set selectedIndex(v) { this.currentTab.selectedIndex = v; },
      get selectionAnchor() { return this.currentTab.selectionAnchor; },
      set selectionAnchor(v) { this.currentTab.selectionAnchor = v; },
      get selectedItems() { return this.currentTab.selectedItems; },
      set selectedItems(v) { this.currentTab.selectedItems = v; },
      get sortField() { return this.currentTab.sortField || 'name'; },
      set sortField(v) { this.currentTab.sortField = v; },
      get sortAsc() { return this.currentTab.sortAsc !== false; },
      set sortAsc(v) { this.currentTab.sortAsc = v; },
      get history() { return this.currentTab.history; },
      set history(v) { this.currentTab.history = v; },
      get historyIndex() { return this.currentTab.historyIndex; },
      set historyIndex(v) { this.currentTab.historyIndex = v; },
      get searchQuery() { return this.currentTab.searchQuery; },
      set searchQuery(v) { this.currentTab.searchQuery = v; },
      get isSearchingRecursive() { return this.currentTab.isSearchingRecursive; },
      set isSearchingRecursive(v) { this.currentTab.isSearchingRecursive = v; },
      get activeSherlockFilter() { return this.currentTab.activeSherlockFilter; },
      set activeSherlockFilter(v) { this.currentTab.activeSherlockFilter = v; },
      get sherlockResults() { return this.currentTab.sherlockResults; },
      set sherlockResults(v) { this.currentTab.sherlockResults = v; },
      get searchItems() { return this.currentTab.searchItems; },
      set searchItems(v) { this.currentTab.searchItems = v; },
      get freeSpaceBytes() { return this.currentTab.freeSpaceBytes; },
      set freeSpaceBytes(v) { this.currentTab.freeSpaceBytes = v; },
      get totalSpaceBytes() { return this.currentTab.totalSpaceBytes; },
      set totalSpaceBytes(v) { this.currentTab.totalSpaceBytes = v; },
      get expandedDirs() { return this.currentTab.expandedDirs; }
    };
  }

  const panels = [ createPanelState(), createPanelState() ];
  let activePanel = 0;
  let isSplitView = false;

  function getActiveTabObj(panelIdx = activePanel) {
    return panels[panelIdx].currentTab;
  }

  // File Color Tags Store: { [normalizedPath]: [color1, color2, ...] }
  let fileTagsMap = {};
  try {
    fileTagsMap = JSON.parse(localStorage.getItem('tron_file_tags') || '{}');
  } catch (e) {
    fileTagsMap = {};
  }

  let customTagNames = {};
  try {
    customTagNames = JSON.parse(localStorage.getItem('tron_custom_tag_names') || '{}');
  } catch (e) {
    customTagNames = {};
  }

  const TAG_COLOR_DEFS = {
    red: { defaultName: 'Rojo', hex: '#ef4444', class: 'bg-red-500' },
    orange: { defaultName: 'Naranja', hex: '#f97316', class: 'bg-orange-500' },
    yellow: { defaultName: 'Amarillo', hex: '#eab308', class: 'bg-yellow-400' },
    green: { defaultName: 'Verde', hex: '#22c55e', class: 'bg-green-500' },
    blue: { defaultName: 'Azul', hex: '#3b82f6', class: 'bg-blue-500' },
    purple: { defaultName: 'Púrpura', hex: '#a855f7', class: 'bg-purple-500' },
    gray: { defaultName: 'Gris', hex: '#9ca3af', class: 'bg-gray-400' }
  };

  function getTagDisplayName(colorKey) {
    if (customTagNames && customTagNames[colorKey] && customTagNames[colorKey].trim()) {
      return customTagNames[colorKey].trim();
    }
    return (TAG_COLOR_DEFS[colorKey] && TAG_COLOR_DEFS[colorKey].defaultName) || colorKey;
  }

  function normalizeTagPath(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/').toLowerCase();
  }

  function isSubpath(parent, child) {
    if (!parent || !child) return false;
    let p = parent.replace(/\\/g, '/').toLowerCase();
    let c = child.replace(/\\/g, '/').toLowerCase();
    if (!p.endsWith('/')) p += '/';
    if (!c.endsWith('/')) c += '/';
    return c.startsWith(p);
  }

  function normPathForMatch(p) {
    if (!p) return '';
    let s = p.replace(/\\/g, '/').toLowerCase();
    if (s.length > 3 && s.endsWith('/')) s = s.replace(/\/+$/, '');
    return s;
  }

  function getDirectChildOnPath(ancestorPath, currentPath) {
    if (!ancestorPath || !currentPath) return null;
    const aNorm = normPathForMatch(ancestorPath);
    const cNorm = normPathForMatch(currentPath);
    if (cNorm.startsWith(aNorm) && cNorm.length > aNorm.length) {
      const remaining = cNorm.substring(aNorm.length).replace(/^\/+/, '');
      const firstSegment = remaining.split('/')[0];
      if (firstSegment) {
        const sep = ancestorPath.includes('\\') ? '\\' : '/';
        const cleanAncestor = ancestorPath.replace(/[\/\\]+$/, '');
        return cleanAncestor + (cleanAncestor.length <= 3 && cleanAncestor.endsWith(':') ? '\\' : sep) + firstSegment;
      }
    }
    return null;
  }

  function createFileItemFromPath(fullPath, isDir = false) {
    if (!fullPath) return null;
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(fullPath) || fullPath.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const clean = fullPath.replace(/[\/\\]+$/, '');
    const lastSlash = clean.lastIndexOf(sep);
    const name = lastSlash >= 0 ? clean.substring(lastSlash + 1) : clean;
    const dotIdx = name.lastIndexOf('.');
    const ext = (dotIdx > 0 && !isDir) ? name.substring(dotIdx + 1).toLowerCase() : '';
    return {
      name: name,
      path: fullPath,
      is_directory: isDir,
      size: 0,
      modified: 0,
      extension: ext,
      file_type: isDir ? 'folder' : 'text',
      is_hidden: name.startsWith('.')
    };
  }

  function getItemTags(p) {
    const norm = normalizeTagPath(p);
    const val = fileTagsMap[norm];
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return val.tags || [];
  }

  function setItemTags(p, tags, fileItem = null) {
    const norm = normalizeTagPath(p);
    if (!tags || tags.length === 0) {
      delete fileTagsMap[norm];
    } else {
      const existing = fileTagsMap[norm];
      const existingItem = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? existing.item : null;
      const itemData = fileItem || existingItem || createFileItemFromPath(p);
      fileTagsMap[norm] = {
        path: p,
        item: itemData,
        tags: Array.from(new Set(tags))
      };
    }
    try {
      localStorage.setItem('tron_file_tags', JSON.stringify(fileTagsMap));
    } catch (e) {}
    renderTagSidebar();
  }

  function toggleItemTag(targetOrPath, color) {
    const p = (targetOrPath && typeof targetOrPath === 'object' && targetOrPath.path) ? targetOrPath.path : targetOrPath;
    const fileItem = (targetOrPath && typeof targetOrPath === 'object' && targetOrPath.name) ? targetOrPath : null;
    const norm = normalizeTagPath(p);
    const cur = getItemTags(norm);
    let next;
    if (cur.includes(color)) {
      next = cur.filter(c => c !== color);
    } else {
      next = [...cur, color];
    }
    setItemTags(p, next, fileItem);
  }

  function clearItemTags(p) {
    setItemTags(p, []);
  }

  const state = {
    quickViewOpen: false,
    dirSizes: new Map(),
    activeDirCalcId: null,
    activeTransfers: new Map(),
    drives: [],
    favorites: [],
    activeTagFilter: null, // null or color name e.g. 'red'

    frequentLocations: JSON.parse(localStorage.getItem('tron_frequent_locations') || '{}'),
    hiddenFrequentLocations: new Set(JSON.parse(localStorage.getItem('tron_hidden_frequent_locations') || '[]')),

    clipboard: { action: null, paths: [] },
    get sortField() { return panels[activePanel].sortField; },
    set sortField(v) { panels[activePanel].sortField = v; },
    get sortAsc() { return panels[activePanel].sortAsc; },
    set sortAsc(v) { panels[activePanel].sortAsc = v; },
    contextTargetItem: null,
    isMillerView: localStorage.getItem('tron_miller_view') === 'true',
    showHiddenFiles: localStorage.getItem('tron_show_hidden') === 'true',
    customTextExts: (localStorage.getItem('tron_custom_text_exts') || 'sql, str, log, conf, env, bak')
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean),
    textEditor: (function() {
      const saved = localStorage.getItem('tron_text_editor');
      const isMacUser = /Mac|iPhone|iPod|iPad/.test(navigator.platform || '') || /Macintosh/.test(navigator.userAgent || '');
      if (isMacUser && (!saved || saved === 'notepad')) {
        return 'TextEdit';
      }
      return saved || 'notepad';
    })(),
    textEditorCustomPath: localStorage.getItem('tron_text_editor_custom') || '',
    terminalApp: localStorage.getItem('tron_terminal_app') || 'default',
    terminalCustomPath: localStorage.getItem('tron_terminal_custom') || '',
    monochromeIcons: localStorage.getItem('tron_monochrome_icons') === 'true',
    iconPack: localStorage.getItem('tron_icon_pack') || 'default',
    showMenuBar: localStorage.getItem('tron_show_menu_bar') !== 'false',
    recursiveTagSearch: localStorage.getItem('tron_recursive_tag_search') !== 'false',
    externalAppsConfig: null,
    draggedInternalPaths: [],

    get currentDirectory() { return getActiveTabObj().currentDirectory; },
    set currentDirectory(v) {
      const tab = getActiveTabObj();
      tab.currentDirectory = v;
      tab.name = v ? getDirBaseName(v) : 'Inicio';
      renderTabs();
    },
    get items() { return getActiveTabObj().items; },
    set items(v) { getActiveTabObj().items = v; },
    get filteredItems() { return getActiveTabObj().filteredItems; },
    set filteredItems(v) { getActiveTabObj().filteredItems = v; },
    get selectedIndex() { return getActiveTabObj().selectedIndex; },
    set selectedIndex(v) { getActiveTabObj().selectedIndex = v; },
    get selectionAnchor() { return getActiveTabObj().selectionAnchor; },
    set selectionAnchor(v) { getActiveTabObj().selectionAnchor = v; },
    get selectedItems() { return getActiveTabObj().selectedItems; },
    set selectedItems(v) { getActiveTabObj().selectedItems = v; },
    get history() { return getActiveTabObj().history; },
    set history(v) { getActiveTabObj().history = v; },
    get historyIndex() { return getActiveTabObj().historyIndex; },
    set historyIndex(v) { getActiveTabObj().historyIndex = v; },
    get searchQuery() { return getActiveTabObj().searchQuery; },
    set searchQuery(v) { getActiveTabObj().searchQuery = v; },
    get isSearchingRecursive() { return getActiveTabObj().isSearchingRecursive; },
    set isSearchingRecursive(v) { getActiveTabObj().isSearchingRecursive = v; },
    get activeSherlockFilter() { return getActiveTabObj().activeSherlockFilter; },
    set activeSherlockFilter(v) { getActiveTabObj().activeSherlockFilter = v; },
    get sherlockResults() { return getActiveTabObj().sherlockResults; },
    set sherlockResults(v) { getActiveTabObj().sherlockResults = v; },
    get searchItems() { return getActiveTabObj().searchItems; },
    set searchItems(v) { getActiveTabObj().searchItems = v; },
    get freeSpaceBytes() { return getActiveTabObj().freeSpaceBytes; },
    set freeSpaceBytes(v) { getActiveTabObj().freeSpaceBytes = v; },
    get totalSpaceBytes() { return getActiveTabObj().totalSpaceBytes; },
    set totalSpaceBytes(v) { getActiveTabObj().totalSpaceBytes = v; },
    get expandedDirs() { return getActiveTabObj().expandedDirs; }
  };

  function getDirBaseName(p) {
    if (!p) return 'Carpeta';
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(p) || p.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const clean = isWindows ? p.replace(/\//g, '\\').replace(/\\+$/, '') : p.replace(/\\+$/, '');
    const idx = clean.lastIndexOf(sep);
    if (idx >= 0) {
      const name = clean.substring(idx + 1);
      return name || clean;
    }
    return clean;
  }

  // DOM Elements
  const elPanels = [
    {
      fileList: document.getElementById('fileList'),
      sortHeaderName: document.getElementById('sortHeaderName'),
      sortHeaderType: document.getElementById('sortHeaderType'),
      sortHeaderSize: document.getElementById('sortHeaderSize'),
      sortHeaderDate: document.getElementById('sortHeaderDate'),
      sortIconName: document.getElementById('sortIconName'),
      sortIconType: document.getElementById('sortIconType'),
      sortIconSize: document.getElementById('sortIconSize'),
      sortIconDate: document.getElementById('sortIconDate')
    },
    {
      fileList: document.getElementById('fileListB'),
      sortHeaderName: document.getElementById('sortHeaderNameB'),
      sortHeaderType: document.getElementById('sortHeaderTypeB'),
      sortHeaderSize: document.getElementById('sortHeaderSizeB'),
      sortHeaderDate: document.getElementById('sortHeaderDateB'),
      sortIconName: document.getElementById('sortIconNameB'),
      sortIconType: document.getElementById('sortIconTypeB'),
      sortIconSize: document.getElementById('sortIconSizeB'),
      sortIconDate: document.getElementById('sortIconDateB')
    }
  ];

  const baseEl = {
    panelA: document.getElementById('panelA'),
    panelB: document.getElementById('panelB'),
    panelAHeader: document.getElementById('panelAHeader'),
    panelBHeader: document.getElementById('panelBHeader'),
    panelABadge: document.getElementById('panelABadge'),
    panelBBadge: document.getElementById('panelBBadge'),
    panelAPathBox: document.getElementById('panelAPathBox'),
    panelBPathBox: document.getElementById('panelBPathBox'),
    panelATabsContainer: document.getElementById('panelATabsContainer'),
    panelBTabsContainer: document.getElementById('panelBTabsContainer'),
    panelACount: document.getElementById('panelACount'),
    panelBCount: document.getElementById('panelBCount'),
    pathIndicatorA: document.getElementById('pathIndicatorA'),
    pathIndicatorB: document.getElementById('pathIndicatorB'),
    menuBar: document.getElementById('menuBar'),
    menuBarItems: document.getElementById('menuBarItems'),
    btnWinMinimize: document.getElementById('btnWinMinimize'),
    btnWinMaximize: document.getElementById('btnWinMaximize'),
    btnWinClose: document.getElementById('btnWinClose'),
    iconWinMaximize: document.getElementById('iconWinMaximize'),
    iconWinRestore: document.getElementById('iconWinRestore'),
    chkShowMenuBar: document.getElementById('chkShowMenuBar'),
    menuToggleMenuBar: document.getElementById('menuToggleMenuBar'),
    tabBar: document.getElementById('tabBar'),
    tabList: document.getElementById('tabList'),
    btnNewTab: document.getElementById('btnNewTab'),
    tagLinks: document.getElementById('tagLinks'),
    btnClearActiveTagFilter: document.getElementById('btnClearActiveTagFilter'),
    breadcrumbs: document.getElementById('breadcrumbs'),
    quickLinks: document.getElementById('quickLinks'),
    favoriteLinks: document.getElementById('favoriteLinks'),

    frequentLinks: document.getElementById('frequentLinks'),

    driveLinks: document.getElementById('driveLinks'),
    searchInput: document.getElementById('searchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    chkShowHidden: document.getElementById('chkShowHidden'),
    btnBack: document.getElementById('btnBack'),
    btnForward: document.getElementById('btnForward'),
    btnParentDir: document.getElementById('btnParentDir'),
    btnRefresh: document.getElementById('btnRefresh'),
    statusItemCount: document.getElementById('statusItemCount'),
    statusDiskSpace: document.getElementById('statusDiskSpace') || document.getElementById('statusSelection'),
    statusSelection: document.getElementById('statusDiskSpace') || document.getElementById('statusSelection'),
    quickViewModal: document.getElementById('quickViewModal'),
    quickViewCard: document.getElementById('quickViewCard'),
    qvTitle: document.getElementById('qvTitle'),
    qvIcon: document.getElementById('qvIcon'),
    qvBadge: document.getElementById('qvBadge'),
    qvContent: document.getElementById('qvContent'),
    qvDetails: document.getElementById('qvDetails'),
    btnQvClose: document.getElementById('btnQvClose'),
    btnQvDelete: document.getElementById('btnQvDelete'),
    btnQvOpenDefault: document.getElementById('btnQvOpenDefault'),
    btnQvOpenEditor: document.getElementById('btnQvOpenEditor'),
    btnActionTerminal: document.getElementById('btnActionTerminal'),
    btnActionEdit: document.getElementById('btnActionEdit'),
    btnActionNewFile: document.getElementById('btnActionNewFile'),
    btnActionNewFolder: document.getElementById('btnActionNewFolder'),
    btnActionCut: document.getElementById('btnActionCut'),
    btnActionCopy: document.getElementById('btnActionCopy'),
    btnActionPaste: document.getElementById('btnActionPaste'),
    btnActionDelete: document.getElementById('btnActionDelete'),
    btnActionQuickView: document.getElementById('btnActionQuickView'),
    btnToggleSplitView: document.getElementById('btnToggleSplitView'),
    menuToggleSplitView: document.getElementById('menuToggleSplitView'),
    btnActionCalcDirSizes: document.getElementById('btnActionCalcDirSizes'),
    btnOpenAppearance: document.getElementById('btnOpenAppearance'),
    iconActionTerminal: document.getElementById('iconActionTerminal'),
    iconActionEdit: document.getElementById('iconActionEdit'),
    iconActionNewFile: document.getElementById('iconActionNewFile'),
    iconActionNewFolder: document.getElementById('iconActionNewFolder'),
    iconActionCut: document.getElementById('iconActionCut'),
    iconActionCopy: document.getElementById('iconActionCopy'),
    iconActionPaste: document.getElementById('iconActionPaste'),
    iconActionDelete: document.getElementById('iconActionDelete'),
    iconActionCalcDirSizes: document.getElementById('iconActionCalcDirSizes'),
    iconActionSherlock: document.getElementById('iconActionSherlock'),
    iconActionExportList: document.getElementById('iconActionExportList'),
    iconOpenAppearance: document.getElementById('iconOpenAppearance'),
    iconActionQuickView: document.getElementById('iconActionQuickView'),
    iconNetwork: document.getElementById('iconNetwork'),
    chkRecursiveSearch: document.getElementById('chkRecursiveSearch'),
    clipboardBadge: document.getElementById('clipboardBadge'),
    pasteProgressContainer: document.getElementById('pasteProgressContainer'),
    pasteProgressBar: document.getElementById('pasteProgressBar'),
    pasteProgressPercent: document.getElementById('pasteProgressPercent'),
    pasteProgressLabel: document.getElementById('pasteProgressLabel'),
    pasteDetailsCard: document.getElementById('pasteDetailsCard'),
    pasteDetailsTitle: document.getElementById('pasteDetailsTitle'),
    pasteTasksList: document.getElementById('pasteTasksList'),
    btnClosePasteDetails: document.getElementById('btnClosePasteDetails'),
    btnAddCurrentFav: document.getElementById('btnAddCurrentFav'),
    btnConnectNetwork: document.getElementById('btnConnectNetwork'),
    btnOpenNetworkDialog: document.getElementById('btnOpenNetworkDialog'),
    modalNewFile: document.getElementById('modalNewFile'),
    inputNewFileName: document.getElementById('inputNewFileName'),
    chkOpenAfterCreate: document.getElementById('chkOpenAfterCreate'),
    btnConfirmNewFile: document.getElementById('btnConfirmNewFile'),
    btnCancelNewFile: document.getElementById('btnCancelNewFile'),
    btnCloseNewFileModal: document.getElementById('btnCloseNewFileModal'),
    modalNewFolder: document.getElementById('modalNewFolder'),
    inputNewFolderName: document.getElementById('inputNewFolderName'),
    btnConfirmNewFolder: document.getElementById('btnConfirmNewFolder'),
    btnCancelNewFolder: document.getElementById('btnCancelNewFolder'),
    btnCloseNewFolderModal: document.getElementById('btnCloseNewFolderModal'),
    modalNetwork: document.getElementById('modalNetwork'),
    inputNetworkPath: document.getElementById('inputNetworkPath'),
    btnConfirmNetwork: document.getElementById('btnConfirmNetwork'),
    btnCancelNetwork: document.getElementById('btnCancelNetwork'),
    btnCloseNetworkModal: document.getElementById('btnCloseNetworkModal'),
    modalHelp: document.getElementById('modalHelp'),
    btnCloseHelpModal: document.getElementById('btnCloseHelpModal'),
    btnConfirmHelp: document.getElementById('btnConfirmHelp'),
    modalAppearance: document.getElementById('modalAppearance'),
    rangeUiScale: document.getElementById('rangeUiScale'),
    lblUiScaleValue: document.getElementById('lblUiScaleValue'),
    selectTheme: document.getElementById('selectTheme'),
    selectIconPack: document.getElementById('selectIconPack'),
    chkMonochromeIcons: document.getElementById('chkMonochromeIcons'),
    externalAppsListContainer: document.getElementById('externalAppsListContainer'),
    btnResetExternalApps: document.getElementById('btnResetExternalApps'),
    selectTextEditor: document.getElementById('selectTextEditor'),
    customEditorContainer: document.getElementById('customEditorContainer'),
    inputCustomEditor: document.getElementById('inputCustomEditor'),
    selectTerminalApp: document.getElementById('selectTerminalApp'),
    customTerminalContainer: document.getElementById('customTerminalContainer'),
    inputCustomTerminal: document.getElementById('inputCustomTerminal'),
    selectFontSize: document.getElementById('selectFontSize'),
    chkNormalFontWeight: document.getElementById('chkNormalFontWeight'),
    chkPrefShowHidden: document.getElementById('chkPrefShowHidden'),
    chkPrefRecursiveSearch: document.getElementById('chkPrefRecursiveSearch'),
    chkPrefRecursiveTags: document.getElementById('chkPrefRecursiveTags'),
    inputCustomTextExts: document.getElementById('inputCustomTextExts'),
    btnCancelAppearance: document.getElementById('btnCancelAppearance'),
    btnConfirmAppearance: document.getElementById('btnConfirmAppearance'),
    btnCloseAppearanceModal: document.getElementById('btnCloseAppearanceModal'),
    
    modalBatchRename: document.getElementById('modalBatchRename'),
    btnCloseBatchRenameModal: document.getElementById('btnCloseBatchRenameModal'),
    btnCancelBatchRename: document.getElementById('btnCancelBatchRename'),
    btnConfirmBatchRename: document.getElementById('btnConfirmBatchRename'),
    tabBatchSequence: document.getElementById('tabBatchSequence'),
    tabBatchReplace: document.getElementById('tabBatchReplace'),
    panelBatchSequence: document.getElementById('panelBatchSequence'),
    panelBatchReplace: document.getElementById('panelBatchReplace'),
    inputBatchBaseName: document.getElementById('inputBatchBaseName'),
    chkBatchKeepOriginalName: document.getElementById('chkBatchKeepOriginalName'),
    selectBatchSeparator: document.getElementById('selectBatchSeparator'),
    inputBatchStartNum: document.getElementById('inputBatchStartNum'),
    selectBatchDigits: document.getElementById('selectBatchDigits'),
    chkBatchKeepExt: document.getElementById('chkBatchKeepExt'),
    inputBatchSearch: document.getElementById('inputBatchSearch'),
    inputBatchReplace: document.getElementById('inputBatchReplace'),
    chkBatchRegex: document.getElementById('chkBatchRegex'),
    batchRenamePreviewBody: document.getElementById('batchRenamePreviewBody'),
    batchRenameCount: document.getElementById('batchRenameCount'),
    ctxMenuBatchRename: document.getElementById('ctxMenuBatchRename'),
    modalRenameItem: document.getElementById('modalRenameItem'),
    inputRenameItemName: document.getElementById('inputRenameItemName'),
    btnConfirmRenameItem: document.getElementById('btnConfirmRenameItem'),
    btnCancelRenameItem: document.getElementById('btnCancelRenameItem'),
    btnCloseRenameItemModal: document.getElementById('btnCloseRenameItemModal'),
    modalRenameFavorite: document.getElementById('modalRenameFavorite'),
    inputRenameFavName: document.getElementById('inputRenameFavName'),
    btnConfirmRenameFav: document.getElementById('btnConfirmRenameFav'),
    btnCancelRenameFav: document.getElementById('btnCancelRenameFav'),
    btnCloseRenameFavModal: document.getElementById('btnCloseRenameFavModal'),
    modalRenameTag: document.getElementById('modalRenameTag'),
    inputRenameTagName: document.getElementById('inputRenameTagName'),
    renameTagDot: document.getElementById('renameTagDot'),
    btnConfirmRenameTag: document.getElementById('btnConfirmRenameTag'),
    btnCancelRenameTag: document.getElementById('btnCancelRenameTag'),
    btnCloseRenameTagModal: document.getElementById('btnCloseRenameTagModal'),
    btnRefreshDrives: document.getElementById('btnRefreshDrives'),
    btnToggleMillerView: document.getElementById('btnToggleMillerView'),
    iconToggleMillerView: document.getElementById('iconToggleMillerView'),
    menuToggleMillerView: document.getElementById('menuToggleMillerView'),
    millerContainer: document.getElementById('millerContainer'),
    millerColParent: document.getElementById('millerColParent'),
    millerParentHeader: document.getElementById('millerParentHeader'),
    millerParentTitle: document.getElementById('millerParentTitle'),
    millerParentCount: document.getElementById('millerParentCount'),
    millerParentList: document.getElementById('millerParentList'),
    millerColCurrent: document.getElementById('millerColCurrent'),
    millerCurrentTitle: document.getElementById('millerCurrentTitle'),
    millerCurrentCount: document.getElementById('millerCurrentCount'),
    millerCurrentList: document.getElementById('millerCurrentList'),
    millerColPreview: document.getElementById('millerColPreview'),
    millerPreviewIcon: document.getElementById('millerPreviewIcon'),
    millerPreviewTitle: document.getElementById('millerPreviewTitle'),
    millerPreviewBadge: document.getElementById('millerPreviewBadge'),
    millerPreviewContent: document.getElementById('millerPreviewContent'),
    modalConfirmExit: document.getElementById('modalConfirmExit'),
    btnCancelExit: document.getElementById('btnCancelExit'),
    btnForceExit: document.getElementById('btnForceExit'),
    btnCloseExitModal: document.getElementById('btnCloseExitModal'),
    modalAbout: document.getElementById('modalAbout'),
    btnCloseAboutModal: document.getElementById('btnCloseAboutModal'),
    btnConfirmAbout: document.getElementById('btnConfirmAbout'),
    aboutVersion: document.getElementById('aboutVersion'),
    aboutBuildUnix: document.getElementById('aboutBuildUnix'),
    aboutBuildDate: document.getElementById('aboutBuildDate'),
    linkAboutGithub: document.getElementById('linkAboutGithub'),
    btnCheckUpdates: document.getElementById('btnCheckUpdates'),
    btnCheckUpdatesSpinner: document.getElementById('btnCheckUpdatesSpinner'),
    btnCheckUpdatesText: document.getElementById('btnCheckUpdatesText'),
    updateStatusBox: document.getElementById('updateStatusBox'),
    updateStatusMsg: document.getElementById('updateStatusMsg'),
    updateReleaseNotesBox: document.getElementById('updateReleaseNotesBox'),
    updateProgressContainer: document.getElementById('updateProgressContainer'),
    updateProgressText: document.getElementById('updateProgressText'),
    updateProgressPercent: document.getElementById('updateProgressPercent'),
    updateProgressBar: document.getElementById('updateProgressBar'),
    updateActionsContainer: document.getElementById('updateActionsContainer'),
    btnApplyUpdate: document.getElementById('btnApplyUpdate'),
    btnDownloadManual: document.getElementById('btnDownloadManual'),
    btnRestartApp: document.getElementById('btnRestartApp'),
    menuNewFile: document.getElementById('menuNewFile'),
    menuNewFolder: document.getElementById('menuNewFolder'),
    menuRename: document.getElementById('menuRename'),
    menuOpenDefault: document.getElementById('menuOpenDefault'),
    menuOpenWith: document.getElementById('menuOpenWith'),
    menuShowInExplorer: document.getElementById('menuShowInExplorer'),
    menuCompress: document.getElementById('menuCompress'),
    menuProperties: document.getElementById('menuProperties'),
    menuDelete: document.getElementById('menuDelete'),
    menuAddFavorite: document.getElementById('menuAddFavorite'),
    menuCut: document.getElementById('menuCut'),
    menuCopy: document.getElementById('menuCopy'),
    menuPaste: document.getElementById('menuPaste'),
    menuSelectAll: document.getElementById('menuSelectAll'),
    menuQuickView: document.getElementById('menuQuickView'),
    menuCalcDirSizes: document.getElementById('menuCalcDirSizes'),
    menuRefresh: document.getElementById('menuRefresh'),
    menuToggleHidden: document.getElementById('menuToggleHidden'),
    menuAppearance: document.getElementById('menuAppearance'),
    menuShortcuts: document.getElementById('menuShortcuts'),
    menuAbout: document.getElementById('menuAbout'),
    fileContextMenu: document.getElementById('fileContextMenu'),
    ctxMenuOpen: document.getElementById('ctxMenuOpen'),
    ctxMenuOpenWith: document.getElementById('ctxMenuOpenWith'),
    ctxMenuQuickView: document.getElementById('ctxMenuQuickView'),
    ctxMenuOpenEditor: document.getElementById('ctxMenuOpenEditor'),
    ctxMenuOpenLocation: document.getElementById('ctxMenuOpenLocation'),
    ctxMenuShowInExplorer: document.getElementById('ctxMenuShowInExplorer'),
    ctxMenuCopyPath: document.getElementById('ctxMenuCopyPath'),
    ctxMenuCopyPosix: document.getElementById('ctxMenuCopyPosix'),
    ctxMenuCopyName: document.getElementById('ctxMenuCopyName'),
    ctxMenuExtractHere: document.getElementById('ctxMenuExtractHere'),
    ctxMenuExtractToFolder: document.getElementById('ctxMenuExtractToFolder'),
    ctxMenuExtractToFolderText: document.getElementById('ctxMenuExtractToFolderText'),
    ctxMenuArchiveViewContent: document.getElementById('ctxMenuArchiveViewContent'),
    ctxMenuCompress: document.getElementById('ctxMenuCompress'),
    ctxMenuRename: document.getElementById('ctxMenuRename'),
    ctxMenuCut: document.getElementById('ctxMenuCut'),
    ctxMenuCopy: document.getElementById('ctxMenuCopy'),
    ctxMenuDuplicate: document.getElementById('ctxMenuDuplicate'),
    ctxMenuAddFavorite: document.getElementById('ctxMenuAddFavorite'),
    ctxMenuDelete: document.getElementById('ctxMenuDelete'),
    ctxMenuPdfTools: document.getElementById('ctxMenuPdfTools'),
    btnCtxPdfToolsTrigger: document.getElementById('btnCtxPdfToolsTrigger'),
    ctxMenuPdfToolsSub: document.getElementById('ctxMenuPdfToolsSub'),
    ctxPdfToImages: document.getElementById('ctxPdfToImages'),
    ctxPdfOptimize: document.getElementById('ctxPdfOptimize'),
    ctxPdfSplit: document.getElementById('ctxPdfSplit'),
    ctxPdfRotate: document.getElementById('ctxPdfRotate'),
    ctxPdfExtractText: document.getElementById('ctxPdfExtractText'),
    ctxPdfImagesToPdf: document.getElementById('ctxPdfImagesToPdf'),
    ctxPdfMerge: document.getElementById('ctxPdfMerge'),

    modalPdfToImages: document.getElementById('modalPdfToImages'),
    btnClosePdfToImagesModal: document.getElementById('btnClosePdfToImagesModal'),
    btnCancelPdfToImages: document.getElementById('btnCancelPdfToImages'),
    btnConfirmPdfToImages: document.getElementById('btnConfirmPdfToImages'),
    inputPdfToImagesRange: document.getElementById('inputPdfToImagesRange'),
    selectPdfToImagesFormat: document.getElementById('selectPdfToImagesFormat'),
    pdfToImagesOutputDir: document.getElementById('pdfToImagesOutputDir'),
    pdfToImagesStatus: document.getElementById('pdfToImagesStatus'),
    pdfToImagesStatusText: document.getElementById('pdfToImagesStatusText'),

    modalPdfOptimize: document.getElementById('modalPdfOptimize'),
    btnClosePdfOptimizeModal: document.getElementById('btnClosePdfOptimizeModal'),
    btnCancelPdfOptimize: document.getElementById('btnCancelPdfOptimize'),
    btnConfirmPdfOptimize: document.getElementById('btnConfirmPdfOptimize'),
    pdfOptimizeOrigSize: document.getElementById('pdfOptimizeOrigSize'),
    pdfOptimizeEstimatedSize: document.getElementById('pdfOptimizeEstimatedSize'),
    pdfOptimizeQualityVal: document.getElementById('pdfOptimizeQualityVal'),
    sliderPdfOptimizeQuality: document.getElementById('sliderPdfOptimizeQuality'),
    inputPdfOptimizeOutName: document.getElementById('inputPdfOptimizeOutName'),
    pdfOptimizeStatus: document.getElementById('pdfOptimizeStatus'),

    modalPdfMerge: document.getElementById('modalPdfMerge'),
    btnClosePdfMergeModal: document.getElementById('btnClosePdfMergeModal'),
    btnCancelPdfMerge: document.getElementById('btnCancelPdfMerge'),
    btnConfirmPdfMerge: document.getElementById('btnConfirmPdfMerge'),
    pdfMergeList: document.getElementById('pdfMergeList'),
    inputPdfMergeOutName: document.getElementById('inputPdfMergeOutName'),
    pdfMergeStatus: document.getElementById('pdfMergeStatus'),

    modalPdfExtractText: document.getElementById('modalPdfExtractText'),
    btnClosePdfExtractTextModal: document.getElementById('btnClosePdfExtractTextModal'),
    btnCancelPdfExtractText: document.getElementById('btnCancelPdfExtractText'),
    btnConfirmPdfExtractText: document.getElementById('btnConfirmPdfExtractText'),
    pdfExtractStatus: document.getElementById('pdfExtractStatus'),
    ctxMenuProperties: document.getElementById('ctxMenuProperties'),
    ctxMenuClearTags: document.getElementById('ctxMenuClearTags'),
    modalOpenWith: document.getElementById('modalOpenWith'),
    btnCloseOpenWithModal: document.getElementById('btnCloseOpenWithModal'),
    btnCancelOpenWith: document.getElementById('btnCancelOpenWith'),
    openWithFileName: document.getElementById('openWithFileName'),
    openWithSuggestions: document.getElementById('openWithSuggestions'),
    inputOpenWithApp: document.getElementById('inputOpenWithApp'),
    btnLaunchCustomApp: document.getElementById('btnLaunchCustomApp'),
    btnOpenWithSystemDialog: document.getElementById('btnOpenWithSystemDialog'),
    modalCompress: document.getElementById('modalCompress'),
    btnCloseCompressModal: document.getElementById('btnCloseCompressModal'),
    btnCancelCompress: document.getElementById('btnCancelCompress'),
    btnConfirmCompress: document.getElementById('btnConfirmCompress'),
    inputCompressName: document.getElementById('inputCompressName'),
    compressItemsCount: document.getElementById('compressItemsCount'),
    modalArchiveView: document.getElementById('modalArchiveView'),
    btnCloseArchiveViewModal: document.getElementById('btnCloseArchiveViewModal'),
    btnArchiveClose: document.getElementById('btnArchiveClose'),
    archiveViewFileName: document.getElementById('archiveViewFileName'),
    inputArchiveFilter: document.getElementById('inputArchiveFilter'),
    archiveTotalCount: document.getElementById('archiveTotalCount'),
    archiveTableBody: document.getElementById('archiveTableBody'),
    btnArchiveExtractAll: document.getElementById('btnArchiveExtractAll'),
    btnActionSherlock: document.getElementById('btnActionSherlock'),
    sherlockBanner: document.getElementById('sherlockBanner'),
    sherlockBannerTitle: document.getElementById('sherlockBannerTitle'),
    sherlockBannerScope: document.getElementById('sherlockBannerScope'),
    sherlockBannerCount: document.getElementById('sherlockBannerCount'),
    btnSherlockBannerEdit: document.getElementById('btnSherlockBannerEdit'),
    btnSherlockBannerClose: document.getElementById('btnSherlockBannerClose'),
    
    modalJumpToFolder: document.getElementById('modalJumpToFolder'),
    inputJumpToFolder: document.getElementById('inputJumpToFolder'),
    jumpToFolderList: document.getElementById('jumpToFolderList'),
modalSherlock: document.getElementById('modalSherlock'),
    btnCloseSherlockModal: document.getElementById('btnCloseSherlockModal'),
    btnCancelSherlock: document.getElementById('btnCancelSherlock'),
    sherlockCurrentPath: document.getElementById('sherlockCurrentPath'),
    chkSherlockRoot: document.getElementById('chkSherlockRoot'),
    btnPreset24h: document.getElementById('btnPreset24h'),
    btnPresetLargeFiles: document.getElementById('btnPresetLargeFiles'),
    btnPresetLargeDirs: document.getElementById('btnPresetLargeDirs'),
    inputSherlockQuery: document.getElementById('inputSherlockQuery'),
    selectSherlockSizeMode: document.getElementById('selectSherlockSizeMode'),
    sherlockSizeControls: document.getElementById('sherlockSizeControls'),
    sliderSherlockSize: document.getElementById('sliderSherlockSize'),
    inputSherlockSizeNum: document.getElementById('inputSherlockSizeNum'),
    selectSherlockSizeUnit: document.getElementById('selectSherlockSizeUnit'),
    inputSherlockDateStart: document.getElementById('inputSherlockDateStart'),
    inputSherlockDateEnd: document.getElementById('inputSherlockDateEnd'),
    btnDateQuickWeek: document.getElementById('btnDateQuickWeek'),
    btnDateQuickMonth: document.getElementById('btnDateQuickMonth'),
    btnDateClear: document.getElementById('btnDateClear'),
    btnResetSherlockFilters: document.getElementById('btnResetSherlockFilters'),
    btnExecuteSherlock: document.getElementById('btnExecuteSherlock'),
    txtExecuteSherlock: document.getElementById('txtExecuteSherlock'),
    btnActionExportList: document.getElementById('btnActionExportList'),
    menuExportList: document.getElementById('menuExportList'),
    ctxMenuExportList: document.getElementById('ctxMenuExportList'),
    modalExportList: document.getElementById('modalExportList'),
    btnCloseExportListModal: document.getElementById('btnCloseExportListModal'),
    btnCancelExportList: document.getElementById('btnCancelExportList'),
    btnConfirmExportList: document.getElementById('btnConfirmExportList'),
    exportListTargetDir: document.getElementById('exportListTargetDir'),
    inputExportListName: document.getElementById('inputExportListName'),
    chkExportListRecursive: document.getElementById('chkExportListRecursive'),
    chkExportListIncludeFiles: document.getElementById('chkExportListIncludeFiles'),
    chkExportListDetails: document.getElementById('chkExportListDetails'),
    exportListDepthContainer: document.getElementById('exportListDepthContainer'),
    exportListDepthLabel: document.getElementById('exportListDepthLabel'),
    chkExportListFullDepth: document.getElementById('chkExportListFullDepth'),
    chkExportListOpenAfter: document.getElementById('chkExportListOpenAfter'),

    // Frequent Context Menu & Preferences
    ctxMenuFrequent: document.getElementById('ctxMenuFrequent'),
    ctxMenuFrequentPathHeader: document.getElementById('ctxMenuFrequentPathHeader'),
    ctxMenuFrequentResetThis: document.getElementById('ctxMenuFrequentResetThis'),
    ctxMenuFrequentHideThis: document.getElementById('ctxMenuFrequentHideThis'),
    ctxMenuFrequentResetAll: document.getElementById('ctxMenuFrequentResetAll'),

    // Directory Background Context Menu
    dirContextMenu: document.getElementById('dirContextMenu'),
    ctxDirNewFolder: document.getElementById('ctxDirNewFolder'),
    ctxDirNewFile: document.getElementById('ctxDirNewFile'),
    ctxDirPaste: document.getElementById('ctxDirPaste'),
    ctxDirSelectAll: document.getElementById('ctxDirSelectAll'),
    ctxDirRefresh: document.getElementById('ctxDirRefresh'),
    ctxDirTerminal: document.getElementById('ctxDirTerminal'),
    ctxDirExportList: document.getElementById('ctxDirExportList'),
    ctxDirCalcSizes: document.getElementById('ctxDirCalcSizes'),
    ctxDirProperties: document.getElementById('ctxDirProperties'),

    btnResetFrequentStats: document.getElementById('btnResetFrequentStats'),
    hiddenFrequentContainer: document.getElementById('hiddenFrequentContainer'),
    hiddenFrequentList: document.getElementById('hiddenFrequentList'),
    btnUnarchiveAllFrequent: document.getElementById('btnUnarchiveAllFrequent'),
    customTagInputsContainer: document.getElementById('customTagInputsContainer'),
    btnResetTagNames: document.getElementById('btnResetTagNames')
  };

  const el = new Proxy(baseEl, {
    get(target, prop) {
      if (prop in elPanels[activePanel]) {
        return elPanels[activePanel][prop];
      }
      return target[prop];
    }
  });

  // Format Helpers
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(unixSeconds) {
    if (!unixSeconds) return '--';
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getFileIconKey(item) {
    if (item.is_directory) return 'folder';
    const ext = (item.extension || '').toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['docx', 'doc', 'docm', 'dotx', 'dot', 'odt', 'rtf'].includes(ext)) return 'document';
    if (['xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'xlt', 'ods'].includes(ext)) return 'spreadsheet';
    if (['pptx', 'ppt', 'pptm', 'potx', 'pot', 'odp'].includes(ext)) return 'presentation';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso', 'cab'].includes(ext)) return 'archive';
    if (['rs', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'c', 'cpp', 'h', 'hpp', 'sh', 'bat', 'ps1', 'json', 'toml', 'yaml', 'yml', 'xml'].includes(ext)) return 'code';
    if (['exe', 'msi', 'bin', 'dll', 'sys', 'appimage', 'deb', 'rpm'].includes(ext)) return 'binary';
    if (state.customTextExts.includes(ext) || ext === 'txt' || ext === 'md' || ext === 'log') return 'text';

    switch (item.file_type) {
      case 'image': return 'image';
      case 'audio': return 'audio';
      case 'video': return 'video';
      case 'text': return 'text';
      case 'office': return 'document';
      case 'archive': return 'archive';
      default: return 'text';
    }
  }

  function getFileIcon(item) {
    const key = getFileIconKey(item);
    return getUiIconHtml(key, getDefaultEmojiForIconKey(key));
  }

  function getUiIconHtml(key, defaultFallback, extraClass = '') {
    const pack = state.iconPack || 'default';
    if (pack !== 'default') {
      return `<img src="icons/${pack}/${key}.svg" class="w-full h-full object-contain inline-block align-middle pointer-events-none ${extraClass}" alt="" />`;
    }
    return defaultFallback || '';
  }

  function getPlaceIconKey(id) {
    switch (id) {
      case 'home': return 'home';
      case 'desktop': return 'desktop';
      case 'downloads': return 'archive';
      case 'documents': return 'document';
      case 'pictures': return 'image';
      case 'videos': return 'video';
      case 'music': return 'audio';
      default: return 'folder';
    }
  }

  function updateToolbarIcons() {
    if (el.iconActionTerminal) el.iconActionTerminal.innerHTML = getUiIconHtml('terminal', '&gt;_');
    if (el.iconActionEdit) el.iconActionEdit.innerHTML = getUiIconHtml('code', '📝');
    if (el.iconActionNewFile) el.iconActionNewFile.innerHTML = getUiIconHtml('text', '📄');
    if (el.iconActionNewFolder) el.iconActionNewFolder.innerHTML = getUiIconHtml('folder', '📁');
    if (el.iconActionCut) el.iconActionCut.innerHTML = getUiIconHtml('cut', '✂️');
    if (el.iconActionCopy) el.iconActionCopy.innerHTML = getUiIconHtml('copy', '📋');
    if (el.iconActionPaste) el.iconActionPaste.innerHTML = getUiIconHtml('paste', '📥');
    if (el.iconActionDelete) el.iconActionDelete.innerHTML = getUiIconHtml('delete', '🗑️');
    if (el.iconActionCalcDirSizes) el.iconActionCalcDirSizes.innerHTML = getUiIconHtml('spreadsheet', '📊');
    if (el.iconActionSherlock) el.iconActionSherlock.innerHTML = getUiIconHtml('search', '🔍');
    if (el.iconActionExportList) el.iconActionExportList.innerHTML = getUiIconHtml('document', '🔭📄');
    if (el.iconOpenAppearance) el.iconOpenAppearance.innerHTML = getUiIconHtml('gear', '⚙️');
    if (el.iconActionQuickView) el.iconActionQuickView.innerHTML = getUiIconHtml('eye', '👁️');
    if (el.iconNetwork) el.iconNetwork.innerHTML = getUiIconHtml('network', '🌐');
  }

  function getDefaultEmojiForIconKey(key) {
    switch (key) {
      case 'folder': return '📁';
      case 'pdf': return '📕';
      case 'document': return '📘';
      case 'spreadsheet': return '📊';
      case 'presentation': return '📙';
      case 'archive': return '🗜️';
      case 'code': return '💻';
      case 'binary': return '⚙️';
      case 'image': return '🖼️';
      case 'audio': return '🎵';
      case 'video': return '🎬';
      case 'text': return '📄';
      default: return '📄';
    }
  }

  function getFileTypeName(item) {
    if (item.is_directory) return 'Carpeta';
    const ext = (item.extension || '').toLowerCase();
    if (ext) {
      if (state.customTextExts.includes(ext)) {
        return `Texto (.${ext.toUpperCase()})`;
      }
      const extMap = {
        'pdf': 'PDF',
        'png': 'Imagen PNG',
        'jpg': 'Imagen JPEG',
        'jpeg': 'Imagen JPEG',
        'gif': 'Imagen GIF',
        'webp': 'Imagen WebP',
        'svg': 'Imagen SVG',
        'ico': 'Icono',
        'dng': 'Imagen RAW (DNG)',
        'heic': 'Imagen HEIC',
        'heif': 'Imagen HEIF',
        'avif': 'Imagen AVIF',
        'cr2': 'Imagen RAW Canon',
        'nef': 'Imagen RAW Nikon',
        'arw': 'Imagen RAW Sony',
        'raw': 'Imagen RAW',
        'docx': 'Documento Word',
        'doc': 'Documento Word (97-2003)',
        'xlsx': 'Hoja de cálculo Excel',
        'xls': 'Hoja de cálculo Excel (97-2003)',
        'pptx': 'Presentación PowerPoint',
        'ppt': 'Presentación PowerPoint (97-2003)',
        'odt': 'Documento OpenDocument',
        'ods': 'Hoja de cálculo OpenDocument',
        'odp': 'Presentación OpenDocument',
        'rtf': 'Documento RTF',
        'mp4': 'Vídeo MP4',
        'mkv': 'Vídeo MKV',
        'avi': 'Vídeo AVI',
        'webm': 'Vídeo WebM',
        'mp3': 'Audio MP3',
        'wav': 'Audio WAV',
        'flac': 'Audio FLAC',
        'ogg': 'Audio OGG',
        'txt': 'Texto',
        'md': 'Markdown',
        'rs': 'Código Rust',
        'py': 'Código Python',
        'js': 'JavaScript',
        'json': 'JSON',
        'yaml': 'YAML',
        'yml': 'YAML',
        'toml': 'TOML',
        'html': 'HTML',
        'css': 'CSS',
        'sql': 'Script SQL',
        'str': 'Archivo Texto (STR)',
        'zip': 'Archivo ZIP',
        'rar': 'Archivo RAR',
        '7z': 'Archivo 7Z',
        'tar': 'Archivo TAR',
        'gz': 'Archivo GZ',
        'exe': 'Ejecutable',
        'dll': 'Librería DLL'
      };
      if (extMap[ext]) return extMap[ext];
      return ext.toUpperCase();
    }
    return item.file_type ? item.file_type.toUpperCase() : 'Archivo';
  }

  function sortItems(list, pIdx = activePanel) {
    const pState = panels[pIdx];
    const sField = pState ? pState.sortField : (state.sortField || 'name');
    const sAsc = pState ? pState.sortAsc : (state.sortAsc !== false);

    return list.sort((a, b) => {
      // Directories always come first
      if (a.is_directory && !b.is_directory) return -1;
      if (!a.is_directory && b.is_directory) return 1;

      let res = 0;
      switch (sField) {
        case 'name':
          res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          break;
        case 'type':
          const typeA = a.is_directory ? ' ' : (a.extension || '');
          const typeB = b.is_directory ? ' ' : (b.extension || '');
          res = typeA.localeCompare(typeB, 'es', { sensitivity: 'base' });
          if (res === 0) {
            res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          }
          break;
        case 'size':
          const sizeA = a.is_directory ? (state.dirSizes.get(a.path)?.total_size || a.size || 0) : (a.size || 0);
          const sizeB = b.is_directory ? (state.dirSizes.get(b.path)?.total_size || b.size || 0) : (b.size || 0);
          if (sizeA < sizeB) res = -1;
          else if (sizeA > sizeB) res = 1;
          else res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          break;
        case 'date':
          const dateA = a.modified || 0;
          const dateB = b.modified || 0;
          if (dateA < dateB) res = -1;
          else if (dateA > dateB) res = 1;
          else res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          break;
      }
      return sAsc ? res : -res;
    });
  }

  function updateSortHeaderUI(targetPIdx = null) {
    const fields = ['Name', 'Type', 'Size', 'Date'];
    const pIndices = targetPIdx !== null ? [targetPIdx] : [0, 1];

    pIndices.forEach(pIdx => {
      const panelState = panels[pIdx];
      const panelEl = elPanels[pIdx];
      if (!panelState || !panelEl) return;
      const curField = panelState.sortField || 'name';
      const curAsc = panelState.sortAsc !== false;
      const currentFieldCap = curField.charAt(0).toUpperCase() + curField.slice(1);

      fields.forEach(f => {
        const icon = panelEl['sortIcon' + f];
        if (!icon) return;
        if (f === currentFieldCap) {
          icon.classList.remove('hidden');
          icon.textContent = curAsc ? '▲' : '▼';
        } else {
          icon.classList.add('hidden');
          icon.textContent = '';
        }
      });
    });
  }

  function setSort(field, pIdx = activePanel) {
    if (activePanel !== pIdx) {
      switchActivePanel(pIdx);
    }
    const targetPanel = panels[pIdx];
    if (!targetPanel) return;

    if (targetPanel.sortField === field) {
      targetPanel.sortAsc = !targetPanel.sortAsc;
    } else {
      targetPanel.sortField = field;
      targetPanel.sortAsc = true;
    }
    updateSortHeaderUI(pIdx);
    applyFilter(pIdx);

    // Maintain selection of active item in this panel
    if (targetPanel.selectedIndex >= 0 && targetPanel.selectedIndex < targetPanel.filteredItems.length) {
      const selectedPath = Array.from(targetPanel.selectedItems)[0];
      if (selectedPath) {
        const newIdx = targetPanel.filteredItems.findIndex(i => i.path === selectedPath);
        if (newIdx >= 0) targetPanel.selectedIndex = newIdx;
      }
    }
    renderFileList(pIdx);
    if (pIdx === activePanel) {
      updateStatusBar();
    }
  }

  // Directory Loading (Strictly Isolated by Panel Index)
  async function loadDirectory(path, addToHistory = true, targetPanelIdx = activePanel, pathToSelect = null) {
    const pIdx = targetPanelIdx;
    const targetPanel = panels[pIdx];
    const targetFileListEl = elPanels[pIdx]?.fileList;
    if (!targetPanel) return;

    if (targetFileListEl) {
      targetFileListEl.innerHTML = `<div class="p-4 text-xs text-gnome-textDim">Cargando directorio...</div>`;
    }

    try {
      const res = await invoke('read_directory', { path });
      if (!res) {
        if (targetFileListEl) targetFileListEl.innerHTML = `<div class="p-4 text-xs text-gnome-textDim">Directorio vacío</div>`;
        return;
      }

      targetPanel.currentDirectory = res.current_path;
      targetPanel.items = res.items || [];
      targetPanel.freeSpaceBytes = res.free_space_bytes ?? null;
      targetPanel.totalSpaceBytes = res.total_space_bytes ?? null;
      targetPanel.searchQuery = '';
      targetPanel.isSearchingRecursive = false;
      targetPanel.sherlockResults = null;
      targetPanel.searchItems = null;

      if (pIdx === activePanel) {
        if (el.sherlockBanner) el.sherlockBanner.classList.add('hidden');
        targetPanel.activeSherlockFilter = null;
        if (el.searchInput) el.searchInput.value = '';
        if (el.btnClearSearch) el.btnClearSearch.classList.add('hidden');
      }

      applyFilter(pIdx);

      if (addToHistory) {
        if (targetPanel.historyIndex < targetPanel.history.length - 1) {
          targetPanel.history = targetPanel.history.slice(0, targetPanel.historyIndex + 1);
        }
        targetPanel.history.push(targetPanel.currentDirectory);
        targetPanel.historyIndex = targetPanel.history.length - 1;
      }

      const previousSelectedPaths = new Set(targetPanel.selectedItems);
      targetPanel.selectedItems.clear();

      const normTarget = pathToSelect ? normPathForMatch(pathToSelect) : null;
      const normPrevSet = new Set();
      if (!normTarget && previousSelectedPaths.size > 0) {
        previousSelectedPaths.forEach(p => {
          if (p) normPrevSet.add(normPathForMatch(p));
        });
      }

      let foundIndex = -1;
      if (normTarget) {
        for (let i = 0; i < targetPanel.filteredItems.length; i++) {
          const item = targetPanel.filteredItems[i];
          if (normPathForMatch(item.path) === normTarget) {
            targetPanel.selectedItems.add(item.path);
            foundIndex = i;
            break;
          }
        }
      } else if (normPrevSet.size > 0) {
        for (let i = 0; i < targetPanel.filteredItems.length; i++) {
          const item = targetPanel.filteredItems[i];
          if (normPrevSet.has(normPathForMatch(item.path))) {
            targetPanel.selectedItems.add(item.path);
            if (foundIndex === -1) foundIndex = i;
          }
        }
      }

      if (foundIndex >= 0) {
        targetPanel.selectedIndex = foundIndex;
        targetPanel.selectionAnchor = foundIndex;
      } else {
        // If the previously selected item was deleted, stay at the closest neighboring index instead of resetting to 0
        const prevIdx = typeof targetPanel.selectedIndex === 'number' && targetPanel.selectedIndex >= 0
          ? targetPanel.selectedIndex
          : 0;
        const fallbackIdx = targetPanel.filteredItems.length > 0
          ? Math.min(prevIdx, targetPanel.filteredItems.length - 1)
          : -1;
        targetPanel.selectedIndex = fallbackIdx;
        targetPanel.selectionAnchor = fallbackIdx;
        if (fallbackIdx >= 0 && targetPanel.filteredItems[fallbackIdx]) {
          targetPanel.selectedItems.add(targetPanel.filteredItems[fallbackIdx].path);
        }
      }

      renderFileList(pIdx);

      if (pIdx === activePanel) {
        updateHistoryButtons();
        renderBreadcrumbs();
        updateStatusBar();
        renderTagSidebar();
        if (state.isMillerView) {
          renderMillerView();
        }
      }
      renderTabs();
      if (isSplitView) updatePanelHighlights();
      recordFrequentLocation(targetPanel.currentDirectory);
      if (pIdx === activePanel && targetFileListEl) {
        targetFileListEl.focus();
      }
    } catch (err) {
      if (targetFileListEl) {
        targetFileListEl.innerHTML = `<div class="p-4 text-xs text-red-400">Error al acceder: ${escapeHtml(String(err))}</div>`;
      }
    }
  }

  function updateHistoryButtons() {
    el.btnBack.disabled = state.historyIndex <= 0;
    el.btnForward.disabled = state.historyIndex >= state.history.length - 1;
    if (el.btnParentDir) {
      const p = state.currentDirectory ? state.currentDirectory.replace(/\\/g, '/').replace(/\/+$/, '') : '';
      el.btnParentDir.disabled = !p || p === '/' || (p.length === 2 && p.endsWith(':'));
    }
  }

  // Breadcrumbs
  function renderBreadcrumbs() {
    el.breadcrumbs.innerHTML = '';
    if (!state.currentDirectory) return;

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(state.currentDirectory) || state.currentDirectory.startsWith('\\\\');

    if (isWindows) {
      const rawPath = state.currentDirectory.replace(/\//g, '\\');
      const isUnc = rawPath.startsWith('\\\\');
      const parts = rawPath.split('\\').filter(p => p.length > 0);

      let accumulated = isUnc ? '\\\\' : '';
      parts.forEach((part, idx) => {
        if (idx === 0 && part.endsWith(':')) {
          accumulated = part + '\\';
        } else if (isUnc && idx === 0) {
          accumulated = '\\\\' + part;
        } else {
          accumulated += (accumulated.endsWith('\\') ? '' : '\\') + part;
        }
        const targetPath = accumulated;

        const btn = document.createElement('button');
        btn.className = 'px-1.5 py-0.5 rounded hover:bg-gnome-hover hover:text-white transition-colors ' +
          (idx === parts.length - 1 ? 'font-semibold text-gnome-active' : 'text-gnome-textDim');
        btn.textContent = part;
        btn.title = targetPath;
        btn.onclick = () => {
          const childToSelect = getDirectChildOnPath(targetPath, panels[activePanel].currentDirectory);
          loadDirectory(targetPath, true, activePanel, childToSelect);
        };
        el.breadcrumbs.appendChild(btn);

        if (idx < parts.length - 1) {
          const sep = document.createElement('span');
          sep.className = 'text-gnome-border select-none';
          sep.textContent = '/';
          el.breadcrumbs.appendChild(sep);
        }
      });
    } else {
      // Unix / Linux / macOS
      const norm = state.currentDirectory.replace(/\\/g, '/');
      const parts = norm.split('/').filter(p => p.length > 0);

      // Root button "/"
      const rootBtn = document.createElement('button');
      rootBtn.className = 'px-1.5 py-0.5 rounded hover:bg-gnome-hover hover:text-white transition-colors ' +
        (parts.length === 0 ? 'font-semibold text-gnome-active' : 'text-gnome-textDim');
      rootBtn.textContent = '/';
      rootBtn.title = '/';
      rootBtn.onclick = () => {
        const childToSelect = getDirectChildOnPath('/', panels[activePanel].currentDirectory);
        loadDirectory('/', true, activePanel, childToSelect);
      };
      el.breadcrumbs.appendChild(rootBtn);

      let accumulated = '';
      parts.forEach((part, idx) => {
        accumulated += '/' + part;
        const targetPath = accumulated;

        const sep = document.createElement('span');
        sep.className = 'text-gnome-border select-none';
        sep.textContent = '/';
        el.breadcrumbs.appendChild(sep);

        const btn = document.createElement('button');
        btn.className = 'px-1.5 py-0.5 rounded hover:bg-gnome-hover hover:text-white transition-colors ' +
          (idx === parts.length - 1 ? 'font-semibold text-gnome-active' : 'text-gnome-textDim');
        btn.textContent = part;
        btn.title = targetPath;
        btn.onclick = () => {
          const childToSelect = getDirectChildOnPath(targetPath, panels[activePanel].currentDirectory);
          loadDirectory(targetPath, true, activePanel, childToSelect);
        };
        el.breadcrumbs.appendChild(btn);
      });
    }
    el.breadcrumbs.scrollLeft = el.breadcrumbs.scrollWidth;
  }

  // File Filtering & Sorting
  function applyFilter(pIdx = activePanel) {
    const targetPanel = panels[pIdx];
    if (!targetPanel) return;
    if (targetPanel.activeSherlockFilter && targetPanel.sherlockResults) {
      let res = targetPanel.sherlockResults;
      if (!state.showHiddenFiles) {
        res = res.filter(item => !item.is_hidden);
      }
      targetPanel.filteredItems = sortItems([...res], pIdx);
      return;
    }

    if (targetPanel.isSearchingRecursive && targetPanel.searchItems) {
      let res = targetPanel.searchItems;
      if (!state.showHiddenFiles) {
        res = res.filter(item => !item.is_hidden);
      }
      targetPanel.filteredItems = sortItems([...res], pIdx);
      return;
    }

    const q = (targetPanel.searchQuery || '').toLowerCase().trim();
    let res = targetPanel.items || [];
    if (!state.showHiddenFiles) {
      res = res.filter(item => !item.is_hidden);
    }
    if (state.activeTagFilter) {
      if (state.recursiveTagSearch) {
        const tagMap = new Map();
        // 1. Direct children in the current directory matching the tag
        res.forEach(item => {
          if (getItemTags(item.path).includes(state.activeTagFilter)) {
            tagMap.set(normalizeTagPath(item.path), item);
          }
        });
        // 2. Any tagged items from subdirectories under currentDirectory
        const curDir = targetPanel.currentDirectory || '';
        for (const [normPath, val] of Object.entries(fileTagsMap)) {
          const tags = Array.isArray(val) ? val : (val.tags || []);
          if (tags.includes(state.activeTagFilter) && isSubpath(curDir, normPath)) {
            if (!tagMap.has(normPath)) {
              const fullPath = (val && typeof val === 'object' && !Array.isArray(val) && val.path) ? val.path : normPath;
              const fileItem = (val && typeof val === 'object' && !Array.isArray(val) && val.item)
                ? val.item
                : createFileItemFromPath(fullPath);
              if (fileItem) {
                if (state.showHiddenFiles || !fileItem.is_hidden) {
                  tagMap.set(normPath, fileItem);
                }
              }
            }
          }
        }
        res = Array.from(tagMap.values());
      } else {
        res = res.filter(item => getItemTags(item.path).includes(state.activeTagFilter));
      }
    }
    if (q) {
      res = res.filter(item => item.name.toLowerCase().includes(q));
    }
    targetPanel.filteredItems = sortItems([...res], pIdx);
    if (state.isMillerView && pIdx === 0) {
      renderMillerView();
    }
  }

  // Flatten filteredItems taking into account expandedDirs (collapsible tree)
  function buildDisplayItemList(pIdx = activePanel) {
    const p = panels[pIdx];
    if (!p) return [];
    const list = [];
    const expandedMap = p.expandedDirs || new Map();

    function recurse(items, depth = 0) {
      for (const item of items) {
        const itemCopy = { ...item, _depth: depth };
        list.push(itemCopy);
        if (item.is_directory && expandedMap.has(item.path)) {
          const children = expandedMap.get(item.path) || [];
          recurse(children, depth + 1);
        }
      }
    }

    recurse(p.filteredItems || [], 0);
    return list;
  }

  async function toggleExpandDir(item, pIdx = activePanel) {
    if (!item || !item.is_directory) return;
    const p = panels[pIdx];
    if (!p) return;
    const expandedMap = p.expandedDirs || new Map();
    if (expandedMap.has(item.path)) {
      expandedMap.delete(item.path);
      renderFileList(pIdx);
    } else {
      try {
        const res = await invoke('read_directory', { path: item.path });
        if (res && res.items) {
          let childItems = res.items;
          if (!state.showHiddenFiles) {
            childItems = childItems.filter(ci => !ci.is_hidden);
          }
          childItems = sortItems([...childItems]);
          expandedMap.set(item.path, childItems);
        } else {
          expandedMap.set(item.path, []);
        }
        renderFileList(pIdx);
      } catch (err) {
        console.warn('Error expanding dir:', err);
      }
    }
  }

  // File List Rendering
  function renderFileList(pIdx = activePanel) {
    if (state.isMillerView && pIdx === 0) {
      renderMillerView();
    }
    const targetPanel = panels[pIdx];
    const targetListEl = elPanels[pIdx]?.fileList;
    if (!targetListEl || !targetPanel) return;
    const prevScrollTop = targetListEl.scrollTop;
    targetListEl.innerHTML = '';
    const displayList = buildDisplayItemList(pIdx);

    if (displayList.length === 0) {
      targetListEl.innerHTML = `<div class="p-8 text-center text-xs text-gnome-textDim">Directorio vacío o sin coincidencias</div>`;
      return;
    }

    const expandedMap = targetPanel.expandedDirs || new Map();
    const fragment = document.createDocumentFragment();

    displayList.forEach((item, idx) => {
      const isSelected = (targetPanel.selectedItems || new Set()).has(item.path);
      const isFocused = idx === targetPanel.selectedIndex;

      const isCut = state.clipboard.action === 'cut' && state.clipboard.paths.includes(item.path);

      const row = document.createElement('div');
      row.dataset.index = idx;
      row.dataset.path = item.path;
      const hiddenClass = item.is_hidden ? 'opacity-65' : '';
      row.className = `file-row grid grid-cols-12 gap-2 px-4 items-center cursor-pointer transition-colors ${
        isSelected
          ? 'bg-gnome-active text-white'
          : isFocused
          ? 'bg-gnome-hover text-gnome-text'
          : 'hover:bg-gnome-hover/50 text-gnome-text'
      } ${isCut ? 'opacity-40 italic' : ''} ${hiddenClass}`;

      // 1. Name & Icon (col-span-6)
      const colName = document.createElement('div');
      colName.className = 'col-span-6 flex items-center gap-1.5 min-w-0 pointer-events-none';
      const depthPadding = (item._depth || 0) * 18;
      colName.style.paddingLeft = `${depthPadding}px`;
      const fontClass = state.normalFontWeight ? 'font-normal' : 'font-medium';

      // Tree expand/collapse arrow
      let expandToggleHtml = '';
      if (item.is_directory) {
        const isExpanded = expandedMap.has(item.path);
        expandToggleHtml = `
          <button type="button" class="btn-expand-tree pointer-events-auto p-0.5 rounded hover:bg-gnome-hover text-gnome-textDim hover:text-white transition-colors text-[10px] w-4 h-4 flex items-center justify-center shrink-0" data-path="${escapeHtml(item.path)}" title="${isExpanded ? 'Contraer' : 'Expandir'}">
            ${isExpanded ? '▼' : '▶'}
          </button>
        `;
      } else {
        expandToggleHtml = '<span class="w-4 shrink-0 inline-block"></span>';
      }

      // Color Tag indicator dots
      const itemTags = getItemTags(item.path);
      let tagsHtml = '';
      if (itemTags.length > 0) {
        tagsHtml = `
          <span class="inline-flex items-center gap-1 shrink-0 ml-1">
            ${itemTags.map(c => {
              const def = TAG_COLOR_DEFS[c] || { hex: '#9ca3af' };
              const tagName = getTagDisplayName(c);
              return `<span class="w-2 h-2 rounded-full inline-block shadow-sm" style="background-color: ${def.hex}" title="Etiqueta: ${escapeHtml(tagName)}"></span>`;
            }).join('')}
          </span>
        `;
      }
      
      let parentPathHtml = '';
      if (item.path) {
        const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
        const sep = isWindows ? '\\' : '/';
        const normalized = isWindows ? item.path.replace(/\//g, '\\') : item.path.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf(sep);
        if (lastSlash > 0) {
          const parentDir = normalized.substring(0, lastSlash);
          const curNorm = isWindows ? (state.currentDirectory || '').replace(/\//g, '\\') : (state.currentDirectory || '').replace(/\\/g, '/');
          const isSubdir = parentDir.toLowerCase().replace(/[\/\\]+$/, '') !== curNorm.toLowerCase().replace(/[\/\\]+$/, '');
          if ((state.isSearchingRecursive || (state.activeTagFilter && isSubdir)) && isSubdir) {
            let displayParent = parentDir;
            if (curNorm && parentDir.toLowerCase().startsWith(curNorm.toLowerCase())) {
              displayParent = '.' + parentDir.substring(curNorm.length);
            }
            parentPathHtml = `
              <button type="button" class="btn-goto-parent shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gnome-sidebar/80 border border-gnome-border hover:border-gnome-active hover:text-gnome-active text-gnome-textDim transition-colors truncate max-w-[160px] pointer-events-auto" title="Ir a la ubicación: ${escapeHtml(parentDir)}" data-parent-dir="${escapeHtml(parentDir)}">
                📁 ${escapeHtml(displayParent)}
              </button>
            `;
          }
        }
      }

      colName.innerHTML = `
        ${expandToggleHtml}
        <span class="shrink-0 select-none item-icon">${getFileIcon(item)}</span>
        <span class="truncate select-none ${fontClass}">${escapeHtml(item.name)}</span>
        ${tagsHtml}
        ${parentPathHtml}
      `;

      // 2. Type (col-span-2)
      const colType = document.createElement('div');
      colType.className = `col-span-2 select-none truncate pointer-events-none ${isSelected ? 'text-white/80' : 'text-gnome-textDim'}`;
      colType.textContent = getFileTypeName(item);

      // 3. Size (col-span-2)
      const colSize = document.createElement('div');
      colSize.className = `col-span-2 text-right select-none truncate pointer-events-none ${isSelected ? 'text-white/80' : 'text-gnome-textDim'}`;
      if (item.is_directory) {
        if (state.dirSizes.has(item.path)) {
          const info = state.dirSizes.get(item.path);
          colSize.textContent = formatSize(info.total_size);
          colSize.title = `${info.file_count} archivos, ${info.dir_count} subcarpetas`;
        } else {
          colSize.textContent = '--';
        }
      } else {
        colSize.textContent = formatSize(item.size);
      }

      // 4. Modified Date (col-span-2)
      const colDate = document.createElement('div');
      colDate.className = `col-span-2 text-right select-none truncate pointer-events-none ${isSelected ? 'text-white/80' : 'text-gnome-textDim'}`;
      colDate.textContent = formatDate(item.modified);

      row.appendChild(colName);
      row.appendChild(colType);
      row.appendChild(colSize);
      row.appendChild(colDate);

      // Click Events
      row.addEventListener('click', (e) => {
        const btnExpand = e.target.closest('.btn-expand-tree');
        if (btnExpand) {
          e.stopPropagation();
          toggleExpandDir(item, pIdx);
          return;
        }
        const btnParent = e.target.closest('.btn-goto-parent');
        if (btnParent && btnParent.dataset.parentDir) {
          e.stopPropagation();
          state.activeTagFilter = null;
          loadDirectory(btnParent.dataset.parentDir, true, pIdx);
          return;
        }
        if (isSplitView && activePanel !== pIdx) {
          switchActivePanel(pIdx);
        }
        handleRowClick(e, idx, pIdx, displayList);
      });
      row.addEventListener('dblclick', (e) => {
        const btnExpand = e.target.closest('.btn-expand-tree');
        if (btnExpand) return;
        const btnParent = e.target.closest('.btn-goto-parent');
        if (btnParent) return;
        if (isSplitView && activePanel !== pIdx) {
          switchActivePanel(pIdx);
        }
        activateItem(item, pIdx);
      });

      // Custom Context Menu on Right Click
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isSplitView && activePanel !== pIdx) {
          switchActivePanel(pIdx);
        }
        openFileContextMenu(e, item, idx);
      });

      // Drag and Drop (Files / Folders)
      setupRowDragAndDrop(row, item);

      fragment.appendChild(row);
    });

    targetListEl.appendChild(fragment);
    if (prevScrollTop > 0) {
      targetListEl.scrollTop = prevScrollTop;
    }
    ensureVisible(targetPanel.selectedIndex, pIdx);
  }

  // Custom Pointer-based Drag & Drop implementation
  
  function getVolumeIdentifier(p) {
    if (!p) return '';
    p = p.trim();
    if (p.startsWith('\\\\') || p.startsWith('//')) {
      const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
      if (parts.length >= 2) return '//' + parts[0].toLowerCase() + '/' + parts[1].toLowerCase();
      return p.toLowerCase();
    }
    const m = p.match(/^([a-zA-Z]:)/);
    if (m) return m[1].toUpperCase();
    return '/';
  }

  function isSameVolume(pathA, pathB) {
    if (!pathA || !pathB) return true;
    return getVolumeIdentifier(pathA) === getVolumeIdentifier(pathB);
  }

  function getParentDirPath(p) {
    if (!p) return '';
    const clean = p.replace(/[\/\\]+$/, '');
    const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
    return lastSlash > 0 ? clean.substring(0, lastSlash) : clean;
  }

  function setupRowDragAndDrop(row, item) {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    row.addEventListener('pointerdown', (e) => {
      // Don't drag if clicking a button (like parent dir button) or right clicking
      if (e.target.closest('button') || e.button !== 0) return;
      
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      isDragging = false;
      
      const onPointerMove = (moveEvent) => {
        if (!isDragging) {
          const dx = moveEvent.clientX - dragStartX;
          const dy = moveEvent.clientY - dragStartY;
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            isDragging = true;
            let pathsToDrag = [];
            if (state.selectedItems.has(item.path)) {
              pathsToDrag = Array.from(state.selectedItems);
            } else {
              pathsToDrag = [item.path];
            }
            state.draggedInternalPaths = pathsToDrag;
            
            document.body.classList.add('internal-dragging');
            row.classList.add('opacity-50');
            
            const ghost = document.createElement('div');
            ghost.id = 'drag-ghost';
            ghost.className = 'fixed pointer-events-none bg-gnome-active text-white px-3 py-1 rounded shadow-lg z-[9999] opacity-90 whitespace-nowrap text-xs flex items-center gap-2 font-medium';
            ghost.innerHTML = `<span>📄</span> ${pathsToDrag.length} elemento(s)`;
            ghost.style.left = `${moveEvent.clientX + 10}px`;
            ghost.style.top = `${moveEvent.clientY + 10}px`;
            document.body.appendChild(ghost);
          }
        }
        
        if (isDragging) {
          moveEvent.preventDefault();
          const ghost = document.getElementById('drag-ghost');
          if (ghost) {
            ghost.style.left = `${moveEvent.clientX + 10}px`;
            ghost.style.top = `${moveEvent.clientY + 10}px`;
          }
          
          // Find drop target under mouse
          const targetElement = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          let dropTarget = targetElement ? targetElement.closest('.drop-target') : null;
          let resolvedTargetDir = null;

          if (dropTarget) {
            resolvedTargetDir = dropTarget.dataset.path || dropTarget.dataset.targetDir;
          } else if (targetElement) {
            const pB = targetElement.closest('#panelB, #fileListB');
            const pA = targetElement.closest('#panelA, #fileList');
            if (pB && isSplitView && panels[1].currentDirectory) {
              dropTarget = pB;
              resolvedTargetDir = panels[1].currentDirectory;
            } else if (pA && panels[0].currentDirectory) {
              dropTarget = pA;
              resolvedTargetDir = panels[0].currentDirectory;
            }
          }
          
          // Determine action: Ctrl forces copy, Shift forces move, otherwise volume detection
          let actionType = 'move';
          const firstSource = state.draggedInternalPaths[0];
          if (moveEvent.ctrlKey) {
            actionType = 'copy';
          } else if (moveEvent.shiftKey) {
            actionType = 'move';
          } else if (resolvedTargetDir && !isSameVolume(firstSource, resolvedTargetDir)) {
            actionType = 'copy';
          } else {
            actionType = 'move';
          }

          if (ghost) {
            const icon = actionType === 'copy' ? '📋 Copiar' : '🚚 Mover';
            ghost.innerHTML = `<span>${icon}</span> ${state.draggedInternalPaths.length} elemento(s)`;
          }

          // Clear previous highlights
          document.querySelectorAll('.drop-highlight').forEach(el => {
            if (el !== dropTarget) el.classList.remove('drop-highlight', 'ring-2', 'ring-gnome-active', 'bg-gnome-hover');
          });
          
          if (dropTarget && resolvedTargetDir) {
            const isSameParent = state.draggedInternalPaths.some(src => {
              const parent = getParentDirPath(src);
              return parent.toLowerCase().replace(/\\/g, '/') === resolvedTargetDir.toLowerCase().replace(/\\/g, '/');
            });
            if (!state.draggedInternalPaths.includes(resolvedTargetDir) && (!isSameParent || actionType === 'copy')) {
              dropTarget.classList.add('drop-highlight', 'ring-2', 'ring-gnome-active');
            }
          }
        }
      };

      const onPointerUp = (upEvent) => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        
        if (isDragging) {
          isDragging = false;
          document.body.classList.remove('internal-dragging');
          row.classList.remove('opacity-50');
          const ghost = document.getElementById('drag-ghost');
          if (ghost) ghost.remove();
          
          const targetElement = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          let dropTarget = targetElement ? targetElement.closest('.drop-target') : null;
          let resolvedTargetDir = null;

          if (dropTarget) {
            resolvedTargetDir = dropTarget.dataset.path || dropTarget.dataset.targetDir;
          } else if (targetElement) {
            const pB = targetElement.closest('#panelB, #fileListB');
            const pA = targetElement.closest('#panelA, #fileList');
            if (pB && isSplitView && panels[1].currentDirectory) {
              resolvedTargetDir = panels[1].currentDirectory;
            } else if (pA && panels[0].currentDirectory) {
              resolvedTargetDir = panels[0].currentDirectory;
            }
          }
          
          document.querySelectorAll('.drop-highlight').forEach(el => {
             el.classList.remove('drop-highlight', 'ring-2', 'ring-gnome-active', 'bg-gnome-hover');
          });
          
          if (resolvedTargetDir) {
             const sources = [...state.draggedInternalPaths];
             const validSources = sources.filter(s => s !== resolvedTargetDir);
             
             let action = 'move';
             if (upEvent.ctrlKey) {
               action = 'copy';
             } else if (upEvent.shiftKey) {
               action = 'move';
             } else if (!isSameVolume(validSources[0], resolvedTargetDir)) {
               action = 'copy';
             } else {
               action = 'move';
             }

             // Do not move into same directory
             const filtered = action === 'move' ? validSources.filter(s => {
               const p = getParentDirPath(s);
               return p.toLowerCase().replace(/\\/g, '/') !== resolvedTargetDir.toLowerCase().replace(/\\/g, '/');
             }) : validSources;

             if (filtered.length > 0) {
               startTransferOperation(action, filtered, resolvedTargetDir);
             }
          }
          
          state.draggedInternalPaths = [];
        }
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });

    // Mark as drop target if directory
    if (item.is_directory) {
      row.classList.add('drop-target');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function ensureVisible(index, pIdx = activePanel) {
    if (index < 0) return;
    const targetListEl = elPanels[pIdx]?.fileList || el.fileList;
    if (!targetListEl) return;
    const row = targetListEl.children[index];
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleRowClick(e, index, pIdx = activePanel, displayList = null) {
    const p = panels[pIdx] || getActiveTabObj();
    const list = displayList || buildDisplayItemList(pIdx);
    if (index < 0 || index >= list.length) return;
    const item = list[index];

    if (e.ctrlKey) {
      if (p.selectedItems.has(item.path)) {
        p.selectedItems.delete(item.path);
      } else {
        p.selectedItems.add(item.path);
      }
      p.selectedIndex = index;
    } else if (e.shiftKey && p.selectedIndex >= 0) {
      const start = Math.min(p.selectedIndex, index);
      const end = Math.max(p.selectedIndex, index);
      p.selectedItems.clear();
      for (let i = start; i <= end; i++) {
        if (list[i]) p.selectedItems.add(list[i].path);
      }
    } else {
      p.selectedItems.clear();
      p.selectedIndex = index;
      p.selectedItems.add(item.path);
    }
    renderFileList(pIdx);
    if (pIdx === activePanel) {
      updateStatusBar();
    }
  }

  function openInTextEditor(filePath) {
    let editor = state.textEditor || 'notepad';
    if (editor === 'custom') {
      editor = state.textEditorCustomPath || 'notepad';
    }
    invoke('open_in_editor', { filePath, editor }).catch(err => {
      console.error(err);
      alert('Error al abrir editor: ' + err);
    });
  }

  function openCurrentTerminal() {
    if (!state.currentDirectory) return;
    let term = state.terminalApp || 'default';
    if (term === 'custom') {
      term = state.terminalCustomPath || 'default';
    }
    invoke('open_terminal', { path: state.currentDirectory, terminal: term }).catch(err => {
      console.error(err);
      alert('Error al abrir la terminal: ' + err);
    });
  }

  function activateItem(item, pIdx = activePanel) {
    if (!item) return;
    if (item.is_directory) {
      loadDirectory(item.path, true, pIdx);
    } else {
      invoke('open_file_default', { path: item.path }).catch(err => {
        alert('Error al abrir archivo: ' + err);
      });
    }
  }

  function updateStatusBar() {
    const totalCount = state.filteredItems.length;
    const selCount = state.selectedItems.size;
    if (selCount > 0) {
      el.statusItemCount.textContent = `${totalCount} elemento${totalCount === 1 ? '' : 's'} (${selCount} seleccionado${selCount === 1 ? '' : 's'})`;
    } else {
      el.statusItemCount.textContent = `${totalCount} elemento${totalCount === 1 ? '' : 's'}`;
    }

    if (state.freeSpaceBytes !== null && state.freeSpaceBytes !== undefined) {
      const freeStr = formatSize(state.freeSpaceBytes);
      if (el.statusDiskSpace) {
        el.statusDiskSpace.textContent = `Espacio libre: ${freeStr}`;
        if (state.totalSpaceBytes) {
          el.statusDiskSpace.title = `Espacio libre: ${freeStr} de ${formatSize(state.totalSpaceBytes)}`;
        } else {
          el.statusDiskSpace.title = `Espacio libre: ${freeStr}`;
        }
      }
    } else if (el.statusDiskSpace) {
      el.statusDiskSpace.textContent = '';
      el.statusDiskSpace.title = '';
    }
  }

  // QuickView Controller
  async function openQuickView() {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.filteredItems.length) return;
    const item = state.filteredItems[state.selectedIndex];

    state.quickViewOpen = true;
    el.quickViewModal.classList.remove('hidden');
    await loadQuickViewContent(item);
  }

  function closeQuickView() {
    state.quickViewOpen = false;
    state.activeDirCalcId = null; // Abort any in-progress directory calculation immediately
    cleanupMedia();
    el.quickViewModal.classList.add('hidden');
    el.qvContent.innerHTML = '';
    el.fileList.focus();
  }

  function cleanupMedia(container = el.qvContent) {
    if (!container) return;
    const media = container.querySelector('audio, video');
    if (media) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
  }

  async function loadQuickViewContent(item) {
    cleanupMedia(el.qvContent);
    state.activeDirCalcId = Date.now();
    const currentCalcId = state.activeDirCalcId;

    el.qvTitle.textContent = item.name;
    el.qvIcon.innerHTML = getFileIcon(item);
    el.qvBadge.textContent = item.is_directory ? 'CARPETA' : (item.extension || item.file_type || 'archivo').toUpperCase();
    if (el.qvDetails) {
      el.qvDetails.textContent = item.is_directory
        ? `Carpeta | Modificado: ${formatDate(item.modified)}`
        : `Tamaño: ${formatSize(item.size)} | Modificado: ${formatDate(item.modified)}`;
    }
    el.qvContent.innerHTML = `<div class="text-xs text-gnome-textDim">Cargando vista previa...</div>`;

    await loadItemPreview(item, el.qvContent, false, currentCalcId);
  }

  async function loadItemPreview(item, targetEl = el.qvContent, isMiller = false, calcId = null) {
    if (!targetEl) return;
    cleanupMedia(targetEl);

    if (item.is_directory) {
      if (isMiller) {
        await renderMillerFolderPreview(item, targetEl);
      } else {
        await renderFolderQuickView(item, calcId || Date.now(), targetEl);
      }
      return;
    }

    let previewMeta = null;
    try {
      previewMeta = await invoke('read_file_preview', {
        path: item.path,
        customTextExts: state.customTextExts
      });
    } catch (e) {
      renderFallbackCard(item, 'Error al obtener información del archivo: ' + e, targetEl);
      return;
    }

    if (!isMiller && !state.quickViewOpen) return;

    if (!previewMeta) {
      renderFallbackCard(item, 'No se pudo generar la vista previa.', targetEl);
      return;
    }

    if (previewMeta.is_too_large) {
      renderFallbackCard(item, `El archivo supera el límite de vista previa (${formatSize(previewMeta.max_size_bytes)})`, targetEl);
      return;
    }

    if (previewMeta.error_message) {
      renderFallbackCard(item, previewMeta.error_message, targetEl);
      return;
    }

    const dataUrl = previewMeta.data_url;

    switch (previewMeta.file_type) {
      case 'image':
        renderImagePreview(item, dataUrl, targetEl);
        break;
      case 'pdf':
        renderPdfPreview(item, dataUrl, targetEl);
        break;
      case 'audio':
        renderAudioPreview(item, dataUrl, previewMeta.mime_type, targetEl);
        break;
      case 'video':
        renderVideoPreview(item, dataUrl, previewMeta.mime_type, targetEl);
        break;
      case 'text':
        renderTextPreview(item, previewMeta, targetEl);
        break;
      case 'office':
        renderOfficePreview(item, previewMeta, targetEl);
        break;
      default:
        renderFallbackCard(item, null, targetEl);
        break;
    }
  }

  async function renderFolderQuickView(item, calcId, targetEl = el.qvContent) {
    if (!targetEl) return;
    targetEl.innerHTML = `
      <div class="w-full max-w-md bg-gnome-sidebar border border-gnome-border rounded-xl p-6 flex flex-col items-center gap-4 text-center shadow-lg">
        <div class="text-6xl text-amber-400">📁</div>
        <div class="font-semibold text-sm text-gnome-text truncate max-w-xs">${escapeHtml(item.name)}</div>
        <div id="qvDirCalcStatus" class="text-xs text-gnome-active flex items-center gap-1.5 animate-pulse">
          <span>⏳</span> Calculando tamaño y contenido...
        </div>
        <div class="w-full border-t border-gnome-border/50 mt-2 pt-3 text-[11px] text-gnome-textDim flex flex-col gap-1.5 text-left">
          <div id="qvDirStats" class="space-y-1">
            <div><span class="text-gnome-text font-medium">Ruta:</span> <span class="break-all">${escapeHtml(item.path)}</span></div>
            <div><span class="text-gnome-text font-medium">Modificado:</span> ${formatDate(item.modified)}</div>
          </div>
        </div>
      </div>
    `;

    try {
      const res = await invoke('get_directory_size', { path: item.path });
      if (state.activeDirCalcId !== calcId || !state.quickViewOpen) {
        return;
      }

      state.dirSizes.set(item.path, res);

      const statusEl = document.getElementById('qvDirCalcStatus');
      const statsEl = document.getElementById('qvDirStats');
      if (statusEl) {
        statusEl.className = 'text-xs text-emerald-400 flex items-center gap-1.5';
        statusEl.innerHTML = `<span>✔️</span> ${formatSize(res.total_size)} en total`;
      }
      if (statsEl) {
        statsEl.innerHTML = `
          <div><span class="text-gnome-text font-medium">Tamaño total:</span> ${formatSize(res.total_size)}</div>
          <div><span class="text-gnome-text font-medium">Archivos contenidos:</span> ${res.file_count.toLocaleString()}</div>
          <div><span class="text-gnome-text font-medium">Subdirectorios:</span> ${res.dir_count.toLocaleString()}</div>
          <div><span class="text-gnome-text font-medium">Modificado:</span> ${formatDate(item.modified)}</div>
          <div><span class="text-gnome-text font-medium">Ruta:</span> <span class="break-all">${escapeHtml(item.path)}</span></div>
        `;
      }
      if (el.qvDetails) {
        el.qvDetails.textContent = `Tamaño: ${formatSize(res.total_size)} | ${res.file_count} archivos, ${res.dir_count} carpetas`;
      }
    } catch (err) {
      if (state.activeDirCalcId !== calcId || !state.quickViewOpen) return;
      const statusEl = document.getElementById('qvDirCalcStatus');
      if (statusEl) {
        statusEl.className = 'text-xs text-red-400';
        statusEl.textContent = 'No se pudo calcular el tamaño: ' + err;
      }
    }
  }

  function renderImagePreview(item, dataUrl, targetEl = el.qvContent) {
    if (!targetEl) return;
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar los datos de la imagen', targetEl);
      return;
    }
    targetEl.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center p-2">
        <img src="${dataUrl}" alt="${escapeHtml(item.name)}" class="max-w-full max-h-[70vh] object-contain rounded shadow" onerror="this.onerror=null; window._tronFallbackImage('${escapeHtml(item.name)}', '${escapeHtml(item.extension || '')}')"/>
      </div>
    `;
  }

  function renderPdfPreview(item, dataUrl, targetEl = el.qvContent) {
    if (!targetEl) return;
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar el documento PDF', targetEl);
      return;
    }
    targetEl.innerHTML = `
      <div class="w-full h-full min-h-[60vh] flex flex-col p-1">
        <iframe src="${dataUrl}#toolbar=1" class="w-full h-[65vh] rounded-lg border border-gnome-border bg-white" title="${escapeHtml(item.name)}"></iframe>
      </div>
    `;
  }

  window._tronFallbackImage = function(name, ext) {
    const msg = `No se pudo renderizar la imagen directamente en el visor. Pulsa 'Abrir' para verla en la aplicación predeterminada.`;
    renderFallbackCard({ name, extension: ext, file_type: 'image' }, msg, el.qvContent);
  };

  function renderTextPreview(item, previewMeta, targetEl = el.qvContent) {
    if (!targetEl) return;
    const content = previewMeta && previewMeta.content ? previewMeta.content : '';
    const ext = (item.extension || '').toLowerCase();
    const highlighted = highlightCodeContent(content, ext);

    targetEl.innerHTML = `
      <div class="w-full h-full max-h-[70vh] overflow-auto bg-gnome-sidebar border border-gnome-border rounded p-4 text-left">
        <pre class="font-mono text-xs text-gnome-text whitespace-pre-wrap leading-relaxed select-text">${highlighted}</pre>
      </div>
    `;
  }

  function highlightCodeContent(text, ext) {
    if (!text) return '';
    if (ext === 'json') {
      return highlightJson(text);
    } else if (ext === 'py') {
      return highlightPython(text);
    } else if (ext === 'md') {
      return highlightMarkdown(text);
    } else if (ext === 'sql') {
      return highlightSql(text);
    } else if (['js', 'ts', 'rs', 'yaml', 'yml', 'c', 'cpp', 'h', 'hpp', 'sh', 'bat', 'ps1', 'str'].includes(ext)) {
      return highlightGenericCode(text);
    }
    return escapeHtml(text);
  }

  function highlightSql(text) {
    const lines = text.split('\n');
    const keywords = new Set(['select', 'from', 'where', 'insert', 'into', 'update', 'delete', 'create', 'table', 'drop', 'alter', 'join', 'inner', 'left', 'right', 'outer', 'on', 'group', 'by', 'order', 'having', 'limit', 'offset', 'as', 'and', 'or', 'not', 'null', 'is', 'in', 'values', 'set', 'distinct', 'case', 'when', 'then', 'else', 'end', 'primary', 'key', 'foreign', 'references', 'index', 'view', 'trigger', 'database', 'union', 'all']);
    return lines.map(line => {
      let escaped = escapeHtml(line);
      const commentIdx = escaped.indexOf('--');
      let codePart = escaped;
      let commentPart = '';
      if (commentIdx >= 0) {
        codePart = escaped.slice(0, commentIdx);
        commentPart = `<span class="syn-comment">${escaped.slice(commentIdx)}</span>`;
      }
      codePart = codePart.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="syn-string">$&</span>');
      codePart = codePart.replace(/\b([a-zA-Z_]\w*)\b/g, (match, word) => {
        if (keywords.has(word.toLowerCase())) return `<span class="syn-keyword">${word}</span>`;
        return match;
      });
      codePart = codePart.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-number">$1</span>');
      return codePart + commentPart;
    }).join('\n');
  }

  function highlightJson(jsonStr) {
    let escaped = escapeHtml(jsonStr);
    return escaped.replace(
      /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function(match) {
        let cls = 'syn-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'syn-key';
          } else {
            cls = 'syn-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'syn-boolean';
        } else if (/null/.test(match)) {
          cls = 'syn-keyword';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  function highlightPython(text) {
    const lines = text.split('\n');
    const keywords = new Set(['def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'try', 'except', 'finally', 'with', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'is', 'None', 'True', 'False', 'async', 'await']);
    return lines.map(line => {
      let escaped = escapeHtml(line);
      const commentIdx = escaped.indexOf('#');
      let codePart = escaped;
      let commentPart = '';
      if (commentIdx >= 0) {
        codePart = escaped.slice(0, commentIdx);
        commentPart = `<span class="syn-comment">${escaped.slice(commentIdx)}</span>`;
      }

      codePart = codePart.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="syn-string">$&</span>');

      codePart = codePart.replace(/\b([a-zA-Z_]\w*)\b/g, (match, word) => {
        if (keywords.has(word)) {
          return `<span class="syn-keyword">${word}</span>`;
        }
        return match;
      });

      codePart = codePart.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-number">$1</span>');

      return codePart + commentPart;
    }).join('\n');
  }

  function highlightMarkdown(text) {
    const lines = text.split('\n');
    return lines.map(line => {
      let escaped = escapeHtml(line);
      if (/^#{1,6}\s/.test(escaped)) {
        return `<span class="syn-heading">${escaped}</span>`;
      }
      if (/^(\s*[-*+]|\s*\d+\.)\s/.test(escaped)) {
        return `<span class="syn-list">${escaped}</span>`;
      }
      escaped = escaped.replace(/`([^`]+)`/g, '<span class="syn-string bg-gnome-bg/60 px-1 py-0.5 rounded font-mono">`$1`</span>');
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-gnome-text">$1</strong>');
      return escaped;
    }).join('\n');
  }

  function highlightGenericCode(text) {
    const lines = text.split('\n');
    const keywords = new Set(['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'use', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'type', 'interface', 'async', 'await', 'true', 'false']);
    return lines.map(line => {
      let escaped = escapeHtml(line);
      const commentIdx = escaped.indexOf('//');
      let codePart = escaped;
      let commentPart = '';
      if (commentIdx >= 0) {
        codePart = escaped.slice(0, commentIdx);
        commentPart = `<span class="syn-comment">${escaped.slice(commentIdx)}</span>`;
      }

      codePart = codePart.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="syn-string">$&</span>');
      codePart = codePart.replace(/\b([a-zA-Z_]\w*)\b/g, (match, word) => {
        if (keywords.has(word)) return `<span class="syn-keyword">${word}</span>`;
        return match;
      });
      codePart = codePart.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-number">$1</span>');

      return codePart + commentPart;
    }).join('\n');
  }

  function renderAudioPreview(item, dataUrl, mimeType, targetEl = el.qvContent) {
    if (!targetEl) return;
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar el archivo de audio', targetEl);
      return;
    }
    targetEl.innerHTML = `
      <div class="w-full max-w-md bg-gnome-sidebar border border-gnome-border rounded-xl p-6 flex flex-col items-center gap-4 shadow-lg">
        <div class="w-20 h-20 rounded-full bg-gnome-active/20 flex items-center justify-center text-4xl text-gnome-active">
          🎵
        </div>
        <div class="text-center">
          <div class="font-semibold text-sm text-gnome-text truncate max-w-xs">${escapeHtml(item.name)}</div>
          <div class="text-xs text-gnome-textDim mt-1">${formatSize(item.size)}</div>
        </div>
        <audio id="qvAudioPlayer" controls autoplay class="w-full mt-2 outline-none">
          <source src="${dataUrl}" type="${mimeType || 'audio/mpeg'}">
          Tu entorno no soporta reproducción de audio.
        </audio>
      </div>
    `;

    const audio = targetEl.querySelector('#qvAudioPlayer') || document.getElementById('qvAudioPlayer');
    if (audio) {
      audio.onerror = () => {
        renderFallbackCard(item, "Vista previa no disponible para este formato o códec de audio.", targetEl);
      };
    }
  }

  function renderVideoPreview(item, dataUrl, mimeType, targetEl = el.qvContent) {
    if (!targetEl) return;
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar el archivo de vídeo', targetEl);
      return;
    }
    targetEl.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center max-h-[70vh]">
        <video id="qvVideoPlayer" controls autoplay preload="metadata" playsinline class="max-w-full max-h-[65vh] rounded-lg shadow-lg border border-gnome-border bg-black">
          <source src="${dataUrl}" type="${mimeType || 'video/mp4'}">
          Tu entorno no soporta reproducción de vídeo.
        </video>
      </div>
    `;

    const video = targetEl.querySelector('#qvVideoPlayer') || document.getElementById('qvVideoPlayer');
    if (video) {
      video.onerror = () => {
        renderFallbackCard(item, "Vista previa no disponible para este formato o códec de vídeo. Pulsa 'Abrir' para reproducirlo en tu reproductor predeterminado.", targetEl);
      };
    }
  }

  function renderOfficePreview(item, previewMeta, targetEl = el.qvContent) {
    if (!targetEl) return;
    const ext = (item.extension || '').toLowerCase();
    const content = previewMeta ? previewMeta.content : null;
    const dataUrl = previewMeta ? previewMeta.data_url : null;

    let officeType = 'Documento';
    let officeIcon = '📝';
    let officeBadgeBg = 'bg-blue-600/20 text-blue-400 border-blue-500/30';
    if (['docx', 'doc', 'docm', 'dotx', 'dot', 'odt', 'rtf'].includes(ext)) {
      officeType = 'Documento Microsoft Word';
      officeIcon = '📘';
      officeBadgeBg = 'bg-blue-600/20 text-blue-400 border-blue-500/30';
    } else if (['xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'xlt', 'ods'].includes(ext)) {
      officeType = 'Hoja de cálculo Microsoft Excel';
      officeIcon = '📊';
      officeBadgeBg = 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30';
    } else if (['pptx', 'ppt', 'pptm', 'potx', 'pot', 'odp'].includes(ext)) {
      officeType = 'Presentación Microsoft PowerPoint';
      officeIcon = '📙';
      officeBadgeBg = 'bg-amber-600/20 text-amber-400 border-amber-500/30';
    }

    if (content) {
      targetEl.innerHTML = `
        <div class="w-full h-full flex flex-col p-1 max-h-[72vh] overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 bg-gnome-sidebar border border-gnome-border rounded-t-lg">
            <div class="flex items-center gap-2 ${officeBadgeBg} border px-2.5 py-1 rounded-md text-xs font-medium">
              <span class="text-sm">${officeIcon}</span> <span>${officeType}</span>
            </div>
            <div class="text-[11px] text-gnome-textDim flex items-center gap-2">
              <span>📄 Vista de contenido</span>
            </div>
          </div>
          <div class="flex-1 overflow-auto bg-gnome-surface border-x border-b border-gnome-border rounded-b-lg p-5 shadow-inner text-left">
            ${content}
          </div>
        </div>
      `;
    } else if (dataUrl) {
      targetEl.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center p-2 max-h-[72vh]">
          <div class="relative max-h-[68vh] flex items-center justify-center bg-gnome-sidebar border border-gnome-border rounded-xl p-3 shadow-2xl overflow-hidden">
            <img src="${dataUrl}" alt="${escapeHtml(item.name)}" class="max-w-full max-h-[62vh] object-contain rounded-lg shadow-md bg-white"/>
            <div class="absolute top-4 left-4 ${officeBadgeBg} border text-[11px] font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-lg backdrop-blur-md">
              <span class="text-sm">${officeIcon}</span> <span>${officeType}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      renderFallbackCard(item, `No se pudo extraer la vista previa de este documento de Office. Pulsa 'Abrir' para visualizarlo en su aplicación predeterminada.`, targetEl);
    }
  }

  function renderFallbackCard(item, customMsg, targetEl = el.qvContent) {
    if (!targetEl) return;
    cleanupMedia(targetEl);
    const msg = customMsg || 'Vista previa no disponible para este tipo de archivo.';
    targetEl.innerHTML = `
      <div class="w-full max-w-md bg-gnome-sidebar border border-gnome-border rounded-xl p-6 flex flex-col items-center gap-3 text-center shadow-lg">
        <div class="text-5xl mb-1">${getFileIcon(item)}</div>
        <div class="font-semibold text-sm text-gnome-text truncate max-w-xs">${escapeHtml(item.name)}</div>
        <div class="text-xs text-amber-400/90 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-md mt-1 max-w-sm">
          ${escapeHtml(msg)}
        </div>
        <div class="w-full border-t border-gnome-border/50 mt-3 pt-3 text-[11px] text-gnome-textDim flex flex-col gap-1 text-left">
          <div><span class="text-gnome-text font-medium">Extensión:</span> .${escapeHtml(item.extension || 'desconocida')}</div>
          <div><span class="text-gnome-text font-medium">Tamaño:</span> ${formatSize(item.size)}</div>
          <div><span class="text-gnome-text font-medium">Modificado:</span> ${formatDate(item.modified)}</div>
          <div><span class="text-gnome-text font-medium">Ruta:</span> <span class="break-all">${escapeHtml(item.path)}</span></div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // Miller Columns (macOS / Yazi View) Engine
  // ==========================================
  let millerPreviewTimer = null;
  let millerActivePreviewPath = null;

  function getParentDirectory(dirPath) {
    if (!dirPath) return null;
    let norm = dirPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!norm) return null;
    const lastSlash = norm.lastIndexOf('/');
    if (lastSlash > 0) {
      let parent = norm.substring(0, lastSlash);
      if (parent.length === 2 && parent.endsWith(':')) {
        parent += '/';
      }
      return parent;
    } else if (lastSlash === 0) {
      return '/';
    }
    return null;
  }

  async function toggleMillerView() {
    state.isMillerView = !state.isMillerView;
    localStorage.setItem('tron_miller_view', state.isMillerView ? 'true' : 'false');

    if (state.isMillerView) {
      if (isSplitView) {
        await toggleSplitView();
      }
      el.panelA.classList.add('hidden');
      el.panelB.classList.add('hidden');
      el.millerContainer.classList.remove('hidden');
      if (el.btnToggleMillerView) el.btnToggleMillerView.classList.add('bg-gnome-active/20', 'text-gnome-active');
      renderMillerView();
      if (el.millerCurrentList) el.millerCurrentList.focus();
    } else {
      cleanupMedia(el.millerPreviewContent);
      el.millerContainer.classList.add('hidden');
      el.panelA.classList.remove('hidden');
      if (el.btnToggleMillerView) el.btnToggleMillerView.classList.remove('bg-gnome-active/20', 'text-gnome-active');
      renderFileList(0);
      elPanels[0].fileList.focus();
    }
  }

  async function renderMillerView() {
    if (!state.isMillerView) return;
    renderMillerParentColumn();
    renderMillerCurrentColumn();
    triggerMillerPreview();
  }

  async function renderMillerParentColumn() {
    const parentListEl = el.millerParentList;
    if (!parentListEl) return;
    const curDir = state.currentDirectory;
    const parentDir = getParentDirectory(curDir);

    if (!parentDir) {
      if (el.millerParentTitle) el.millerParentTitle.textContent = 'Raíz';
      if (el.millerParentCount) el.millerParentCount.textContent = '';
      parentListEl.innerHTML = `<div class="p-6 text-center text-[11px] text-gnome-textDim italic">Nivel superior no disponible</div>`;
      return;
    }

    const parentName = parentDir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || parentDir;
    if (el.millerParentTitle) el.millerParentTitle.textContent = parentName;

    try {
      const res = await invoke('read_directory', { path: parentDir });
      if (!res || !res.items) {
        parentListEl.innerHTML = `<div class="p-4 text-xs text-gnome-textDim italic">Vacío</div>`;
        if (el.millerParentCount) el.millerParentCount.textContent = '0';
        return;
      }

      let items = res.items;
      if (!state.showHiddenFiles) {
        items = items.filter(i => !i.is_hidden);
      }
      items = sortItems([...items], 0);

      if (el.millerParentCount) el.millerParentCount.textContent = `${items.length}`;
      parentListEl.innerHTML = '';

      const normCurDir = (curDir || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');

      const frag = document.createDocumentFragment();
      items.forEach(item => {
        const normItemPath = (item.path || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
        const isCurrentFolder = item.is_directory && normItemPath === normCurDir;

        const row = document.createElement('div');
        row.className = `file-row flex items-center justify-between px-2.5 py-1 rounded cursor-pointer text-xs select-none transition-colors ${
          isCurrentFolder ? 'bg-gnome-active text-white font-medium shadow-sm' : 'hover:bg-gnome-hover text-gnome-textDim hover:text-gnome-text'
        }`;

        const left = document.createElement('div');
        left.className = 'flex items-center gap-1.5 min-w-0 flex-1';
        left.innerHTML = `<span class="miller-item-icon shrink-0 select-none">${getFileIcon(item)}</span><span class="truncate">${escapeHtml(item.name)}</span>`;

        const right = document.createElement('div');
        right.className = 'shrink-0 text-[10px] opacity-70 ml-1 font-mono';
        if (item.is_directory) {
          right.textContent = '›';
        }

        row.appendChild(left);
        row.appendChild(right);

        row.addEventListener('click', () => {
          if (item.is_directory) {
            loadDirectory(item.path, true, 0);
          }
        });

        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openFileContextMenu(e, item, -1);
        });

        frag.appendChild(row);
      });

      parentListEl.appendChild(frag);

      const activeRow = parentListEl.querySelector('.bg-gnome-active');
      if (activeRow) {
        activeRow.scrollIntoView({ block: 'nearest' });
      }
    } catch (e) {
      parentListEl.innerHTML = `<div class="p-3 text-[11px] text-red-400">Error: ${escapeHtml(String(e))}</div>`;
    }
  }

  function renderMillerCurrentColumn() {
    const listEl = el.millerCurrentList;
    if (!listEl) return;
    const curDir = state.currentDirectory;
    const curName = (curDir || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || curDir || 'Directorio';

    if (el.millerCurrentTitle) el.millerCurrentTitle.textContent = curName;

    const displayList = state.filteredItems || [];
    if (el.millerCurrentCount) el.millerCurrentCount.textContent = `${displayList.length}`;
    listEl.innerHTML = '';

    if (displayList.length === 0) {
      listEl.innerHTML = `<div class="p-8 text-center text-xs text-gnome-textDim italic">Directorio vacío</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    displayList.forEach((item, idx) => {
      const isSelected = state.selectedItems.has(item.path);
      const isFocused = idx === state.selectedIndex;

      const row = document.createElement('div');
      row.className = `file-row group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs select-none transition-colors ${
        isSelected
          ? 'bg-gnome-active text-white font-medium shadow-sm ring-1 ring-gnome-active/80'
          : 'hover:bg-gnome-hover text-gnome-text'
      }`;

      const left = document.createElement('div');
      left.className = 'flex items-center gap-2 min-w-0 flex-1';
      left.innerHTML = `<span class="miller-item-icon shrink-0 select-none">${getFileIcon(item)}</span><span class="truncate">${escapeHtml(item.name)}</span>`;

      const right = document.createElement('div');
      right.className = 'shrink-0 flex items-center gap-1.5 text-[10px] ml-1 font-mono ' + (isSelected ? 'text-white/80' : 'text-gnome-textDim');

      if (item.is_directory) {
        right.innerHTML = `<span>›</span>`;
      } else {
        right.textContent = formatSize(item.size);
      }

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener('click', (e) => {
        if (e.ctrlKey || e.shiftKey) {
          handleRowClick(e, idx, 0, displayList);
          triggerMillerPreview();
          return;
        }

        // Single click: if directory, immediately navigate into it
        if (item.is_directory) {
          loadDirectory(item.path, true, 0);
        } else {
          handleRowClick(e, idx, 0, displayList);
          triggerMillerPreview();
        }
      });

      row.addEventListener('dblclick', () => {
        activateItem(item, 0);
      });

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFileContextMenu(e, item, idx);
      });

      frag.appendChild(row);
    });

    listEl.appendChild(frag);

    if (state.selectedIndex >= 0 && listEl.children[state.selectedIndex]) {
      listEl.children[state.selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function triggerMillerPreview() {
    if (!state.isMillerView) return;
    if (millerPreviewTimer) clearTimeout(millerPreviewTimer);
    millerPreviewTimer = setTimeout(() => {
      renderMillerPreviewNow();
    }, 60);
  }

  async function renderMillerPreviewNow() {
    if (!state.isMillerView) return;
    const previewEl = el.millerPreviewContent;
    if (!previewEl) return;

    if (state.selectedIndex < 0 || state.selectedIndex >= state.filteredItems.length) {
      cleanupMedia(previewEl);
      if (el.millerPreviewTitle) el.millerPreviewTitle.textContent = 'Ninguna selección';
      if (el.millerPreviewIcon) el.millerPreviewIcon.textContent = '👁️';
      if (el.millerPreviewBadge) el.millerPreviewBadge.classList.add('hidden');
      previewEl.innerHTML = `<div class="text-xs text-gnome-textDim italic">Selecciona un elemento para ver su vista previa</div>`;
      millerActivePreviewPath = null;
      return;
    }

    const item = state.filteredItems[state.selectedIndex];
    if (millerActivePreviewPath === item.path) return;
    millerActivePreviewPath = item.path;

    if (el.millerPreviewTitle) el.millerPreviewTitle.textContent = item.name;
    if (el.millerPreviewIcon) el.millerPreviewIcon.innerHTML = getFileIcon(item);
    if (el.millerPreviewBadge) {
      el.millerPreviewBadge.textContent = item.is_directory ? 'CARPETA' : (item.extension || item.file_type || 'archivo').toUpperCase();
      el.millerPreviewBadge.classList.remove('hidden');
    }

    previewEl.innerHTML = `<div class="text-xs text-gnome-textDim animate-pulse">Cargando vista previa...</div>`;
    await loadItemPreview(item, previewEl, true);
  }

  async function renderMillerFolderPreview(folderItem, targetEl) {
    if (!targetEl) return;
    targetEl.innerHTML = `
      <div class="w-full h-full flex flex-col min-h-0 text-left">
        <div class="p-3 bg-gnome-sidebar/50 border border-gnome-border rounded-lg mb-3 shrink-0 space-y-1">
          <div class="text-xs text-gnome-text font-semibold flex items-center gap-2">
            <span class="miller-header-icon shrink-0">${getFileIcon(folderItem)}</span>
            <span class="truncate">${escapeHtml(folderItem.name)}</span>
          </div>
          <div class="text-[11px] text-gnome-textDim">
            <div><span class="font-medium text-gnome-text">Ruta:</span> <span class="break-all font-mono text-[10px]">${escapeHtml(folderItem.path)}</span></div>
            <div><span class="font-medium text-gnome-text">Modificado:</span> ${formatDate(folderItem.modified)}</div>
            <div id="millerFolderStats" class="mt-1 text-gnome-active flex items-center gap-1">
              <span>⏳</span> Calculando tamaño...
            </div>
          </div>
        </div>
        <div class="text-[11px] font-semibold text-gnome-textDim uppercase tracking-wider px-1 pb-1">
          Contenido directo:
        </div>
        <div id="millerFolderContents" class="flex-1 overflow-y-auto border border-gnome-border rounded-lg bg-gnome-surface p-1 space-y-0.5 min-h-[120px]">
          <div class="p-3 text-center text-xs text-gnome-textDim animate-pulse">Leyendo contenido...</div>
        </div>
      </div>
    `;

    try {
      const res = await invoke('read_directory', { path: folderItem.path });
      const contentsEl = targetEl.querySelector('#millerFolderContents');
      if (contentsEl && res && res.items) {
        let childItems = res.items;
        if (!state.showHiddenFiles) childItems = childItems.filter(ci => !ci.is_hidden);
        childItems = sortItems([...childItems], 0);

        if (childItems.length === 0) {
          contentsEl.innerHTML = `<div class="p-4 text-center text-xs text-gnome-textDim italic">Carpeta vacía</div>`;
        } else {
          contentsEl.innerHTML = '';
          const frag = document.createDocumentFragment();
          childItems.slice(0, 100).forEach(ci => {
            const itemRow = document.createElement('div');
            itemRow.className = 'flex items-center justify-between px-2 py-1 rounded text-xs text-gnome-text hover:bg-gnome-hover select-none cursor-pointer';
            itemRow.innerHTML = `
              <div class="flex items-center gap-1.5 min-w-0 flex-1">
                <span class="miller-item-icon shrink-0 select-none">${getFileIcon(ci)}</span>
                <span class="truncate">${escapeHtml(ci.name)}</span>
              </div>
              <div class="shrink-0 text-[10px] text-gnome-textDim font-mono ml-2">
                ${ci.is_directory ? 'carpeta' : formatSize(ci.size)}
              </div>
            `;

            itemRow.addEventListener('click', () => {
              if (ci.is_directory) {
                loadDirectory(ci.path, true, 0);
              } else {
                activateItem(ci, 0);
              }
            });

            frag.appendChild(itemRow);
          });
          if (childItems.length > 100) {
            const moreRow = document.createElement('div');
            moreRow.className = 'p-2 text-center text-[10px] text-gnome-textDim italic';
            moreRow.textContent = `...y ${childItems.length - 100} elementos más`;
            frag.appendChild(moreRow);
          }
          contentsEl.appendChild(frag);
        }
      }
    } catch (e) {
      const contentsEl = targetEl.querySelector('#millerFolderContents');
      if (contentsEl) contentsEl.innerHTML = `<div class="p-2 text-xs text-red-400">Error al leer: ${escapeHtml(String(e))}</div>`;
    }

    // Background directory size calculation
    invoke('get_directory_size', { path: folderItem.path }).then(dirStats => {
      const statsEl = targetEl.querySelector('#millerFolderStats');
      if (statsEl && dirStats) {
        statsEl.className = 'mt-1 text-emerald-400 font-medium';
        statsEl.innerHTML = `<span>✔️</span> ${formatSize(dirStats.total_size)} (${dirStats.file_count} archivos, ${dirStats.dir_count} subcarpetas)`;
      }
    }).catch(() => {
      const statsEl = targetEl.querySelector('#millerFolderStats');
      if (statsEl) statsEl.className = 'hidden';
    });
  }
  function handleMillerKeyDown(e) {
    if (!state.isMillerView) return false;
    const activeEl = document.activeElement;
    const isInputActive = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName);
    if (isInputActive) return false;
    if (state.quickViewOpen) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.filteredItems.length === 0) return true;
      let nextIndex = state.selectedIndex + 1;
      if (nextIndex >= state.filteredItems.length) nextIndex = state.filteredItems.length - 1;
      setSelectionIndex(nextIndex);
      triggerMillerPreview();
      return true;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.filteredItems.length === 0) return true;
      let prevIndex = state.selectedIndex - 1;
      if (prevIndex < 0) prevIndex = 0;
      setSelectionIndex(prevIndex);
      triggerMillerPreview();
      return true;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        const item = state.filteredItems[state.selectedIndex];
        if (item.is_directory) {
          loadDirectory(item.path, true, 0);
        }
      }
      return true;
    }

    if (e.key === 'ArrowLeft' || (!e.altKey && e.key === 'Backspace')) {
      e.preventDefault();
      goUp(0);
      return true;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        activateItem(state.filteredItems[state.selectedIndex], 0);
      }
      return true;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      if (state.filteredItems.length > 0) {
        setSelectionIndex(0);
        triggerMillerPreview();
      }
      return true;
    }

    if (e.key === 'End') {
      e.preventDefault();
      if (state.filteredItems.length > 0) {
        setSelectionIndex(state.filteredItems.length - 1);
        triggerMillerPreview();
      }
      return true;
    }

    if (e.key === 'PageDown') {
      e.preventDefault();
      if (state.filteredItems.length === 0) return true;
      let nextIndex = Math.min(state.selectedIndex + 10, state.filteredItems.length - 1);
      setSelectionIndex(nextIndex);
      triggerMillerPreview();
      return true;
    }

    if (e.key === 'PageUp') {
      e.preventDefault();
      if (state.filteredItems.length === 0) return true;
      let prevIndex = Math.max(state.selectedIndex - 10, 0);
      setSelectionIndex(prevIndex);
      triggerMillerPreview();
      return true;
    }

    return false;
  }

  // Quick Purge: Delete (Trash) Operation
  async function deleteCurrentItem() {
    const pathsToDelete = getSelectedOrFocusedPaths();
    if (pathsToDelete.length === 0) return;

    // Remember the index before deletion so we don't jump to the beginning
    const p = panels[activePanel] || state;
    const currentIdx = p.selectedIndex >= 0 ? p.selectedIndex : 0;

    try {
      cleanupMedia();
      for (const path of pathsToDelete) {
        await invoke('delete_file_item', { path });
      }

      // Preserve the intended focus index before reloading
      p.selectedIndex = currentIdx;

      await reloadBothPanelsIfNeeded();

      if (state.quickViewOpen) {
        if (state.filteredItems.length === 0) {
          closeQuickView();
        } else if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          await loadQuickViewContent(state.filteredItems[state.selectedIndex]);
        }
      }
    } catch (err) {
      alert('Error al mover a la papelera: ' + err);
    }
  }

  // Keyboard Navigation Handling
  function handleGlobalKeyDown(e) {
    const activeEl = document.activeElement;
    const isInputActive = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName);

    // If focus is inside a modal or text field
    if (isInputActive) {
      if (activeEl === el.searchInput) {
        if (e.key === 'Escape') {
          el.searchInput.value = '';
          state.searchQuery = '';
          el.btnClearSearch.classList.add('hidden');
          applyFilter();
          state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
          state.selectionAnchor = state.selectedIndex;
          state.selectedItems.clear();
          if (state.selectedIndex >= 0) {
            state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
          }
          renderFileList();
          updateStatusBar();
          el.fileList.focus();
          e.preventDefault();
        }
        return;
      }

      // If in any modal input (New File, New Folder, Network UNC, Appearance, Rename Fav, Rename Item, Compress, Open With, Export List)
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNewFileModal();
        closeNewFolderModal();
        closeNetworkModal();
        closeHelpModal();
        closeAboutModal();
        closeAppearanceModal();
        closeRenameFavoriteModal();
        closeRenameItemModal();
        closeBatchRenameModal();
        closeConfirmExitModal();
        closeJumpToFolder();
        closeSherlockModal();
        closeOpenWithModal();
        closeCompressModal();
        closeArchiveViewModal();
        closeExportListModal();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeEl === el.inputNetworkPath) {
          confirmNetwork();
        } else if (activeEl === el.inputNewFileName) {
          confirmNewFile();
        } else if (activeEl === el.inputNewFolderName) {
          confirmNewFolder();
        } else if (activeEl === el.inputRenameFavName) {
          saveRenamedFavorite();
        } else if (activeEl === el.inputRenameItemName) {
          saveRenamedItem();
        } else if (activeEl === el.inputCompressName) {
          confirmCompress();
        } else if (activeEl === el.inputOpenWithApp) {
          launchCustomOpenWith();
        } else if (activeEl === el.inputExportListName) {
          executeExportList();
        } else if (activeEl === el.inputSherlockQuery || activeEl === el.inputSherlockSizeNum) {
          executeSherlockFromInputs();
        } else if (activeEl === el.inputJumpToFolder) {
          const filtered = el.inputJumpToFolder._filtered || [];
          if (filtered.length > 0 && jumpFolderSelectedIndex >= 0 && jumpFolderSelectedIndex < filtered.length) {
            const item = filtered[jumpFolderSelectedIndex];
            closeJumpToFolder();
            loadDirectory(item.path, false);
          }
        }
        return;
      }

      // Allow typing and editing without triggering hotkeys (backspace, enter, letters)
      return;
    }

    // QuickView specific keys
    if (state.quickViewOpen) {
      // If focus is inside media player (audio/video controls), respect space for play/pause
      const isMediaFocused = activeEl && ['AUDIO', 'VIDEO'].includes(activeEl.tagName);

      if (e.key === ' ' || e.code === 'Space') {
        if (!isMediaFocused) {
          e.preventDefault();
          closeQuickView();
          return;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickView();
        return;
      }

      if ((e.key === 'h' || e.key === 'H') && !isInputActive && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const item = state.filteredItems[state.selectedIndex];
        if (item && !item.is_directory) {
          el.qvContent.innerHTML = `<div class="text-xs text-gnome-textDim">Generando vista hexadecimal...</div>`;
          invoke('read_file_hex', { path: item.path }).then(res => {
            el.qvContent.innerHTML = `<div class="w-full h-full overflow-auto bg-gnome-surface p-4 rounded-lg shadow-inner text-left"><pre class="text-[11px] font-mono leading-tight text-gnome-text whitespace-pre">${escapeHtml(res)}</pre></div>`;
            el.qvBadge.textContent = 'HEX VIEW';
          }).catch(err => {
            el.qvContent.innerHTML = `<div class="text-xs text-red-400">Error: ${escapeHtml(err)}</div>`;
          });
        }
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        deleteCurrentItem();
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateQuickView(1);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateQuickView(-1);
        return;
      }

      return; // Do not process normal list navigation while QuickView is open
    }

    // Toggle menu bar visibility
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      toggleMenuBar();
      return;
    }

    // Normal Window Navigation (Mac Cmd / Win-Linux Ctrl)
    if (isModKey(e) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      state.selectedItems.clear();
      state.filteredItems.forEach(i => state.selectedItems.add(i.path));
      renderFileList();
      updateStatusBar();
      return;
    }

    if (isModKey(e) && (e.key === 'c' || e.key === 'C') && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      copySelectedItems();
      return;
    }

    if (isModKey(e) && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      cutSelectedItems();
      return;
    }

    if (isModKey(e) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      pasteClipboardItems();
      return;
    }

    if (isModKey(e) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openNewFolderModal();
      return;
    }

    if (isModKey(e) && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openNewFileModal();
      return;
    }

    if (isModKey(e) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      duplicateSelectedItem();
      return;
    }

    if (isModKey(e) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      addCurrentToFavorites();
      return;
    }

    if (isModKey(e) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (el.searchInput) {
        el.searchInput.focus();
        el.searchInput.select();
      }
      return;
    }

    if (isModKey(e) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      openSherlockModal();
      return;
    }

    if (e.key === 'F2') {
      e.preventDefault();
      if (state.selectedItems.size > 1 || isModKey(e)) {
        openBatchRenameModal();
      } else {
        openRenameItemModal();
      }
      return;
    }


    if (e.altKey && e.key === 'Enter') {
      e.preventDefault();
      showItemProperties();
      return;
    }

    if (isModKey(e) && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      toggleShowHiddenFiles();
      return;
    }

    // Tabs & Terminal Shortcuts
    if (isModKey(e) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      openCurrentTerminal();
      return;
    }

    if (isModKey(e) && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      createTab();
      return;
    }

    if (isModKey(e) && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      closeTab(panels[activePanel].activeTab, activePanel);
      return;
    }

    if (isModKey(e) && e.key >= '1' && e.key <= '9') {
      const tabNum = parseInt(e.key, 10) - 1;
      const p = panels[activePanel];
      if (tabNum < panels[activePanel].tabs.length) {
        e.preventDefault();
        switchTab(tabNum);
        return;
      }
    }

    if (e.key === 'F5' || (isModKey(e) && (e.key === 'r' || e.key === 'R'))) {
      e.preventDefault();
      if (e.key === 'F5' && isSplitView && !isModKey(e)) {
        const targetDir = panels[activePanel === 0 ? 1 : 0].currentDirectory;
        if (state.currentDirectory && targetDir && state.currentDirectory !== targetDir && state.selectedItems.size > 0) {
          startTransferOperation('copy', Array.from(state.selectedItems), targetDir);
        }
      } else {
        reloadBothPanelsIfNeeded();
      }
      return;
    }

    if (e.key === 'F3' || (isModKey(e) && e.key === '\\')) {
      e.preventDefault();
      toggleSplitView();
      return;
    }

    if (e.key === 'F4' || (isModKey(e) && e.key === '3')) {
      e.preventDefault();
      toggleMillerView();
      return;
    }

    if (e.key === 'Tab' && isSplitView && !isInputActive) {
      e.preventDefault();
      switchActivePanel(activePanel === 0 ? 1 : 0);
      return;
    }
    if (isModKey(e) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      const item = panels[activePanel].filteredItems[panels[activePanel].selectedIndex];
      if (item) copyToClipboard('"' + item.path + '"');
      return;
    }
    if (isModKey(e) && e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      const item = panels[activePanel].filteredItems[panels[activePanel].selectedIndex];
      if (item) copyToClipboard('"' + getPosixPath(item.path) + '"');
      return;
    }

    if (isModKey(e) && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      openJumpToFolder();
      return;
    }


    if (state.isMillerView) {
      if (handleMillerKeyDown(e)) return;
    }

    if (e.key === 'F1') {
      e.preventDefault();
      openHelpModal();
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      openQuickView();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        activateItem(state.filteredItems[state.selectedIndex]);
      }
      return;
    }

    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      goBack();
      return;
    }

    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
      return;
    }

    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      goUp();
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      deleteCurrentItem();
      return;
    }

    // Continuous Range Selection with Shift + Arrow Keys
    if (e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelectionWithShift(1);
      return;
    }

    if (e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelectionWithShift(-1);
      return;
    }

    // Standard Arrow Navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        activateItem(state.filteredItems[state.selectedIndex]);
      }
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      setSelectionIndex(0);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      setSelectionIndex(state.filteredItems.length - 1);
      return;
    }

    if (e.key === 'PageDown') {
      e.preventDefault();
      moveSelection(10);
      return;
    }

    if (e.key === 'PageUp') {
      e.preventDefault();
      moveSelection(-10);
      return;
    }


    // Single-key Alphanumeric Type-Ahead Navigation (Jumping to file starting with letter/digit)
    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
      e.preventDefault();
      jumpToNextItemStartingWith(e.key);
      return;
    }
  }

  function jumpToNextItemStartingWith(char) {
    if (state.filteredItems.length === 0) return;
    const lowerChar = char.toLowerCase();
    const count = state.filteredItems.length;
    const startIndex = (state.selectedIndex + 1) % count;

    for (let i = 0; i < count; i++) {
      const idx = (startIndex + i) % count;
      const name = state.filteredItems[idx].name.toLowerCase();
      if (name.startsWith(lowerChar)) {
        setSelectionIndex(idx);
        break;
      }
    }
  }

  function moveSelectionWithShift(delta, pIdx = activePanel) {
    const p = panels[pIdx] || getActiveTabObj();
    const list = buildDisplayItemList(pIdx);
    if (list.length === 0) return;
    if (p.selectionAnchor < 0) {
      p.selectionAnchor = p.selectedIndex >= 0 ? p.selectedIndex : 0;
    }

    let next = (p.selectedIndex >= 0 ? p.selectedIndex : 0) + delta;
    if (next < 0) next = 0;
    if (next >= list.length) next = list.length - 1;

    p.selectedIndex = next;
    p.selectedItems.clear();

    const start = Math.min(p.selectionAnchor, next);
    const end = Math.max(p.selectionAnchor, next);
    for (let i = start; i <= end; i++) {
      if (list[i]) p.selectedItems.add(list[i].path);
    }

    renderFileList(pIdx);
    if (pIdx === activePanel) {
      updateStatusBar();
    }
  }

  function moveSelection(delta, pIdx = activePanel) {
    const p = panels[pIdx] || getActiveTabObj();
    const list = buildDisplayItemList(pIdx);
    if (list.length === 0) return;
    let next = (p.selectedIndex >= 0 ? p.selectedIndex : 0) + delta;
    if (next < 0) next = 0;
    if (next >= list.length) next = list.length - 1;
    p.selectionAnchor = next;
    setSelectionIndex(next, pIdx);
  }

  function setSelectionIndex(idx, pIdx = activePanel) {
    const p = panels[pIdx] || getActiveTabObj();
    const list = buildDisplayItemList(pIdx);
    if (idx < 0 || idx >= list.length) return;
    p.selectedIndex = idx;
    p.selectionAnchor = idx;
    p.selectedItems.clear();
    p.selectedItems.add(list[idx].path);
    renderFileList(pIdx);
    if (pIdx === activePanel) {
      updateStatusBar();
    }
  }

  async function navigateQuickView(delta) {
    if (state.filteredItems.length === 0) return;
    let next = state.selectedIndex + delta;
    if (next < 0) next = 0;
    if (next >= state.filteredItems.length) next = state.filteredItems.length - 1;
    if (next === state.selectedIndex) return; // Reached boundary

    state.selectedIndex = next;
    state.selectedItems.clear();
    state.selectedItems.add(state.filteredItems[next].path);
    renderFileList();
    updateStatusBar();
    await loadQuickViewContent(state.filteredItems[next]);
  }

  function goBack() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      loadDirectory(state.history[state.historyIndex], false);
    }
  }

  function goForward() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      loadDirectory(state.history[state.historyIndex], false);
    }
  }

  function goUp(targetPanelIdx = activePanel) {
    const pIdx = (typeof targetPanelIdx === 'number') ? targetPanelIdx : activePanel;
    const targetPanel = panels[pIdx];
    if (!targetPanel || !targetPanel.currentDirectory) return;
    const exitingDir = targetPanel.currentDirectory;
    const parent = getParentDirectory(exitingDir);
    if (parent) {
      loadDirectory(parent, true, pIdx, exitingDir);
    }
  }

  // Clipboard & File Operations
  function getSelectedOrFocusedPaths() {
    if (state.selectedItems.size > 0) {
      return Array.from(state.selectedItems);
    }
    if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
      return [state.filteredItems[state.selectedIndex].path];
    }
    return [];
  }

  function copySelectedItems() {
    const paths = getSelectedOrFocusedPaths();
    if (paths.length === 0) return;
    state.clipboard = { action: 'copy', paths };
    updateClipboardUI();
    renderFileList();
  }

  function cutSelectedItems() {
    const paths = getSelectedOrFocusedPaths();
    if (paths.length === 0) return;
    state.clipboard = { action: 'cut', paths };
    updateClipboardUI();
    renderFileList();
  }

  
  async function reloadBothPanelsIfNeeded() {
    if (isSplitView) {
      if (panels[0].currentDirectory) {
        await loadDirectory(panels[0].currentDirectory, false, 0);
      }
      if (panels[1].currentDirectory) {
        await loadDirectory(panels[1].currentDirectory, false, 1);
      }
    } else if (state.currentDirectory) {
      await loadDirectory(state.currentDirectory, false, activePanel);
    }
  }

  async function pasteClipboardItems() {
    if (!state.clipboard.action || state.clipboard.paths.length === 0 || !state.currentDirectory) {
      return;
    }

    const action = state.clipboard.action;
    const sources = [...state.clipboard.paths];
    const targetDir = state.currentDirectory;

    if (action === 'cut') {
      state.clipboard = { action: null, paths: [] };
      updateClipboardUI();
    }

    await startTransferOperation(action, sources, targetDir);
    reloadBothPanelsIfNeeded();
  }

  // --- Multi-Task Transfer Progress & Manager ---
  
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => console.error('Error copying text:', err));
  }
  function getPosixPath(winPath) {
    let p = winPath.replace(/\\/g, '/');
    p = p.replace(/^([a-zA-Z]):/, (match, p1) => `/${p1.toLowerCase()}`);
    return p;
  }
async function startTransferOperation(action, sources, targetDir) {
    try {
      const command = action === 'copy' ? 'copy_items' : 'move_items';
      await invoke(command, {
        sources,
        targetDirectory: targetDir
      });
      // Do not create a UI task, we rely on native Windows Shell Dialog!
    } catch (err) {
      alert(`Error al iniciar ${action === 'copy' ? 'copia' : 'movimiento'}: ` + err);
    }
  }

  function formatEta(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `Quedan ${Math.round(seconds)} s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins < 60) {
      return `Quedan ${mins}m ${secs.toString().padStart(2, '0')}s`;
    }
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `Quedan ${hours}h ${remMins}m`;
  }

  function handleTransferProgress(payload) {
    if (!payload || !payload.operation_id) return;
    let task = state.activeTransfers.get(payload.operation_id);
    if (!task) {
      task = {
        id: payload.operation_id,
        action: payload.action || 'copy',
        sources: [],
        targetDir: payload.target_directory || state.currentDirectory,
        startTime: performance.now(),
        isDone: false,
        success: true,
        error: null
      };
      state.activeTransfers.set(payload.operation_id, task);
    }

    task.currentItem = payload.current_item || '';
    task.currentIndex = payload.current_index || 0;
    task.totalItems = payload.total_items || 1;
    task.bytesCopied = payload.bytes_copied || 0;
    task.totalBytes = payload.total_bytes || 0;
    task.targetDir = payload.target_directory || task.targetDir;

    // Use speed and eta from backend or compute locally if needed
    if (payload.speed_bytes_per_sec && payload.speed_bytes_per_sec > 0) {
      task.speed = `${formatSize(payload.speed_bytes_per_sec)}/s`;
      task.eta = formatEta(payload.eta_seconds);
    } else {
      const elapsedSec = (performance.now() - task.startTime) / 1000;
      if (elapsedSec > 0.3 && task.bytesCopied > 0) {
        const bytesPerSec = task.bytesCopied / elapsedSec;
        task.speed = `${formatSize(bytesPerSec)}/s`;
        if (task.totalBytes > task.bytesCopied) {
          const remSecs = (task.totalBytes - task.bytesCopied) / bytesPerSec;
          task.eta = formatEta(remSecs);
        }
      }
    }

    renderAllTransfersUI();
  }

  function handleTransferFinished(payload) {
    if (!payload || !payload.operation_id) return;
    const task = state.activeTransfers.get(payload.operation_id);
    if (task) {
      task.isDone = true;
      task.success = payload.success;
      task.error = payload.error;
      task.currentIndex = payload.items_count || task.totalItems;
      task.bytesCopied = payload.total_bytes || task.totalBytes;
      task.speed = payload.success ? 'Completado' : 'Error';
      task.eta = '';
    }

    renderAllTransfersUI();

    reloadBothPanelsIfNeeded();

    // Auto-remove completed tasks immediately
    setTimeout(() => {
      state.activeTransfers.delete(payload.operation_id);
      renderAllTransfersUI();
    }, 0);
  }

  function renderAllTransfersUI() {
    const tasks = Array.from(state.activeTransfers.values());
    if (tasks.length === 0) {
      hidePasteProgress();
      return;
    }

    if (!el.pasteProgressContainer) return;
    el.pasteProgressContainer.classList.remove('hidden');
    el.pasteProgressContainer.classList.add('flex');

    const activeTasks = tasks.filter(t => !t.isDone);
    const activeCount = activeTasks.length;

    // 1. Overall Header Indicator
    if (activeCount > 1) {
      if (el.pasteProgressLabel) el.pasteProgressLabel.textContent = `${activeCount} tareas`;
    } else if (activeCount === 1) {
      const t = activeTasks[0];
      const label = t.action === 'copy' ? 'Copiando' : 'Moviendo';
      const detail = t.speed && t.speed !== 'Calculando...' ? ` (${t.speed})` : '';
      if (el.pasteProgressLabel) el.pasteProgressLabel.textContent = `${label}${detail}`;
    } else {
      if (el.pasteProgressLabel) el.pasteProgressLabel.textContent = 'Completado';
    }

    // Calculate aggregated percentage
    let totalPct = 0;
    tasks.forEach(t => {
      let p = 0;
      if (t.isDone) {
        p = 100;
      } else if (t.totalBytes > 0) {
        p = Math.min(99, Math.round((t.bytesCopied / t.totalBytes) * 100));
      } else if (t.totalItems > 0) {
        p = Math.min(99, Math.round((t.currentIndex / t.totalItems) * 100));
      }
      totalPct += p;
    });
    const avgPct = Math.round(totalPct / tasks.length);

    if (el.pasteProgressBar) el.pasteProgressBar.style.width = `${avgPct}%`;
    if (el.pasteProgressPercent) el.pasteProgressPercent.textContent = `${avgPct}%`;

    // 2. Render List of Tasks inside pasteDetailsCard
    if (el.pasteTasksList) {
      el.pasteTasksList.innerHTML = '';
      tasks.forEach(t => {
        let taskPct = 0;
        if (t.isDone) {
          taskPct = 100;
        } else if (t.totalBytes > 0) {
          taskPct = Math.min(99, Math.round((t.bytesCopied / t.totalBytes) * 100));
        } else if (t.totalItems > 0) {
          taskPct = Math.min(99, Math.round((t.currentIndex / t.totalItems) * 100));
        }

        const taskDiv = document.createElement('div');
        taskDiv.className = 'p-3 rounded-lg bg-gnome-sidebar/70 border border-gnome-border space-y-2';

        const actionText = t.action === 'copy' ? 'Copia' : 'Movimiento';
        const statusBadge = t.isDone
          ? (t.success ? '<span class="text-emerald-400 font-medium">✓ Listo</span>' : '<span class="text-red-400 font-medium">✕ Error</span>')
          : `<span class="text-blue-400 font-semibold">${t.speed || 'En progreso'}</span>`;

        const etaBadge = (!t.isDone && t.eta) ? `<span class="text-gnome-textDim text-[10px] ml-1.5 font-normal">⏱️ ${escapeHtml(t.eta)}</span>` : '';

        const bytesInfo = (t.totalBytes > 0)
          ? `${formatSize(t.bytesCopied)} de ${formatSize(t.totalBytes)}`
          : `${t.currentIndex} de ${t.totalItems} elementos`;

        taskDiv.innerHTML = `
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-gnome-text truncate max-w-[200px]" title="${escapeHtml(t.currentItem || 'Procesando...')}">
              ${actionText}: ${escapeHtml(t.currentItem || 'Archivos')}
            </span>
            <div class="flex items-center gap-1 shrink-0">
              ${statusBadge}
            </div>
          </div>
          <div class="w-full h-2.5 bg-gnome-bg rounded-full overflow-hidden border border-gnome-border/60">
            <div class="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full transition-all duration-150" style="width: ${taskPct}%"></div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-gnome-textDim">
            <span>${bytesInfo}${etaBadge}</span>
            <span class="font-bold text-gnome-active">${taskPct}%</span>
          </div>
          <div class="text-[10px] text-gnome-textDim truncate" title="Destino: ${escapeHtml(t.targetDir)}">
            📁 <span class="text-gnome-text">Destino:</span> ${escapeHtml(t.targetDir)}
          </div>
          ${t.error ? `<div class="text-[10px] text-red-400 font-mono bg-red-950/40 p-1 rounded border border-red-800/40">${escapeHtml(t.error)}</div>` : ''}
        `;
        el.pasteTasksList.appendChild(taskDiv);
      });
    }
  }

  function hidePasteProgress() {
    if (state.activeTransfers.size === 0) {
      if (el.pasteProgressContainer) {
        el.pasteProgressContainer.classList.remove('flex');
        el.pasteProgressContainer.classList.add('hidden');
      }
      if (el.pasteDetailsCard) {
        el.pasteDetailsCard.classList.add('hidden');
      }
    }
  }

  function updateClipboardUI() {
    const hasItems = state.clipboard.action && state.clipboard.paths.length > 0;
    el.btnActionPaste.disabled = !hasItems;
    el.menuPaste.disabled = !hasItems;

    if (hasItems) {
      const actionText = state.clipboard.action === 'copy' ? 'Copiado' : 'Cortado';
      el.clipboardBadge.textContent = `${actionText} ${state.clipboard.paths.length}`;
      el.clipboardBadge.classList.remove('hidden');
    } else {
      el.clipboardBadge.classList.add('hidden');
    }
  }

  async function toggleSplitView() {
    if (!isSplitView && state.isMillerView) {
      toggleMillerView();
    }
    isSplitView = !isSplitView;
    if (isSplitView) {
      el.panelB.classList.remove('hidden');
      if (el.btnToggleSplitView) el.btnToggleSplitView.classList.add('bg-gnome-active/20', 'text-gnome-active');

      if (!panels[1].currentDirectory) {
        const sourceDir = panels[0].currentDirectory || state.userHomeDir || '/';
        panels[1].currentDirectory = sourceDir;
      }

      await loadDirectory(panels[1].currentDirectory, false, 1);

      renderBreadcrumbs();
      renderFileList(0);
      renderFileList(1);
      updateSortHeaderUI();
      updateStatusBar();
      updatePanelHighlights();
      renderTabs();
      elPanels[activePanel].fileList.focus();
    } else {
      el.panelB.classList.add('hidden');
      if (el.btnToggleSplitView) el.btnToggleSplitView.classList.remove('bg-gnome-active/20', 'text-gnome-active');
      activePanel = 0;
      renderBreadcrumbs();
      renderFileList(0);
      updateSortHeaderUI();
      updateStatusBar();
      updatePanelHighlights();
      renderTabs();
      elPanels[0].fileList.focus();
    }
  }

  function switchActivePanel(newPanelIdx) {
    if (activePanel === newPanelIdx) return;
    activePanel = newPanelIdx;
    updatePanelHighlights();
    renderBreadcrumbs();
    updateSortHeaderUI();
    updateStatusBar();
    renderTabs();
    if (el.fileList) el.fileList.focus();
  }

  function updatePanelHighlights() {
    if (!isSplitView) {
      if (el.panelAHeader) el.panelAHeader.classList.add('hidden');
      if (el.panelBHeader) el.panelBHeader.classList.add('hidden');
      el.panelA.classList.remove('ring-1', 'ring-inset', 'ring-gnome-active/40');
      el.panelB.classList.remove('ring-1', 'ring-inset', 'ring-gnome-active/40');
      return;
    }

    if (el.panelAHeader) el.panelAHeader.classList.remove('hidden');
    if (el.panelBHeader) el.panelBHeader.classList.remove('hidden');

    const dirA = panels[0].currentDirectory || '';
    const dirB = panels[1].currentDirectory || '';

    if (el.pathIndicatorA) {
      el.pathIndicatorA.textContent = dirA;
      el.pathIndicatorA.title = dirA;
    }
    if (el.pathIndicatorB) {
      el.pathIndicatorB.textContent = dirB;
      el.pathIndicatorB.title = dirB;
    }

    if (el.panelACount) {
      const countA = panels[0].filteredItems?.length || 0;
      el.panelACount.textContent = `${countA} elem.`;
    }
    if (el.panelBCount) {
      const countB = panels[1].filteredItems?.length || 0;
      el.panelBCount.textContent = `${countB} elem.`;
    }

    if (activePanel === 0) {
      el.panelA.classList.add('ring-1', 'ring-inset', 'ring-gnome-active/40');
      el.panelB.classList.remove('ring-1', 'ring-inset', 'ring-gnome-active/40');
      if (el.panelAPathBox) {
        el.panelAPathBox.className = 'flex items-center gap-1.5 min-w-0 flex-1 px-2.5 py-0.5 rounded text-xs transition-colors bg-gnome-active text-white font-semibold shadow-sm';
      }
      if (el.panelBPathBox) {
        el.panelBPathBox.className = 'flex items-center gap-1.5 min-w-0 flex-1 px-2.5 py-0.5 rounded text-xs transition-colors bg-gnome-sidebar/50 border border-gnome-border/60 text-gnome-textDim hover:text-gnome-text';
      }
    } else {
      el.panelB.classList.add('ring-1', 'ring-inset', 'ring-gnome-active/40');
      el.panelA.classList.remove('ring-1', 'ring-inset', 'ring-gnome-active/40');
      if (el.panelBPathBox) {
        el.panelBPathBox.className = 'flex items-center gap-1.5 min-w-0 flex-1 px-2.5 py-0.5 rounded text-xs transition-colors bg-gnome-active text-white font-semibold shadow-sm';
      }
      if (el.panelAPathBox) {
        el.panelAPathBox.className = 'flex items-center gap-1.5 min-w-0 flex-1 px-2.5 py-0.5 rounded text-xs transition-colors bg-gnome-sidebar/50 border border-gnome-border/60 text-gnome-textDim hover:text-gnome-text';
      }
    }
  }

  function recordFrequentLocation(locPath) {
    if (!locPath || typeof locPath !== 'string') return;
    const clean = locPath.trim();
    if (!clean) return;
    if (!state.frequentLocations) state.frequentLocations = {};
    state.frequentLocations[clean] = (state.frequentLocations[clean] || 0) + 1;
    try {
      localStorage.setItem('tron_frequent_locations', JSON.stringify(state.frequentLocations));
    } catch (e) {}
    renderFrequentLinks();
  }

  function renderFrequentLinks() {
    if (!el.frequentLinks) return;
    el.frequentLinks.innerHTML = '';
    const entries = Object.entries(state.frequentLocations || {})
      .filter(([p, count]) => p && count > 0 && (!state.hiddenFrequentLocations || !state.hiddenFrequentLocations.has(p)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (entries.length === 0) {
      el.frequentLinks.innerHTML = '<div class="px-2 py-1 text-[11px] text-gnome-textDim italic select-none">Sin actividad reciente</div>';
      return;
    }

    entries.forEach(([locPath, count]) => {
      const isWindows = /^[a-zA-Z]:[\\\/]/.test(locPath) || locPath.startsWith('\\\\');
      const sep = isWindows ? '\\' : '/';
      const cleanPath = isWindows ? locPath.replace(/\//g, '\\') : locPath;
      const lastSlash = cleanPath.lastIndexOf(sep);
      let folderName = lastSlash >= 0 ? cleanPath.substring(lastSlash + 1) : cleanPath;
      if (!folderName && lastSlash === 2 && isWindows) folderName = cleanPath;
      if (!folderName) folderName = cleanPath;

      const btn = document.createElement('button');
      btn.className = 'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gnome-hover text-xs text-gnome-text text-left transition-colors group select-none';
      btn.title = `${cleanPath} (${count} visitas) - Clic derecho para opciones`;
      btn.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 flex-1 truncate">
          <span class="ui-icon-box text-amber-400">🕒</span>
          <span class="truncate">${escapeHtml(folderName)}</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.2 rounded bg-gnome-surface text-gnome-textDim font-mono">${count}</span>
      `;
      btn.onclick = () => loadDirectory(cleanPath);
      btn.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFrequentContextMenu(e, locPath);
      };
      setupSidebarDropTarget(btn, cleanPath);
      el.frequentLinks.appendChild(btn);
    });
  }

  async function duplicateSelectedItem(specificItem = null) {
    let targetPaths = [];
    if (specificItem) {
      targetPaths = [specificItem.path];
    } else {
      targetPaths = getSelectedOrFocusedPaths();
    }
    if (targetPaths.length === 0 || !state.currentDirectory) return;

    startTransferOperation('copy', targetPaths, state.currentDirectory);
  }

  let isOpeningContextMenu = false;

  function updateRowSelectionVisuals(idx) {
    if (idx < 0) return;
    if (state.isMillerView) {
      const mList = el.millerCurrentList;
      if (mList) {
        Array.from(mList.children).forEach((r, i) => {
          if (i === idx) {
            r.classList.add('bg-gnome-active', 'text-white', 'font-medium', 'shadow-sm');
            r.classList.remove('hover:bg-gnome-hover');
          } else {
            r.classList.remove('bg-gnome-active', 'text-white', 'font-medium', 'shadow-sm');
          }
        });
      }
    } else {
      const listEl = elPanels[activePanel]?.fileList || el.fileList;
      if (listEl) {
        Array.from(listEl.children).forEach((r, i) => {
          if (i === idx) {
            r.classList.add('bg-gnome-active', 'text-white');
            r.classList.remove('hover:bg-gnome-hover/50', 'text-gnome-text');
          } else {
            r.classList.remove('bg-gnome-active', 'text-white');
            r.classList.add('text-gnome-text');
          }
        });
      }
    }
  }

  // File Context Menu
  function openFileContextMenu(e, item, idx) {
    state.contextTargetItem = item;
    // If clicked item is not selected, select only it without rebuilding entire DOM
    if (item && item.path && !state.selectedItems.has(item.path)) {
      state.selectedItems.clear();
      state.selectedIndex = idx;
      state.selectionAnchor = idx;
      state.selectedItems.add(item.path);
      updateRowSelectionVisuals(idx);
      updateStatusBar();
    }

    closeDirContextMenu(true);
    closeFrequentContextMenu();

    if (!el.fileContextMenu) return;

    isOpeningContextMenu = true;
    setTimeout(() => { isOpeningContextMenu = false; }, 200);

    const ext = (item?.extension || '').toLowerCase();
    const isZip = ext === 'zip' || (item?.name || '').toLowerCase().endsWith('.zip');

    if (el.ctxMenuExtractHere) {
      if (isZip) el.ctxMenuExtractHere.classList.remove('hidden');
      else el.ctxMenuExtractHere.classList.add('hidden');
    }

    if (el.ctxMenuExtractToFolder) {
      if (isZip) {
        el.ctxMenuExtractToFolder.classList.remove('hidden');
        const folderName = (item?.name || 'archivo').replace(/\.zip$/i, '');
        if (el.ctxMenuExtractToFolderText) {
          el.ctxMenuExtractToFolderText.textContent = `📦 Extraer en ${folderName}/`;
        }
      } else {
        el.ctxMenuExtractToFolder.classList.add('hidden');
      }
    }

    if (el.ctxMenuArchiveViewContent) {
      if (isZip) el.ctxMenuArchiveViewContent.classList.remove('hidden');
      else el.ctxMenuArchiveViewContent.classList.add('hidden');
    }

    if (el.ctxMenuOpenEditor) {
      const isText = item && (state.customTextExts.includes(ext) || item.file_type === 'text' || item.file_type === 'code' || !item.is_directory);
      if (isText && !item.is_directory) {
        el.ctxMenuOpenEditor.classList.remove('hidden');
      } else {
        el.ctxMenuOpenEditor.classList.add('hidden');
      }
    }

    if (el.ctxMenuOpenLocation) {
      if (item && item.path) {
        const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
        const sep = isWindows ? '\\' : '/';
        const norm = isWindows ? item.path.replace(/\//g, '\\') : item.path.replace(/\\/g, '/');
        const lastSlash = norm.lastIndexOf(sep);
        if (lastSlash > 0) {
          const itemParent = norm.substring(0, lastSlash);
          const curNorm = isWindows ? (state.currentDirectory || '').replace(/\//g, '\\') : (state.currentDirectory || '').replace(/\\/g, '/');
          if (state.isSearchingRecursive || itemParent.toLowerCase() !== curNorm.toLowerCase()) {
            el.ctxMenuOpenLocation.classList.remove('hidden');
          } else {
            el.ctxMenuOpenLocation.classList.add('hidden');
          }
        } else {
          el.ctxMenuOpenLocation.classList.add('hidden');
        }
      } else {
        el.ctxMenuOpenLocation.classList.add('hidden');
      }
    }

    // PdfTools contextual submenu logic
    const selectedList = state.selectedItems.size > 0 
      ? state.filteredItems.filter(i => state.selectedItems.has(i.path)) 
      : (item ? [item] : []);

    const imageExts = ['png', 'jpg', 'jpeg', 'webp'];
    const isSingle = selectedList.length === 1;
    const singleExt = (selectedList[0]?.extension || '').toLowerCase();
    const isSinglePdf = isSingle && singleExt === 'pdf';
    
    const allImages = selectedList.length >= 1 && selectedList.every(i => !i.is_directory && imageExts.includes((i.extension || '').toLowerCase()));
    
    const isMultiple = selectedList.length > 1;
    const allPdfsOrImages = isMultiple && selectedList.every(i => {
      if (i.is_directory) return false;
      const ex = (i.extension || '').toLowerCase();
      return ex === 'pdf' || imageExts.includes(ex);
    });

    const showPdfTools = isSinglePdf || allImages || allPdfsOrImages;
    if (el.ctxMenuPdfTools) {
      if (showPdfTools) {
        el.ctxMenuPdfTools.classList.remove('hidden');
        if (el.ctxPdfToImages) el.ctxPdfToImages.classList.toggle('hidden', !isSinglePdf);
        if (el.ctxPdfOptimize) el.ctxPdfOptimize.classList.toggle('hidden', !isSinglePdf);
        if (el.ctxPdfSplit) el.ctxPdfSplit.classList.toggle('hidden', !isSinglePdf);
        if (el.ctxPdfRotate) el.ctxPdfRotate.classList.toggle('hidden', !isSinglePdf);
        if (el.ctxPdfExtractText) el.ctxPdfExtractText.classList.toggle('hidden', !isSinglePdf);
        if (el.ctxPdfImagesToPdf) el.ctxPdfImagesToPdf.classList.toggle('hidden', !allImages);
        if (el.ctxPdfMerge) el.ctxPdfMerge.classList.toggle('hidden', !allPdfsOrImages);
      } else {
        el.ctxMenuPdfTools.classList.add('hidden');
      }
    }
    if (el.ctxMenuPdfToolsSub) {
      el.ctxMenuPdfToolsSub.classList.add('hidden');
    }

    if (el.ctxMenuBatchRename && el.ctxMenuRename) {
      if (state.selectedItems.size > 1) {
        el.ctxMenuBatchRename.classList.remove('hidden');
        el.ctxMenuRename.classList.add('hidden');
      } else {
        el.ctxMenuBatchRename.classList.add('hidden');
        el.ctxMenuRename.classList.remove('hidden');
      }
    }

    // Position menu intelligently: measure actual element dimensions
    el.fileContextMenu.style.visibility = 'hidden';
    el.fileContextMenu.classList.remove('hidden');
    
    // Ensure menu fits inside small viewports
    el.fileContextMenu.style.maxHeight = `${window.innerHeight - 20}px`;
    el.fileContextMenu.style.overflowY = 'auto';

    const menuRect = el.fileContextMenu.getBoundingClientRect();
    const menuWidth = menuRect.width || 224;
    const menuHeight = menuRect.height || (isZip ? 520 : 460);

    let x = e.clientX;
    let y = e.clientY;

    // Horizontal placement: flip to left if overflowing right edge
    if (x + menuWidth > window.innerWidth) {
      x = Math.max(8, e.clientX - menuWidth);
    }

    // Vertical placement: flip upwards if overflowing bottom edge
    if (y + menuHeight > window.innerHeight) {
      // Open upwards from the cursor
      y = e.clientY - menuHeight;
      // If it also overflows the top, clamp to top padding
      if (y < 8) {
        y = 8;
      }
    }

    el.fileContextMenu.style.left = `${Math.max(5, x)}px`;
    el.fileContextMenu.style.top = `${Math.max(5, y)}px`;
    el.fileContextMenu.style.visibility = 'visible';
  }

  function closeFileContextMenu(force = false) {
    if (isOpeningContextMenu && !force) return;
    if (el.ctxMenuPdfToolsSub) el.ctxMenuPdfToolsSub.classList.add('hidden');
    if (el.fileContextMenu) {
      el.fileContextMenu.classList.add('hidden');
    }
    state.contextTargetItem = null;
  }

  // Directory Background Context Menu
  function openDirContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    closeFileContextMenu(true);
    closeFrequentContextMenu();

    if (!el.dirContextMenu) return;

    if (el.ctxDirPaste) {
      const hasClipboard = state.clipboard && state.clipboard.paths && state.clipboard.paths.length > 0;
      el.ctxDirPaste.disabled = !hasClipboard;
    }

    isOpeningContextMenu = true;
    setTimeout(() => { isOpeningContextMenu = false; }, 200);

    el.dirContextMenu.style.visibility = 'hidden';
    el.dirContextMenu.classList.remove('hidden');

    const menuRect = el.dirContextMenu.getBoundingClientRect();
    const menuWidth = menuRect.width || 220;
    const menuHeight = menuRect.height || 280;

    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = Math.max(8, e.clientX - menuWidth);
    }
    if (y + menuHeight > window.innerHeight) {
      y = e.clientY - menuHeight;
      if (y < 8) y = 8;
    }

    el.dirContextMenu.style.left = `${Math.max(5, x)}px`;
    el.dirContextMenu.style.top = `${Math.max(5, y)}px`;
    el.dirContextMenu.style.visibility = 'visible';
  }

  function closeDirContextMenu(force = false) {
    if (isOpeningContextMenu && !force) return;
    if (el.dirContextMenu) {
      el.dirContextMenu.classList.add('hidden');
    }
  }

  // Frequent Locations Context Menu
  function openFrequentContextMenu(e, locPath) {
    state.contextTargetFrequent = locPath;
    closeFileContextMenu();
    if (!el.ctxMenuFrequent) return;

    if (el.ctxMenuFrequentPathHeader) {
      el.ctxMenuFrequentPathHeader.textContent = locPath;
      el.ctxMenuFrequentPathHeader.title = locPath;
    }

    el.ctxMenuFrequent.style.visibility = 'hidden';
    el.ctxMenuFrequent.classList.remove('hidden');

    const menuRect = el.ctxMenuFrequent.getBoundingClientRect();
    const menuWidth = menuRect.width || 256;
    const menuHeight = menuRect.height || 140;

    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = Math.max(8, e.clientX - menuWidth);
    }
    if (y + menuHeight > window.innerHeight) {
      y = Math.max(8, e.clientY - menuHeight);
    }

    el.ctxMenuFrequent.style.left = `${Math.max(5, x)}px`;
    el.ctxMenuFrequent.style.top = `${Math.max(5, y)}px`;
    el.ctxMenuFrequent.style.visibility = 'visible';
  }

  function closeFrequentContextMenu() {
    if (el.ctxMenuFrequent) {
      el.ctxMenuFrequent.classList.add('hidden');
    }
    state.contextTargetFrequent = null;
  }

  // --- Explorer, Properties, Open With, Compress, and Archive Handlers ---
  async function showInSystemExplorer(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    const path = item ? item.path : state.currentDirectory;
    if (!path) return;
    try {
      await invoke('show_in_system_explorer', { path });
    } catch (err) {
      console.warn('Error al mostrar en el explorador:', err);
    }
  }

  async function showItemProperties(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    const path = item ? item.path : state.currentDirectory;
    if (!path) return;
    try {
      await invoke('show_item_properties', { path });
    } catch (err) {
      console.warn('Error al mostrar propiedades:', err);
    }
  }

  let openWithTargetItem = null;

  const DEFAULT_APP_SUGGESTIONS = {
    image: [
      { id: 'img_photos', name: 'Fotos (Windows)', cmd: 'ms-photos:' },
      { id: 'img_paint', name: 'Paint', cmd: 'mspaint' },
      { id: 'img_gimp', name: 'GIMP', cmd: 'gimp' },
      { id: 'img_photoshop', name: 'Photoshop', cmd: 'photoshop' },
      { id: 'img_edge', name: 'Navegador Web (Edge)', cmd: 'msedge' }
    ],
    text: [
      { id: 'txt_notepad', name: 'Bloc de notas', cmd: 'notepad' },
      { id: 'txt_code', name: 'Visual Studio Code', cmd: 'code' },
      { id: 'txt_codium', name: 'VSCodium', cmd: 'codium' },
      { id: 'txt_subl', name: 'Sublime Text', cmd: 'subl' },
      { id: 'txt_npp', name: 'Notepad++', cmd: 'notepad++' },
      { id: 'txt_nvim', name: 'Neovim', cmd: 'nvim' }
    ],
    office: [
      { id: 'off_word', name: 'Microsoft Word', cmd: 'winword' },
      { id: 'off_excel', name: 'Microsoft Excel', cmd: 'excel' },
      { id: 'off_powerpnt', name: 'Microsoft PowerPoint', cmd: 'powerpnt' },
      { id: 'off_soffice', name: 'LibreOffice', cmd: 'soffice' },
      { id: 'off_acrobat', name: 'Acrobat Reader', cmd: 'AcroRd32' }
    ],
    media: [
      { id: 'med_vlc', name: 'VLC Media Player', cmd: 'vlc' },
      { id: 'med_wmplayer', name: 'Windows Media Player', cmd: 'wmplayer' },
      { id: 'med_mpv', name: 'mpv', cmd: 'mpv' },
      { id: 'med_spotify', name: 'Spotify', cmd: 'spotify' }
    ],
    archive: [
      { id: 'arc_explorer', name: 'Explorador de archivos', cmd: 'explorer' },
      { id: 'arc_7zip', name: '7-Zip', cmd: '7zFM' },
      { id: 'arc_winrar', name: 'WinRAR', cmd: 'winrar' }
    ],
    general: [
      { id: 'gen_notepad', name: 'Bloc de notas', cmd: 'notepad' },
      { id: 'gen_code', name: 'Visual Studio Code', cmd: 'code' },
      { id: 'gen_explorer', name: 'Explorador de archivos', cmd: 'explorer' }
    ]
  };

  function getExternalAppsConfig() {
    if (state.externalAppsConfig) return state.externalAppsConfig;
    try {
      const raw = localStorage.getItem('tron_external_apps_config');
      if (raw) {
        state.externalAppsConfig = JSON.parse(raw);
        return state.externalAppsConfig;
      }
    } catch (e) {
      console.warn('Error reading tron_external_apps_config:', e);
    }
    // Default initial config: all enabled, no custom path
    const conf = {};
    Object.keys(DEFAULT_APP_SUGGESTIONS).forEach(cat => {
      DEFAULT_APP_SUGGESTIONS[cat].forEach(app => {
        conf[app.id] = { enabled: true, customPath: '' };
      });
    });
    state.externalAppsConfig = conf;
    return conf;
  }

  function saveExternalAppsConfig(conf) {
    state.externalAppsConfig = conf;
    localStorage.setItem('tron_external_apps_config', JSON.stringify(conf));
  }

  function getSuggestionsForExt(ext, fileType) {
    const e = (ext || '').toLowerCase();
    let rawList = DEFAULT_APP_SUGGESTIONS.general;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'dng', 'tiff', 'tif'].includes(e) || fileType === 'image') {
      rawList = DEFAULT_APP_SUGGESTIONS.image;
    } else if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(e) || fileType === 'video' || fileType === 'audio') {
      rawList = DEFAULT_APP_SUGGESTIONS.media;
    } else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'pdf'].includes(e) || fileType === 'office' || fileType === 'pdf') {
      rawList = DEFAULT_APP_SUGGESTIONS.office;
    } else if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(e) || fileType === 'archive') {
      rawList = DEFAULT_APP_SUGGESTIONS.archive;
    } else if (['txt', 'md', 'rs', 'js', 'ts', 'py', 'json', 'toml', 'yaml', 'yml', 'html', 'css', 'c', 'cpp', 'h', 'sh', 'bat', 'ps1', 'ini', 'log'].includes(e) || fileType === 'text' || fileType === 'code') {
      rawList = DEFAULT_APP_SUGGESTIONS.text;
    }

    const conf = getExternalAppsConfig();
    return rawList
      .filter(app => !conf[app.id] || conf[app.id].enabled !== false)
      .map(app => {
        const custom = conf[app.id] && conf[app.id].customPath ? conf[app.id].customPath.trim() : '';
        return {
          id: app.id,
          name: app.name,
          cmd: custom || app.cmd,
          isCustom: !!custom
        };
      });
  }

  function openOpenWithModal(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item) return;
    openWithTargetItem = item;

    if (el.openWithFileName) {
      el.openWithFileName.textContent = `${item.name} (${item.path})`;
    }
    if (el.inputOpenWithApp) {
      el.inputOpenWithApp.value = '';
    }

    if (el.openWithSuggestions) {
      el.openWithSuggestions.innerHTML = '';
      const suggestions = getSuggestionsForExt(item.extension, item.file_type);
      suggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flex items-center gap-2 p-2 rounded-lg bg-gnome-sidebar hover:bg-gnome-hover border border-gnome-border text-left text-xs transition-colors group';
        btn.innerHTML = `
          <span class="text-sm select-none">⚡</span>
          <div class="min-w-0">
            <span class="font-medium text-gnome-text block truncate group-hover:text-white">${escapeHtml(s.name)}</span>
            <span class="text-[10px] text-gnome-textDim font-mono block truncate">${escapeHtml(s.cmd)}</span>
          </div>
        `;
        btn.onclick = async () => {
          closeOpenWithModal();
          try {
            await invoke('launch_with_app', { path: item.path, appCommand: s.cmd });
          } catch (err) {
            alert('Error al abrir con la aplicación: ' + err);
          }
        };
        el.openWithSuggestions.appendChild(btn);
      });
    }

    if (el.modalOpenWith) {
      el.modalOpenWith.classList.remove('hidden');
      if (el.inputOpenWithApp) el.inputOpenWithApp.focus();
    }
  }

  function closeOpenWithModal() {
    if (el.modalOpenWith) {
      el.modalOpenWith.classList.add('hidden');
    }
    openWithTargetItem = null;
    el.fileList.focus();
  }

  async function launchCustomOpenWith() {
    if (!openWithTargetItem || !el.inputOpenWithApp) return;
    const cmd = el.inputOpenWithApp.value.trim();
    if (!cmd) return;
    const targetPath = openWithTargetItem.path;
    closeOpenWithModal();
    try {
      await invoke('launch_with_app', { path: targetPath, appCommand: cmd });
    } catch (err) {
      alert('Error al abrir con el comando especificado: ' + err);
    }
  }

  async function launchSystemOpenWithDialog() {
    if (!openWithTargetItem) return;
    const targetPath = openWithTargetItem.path;
    closeOpenWithModal();
    try {
      await invoke('open_with_dialog', { path: targetPath });
    } catch (err) {
      console.warn('Error al abrir selector del sistema:', err);
    }
  }

  let compressTargetPaths = [];

  function openCompressModal(specificItem = null) {
    if (specificItem) {
      compressTargetPaths = [specificItem.path];
    } else {
      compressTargetPaths = getSelectedOrFocusedPaths();
    }
    if (compressTargetPaths.length === 0) return;

    const firstPath = compressTargetPaths[0];
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(firstPath) || firstPath.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const norm = isWindows ? firstPath.replace(/\//g, '\\') : firstPath.replace(/\\/g, '/');
    const base = norm.split(sep).pop().replace(/\.[^/.]+$/, '');

    const defaultName = compressTargetPaths.length === 1 ? (base || 'archivo') : 'archivo_comprimido';

    if (el.inputCompressName) {
      el.inputCompressName.value = defaultName;
    }
    if (el.compressItemsCount) {
      el.compressItemsCount.textContent = `Se comprimirá ${compressTargetPaths.length} elemento${compressTargetPaths.length > 1 ? 's' : ''} en el directorio actual.`;
    }

    if (el.modalCompress) {
      el.modalCompress.classList.remove('hidden');
      if (el.inputCompressName) {
        el.inputCompressName.focus();
        el.inputCompressName.select();
      }
    }
  }

  function closeCompressModal() {
    if (el.modalCompress) {
      el.modalCompress.classList.add('hidden');
    }
    compressTargetPaths = [];
    el.fileList.focus();
  }

  async function confirmCompress() {
    if (compressTargetPaths.length === 0 || !el.inputCompressName || !state.currentDirectory) return;
    let name = el.inputCompressName.value.trim();
    if (!name) name = 'archivo_comprimido';
    if (!name.toLowerCase().endsWith('.zip')) {
      name += '.zip';
    }

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(state.currentDirectory) || state.currentDirectory.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const cleanDir = state.currentDirectory.replace(/[\\\/]+$/, '');
    const outZipPath = `${cleanDir}${sep}${name}`;

    const sources = [...compressTargetPaths];
    closeCompressModal();

    try {
      await invoke('compress_to_zip', {
        sourcePaths: sources,
        outputZipPath: outZipPath
      });
      await reloadBothPanelsIfNeeded();
      const idx = state.filteredItems.findIndex(i => i.path.toLowerCase() === outZipPath.toLowerCase());
      if (idx >= 0) {
        setSelectionIndex(idx);
      }
    } catch (err) {
      alert('Error al comprimir en zip: ' + err);
    }
  }

  async function extractArchiveHere(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item || !state.currentDirectory) return;
    try {
      await invoke('extract_zip_archive', {
        zipPath: item.path,
        targetDir: state.currentDirectory
      });
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      alert('Error al extraer archivo: ' + err);
    }
  }

  async function extractArchiveToSubfolder(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item || !state.currentDirectory) return;
    const folderName = (item.name || 'archivo').replace(/\.zip$/i, '');
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(state.currentDirectory) || state.currentDirectory.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const cleanDir = state.currentDirectory.replace(/[\\\/]+$/, '');
    const targetDir = `${cleanDir}${sep}${folderName}`;

    try {
      await invoke('extract_zip_archive', {
        zipPath: item.path,
        targetDir
      });
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      alert('Error al extraer en carpeta: ' + err);
    }
  }

  let currentArchiveEntries = [];
  let currentArchiveItem = null;

  async function openArchiveViewModal(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item) return;
    currentArchiveItem = item;

    if (el.archiveViewFileName) {
      el.archiveViewFileName.textContent = `${item.name} (${item.path})`;
    }
    if (el.inputArchiveFilter) {
      el.inputArchiveFilter.value = '';
    }

    try {
      const entries = await invoke('list_zip_contents', { zipPath: item.path });
      currentArchiveEntries = entries || [];
      renderArchiveEntries();
      if (el.modalArchiveView) {
        el.modalArchiveView.classList.remove('hidden');
        if (el.inputArchiveFilter) el.inputArchiveFilter.focus();
      }
    } catch (err) {
      alert('Error al leer contenido del zip: ' + err);
    }
  }

  function renderArchiveEntries() {
    if (!el.archiveTableBody) return;
    const filter = (el.inputArchiveFilter ? el.inputArchiveFilter.value.trim().toLowerCase() : '');
    const filtered = currentArchiveEntries.filter(e => !filter || (e.path && e.path.toLowerCase().includes(filter)) || (e.name && e.name.toLowerCase().includes(filter)));

    if (el.archiveTotalCount) {
      el.archiveTotalCount.textContent = `${filtered.length} de ${currentArchiveEntries.length} elementos`;
    }

    el.archiveTableBody.innerHTML = '';
    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" class="py-6 text-center text-gnome-textDim italic text-xs">No hay elementos que coincidan</td>`;
      el.archiveTableBody.appendChild(tr);
      return;
    }

    filtered.forEach(entry => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gnome-hover/70 transition-colors';
      const icon = entry.is_directory ? '📁' : '📄';
      tr.innerHTML = `
        <td class="py-1.5 px-3 truncate max-w-[340px]" title="${escapeHtml(entry.path)}">
          <span class="mr-1.5 select-none">${icon}</span>
          <span class="text-gnome-text">${escapeHtml(entry.path)}</span>
        </td>
        <td class="py-1.5 px-3 text-right text-gnome-textDim whitespace-nowrap font-mono">
          ${entry.is_directory ? '--' : formatSize(entry.uncompressed_size)}
        </td>
        <td class="py-1.5 px-3 text-right text-gnome-textDim whitespace-nowrap font-mono">
          ${entry.is_directory ? '--' : formatSize(entry.compressed_size)}
        </td>
      `;
      el.archiveTableBody.appendChild(tr);
    });
  }

  function closeArchiveViewModal() {
    if (el.modalArchiveView) {
      el.modalArchiveView.classList.add('hidden');
    }
    currentArchiveEntries = [];
    currentArchiveItem = null;
    el.fileList.focus();
  }

  // --- Export Directory Listing Controller (ls / dir / tree) ---
  let exportListTargetDirectory = '';

  function openExportListModal(specificDir = null) {
    let target = specificDir;
    if (!target) {
      if (state.contextTargetItem && state.contextTargetItem.is_directory) {
        target = state.contextTargetItem.path;
      } else if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        const item = state.filteredItems[state.selectedIndex];
        if (item.is_directory) {
          target = item.path;
        }
      }
    }
    if (!target) {
      target = state.currentDirectory;
    }
    if (!target) return;

    exportListTargetDirectory = target;

    // Determine default file name
    const norm = target.replace(/\\/g, '/').replace(/\/+$/, '');
    const dirBase = norm.split('/').filter(Boolean).pop() || 'directorio';
    const defaultName = `listado_${dirBase}`;

    if (el.exportListTargetDir) {
      el.exportListTargetDir.textContent = target;
      el.exportListTargetDir.title = target;
    }
    if (el.inputExportListName) {
      el.inputExportListName.value = defaultName;
    }

    // Reset controls to sensible defaults
    const treeRadio = document.querySelector('input[name="exportListFormat"][value="tree"]');
    if (treeRadio) treeRadio.checked = true;

    if (el.chkExportListRecursive) el.chkExportListRecursive.checked = true;
    if (el.chkExportListIncludeFiles) el.chkExportListIncludeFiles.checked = true;
    if (el.chkExportListDetails) el.chkExportListDetails.checked = true;
    if (el.chkExportListOpenAfter) el.chkExportListOpenAfter.checked = true;
    if (el.rangeExportListDepth) el.rangeExportListDepth.value = '2';
    if (el.chkExportListFullDepth) el.chkExportListFullDepth.checked = false;
    updateExportListDepthUI();

    if (el.modalExportList) {
      el.modalExportList.classList.remove('hidden');
      if (el.inputExportListName) {
        el.inputExportListName.focus();
        el.inputExportListName.select();
      }
    }
  }

  function closeExportListModal() {
    if (el.modalExportList) {
      el.modalExportList.classList.add('hidden');
    }
    el.fileList.focus();
  }

  function updateExportListDepthUI() {
    if (!el.exportListDepthLabel || !el.rangeExportListDepth || !el.chkExportListFullDepth) return;
    const isFull = el.chkExportListFullDepth.checked;
    el.rangeExportListDepth.disabled = isFull;
    if (isFull) {
      el.exportListDepthLabel.textContent = 'Completa (sin límite)';
      el.exportListDepthLabel.className = 'font-mono font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/40';
    } else {
      const val = el.rangeExportListDepth.value;
      el.exportListDepthLabel.textContent = `${val} ${val === '1' ? 'nivel' : 'niveles'}`;
      el.exportListDepthLabel.className = 'font-mono font-bold text-gnome-active bg-gnome-surface px-2 py-0.5 rounded border border-gnome-border';
    }
  }

  async function executeExportList() {
    if (!exportListTargetDirectory || !el.inputExportListName || !state.currentDirectory) return;

    let filename = el.inputExportListName.value.trim();
    if (!filename) filename = 'listado_directorio';
    if (!filename.toLowerCase().endsWith('.txt')) {
      filename += '.txt';
    }

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(state.currentDirectory) || state.currentDirectory.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const cleanDir = state.currentDirectory.replace(/[\\\/]+$/, '');
    const outFilePath = `${cleanDir}${sep}${filename}`;

    const formatRadio = document.querySelector('input[name="exportListFormat"]:checked');
    const format = formatRadio ? formatRadio.value : 'tree';

    const recursive = el.chkExportListRecursive ? el.chkExportListRecursive.checked : true;
    const includeFiles = el.chkExportListIncludeFiles ? el.chkExportListIncludeFiles.checked : true;
    const includeDetails = el.chkExportListDetails ? el.chkExportListDetails.checked : true;
    const isFullDepth = el.chkExportListFullDepth ? el.chkExportListFullDepth.checked : false;
    const depthVal = el.rangeExportListDepth ? parseInt(el.rangeExportListDepth.value, 10) : 2;
    const maxDepth = isFullDepth ? null : (isNaN(depthVal) ? 2 : depthVal);
    const openAfter = el.chkExportListOpenAfter ? el.chkExportListOpenAfter.checked : false;

    closeExportListModal();

    try {
      if (el.btnActionExportList) {
        el.btnActionExportList.classList.add('animate-pulse', 'text-gnome-active');
      }

      const res = await invoke('generate_directory_listing', {
        options: {
          dir_path: exportListTargetDirectory,
          output_path: outFilePath,
          format: format,
          recursive: recursive,
          include_files: includeFiles,
          include_details: includeDetails,
          max_depth: maxDepth
        }
      });

      // Reload current directory so the new .txt appears
      await loadDirectory(state.currentDirectory, false);

      // Select newly created txt file
      const idx = state.filteredItems.findIndex(i => i.path.toLowerCase() === outFilePath.toLowerCase());
      if (idx >= 0) {
        setSelectionIndex(idx);
      }

      if (openAfter) {
        openInTextEditor(outFilePath);
      }
    } catch (err) {
      alert('Error al generar listado: ' + err);
    } finally {
      if (el.btnActionExportList) {
        el.btnActionExportList.classList.remove('animate-pulse', 'text-gnome-active');
      }
    }
  }

  // ==========================================
  // PdfTools Implementation (Native Rust Tauri)
  // ==========================================

  let pdfToImagesTarget = null;
  let pdfOptimizeTarget = null;
  let pdfExtractTarget = null;
  let pdfMergeItems = [];

  function openPdfToolsSubmenu() {
    if (!el.ctxMenuPdfToolsSub || !el.ctxMenuPdfTools) return;
    const rect = el.ctxMenuPdfTools.getBoundingClientRect();
    const subWidth = 260;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    let left = rect.right + 4;
    if (left + subWidth > winWidth - 10) {
      left = Math.max(10, rect.left - subWidth - 4);
    }
    let top = rect.top;
    el.ctxMenuPdfToolsSub.style.left = `${left}px`;
    el.ctxMenuPdfToolsSub.style.top = `${top}px`;
    el.ctxMenuPdfToolsSub.classList.remove('hidden');

    setTimeout(() => {
      if (!el.ctxMenuPdfToolsSub) return;
      const subRect = el.ctxMenuPdfToolsSub.getBoundingClientRect();
      if (subRect.bottom > winHeight - 10) {
        const diff = subRect.bottom - (winHeight - 10);
        el.ctxMenuPdfToolsSub.style.top = `${Math.max(10, top - diff)}px`;
      }
    }, 0);
  }

  function closePdfToolsSubmenu() {
    if (el.ctxMenuPdfToolsSub) {
      el.ctxMenuPdfToolsSub.classList.add('hidden');
    }
  }

  // --- 1. Convertir PDF a Imágenes ---
  function openPdfToImagesModal() {
    const target = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    closePdfToolsSubmenu();
    closeFileContextMenu();
    if (!target) return;
    pdfToImagesTarget = target;

    const allRadio = document.querySelector('input[name="pdfToImagesPagesMode"][value="all"]');
    if (allRadio) allRadio.checked = true;
    if (el.inputPdfToImagesRange) {
      el.inputPdfToImagesRange.value = '';
      el.inputPdfToImagesRange.disabled = true;
    }
    if (el.selectPdfToImagesFormat) {
      el.selectPdfToImagesFormat.value = 'jpg';
    }

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(target.path) || target.path.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const norm = isWindows ? target.path.replace(/\//g, '\\') : target.path.replace(/\\/g, '/');
    const stem = norm.split(sep).pop().replace(/\.[^/.]+$/, '');
    const parentDir = norm.substring(0, norm.lastIndexOf(sep)) || (isWindows ? 'C:\\' : '/');
    const outDirName = `${parentDir}${sep}${stem}_paginas`;

    if (el.pdfToImagesOutputDir) {
      el.pdfToImagesOutputDir.textContent = outDirName;
    }
    if (el.pdfToImagesStatus) {
      el.pdfToImagesStatus.classList.add('hidden');
    }
    if (el.btnConfirmPdfToImages) {
      el.btnConfirmPdfToImages.disabled = false;
    }

    if (el.modalPdfToImages) {
      el.modalPdfToImages.classList.remove('hidden');
    }
  }

  function closePdfToImagesModal() {
    if (el.modalPdfToImages) {
      el.modalPdfToImages.classList.add('hidden');
    }
    pdfToImagesTarget = null;
    el.fileList.focus();
  }

  async function confirmPdfToImages() {
    if (!pdfToImagesTarget) return;

    const modeRadio = document.querySelector('input[name="pdfToImagesPagesMode"]:checked');
    const isRange = modeRadio && modeRadio.value === 'range';
    let pages = [];

    if (isRange && el.inputPdfToImagesRange) {
      const val = el.inputPdfToImagesRange.value.trim();
      if (val) {
        val.split(',').forEach(part => {
          const p = part.trim();
          if (p.includes('-')) {
            const [s, e] = p.split('-');
            const start = parseInt(s, 10);
            const end = parseInt(e, 10);
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                if (!pages.includes(i)) pages.push(i);
              }
            }
          } else {
            const num = parseInt(p, 10);
            if (!isNaN(num) && !pages.includes(num)) pages.push(num);
          }
        });
      }
    }

    const fmt = (el.selectPdfToImagesFormat?.value || 'jpg').toLowerCase();

    if (el.pdfToImagesStatus) el.pdfToImagesStatus.classList.remove('hidden');
    if (el.btnConfirmPdfToImages) el.btnConfirmPdfToImages.disabled = true;

    try {
      const outDir = await invoke('pdf_to_images', {
        pdfPath: pdfToImagesTarget.path,
        pages: pages,
        format: fmt
      });
      closePdfToImagesModal();
      showToast('PDF convertido a imágenes en: ' + outDir, 'success');
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      if (el.pdfToImagesStatus) el.pdfToImagesStatus.classList.add('hidden');
      if (el.btnConfirmPdfToImages) el.btnConfirmPdfToImages.disabled = false;
      alert('Error al convertir PDF en imágenes: ' + err);
    }
  }

  // --- 2. Optimizar / Reducir tamaño PDF ---
  function openPdfOptimizeModal() {
    const target = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    closePdfToolsSubmenu();
    closeFileContextMenu();
    if (!target) return;
    pdfOptimizeTarget = target;

    const origSize = target.size || 0;
    if (el.pdfOptimizeOrigSize) {
      el.pdfOptimizeOrigSize.textContent = formatSize(origSize);
    }

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(target.path) || target.path.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const norm = isWindows ? target.path.replace(/\//g, '\\') : target.path.replace(/\\/g, '/');
    const stem = norm.split(sep).pop().replace(/\.[^/.]+$/, '');
    const defaultOutName = `${stem}_optimizado.pdf`;

    if (el.inputPdfOptimizeOutName) {
      el.inputPdfOptimizeOutName.value = defaultOutName;
    }
    if (el.sliderPdfOptimizeQuality) {
      el.sliderPdfOptimizeQuality.value = '70';
    }
    if (el.pdfOptimizeQualityVal) {
      el.pdfOptimizeQualityVal.textContent = '70%';
    }
    if (el.pdfOptimizeEstimatedSize) {
      const est = Math.round(origSize * 0.55);
      el.pdfOptimizeEstimatedSize.textContent = '~' + formatSize(est);
    }
    if (el.pdfOptimizeStatus) {
      el.pdfOptimizeStatus.classList.add('hidden');
    }
    if (el.btnConfirmPdfOptimize) {
      el.btnConfirmPdfOptimize.disabled = false;
    }

    if (el.modalPdfOptimize) {
      el.modalPdfOptimize.classList.remove('hidden');
      if (el.inputPdfOptimizeOutName) {
        el.inputPdfOptimizeOutName.focus();
        el.inputPdfOptimizeOutName.select();
      }
    }
  }

  function closePdfOptimizeModal() {
    if (el.modalPdfOptimize) {
      el.modalPdfOptimize.classList.add('hidden');
    }
    pdfOptimizeTarget = null;
    el.fileList.focus();
  }

  async function confirmPdfOptimize() {
    if (!pdfOptimizeTarget) return;

    let outName = (el.inputPdfOptimizeOutName?.value || '').trim();
    if (!outName) outName = 'optimizado.pdf';
    if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(pdfOptimizeTarget.path) || pdfOptimizeTarget.path.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const norm = isWindows ? pdfOptimizeTarget.path.replace(/\//g, '\\') : pdfOptimizeTarget.path.replace(/\\/g, '/');
    const parentDir = norm.substring(0, norm.lastIndexOf(sep)) || (isWindows ? 'C:\\' : '/');
    const outPath = `${parentDir}${sep}${outName}`;

    const quality = parseInt(el.sliderPdfOptimizeQuality?.value || '70', 10);

    if (el.pdfOptimizeStatus) el.pdfOptimizeStatus.classList.remove('hidden');
    if (el.btnConfirmPdfOptimize) el.btnConfirmPdfOptimize.disabled = true;

    try {
      const newSize = await invoke('pdf_optimize', {
        pdfPath: pdfOptimizeTarget.path,
        qualityLevel: quality,
        outputPath: outPath
      });
      closePdfOptimizeModal();
      showToast(`PDF optimizado con éxito (${formatSize(newSize)})`, 'success');
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      if (el.pdfOptimizeStatus) el.pdfOptimizeStatus.classList.add('hidden');
      if (el.btnConfirmPdfOptimize) el.btnConfirmPdfOptimize.disabled = false;
      alert('Error al optimizar PDF: ' + err);
    }
  }

  // --- 3. Dividir PDF por páginas ---
  async function actionPdfSplit() {
    const target = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    closePdfToolsSubmenu();
    closeFileContextMenu();
    if (!target) return;

    showToast('Dividiendo PDF en páginas individuales...', 'info');

    try {
      const outDir = await invoke('pdf_split', {
        pdfPath: target.path,
        mode: 'single',
        rangeStr: null
      });
      showToast('PDF dividido en: ' + outDir, 'success');
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      alert('Error al dividir PDF: ' + err);
    }
  }

  // --- 4. Rotar PDF (90° horario) ---
  async function actionPdfRotate() {
    const target = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    closePdfToolsSubmenu();
    closeFileContextMenu();
    if (!target) return;

    showToast('Rotando PDF 90°...', 'info');

    try {
      await invoke('pdf_rotate', {
        pdfPath: target.path,
        degrees: 90
      });
      showToast('PDF rotado 90° con éxito', 'success');
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      alert('Error al rotar PDF: ' + err);
    }
  }

  // --- 5. Extraer texto a Markdown / TXT ---
  function openPdfExtractTextModal() {
    const target = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    closePdfToolsSubmenu();
    closeFileContextMenu();
    if (!target) return;
    pdfExtractTarget = target;

    const mdRadio = document.querySelector('input[name="pdfExtractFormat"][value="markdown"]');
    if (mdRadio) mdRadio.checked = true;

    if (el.pdfExtractStatus) el.pdfExtractStatus.classList.add('hidden');
    if (el.btnConfirmPdfExtractText) el.btnConfirmPdfExtractText.disabled = false;

    if (el.modalPdfExtractText) {
      el.modalPdfExtractText.classList.remove('hidden');
    }
  }

  function closePdfExtractTextModal() {
    if (el.modalPdfExtractText) {
      el.modalPdfExtractText.classList.add('hidden');
    }
    pdfExtractTarget = null;
    el.fileList.focus();
  }

  async function confirmPdfExtractText() {
    if (!pdfExtractTarget) return;

    const formatRadio = document.querySelector('input[name="pdfExtractFormat"]:checked');
    const format = formatRadio ? formatRadio.value : 'markdown';

    if (el.pdfExtractStatus) el.pdfExtractStatus.classList.remove('hidden');
    if (el.btnConfirmPdfExtractText) el.btnConfirmPdfExtractText.disabled = true;

    try {
      const outFile = await invoke('pdf_extract_text', {
        pdfPath: pdfExtractTarget.path,
        outputFormat: format
      });
      closePdfExtractTextModal();
      showToast('Texto extraído en: ' + outFile, 'success');
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      if (el.pdfExtractStatus) el.pdfExtractStatus.classList.add('hidden');
      if (el.btnConfirmPdfExtractText) el.btnConfirmPdfExtractText.disabled = false;
      alert('Error al extraer texto: ' + err);
    }
  }

  // --- 6. Convertir Imágenes a PDF ---
  async function actionPdfImagesToPdf() {
    const imageExts = ['png', 'jpg', 'jpeg', 'webp'];
    const selected = state.selectedItems.size > 0
      ? state.filteredItems.filter(i => state.selectedItems.has(i.path) && !i.is_directory && imageExts.includes((i.extension || '').toLowerCase()))
      : (state.contextTargetItem ? [state.contextTargetItem] : []);
    closePdfToolsSubmenu();
    closeFileContextMenu();

    if (selected.length === 0) return;

    const first = selected[0];
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(first.path) || first.path.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const norm = isWindows ? first.path.replace(/\//g, '\\') : first.path.replace(/\\/g, '/');
    const parentDir = norm.substring(0, norm.lastIndexOf(sep)) || (isWindows ? 'C:\\' : '/');
    const stem = norm.split(sep).pop().replace(/\.[^/.]+$/, '');

    const outName = selected.length === 1 ? `${stem}.pdf` : `${stem}_imagenes.pdf`;
    const outPdfPath = `${parentDir}${sep}${outName}`;

    showToast('Generando PDF desde imágenes...', 'info');

    try {
      const outFile = await invoke('pdf_images_to_pdf', {
        imagePaths: selected.map(i => i.path),
        outputPdf: outPdfPath
      });
      showToast('PDF generado con éxito: ' + outFile, 'success');
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      alert('Error al crear PDF: ' + err);
    }
  }

  // --- 7. Unir en un único PDF (Merge) ---
  function openPdfMergeModal() {
    closePdfToolsSubmenu();
    closeFileContextMenu();

    const imageExts = ['png', 'jpg', 'jpeg', 'webp'];
    const selected = state.selectedItems.size > 0
      ? state.filteredItems.filter(i => state.selectedItems.has(i.path) && !i.is_directory && (i.extension?.toLowerCase() === 'pdf' || imageExts.includes(i.extension?.toLowerCase())))
      : (state.contextTargetItem ? [state.contextTargetItem] : []);

    if (selected.length === 0) return;

    pdfMergeItems = [...selected];

    if (el.inputPdfMergeOutName) {
      el.inputPdfMergeOutName.value = 'documento_combinado';
    }
    if (el.pdfMergeStatus) {
      el.pdfMergeStatus.classList.add('hidden');
    }
    if (el.btnConfirmPdfMerge) {
      el.btnConfirmPdfMerge.disabled = false;
    }

    renderPdfMergeList();

    if (el.modalPdfMerge) {
      el.modalPdfMerge.classList.remove('hidden');
      if (el.inputPdfMergeOutName) {
        el.inputPdfMergeOutName.focus();
        el.inputPdfMergeOutName.select();
      }
    }
  }

  function renderPdfMergeList() {
    if (!el.pdfMergeList) return;
    el.pdfMergeList.innerHTML = '';

    pdfMergeItems.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-1.5 bg-gnome-surface hover:bg-gnome-hover rounded border border-gnome-border/50 text-xs text-gnome-text';

      const isPdf = (item.extension || '').toLowerCase() === 'pdf';
      const icon = isPdf ? '📄' : '🖼️';

      const left = document.createElement('div');
      left.className = 'flex items-center gap-2 truncate flex-1 mr-2';
      left.innerHTML = `<span class="opacity-70 font-mono text-[10px] w-4">${index + 1}.</span> <span>${icon}</span> <span class="truncate font-medium">${item.name}</span>`;

      const right = document.createElement('div');
      right.className = 'flex items-center gap-1 shrink-0';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'p-1 hover:bg-gnome-active hover:text-white rounded disabled:opacity-30';
      btnUp.textContent = '↑';
      btnUp.disabled = index === 0;
      btnUp.onclick = () => {
        if (index > 0) {
          const temp = pdfMergeItems[index];
          pdfMergeItems[index] = pdfMergeItems[index - 1];
          pdfMergeItems[index - 1] = temp;
          renderPdfMergeList();
        }
      };

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'p-1 hover:bg-gnome-active hover:text-white rounded disabled:opacity-30';
      btnDown.textContent = '↓';
      btnDown.disabled = index === pdfMergeItems.length - 1;
      btnDown.onclick = () => {
        if (index < pdfMergeItems.length - 1) {
          const temp = pdfMergeItems[index];
          pdfMergeItems[index] = pdfMergeItems[index + 1];
          pdfMergeItems[index + 1] = temp;
          renderPdfMergeList();
        }
      };

      right.appendChild(btnUp);
      right.appendChild(btnDown);
      row.appendChild(left);
      row.appendChild(right);
      el.pdfMergeList.appendChild(row);
    });
  }

  function closePdfMergeModal() {
    if (el.modalPdfMerge) {
      el.modalPdfMerge.classList.add('hidden');
    }
    pdfMergeItems = [];
    el.fileList.focus();
  }

  async function confirmPdfMerge() {
    if (pdfMergeItems.length === 0) return;

    let outName = (el.inputPdfMergeOutName?.value || '').trim();
    if (!outName) outName = 'documento_combinado';
    if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';

    const first = pdfMergeItems[0];
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(first.path) || first.path.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const norm = isWindows ? first.path.replace(/\//g, '\\') : first.path.replace(/\\/g, '/');
    const parentDir = norm.substring(0, norm.lastIndexOf(sep)) || (isWindows ? 'C:\\' : '/');
    const outPdfPath = `${parentDir}${sep}${outName}`;

    if (el.pdfMergeStatus) el.pdfMergeStatus.classList.remove('hidden');
    if (el.btnConfirmPdfMerge) el.btnConfirmPdfMerge.disabled = true;

    try {
      const outFile = await invoke('pdf_merge', {
        files: pdfMergeItems.map(i => i.path),
        outputPdf: outPdfPath
      });
      closePdfMergeModal();
      showToast('PDF combinado creado: ' + outFile, 'success');
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      if (el.pdfMergeStatus) el.pdfMergeStatus.classList.add('hidden');
      if (el.btnConfirmPdfMerge) el.btnConfirmPdfMerge.disabled = false;
      alert('Error al unir PDF: ' + err);
    }
  }

  // Modals & New File / New Folder
  function openNewFileModal() {
    el.inputNewFileName.value = 'nuevo_archivo.md';
    el.chkOpenAfterCreate.checked = true;
    el.modalNewFile.classList.remove('hidden');
    el.inputNewFileName.focus();
    el.inputNewFileName.select();
  }

  function closeNewFileModal() {
    el.modalNewFile.classList.add('hidden');
    el.fileList.focus();
  }

  async function confirmNewFile() {
    const fileName = el.inputNewFileName.value.trim();
    if (!fileName) return;

    try {
      const openAfter = el.chkOpenAfterCreate.checked;
      await invoke('create_new_file', {
        dirPath: state.currentDirectory,
        fileName,
        openAfter
      });
      closeNewFileModal();
      await reloadBothPanelsIfNeeded();

      // Select the newly created file
      const idx = state.filteredItems.findIndex(i => i.name.toLowerCase() === fileName.toLowerCase());
      if (idx >= 0) setSelectionIndex(idx);
    } catch (err) {
      alert('Error al crear archivo: ' + err);
    }
  }

  function openNewFolderModal() {
    el.inputNewFolderName.value = 'Nueva Carpeta';
    el.modalNewFolder.classList.remove('hidden');
    el.inputNewFolderName.focus();
    el.inputNewFolderName.select();
  }

  function closeNewFolderModal() {
    el.modalNewFolder.classList.add('hidden');
    el.fileList.focus();
  }

  let isCreatingFolder = false;
  async function confirmNewFolder() {
    if (isCreatingFolder) return;
    const folderName = el.inputNewFolderName.value.trim();
    if (!folderName) return;

    isCreatingFolder = true;
    try {
      await invoke('create_new_directory', {
        dirPath: state.currentDirectory,
        folderName
      });
      closeNewFolderModal();
      await reloadBothPanelsIfNeeded();

      // Select newly created folder
      const idx = state.filteredItems.findIndex(i => i.name.toLowerCase() === folderName.toLowerCase());
      if (idx >= 0) setSelectionIndex(idx);
    } catch (err) {
      alert('Error al crear carpeta: ' + err);
    } finally {
      isCreatingFolder = false;
    }
  }

  // Network Dialog
  function openNetworkModal() {
    el.inputNetworkPath.value = isMac || (navigator.platform && navigator.platform.includes('Linux')) ? 'smb://' : '\\\\';
    el.modalNetwork.classList.remove('hidden');
    el.inputNetworkPath.focus();
  }

  function closeNetworkModal() {
    el.modalNetwork.classList.add('hidden');
    el.fileList.focus();
  }

  async function confirmNetwork() {
    const path = el.inputNetworkPath.value.trim();
    if (path) {
      closeNetworkModal();
      try {
        const resolved = await invoke('connect_network_share', { path });
        if (resolved) {
          await loadDirectory(resolved);
        }
      } catch (err) {
        alert('Error al conectar con el recurso de red: ' + err);
      }
    }
  }

  // Help & Shortcuts Modal
  function openHelpModal() {
    el.modalHelp.classList.remove('hidden');
  }

  function closeHelpModal() {
    el.modalHelp.classList.add('hidden');
    el.fileList.focus();
  }

  let currentUpdateData = null;

  function resetUpdateUI() {
    currentUpdateData = null;
    if (el.btnCheckUpdates) {
      el.btnCheckUpdates.disabled = false;
      el.btnCheckUpdates.classList.remove('opacity-60', 'pointer-events-none');
    }
    if (el.btnCheckUpdatesSpinner) el.btnCheckUpdatesSpinner.classList.add('hidden');
    if (el.btnCheckUpdatesText) el.btnCheckUpdatesText.textContent = '🔍 Buscar actualizaciones';
    if (el.updateStatusBox) el.updateStatusBox.classList.add('hidden');
    if (el.updateReleaseNotesBox) {
      el.updateReleaseNotesBox.classList.add('hidden');
      el.updateReleaseNotesBox.textContent = '';
    }
    if (el.updateProgressContainer) el.updateProgressContainer.classList.add('hidden');
    if (el.updateProgressBar) el.updateProgressBar.style.width = '0%';
    if (el.updateProgressPercent) el.updateProgressPercent.textContent = '';
    if (el.updateActionsContainer) el.updateActionsContainer.classList.add('hidden');
    if (el.btnApplyUpdate) {
      el.btnApplyUpdate.classList.add('hidden');
      el.btnApplyUpdate.disabled = false;
      el.btnApplyUpdate.textContent = '⬇️ Descargar e Instalar ahora';
    }
    if (el.btnDownloadManual) el.btnDownloadManual.classList.add('hidden');
    if (el.btnRestartApp) el.btnRestartApp.classList.add('hidden');
  }

  async function handleCheckForUpdates() {
    if (!el.btnCheckUpdates) return;
    el.btnCheckUpdates.disabled = true;
    if (el.btnCheckUpdatesSpinner) el.btnCheckUpdatesSpinner.classList.remove('hidden');
    if (el.btnCheckUpdatesText) el.btnCheckUpdatesText.textContent = 'Comprobando con GitHub...';

    if (el.updateStatusBox) el.updateStatusBox.classList.remove('hidden');
    if (el.updateStatusMsg) {
      el.updateStatusMsg.className = 'font-medium text-gnome-textDim';
      el.updateStatusMsg.textContent = 'Consultando últimas versiones publicadas...';
    }
    if (el.updateReleaseNotesBox) el.updateReleaseNotesBox.classList.add('hidden');
    if (el.updateActionsContainer) el.updateActionsContainer.classList.add('hidden');

    try {
      const res = await invoke('check_app_updates', {
        repoOwner: 'pedroredond0',
        repoName: 'tron'
      });

      if (el.btnCheckUpdatesSpinner) el.btnCheckUpdatesSpinner.classList.add('hidden');
      if (el.btnCheckUpdatesText) el.btnCheckUpdatesText.textContent = '🔍 Buscar actualizaciones';
      el.btnCheckUpdates.disabled = false;

      if (!res) {
        if (el.updateStatusMsg) {
          el.updateStatusMsg.className = 'font-medium text-amber-400';
          el.updateStatusMsg.textContent = 'No se pudo obtener información de la versión.';
        }
        return;
      }

      currentUpdateData = res;

      if (!res.has_update) {
        if (el.updateStatusMsg) {
          el.updateStatusMsg.className = 'font-medium text-emerald-400 flex items-center gap-1.5';
          el.updateStatusMsg.innerHTML = `<span>✅</span> Estás en la última versión (v${escapeHtml(res.current_version)})`;
        }
        if (el.updateReleaseNotesBox) el.updateReleaseNotesBox.classList.add('hidden');
        if (el.updateActionsContainer) el.updateActionsContainer.classList.add('hidden');
      } else {
        // Update available
        if (el.updateStatusMsg) {
          el.updateStatusMsg.className = 'font-medium text-cyan-400 flex items-center gap-1.5';
          el.updateStatusMsg.innerHTML = `<span>✨</span> ¡Nueva versión v${escapeHtml(res.latest_version)} disponible!`;
        }

        if (res.release_notes && el.updateReleaseNotesBox) {
          el.updateReleaseNotesBox.textContent = res.release_notes.trim();
          el.updateReleaseNotesBox.classList.remove('hidden');
        }

        if (el.updateActionsContainer) {
          el.updateActionsContainer.classList.remove('hidden');
        }

        const isWin = res.os === 'windows' || (!isMac && navigator.platform?.toLowerCase().includes('win'));

        if (isWin && res.download_url && res.asset_name?.toLowerCase().endsWith('.exe')) {
          // Windows: Hot automatic install
          if (el.btnApplyUpdate) {
            el.btnApplyUpdate.classList.remove('hidden');
            const sizeMb = res.asset_size ? ` (${(res.asset_size / (1024 * 1024)).toFixed(1)} MB)` : '';
            el.btnApplyUpdate.textContent = `⬇️ Descargar e Instalar ahora${sizeMb}`;
          }
          if (el.btnDownloadManual) el.btnDownloadManual.classList.add('hidden');
        } else {
          // Linux / macOS: Direct release or asset download link
          if (el.btnApplyUpdate) el.btnApplyUpdate.classList.add('hidden');
          if (el.btnDownloadManual) {
            el.btnDownloadManual.classList.remove('hidden');
            el.btnDownloadManual.href = res.download_url || `https://github.com/pedroredond0/tron/releases/tag/v${res.latest_version}`;
            const label = res.asset_name ? `🌐 Descargar ${res.asset_name}` : '🌐 Descargar release';
            el.btnDownloadManual.textContent = label;
          }
        }
      }
    } catch (err) {
      if (el.btnCheckUpdatesSpinner) el.btnCheckUpdatesSpinner.classList.add('hidden');
      if (el.btnCheckUpdatesText) el.btnCheckUpdatesText.textContent = '🔍 Buscar actualizaciones';
      el.btnCheckUpdates.disabled = false;
      if (el.updateStatusMsg) {
        el.updateStatusMsg.className = 'font-medium text-rose-400';
        el.updateStatusMsg.textContent = `Error al comprobar: ${err}`;
      }
    }
  }

  async function handleApplyUpdate() {
    if (!currentUpdateData || !currentUpdateData.download_url) return;

    if (el.btnApplyUpdate) {
      el.btnApplyUpdate.disabled = true;
      el.btnApplyUpdate.classList.add('opacity-50', 'pointer-events-none');
    }
    if (el.btnCheckUpdates) {
      el.btnCheckUpdates.disabled = true;
    }

    if (el.updateProgressContainer) el.updateProgressContainer.classList.remove('hidden');
    if (el.updateProgressBar) el.updateProgressBar.style.width = '40%';
    if (el.updateProgressText) el.updateProgressText.textContent = 'Descargando y preparando binario...';
    if (el.updateProgressPercent) el.updateProgressPercent.textContent = '';

    try {
      // Small simulated progress step for visual feedback
      let pct = 40;
      const progressTimer = setInterval(() => {
        if (pct < 85) {
          pct += 5;
          if (el.updateProgressBar) el.updateProgressBar.style.width = `${pct}%`;
        }
      }, 300);

      await invoke('apply_app_update', {
        downloadUrl: currentUpdateData.download_url,
        assetName: currentUpdateData.asset_name || 'Tron.exe'
      });

      clearInterval(progressTimer);

      if (el.updateProgressBar) el.updateProgressBar.style.width = '100%';
      if (el.updateProgressText) el.updateProgressText.textContent = '¡Actualización completada!';

      if (el.updateStatusMsg) {
        el.updateStatusMsg.className = 'font-medium text-emerald-400 flex items-center gap-1.5';
        el.updateStatusMsg.innerHTML = '<span>✅</span> Actualización lista. Reinicia la aplicación para aplicar los cambios.';
      }

      if (el.btnApplyUpdate) el.btnApplyUpdate.classList.add('hidden');
      if (el.btnRestartApp) el.btnRestartApp.classList.remove('hidden');

    } catch (err) {
      if (el.updateProgressContainer) el.updateProgressContainer.classList.add('hidden');
      if (el.updateStatusMsg) {
        el.updateStatusMsg.className = 'font-medium text-rose-400';
        el.updateStatusMsg.textContent = `Error al instalar: ${err}`;
      }
      if (el.btnApplyUpdate) {
        el.btnApplyUpdate.disabled = false;
        el.btnApplyUpdate.classList.remove('opacity-50', 'pointer-events-none');
      }
      if (el.btnCheckUpdates) {
        el.btnCheckUpdates.disabled = false;
      }
    }
  }

  function handleRestartApp() {
    try {
      invoke('restart_app');
    } catch (_) {
      try {
        invoke('force_exit_app');
      } catch (__) {
        window.close();
      }
    }
  }

  async function openAboutModal() {
    resetUpdateUI();
    try {
      const info = await invoke('get_app_info');
      if (info) {
        if (el.aboutVersion) el.aboutVersion.textContent = info.version;
        if (el.aboutBuildUnix) el.aboutBuildUnix.textContent = info.build_timestamp;
        if (el.aboutBuildDate) {
          const d = new Date(info.build_timestamp * 1000);
          el.aboutBuildDate.textContent = d.toLocaleString('es-ES', {
            dateStyle: 'medium',
            timeStyle: 'medium'
          });
        }
      }
    } catch (err) {
      console.warn('Could not fetch app info:', err);
    }
    if (el.modalAbout) el.modalAbout.classList.remove('hidden');
  }

  function closeAboutModal() {
    if (el.modalAbout) el.modalAbout.classList.add('hidden');
    el.fileList.focus();
  }


  // Completely Isolated Per-Panel Tab Management Implementation
  function createTabElement(t, idx, panelIdx, isActive) {
    const tabEl = document.createElement('div');
    const isPanelActive = panelIdx === activePanel;
    tabEl.className = `group h-6 px-2.5 rounded flex items-center gap-1.5 text-xs select-none cursor-pointer transition-colors max-w-[170px] shrink-0 ${
      isActive
        ? (isPanelActive ? 'bg-gnome-active text-white font-semibold shadow-sm' : 'bg-gnome-surface text-white font-medium border border-gnome-active/50 shadow-sm')
        : 'bg-gnome-sidebar hover:bg-gnome-hover/70 text-gnome-textDim hover:text-gnome-text'
    }`;
    tabEl.title = t.currentDirectory || 'Inicio';
    tabEl.innerHTML = `
      <span class="text-[11px] opacity-80">📁</span>
      <span class="truncate flex-1">${escapeHtml(t.name || 'Carpeta')}</span>
      ${panels[panelIdx].tabs.length > 1 ? '<button type="button" class="btn-close-tab w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] opacity-40 group-hover:opacity-100 hover:bg-white/20 hover:text-white transition-opacity" title="Cerrar pestaña">✕</button>' : ''}
    `;

    tabEl.onclick = (e) => {
      if (e.target.closest('.btn-close-tab')) return;
      if (activePanel !== panelIdx) {
        switchActivePanel(panelIdx);
      }
      switchTab(idx, panelIdx);
    };

    tabEl.onauxclick = (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(idx, panelIdx);
      }
    };

    const btnClose = tabEl.querySelector('.btn-close-tab');
    if (btnClose) {
      btnClose.onclick = (e) => {
        e.stopPropagation();
        closeTab(idx, panelIdx);
      };
    }

    return tabEl;
  }

  function renderTabs() {
    if (!isSplitView) {
      // Single panel: render panels[0].tabs in top tabBar
      if (el.tabBar) {
        if (panels[0].tabs.length <= 1) {
          el.tabBar.classList.add('hidden');
        } else {
          el.tabBar.classList.remove('hidden');
        }
      }
      if (el.tabList) {
        el.tabList.innerHTML = '';
        panels[0].tabs.forEach((t, idx) => {
          const isActive = idx === panels[0].activeTab;
          const tabEl = createTabElement(t, idx, 0, isActive);
          el.tabList.appendChild(tabEl);
        });
      }
    } else {
      // Split view: hide top tabBar, render each panel's tabs directly in its header
      if (el.tabBar) el.tabBar.classList.add('hidden');

      // Render Panel A tabs
      if (el.panelATabsContainer) {
        el.panelATabsContainer.innerHTML = '';
        panels[0].tabs.forEach((t, idx) => {
          const isActive = idx === panels[0].activeTab;
          const tabEl = createTabElement(t, idx, 0, isActive);
          el.panelATabsContainer.appendChild(tabEl);
        });
        const btnAddA = document.createElement('button');
        btnAddA.type = 'button';
        btnAddA.className = 'p-1 px-1.5 rounded hover:bg-gnome-hover text-gnome-textDim hover:text-white transition-colors text-xs flex items-center justify-center shrink-0 font-bold';
        btnAddA.title = 'Nueva pestaña en Panel 1';
        btnAddA.textContent = '+';
        btnAddA.onclick = (e) => {
          e.stopPropagation();
          createTab('', 0);
        };
        el.panelATabsContainer.appendChild(btnAddA);
      }

      // Render Panel B tabs
      if (el.panelBTabsContainer) {
        el.panelBTabsContainer.innerHTML = '';
        panels[1].tabs.forEach((t, idx) => {
          const isActive = idx === panels[1].activeTab;
          const tabEl = createTabElement(t, idx, 1, isActive);
          el.panelBTabsContainer.appendChild(tabEl);
        });
        const btnAddB = document.createElement('button');
        btnAddB.type = 'button';
        btnAddB.className = 'p-1 px-1.5 rounded hover:bg-gnome-hover text-gnome-textDim hover:text-white transition-colors text-xs flex items-center justify-center shrink-0 font-bold';
        btnAddB.title = 'Nueva pestaña en Panel 2';
        btnAddB.textContent = '+';
        btnAddB.onclick = (e) => {
          e.stopPropagation();
          createTab('', 1);
        };
        el.panelBTabsContainer.appendChild(btnAddB);
      }
    }
  }

  async function createTab(dir = '', panelIdx = activePanel) {
    const p = panels[panelIdx];
    const initialDir = dir || p.currentDirectory || state.currentDirectory || state.userHomeDir || '/';
    const newTab = createTabState(initialDir);
    p.tabs.push(newTab);
    p.activeTab = p.tabs.length - 1;
    renderTabs();
    await loadDirectory(initialDir, true, panelIdx);
  }

  function closeTab(index, panelIdx = activePanel) {
    const p = panels[panelIdx];
    if (p.tabs.length <= 1) return;
    p.tabs.splice(index, 1);
    if (p.activeTab >= p.tabs.length) {
      p.activeTab = p.tabs.length - 1;
    }
    renderTabs();
    const curTab = p.tabs[p.activeTab];
    if (curTab.currentDirectory) {
      loadDirectory(curTab.currentDirectory, false, panelIdx);
    } else {
      renderFileList(panelIdx);
      if (panelIdx === activePanel) {
        updateStatusBar();
        renderBreadcrumbs();
      }
    }
  }

  async function switchTab(index, panelIdx = activePanel) {
    const p = panels[panelIdx];
    if (!p || index < 0 || index >= p.tabs.length) return;
    p.activeTab = index;
    renderTabs();
    const curTab = p.tabs[p.activeTab];
    if (curTab.currentDirectory) {
      await loadDirectory(curTab.currentDirectory, false, panelIdx);
    } else {
      renderFileList(panelIdx);
    }
  }

  // Color Tags Sidebar Rendering
  function renderTagSidebar() {
    if (!el.tagLinks) return;
    el.tagLinks.innerHTML = '';

    // Calculate count per tag
    const tagCounts = {};
    for (const key of Object.keys(TAG_COLOR_DEFS)) {
      tagCounts[key] = 0;
    }
    const curDir = state.currentDirectory || '';
    for (const [normPath, val] of Object.entries(fileTagsMap)) {
      const tags = Array.isArray(val) ? val : (val.tags || []);
      if (!tags || tags.length === 0) continue;

      if (state.recursiveTagSearch) {
        if (!isSubpath(curDir, normPath)) continue;
      } else {
        // Only count if item is directly inside curDir
        const lastSlash = normPath.lastIndexOf('/');
        const parentNorm = lastSlash >= 0 ? normPath.substring(0, lastSlash) : '';
        const curNorm = curDir.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
        if (parentNorm !== curNorm) continue;
      }

      tags.forEach(t => {
        if (tagCounts[t] !== undefined) tagCounts[t]++;
      });
    }

    if (el.btnClearActiveTagFilter) {
      if (state.activeTagFilter) {
        el.btnClearActiveTagFilter.classList.remove('hidden');
      } else {
        el.btnClearActiveTagFilter.classList.add('hidden');
      }
    }

    for (const [colorKey, def] of Object.entries(TAG_COLOR_DEFS)) {
      const count = tagCounts[colorKey] || 0;
      const isActive = state.activeTagFilter === colorKey;
      const displayName = getTagDisplayName(colorKey);
      const row = document.createElement('div');
      row.className = `group w-full flex items-center justify-between gap-1 px-2 py-1 rounded-md text-xs transition-colors select-none cursor-pointer ${
        isActive 
          ? 'bg-gnome-active text-white font-medium' 
          : 'text-gnome-text hover:bg-gnome-hover'
      }`;
      row.title = `${displayName} (clic para filtrar, lápiz o clic derecho para renombrar)`;
      row.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 flex-1 truncate">
          <span class="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm" style="background-color: ${def.hex}"></span>
          <span class="truncate">${escapeHtml(displayName)}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button class="btn-rename-tag opacity-0 group-hover:opacity-100 p-0.5 rounded text-[11px] transition-all ${
            isActive ? 'text-white/80 hover:text-white' : 'text-gnome-textDim hover:text-gnome-active'
          }" title="Renombrar categoría">✏️</button>
          <span class="text-[10px] font-mono ${isActive ? 'text-white/80' : 'text-gnome-textDim'}">${count}</span>
        </div>
      `;

      row.onclick = (e) => {
        if (e.target.closest('.btn-rename-tag')) return;
        if (state.activeTagFilter === colorKey) {
          state.activeTagFilter = null;
        } else {
          state.activeTagFilter = colorKey;
        }
        applyFilter();
        renderFileList();
        updateStatusBar();
        renderTagSidebar();
      };

      const btnRename = row.querySelector('.btn-rename-tag');
      if (btnRename) {
        btnRename.onclick = (e) => {
          e.stopPropagation();
          openRenameTagModal(colorKey);
        };
      }

      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openRenameTagModal(colorKey);
      };

      el.tagLinks.appendChild(row);
    }
  }

  let tagColorKeyToRename = null;
  function openRenameTagModal(colorKey) {
    tagColorKeyToRename = colorKey;
    const def = TAG_COLOR_DEFS[colorKey];
    if (el.renameTagDot && def) {
      el.renameTagDot.style.backgroundColor = def.hex;
    }
    if (el.inputRenameTagName) {
      el.inputRenameTagName.value = getTagDisplayName(colorKey);
    }
    if (el.modalRenameTag) {
      el.modalRenameTag.classList.remove('hidden');
      el.inputRenameTagName.focus();
      el.inputRenameTagName.select();
    }
  }

  function closeRenameTagModal() {
    if (el.modalRenameTag) {
      el.modalRenameTag.classList.add('hidden');
    }
    tagColorKeyToRename = null;
    if (el.fileList) el.fileList.focus();
  }

  function saveRenamedTag() {
    if (!tagColorKeyToRename || !el.inputRenameTagName) return;
    const newName = el.inputRenameTagName.value.trim();
    if (!customTagNames) customTagNames = {};
    if (newName) {
      customTagNames[tagColorKeyToRename] = newName;
    } else {
      delete customTagNames[tagColorKeyToRename];
    }
    try {
      localStorage.setItem('tron_custom_tag_names', JSON.stringify(customTagNames));
    } catch (err) {}
    closeRenameTagModal();
    renderTagSidebar();
    renderFileList();
    updateTagInputsInPreferences();
  }

  // Favorites Management
  function loadFavorites() {
    try {
      const saved = localStorage.getItem('tron_favorites');
      if (saved) {
        state.favorites = JSON.parse(saved);
      } else {
        state.favorites = [];
      }
    } catch (e) {
      state.favorites = [];
    }
    renderFavorites();
  }

  function saveFavorites() {
    try {
      localStorage.setItem('tron_favorites', JSON.stringify(state.favorites));
    } catch (e) {
      console.error(e);
    }
  }

  function addCurrentToFavorites() {
    if (!state.currentDirectory) return;
    const path = state.currentDirectory;
    if (state.favorites.some(f => f.path.toLowerCase() === path.toLowerCase())) {
      return;
    }
    const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
    state.favorites.push({ name, path });
    saveFavorites();
    renderFavorites();
  }

  function removeFavorite(path, e) {
    if (e) e.stopPropagation();
    state.favorites = state.favorites.filter(f => f.path.toLowerCase() !== path.toLowerCase());
    saveFavorites();
    renderFavorites();
  }

  function setupSidebarDropTarget(element, targetDirectory) {
    element.classList.add('drop-target');
    element.dataset.targetDir = targetDirectory;
  }

  // --- Renombrar Elementos (Archivos / Carpetas) ---
  let itemToRename = null;

  
  let batchRenameItems = [];
  let batchRenamePairs = [];
  let batchRenameMode = 'sequence'; // 'sequence' | 'replace'

  function openBatchRenameModal() {
    if (state.selectedItems.size > 0) {
      batchRenameItems = Array.from(state.selectedItems)
        .map(p => state.items.find(i => i.path === p))
        .filter(Boolean);
    } else if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
      batchRenameItems = [state.filteredItems[state.selectedIndex]];
    } else {
      batchRenameItems = [];
    }

    if (batchRenameItems.length === 0) return;

    batchRenameMode = 'sequence';
    switchBatchRenameTab('sequence');

    const firstItem = batchRenameItems[0];
    const dotIdx = firstItem.name.lastIndexOf('.');
    const defaultBase = dotIdx > 0 && !firstItem.is_directory ? firstItem.name.substring(0, dotIdx) : firstItem.name;
    if (el.inputBatchBaseName) {
      el.inputBatchBaseName.value = defaultBase;
    }
    if (el.chkBatchKeepOriginalName) el.chkBatchKeepOriginalName.checked = false;
    if (el.selectBatchSeparator) el.selectBatchSeparator.value = '_';
    if (el.inputBatchStartNum) el.inputBatchStartNum.value = '1';
    if (el.selectBatchDigits) el.selectBatchDigits.value = '2';
    if (el.chkBatchKeepExt) el.chkBatchKeepExt.checked = true;

    if (el.inputBatchSearch) el.inputBatchSearch.value = '';
    if (el.inputBatchReplace) el.inputBatchReplace.value = '';
    if (el.chkBatchRegex) el.chkBatchRegex.checked = false;

    updateBatchRenamePreview();
    if (el.modalBatchRename) el.modalBatchRename.classList.remove('hidden');
    if (el.inputBatchBaseName) {
      el.inputBatchBaseName.focus();
      el.inputBatchBaseName.select();
    }
  }

  function switchBatchRenameTab(mode) {
    batchRenameMode = mode;
    if (mode === 'sequence') {
      el.tabBatchSequence?.classList.add('border-gnome-active', 'text-white');
      el.tabBatchSequence?.classList.remove('border-transparent', 'text-gnome-textDim');
      el.tabBatchReplace?.classList.add('border-transparent', 'text-gnome-textDim');
      el.tabBatchReplace?.classList.remove('border-gnome-active', 'text-white');
      el.panelBatchSequence?.classList.remove('hidden');
      el.panelBatchReplace?.classList.add('hidden');
    } else {
      el.tabBatchReplace?.classList.add('border-gnome-active', 'text-white');
      el.tabBatchReplace?.classList.remove('border-transparent', 'text-gnome-textDim');
      el.tabBatchSequence?.classList.add('border-transparent', 'text-gnome-textDim');
      el.tabBatchSequence?.classList.remove('border-gnome-active', 'text-white');
      el.panelBatchReplace?.classList.remove('hidden');
      el.panelBatchSequence?.classList.add('hidden');
    }
    updateBatchRenamePreview();
  }

  function closeBatchRenameModal() {
    if (el.modalBatchRename) el.modalBatchRename.classList.add('hidden');
    el.fileList.focus();
  }

  function updateBatchRenamePreview() {
    batchRenamePairs = [];
    if (!el.batchRenamePreviewBody) return;
    el.batchRenamePreviewBody.innerHTML = '';

    if (batchRenameItems.length === 0) {
      if (el.batchRenameCount) el.batchRenameCount.textContent = '0';
      if (el.btnConfirmBatchRename) el.btnConfirmBatchRename.disabled = true;
      return;
    }

    if (batchRenameMode === 'sequence') {
      const baseNameInput = (el.inputBatchBaseName?.value || '').trim();
      const keepOriginal = el.chkBatchKeepOriginalName?.checked;
      const separator = el.selectBatchSeparator ? el.selectBatchSeparator.value : '_';
      const startNum = parseInt(el.inputBatchStartNum?.value || '1', 10) || 1;
      const digits = parseInt(el.selectBatchDigits?.value || '2', 10) || 2;
      const keepExt = el.chkBatchKeepExt ? el.chkBatchKeepExt.checked : true;

      batchRenameItems.forEach((item, idx) => {
        const seqNum = startNum + idx;
        const formattedSeq = String(seqNum).padStart(digits, '0');

        let ext = '';
        let origBase = item.name;
        const lastDot = item.name.lastIndexOf('.');
        if (lastDot > 0 && !item.is_directory) {
          origBase = item.name.substring(0, lastDot);
          ext = item.name.substring(lastDot + 1);
        }

        let newName = '';
        if (keepOriginal) {
          newName = `${origBase}${separator}${formattedSeq}`;
        } else {
          const base = baseNameInput || 'archivo';
          newName = `${base}${separator}${formattedSeq}`;
        }

        if (keepExt && ext) {
          newName += `.${ext}`;
        }

        const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
        const sep = isWindows ? '\\' : '/';
        const lastSlash = item.path.lastIndexOf(sep);
        const parentPath = item.path.substring(0, lastSlash + 1);
        const newPath = parentPath + newName;

        const isChanged = newName !== item.name;
        if (isChanged) {
          batchRenamePairs.push([item.path, newPath]);
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b border-gnome-border/30 hover:bg-gnome-hover/30';
        tr.innerHTML = `
          <td class="py-1 px-2 truncate max-w-[240px]" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
          <td class="py-1 px-2 truncate max-w-[240px] font-mono ${isChanged ? 'text-green-400 font-semibold' : 'text-gnome-textDim'}" title="${escapeHtml(newName)}">${escapeHtml(newName)}</td>
        `;
        el.batchRenamePreviewBody.appendChild(tr);
      });
    } else {
      const search = el.inputBatchSearch?.value || '';
      const replace = el.inputBatchReplace?.value || '';
      const useRegex = el.chkBatchRegex?.checked;

      let regex = null;
      if (useRegex && search) {
        try {
          regex = new RegExp(search, 'g');
        } catch (e) {
          el.batchRenamePreviewBody.innerHTML = '<tr><td colspan="2" class="text-red-400 p-2">Expresión regular inválida</td></tr>';
          if (el.batchRenameCount) el.batchRenameCount.textContent = '0';
          if (el.btnConfirmBatchRename) el.btnConfirmBatchRename.disabled = true;
          return;
        }
      }

      batchRenameItems.forEach(item => {
        let newName = item.name;
        if (search) {
          if (useRegex && regex) {
            newName = newName.replace(regex, replace);
          } else {
            newName = newName.split(search).join(replace);
          }
        }

        const isChanged = newName !== item.name;
        if (isChanged) {
          const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
          const sep = isWindows ? '\\' : '/';
          const lastSlash = item.path.lastIndexOf(sep);
          const parentPath = item.path.substring(0, lastSlash + 1);
          batchRenamePairs.push([item.path, parentPath + newName]);
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b border-gnome-border/30 hover:bg-gnome-hover/30';
        tr.innerHTML = `
          <td class="py-1 px-2 truncate max-w-[240px]" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
          <td class="py-1 px-2 truncate max-w-[240px] font-mono ${isChanged ? 'text-green-400 font-semibold' : 'text-gnome-textDim'}" title="${escapeHtml(newName)}">${escapeHtml(newName)}</td>
        `;
        el.batchRenamePreviewBody.appendChild(tr);
      });
    }

    if (el.batchRenameCount) el.batchRenameCount.textContent = batchRenamePairs.length;
    if (el.btnConfirmBatchRename) el.btnConfirmBatchRename.disabled = batchRenamePairs.length === 0;
  }

  async function confirmBatchRename() {
    if (batchRenamePairs.length === 0) return;
    try {
      await invoke('batch_rename', { renames: batchRenamePairs });
      closeBatchRenameModal();
      await reloadBothPanelsIfNeeded();
    } catch (err) {
      alert("Error en renombrado por lotes:\n" + err);
    }
  }

  function openRenameItemModal(item = null) {
    if (!item && state.selectedItems.size > 1) {
      openBatchRenameModal();
      return;
    }
    if (!item) {
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        item = state.filteredItems[state.selectedIndex];
      }
    }
    if (!item) return;
    itemToRename = item;
    if (el.inputRenameItemName) {
      el.inputRenameItemName.value = item.name;
    }
    if (el.modalRenameItem) {
      el.modalRenameItem.classList.remove('hidden');
      if (el.inputRenameItemName) {
        el.inputRenameItemName.focus();
        if (!item.is_directory && item.name.includes('.')) {
          const lastDot = item.name.lastIndexOf('.');
          if (lastDot > 0) {
            el.inputRenameItemName.setSelectionRange(0, lastDot);
          } else {
            el.inputRenameItemName.select();
          }
        } else {
          el.inputRenameItemName.select();
        }
      }
    }
  }

  function closeRenameItemModal() {
    if (el.modalRenameItem) {
      el.modalRenameItem.classList.add('hidden');
    }
    itemToRename = null;
    el.fileList.focus();
  }

  async function saveRenamedItem() {
    if (!itemToRename || !el.inputRenameItemName) return;
    const newName = el.inputRenameItemName.value.trim();
    if (!newName) return;
    if (newName === itemToRename.name) {
      closeRenameItemModal();
      return;
    }
    try {
      await invoke('rename_file_or_folder', {
        oldPath: itemToRename.path,
        newName: newName
      });
      closeRenameItemModal();
      await reloadBothPanelsIfNeeded();
      const idx = state.filteredItems.findIndex(i => i.name.toLowerCase() === newName.toLowerCase());
      if (idx >= 0) {
        setSelectionIndex(idx);
      }
    } catch (err) {
      alert('Error al renombrar: ' + err);
    }
  }

  let favoriteToRename = null;

  function openRenameFavoriteModal(favorite) {
    favoriteToRename = favorite;
    if (el.inputRenameFavName) {
      el.inputRenameFavName.value = favorite.name;
    }
    if (el.modalRenameFavorite) {
      el.modalRenameFavorite.classList.remove('hidden');
      el.inputRenameFavName.focus();
      el.inputRenameFavName.select();
    }
  }

  function closeRenameFavoriteModal() {
    if (el.modalRenameFavorite) {
      el.modalRenameFavorite.classList.add('hidden');
    }
    favoriteToRename = null;
    el.fileList.focus();
  }

  function saveRenamedFavorite() {
    if (!favoriteToRename || !el.inputRenameFavName) return;
    const newName = el.inputRenameFavName.value.trim();
    if (newName) {
      const idx = state.favorites.findIndex(f => f.path.toLowerCase() === favoriteToRename.path.toLowerCase());
      if (idx >= 0) {
        state.favorites[idx].name = newName;
        saveFavorites();
        renderFavorites();
      }
    }
    closeRenameFavoriteModal();
  }

  function renderFavorites() {
    el.favoriteLinks.innerHTML = '';
    if (state.favorites.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'text-[11px] text-gnome-textDim px-2 py-1 italic';
      emptyMsg.textContent = isMac ? 'Sin favoritos aún (Cmd+B)' : 'Sin favoritos aún (Ctrl+B)';
      el.favoriteLinks.appendChild(emptyMsg);
      return;
    }

    state.favorites.forEach((f, idx) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'group flex items-center justify-between px-2 py-1 rounded-md hover:bg-gnome-hover text-xs text-gnome-text transition-colors cursor-pointer select-none relative';
      itemRow.title = `${f.name} (${f.path})\nArrastra para reordenar o clic derecho para renombrar`;
      itemRow.draggable = true;
      itemRow.dataset.favIndex = String(idx);

      // Drag and Drop reordering for favorites
      itemRow.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.effectAllowed = 'move';
        itemRow.classList.add('opacity-40');
      });

      itemRow.addEventListener('dragend', () => {
        itemRow.classList.remove('opacity-40');
        document.querySelectorAll('#favoriteLinks > div').forEach(d => {
          d.classList.remove('border-t-2', 'border-b-2', 'border-gnome-active');
        });
      });

      itemRow.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = itemRow.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          itemRow.classList.add('border-t-2', 'border-gnome-active');
          itemRow.classList.remove('border-b-2');
        } else {
          itemRow.classList.add('border-b-2', 'border-gnome-active');
          itemRow.classList.remove('border-t-2');
        }
      });

      itemRow.addEventListener('dragleave', () => {
        itemRow.classList.remove('border-t-2', 'border-b-2', 'border-gnome-active');
      });

      itemRow.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        itemRow.classList.remove('border-t-2', 'border-b-2', 'border-gnome-active');
        const fromIdxStr = e.dataTransfer.getData('text/plain');
        if (!fromIdxStr && fromIdxStr !== '0') return;
        const fromIdx = parseInt(fromIdxStr, 10);
        if (isNaN(fromIdx) || fromIdx < 0 || fromIdx >= state.favorites.length) return;

        const rect = itemRow.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let toIdx = idx;
        if (e.clientY >= midY && fromIdx < idx) {
          toIdx = idx;
        } else if (e.clientY < midY && fromIdx > idx) {
          toIdx = idx;
        }

        if (fromIdx !== toIdx) {
          const [movedItem] = state.favorites.splice(fromIdx, 1);
          state.favorites.splice(toIdx, 0, movedItem);
          saveFavorites();
          renderFavorites();
        }
      });

      const leftPart = document.createElement('div');
      leftPart.className = 'flex items-center gap-2 min-w-0 flex-1 truncate';
      leftPart.innerHTML = `<span class="text-xs opacity-50 cursor-grab" title="Arrastrar para reordenar">⠿</span> <span class="ui-icon-box">${getUiIconHtml('favorite', '⭐')}</span> <span class="truncate">${escapeHtml(f.name)}</span>`;

      const rightPart = document.createElement('div');
      rightPart.className = 'flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity';

      // Reorder buttons (Move up / Move down)
      if (idx > 0) {
        const btnUp = document.createElement('button');
        btnUp.className = 'text-gnome-textDim hover:text-gnome-text text-[10px] px-1 py-0.5 leading-none';
        btnUp.title = 'Mover arriba';
        btnUp.textContent = '▲';
        btnUp.onclick = (e) => {
          e.stopPropagation();
          const temp = state.favorites[idx];
          state.favorites[idx] = state.favorites[idx - 1];
          state.favorites[idx - 1] = temp;
          saveFavorites();
          renderFavorites();
        };
        rightPart.appendChild(btnUp);
      }

      if (idx < state.favorites.length - 1) {
        const btnDown = document.createElement('button');
        btnDown.className = 'text-gnome-textDim hover:text-gnome-text text-[10px] px-1 py-0.5 leading-none';
        btnDown.title = 'Mover abajo';
        btnDown.textContent = '▼';
        btnDown.onclick = (e) => {
          e.stopPropagation();
          const temp = state.favorites[idx];
          state.favorites[idx] = state.favorites[idx + 1];
          state.favorites[idx + 1] = temp;
          saveFavorites();
          renderFavorites();
        };
        rightPart.appendChild(btnDown);
      }

      const btnEdit = document.createElement('button');
      btnEdit.className = 'text-gnome-textDim hover:text-gnome-active text-xs px-1';
      btnEdit.title = 'Renombrar favorito';
      btnEdit.textContent = '✏️';
      btnEdit.onclick = (e) => {
        e.stopPropagation();
        openRenameFavoriteModal(f);
      };

      const btnRemove = document.createElement('button');
      btnRemove.className = 'text-gnome-textDim hover:text-red-400 text-xs px-1';
      btnRemove.title = 'Quitar de favoritos';
      btnRemove.textContent = '✕';
      btnRemove.onclick = (e) => removeFavorite(f.path, e);

      rightPart.appendChild(btnEdit);
      rightPart.appendChild(btnRemove);

      itemRow.onclick = () => loadDirectory(f.path);
      // Right click context menu to rename
      itemRow.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openRenameFavoriteModal(f);
      });

      itemRow.appendChild(leftPart);
      itemRow.appendChild(rightPart);

      setupSidebarDropTarget(itemRow, f.path);
      el.favoriteLinks.appendChild(itemRow);
    });
  }

  // Sidebar Loading (Drives & Quick Links with real absolute paths)
  async function loadSidebar() {
    // 1. User Places with guaranteed absolute paths from Rust backend
    try {
      const places = await invoke('get_user_places') || [];
      const homePlace = places.find(p => p.id === 'home') || places[0];
      if (homePlace && homePlace.path) {
        state.userHomeDir = homePlace.path;
      }
      el.quickLinks.innerHTML = '';
      places.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gnome-hover text-xs text-gnome-text text-left transition-colors';
        const placeKey = getPlaceIconKey(p.id);
        const iconHtml = getUiIconHtml(placeKey, p.icon || '📁');
        btn.innerHTML = `<span class="ui-icon-box">${iconHtml}</span> <span class="truncate">${escapeHtml(p.name)}</span>`;
        btn.title = p.path;
        btn.onclick = () => loadDirectory(p.path);
        setupSidebarDropTarget(btn, p.path);
        el.quickLinks.appendChild(btn);
      });
    } catch (e) {
      console.warn('Error al obtener lugares de usuario:', e);
    }

    // 2. Drives
    try {
      const drives = await invoke('get_system_drives') || [];
      el.driveLinks.innerHTML = '';
      drives.forEach(d => {
        const itemRow = document.createElement('div');
        itemRow.className = 'group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-gnome-hover text-xs text-gnome-text cursor-pointer transition-colors';
        const iconHtml = getUiIconHtml('drive', '💽');

        let ejectHtml = '';
        if (d.is_ejectable) {
          ejectHtml = `<button class="btn-eject-drive opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gnome-border text-xs text-gnome-textDim hover:text-gnome-text transition-all ml-1" title="Expulsar volumen">⏏️</button>`;
        }

        itemRow.innerHTML = `
          <div class="flex items-center gap-2 min-w-0 flex-1 truncate">
            <span class="ui-icon-box">${iconHtml}</span>
            <span class="truncate">${escapeHtml(d.name)}</span>
          </div>
          ${ejectHtml}
        `;

        itemRow.title = d.path;
        itemRow.onclick = (e) => {
          if (e.target.closest('.btn-eject-drive')) return;
          loadDirectory(d.path);
        };

        if (d.is_ejectable) {
          const ejectBtn = itemRow.querySelector('.btn-eject-drive');
          if (ejectBtn) {
            ejectBtn.onclick = async (e) => {
              e.stopPropagation();
              try {
                const msg = await invoke('eject_volume', { path: d.path });
                showToast(msg || 'Volumen expulsado con éxito', 'success');
                loadSidebar();
              } catch (err) {
                showToast('Error al expulsar: ' + err, 'error');
              }
            };
          }
        }

        setupSidebarDropTarget(itemRow, d.path);
        el.driveLinks.appendChild(itemRow);
      });
    } catch (e) {
      console.warn('Error al obtener unidades:', e);
    }

    // 3. Favorites
    loadFavorites();

    // 4. Frequent Locations
    renderFrequentLinks();

    // 5. File Tags & Tabs
    renderTagSidebar();
    renderTabs();
  }

  // Setup Menu Dropdowns (Auto-open on hover once active)
  let isAnyMenuOpen = false;

  function setupMenus() {
    const dropdowns = document.querySelectorAll('.menu-dropdown');
    dropdowns.forEach(dd => {
      const btn = dd.querySelector('.menu-btn');
      const content = dd.querySelector('.menu-content');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = !content.classList.contains('hidden');
        closeAllMenus();
        if (!wasOpen) {
          content.classList.remove('hidden');
          isAnyMenuOpen = true;
        }
      });

      btn.addEventListener('mouseenter', () => {
        if (isAnyMenuOpen) {
          closeAllMenus(false); // don't reset isAnyMenuOpen flag
          content.classList.remove('hidden');
          isAnyMenuOpen = true;
        }
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      closeAllMenus();
    });
  }

  function closeAllMenus(resetFlag = true) {
    document.querySelectorAll('.menu-content').forEach(c => c.classList.add('hidden'));
    if (resetFlag) isAnyMenuOpen = false;
  }

  // Initialization & Event Listeners
  function init() {
    adaptShortcutsForMac();
    window.addEventListener('keydown', handleGlobalKeyDown, true);

    // Navigation bar
    el.btnBack.onclick = goBack;
    el.btnForward.onclick = goForward;
    if (el.btnParentDir) el.btnParentDir.onclick = goUp;
    el.btnRefresh.onclick = () => reloadBothPanelsIfNeeded();

    // QuickView
    el.btnQvClose.onclick = closeQuickView;
    el.btnQvDelete.onclick = deleteCurrentItem;
    if (el.btnQvOpenDefault) {
      el.btnQvOpenDefault.onclick = () => {
        if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          activateItem(state.filteredItems[state.selectedIndex]);
        }
      };
    }
    if (el.btnQvOpenEditor) {
      el.btnQvOpenEditor.onclick = () => {
        if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          const item = state.filteredItems[state.selectedIndex];
          openInTextEditor(item.path);
        }
      };
    }

    // Action Bar buttons
    if (el.btnActionTerminal) {
      el.btnActionTerminal.onclick = openCurrentTerminal;
    }
    if (el.btnActionEdit) {
      el.btnActionEdit.onclick = () => {
        let targetPath = state.currentDirectory;
        if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          targetPath = state.filteredItems[state.selectedIndex].path;
        }
        if (targetPath) {
          openInTextEditor(targetPath);
        }
      };
    }
    el.btnActionNewFile.onclick = openNewFileModal;
    el.btnActionNewFolder.onclick = openNewFolderModal;
    el.btnActionCut.onclick = cutSelectedItems;
    el.btnActionCopy.onclick = copySelectedItems;
    el.btnActionPaste.onclick = pasteClipboardItems;
    el.btnActionDelete.onclick = deleteCurrentItem;
    el.btnActionQuickView.onclick = openQuickView;
    if (el.btnToggleSplitView) el.btnToggleSplitView.onclick = toggleSplitView;
    if (el.btnToggleMillerView) el.btnToggleMillerView.onclick = toggleMillerView;

    // PdfTools Event Listeners
    if (el.ctxMenuPdfTools) {
      el.ctxMenuPdfTools.onmouseenter = openPdfToolsSubmenu;
    }
    if (el.btnCtxPdfToolsTrigger) {
      el.btnCtxPdfToolsTrigger.onclick = (e) => { e.stopPropagation(); openPdfToolsSubmenu(); };
    }
    if (el.ctxMenuPdfToolsSub && el.ctxMenuPdfTools) {
      let subTimer = null;
      el.ctxMenuPdfTools.addEventListener('mouseleave', () => {
        subTimer = setTimeout(() => {
          if (el.ctxMenuPdfToolsSub && !el.ctxMenuPdfToolsSub.matches(':hover')) {
            closePdfToolsSubmenu();
          }
        }, 150);
      });
      el.ctxMenuPdfToolsSub.addEventListener('mouseenter', () => {
        if (subTimer) clearTimeout(subTimer);
      });
      el.ctxMenuPdfToolsSub.addEventListener('mouseleave', () => {
        closePdfToolsSubmenu();
      });
    }

    if (el.ctxPdfToImages) el.ctxPdfToImages.onclick = openPdfToImagesModal;
    if (el.btnClosePdfToImagesModal) el.btnClosePdfToImagesModal.onclick = closePdfToImagesModal;
    if (el.btnCancelPdfToImages) el.btnCancelPdfToImages.onclick = closePdfToImagesModal;
    if (el.btnConfirmPdfToImages) el.btnConfirmPdfToImages.onclick = confirmPdfToImages;

    if (el.ctxPdfOptimize) el.ctxPdfOptimize.onclick = openPdfOptimizeModal;
    if (el.btnClosePdfOptimizeModal) el.btnClosePdfOptimizeModal.onclick = closePdfOptimizeModal;
    if (el.btnCancelPdfOptimize) el.btnCancelPdfOptimize.onclick = closePdfOptimizeModal;
    if (el.btnConfirmPdfOptimize) el.btnConfirmPdfOptimize.onclick = confirmPdfOptimize;

    if (el.ctxPdfSplit) el.ctxPdfSplit.onclick = actionPdfSplit;
    if (el.ctxPdfRotate) el.ctxPdfRotate.onclick = actionPdfRotate;

    if (el.ctxPdfExtractText) el.ctxPdfExtractText.onclick = openPdfExtractTextModal;
    if (el.btnClosePdfExtractTextModal) el.btnClosePdfExtractTextModal.onclick = closePdfExtractTextModal;
    if (el.btnCancelPdfExtractText) el.btnCancelPdfExtractText.onclick = closePdfExtractTextModal;
    if (el.btnConfirmPdfExtractText) el.btnConfirmPdfExtractText.onclick = confirmPdfExtractText;

    if (el.ctxPdfImagesToPdf) el.ctxPdfImagesToPdf.onclick = actionPdfImagesToPdf;

    if (el.ctxPdfMerge) el.ctxPdfMerge.onclick = openPdfMergeModal;
    if (el.btnClosePdfMergeModal) el.btnClosePdfMergeModal.onclick = closePdfMergeModal;
    if (el.btnCancelPdfMerge) el.btnCancelPdfMerge.onclick = closePdfMergeModal;
    if (el.btnConfirmPdfMerge) el.btnConfirmPdfMerge.onclick = confirmPdfMerge;

    document.querySelectorAll('input[name="pdfToImagesPagesMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (el.inputPdfToImagesRange) {
          el.inputPdfToImagesRange.disabled = e.target.value !== 'range';
          if (e.target.value === 'range') el.inputPdfToImagesRange.focus();
        }
      });
    });

    if (el.sliderPdfOptimizeQuality) {
      el.sliderPdfOptimizeQuality.addEventListener('input', (e) => {
        const val = e.target.value;
        if (el.pdfOptimizeQualityVal) el.pdfOptimizeQualityVal.textContent = val + '%';
        if (el.pdfOptimizeEstimatedSize && pdfOptimizeTarget) {
          const ratio = (val / 100) * 0.75;
          const est = Math.round((pdfOptimizeTarget.size || 0) * ratio);
          el.pdfOptimizeEstimatedSize.textContent = '~' + formatSize(est);
        }
      });
    }

    if (el.millerParentHeader) el.millerParentHeader.onclick = () => goUp(0);
    if (el.menuToggleMillerView) el.menuToggleMillerView.onclick = () => { closeAllMenus(); toggleMillerView(); };

    // Window Controls (Minimizar, Maximizar/Restaurar, Cerrar)
    if (el.btnWinMinimize) {
      el.btnWinMinimize.onclick = () => invoke('window_minimize');
    }
    if (el.btnWinMaximize) {
      el.btnWinMaximize.onclick = async () => {
        await invoke('window_toggle_maximize');
        setTimeout(updateMaximizeIcon, 80);
      };
    }
    if (el.btnWinClose) {
      el.btnWinClose.onclick = () => invoke('window_close');
    }

    async function updateMaximizeIcon() {
      try {
        const isMax = await invoke('is_window_maximized');
        if (el.iconWinMaximize && el.iconWinRestore) {
          if (isMax) {
            el.iconWinMaximize.classList.add('hidden');
            el.iconWinRestore.classList.remove('hidden');
          } else {
            el.iconWinMaximize.classList.remove('hidden');
            el.iconWinRestore.classList.add('hidden');
          }
        }
      } catch (e) {}
    }
    window.addEventListener('resize', updateMaximizeIcon);
    setTimeout(updateMaximizeIcon, 250);


    // Sidebar buttons
    el.btnAddCurrentFav.onclick = addCurrentToFavorites;
    el.btnConnectNetwork.onclick = openNetworkModal;
    el.btnOpenNetworkDialog.onclick = openNetworkModal;

    // Menus Actions
    setupMenus();
    el.menuNewFile.onclick = () => { closeAllMenus(); openNewFileModal(); };
    el.menuNewFolder.onclick = () => { closeAllMenus(); openNewFolderModal(); };
    if (el.menuRename) el.menuRename.onclick = () => { closeAllMenus(); openRenameItemModal(); };
    el.menuOpenDefault.onclick = () => {
      closeAllMenus();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        activateItem(state.filteredItems[state.selectedIndex]);
      }
    };
    if (el.menuOpenWith) el.menuOpenWith.onclick = () => { closeAllMenus(); openOpenWithModal(); };
    if (el.menuShowInExplorer) el.menuShowInExplorer.onclick = () => { closeAllMenus(); showInSystemExplorer(); };
    if (el.menuCompress) el.menuCompress.onclick = () => { closeAllMenus(); openCompressModal(); };
    if (el.menuProperties) el.menuProperties.onclick = () => { closeAllMenus(); showItemProperties(); };
    el.menuDelete.onclick = () => { closeAllMenus(); deleteCurrentItem(); };
    el.menuAddFavorite.onclick = () => { closeAllMenus(); addCurrentToFavorites(); };
    el.menuCut.onclick = () => { closeAllMenus(); cutSelectedItems(); };
    el.menuCopy.onclick = () => { closeAllMenus(); copySelectedItems(); };
    el.menuPaste.onclick = () => { closeAllMenus(); pasteClipboardItems(); };
    el.menuSelectAll.onclick = () => {
      closeAllMenus();
      state.selectedItems.clear();
      state.filteredItems.forEach(i => state.selectedItems.add(i.path));
      renderFileList();
      updateStatusBar();
    };
    el.menuQuickView.onclick = () => { closeAllMenus(); openQuickView(); };
    if (el.menuToggleSplitView) el.menuToggleSplitView.onclick = () => { closeAllMenus(); toggleSplitView(); };
    el.menuRefresh.onclick = () => { closeAllMenus(); reloadBothPanelsIfNeeded(); };
    el.menuShortcuts.onclick = () => { closeAllMenus(); openHelpModal(); };
    el.menuAbout.onclick = () => { closeAllMenus(); openAboutModal(); };

    // Modals events
    el.btnCloseNewFileModal.onclick = closeNewFileModal;
    el.btnCancelNewFile.onclick = closeNewFileModal;
    el.btnConfirmNewFile.onclick = confirmNewFile;
    el.inputNewFileName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmNewFile();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeNewFileModal();
      }
    });

    // Quick extension buttons in New File modal
    document.querySelectorAll('.ext-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const ext = tag.dataset.ext;
        let current = el.inputNewFileName.value.trim();
        const lastDot = current.lastIndexOf('.');
        if (lastDot > 0) {
          current = current.substring(0, lastDot);
        }
        el.inputNewFileName.value = (current || 'nuevo_archivo') + ext;
        el.inputNewFileName.focus();
      });
    });

    el.btnCloseNewFolderModal.onclick = closeNewFolderModal;
    el.btnCancelNewFolder.onclick = closeNewFolderModal;
    el.btnConfirmNewFolder.onclick = confirmNewFolder;
    el.inputNewFolderName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmNewFolder();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeNewFolderModal();
      }
    });

    el.btnCloseNetworkModal.onclick = closeNetworkModal;
    el.btnCancelNetwork.onclick = closeNetworkModal;
    el.btnConfirmNetwork.onclick = confirmNetwork;
    el.inputNetworkPath.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmNetwork();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeNetworkModal();
      }
    });

    el.btnCloseHelpModal.onclick = closeHelpModal;
    el.btnConfirmHelp.onclick = closeHelpModal;

    // About modal wiring
    if (el.btnCloseAboutModal) el.btnCloseAboutModal.onclick = closeAboutModal;
    if (el.btnConfirmAbout) el.btnConfirmAbout.onclick = closeAboutModal;
    if (el.linkAboutGithub) {
      el.linkAboutGithub.onclick = (e) => {
        e.preventDefault();
        invoke('open_file_default', { path: 'https://github.com/pedroredond0/tron' }).catch(console.error);
      };
    }
    if (el.btnCheckUpdates) el.btnCheckUpdates.onclick = handleCheckForUpdates;
    if (el.btnApplyUpdate) el.btnApplyUpdate.onclick = handleApplyUpdate;
    if (el.btnRestartApp) el.btnRestartApp.onclick = handleRestartApp;
    if (el.btnDownloadManual) {
      el.btnDownloadManual.onclick = (e) => {
        e.preventDefault();
        if (el.btnDownloadManual.href && el.btnDownloadManual.href !== '#') {
          invoke('open_file_default', { path: el.btnDownloadManual.href }).catch(console.error);
        }
      };
    }

    // Search bar
    el.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery) {
        el.btnClearSearch.classList.remove('hidden');
      } else {
        el.btnClearSearch.classList.add('hidden');
      }
      triggerSearch();
    });

    el.btnClearSearch.onclick = () => {
      el.searchInput.value = '';
      state.searchQuery = '';
      el.btnClearSearch.classList.add('hidden');
      triggerSearch();
      el.fileList.focus();
    };

    // Close modal on click outside card
    el.quickViewModal.addEventListener('click', (e) => {
      if (e.target === el.quickViewModal) {
        closeQuickView();
      }
    });

    // Close popup dialogs on backdrop click
    [el.modalNewFile, el.modalNewFolder, el.modalNetwork, el.modalHelp, el.modalAppearance, el.modalRenameFavorite, el.modalRenameTag, el.modalRenameItem, el.modalConfirmExit, el.modalAbout, el.modalOpenWith, el.modalCompress, el.modalArchiveView, el.modalPdfToImages, el.modalPdfOptimize, el.modalPdfMerge, el.modalPdfExtractText].forEach(m => {
      if (m) {
        m.addEventListener('click', (e) => {
          if (e.target === m) m.classList.add('hidden');
        });
      }
    });

    // Open With Modal Wiring
    if (el.btnCloseOpenWithModal) el.btnCloseOpenWithModal.onclick = closeOpenWithModal;
    if (el.btnCancelOpenWith) el.btnCancelOpenWith.onclick = closeOpenWithModal;
    if (el.btnLaunchCustomApp) el.btnLaunchCustomApp.onclick = launchCustomOpenWith;
    if (el.btnOpenWithSystemDialog) el.btnOpenWithSystemDialog.onclick = launchSystemOpenWithDialog;
    if (el.inputOpenWithApp) {
      el.inputOpenWithApp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          launchCustomOpenWith();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeOpenWithModal();
        }
      });
    }

    // Compress Modal Wiring
    if (el.btnCloseCompressModal) el.btnCloseCompressModal.onclick = closeCompressModal;
    if (el.btnCancelCompress) el.btnCancelCompress.onclick = closeCompressModal;
    if (el.btnConfirmCompress) el.btnConfirmCompress.onclick = confirmCompress;
    if (el.inputCompressName) {
      el.inputCompressName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmCompress();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeCompressModal();
        }
      });
    }

    // Archive View Modal Wiring
    if (el.btnCloseArchiveViewModal) el.btnCloseArchiveViewModal.onclick = closeArchiveViewModal;
    if (el.btnArchiveClose) el.btnArchiveClose.onclick = closeArchiveViewModal;
    if (el.inputArchiveFilter) {
      el.inputArchiveFilter.addEventListener('input', renderArchiveEntries);
      el.inputArchiveFilter.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeArchiveViewModal();
        }
      });
    }
    if (el.btnArchiveExtractAll) {
      el.btnArchiveExtractAll.onclick = () => {
        if (currentArchiveItem) {
          const item = currentArchiveItem;
          closeArchiveViewModal();
          extractArchiveHere(item);
        }
      };
    }

    // Rename Item Modal Wiring
    
    if (el.btnCloseBatchRenameModal) el.btnCloseBatchRenameModal.onclick = closeBatchRenameModal;
    if (el.btnCancelBatchRename) el.btnCancelBatchRename.onclick = closeBatchRenameModal;
    if (el.btnConfirmBatchRename) el.btnConfirmBatchRename.onclick = confirmBatchRename;

    if (el.tabBatchSequence) el.tabBatchSequence.onclick = () => switchBatchRenameTab('sequence');
    if (el.tabBatchReplace) el.tabBatchReplace.onclick = () => switchBatchRenameTab('replace');

    if (el.inputBatchBaseName) {
      el.inputBatchBaseName.addEventListener('input', updateBatchRenamePreview);
      el.inputBatchBaseName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmBatchRename();
        else if (e.key === 'Escape') closeBatchRenameModal();
      });
    }
    if (el.chkBatchKeepOriginalName) el.chkBatchKeepOriginalName.addEventListener('change', updateBatchRenamePreview);
    if (el.selectBatchSeparator) el.selectBatchSeparator.addEventListener('change', updateBatchRenamePreview);
    if (el.inputBatchStartNum) el.inputBatchStartNum.addEventListener('input', updateBatchRenamePreview);
    if (el.selectBatchDigits) el.selectBatchDigits.addEventListener('change', updateBatchRenamePreview);
    if (el.chkBatchKeepExt) el.chkBatchKeepExt.addEventListener('change', updateBatchRenamePreview);

    if (el.inputBatchSearch) {
      el.inputBatchSearch.addEventListener('input', updateBatchRenamePreview);
      el.inputBatchReplace.addEventListener('input', updateBatchRenamePreview);
      if (el.chkBatchRegex) el.chkBatchRegex.addEventListener('change', updateBatchRenamePreview);
      
      [el.inputBatchSearch, el.inputBatchReplace].forEach(input => {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') confirmBatchRename();
          else if (e.key === 'Escape') closeBatchRenameModal();
        });
      });
    }

    if (el.btnCloseRenameItemModal) el.btnCloseRenameItemModal.onclick = closeRenameItemModal;
    if (el.btnCancelRenameItem) el.btnCancelRenameItem.onclick = closeRenameItemModal;
    if (el.btnConfirmRenameItem) el.btnConfirmRenameItem.onclick = saveRenamedItem;
    if (el.inputRenameItemName) {
      el.inputRenameItemName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          saveRenamedItem();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeRenameItemModal();
        }
      });
    }

    // Rename Favorite Modal Wiring
    if (el.btnCloseRenameFavModal) el.btnCloseRenameFavModal.onclick = closeRenameFavoriteModal;
    if (el.btnCancelRenameFav) el.btnCancelRenameFav.onclick = closeRenameFavoriteModal;
    if (el.btnConfirmRenameFav) el.btnConfirmRenameFav.onclick = saveRenamedFavorite;
    if (el.inputRenameFavName) {
      el.inputRenameFavName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          saveRenamedFavorite();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeRenameFavoriteModal();
        }
      });
    }

    // Rename Color Tag Modal Wiring
    if (el.btnCloseRenameTagModal) el.btnCloseRenameTagModal.onclick = closeRenameTagModal;
    if (el.btnCancelRenameTag) el.btnCancelRenameTag.onclick = closeRenameTagModal;
    if (el.btnConfirmRenameTag) el.btnConfirmRenameTag.onclick = saveRenamedTag;
    if (el.inputRenameTagName) {
      el.inputRenameTagName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          saveRenamedTag();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeRenameTagModal();
        }
      });
    }

    // Drives Refresh Button Wiring
    if (el.btnRefreshDrives) {
      el.btnRefreshDrives.onclick = () => {
        loadSidebar();
        showToast('Unidades actualizadas', 'info');
      };
    }

    // Appearance Modal Wiring
    if (el.btnOpenAppearance) el.btnOpenAppearance.onclick = openAppearanceModal;
    if (el.menuAppearance) el.menuAppearance.onclick = () => { closeAllMenus(); openAppearanceModal(); };
    if (el.btnCloseAppearanceModal) el.btnCloseAppearanceModal.onclick = closeAppearanceModal;
    if (el.btnCancelAppearance) el.btnCancelAppearance.onclick = () => {
      // Revert live preview if canceled
      loadAppearanceSettings();
      closeAppearanceModal();
    };
    if (el.btnConfirmAppearance) el.btnConfirmAppearance.onclick = saveAppearanceSettings;
    if (el.chkShowMenuBar) {
      el.chkShowMenuBar.onchange = (e) => {
        state.showMenuBar = e.target.checked;
        localStorage.setItem('tron_show_menu_bar', state.showMenuBar ? 'true' : 'false');
        applyMenuBarVisibility();
      };
    }
    if (el.chkPrefRecursiveTags) {
      el.chkPrefRecursiveTags.onchange = (e) => {
        state.recursiveTagSearch = e.target.checked;
        localStorage.setItem('tron_recursive_tag_search', state.recursiveTagSearch ? 'true' : 'false');
        renderTagSidebar();
        if (state.activeTagFilter) {
          applyFilter();
          renderFileList();
          updateStatusBar();
        }
      };
    }
    if (el.menuToggleMenuBar) {
      el.menuToggleMenuBar.onclick = () => {
        closeAllMenus();
        toggleMenuBar();
      };
    }

    // Preferences Tabs Switching
    const prefTabButtons = document.querySelectorAll('.pref-tab-btn');
    const prefTabPanels = {
      tabThemes: document.getElementById('panelThemes'),
      tabTypography: document.getElementById('panelTypography'),
      tabFiles: document.getElementById('panelFiles'),
      tabTags: document.getElementById('panelTags'),
      tabTools: document.getElementById('panelTools'),
      tabExternalApps: document.getElementById('panelExternalApps')
    };
    prefTabButtons.forEach(btn => {
      btn.onclick = () => {
        prefTabButtons.forEach(b => {
          b.classList.remove('border-gnome-active', 'bg-gnome-active/15', 'text-gnome-active');
          b.classList.add('border-transparent', 'text-gnome-textDim');
        });
        btn.classList.remove('border-transparent', 'text-gnome-textDim');
        btn.classList.add('border-gnome-active', 'bg-gnome-active/15', 'text-gnome-active');

        const targetId = btn.dataset.tab;
        Object.keys(prefTabPanels).forEach(k => {
          if (prefTabPanels[k]) {
            if (k === targetId) prefTabPanels[k].classList.remove('hidden');
            else prefTabPanels[k].classList.add('hidden');
          }
        });
      };
    });

    if (el.btnResetExternalApps) {
      el.btnResetExternalApps.onclick = () => {
        localStorage.removeItem('tron_external_apps_config');
        state.externalAppsConfig = null;
        renderExternalAppsConfigUI();
      };
    }

    if (el.rangeUiScale) {
      el.rangeUiScale.addEventListener('input', (e) => {
        const val = e.target.value;
        updateUiScaleLabel(val);
        // Live preview scale in real time while dragging slider
        document.documentElement.style.setProperty('--app-ui-scale', `${val}px`);
        document.documentElement.style.setProperty('--app-ui-scale-num', val);
      });
    }

    if (el.selectTextEditor) {
      el.selectTextEditor.addEventListener('change', (e) => {
        if (el.customEditorContainer) {
          if (e.target.value === 'custom') {
            el.customEditorContainer.classList.remove('hidden');
          } else {
            el.customEditorContainer.classList.add('hidden');
          }
        }
      });
    }

    if (el.selectTerminalApp) {
      el.selectTerminalApp.addEventListener('change', (e) => {
        if (el.customTerminalContainer) {
          if (e.target.value === 'custom') {
            el.customTerminalContainer.classList.remove('hidden');
          } else {
            el.customTerminalContainer.classList.add('hidden');
          }
        }
      });
    }

    if (el.chkMonochromeIcons) {
      el.chkMonochromeIcons.addEventListener('change', (e) => {
        if (e.target.checked) {
          document.documentElement.setAttribute('data-monochrome-icons', 'true');
        } else {
          document.documentElement.removeAttribute('data-monochrome-icons');
        }
      });
    }

    if (el.selectIconPack) {
      el.selectIconPack.addEventListener('change', (e) => {
        state.iconPack = e.target.value;
        updateToolbarIcons();
        loadSidebar();
        renderFileList();
      });
    }

    document.querySelectorAll('input[name="density"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        let rowPadding = '6px';
        let iconSize = '28px';
        if (e.target.value === 'compact') {
          rowPadding = '2px';
          iconSize = '20px';
        } else if (e.target.value === 'spacious') {
          rowPadding = '12px';
          iconSize = '40px';
        }
        document.documentElement.style.setProperty('--app-row-padding', rowPadding);
        document.documentElement.style.setProperty('--app-icon-size', iconSize);
        renderFileList();
      });
    });

    // Sort Column Headers Wiring - Panel A
    if (elPanels[0].sortHeaderName) elPanels[0].sortHeaderName.onclick = () => setSort('name', 0);
    if (elPanels[0].sortHeaderType) elPanels[0].sortHeaderType.onclick = () => setSort('type', 0);
    if (elPanels[0].sortHeaderSize) elPanels[0].sortHeaderSize.onclick = () => setSort('size', 0);
    if (elPanels[0].sortHeaderDate) elPanels[0].sortHeaderDate.onclick = () => setSort('date', 0);

    // Sort Column Headers Wiring - Panel B
    if (elPanels[1].sortHeaderName) elPanels[1].sortHeaderName.onclick = () => setSort('name', 1);
    if (elPanels[1].sortHeaderType) elPanels[1].sortHeaderType.onclick = () => setSort('type', 1);
    if (elPanels[1].sortHeaderSize) elPanels[1].sortHeaderSize.onclick = () => setSort('size', 1);
    if (elPanels[1].sortHeaderDate) elPanels[1].sortHeaderDate.onclick = () => setSort('date', 1);

    // File Context Menu Wiring
    if (el.ctxMenuOpen) {
      el.ctxMenuOpen.onclick = () => {
        closeFileContextMenu();
        if (state.contextTargetItem) {
          activateItem(state.contextTargetItem);
        } else if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          activateItem(state.filteredItems[state.selectedIndex]);
        }
      };
    }
    if (el.ctxMenuOpenWith) {
      el.ctxMenuOpenWith.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        openOpenWithModal(item);
      };
    }
    if (el.ctxMenuQuickView) {
      el.ctxMenuQuickView.onclick = () => {
        closeFileContextMenu();
        openQuickView();
      };
    }
    if (el.ctxMenuOpenEditor) {
      el.ctxMenuOpenEditor.onclick = () => {
        closeFileContextMenu();
        const item = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        if (item) {
          openInTextEditor(item.path);
        }
      };
    }
    if (el.ctxMenuShowInExplorer) {
      el.ctxMenuShowInExplorer.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        showInSystemExplorer(item);
      };
    }
    if (el.ctxMenuCopyPath) {
      el.ctxMenuCopyPath.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        if (item) copyToClipboard('"' + item.path + '"');
      };
    }
    if (el.ctxMenuCopyPosix) {
      el.ctxMenuCopyPosix.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        if (item) copyToClipboard('"' + getPosixPath(item.path) + '"');
      };
    }
    if (el.ctxMenuCopyName) {
      el.ctxMenuCopyName.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        if (item) copyToClipboard(item.name);
      };
    }
    if (el.ctxMenuExtractHere) {
      el.ctxMenuExtractHere.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        extractArchiveHere(item);
      };
    }
    if (el.ctxMenuExtractToFolder) {
      el.ctxMenuExtractToFolder.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        extractArchiveToSubfolder(item);
      };
    }
    if (el.ctxMenuArchiveViewContent) {
      el.ctxMenuArchiveViewContent.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        openArchiveViewModal(item);
      };
    }
    if (el.ctxMenuCompress) {
      el.ctxMenuCompress.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        openCompressModal(item);
      };
    }
    if (el.ctxMenuRename) {
      el.ctxMenuRename.onclick = () => {
        const item = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        closeFileContextMenu();
        if (state.selectedItems.size > 1) {
          openBatchRenameModal();
        } else if (item) {
          openRenameItemModal(item);
        }
      };
    }
    if (el.ctxMenuBatchRename) {
      el.ctxMenuBatchRename.onclick = () => {
        closeFileContextMenu();
        openBatchRenameModal();
      };
    }
    if (el.ctxMenuCut) {
      el.ctxMenuCut.onclick = () => {
        closeFileContextMenu();
        cutSelectedItems();
      };
    }
    if (el.ctxMenuCopy) {
      el.ctxMenuCopy.onclick = () => {
        closeFileContextMenu();
        copySelectedItems();
      };
    }
    if (el.ctxMenuDuplicate) {
      el.ctxMenuDuplicate.onclick = () => {
        const target = state.contextTargetItem;
        closeFileContextMenu();
        duplicateSelectedItem(target);
      };
    }
    // Color Tags Context Menu Buttons
    document.querySelectorAll('.tag-color-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const color = btn.dataset.color;
        const target = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        if (target) {
          if (state.selectedItems.size > 1) {
            state.selectedItems.forEach(p => toggleItemTag(p, color));
          } else {
            toggleItemTag(target.path, color);
          }
          renderFileList();
          renderTagSidebar();
        }
        closeFileContextMenu();
      };
    });

    if (el.ctxMenuClearTags) {
      el.ctxMenuClearTags.onclick = (e) => {
        e.stopPropagation();
        const target = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        if (target) {
          if (state.selectedItems.size > 1) {
            state.selectedItems.forEach(p => clearItemTags(p));
          } else {
            clearItemTags(target.path);
          }
          renderFileList();
          renderTagSidebar();
        }
        closeFileContextMenu();
      };
    }

    if (el.btnClearActiveTagFilter) {
      el.btnClearActiveTagFilter.onclick = () => {
        state.activeTagFilter = null;
        applyFilter();
        renderFileList();
        updateStatusBar();
        renderTagSidebar();
      };
    }

    if (el.btnNewTab) {
      el.btnNewTab.onclick = () => createTab();
    }

    if (el.ctxMenuAddFavorite) {
      el.ctxMenuAddFavorite.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        if (item && item.is_directory) {
          if (!state.favorites.some(f => f.path.toLowerCase() === item.path.toLowerCase())) {
            state.favorites.push({ name: item.name, path: item.path });
            saveFavorites();
            renderFavorites();
          }
        } else {
          addCurrentToFavorites();
        }
      };
    }
    if (el.ctxMenuDelete) {
      el.ctxMenuDelete.onclick = () => {
        closeFileContextMenu();
        deleteCurrentItem();
      };
    }
    if (el.ctxMenuProperties) {
      el.ctxMenuProperties.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        showItemProperties(item);
      };
    }

    // Recursive Search Checkbox (Enabled by default)
    if (el.chkRecursiveSearch) {
      const savedRec = localStorage.getItem('tron_recursive_search');
      el.chkRecursiveSearch.checked = savedRec !== 'false';
      el.chkRecursiveSearch.addEventListener('change', () => {
        localStorage.setItem('tron_recursive_search', el.chkRecursiveSearch.checked ? 'true' : 'false');
        if (state.searchQuery) {
          triggerSearch();
        }
      });
    }

    // Transfer Progress Bar & Details Card Wiring
    if (el.pasteProgressContainer) {
      el.pasteProgressContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.pasteDetailsCard) {
          el.pasteDetailsCard.classList.toggle('hidden');
        }
      });
    }
    if (el.btnClosePasteDetails) {
      el.btnClosePasteDetails.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.pasteDetailsCard) {
          el.pasteDetailsCard.classList.add('hidden');
        }
      });
    }
    // Frequent Locations Context Menu Actions
    if (el.ctxMenuFrequentResetThis) {
      el.ctxMenuFrequentResetThis.onclick = () => {
        const p = state.contextTargetFrequent;
        closeFrequentContextMenu();
        if (p && state.frequentLocations && state.frequentLocations[p]) {
          delete state.frequentLocations[p];
          try {
            localStorage.setItem('tron_frequent_locations', JSON.stringify(state.frequentLocations));
          } catch (e) {}
          renderFrequentLinks();
        }
      };
    }

    if (el.ctxMenuFrequentHideThis) {
      el.ctxMenuFrequentHideThis.onclick = () => {
        const p = state.contextTargetFrequent;
        closeFrequentContextMenu();
        if (p) {
          if (!state.hiddenFrequentLocations) state.hiddenFrequentLocations = new Set();
          state.hiddenFrequentLocations.add(p);
          try {
            localStorage.setItem('tron_hidden_frequent_locations', JSON.stringify(Array.from(state.hiddenFrequentLocations)));
          } catch (e) {}
          renderFrequentLinks();
          renderHiddenFrequentUI();
        }
      };
    }

    if (el.ctxMenuFrequentResetAll) {
      el.ctxMenuFrequentResetAll.onclick = () => {
        closeFrequentContextMenu();
        if (confirm('¿Deseas restablecer todo el historial de carpetas frecuentes?')) {
          state.frequentLocations = {};
          try {
            localStorage.setItem('tron_frequent_locations', JSON.stringify({}));
          } catch (e) {}
          renderFrequentLinks();
        }
      };
    }

    if (el.btnResetFrequentStats) {
      el.btnResetFrequentStats.onclick = () => {
        if (confirm('¿Deseas restablecer todo el historial de visitas de carpetas frecuentes?')) {
          state.frequentLocations = {};
          try {
            localStorage.setItem('tron_frequent_locations', JSON.stringify({}));
          } catch (e) {}
          renderFrequentLinks();
          alert('Historial de frecuentes restablecido.');
        }
      };
    }

    if (el.btnUnarchiveAllFrequent) {
      el.btnUnarchiveAllFrequent.onclick = () => {
        if (!state.hiddenFrequentLocations) state.hiddenFrequentLocations = new Set();
        state.hiddenFrequentLocations.clear();
        try {
          localStorage.setItem('tron_hidden_frequent_locations', JSON.stringify([]));
        } catch (e) {}
        renderFrequentLinks();
        renderHiddenFrequentUI();
      };
    }

    if (el.btnResetTagNames) {
      el.btnResetTagNames.onclick = () => {
        if (confirm('¿Restablecer los nombres de las etiquetas de color a sus valores por defecto?')) {
          customTagNames = {};
          try {
            localStorage.setItem('tron_custom_tag_names', JSON.stringify({}));
          } catch (e) {}
          renderTagSidebar();
          renderFileList();
          updateTagInputsInPreferences();
        }
      };
    }

    // Directory Context Menu Actions
    if (el.ctxDirNewFolder) {
      el.ctxDirNewFolder.onclick = () => {
        closeDirContextMenu();
        openNewFolderModal();
      };
    }
    if (el.ctxDirNewFile) {
      el.ctxDirNewFile.onclick = () => {
        closeDirContextMenu();
        openNewFileModal();
      };
    }
    if (el.ctxDirPaste) {
      el.ctxDirPaste.onclick = () => {
        closeDirContextMenu();
        pasteClipboardItems();
      };
    }
    if (el.ctxDirSelectAll) {
      el.ctxDirSelectAll.onclick = () => {
        closeDirContextMenu();
        state.selectedItems.clear();
        state.filteredItems.forEach(i => state.selectedItems.add(i.path));
        renderFileList();
        updateStatusBar();
      };
    }
    if (el.ctxDirRefresh) {
      el.ctxDirRefresh.onclick = () => {
        closeDirContextMenu();
        reloadBothPanelsIfNeeded();
      };
    }
    if (el.ctxDirTerminal) {
      el.ctxDirTerminal.onclick = () => {
        closeDirContextMenu();
        openCurrentTerminal();
      };
    }
    if (el.ctxDirExportList) {
      el.ctxDirExportList.onclick = () => {
        closeDirContextMenu();
        openExportListModal();
      };
    }
    if (el.ctxDirCalcSizes) {
      el.ctxDirCalcSizes.onclick = () => {
        closeDirContextMenu();
        calculateAllDirSizes();
      };
    }
    if (el.ctxDirProperties) {
      el.ctxDirProperties.onclick = () => {
        closeDirContextMenu();
        showItemProperties();
      };
    }

    // Close context menus on outside click or scroll
    document.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      if (
        (el.fileContextMenu && el.fileContextMenu.contains(e.target)) ||
        (el.ctxMenuPdfToolsSub && el.ctxMenuPdfToolsSub.contains(e.target)) ||
        (el.dirContextMenu && el.dirContextMenu.contains(e.target)) ||
        (el.ctxMenuFrequent && el.ctxMenuFrequent.contains(e.target))
      ) {
        return;
      }
      closeFileContextMenu();
      closeDirContextMenu();
      closeFrequentContextMenu();
      if (el.pasteDetailsCard && !el.pasteDetailsCard.contains(e.target) && !el.pasteProgressContainer.contains(e.target)) {
        el.pasteDetailsCard.classList.add('hidden');
      }
    });

    document.addEventListener('contextmenu', (e) => {
      if (
        (el.fileContextMenu && el.fileContextMenu.contains(e.target)) ||
        (el.ctxMenuPdfToolsSub && el.ctxMenuPdfToolsSub.contains(e.target)) ||
        (el.dirContextMenu && el.dirContextMenu.contains(e.target)) ||
        (el.ctxMenuFrequent && el.ctxMenuFrequent.contains(e.target))
      ) {
        return;
      }

      if (e.target.closest('.file-row') || e.target.closest('#frequentLinks')) {
        return;
      }

      const inDirBg = e.target.closest('#fileList') || 
                      e.target.closest('#fileListB') || 
                      e.target.closest('#panelA') || 
                      e.target.closest('#panelB') || 
                      e.target.closest('#millerContainer');

      if (inDirBg) {
        openDirContextMenu(e);
      } else {
        e.preventDefault();
        closeFileContextMenu(true);
        closeDirContextMenu(true);
        closeFrequentContextMenu();
      }
    });

    if (el.fileList) {
      elPanels.forEach(p => {
        p.fileList.addEventListener('scroll', () => {
          if (isOpeningContextMenu) return;
          closeFileContextMenu();
          closeDirContextMenu();
          closeFrequentContextMenu();
        });
        p.fileList.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          const idx = elPanels.indexOf(p);
          if (isSplitView && activePanel !== idx) {
            switchActivePanel(idx);
          }
        });
      });
    }

    if (el.millerContainer) {
      el.millerContainer.addEventListener('scroll', () => {
        if (isOpeningContextMenu) return;
        closeFileContextMenu();
        closeDirContextMenu();
        closeFrequentContextMenu();
      });
    }

    // Panel Header Clicks (Split View)
    if (el.panelAHeader) {
      el.panelAHeader.addEventListener('click', () => {
        if (isSplitView) switchActivePanel(0);
      });
    }
    if (el.panelBHeader) {
      el.panelBHeader.addEventListener('click', () => {
        if (isSplitView) switchActivePanel(1);
      });
    }

    // Directory Size Calculation
    if (el.btnActionCalcDirSizes) el.btnActionCalcDirSizes.onclick = calculateAllDirSizes;
    if (el.menuCalcDirSizes) el.menuCalcDirSizes.onclick = () => { closeAllMenus(); calculateAllDirSizes(); };

    // Recursive Search Checkbox
    if (el.chkRecursiveSearch) {
      el.chkRecursiveSearch.addEventListener('change', () => {
        if (state.searchQuery) {
          triggerSearch();
        }
      });
    }

    // Background Transfers Event Listeners (Tauri IPC)
    listen('transfer-progress', (event) => {
      handleTransferProgress(event.payload);
    }).catch(err => console.warn('Error listening transfer-progress:', err));

    listen('transfer-finished', (event) => {
      handleTransferFinished(event.payload);
    }).catch(err => console.warn('Error listening transfer-finished:', err));

    // Native OS Menu Action Dispatcher (macOS native menu bar and system accelerators)
    listen('menu-action', (event) => {
      const actionId = event.payload;
      if (!actionId) return;
      switch (actionId) {
        case 'about_tron':
          openAboutModal();
          break;
        case 'open_preferences':
        case 'open_appearance':
          openAppearanceModal();
          break;
        case 'new_file':
          openNewFileModal();
          break;
        case 'new_folder':
          openNewFolderModal();
          break;
        case 'new_tab':
          createTab();
          break;
        case 'close_tab':
          closeTab(panels[activePanel].activeTab);
          break;
        case 'rename_item':
          if (state.selectedItems.size > 1) {
            openBatchRenameModal();
          } else {
            openRenameItemModal();
          }
          break;
        case 'duplicate_item':
          duplicateSelectedItem();
          break;
        case 'compress_zip':
          openCompressModal();
          break;
        case 'export_listing':
          openExportListModal();
          break;
        case 'delete_item':
          deleteCurrentItem();
          break;
        case 'show_properties':
          showItemProperties();
          break;
        case 'add_favorite':
          addCurrentToFavorites();
          break;
        case 'cut_items':
          cutSelectedItems();
          break;
        case 'copy_items':
          copySelectedItems();
          break;
        case 'paste_items':
          pasteClipboardItems();
          break;
        case 'select_all':
          state.selectedItems.clear();
          state.filteredItems.forEach(i => state.selectedItems.add(i.path));
          renderFileList();
          updateStatusBar();
          break;
        case 'copy_path': {
          const item = panels[activePanel].filteredItems[panels[activePanel].selectedIndex];
          if (item) copyToClipboard('"' + item.path + '"');
          break;
        }
        case 'copy_posix': {
          const item = panels[activePanel].filteredItems[panels[activePanel].selectedIndex];
          if (item) copyToClipboard('"' + getPosixPath(item.path) + '"');
          break;
        }
        case 'toggle_quickview':
          if (state.quickViewOpen) {
            closeQuickView();
          } else {
            openQuickView();
          }
          break;
        case 'toggle_split':
          toggleSplitView();
          break;
        case 'toggle_miller':
          toggleMillerView();
          break;
        case 'refresh_dir':
          reloadBothPanelsIfNeeded();
          break;
        case 'toggle_hidden':
          toggleShowHiddenFiles();
          break;
        case 'open_sherlock':
          openSherlockModal();
          break;
        case 'open_jump':
          openJumpToFolder();
          break;
        case 'open_terminal':
          openCurrentTerminal();
          break;
        case 'help_shortcuts':
          openHelpModal();
          break;
        default:
          console.log('Unhandled menu-action:', actionId);
      }
    }).catch(err => console.warn('Error listening menu-action:', err));

    // Native OS file drop (Dragging files from Windows Explorer into the app)
    const handleNativeDrop = (event) => {
      const paths = event.payload?.paths || event.payload; // format varies between Tauri versions
      if (Array.isArray(paths) && paths.length > 0 && state.currentDirectory) {
        // Find if we hovered over a specific directory row based on mouse coordinates?
        // It's safer to just drop them into the current active directory.
        startTransferOperation('copy', paths, state.currentDirectory);
      }
    };
    listen('tauri://drag-drop', handleNativeDrop).catch(() => {});
    listen('tauri://file-drop', handleNativeDrop).catch(() => {});

    // Warn if closing window while transfers are still active
    window.addEventListener('beforeunload', (e) => {
      const activeTransfers = Array.from(state.activeTransfers.values()).filter(t => !t.isDone);
      if (activeTransfers.length > 0) {
        e.preventDefault();
        e.returnValue = 'Hay transferencias de archivos en segundo plano. ¿Seguro que deseas salir?';
        return e.returnValue;
      }
    });

    if (document.getElementById('menuForceQuit')) {
      document.getElementById('menuForceQuit').onclick = () => {
        closeAllMenus();
        invoke('force_exit_app').catch(() => window.close());
      };
    }

    if (el.btnCloseExitModal) el.btnCloseExitModal.onclick = closeConfirmExitModal;
    if (el.btnCancelExit) el.btnCancelExit.onclick = closeConfirmExitModal;
    if (el.btnForceExit) {
      el.btnForceExit.onclick = async () => {
        closeConfirmExitModal();
        invoke('force_exit_app').catch(() => window.close());
      };
    }

    // Hidden files toggle wiring
    if (el.chkShowHidden) {
      el.chkShowHidden.checked = state.showHiddenFiles;
      el.chkShowHidden.addEventListener('change', (e) => {
        setShowHiddenFiles(e.target.checked);
      });
    }

    if (el.menuToggleHidden) {
      el.menuToggleHidden.onclick = () => {
        closeAllMenus();
        toggleShowHiddenFiles();
      };
    }

    // Global dragover & drop prevention to ensure WebView2 allows dropping inside directory rows
    // This prevents the cursor from getting stuck on 'prohibited' when dragging between valid rows
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
    });

    setupSherlockEvents();
    loadAppearanceSettings();
    if (state.isMillerView) {
      el.panelA.classList.add('hidden');
      el.panelB.classList.add('hidden');
      el.millerContainer.classList.remove('hidden');
      if (el.btnToggleMillerView) el.btnToggleMillerView.classList.add('bg-gnome-active/20', 'text-gnome-active');
    }
    loadDirectory(null);
  }

  function setShowHiddenFiles(show) {
    state.showHiddenFiles = show;
    localStorage.setItem('tron_show_hidden', show ? 'true' : 'false');
    if (el.chkShowHidden) el.chkShowHidden.checked = show;
    applyFilter();
    renderFileList();
    updateStatusBar();
  }

  function toggleShowHiddenFiles() {
    setShowHiddenFiles(!state.showHiddenFiles);
  }

  function openConfirmExitModal() {
    if (el.modalConfirmExit) {
      el.modalConfirmExit.classList.remove('hidden');
    }
  }

  function closeConfirmExitModal() {
    if (el.modalConfirmExit) {
      el.modalConfirmExit.classList.add('hidden');
    }
  }

  function renderExternalAppsConfigUI() {
    if (!el.externalAppsListContainer) return;
    const conf = getExternalAppsConfig();
    el.externalAppsListContainer.innerHTML = '';

    const categoryNames = {
      image: '🖼️ Imágenes (Fotos, Paint, GIMP, Photoshop...)',
      text: '📄 Archivos de Texto y Código (Notepad, VS Code, Sublime...)',
      office: '📑 Documentos y Office (Word, Excel, PowerPoint, PDF...)',
      media: '🎬 Audio y Vídeo (VLC, Media Player, mpv...)',
      archive: '🗜️ Archivos Comprimidos (Explorador, 7-Zip, WinRAR...)',
      general: '⚙️ General (Otros tipos de archivo)'
    };

    Object.keys(DEFAULT_APP_SUGGESTIONS).forEach(cat => {
      const catBox = document.createElement('div');
      catBox.className = 'p-3 bg-gnome-sidebar/40 rounded-lg border border-gnome-border space-y-3';

      const catHeader = document.createElement('div');
      catHeader.className = 'font-semibold text-xs text-gnome-text pb-1 border-b border-gnome-border/50';
      catHeader.textContent = categoryNames[cat] || cat;
      catBox.appendChild(catHeader);

      const appsGrid = document.createElement('div');
      appsGrid.className = 'space-y-2.5';

      DEFAULT_APP_SUGGESTIONS[cat].forEach(app => {
        const itemConf = conf[app.id] || { enabled: true, customPath: '' };
        const isChecked = itemConf.enabled !== false;
        const customPath = itemConf.customPath || '';

        const row = document.createElement('div');
        row.className = 'p-2 rounded bg-gnome-surface/60 border border-gnome-border/60 space-y-1.5';
        row.innerHTML = `
          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" data-app-id="${escapeHtml(app.id)}" class="chk-external-app w-4 h-4 rounded bg-gnome-sidebar border-gnome-border text-gnome-active focus:ring-0" ${isChecked ? 'checked' : ''}>
              <span class="font-medium text-gnome-text">${escapeHtml(app.name)}</span>
            </label>
            <span class="text-[10px] text-gnome-textDim font-mono">Por defecto: ${escapeHtml(app.cmd)}</span>
          </div>
          <div>
            <input type="text" data-app-custom-id="${escapeHtml(app.id)}" value="${escapeHtml(customPath)}" placeholder="Ruta personalizada (ej: C:\\Program Files\\...\\app.exe) si no abre por defecto" class="input-external-custom-path w-full bg-gnome-sidebar border border-gnome-border rounded px-2 py-1 text-[11px] text-gnome-text placeholder-gnome-textDim focus:outline-none focus:border-gnome-active" />
          </div>
        `;
        appsGrid.appendChild(row);
      });

      catBox.appendChild(appsGrid);
      el.externalAppsListContainer.appendChild(catBox);
    });
  }

  function readExternalAppsFromUI() {
    if (!el.externalAppsListContainer) return null;
    const conf = {};
    const checkInputs = el.externalAppsListContainer.querySelectorAll('.chk-external-app');
    checkInputs.forEach(chk => {
      const id = chk.dataset.appId;
      if (id) {
        const customInput = el.externalAppsListContainer.querySelector(`.input-external-custom-path[data-app-custom-id="${id}"]`);
        conf[id] = {
          enabled: chk.checked,
          customPath: customInput ? customInput.value.trim() : ''
        };
      }
    });
    return conf;
  }

  // --- Appearance & Preferences Settings ---
  function openAppearanceModal() {
    const theme = localStorage.getItem('tron_theme') || 'adwaita';
    const iconPack = localStorage.getItem('tron_icon_pack') || 'default';
    const density = localStorage.getItem('tron_density') || 'normal';
    const fontSize = localStorage.getItem('tron_fontsize') || 'text-sm';
    const normalWeight = localStorage.getItem('tron_normal_weight') === 'true';
    const uiScale = localStorage.getItem('tron_ui_scale') || '14';
    const customExts = localStorage.getItem('tron_custom_text_exts') || 'sql, str, log, conf, env, bak';
    const textEditor = localStorage.getItem('tron_text_editor') || 'notepad';
    const customEditor = localStorage.getItem('tron_text_editor_custom') || '';
    const terminalApp = localStorage.getItem('tron_terminal_app') || 'default';
    const customTerminal = localStorage.getItem('tron_terminal_custom') || '';
    const monochromeIcons = localStorage.getItem('tron_monochrome_icons') === 'true';
    const recursiveSearch = localStorage.getItem('tron_recursive_search') !== 'false';

    if (el.selectTheme) el.selectTheme.value = theme;
    if (el.selectIconPack) el.selectIconPack.value = iconPack;
    if (el.chkMonochromeIcons) el.chkMonochromeIcons.checked = monochromeIcons;
    if (el.chkShowMenuBar) el.chkShowMenuBar.checked = (localStorage.getItem('tron_show_menu_bar') !== 'false');
    if (el.chkPrefShowHidden) el.chkPrefShowHidden.checked = state.showHiddenFiles;
    if (el.chkPrefRecursiveSearch) el.chkPrefRecursiveSearch.checked = recursiveSearch;
    if (el.chkPrefRecursiveTags) el.chkPrefRecursiveTags.checked = (localStorage.getItem('tron_recursive_tag_search') !== 'false');

    if (el.selectTextEditor) {
      el.selectTextEditor.value = textEditor;
      if (el.customEditorContainer) {
        if (textEditor === 'custom') el.customEditorContainer.classList.remove('hidden');
        else el.customEditorContainer.classList.add('hidden');
      }
    }
    if (el.inputCustomEditor) el.inputCustomEditor.value = customEditor;

    if (el.selectTerminalApp) {
      el.selectTerminalApp.value = terminalApp;
      if (el.customTerminalContainer) {
        if (terminalApp === 'custom') el.customTerminalContainer.classList.remove('hidden');
        else el.customTerminalContainer.classList.add('hidden');
      }
    }
    if (el.inputCustomTerminal) el.inputCustomTerminal.value = customTerminal;

    if (el.selectFontSize) el.selectFontSize.value = fontSize;
    if (el.chkNormalFontWeight) el.chkNormalFontWeight.checked = normalWeight;
    if (el.inputCustomTextExts) el.inputCustomTextExts.value = customExts;
    if (el.rangeUiScale) {
      el.rangeUiScale.value = uiScale;
      updateUiScaleLabel(uiScale);
    }

    const densityRadios = document.querySelectorAll('input[name="density"]');
    densityRadios.forEach(r => {
      r.checked = (r.value === density);
    });

    renderExternalAppsConfigUI();
    renderHiddenFrequentUI();
    renderTagInputsInPreferences();

    el.modalAppearance.classList.remove('hidden');
  }

  function renderHiddenFrequentUI() {
    if (!el.hiddenFrequentContainer || !el.hiddenFrequentList) return;
    const hiddenArr = state.hiddenFrequentLocations ? Array.from(state.hiddenFrequentLocations) : [];
    if (hiddenArr.length === 0) {
      el.hiddenFrequentContainer.classList.add('hidden');
      el.hiddenFrequentList.innerHTML = '';
      return;
    }

    el.hiddenFrequentContainer.classList.remove('hidden');
    el.hiddenFrequentList.innerHTML = '';
    hiddenArr.forEach(p => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 p-1.5 rounded bg-gnome-surface border border-gnome-border text-[11px]';
      row.innerHTML = `
        <span class="truncate text-gnome-textDim font-mono max-w-[400px]" title="${escapeHtml(p)}">${escapeHtml(p)}</span>
        <button type="button" class="btn-unhide-frequent text-[10px] px-2 py-0.5 rounded bg-gnome-active/20 hover:bg-gnome-active hover:text-white text-gnome-active font-medium transition-colors" data-path="${escapeHtml(p)}">
          Mostrar de nuevo
        </button>
      `;
      const btn = row.querySelector('.btn-unhide-frequent');
      if (btn) {
        btn.onclick = () => {
          state.hiddenFrequentLocations.delete(p);
          try {
            localStorage.setItem('tron_hidden_frequent_locations', JSON.stringify(Array.from(state.hiddenFrequentLocations)));
          } catch (e) {}
          renderFrequentLinks();
          renderHiddenFrequentUI();
        };
      }
      el.hiddenFrequentList.appendChild(row);
    });
  }

  function renderTagInputsInPreferences() {
    if (!el.customTagInputsContainer) return;
    el.customTagInputsContainer.innerHTML = '';
    Object.keys(TAG_COLOR_DEFS).forEach(colorKey => {
      const def = TAG_COLOR_DEFS[colorKey];
      const curName = getTagDisplayName(colorKey);
      const field = document.createElement('div');
      field.className = 'flex items-center gap-2 p-2 rounded-lg bg-gnome-sidebar border border-gnome-border';
      field.innerHTML = `
        <span class="w-4 h-4 rounded-full shrink-0 shadow-sm" style="background-color: ${def.hex}"></span>
        <div class="flex-1 min-w-0">
          <label class="block text-[10px] text-gnome-textDim uppercase font-semibold">${def.defaultName}</label>
          <input type="text" class="input-custom-tag-name w-full bg-gnome-surface border border-gnome-border rounded px-2 py-1 text-xs text-gnome-text focus:outline-none focus:border-gnome-active mt-0.5" data-color-key="${colorKey}" value="${escapeHtml(curName)}" placeholder="${def.defaultName}" />
        </div>
      `;
      el.customTagInputsContainer.appendChild(field);
    });
  }

  function updateTagInputsInPreferences() {
    if (!el.customTagInputsContainer) return;
    const inputs = el.customTagInputsContainer.querySelectorAll('.input-custom-tag-name');
    inputs.forEach(inp => {
      const key = inp.dataset.colorKey;
      if (key) {
        inp.value = getTagDisplayName(key);
      }
    });
  }

  function updateUiScaleLabel(val) {
    if (!el.lblUiScaleValue) return;
    const names = {
      '12': '12px (Compacto)',
      '14': '14px (Normal)',
      '16': '16px (Grande)',
      '18': '18px (Muy Grande)',
      '20': '20px (Enorme)'
    };
    el.lblUiScaleValue.textContent = names[val] || `${val}px`;
  }

  function closeAppearanceModal() {
    if (el.modalAppearance) el.modalAppearance.classList.add('hidden');
    el.fileList.focus();
  }

  function saveAppearanceSettings() {
    const theme = el.selectTheme ? el.selectTheme.value : 'adwaita';
    const iconPack = el.selectIconPack ? el.selectIconPack.value : 'default';
    const fontSize = el.selectFontSize ? el.selectFontSize.value : 'text-sm';
    const normalWeight = el.chkNormalFontWeight ? el.chkNormalFontWeight.checked : false;
    const uiScale = el.rangeUiScale ? el.rangeUiScale.value : '14';
    const customExts = el.inputCustomTextExts ? el.inputCustomTextExts.value.trim() : 'sql, str, log, conf, env, bak';
    const textEditor = el.selectTextEditor ? el.selectTextEditor.value : 'notepad';
    const customEditor = el.inputCustomEditor ? el.inputCustomEditor.value.trim() : '';
    const terminalApp = el.selectTerminalApp ? el.selectTerminalApp.value : 'default';
    const customTerminal = el.inputCustomTerminal ? el.inputCustomTerminal.value.trim() : '';
    const monochromeIcons = el.chkMonochromeIcons ? el.chkMonochromeIcons.checked : false;
    const showHidden = el.chkPrefShowHidden ? el.chkPrefShowHidden.checked : state.showHiddenFiles;
    const recursiveSearch = el.chkPrefRecursiveSearch ? el.chkPrefRecursiveSearch.checked : true;
    const recursiveTags = el.chkPrefRecursiveTags ? el.chkPrefRecursiveTags.checked : true;

    let density = 'normal';
    const selectedDensity = document.querySelector('input[name="density"]:checked');
    if (selectedDensity) density = selectedDensity.value;

    const extAppsConf = readExternalAppsFromUI();
    if (extAppsConf) {
      saveExternalAppsConfig(extAppsConf);
    }

    // Save custom tag names
    if (el.customTagInputsContainer) {
      const tagInputs = el.customTagInputsContainer.querySelectorAll('.input-custom-tag-name');
      if (!customTagNames) customTagNames = {};
      tagInputs.forEach(inp => {
        const k = inp.dataset.colorKey;
        const val = inp.value.trim();
        if (val) {
          customTagNames[k] = val;
        } else {
          delete customTagNames[k];
        }
      });
      try {
        localStorage.setItem('tron_custom_tag_names', JSON.stringify(customTagNames));
      } catch (e) {}
      renderTagSidebar();
    }

    localStorage.setItem('tron_theme', theme);
    localStorage.setItem('tron_icon_pack', iconPack);
    localStorage.setItem('tron_density', density);
    localStorage.setItem('tron_fontsize', fontSize);
    localStorage.setItem('tron_normal_weight', normalWeight ? 'true' : 'false');
    localStorage.setItem('tron_ui_scale', uiScale);
    localStorage.setItem('tron_custom_text_exts', customExts);
    localStorage.setItem('tron_text_editor', textEditor);
    localStorage.setItem('tron_text_editor_custom', customEditor);
    localStorage.setItem('tron_terminal_app', terminalApp);
    localStorage.setItem('tron_terminal_custom', customTerminal);
    localStorage.setItem('tron_monochrome_icons', monochromeIcons ? 'true' : 'false');
    localStorage.setItem('tron_show_hidden', showHidden ? 'true' : 'false');
    localStorage.setItem('tron_recursive_search', recursiveSearch ? 'true' : 'false');
    localStorage.setItem('tron_recursive_tag_search', recursiveTags ? 'true' : 'false');
    state.recursiveTagSearch = recursiveTags;
    const showMenuBar = el.chkShowMenuBar ? el.chkShowMenuBar.checked : true;
    localStorage.setItem('tron_show_menu_bar', showMenuBar ? 'true' : 'false');
    state.showMenuBar = showMenuBar;
    applyMenuBarVisibility();

    state.iconPack = iconPack;
    state.textEditor = textEditor;
    state.textEditorCustomPath = customEditor;
    state.terminalApp = terminalApp;
    state.terminalCustomPath = customTerminal;
    state.monochromeIcons = monochromeIcons;
    state.showHiddenFiles = showHidden;
    if (el.chkShowHidden) el.chkShowHidden.checked = showHidden;
    if (el.chkRecursiveSearch) el.chkRecursiveSearch.checked = recursiveSearch;

    state.customTextExts = customExts
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);

    applyAppearanceSettings(theme, density, fontSize, normalWeight, uiScale, monochromeIcons, iconPack);
    closeAppearanceModal();
    applyFilter();
    renderFileList();
  }

  function loadAppearanceSettings() {
    const theme = localStorage.getItem('tron_theme') || 'adwaita';
    const iconPack = localStorage.getItem('tron_icon_pack') || 'default';
    const density = localStorage.getItem('tron_density') || 'normal';
    const fontSize = localStorage.getItem('tron_fontsize') || 'text-sm';
    const normalWeight = localStorage.getItem('tron_normal_weight') === 'true';
    const uiScale = localStorage.getItem('tron_ui_scale') || '14';
    const customExts = localStorage.getItem('tron_custom_text_exts') || 'sql, str, log, conf, env, bak';
    const monochromeIcons = localStorage.getItem('tron_monochrome_icons') === 'true';
    const savedRec = localStorage.getItem('tron_recursive_search');
    if (el.chkRecursiveSearch) {
      el.chkRecursiveSearch.checked = savedRec !== 'false';
    }
    state.recursiveTagSearch = localStorage.getItem('tron_recursive_tag_search') !== 'false';

    state.iconPack = iconPack;
    state.terminalApp = localStorage.getItem('tron_terminal_app') || 'default';
    state.terminalCustomPath = localStorage.getItem('tron_terminal_custom') || '';
    state.monochromeIcons = monochromeIcons;
    state.customTextExts = customExts
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);

    applyAppearanceSettings(theme, density, fontSize, normalWeight, uiScale, monochromeIcons, iconPack);
    applyMenuBarVisibility();
  }

  function applyAppearanceSettings(theme, density, fontSize, normalWeight, uiScale = '14', monochromeIcons = false, iconPack = 'default') {
    document.body.setAttribute('data-theme', theme);
    state.normalFontWeight = normalWeight;
    state.iconPack = iconPack;

    if (monochromeIcons) {
      document.documentElement.setAttribute('data-monochrome-icons', 'true');
    } else {
      document.documentElement.removeAttribute('data-monochrome-icons');
    }

    // Apply UI scale CSS variables globally
    const scalePx = `${uiScale}px`;
    document.documentElement.style.setProperty('--app-ui-scale', scalePx);
    document.documentElement.style.setProperty('--app-ui-scale-num', uiScale);

    // Apply row padding and icon size based on density
    let rowPadding = '6px';
    let iconSize = '28px';
    if (density === 'compact') {
      rowPadding = '2px';
      iconSize = '20px';
    } else if (density === 'spacious') {
      rowPadding = '12px';
      iconSize = '40px';
    }
    document.documentElement.style.setProperty('--app-row-padding', rowPadding);
    document.documentElement.style.setProperty('--app-icon-size', iconSize);

    // Apply font size class to appBody and fileList
    const body = document.getElementById('appBody');
    if (body) {
      body.classList.remove('text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl');
      body.classList.add(fontSize);
    }

    updateToolbarIcons();
    loadSidebar();
    renderFileList();
  }

  function applyMenuBarVisibility() {
    if (!el.menuBar) return;
    if (isMac) {
      el.menuBar.style.display = 'none';
      return;
    }
    const show = state.showMenuBar !== false;
    if (el.menuBarItems) {
      el.menuBarItems.style.display = show ? 'flex' : 'none';
    }
    el.menuBar.style.display = 'flex';
    if (el.chkShowMenuBar) {
      el.chkShowMenuBar.checked = show;
    }
    if (el.menuToggleMenuBar) {
      const span = el.menuToggleMenuBar.querySelector('span');
      if (span) span.textContent = show ? 'Ocultar barra de menús' : 'Mostrar barra de menús';
    }
  }

  function toggleMenuBar() {
    state.showMenuBar = !state.showMenuBar;
    localStorage.setItem('tron_show_menu_bar', state.showMenuBar ? 'true' : 'false');
    applyMenuBarVisibility();
  }

  // --- Directory Size Calculation ---
  async function calculateAllDirSizes() {
    const dirItems = state.filteredItems.filter(i => i.is_directory);
    if (dirItems.length === 0) return;

    if (el.btnActionCalcDirSizes) {
      el.btnActionCalcDirSizes.classList.add('animate-pulse', 'text-gnome-active');
    }

    for (const d of dirItems) {
      try {
        const res = await invoke('get_directory_size', { path: d.path });
        if (res) {
          state.dirSizes.set(d.path, res);
          // Dynamically update the row in DOM without full reload
          const row = el.fileList.querySelector(`[data-path="${CSS.escape(d.path)}"]`);
          if (row) {
            const colSize = row.children[1];
            if (colSize) {
              colSize.textContent = formatSize(res.total_size);
              colSize.title = `${res.file_count} archivos, ${res.dir_count} subcarpetas`;
            }
          }
        }
      } catch (err) {
        console.warn('Error calculando tamaño:', d.path, err);
      }
    }

    if (el.btnActionCalcDirSizes) {
      el.btnActionCalcDirSizes.classList.remove('animate-pulse', 'text-gnome-active');
    }
  }

  // --- Search Handling (Local vs Recursive) ---
  async function triggerSearch() {
    const q = state.searchQuery.toLowerCase().trim();
    const isRecursive = el.chkRecursiveSearch && el.chkRecursiveSearch.checked;

    if (!q) {
      state.isSearchingRecursive = false;
      state.searchItems = null;
      applyFilter();
      state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.selectionAnchor = state.selectedIndex;
      state.selectedItems.clear();
      if (state.selectedIndex >= 0) {
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
      }
      renderFileList();
      updateStatusBar();
      return;
    }

    if (!isRecursive) {
      state.isSearchingRecursive = false;
      state.searchItems = null;
      applyFilter();
      state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.selectionAnchor = state.selectedIndex;
      state.selectedItems.clear();
      if (state.selectedIndex >= 0) {
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
      }
      renderFileList();
      updateStatusBar();
      return;
    }

    // Recursive search via Rust backend
    try {
      state.isSearchingRecursive = true;
      el.statusItemCount.textContent = 'Buscando recursivamente...';
      const results = await invoke('search_directory_recursive', {
        basePath: state.currentDirectory,
        query: q,
        maxResults: 200
      });
      state.searchItems = results || [];
      state.filteredItems = sortItems([...state.searchItems]);
      state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.selectionAnchor = state.selectedIndex;
      state.selectedItems.clear();
      if (state.selectedIndex >= 0) {
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
      }
      renderFileList();
      updateStatusBar();
    } catch (err) {
      console.error('Error en búsqueda recursiva:', err);
      state.isSearchingRecursive = false;
      state.searchItems = null;
      applyFilter();
      renderFileList();
      updateStatusBar();
    }
  }

  // --- Sherlock Advanced Search Controller ---
  
  // --- Jump to Folder (Ctrl + P) Controller ---
  let jumpFolderItems = [];
  let jumpFolderSelectedIndex = 0;
  let jumpFolderDebounceTimer = null;
  let jumpFolderSearchSeq = 0;

  function openJumpToFolder() {
    el.inputJumpToFolder.value = '';
    jumpFolderSelectedIndex = 0;
    el.modalJumpToFolder.classList.remove('hidden');
    el.inputJumpToFolder.focus();
    
    // Initial direct subfolders in current panel
    const currentItems = panels[activePanel].items.filter(i => i.is_directory);
    jumpFolderItems = currentItems.map(i => ({
      name: i.name,
      path: i.path,
      relative_path: i.name
    }));
    
    renderJumpToFolder();
    
    // Also trigger background search to load deeper folders if needed
    triggerJumpFolderSearch('');
  }

  function closeJumpToFolder() {
    if (jumpFolderDebounceTimer) {
      clearTimeout(jumpFolderDebounceTimer);
      jumpFolderDebounceTimer = null;
    }
    el.modalJumpToFolder.classList.add('hidden');
    el.fileList.focus();
  }

  function triggerJumpFolderSearch(q) {
    if (jumpFolderDebounceTimer) {
      clearTimeout(jumpFolderDebounceTimer);
    }
    
    const seq = ++jumpFolderSearchSeq;
    const baseDir = state.currentDirectory;
    if (!baseDir) return;

    jumpFolderDebounceTimer = setTimeout(async () => {
      try {
        const results = await invoke('search_subfolders', {
          basePath: baseDir,
          query: q,
          maxDepth: 5
        });
        if (seq !== jumpFolderSearchSeq) return; // Discard outdated response
        jumpFolderItems = results || [];
        if (jumpFolderSelectedIndex >= jumpFolderItems.length) jumpFolderSelectedIndex = 0;
        renderJumpToFolder();
      } catch (err) {
        console.warn('Error en search_subfolders:', err);
      }
    }, q ? 150 : 0);
  }

  function renderJumpToFolder() {
    const q = el.inputJumpToFolder.value.trim().toLowerCase();
    
    // Local filter if we already have items
    let displayItems = jumpFolderItems;
    if (q) {
      displayItems = jumpFolderItems.filter(i => 
        i.name.toLowerCase().includes(q) || (i.relative_path && i.relative_path.toLowerCase().includes(q))
      );
    }

    if (jumpFolderSelectedIndex >= displayItems.length) jumpFolderSelectedIndex = 0;
    if (displayItems.length === 0) jumpFolderSelectedIndex = -1;

    el.jumpToFolderList.innerHTML = '';
    if (displayItems.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'px-4 py-6 text-center text-xs text-gnome-textDim italic';
      emptyDiv.textContent = q ? `No se encontraron subcarpetas que coincidan con "${q}"` : 'No hay subcarpetas en este directorio';
      el.jumpToFolderList.appendChild(emptyDiv);
      el.inputJumpToFolder._filtered = [];
      return;
    }

    displayItems.forEach((item, idx) => {
      const div = document.createElement('div');
      const isSelected = idx === jumpFolderSelectedIndex;
      div.className = `px-3 py-2 rounded-md text-xs cursor-pointer flex items-center justify-between gap-3 ${isSelected ? 'bg-gnome-active text-white' : 'text-gnome-text hover:bg-gnome-hover'}`;
      
      const relPath = (item.relative_path && item.relative_path !== item.name) ? item.relative_path : '';
      
      div.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="text-sm shrink-0">📁</span>
          <span class="font-medium truncate">${escapeHtml(item.name)}</span>
        </div>
        ${relPath ? `<span class="text-[11px] font-mono shrink-0 truncate max-w-[200px] ${isSelected ? 'text-white/80' : 'text-gnome-textDim'}">${escapeHtml(relPath)}</span>` : ''}
      `;
      
      div.onmousedown = (ev) => {
        ev.preventDefault();
        closeJumpToFolder();
        loadDirectory(item.path, false);
      };
      
      el.jumpToFolderList.appendChild(div);
      
      if (isSelected) {
        div.scrollIntoView({ block: 'nearest' });
      }
    });
    
    // Store filtered to access on enter
    el.inputJumpToFolder._filtered = displayItems;
  }

  function openSherlockModal() {
    if (!el.modalSherlock) return;
    if (el.sherlockCurrentPath) {
      el.sherlockCurrentPath.textContent = state.currentDirectory || '--';
      el.sherlockCurrentPath.title = state.currentDirectory || '';
    }
    el.modalSherlock.classList.remove('hidden');
    if (el.inputSherlockQuery) {
      el.inputSherlockQuery.focus();
      el.inputSherlockQuery.select();
    }
  }

  function closeSherlockModal() {
    if (!el.modalSherlock) return;
    el.modalSherlock.classList.add('hidden');
    el.fileList.focus();
  }

  function resetSherlockFilters() {
    if (el.inputSherlockQuery) el.inputSherlockQuery.value = '';
    if (el.selectSherlockSizeMode) el.selectSherlockSizeMode.value = 'all';
    if (el.sliderSherlockSize) el.sliderSherlockSize.value = 50;
    if (el.inputSherlockSizeNum) el.inputSherlockSizeNum.value = 50;
    if (el.selectSherlockSizeUnit) el.selectSherlockSizeUnit.value = 'MB';
    if (el.sherlockSizeControls) {
      el.sherlockSizeControls.classList.add('opacity-50', 'pointer-events-none');
    }
    if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = '';
    if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = '';
    if (el.chkSherlockRoot) el.chkSherlockRoot.checked = false;
  }

  function formatSherlockDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function handleDateInputClick(input) {
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (_) {}
    }
  }

  async function runSherlock(config) {
    const isRoot = !!config.search_root;
    const filter = {
      base_path: state.currentDirectory,
      search_root: isRoot,
      preset: config.preset || null,
      query: config.query || null,
      size_mode: config.size_mode || null,
      size_bytes: config.size_bytes || null,
      min_date: config.min_date || null,
      max_date: config.max_date || null,
      max_results: config.max_results || 300
    };

    if (el.txtExecuteSherlock) el.txtExecuteSherlock.textContent = 'Buscando...';
    if (el.btnExecuteSherlock) el.btnExecuteSherlock.disabled = true;

    el.fileList.innerHTML = `
      <div class="p-12 text-center text-xs text-gnome-textDim flex flex-col items-center gap-3">
        <span class="text-3xl animate-bounce">🔍</span>
        <span class="font-medium text-gnome-text">Buscando con Sherlock...</span>
        <span class="text-[11px] text-gnome-textDim">Explorando ${isRoot ? 'raíz del sistema' : 'directorio actual'}</span>
      </div>
    `;

    try {
      const res = await invoke('sherlock_search', { filter });
      if (!res) throw new Error('Respuesta no válida del servidor');

      // Cache directory sizes if returned (e.g. for largest_dirs preset)
      if (res.dir_sizes && Array.isArray(res.dir_sizes)) {
        res.dir_sizes.forEach(ds => {
          state.dirSizes.set(ds.path, ds);
        });
      }

      state.isSearchingRecursive = true;
      state.sherlockResults = res.items || [];
      state.filteredItems = sortItems([...state.sherlockResults]);
      state.activeSherlockFilter = { ...config, filter };

      // Update banner UI
      if (el.sherlockBanner) {
        el.sherlockBanner.classList.remove('hidden');
        if (el.sherlockBannerTitle) el.sherlockBannerTitle.textContent = config.title || 'Filtro personalizado';
        if (el.sherlockBannerScope) {
          el.sherlockBannerScope.textContent = `En: ${isRoot ? 'Raíz del sistema' : state.currentDirectory}`;
        }
        if (el.sherlockBannerCount) {
          el.sherlockBannerCount.textContent = `${state.filteredItems.length} resultado${state.filteredItems.length === 1 ? '' : 's'}`;
        }
      }

      if (state.filteredItems.length > 0) {
        setSelectionIndex(0);
      } else {
        state.selectedIndex = -1;
        state.selectedItems.clear();
        renderFileList();
        updateStatusBar();
      }

      closeSherlockModal();
    } catch (err) {
      console.error('Error en búsqueda Sherlock:', err);
      alert('Error en búsqueda Sherlock: ' + err);
      state.isSearchingRecursive = false;
      applyFilter();
      renderFileList();
      updateStatusBar();
    } finally {
      if (el.txtExecuteSherlock) el.txtExecuteSherlock.textContent = 'Buscar con Sherlock';
      if (el.btnExecuteSherlock) el.btnExecuteSherlock.disabled = false;
    }
  }

  function executeSherlockFromInputs() {
    const q = el.inputSherlockQuery ? el.inputSherlockQuery.value.trim() : '';
    const sizeMode = el.selectSherlockSizeMode ? el.selectSherlockSizeMode.value : 'all';
    let sizeBytes = null;

    if (sizeMode !== 'all') {
      const rawNum = parseFloat(el.inputSherlockSizeNum?.value || '0');
      const unit = el.selectSherlockSizeUnit?.value || 'MB';
      let multiplier = 1024 * 1024;
      if (unit === 'KB') multiplier = 1024;
      if (unit === 'GB') multiplier = 1024 * 1024 * 1024;
      sizeBytes = Math.round(rawNum * multiplier);
    }

    let minDate = null;
    let maxDate = null;
    if (el.inputSherlockDateStart && el.inputSherlockDateStart.value) {
      const d = new Date(el.inputSherlockDateStart.value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        minDate = Math.floor(d.getTime() / 1000);
      }
    }
    if (el.inputSherlockDateEnd && el.inputSherlockDateEnd.value) {
      const d = new Date(el.inputSherlockDateEnd.value + 'T23:59:59');
      if (!isNaN(d.getTime())) {
        maxDate = Math.floor(d.getTime() / 1000);
      }
    }

    const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;

    let titleParts = [];
    if (q) titleParts.push(`"${q}"`);
    if (sizeMode === 'gt') titleParts.push(`> ${el.inputSherlockSizeNum.value} ${el.selectSherlockSizeUnit.value}`);
    if (sizeMode === 'lt') titleParts.push(`< ${el.inputSherlockSizeNum.value} ${el.selectSherlockSizeUnit.value}`);
    if (el.inputSherlockDateStart?.value || el.inputSherlockDateEnd?.value) {
      titleParts.push(`Fechas: ${el.inputSherlockDateStart?.value || '...'} a ${el.inputSherlockDateEnd?.value || '...'}`);
    }

    const title = titleParts.length > 0 ? `Filtro: ${titleParts.join(', ')}` : 'Búsqueda personalizada';

    runSherlock({
      search_root: isRoot,
      query: q,
      size_mode: sizeMode,
      size_bytes: sizeBytes,
      min_date: minDate,
      max_date: maxDate,
      title
    });
  }

  function setupSherlockEvents() {
    // Open / Close / Reset
    if (el.btnActionSherlock) el.btnActionSherlock.onclick = openSherlockModal;
    if (el.btnCloseSherlockModal) el.btnCloseSherlockModal.onclick = closeSherlockModal;
    if (el.btnCancelSherlock) el.btnCancelSherlock.onclick = closeSherlockModal;
    if (el.btnResetSherlockFilters) el.btnResetSherlockFilters.onclick = resetSherlockFilters;
    if (el.modalSherlock) {
      el.modalSherlock.addEventListener('click', (e) => {
        if (e.target === el.modalSherlock) closeSherlockModal();
      });
    }

    // Banner wiring
    if (el.btnSherlockBannerEdit) el.btnSherlockBannerEdit.onclick = openSherlockModal;
    if (el.btnSherlockBannerClose) {
      el.btnSherlockBannerClose.onclick = () => {
        if (el.sherlockBanner) el.sherlockBanner.classList.add('hidden');
        state.activeSherlockFilter = null;
        state.sherlockResults = null;
        loadDirectory(state.currentDirectory, false);
      };
    }

    // Presets
    if (el.btnPreset24h) {
      el.btnPreset24h.onclick = () => {
        const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;
        runSherlock({
          preset: 'last_24h',
          search_root: isRoot,
          title: 'Preset: Últimas 24 horas'
        });
      };
    }

    if (el.btnPresetLargeFiles) {
      el.btnPresetLargeFiles.onclick = () => {
        const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;
        runSherlock({
          preset: 'largest_files',
          search_root: isRoot,
          title: 'Preset: 25 Archivos Grandes'
        });
      };
    }

    if (el.btnPresetLargeDirs) {
      el.btnPresetLargeDirs.onclick = () => {
        const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;
        runSherlock({
          preset: 'largest_dirs',
          search_root: isRoot,
          title: 'Preset: 25 Directorios Grandes'
        });
      };
    }

    // Size filter controls
    if (el.selectSherlockSizeMode) {
      el.selectSherlockSizeMode.addEventListener('change', () => {
        const isAll = el.selectSherlockSizeMode.value === 'all';
        if (el.sherlockSizeControls) {
          if (isAll) {
            el.sherlockSizeControls.classList.add('opacity-50', 'pointer-events-none');
          } else {
            el.sherlockSizeControls.classList.remove('opacity-50', 'pointer-events-none');
          }
        }
      });
    }

    if (el.sliderSherlockSize && el.inputSherlockSizeNum) {
      el.sliderSherlockSize.addEventListener('input', () => {
        el.inputSherlockSizeNum.value = el.sliderSherlockSize.value;
      });
      el.inputSherlockSizeNum.addEventListener('input', () => {
        const val = Number(el.inputSherlockSizeNum.value) || 0;
        el.sliderSherlockSize.value = Math.min(Number(el.sliderSherlockSize.max), Math.max(Number(el.sliderSherlockSize.min), val));
      });
    }

    // Date inputs: Calendar on click
    if (el.inputSherlockDateStart) {
      el.inputSherlockDateStart.addEventListener('click', () => handleDateInputClick(el.inputSherlockDateStart));
    }
    if (el.inputSherlockDateEnd) {
      el.inputSherlockDateEnd.addEventListener('click', () => handleDateInputClick(el.inputSherlockDateEnd));
    }

    // Quick date helpers
    if (el.btnDateQuickWeek) {
      el.btnDateQuickWeek.onclick = () => {
        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = formatSherlockDate(weekAgo);
        if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = formatSherlockDate(today);
      };
    }

    if (el.btnDateQuickMonth) {
      el.btnDateQuickMonth.onclick = () => {
        const today = new Date();
        const monthAgo = new Date();
        monthAgo.setDate(today.getDate() - 30);
        if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = formatSherlockDate(monthAgo);
        if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = formatSherlockDate(today);
      };
    }

    if (el.btnDateClear) {
      el.btnDateClear.onclick = () => {
        if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = '';
        if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = '';
      };
    }

    // Execute button
    if (el.btnExecuteSherlock) {
      el.btnExecuteSherlock.onclick = executeSherlockFromInputs;
    }

    // Context Menu: Abrir ubicación del archivo
    if (el.ctxMenuOpenLocation) {
      el.ctxMenuOpenLocation.onclick = async () => {
        closeAllMenus();
        closeFileContextMenu();
        const item = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        if (!item || !item.path) return;
        const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
        const sep = isWindows ? '\\' : '/';
        const norm = isWindows ? item.path.replace(/\//g, '\\') : item.path.replace(/\\/g, '/');
        const lastSlash = norm.lastIndexOf(sep);
        if (lastSlash > 0) {
          const parentDir = norm.substring(0, lastSlash);
          state.activeTagFilter = null;
          await loadDirectory(parentDir);
          const targetName = item.name.toLowerCase();
          const targetPath = item.path.toLowerCase();
          const idx = state.filteredItems.findIndex(i => i.path.toLowerCase() === targetPath || i.name.toLowerCase() === targetName);
          if (idx >= 0) {
            setSelectionIndex(idx);
          }
        }
      };
    }

    // Export Directory Listing bindings
    if (el.btnActionExportList) {
      el.btnActionExportList.onclick = () => {
        openExportListModal();
      };
    }
    if (el.menuExportList) {
      el.menuExportList.onclick = () => {
        closeAllMenus();
        openExportListModal();
      };
    }
    if (el.ctxMenuExportList) {
      el.ctxMenuExportList.onclick = () => {
        const target = (state.contextTargetItem && state.contextTargetItem.is_directory)
          ? state.contextTargetItem.path
          : state.currentDirectory;
        closeAllMenus();
        closeFileContextMenu();
        openExportListModal(target);
      };
    }
    if (el.btnCloseExportListModal) {
      el.btnCloseExportListModal.onclick = closeExportListModal;
    }
    if (el.btnCancelExportList) {
      el.btnCancelExportList.onclick = closeExportListModal;
    }
    if (el.btnConfirmExportList) {
      el.btnConfirmExportList.onclick = executeExportList;
    }
    if (el.rangeExportListDepth) {
      el.rangeExportListDepth.oninput = updateExportListDepthUI;
    }
    if (el.chkExportListFullDepth) {
      el.chkExportListFullDepth.onchange = updateExportListDepthUI;
    }

    // Jump to Folder (Ctrl + P) Input Listeners
    if (el.inputJumpToFolder) {
      el.inputJumpToFolder.oninput = () => {
        jumpFolderSelectedIndex = 0;
        renderJumpToFolder();
        triggerJumpFolderSearch(el.inputJumpToFolder.value.trim());
      };

      el.inputJumpToFolder.onkeydown = (e) => {
        const filtered = el.inputJumpToFolder._filtered || [];
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (filtered.length > 0) {
            jumpFolderSelectedIndex = (jumpFolderSelectedIndex + 1) % filtered.length;
            renderJumpToFolder();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (filtered.length > 0) {
            jumpFolderSelectedIndex = (jumpFolderSelectedIndex - 1 + filtered.length) % filtered.length;
            renderJumpToFolder();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (filtered.length > 0 && jumpFolderSelectedIndex >= 0 && jumpFolderSelectedIndex < filtered.length) {
            const item = filtered[jumpFolderSelectedIndex];
            closeJumpToFolder();
            loadDirectory(item.path, false);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeJumpToFolder();
        }
      };
    }
  }

  // Start app
  window.addEventListener('DOMContentLoaded', init);
})();
